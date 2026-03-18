from fastapi.testclient import TestClient

from main import app


def test_compliance_endpoint_returns_items():
    client = TestClient(app)
    response = client.get("/api/v1/compliance/checklist")
    assert response.status_code == 200
    body = response.json()
    assert "items" in body
    assert len(body["items"]) > 0


def test_metrics_endpoint_exists():
    client = TestClient(app)
    response = client.get("/api/v1/metrics")
    assert response.status_code == 200


def test_governance_endpoints_exist():
    client = TestClient(app)
    versions = client.get("/api/v1/governance/model-versions")
    assert versions.status_code == 200
    assert "prompt_version" in versions.json()

    changelog = client.get("/api/v1/governance/prompt-changelog")
    assert changelog.status_code == 200
    assert "available" in changelog.json()
