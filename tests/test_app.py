import os
from unittest.mock import Mock, patch

import pytest
import requests

from app import app, client_requests, rate_lock, MODEL


@pytest.fixture
def client():
    app.config["TESTING"] = True
    os.environ["GROQ_API_KEY"] = "test-key-not-real"
    with rate_lock:
        client_requests.clear()

    with app.test_client() as test_client:
        yield test_client

    with rate_lock:
        client_requests.clear()


def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json["app"] == "Axiom AI"
    assert response.json["model"] == MODEL
    assert response.json["status"] == "ok"


def test_security_headers(client):
    response = client.get("/")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["Content-Security-Policy"] == "frame-ancestors 'none'"


def test_missing_message_returns_400(client):
    response = client.post("/api/chat", json={"history": []})
    assert response.status_code == 400
    assert "error" in response.json


def test_invalid_history_returns_400(client):
    response = client.post(
        "/api/chat",
        json={"message": "Hello", "history": "invalid"},
    )
    assert response.status_code == 400
    assert "error" in response.json


def test_wrong_content_type_returns_400(client):
    response = client.post(
        "/api/chat",
        data="not-json",
        content_type="text/plain",
    )
    assert response.status_code == 400
    assert "error" in response.json


def test_malformed_json_returns_400(client):
    response = client.post(
        "/api/chat",
        data='{"message":',
        content_type="application/json",
    )
    assert response.status_code == 400
    assert "error" in response.json


def test_oversized_request_returns_413(client):
    response = client.post(
        "/api/chat",
        data=b"A" * 70000,
        content_type="application/json",
    )
    assert response.status_code == 413
    assert response.json["error"] == "The request is too large."


def test_unknown_endpoint_returns_json_404(client):
    response = client.get("/api/not-a-real-route")
    assert response.status_code == 404
    assert response.is_json
    assert "error" in response.json


def test_unsupported_method_returns_json_405(client):
    response = client.put("/api/chat")
    assert response.status_code == 405
    assert response.is_json
    assert "error" in response.json


def test_rate_limit_blocks_rapid_requests(client):
    first = client.post(
        "/api/chat",
        json={"message": "Who developed Axiom AI?", "history": []},
    )
    second = client.post(
        "/api/chat",
        json={"message": "Who developed Axiom AI?", "history": []},
    )
    assert first.status_code == 200
    assert second.status_code == 429
    assert "error" in second.json


def test_model_timeout_returns_504(client):
    with patch("app.requests.post", side_effect=requests.Timeout):
        response = client.post(
            "/api/chat",
            json={"message": "Explain phishing", "history": []},
        )
    assert response.status_code == 504
    assert "error" in response.json


def test_model_connection_error_returns_502(client):
    with patch("app.requests.post", side_effect=requests.ConnectionError):
        response = client.post(
            "/api/chat",
            json={"message": "Explain phishing", "history": []},
        )
    assert response.status_code == 502
    assert "error" in response.json


def test_successful_model_response(client):
    mocked_response = Mock()
    mocked_response.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": "Phishing is a deceptive attempt to steal information."
                }
            }
        ]
    }
    with patch("app.requests.post", return_value=mocked_response):
        response = client.post(
            "/api/chat",
            json={"message": "Explain phishing", "history": []},
        )

    assert response.status_code == 200
    assert response.json["model"] == MODEL
    assert response.json["reply"] == (
        "Phishing is a deceptive attempt to steal information."
    )


def test_identity_response_does_not_require_model(client):
    with patch("app.requests.post") as mocked_post:
        response = client.post(
            "/api/chat",
            json={"message": "Who developed Axiom AI?", "history": []},
        )

    assert response.status_code == 200
    assert "Perry Susuali" in response.json["reply"]
    mocked_post.assert_not_called()
