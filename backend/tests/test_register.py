"""
Test user & merchant registration flow (POST /api/auth/register).
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import one, run

client = TestClient(app)

def test_registration_validation():
    # 1. Short name
    r = client.post("/api/auth/register", json={
        "name": "A",
        "email": "test@reg.bd",
        "password": "password123"
    })
    assert r.status_code == 400
    assert "Full name is required" in r.json()["detail"]

    # 2. Invalid email
    r = client.post("/api/auth/register", json={
        "name": "Valid Name",
        "email": "invalidemail",
        "password": "password123"
    })
    assert r.status_code == 400
    assert "valid email" in r.json()["detail"].lower()

    # 3. Short password
    r = client.post("/api/auth/register", json={
        "name": "Valid Name",
        "email": "valid@reg.bd",
        "password": "123"
    })
    assert r.status_code == 400
    assert "at least 6 characters" in r.json()["detail"]

def test_successful_registration_and_login():
    import secrets
    tag = secrets.token_hex(4)
    email = f"merchant_{tag}@test.bd"
    store_name = f"Store {tag}"

    r = client.post("/api/auth/register", json={
        "name": f"Owner {tag}",
        "store_name": store_name,
        "email": email,
        "phone": f"017{secrets.randbelow(100000000):08d}",
        "password": "secure_password_99"
    })
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["user"]["email"] == email
    assert data["user"]["role"] == "agency_owner"
    assert "gm_session" in r.cookies

    # Duplicate registration should be rejected
    r_dup = client.post("/api/auth/register", json={
        "name": "Another Name",
        "email": email,
        "password": "secure_password_99"
    })
    assert r_dup.status_code == 400
    assert "already exists" in r_dup.json()["detail"]

    # Check merchant and user in DB
    u = one("SELECT * FROM users WHERE email = ?", email)
    assert u is not None
    assert u["role"] == "agency_owner"

    m = one("SELECT * FROM merchants WHERE id = ?", u["merchant_id"])
    assert m is not None
    assert m["name"] == store_name

    # Default cash account created
    ca = one("SELECT * FROM cash_accounts WHERE merchant_id = ? AND is_default = TRUE", m["id"])
    assert ca is not None
    assert ca["kind"] == "cash"
