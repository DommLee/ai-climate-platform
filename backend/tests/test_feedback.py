from fastapi.testclient import TestClient

from main import app


def test_feedback_create_and_list():
    client = TestClient(app)

    create = client.post(
        "/api/v1/feedback",
        json={
            "location_id": "istanbul",
            "rating": 4,
            "comment": "Looks good",
            "correction": {"note": "keep monitoring"},
        },
    )
    assert create.status_code in (200, 201)

    listing = client.get("/api/v1/feedback", params={"location_id": "istanbul"})
    assert listing.status_code == 200
    assert isinstance(listing.json(), list)
