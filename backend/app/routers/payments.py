import os
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..services.pricing import calculate_price
from ..routers.auth import require_admin, require_admin_or_public_token

router = APIRouter(
    prefix="/payments",
    tags=["payments"]
)

def _get_config_value(db: Session, env_key: str, setting_key: str, default: str | None = None):
    value = os.getenv(env_key)
    if value:
        return value
    setting = db.query(models.GlobalSettings).filter(models.GlobalSettings.key == setting_key).first()
    if setting and setting.value:
        return setting.value
    return default


@router.post("/checkout", response_model=schemas.PaymentResponse, dependencies=[Depends(require_admin_or_public_token)])
def create_checkout(payload: schemas.PaymentCreate, db: Session = Depends(get_db)):
    amount = calculate_price(db, payload.duration_minutes, payload.is_vr)
    currency = _get_config_value(db, "PAYMENT_CURRENCY", "payment_currency", "EUR")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")

    payment = models.Payment(
        provider=payload.provider,
        status="pending",
        amount=amount,
        currency=currency,
        station_id=payload.station_id,
        duration_minutes=payload.duration_minutes,
        is_vr=payload.is_vr,
        driver_name=payload.driver_name,
        scenario_id=payload.scenario_id
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    if payload.provider == "stripe_qr":
        try:
            import stripe
        except ImportError as exc:
            raise HTTPException(status_code=500, detail="Stripe SDK not installed") from exc

        stripe.api_key = _get_config_value(db, "STRIPE_SECRET_KEY", "stripe_secret_key")
        if not stripe.api_key:
            raise HTTPException(status_code=500, detail="STRIPE_SECRET_KEY not configured")

        success_url = _get_config_value(db, "STRIPE_SUCCESS_URL", "stripe_success_url") or _get_config_value(
            db, "PUBLIC_KIOSK_URL", "payment_public_kiosk_url", "http://localhost:5959/kiosk"
        )
        cancel_url = _get_config_value(db, "STRIPE_CANCEL_URL", "stripe_cancel_url", success_url)
        description = f"Sesion {payload.duration_minutes} min"

        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": currency.lower(),
                    "unit_amount": int(round(amount * 100)),
                    "product_data": {"name": description}
                },
                "quantity": 1
            }],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"payment_id": payment.id}
        )

        payment.external_id = session.id
        payment.checkout_url = session.url
        db.commit()

        return schemas.PaymentResponse(
            id=payment.id,
            provider=payment.provider,
            status=payment.status,
            amount=payment.amount,
            currency=payment.currency,
            checkout_url=payment.checkout_url
        )

    if payload.provider == "bizum":
        receiver = _get_config_value(db, "BIZUM_RECEIVER", "bizum_receiver")
        if not receiver:
            raise HTTPException(status_code=500, detail="BIZUM_RECEIVER not configured")

        reference = f"BIZUM-{payment.id}"
        payment.external_id = reference
        db.commit()

        instructions = f"Envia un Bizum a {receiver} con el concepto {reference}"
        return schemas.PaymentResponse(
            id=payment.id,
            provider=payment.provider,
            status=payment.status,
            amount=payment.amount,
            currency=payment.currency,
            instructions=instructions,
            reference=reference
        )

    raise HTTPException(status_code=400, detail="Unsupported provider")


@router.get("/{payment_id}", response_model=schemas.PaymentResponse, dependencies=[Depends(require_admin_or_public_token)])
def get_payment(payment_id: int, db: Session = Depends(get_db)):
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    instructions = None
    reference = None
    if payment.provider == "bizum":
        receiver = _get_config_value(db, "BIZUM_RECEIVER", "bizum_receiver")
        if receiver and payment.external_id:
            reference = payment.external_id
            instructions = f"Envia un Bizum a {receiver} con el concepto {reference}"

    return schemas.PaymentResponse(
        id=payment.id,
        provider=payment.provider,
        status=payment.status,
        amount=payment.amount,
        currency=payment.currency,
        checkout_url=payment.checkout_url,
        instructions=instructions,
        reference=reference
    )


@router.post("/{payment_id}/confirm", dependencies=[Depends(require_admin)])
def confirm_payment(payment_id: int, db: Session = Depends(get_db)):
    payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    payment.status = "paid"
    db.commit()
    return {"status": "paid"}


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    try:
        import stripe
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="Stripe SDK not installed") from exc

    secret = _get_config_value(db, "STRIPE_WEBHOOK_SECRET", "stripe_webhook_secret")
    if not secret:
        raise HTTPException(status_code=500, detail="STRIPE_WEBHOOK_SECRET not configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload=payload, sig_header=sig_header, secret=secret)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature") from exc

    event_type = event.get("type")
    data_object = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        payment_id = data_object.get("metadata", {}).get("payment_id")
        if payment_id:
            payment = db.query(models.Payment).filter(models.Payment.id == int(payment_id)).first()
            if payment:
                payment.status = "paid"
                payment.external_id = data_object.get("id", payment.external_id)
                db.commit()

    if event_type == "checkout.session.expired":
        payment_id = data_object.get("metadata", {}).get("payment_id")
        if payment_id:
            payment = db.query(models.Payment).filter(models.Payment.id == int(payment_id)).first()
            if payment:
                payment.status = "expired"
                db.commit()

    return {"status": "ok"}
