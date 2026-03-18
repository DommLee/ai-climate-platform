from fastapi.testclient import TestClient

from main import app


def test_health_endpoint() -> None:
    client = TestClient(app, base_url="http://localhost")
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"


def test_health_alerts_endpoint() -> None:
    client = TestClient(app, base_url="http://localhost")
    response = client.get("/api/v1/health/alerts")
    assert response.status_code == 200
    body = response.json()
    assert "alerts" in body
