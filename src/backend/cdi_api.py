from typing import List, Optional, Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .bilingual_lexicon import find_lexicon_entry
from .coding_engine import match_clinical_text
from .drg_grouper import group_encounter

app = FastAPI(
    title="BrainSAIT Bilingual CDI Nudge API",
    description="Provides real-time, bilingual (AR/EN) Clinical Documentation Integrity feedback on draft notes, "
                 "quantified against the APR-DRG Severity of Illness (SOI) grouper.",
    version="2.0.0",
)


# --- Pydantic Models for Type-Safe API Contracts ---
class Nudge(BaseModel):
    id: str = Field(..., description="A unique identifier for this nudge instance.")
    severity: Literal["info", "warning", "critical"] = Field(..., description="The severity level of the documentation gap.")
    prompt: str = Field(..., description="A user-friendly prompt for the physician, in English.")
    prompt_ar: str = Field(..., description="The same prompt in Arabic.")
    fields: List[str] = Field(default_factory=list, description="Suggested fields to update.")
    suggested_text: Optional[str] = Field(None, description="Optional text to insert.")
    soi_impact: Optional[str] = Field(None, description="Explanation of the SOI points at stake, in English.")
    soi_impact_ar: Optional[str] = Field(None, description="The same explanation in Arabic.")


class AnalyzeRequest(BaseModel):
    encounter_id: Optional[str] = Field(None, description="The ID of the encounter, if available.")
    clinical_note: str = Field(..., description="The draft clinical note text (Arabic, English, or mixed).")
    age: Optional[float] = Field(None, description="Patient age, used for Risk of Mortality (ROM) weighting.")
    encounter_type: str = Field("INPATIENT", description="INPATIENT | OUTPATIENT | ED")


class AnalyzeResponse(BaseModel):
    nudges: List[Nudge]
    summary: str
    summary_ar: str
    detected_language: str


# --- Bilingual CDI Rules Engine ---
# Reuses the same bilingual lexicon and APR-DRG grouper that power the
# coding engine, so every nudge is framed in the clinician's own language and
# quantifies the Severity of Illness (SOI) points a documentation gap is
# currently costing the encounter.
def get_cdi_nudges(note: str, encounter_id: str = "draft", age: Optional[float] = None, encounter_type: str = "INPATIENT") -> List[Nudge]:
    matches = match_clinical_text(note)
    if not matches:
        return []
    principal_code = matches[0]["entry"]["code"]
    secondary_codes = [m["entry"]["code"] for m in matches[1:]]
    baseline = group_encounter(principal_code, secondary_codes, age=age, encounter_type=encounter_type)
    note_lower = note.lower()
    nudges: List[Nudge] = []
    for match in matches:
        entry = match["entry"]
        for modifier in entry.get("specificity_modifiers", []):
            resolved_en = any(k.lower() in note_lower for k in modifier["keywords_en"])
            resolved_ar = any(k in note for k in modifier["keywords_ar"])
            if resolved_en or resolved_ar:
                continue  # documentation already closes this gap
            target_soi = min(4, baseline["soi"] + modifier["soi_gain"])
            has_impact = modifier["soi_gain"] > 0 and target_soi > baseline["soi"]
            nudges.append(Nudge(
                id=f"{entry['code']}_{modifier['id']}_{encounter_id}",
                severity=modifier["severity"],
                prompt=modifier["prompt_en"],
                prompt_ar=modifier["prompt_ar"],
                soi_impact=(
                    f"Closing this documentation gap could raise SOI from {baseline['soi']} to {target_soi}."
                    if has_impact else None
                ),
                soi_impact_ar=(
                    f"قد يؤدي إغلاق هذه الفجوة التوثيقية إلى رفع درجة شدة المرض (SOI) من {baseline['soi']} إلى {target_soi}."
                    if has_impact else None
                ),
            ))
    return nudges


# --- API Endpoint ---
@app.post("/analyze_draft_note", response_model=AnalyzeResponse)
async def analyze_draft_note(request: AnalyzeRequest):
    """
    Accepts a draft clinical note (Arabic, English, or code-switched) and
    returns bilingual CDI "nudges" to prompt the physician for greater
    specificity before saving — before the note ever reaches a coder.
    """
    from .coding_engine import detect_language

    nudges = get_cdi_nudges(
        request.clinical_note,
        encounter_id=request.encounter_id or "draft",
        age=request.age,
        encounter_type=request.encounter_type,
    )
    return AnalyzeResponse(
        nudges=nudges,
        summary=f"Found {len(nudges)} potential documentation improvement(s).",
        summary_ar=f"تم العثور على {len(nudges)} فرصة محتملة لتحسين التوثيق.",
        detected_language=detect_language(request.clinical_note),
    )

# To run this API locally:
# 1. Install fastapi and uvicorn: pip install fastapi "uvicorn[standard]"
# 2. Run the server: uvicorn src.backend.cdi_api:app --reload
