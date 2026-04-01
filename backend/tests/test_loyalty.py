"""
Tests for loyalty endpoints
"""
import pytest
from app import models
from app.database import SessionLocal
from app.routers.loyalty import get_tier, TIER_THRESHOLDS, POINTS_RULES


class TestGetTier:
    def test_bronze_tier(self):
        assert get_tier(0) == "bronze"
        assert get_tier(100) == "bronze"
        assert get_tier(499) == "bronze"

    def test_silver_tier(self):
        assert get_tier(500) == "silver"
        assert get_tier(1000) == "silver"
        assert get_tier(1999) == "silver"

    def test_gold_tier(self):
        assert get_tier(2000) == "gold"
        assert get_tier(3000) == "gold"
        assert get_tier(4999) == "gold"

    def test_platinum_tier(self):
        assert get_tier(5000) == "platinum"
        assert get_tier(10000) == "platinum"

    def test_negative_points(self):
        assert get_tier(-100) == "bronze"


class TestGetDriverPoints:
    def test_unknown_driver_returns_defaults(self, client):
        res = client.get("/loyalty/points/UnknownDriver")
        assert res.status_code == 200
        data = res.json()
        assert data["driver_name"] == "UnknownDriver"
        assert data["points"] == 0
        assert data["tier"] == "bronze"
        assert data["next_tier"] == "silver"
        assert data["points_to_next_tier"] == 500

    def test_known_driver_returns_points(self, client):
        db = SessionLocal()
        try:
            driver = models.Driver(
                name="TestDriver",
                loyalty_points=150,
                total_points_earned=150,
                membership_tier="bronze"
            )
            db.add(driver)
            db.commit()
        finally:
            db.close()

        res = client.get("/loyalty/points/TestDriver")
        assert res.status_code == 200
        data = res.json()
        assert data["driver_name"] == "TestDriver"
        assert data["points"] == 150
        assert data["tier"] == "bronze"

    def test_driver_with_next_tier(self, client):
        db = SessionLocal()
        try:
            driver = models.Driver(
                name="AlmostSilver",
                loyalty_points=400,
                total_points_earned=400,
                membership_tier="bronze"
            )
            db.add(driver)
            db.commit()
        finally:
            db.close()

        res = client.get("/loyalty/points/AlmostSilver")
        assert res.status_code == 200
        data = res.json()
        assert data["next_tier"] == "silver"
        assert data["points_to_next_tier"] == 100


class TestAwardPoints:
    def test_award_points_to_new_driver(self, client):
        res = client.post("/loyalty/earn", json={
            "driver_name": "NewDriver",
            "points": 50,
            "reason": "test",
            "description": "Test points"
        })
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["new_balance"] == 50
        assert data["tier"] == "bronze"

    def test_award_points_to_existing_driver(self, client):
        db = SessionLocal()
        try:
            driver = models.Driver(
                name="ExistingDriver",
                loyalty_points=100,
                total_points_earned=100,
                membership_tier="bronze"
            )
            db.add(driver)
            db.commit()
        finally:
            db.close()

        res = client.post("/loyalty/earn", json={
            "driver_name": "ExistingDriver",
            "points": 200,
            "reason": "race_win",
            "description": "Won a race"
        })
        assert res.status_code == 200
        data = res.json()
        assert data["new_balance"] == 300
        assert data["tier"] == "bronze"

    def test_award_points_triggers_tier_upgrade(self, client):
        db = SessionLocal()
        try:
            driver = models.Driver(
                name="UpgradingDriver",
                loyalty_points=450,
                total_points_earned=450,
                membership_tier="bronze"
            )
            db.add(driver)
            db.commit()
        finally:
            db.close()

        res = client.post("/loyalty/earn", json={
            "driver_name": "UpgradingDriver",
            "points": 100,
            "reason": "tier_test"
        })
        assert res.status_code == 200
        data = res.json()
        assert data["new_balance"] == 550
        assert data["tier"] == "silver"

    def test_award_points_rejects_negative(self, client):
        res = client.post("/loyalty/earn", json={
            "driver_name": "TestDriver",
            "points": -10,
            "reason": "test"
        })
        assert res.status_code == 422

    def test_award_points_rejects_empty_name(self, client):
        res = client.post("/loyalty/earn", json={
            "driver_name": "",
            "points": 10,
            "reason": "test"
        })
        assert res.status_code == 422

    def test_award_points_rejects_zero_points(self, client):
        res = client.post("/loyalty/earn", json={
            "driver_name": "TestDriver",
            "points": 0,
            "reason": "test"
        })
        assert res.status_code == 422


class TestRewards:
    def test_get_rewards_empty(self, client):
        res = client.get("/loyalty/rewards")
        assert res.status_code == 200
        assert res.json() == []

    def test_create_reward(self, client):
        res = client.post("/loyalty/rewards", json={
            "name": "Free Session",
            "description": "One free 30min session",
            "points_cost": 200,
            "stock": 10
        })
        assert res.status_code == 200
        data = res.json()
        assert data["name"] == "Free Session"

    def test_create_reward_with_unlimited_stock(self, client):
        res = client.post("/loyalty/rewards", json={
            "name": "VIP Access",
            "points_cost": 1000,
            "stock": -1
        })
        assert res.status_code == 200

    def test_create_reward_rejects_negative_cost(self, client):
        res = client.post("/loyalty/rewards", json={
            "name": "Bad Reward",
            "points_cost": -50,
            "stock": 10
        })
        assert res.status_code == 422

    def test_get_rewards_after_creation(self, client):
        db = SessionLocal()
        try:
            reward = models.Reward(
                name="Test Reward",
                points_cost=100,
                stock=5,
                is_active=True
            )
            db.add(reward)
            db.commit()
        finally:
            db.close()

        res = client.get("/loyalty/rewards")
        assert res.status_code == 200
        data = res.json()
        assert len(data) >= 1
        assert any(r["name"] == "Test Reward" for r in data)


class TestRedeemReward:
    def test_redeem_reward_success(self, client):
        db = SessionLocal()
        try:
            driver = models.Driver(
                name="Redeemer",
                loyalty_points=500,
                total_points_earned=500,
                membership_tier="silver"
            )
            db.add(driver)
            db.commit()

            reward = models.Reward(
                name="Free Drink",
                points_cost=100,
                stock=10,
                is_active=True
            )
            db.add(reward)
            db.commit()
            db.refresh(reward)
            reward_id = reward.id
        finally:
            db.close()

        res = client.post("/loyalty/redeem", json={
            "driver_name": "Redeemer",
            "reward_id": reward_id
        })
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["points_spent"] == 100
        assert data["remaining_points"] == 400

    def test_redeem_insufficient_points(self, client):
        db = SessionLocal()
        try:
            driver = models.Driver(
                name="PoorDriver",
                loyalty_points=50,
                total_points_earned=50
            )
            db.add(driver)
            db.commit()

            reward = models.Reward(
                name="Expensive Reward",
                points_cost=200,
                stock=10,
                is_active=True
            )
            db.add(reward)
            db.commit()
            db.refresh(reward)
            reward_id = reward.id
        finally:
            db.close()

        res = client.post("/loyalty/redeem", json={
            "driver_name": "PoorDriver",
            "reward_id": reward_id
        })
        assert res.status_code == 400
        assert "Insufficient points" in res.json()["detail"]

    def test_redeem_out_of_stock(self, client):
        db = SessionLocal()
        try:
            driver = models.Driver(
                name="RichDriver",
                loyalty_points=1000,
                total_points_earned=1000
            )
            db.add(driver)
            db.commit()

            reward = models.Reward(
                name="Sold Out",
                points_cost=50,
                stock=0,
                is_active=True
            )
            db.add(reward)
            db.commit()
            db.refresh(reward)
            reward_id = reward.id
        finally:
            db.close()

        res = client.post("/loyalty/redeem", json={
            "driver_name": "RichDriver",
            "reward_id": reward_id
        })
        assert res.status_code == 400
        assert "out of stock" in res.json()["detail"]

    def test_redeem_inactive_reward(self, client):
        db = SessionLocal()
        try:
            driver = models.Driver(
                name="ActiveDriver",
                loyalty_points=1000,
                total_points_earned=1000
            )
            db.add(driver)
            db.commit()

            reward = models.Reward(
                name="Inactive Reward",
                points_cost=50,
                stock=10,
                is_active=False
            )
            db.add(reward)
            db.commit()
            db.refresh(reward)
            reward_id = reward.id
        finally:
            db.close()

        res = client.post("/loyalty/redeem", json={
            "driver_name": "ActiveDriver",
            "reward_id": reward_id
        })
        assert res.status_code == 400
        assert "no longer available" in res.json()["detail"]

    def test_redeem_unknown_driver(self, client):
        res = client.post("/loyalty/redeem", json={
            "driver_name": "NonExistent",
            "reward_id": 999
        })
        assert res.status_code == 404

    def test_redeem_unknown_reward(self, client):
        db = SessionLocal()
        try:
            driver = models.Driver(name="ValidDriver", loyalty_points=100, total_points_earned=100)
            db.add(driver)
            db.commit()
        finally:
            db.close()

        res = client.post("/loyalty/redeem", json={
            "driver_name": "ValidDriver",
            "reward_id": 99999
        })
        assert res.status_code == 404


class TestPointsHistory:
    def test_empty_history_for_new_driver(self, client):
        import uuid
        unique_name = f"EmptyHistoryDriver_{uuid.uuid4().hex[:8]}"
        res = client.get(f"/loyalty/history/{unique_name}")
        assert res.status_code == 200
        assert res.json() == []

    def test_history_after_earning_points(self, client):
        import uuid
        unique_name = f"HistoryDriver_{uuid.uuid4().hex[:8]}"
        client.post("/loyalty/earn", json={
            "driver_name": unique_name,
            "points": 100,
            "reason": "test_earning",
            "description": "Test transaction"
        })

        res = client.get(f"/loyalty/history/{unique_name}")
        assert res.status_code == 200
        data = res.json()
        assert len(data) >= 1
        assert data[0]["points"] == 100
        assert data[0]["reason"] == "test_earning"

    def test_history_after_redemption(self, client):
        db = SessionLocal()
        try:
            driver = models.Driver(
                name="HistoryRedeemer",
                loyalty_points=500,
                total_points_earned=500
            )
            db.add(driver)
            db.commit()

            reward = models.Reward(
                name="History Reward",
                points_cost=100,
                stock=10,
                is_active=True
            )
            db.add(reward)
            db.commit()
            db.refresh(reward)
            reward_id = reward.id
        finally:
            db.close()

        client.post("/loyalty/redeem", json={
            "driver_name": "HistoryRedeemer",
            "reward_id": reward_id
        })

        res = client.get("/loyalty/history/HistoryRedeemer")
        assert res.status_code == 200
        data = res.json()
        negative_transactions = [t for t in data if t["points"] < 0]
        assert len(negative_transactions) >= 1
        assert negative_transactions[0]["reason"] == "redemption"


class TestLeaderboard:
    def test_empty_leaderboard(self, client):
        db = SessionLocal()
        try:
            db.query(models.Driver).filter(models.Driver.name.like("LeaderboardTest_%")).delete()
            db.commit()
        finally:
            db.close()
        res = client.get("/loyalty/leaderboard")
        assert res.status_code == 200
        data = res.json()
        leaderboard_drivers = [d["driver_name"] for d in data]
        assert not any(name.startswith("LeaderboardTest_") for name in leaderboard_drivers)

    def test_leaderboard_with_drivers(self, client):
        import uuid
        suffix = uuid.uuid4().hex[:8]
        db = SessionLocal()
        try:
            for i, pts in enumerate([1000, 500, 2000, 300]):
                driver = models.Driver(
                    name=f"LeaderboardTest_{i}_{suffix}",
                    loyalty_points=pts,
                    total_points_earned=pts,
                    membership_tier=get_tier(pts)
                )
                db.add(driver)
            db.commit()
        finally:
            db.close()

        res = client.get("/loyalty/leaderboard")
        assert res.status_code == 200
        data = res.json()
        test_drivers = [d for d in data if d["driver_name"].startswith(f"LeaderboardTest_")]
        assert len(test_drivers) >= 4
        assert test_drivers[0]["rank"] == 1
        assert test_drivers[0]["total_points"] == 2000
        assert test_drivers[1]["total_points"] == 1000

    def test_leaderboard_respects_limit(self, client):
        res = client.get("/loyalty/leaderboard?limit=2")
        assert res.status_code == 200
        data = res.json()
        assert len(data) <= 2


class TestPointsRules:
    def test_get_rules(self, client):
        res = client.get("/loyalty/rules")
        assert res.status_code == 200
        data = res.json()
        assert "lap_completed" in data
        assert "podium_1" in data
        assert data["lap_completed"] == 10

    def test_get_tiers(self, client):
        res = client.get("/loyalty/tiers")
        assert res.status_code == 200
        data = res.json()
        assert data["bronze"] == 0
        assert data["silver"] == 500
        assert data["gold"] == 2000
        assert data["platinum"] == 5000
