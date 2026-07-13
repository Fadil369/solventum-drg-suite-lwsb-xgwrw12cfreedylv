from typing import List, Optional, Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .coding_engine import contains_any, detect_language, elect_principal, match_clinical_text, match_procedures, strip_diacritics
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
    # A plain `str` here would let a mis-cased or misspelled value ("outpatient",
    # "Outpatient") silently fall through the grouper's exact-match methodology
    # selection as if it were INPATIENT. Literal makes FastAPI/Pydantic reject
    # anything else with a clear 422 instead of miscategorizing the encounter.
    encounter_type: Literal["INPATIENT", "OUTPATIENT", "ED"] = Field("INPATIENT", description="INPATIENT | OUTPATIENT | ED")


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
    # Use the same acuity-weighted ranking as the main coding engine (not raw
    # lexicon/insertion order) so the SOI-impact baseline is anchored on the
    # actual principal diagnosis for multi-diagnosis notes.
    ranked = elect_principal(matches)
    principal_code = ranked[0]["entry"]["code"]
    secondary_codes = [m["entry"]["code"] for m in ranked[1:]]
    procedure_codes = [p["entry"]["code"] for p in match_procedures(note)]
    baseline = group_encounter(principal_code, secondary_codes, procedure_codes=procedure_codes, age=age, encounter_type=encounter_type)
    # Normalized (diacritic-stripped) so a modifier keyword still resolves even
    # if the clinician wrote the note with Arabic diacritics (tashkeel) —
    # matches the normalization already applied in match_clinical_text.
    normalized_note = strip_diacritics(note)
    nudges: List[Nudge] = []
    for match in matches:
        entry = match["entry"]
        for modifier in entry.get("specificity_modifiers", []):
            # Whole-word matching (not substring `in`) so a keyword like "art"
            # can't false-positive-resolve a gap by matching inside an
            # unrelated word like "heart".
            resolved_en = contains_any(normalized_note, modifier["keywords_en"])
            resolved_ar = contains_any(normalized_note, modifier["keywords_ar"])
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
