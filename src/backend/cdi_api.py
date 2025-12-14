from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
app = FastAPI(
    title="Solventum CDI Nudge API",
    description="Provides real-time Clinical Documentation Integrity (CDI) feedback on draft notes.",
    version="1.0.0"
)
# --- Pydantic Models for Type-Safe API Contracts ---
class Nudge(BaseModel):
    id: str = Field(..., description="A unique identifier for the type of nudge.")
    severity: Literal['info', 'warning', 'critical'] = Field(..., description="The severity level of the documentation gap.")
    prompt: str = Field(..., description="A user-friendly prompt for the physician.")
    fields: List[str] = Field(default_factory=list, description="Suggested fields to update.")
    suggested_text: Optional[str] = Field(None, description="Optional text to insert.")
class AnalyzeRequest(BaseModel):
    encounter_id: Optional[str] = Field(None, description="The ID of the encounter, if available.")
    clinical_note: str = Field(..., description="The draft clinical note text.")
class AnalyzeResponse(BaseModel):
    nudges: List[Nudge]
    summary: str
# --- CDI Rules Engine ---
# A simple, deterministic ruleset for identifying common documentation gaps.
# In a real system, this could be a more complex, configurable engine.
CDI_RULES = [
    {
        "id": "pneumonia_specificity",
        "keyword": "pneumonia",
        "negation_keywords": ["organism", "bacterial", "viral", "lobar", "atypical"],
        "nudge": {
            "id": "pneumonia_specificity",
            "severity": "warning",
            "prompt": "Specify the causative organism for 'pneumonia' if known (e.g., bacterial, viral, or specific organism).",
        }
    },
    {
        "id": "uti_specificity",
        "keyword": "urinary tract infection",
        "negation_keywords": ["cystitis", "pyelonephritis", "urosepsis", "catheter-associated"],
        "nudge": {
            "id": "uti_specificity",
            "severity": "warning",
            "prompt": "Specify the site for 'urinary tract infection' if known (e.g., cystitis, pyelonephritis).",
        }
    },
    {
        "id": "fracture_laterality",
        "keyword": "fracture",
        "negation_keywords": ["left", "right", "bilateral"],
        "nudge": {
            "id": "fracture_laterality",
            "severity": "critical",
            "prompt": "Specify laterality (left, right) for the diagnosed 'fracture'.",
        }
    }
]
def get_cdi_nudges(note: str) -> List[Nudge]:
    """
    Analyzes a clinical note against a set of deterministic CDI rules.
    """
    found_nudges = []
    note_lower = note.lower()
    for rule in CDI_RULES:
        if rule["keyword"] in note_lower:
            # Check if any negation keyword is present, which would satisfy the rule
            is_satisfied = any(neg_keyword in note_lower for neg_keyword in rule["negation_keywords"])
            if not is_satisfied:
                found_nudges.append(Nudge(**rule["nudge"]))
    return found_nudges
# --- API Endpoint ---
@app.post("/analyze_draft_note", response_model=AnalyzeResponse)
async def analyze_draft_note(request: AnalyzeRequest):
    """
    Accepts a draft clinical note and returns a list of CDI "nudges"
    to prompt the physician for greater specificity before saving.
    """
    nudges = get_cdi_nudges(request.clinical_note)
    summary = f"Found {len(nudges)} potential documentation improvement(s)."
    return AnalyzeResponse(nudges=nudges, summary=summary)
# To run this API locally:
# 1. Install fastapi and uvicorn: pip install fastapi "uvicorn[standard]"
# 2. Run the server: uvicorn cdi_api:app --reload