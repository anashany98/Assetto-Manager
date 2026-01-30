from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import os

def generate_keys():
    # Generate private key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    # Serialize private key
    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )

    # Serialize public key
    public_key = private_key.public_key()
    pem_public = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )

    # Ensure directories exist
    os.makedirs("certs", exist_ok=True)
    os.makedirs("../backend/app/certs", exist_ok=True)

    # Save Private Key (Keep this safe!)
    with open("certs/private_key.pem", "wb") as f:
        f.write(pem_private)
    print("Generated certs/private_key.pem (KEEP SAFE!)")

    # Save Public Key (For Backend)
    with open("../backend/app/certs/public_key.pem", "wb") as f:
        f.write(pem_public)
    print("Generated ../backend/app/certs/public_key.pem (Verify Token)")

if __name__ == "__main__":
    generate_keys()
