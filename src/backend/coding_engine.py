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
from .drg_grouper import DrgResult, group_encounter, round_half_up_2dp

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


NEGATION_CONTEXT_WINDOW = 40
# Clause boundaries a post-term negator must not cross: "Chest pain,
# myocardial infarction ruled out" must negate only "myocardial infarction"
# — if the post-window weren't clause-bounded, "ruled out" would fall
# within 40 raw characters of "chest pain" too and wrongly negate an
# entirely different, earlier clause's diagnosis.
_CLAUSE_BOUNDARY_RE = re.compile(r"[.,;:\n]")
# Generic short negators are deliberately excluded from the comma-shorthand
# opener check below: "no"/"not"/"without" routinely open an unrelated
# continuation clause that has nothing to do with the preceding term (e.g.
# "pneumonia, no further detail documented" is a documentation-completeness
# remark, not a negation of pneumonia) — unlike "ruled out"/"excluded"/
# "unlikely"/etc., which are specific enough that they only ever appear as
# an actual verdict on the term they follow.
_GENERIC_SHORT_NEGATORS = {"no", "not", "without"}
_SHORTHAND_VERDICT_TERMS = [
    t for t in (NEGATION_TERMS_EN + NEGATION_TERMS_AR + UNCERTAINTY_TERMS_EN + UNCERTAINTY_TERMS_AR)
    if t.lower() not in _GENERIC_SHORT_NEGATORS
]


def _opens_with_term(text: str, terms: List[str]) -> bool:
    """Does `text` open (respecting a word boundary, so "no" can't match
    "normal") with one of `terms`? Used only for the comma-shorthand case
    below — a plain substring check would reintroduce the cross-clause bug
    get_surrounding_context exists to avoid."""
    for t in terms:
        lower = t.lower()
        if not text.startswith(lower):
            continue
        next_char = text[len(lower): len(lower) + 1]
        if not next_char or not next_char.isalnum():
            return True
    return False


def get_surrounding_context(normalized: str, match_start: int, match_end: int) -> str:
    """Text surrounding a match, used to detect negation/uncertainty. Clinical
    notes phrase a negative or uncertain finding either BEFORE the diagnosis
    term ("no fever", "denies chest pain", "suspected pneumonia") or AFTER it
    ("myocardial infarction ruled out", "sepsis excluded", "pneumonia
    unlikely") — checking only the text before the match silently coded
    conditions the note explicitly excluded, e.g. "Chest pain, myocardial
    infarction ruled out" was coded as a positive MI. The post-side is
    truncated at the next clause boundary (comma, period, semicolon, colon,
    newline) since a post-position negator normally applies within the same
    clause as the term it modifies; the pre-side keeps its original
    raw-window behavior to avoid changing already-tested matches.
    One shorthand is special-cased: "<term>, ruled out" / "<term>, rule out"
    — extremely common ED/radiology dictation ("chest pain, MI rule out") —
    where the verdict sits just past a single leading comma. That's allowed
    ONLY when the negator/uncertainty word is the very first token after the
    comma (not merely present somewhere in that clause), so an unrelated next
    item in a list ("chest pain, myocardial infarction ruled out" — from
    chest pain's point of view) still can't be swept in.
    Mirrors shared/coding-engine.ts getSurroundingContext.
    """
    pre_start = max(0, match_start - NEGATION_CONTEXT_WINDOW)
    pre = normalized[pre_start:match_start].lower()
    post_raw = normalized[match_end: match_end + NEGATION_CONTEXT_WINDOW].lower()
    boundary_match = _CLAUSE_BOUNDARY_RE.search(post_raw)
    direct_post = post_raw if boundary_match is None else post_raw[: boundary_match.start()]
    after_leading_comma = re.sub(r"^[,،؛\s]+", "", post_raw)
    shorthand_post = after_leading_comma if _opens_with_term(after_leading_comma, _SHORTHAND_VERDICT_TERMS) else ""
    return f"{pre} {direct_post} {shorthand_post}"


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
                context = get_surrounding_context(normalized, m.start(), m.end())
                # Check both languages' negation/uncertainty terms regardless of
                # the matched synonym's language: code-switched notes routinely
                # negate a term in one language right next to the diagnosis term
                # in the other (e.g. Arabic "لا" preceding an English diagnosis
                # name). Mirrors shared/coding-engine.ts matchClinicalText.
                if contains_any(context, NEGATION_TERMS_EN) or contains_any(context, NEGATION_TERMS_AR):
                    continue
                uncertain = contains_any(context, UNCERTAINTY_TERMS_EN) or contains_any(context, UNCERTAINTY_TERMS_AR)
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
                context = get_surrounding_context(normalized, m.start(), m.end())
                if contains_any(context, NEGATION_TERMS_EN) or contains_any(context, NEGATION_TERMS_AR):
                    continue
                matches[entry["code"]] = {"entry": entry, "matched_text": syn}
                found = True
                break
            if found:
                break
    return list(matches.values())


def elect_principal(matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Elects the clinically dominant diagnosis (weighted by acuity, not just
    confidence) as principal. Public so any caller that needs a
    principal/secondary split (e.g. cdi_api.py) uses the exact same ranking
    as the main engine, rather than relying on the lexicon's insertion order."""
    def score(m: Dict[str, Any]) -> float:
        e = m["entry"]
        return m["confidence"] * (1 + e["soi_weight"] + e["rom_weight"])
    return sorted(matches, key=score, reverse=True)


def run_coding_engine(
    text: str,
    age: Optional[float] = None,
    encounter_type: str = "INPATIENT",
    poa_exclusions: Optional[List[str]] = None,
    principal_override: Optional[str] = None,
) -> Dict[str, Any]:
    """principal_override: when set (from the refinement wizard's 'principal'
    question), forces this code to be the principal diagnosis instead of the
    automatic acuity-weighted ranking. Ignored if the code isn't among the
    matched diagnoses. Mirrors shared/coding-engine.ts runCodingEngine."""
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
        ranked = elect_principal(matches)
        if principal_override:
            override_idx = next((i for i, r in enumerate(ranked) if r["entry"]["code"] == principal_override), -1)
            if override_idx > 0:
                chosen = ranked.pop(override_idx)
                ranked = [chosen] + ranked
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
                "confidence": round_half_up_2dp(m["confidence"]),
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
        poa_exclusions=poa_exclusions,
    )
    confidence_score = round_half_up_2dp(sum(c["confidence"] for c in suggested_codes) / len(suggested_codes))
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
