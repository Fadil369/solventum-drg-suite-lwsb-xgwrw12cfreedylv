"""
BrainSAIT Bilingual Code-Switching Coding Engine (Python core service)
-----------------------------------------------------------------------------
Python port of `shared/coding-engine.ts`, used by the AWS FastAPI backend
persona described in the PRD. Tokenizes and matches mixed Arabic/English
clinical text against the bilingual lexicon, applies negation/uncertainty
detection in either language, dedupes to the most specific code, elects a
principal diagnosis, and hands off to the APR-DRG grouper for a fully
explainable (non-random) coding decision.
"""
import re
from functools import lru_cache
from typing import Any, Dict, List, Optional, TypedDict

from .bilingual_lexicon import (
    BILINGUAL_LEXICON,
    NEGATION_TERMS_AR,
    NEGATION_TERMS_EN,
    UNCERTAINTY_TERMS_AR,
    UNCERTAINTY_TERMS_EN,
)
from .procedure_lexicon import PROCEDURE_LEXICON
from .drg_grouper import DrgResult, group_encounter

ENGINE_VERSION = "2.0.0-bilingual"

ARABIC_DIACRITICS_RE = re.compile(r"[ً-ْٰـ]")
ARABIC_CHAR_RE = re.compile(r"[؀-ۿ]")
LATIN_CHAR_RE = re.compile(r"[A-Za-z]")


class SuggestedCode(TypedDict, total=False):
    code: str
    desc: str
    desc_ar: str
    term_en: Optional[str]
    term_ar: Optional[str]
    matched_text: str
    confidence: float
    is_principal: bool
    soi_weight: int
    rom_weight: int


class SuggestedProcedure(TypedDict):
    code: str
    desc: str
    desc_ar: str
    matched_text: str


class CodingResult(TypedDict):
    engine_version: str
    source_text: str
    suggested_codes: List[SuggestedCode]
    suggested_procedures: List[SuggestedProcedure]
    final_codes: List[SuggestedCode]
    status: str
    confidence_score: float
    phase: str
    principal_code: str
    secondary_codes: List[str]
    drg: DrgResult
    detected_language: str


def strip_diacritics(text: str) -> str:
    return ARABIC_DIACRITICS_RE.sub("", text)


def detect_language(text: str) -> str:
    arabic_chars = len(ARABIC_CHAR_RE.findall(text))
    latin_chars = len(LATIN_CHAR_RE.findall(text))
    if arabic_chars > 0 and latin_chars > 0:
        return "mixed"
    if arabic_chars > 0:
        return "ar"
    return "en"


@lru_cache(maxsize=None)
def _word_boundary_pattern(term: str) -> "re.Pattern[str]":
    # Cached so each term's regex is compiled once and reused across every
    # note analyzed, rather than recompiled on every call (this runs once per
    # lexicon synonym/negation/uncertainty/modifier-keyword term per note).
    return re.compile(r"\b" + re.escape(term) + r"\b", re.IGNORECASE)


def contains_any(haystack: str, needles: List[str]) -> bool:
    # Whole-word containment check. A plain substring `in` check would
    # false-positive on e.g. "no" inside "known" or "normal" (or "art" inside
    # "heart") — a real bug this project hit while testing negation detection
    # ("Patient with known cirrhosis" was incorrectly treated as negated
    # because "known" contains "no"). Exported so cdi_api.py can reuse the
    # exact same matching semantics.
    return any(_word_boundary_pattern(n).search(haystack) for n in needles)


def match_clinical_text(raw_text: str) -> List[Dict[str, Any]]:
    """Scans normalized clinical text against every lexicon entry in both languages."""
    normalized = strip_diacritics(raw_text)
    matches: Dict[str, Dict[str, Any]] = {}
    for entry in BILINGUAL_LEXICON:
        if entry["code"] in matches:
            continue
        groups = [
            (entry.get("synonyms_en", []), "en"),
            (entry.get("synonyms_ar", []), "ar"),
            (entry.get("synonyms_colloquial", []), "ar"),
        ]
        for synonyms, lang in groups:
            found = False
            for syn in synonyms:
                m = _word_boundary_pattern(syn).search(normalized)
                if not m:
                    continue
                context = normalized[max(0, m.start() - 40): m.start()]
                negation_terms = NEGATION_TERMS_AR if lang == "ar" else NEGATION_TERMS_EN
                if contains_any(context, negation_terms):
                    continue
                uncertainty_terms = UNCERTAINTY_TERMS_AR if lang == "ar" else UNCERTAINTY_TERMS_EN
                uncertain = contains_any(context, uncertainty_terms)
                confidence = max(0.4, entry["base_confidence"] - 0.15) if uncertain else entry["base_confidence"]
                matches[entry["code"]] = {
                    "entry": entry,
                    "matched_text": syn,
                    "synonym_language": lang,
                    "confidence": confidence,
                    "uncertain": uncertain,
                }
                found = True
                break
            if found:
                break
    # A more specific match supersedes the generic concept it was matched alongside.
    for info in list(matches.values()):
        for superseded in info["entry"].get("supersedes", []):
            matches.pop(superseded, None)
    return list(matches.values())


def match_procedures(raw_text: str) -> List[Dict[str, Any]]:
    """Scans normalized clinical text for mentions of OR procedures (drives the Medical/Surgical DRG partition)."""
    normalized = strip_diacritics(raw_text)
    matches: Dict[str, Dict[str, Any]] = {}
    for entry in PROCEDURE_LEXICON:
        if entry["code"] in matches:
            continue
        for synonyms in (entry["synonyms_en"], entry["synonyms_ar"]):
            found = False
            for syn in synonyms:
                m = _word_boundary_pattern(syn).search(normalized)
                if not m:
                    continue
                context = normalized[max(0, m.start() - 40): m.start()]
                if contains_any(context, NEGATION_TERMS_EN) or contains_any(context, NEGATION_TERMS_AR):
                    continue
                matches[entry["code"]] = {"entry": entry, "matched_text": syn}
                found = True
                break
            if found:
                break
    return list(matches.values())


def _elect_principal(matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def score(m: Dict[str, Any]) -> float:
        e = m["entry"]
        return m["confidence"] * (1 + e["soi_weight"] + e["rom_weight"])
    return sorted(matches, key=score, reverse=True)


def run_coding_engine(text: str, age: Optional[float] = None, encounter_type: str = "INPATIENT") -> Dict[str, Any]:
    detected_language = detect_language(text)
    matches = match_clinical_text(text)
    if not matches:
        suggested_codes: List[SuggestedCode] = [{
            "code": "Z00.00",
            "desc": "General medical examination, unspecified",
            "desc_ar": "فحص طبي عام، غير محدد",
            "confidence": 0.5,
            "is_principal": True,
            "soi_weight": 0,
            "rom_weight": 0,
        }]
        principal_code = "Z00.00"
        secondary_codes: List[str] = []
    else:
        ranked = _elect_principal(matches)
        principal_code = ranked[0]["entry"]["code"]
        secondary_codes = [r["entry"]["code"] for r in ranked[1:]]
        suggested_codes = []
        for m in ranked:
            e = m["entry"]
            suggested_codes.append({
                "code": e["code"],
                "desc": e["desc_en"],
                "desc_ar": e["desc_ar"],
                "term_en": m["matched_text"] if m["synonym_language"] == "en" else None,
                "term_ar": m["matched_text"] if m["synonym_language"] == "ar" else None,
                "matched_text": m["matched_text"],
                "confidence": round(m["confidence"], 2),
                "is_principal": e["code"] == principal_code,
                "soi_weight": e["soi_weight"],
                "rom_weight": e["rom_weight"],
            })
    procedure_matches = match_procedures(text)
    suggested_procedures: List[SuggestedProcedure] = [
        {
            "code": p["entry"]["code"],
            "desc": p["entry"]["desc_en"],
            "desc_ar": p["entry"]["desc_ar"],
            "matched_text": p["matched_text"],
        }
        for p in procedure_matches
    ]
    drg = group_encounter(
        principal_code,
        secondary_codes,
        procedure_codes=[p["code"] for p in suggested_procedures],
        age=age,
        encounter_type=encounter_type,
    )
    confidence_score = round(sum(c["confidence"] for c in suggested_codes) / len(suggested_codes), 2)
    return {
        "suggested_codes": suggested_codes,
        "suggested_procedures": suggested_procedures,
        "principal_code": principal_code,
        "secondary_codes": secondary_codes,
        "drg": drg,
        "detected_language": detected_language,
        "confidence_score": confidence_score,
    }


def classify_automation_phase(confidence_score: float, visit_complexity: str) -> Dict[str, str]:
    """Mirrors the three-phase automation policy from the PRD (CAC -> Semi-Autonomous -> Autonomous)."""
    if confidence_score > 0.98 and visit_complexity == "low-complexity outpatient":
        return {"phase": "AUTONOMOUS", "status": "SENT_TO_NPHIES"}
    if confidence_score > 0.90:
        return {"phase": "SEMI_AUTONOMOUS", "status": "AUTO_DROP"}
    return {"phase": "CAC", "status": "NEEDS_REVIEW"}


class MockNphiesConnector:
    """Mock NphiesConnector for demonstration without real API calls."""

    def submit_claim(self, claim_data: Dict[str, Any]) -> Dict[str, Any]:
        print(f"--- [MOCK NPHIES] Submitting claim: {claim_data.get('claimNumber')} ---")
        return {"status": "SUBMITTED", "nphiesClaimId": f"NPH-{claim_data.get('claimNumber')}"}


class CodingEngine:
    """
    Runs the full bilingual coding + APR-DRG grouping flow and applies
    the three-phase automation policy (CAC / Semi-Autonomous / Autonomous).
    """

    ENGINE_VERSION = ENGINE_VERSION

    def __init__(self, nphies_connector: Any = None):
        self.nphies_connector = nphies_connector or MockNphiesConnector()

    def run_coding_job(self, clinical_note: str, encounter_meta: Dict[str, Any]) -> CodingResult:
        engine_result = run_coding_engine(
            clinical_note,
            age=encounter_meta.get("age"),
            encounter_type=encounter_meta.get("encounter_type", "INPATIENT"),
        )
        visit_complexity = encounter_meta.get("visit_complexity", "standard")
        classification = classify_automation_phase(engine_result["confidence_score"], visit_complexity)
        final_codes: List[SuggestedCode] = []
        if classification["status"] == "SENT_TO_NPHIES":
            final_codes = engine_result["suggested_codes"]
            claim_payload = self._create_claim_payload(encounter_meta, final_codes)
            self.nphies_connector.submit_claim(claim_payload)
        return {
            "engine_version": self.ENGINE_VERSION,
            "source_text": clinical_note,
            "suggested_codes": engine_result["suggested_codes"],
            "suggested_procedures": engine_result["suggested_procedures"],
            "final_codes": final_codes,
            "status": classification["status"],
            "confidence_score": engine_result["confidence_score"],
            "phase": classification["phase"],
            "principal_code": engine_result["principal_code"],
            "secondary_codes": engine_result["secondary_codes"],
            "drg": engine_result["drg"],
            "detected_language": engine_result["detected_language"],
        }

    def _create_claim_payload(self, encounter: Dict[str, Any], codes: List[SuggestedCode]) -> Dict[str, Any]:
        """Creates a mock claim payload for submission."""
        return {
            "claimNumber": f"CLAIM-{encounter.get('id', 'UNKNOWN')}",
            "patient": {"id": encounter.get("patient_id")},
            "provider": {"cr_number": encounter.get("provider_cr")},
            "items": [{"serviceCode": c["code"], "description": c["desc"]} for c in codes],
            "total": 1000.00,  # Mock total
        }


# Example Usage
if __name__ == "__main__":
    engine = CodingEngine()
    print("--- Bilingual (mixed AR/EN) ---")
    result_mixed = engine.run_coding_job(
        "Patient with sukari symptoms, ضغط دم مرتفع controlled with medication.",
        {"visit_complexity": "inpatient", "id": 123},
    )
    print(result_mixed)
    print("\n" + "=" * 40 + "\n")
    print("--- Arabic-only note ---")
    result_ar = engine.run_coding_job(
        "مريض يعاني من التهاب رئوي بكتيري وكسر في الساق اليسرى.",
        {"visit_complexity": "inpatient", "id": 456},
    )
    print(result_ar)
