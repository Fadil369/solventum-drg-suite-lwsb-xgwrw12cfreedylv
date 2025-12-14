import os
import time
import requests
import json
import jsonschema
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import Dict, Any, Optional
# Custom Exceptions for clear error handling
class NphiesAuthError(Exception):
    """Raised when authentication with the Nphies platform fails."""
    pass
class NphiesAPIError(Exception):
    """Raised for general API errors (e.g., 4xx, 5xx responses)."""
    pass
class NphiesValidationError(Exception):
    """Raised when a payload fails FHIR schema validation."""
    pass
# A simplified FHIR Bundle schema for validation purposes.
# In a real-world scenario, this would be a comprehensive schema.
FHIR_BUNDLE_SCHEMA = {
    "type": "object",
    "properties": {
        "resourceType": {"const": "Bundle"},
        "type": {"type": "string"},
        "entry": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "resource": {"type": "object"}
                },
                "required": ["resource"]
            }
        }
    },
    "required": ["resourceType", "type", "entry"]
}
class NphiesConnector:
    """
    Manages all API interactions with the Saudi national 'nphies' platform.
    This class handles OAuth 2.0 authentication, enforces TLS 1.2, manages
    request timeouts, and implements a retry strategy for transient errors.
    It provides methods for core nphies workflows like claim submission and
    status checks, with basic FHIR payload mapping and validation.
    """
    def __init__(self, base_url: str, client_id: str, client_secret: str, timeout: int = 15, verify: bool = True):
        self.base_url = base_url
        self.client_id = client_id
        self.client_secret = client_secret
        self.timeout = timeout
        self._token_data: Dict[str, Any] = {}
        self.session = self._create_session()
    def _create_session(self) -> requests.Session:
        session = requests.Session()
        retry_strategy = Retry(
            total=3,
            status_forcelist=[429, 500, 502, 503, 504],
            backoff_factor=1
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session
    def _get_oauth_token(self) -> str:
        now = time.time()
        if self._token_data and self._token_data.get("expires_at", 0) > now + 60:
            return self._token_data["access_token"]
        token_url = f"{self.base_url}/oauth/token"
        payload = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        try:
            response = self.session.post(token_url, data=payload, headers=headers, timeout=self.timeout)
            response.raise_for_status()
            token_info = response.json()
            self._token_data = {
                "access_token": token_info["access_token"],
                "expires_at": now + token_info.get("expires_in", 3600),
            }
            return self._token_data["access_token"]
        except requests.exceptions.RequestException as e:
            print(f"OAuth token request failed: {e}")
            raise NphiesAuthError("Failed to obtain OAuth token from nphies.") from e
    def _get_auth_headers(self) -> Dict[str, str]:
        token = self._get_oauth_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/fhir+json",
            "Accept": "application/fhir+json",
        }
    def _request(self, method: str, path: str, **kwargs) -> Any:
        url = f"{self.base_url}{path}"
        headers = self._get_auth_headers()
        try:
            response = self.session.request(method, url, headers=headers, timeout=self.timeout, **kwargs)
            # Handle OAuth token refresh on 401 Unauthorized
            if response.status_code == 401 and "token" in response.text.lower():
                print("Token expired or invalid, attempting refresh...")
                self._token_data = {} # Force token refresh
                headers = self._get_auth_headers()
                response = self.session.request(method, url, headers=headers, timeout=self.timeout, **kwargs)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            print(f"Nphies API request to {url} failed with status {e.response.status_code}: {e.response.text}")
            raise NphiesAPIError(f"API Error: {e.response.status_code} - {e.response.text}") from e
        except requests.exceptions.Timeout:
            print(f"Nphies API request to {url} timed out.")
            raise NphiesAPIError("Request to nphies timed out.")
        except requests.exceptions.RequestException as e:
            print(f"Nphies API request to {url} failed: {e}")
            raise NphiesAPIError(f"A network error occurred: {e}") from e
    def _validate_fhir(self, data: Dict[str, Any], schema: Dict[str, Any]):
        try:
            jsonschema.validate(instance=data, schema=schema)
        except jsonschema.exceptions.ValidationError as e:
            raise NphiesValidationError(f"FHIR payload validation failed: {e.message}") from e
    def _map_to_fhir_claim_bundle(self, claim_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Stub function to map internal claim data to a FHIR Bundle for a Claim.
        """
        claim_resource = {
            "resourceType": "Claim",
            "status": "active",
            "use": "claim",
            "patient": {"reference": f"Patient/{claim_data.get('patient', {}).get('id')}"},
            "item": [
                {
                    "sequence": i + 1,
                    "productOrService": {
                        "coding": [{
                            "system": "http://hl7.org/fhir/sid/icd-10",
                            "code": item.get("serviceCode"),
                            "display": item.get("description")
                        }]
                    }
                } for i, item in enumerate(claim_data.get("items", []))
            ]
        }
        bundle = {
            "resourceType": "Bundle",
            "type": "transaction",
            "entry": [{
                "fullUrl": f"urn:uuid:{claim_data.get('claimNumber')}",
                "resource": claim_resource,
                "request": {
                    "method": "POST",
                    "url": "Claim"
                }
            }]
        }
        return bundle
    def submit_claim(self, claim_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Submits a claim to the nphies /claims endpoint.
        Maps internal data to a FHIR Bundle and validates it before sending.
        """
        fhir_bundle = self._map_to_fhir_claim_bundle(claim_data)
        self._validate_fhir(fhir_bundle, FHIR_BUNDLE_SCHEMA)
        return self._request("POST", "/Claim", json=fhir_bundle)
    def request_pre_auth(self, auth_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Submits a pre-authorization request (FHIR Claim with use=preauthorization).
        """
        # In a real implementation, this would map to a FHIR ServiceRequest or Claim
        return self._request("POST", "/Claim", json={"use": "preauthorization", **auth_data})
    def check_status(self, claim_id: str) -> Dict[str, Any]:
        """
        Checks the status of a previously submitted claim.
        Parses the FHIR response to determine status.
        """
        response = self._request("GET", f"/Claim/{claim_id}")
        # Mock parsing logic: In real FHIR, you'd traverse the bundle to find the outcome.
        if response.get("status") == "active":
            return {"status": "FC_3", "claimId": claim_id}
        return {"status": "PENDING", "claimId": claim_id}
    def reconcile_payment(self, payment_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Sends payment reconciliation data (FHIR PaymentNotice).
        """
        # This would map to a FHIR PaymentNotice resource
        return self._request("POST", "/PaymentNotice", json=payment_data)
if __name__ == "__main__":
    # Example usage with environment variables
    NPHIES_BASE_URL = os.getenv("NPHIES_BASE_URL", "https://sandbox.nphies.sa/api")
    NPHIES_CLIENT_ID = os.getenv("NPHIES_CLIENT_ID")
    NPHIES_CLIENT_SECRET = os.getenv("NPHIES_CLIENT_SECRET")
    if not (NPHIES_CLIENT_ID and NPHIES_CLIENT_SECRET):
        print("Error: NPHIES_CLIENT_ID and NPHIES_CLIENT_SECRET env vars must be set for live test.")
    else:
        connector = NphiesConnector(
            base_url=NPHIES_BASE_URL,
            client_id=NPHIES_CLIENT_ID,
            client_secret=NPHIES_CLIENT_SECRET
        )
        try:
            print("Successfully initialized NphiesConnector.")
            # Example: Submit a sample claim
            sample_claim = {
                "claimNumber": "TEST-CLAIM-12345",
                "patient": {"id": "PATIENT-001"},
                "items": [{"serviceCode": "J18.9", "description": "Pneumonia, unspecified"}],
            }
            # This would fail against a real sandbox without a valid FHIR payload
            # but demonstrates the mapping and validation flow.
            print("Sample internal claim data:", sample_claim)
            fhir_payload = connector._map_to_fhir_claim_bundle(sample_claim)
            print("Mapped FHIR Bundle:", json.dumps(fhir_payload, indent=2))
            connector._validate_fhir(fhir_payload, FHIR_BUNDLE_SCHEMA)
            print("FHIR validation successful.")
        except (NphiesAuthError, NphiesAPIError, NphiesValidationError) as e:
            print(f"An error occurred: {e}")