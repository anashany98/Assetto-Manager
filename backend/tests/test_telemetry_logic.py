
from app.routers.telemetry import calculate_consistency_score

def test_calculate_consistency_score_empty():
    assert calculate_consistency_score([]) == 100.0

def test_calculate_consistency_score_single_lap():
    assert calculate_consistency_score([100000]) == 100.0

def test_calculate_consistency_score_perfect():
    # Identical laps = 0 deviation = 100 score
    laps = [90000, 90000, 90000]
    assert calculate_consistency_score(laps) == 100.0

def test_calculate_consistency_score_good():
    # Small deviation
    # 90000 vs 90100 -> delta 100ms. 
    # Logic: 100 - (std_dev / 50). 
    # Variance approx: (50^2 + 50^2)/2 = 2500. Sqrt = 50.
    # Score = 100 - (50/50) = 99.
    laps = [90000, 90100]
    score = calculate_consistency_score(laps)
    assert 98.0 <= score <= 100.0

def test_calculate_consistency_score_bad():
    # High deviation
    # 90000 vs 95000 -> delta 5000ms.
    # Avg 92500. Diff +/- 2500.
    # Variance = 2500^2 = 6,250,000.
    # StdDev = 2500.
    # Score = 100 - (2500 / 50) = 100 - 50 = 50.
    laps = [90000, 95000]
    score = calculate_consistency_score(laps)
    assert 48.0 <= score <= 52.0

def test_calculate_consistency_score_terrible():
    # Massive deviation
    laps = [90000, 150000] # +60s
    score = calculate_consistency_score(laps)
    # Should floor at 0
    assert score == 0.0
