
import json
import pytest
from unittest import mock
from agent.telemetry import parse_and_send_telemetry
from datetime import datetime

# Sample JSON data that simulates race_out.json content
SAMPLE_RACE_OUT = {
    "track": "monza", 
    "track_config": "gp", 
    "sessionType": "Q", 
    "players": [{
        "name": "Test Driver",
        "car": "ferrari_488_gt3",
        "bestLap": 120000,
        "laps": [
            {"time": 120500, "sectors": [40000, 40000, 40500], "isValid": True},
            {"time": 119500, "sectors": [39000, 40000, 40500], "isValid": True} 
        ]
    }]
}

@mock.patch("builtins.open", new_callable=mock.mock_open, read_data=json.dumps(SAMPLE_RACE_OUT))
@mock.patch("agent.telemetry.requests.post")
def test_parse_and_send_telemetry_success(mock_post, mock_file):
    """
    Test that valid JSON is parsed correctly and sent to the right endpoint.
    """
    station_id = "STATION_123"
    server_url = "http://test-server.com"
    
    # Mock successful response
    mock_post.return_value.status_code = 200
    
    # Run Function
    result = parse_and_send_telemetry("dummy_path.json", server_url, station_id)
    
    # Assertions
    assert result is True
    
    # Verify what was sent
    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    url = args[0]
    payload = kwargs['json']
    
    assert url == f"{server_url}/telemetry/session"
    assert payload['station_id'] == station_id
    assert payload['track_name'] == "monza"
    assert payload['driver_name'] == "Test Driver"
    assert payload['session_type'] == "qualify" # "Q" -> "qualify" mapping check
    assert len(payload['laps']) == 2
    assert payload['laps'][0]['lap_time'] == 120500

@mock.patch("builtins.open", new_callable=mock.mock_open, read_data="INVALID JSON {")
def test_parse_and_send_telemetry_bad_json(mock_file):
    """
    Test that invalid JSON (file corruption) is handled gracefully without crashing.
    """
    result = parse_and_send_telemetry("dummy_path.json", "http://url", "id")
    assert result is False

@mock.patch("builtins.open", new_callable=mock.mock_open, read_data=json.dumps(SAMPLE_RACE_OUT))
@mock.patch("agent.telemetry.requests.post")
def test_parse_and_send_telemetry_server_error(mock_post, mock_file):
    """
    Test that server errors (e.g., 500) are caught.
    """
    # Mock Server Error
    mock_post.side_effect = Exception("Server Down")
    
    result = parse_and_send_telemetry("dummy_path.json", "http://url", "id")
    assert result is False
