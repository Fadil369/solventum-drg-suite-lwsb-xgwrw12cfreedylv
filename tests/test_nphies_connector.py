import os
import time
import pytest
import requests
import sqlalchemy
from pydantic import BaseModel, Field, ValidationError
from typing import List, Dict, Any
import requests_mock
from src.backend.nphies_connector import NphiesConnector, NphiesAuthError, NphiesAPIError, NphiesValidationError
# --- Configuration for Real/Mock Testing ---
IS_REAL_MODE = os.getenv('NPHIES_TEST_REAL', 'false').lower() == 'true'
REAL_BASE_URL = os.getenv("NPHIES_BASE_URL", "https://sandbox.nphies.sa/api")
REAL_CLIENT_ID = os.getenv("NPHIES_CLIENT_ID")
REAL_CLIENT_SECRET = os.getenv("NPHIES_CLIENT_SECRET")
MOCK_BASE_URL = "https://mock-nphies.sa/api"
MOCK_CLIENT_ID = "test_client_id"
MOCK_CLIENT_SECRET = "test_client_secret"
# --- Pydantic Models for JSON Schema Validation ---
class Patient(BaseModel):
    id: str
class ServiceItem(BaseModel):
    serviceCode: str
class ClaimSchema(BaseModel):
    claimNumber: str
    patient: Patient
    items: List[ServiceItem]
    total: float
# --- Sample FHIR Payloads ---
def sample_pneumonia_fhir_bundle() -> Dict[str, Any]:
    """Returns a sample FHIR Bundle for a pneumonia claim."""
    return {
        "resourceType": "Bundle",
        "type": "transaction",
        "entry": [{
            "fullUrl": "urn:uuid:TEST-CLAIM-PNEUMONIA",
            "resource": {
                "resourceType": "Claim",
                "status": "active",
                "use": "claim",
                "patient": {"reference": "Patient/PATIENT-001"},
                "item": [{
                    "sequence": 1,
                    "productOrService": {
                        "coding": [{
                            "system": "http://hl7.org/fhir/sid/icd-10",
                            "code": "J18.9",
                            "display": "Pneumonia, unspecified"
                        }]
                    }
                }]
            },
            "request": {"method": "POST", "url": "Claim"}
        }]
    }
# --- Pytest Fixtures ---
@pytest.fixture(scope="session")
def real_mode_credentials():
    if IS_REAL_MODE and not (REAL_CLIENT_ID and REAL_CLIENT_SECRET):
        pytest.skip("Real Nphies credentials (NPHIES_CLIENT_ID, NPHIES_CLIENT_SECRET) not set.")
    return {
        "base_url": REAL_BASE_URL if IS_REAL_MODE else MOCK_BASE_URL,
        "client_id": REAL_CLIENT_ID if IS_REAL_MODE else MOCK_CLIENT_ID,
        "client_secret": REAL_CLIENT_SECRET if IS_REAL_MODE else MOCK_CLIENT_SECRET,
    }
@pytest.fixture
def connector(real_mode_credentials) -> NphiesConnector:
    return NphiesConnector(**real_mode_credentials)
@pytest.fixture
def mocked_api(requests_mock):
    if IS_REAL_MODE:
        yield None
    else:
        requests_mock.post(f"{MOCK_BASE_URL}/oauth/token", json={"access_token": "mock_token_12345", "expires_in": 3600})
        yield requests_mock
@pytest.fixture
def mock_db():
    """Provides an in-memory SQLite database for testing DB interactions."""
    engine = sqlalchemy.create_engine('sqlite:///:memory:')
    metadata = sqlalchemy.MetaData()
    claims = sqlalchemy.Table('claims', metadata,
        sqlalchemy.Column('id', sqlalchemy.String, primary_key=True),
        sqlalchemy.Column('status', sqlalchemy.String(50)),
    )
    metadata.create_all(engine)
    yield engine
# --- Test Cases ---
def test_fhir_payload_validation(connector):
    """Test that valid FHIR passes and invalid fails."""
    valid_bundle = sample_pneumonia_fhir_bundle()
    connector._validate_fhir(valid_bundle, connector.FHIR_BUNDLE_SCHEMA)
    invalid_bundle = {"resourceType": "Bundle", "entry": []} # Missing 'type'
    with pytest.raises(NphiesValidationError):
        connector._validate_fhir(invalid_bundle, connector.FHIR_BUNDLE_SCHEMA)
def test_submit_claim_with_valid_fhir(connector, mocked_api):
    """Verify submit_claim sends a valid FHIR bundle."""
    claim_data = {
        "claimNumber": "TEST-001",
        "patient": {"id": "PAT-123"},
        "items": [{"serviceCode": "J18.9"}],
    }
    if not IS_REAL_MODE:
        mocked_api.post(f"{MOCK_BASE_URL}/Claim", json={"status": "success", "id": "NPH-TEST-001"}, status_code=201)
    response = connector.submit_claim(claim_data)
    assert response["status"] == "success"
    if not IS_REAL_MODE:
        assert mocked_api.last_request.method == "POST"
        assert mocked_api.last_request.json()["resourceType"] == "Bundle"
def test_e2e_claim_lifecycle_with_mock_db(connector, mocked_api, mock_db):
    """Simulates a full E2E claim lifecycle with a mock database update."""
    if IS_REAL_MODE:
        pytest.skip("E2E DB test is only for mock mode.")
    claim_id = f"LIFECYCLE-{int(time.time())}"
    claim_data = {"claimNumber": claim_id, "patient": {"id": "PAT-LC-1"}, "items": [{"serviceCode": "LC-S1"}]}
    # 1. Insert initial claim record into mock DB
    with mock_db.connect() as conn:
        conn.execute(sqlalchemy.text(f"INSERT INTO claims (id, status) VALUES ('{claim_id}', 'DRAFT')"))
        conn.commit()
    # 2. Submit Claim
    mocked_api.post(f"{MOCK_BASE_URL}/Claim", json={"status": "success", "id": claim_id}, status_code=201)
    connector.submit_claim(claim_data)
    # 3. Check Status (mocking an approved response)
    mocked_api.get(f"{MOCK_BASE_URL}/Claim/{claim_id}", json={"status": "active", "id": claim_id})
    status_response = connector.check_status(claim_id)
    assert status_response["status"] == "FC_3"
    # 4. Update local DB based on status check
    if status_response["status"] == "FC_3":
        with mock_db.connect() as conn:
            conn.execute(sqlalchemy.text(f"UPDATE claims SET status = 'FC_3' WHERE id = '{claim_id}'"))
            conn.commit()
    # 5. Verify DB update
    with mock_db.connect() as conn:
        result = conn.execute(sqlalchemy.text(f"SELECT status FROM claims WHERE id = '{claim_id}'")).scalar_one()
        assert result == "FC_3"
def test_auth_failure_raises_exception(connector, requests_mock):
    if IS_REAL_MODE:
        pytest.skip("Auth failure test is only for mock mode.")
    requests_mock.post(f"{MOCK_BASE_URL}/oauth/token", status_code=401, text="Unauthorized")
    with pytest.raises(NphiesAuthError):
        connector.submit_claim({})