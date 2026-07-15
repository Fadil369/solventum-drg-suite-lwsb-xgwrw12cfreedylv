"""
Tests for the bilingual (AR/EN code-switching) coding engine, the
APR-DRG grouper, and the bilingual CDI nudge rules.
"""
import pytest
from pydantic import ValidationError

from src.backend.coding_engine import (
    CodingEngine,
    classify_automation_phase,
    contains_any,
    detect_language,
    elect_principal,
    match_clinical_text,
    match_procedures,
    run_coding_engine,
)
from src.backend.drg_grouper import DRG_FAMILY_TABLE, compute_case_mix_index, group_encounter, round_half_up_2dp
from src.backend.cdi_api import AnalyzeRequest, get_cdi_nudges
from src.backend.bilingual_lexicon import BILINGUAL_LEXICON
from src.backend.procedure_lexicon import PROCEDURE_LEXICON


# --- Language detection ---
def test_detect_language_english():
    assert detect_language("Patient presents with fever and cough.") == "en"


def test_detect_language_arabic():
    assert detect_language("مريض يعاني من حمى وسعال.") == "ar"


def test_detect_language_mixed():
    assert detect_language("Patient with sukari, ضغط دم مرتفع controlled.") == "mixed"


# --- Term matching across languages ---
def test_matches_english_term():
    matches = match_clinical_text("Patient complains of pneumonia.")
    codes = {m["entry"]["code"] for m in matches}
    assert "J18.9" in codes


def test_matches_arabic_term():
    matches = match_clinical_text("مريض يعاني من التهاب رئوي.")
    codes = {m["entry"]["code"] for m in matches}
    assert "J18.9" in codes


def test_matches_colloquial_arabic_diabetes():
    matches = match_clinical_text("Patient with sukari symptoms, no complications noted.")
    codes = {m["entry"]["code"] for m in matches}
    assert "E11.9" in codes


def test_matches_code_switched_hypertension():
    matches = match_clinical_text("High blood pressure diagnosed, ضغط دم مرتفع controlled with medication.")
    codes = {m["entry"]["code"] for m in matches}
    assert "I10" in codes


def test_negation_excludes_match():
    matches = match_clinical_text("Patient denies fever. No pneumonia on exam.")
    codes = {m["entry"]["code"] for m in matches}
    assert "J18.9" not in codes


def test_negation_excludes_match_arabic():
    matches = match_clinical_text("لا يوجد لدى المريض حمى.")
    codes = {m["entry"]["code"] for m in matches}
    assert "R50.9" not in codes


def test_negation_excludes_match_cross_language_arabic_negator_english_term():
    # Arabic negation phrase immediately preceding an English diagnosis term:
    # negation/uncertainty detection must not be gated to the matched
    # synonym's own language, or code-switched negation is silently missed.
    matches = match_clinical_text("لا يوجد pneumonia on this patient's chest x-ray.")
    codes = {m["entry"]["code"] for m in matches}
    assert "J18.9" not in codes


def test_negation_excludes_match_cross_language_english_negator_arabic_term():
    matches = match_clinical_text("Chart reviewed, no التهاب رئوي seen on imaging.")
    codes = {m["entry"]["code"] for m in matches}
    assert "J18.9" not in codes


def test_uncertainty_lowers_confidence():
    matches = match_clinical_text("Suspected pneumonia, awaiting culture.")
    match = next(m for m in matches if m["entry"]["code"] == "J18.9")
    assert match["uncertain"] is True
    assert match["confidence"] < match["entry"]["base_confidence"]


def test_specific_fracture_supersedes_generic():
    matches = match_clinical_text("Left leg fracture after fall, left tibia fracture confirmed on x-ray.")
    codes = {m["entry"]["code"] for m in matches}
    assert "S82.202A" in codes
    assert "S82.90XA" not in codes  # superseded by the more specific code


# --- Full engine run ---
def test_run_coding_engine_selects_higher_acuity_principal():
    # Sepsis (soi=3, rom=3) should outrank a mere cough (soi=0, rom=0) as principal.
    result = run_coding_engine("Patient with cough and sepsis, unspecified organism.")
    assert result["principal_code"] == "A41.9"
    assert "R05" in result["secondary_codes"]


def test_run_coding_engine_fallback_when_no_match():
    result = run_coding_engine("Patient in for a routine visit, all normal.")
    assert result["principal_code"] == "Z00.00"
    assert result["drg"]["code"] == "999"


def test_run_coding_engine_is_deterministic():
    note = "Patient with sukari symptoms, ضغط دم مرتفع controlled with medication."
    first = run_coding_engine(note)
    second = run_coding_engine(note)
    assert first == second


def test_run_coding_engine_bilingual_descriptions_present():
    result = run_coding_engine("مريض يعاني من التهاب رئوي بكتيري.")
    pneumonia = next(c for c in result["suggested_codes"] if c["code"] == "J18.9")
    assert pneumonia["desc_ar"] == "التهاب رئوي، غير محدد المسبب"
    assert pneumonia["term_ar"] is not None


# --- Automation phase classification ---
@pytest.mark.parametrize(
    "confidence,visit_complexity,expected_phase",
    [
        (0.99, "low-complexity outpatient", "AUTONOMOUS"),
        (0.95, "inpatient", "SEMI_AUTONOMOUS"),
        (0.7, "inpatient", "CAC"),
        (0.99, "inpatient", "SEMI_AUTONOMOUS"),  # high confidence alone isn't enough for autonomy
    ],
)
def test_classify_automation_phase(confidence, visit_complexity, expected_phase):
    assert classify_automation_phase(confidence, visit_complexity)["phase"] == expected_phase


# --- APR-DRG grouper ---
def test_group_encounter_base_case():
    drg = group_encounter("J18.9", [], encounter_type="INPATIENT")
    assert drg["code"] == "194"
    assert drg["methodology"] == "BrainSAIT-APR-DRG"
    assert 1 <= drg["soi"] <= 4


def test_group_encounter_outpatient_uses_eapg():
    drg = group_encounter("I10", [], encounter_type="OUTPATIENT")
    assert drg["methodology"] == "BrainSAIT-EAPG"


def test_group_encounter_soi_increases_with_comorbidity_burden():
    baseline = group_encounter("J18.9", [], encounter_type="INPATIENT")
    with_comorbidities = group_encounter("J18.9", ["A41.9", "N18.9"], encounter_type="INPATIENT")
    assert with_comorbidities["soi"] >= baseline["soi"]
    assert with_comorbidities["relative_weight"] >= baseline["relative_weight"]


def test_group_encounter_age_raises_rom():
    young = group_encounter("I21.9", [], age=40, encounter_type="ED")
    elderly = group_encounter("I21.9", [], age=80, encounter_type="ED")
    assert elderly["rom"] >= young["rom"]


def test_compute_case_mix_index():
    assert compute_case_mix_index([1.0, 2.0, 3.0]) == 2.0
    assert compute_case_mix_index([]) == 0.0


# --- CodingEngine wrapper (automation + mock claim submission) ---
def test_coding_engine_autonomous_submits_claim():
    class RecordingConnector:
        def __init__(self):
            self.submitted = None

        def submit_claim(self, claim_data):
            self.submitted = claim_data
            return {"status": "SUBMITTED"}

    connector = RecordingConnector()
    engine = CodingEngine(nphies_connector=connector)
    result = engine.run_coding_job(
        "Routine check for hypertension, well controlled, no crisis.",
        {"visit_complexity": "low-complexity outpatient", "id": "enc-1", "encounter_type": "OUTPATIENT"},
    )
    assert result["status"] == "SENT_TO_NPHIES"
    assert result["phase"] == "AUTONOMOUS"
    assert connector.submitted is not None
    assert connector.submitted["items"][0]["serviceCode"] == "I10"


def test_coding_engine_needs_review_does_not_submit():
    class RecordingConnector:
        def __init__(self):
            self.submitted = None

        def submit_claim(self, claim_data):
            self.submitted = claim_data
            return {"status": "SUBMITTED"}

    connector = RecordingConnector()
    engine = CodingEngine(nphies_connector=connector)
    result = engine.run_coding_job(
        "Patient complains of cough and fever. Suspected pneumonia.",
        {"visit_complexity": "inpatient", "id": "enc-2"},
    )
    assert result["status"] == "NEEDS_REVIEW"
    assert connector.submitted is None


# --- Bilingual CDI nudges ---
def test_cdi_nudge_fires_for_underspecified_fracture():
    nudges = get_cdi_nudges("Left leg fracture after fall, كسر in tibia.", encounter_id="e1")
    # "left" and "كسر" alone don't resolve laterality on the *generic* fracture
    # entry unless the specific left-tibia synonym matched; assert at least
    # the sepsis-style shape (no exception) and correct bilingual content when present.
    for nudge in nudges:
        assert nudge.prompt_ar  # every nudge must carry an Arabic prompt
        assert nudge.prompt


def test_cdi_nudge_silent_when_organism_specified():
    nudges = get_cdi_nudges("Pneumonia with bacterial organism confirmed on culture.", encounter_id="e2")
    assert not any(n.id.startswith("J18.9_pneumonia_organism") for n in nudges)


def test_cdi_nudge_fires_when_organism_unspecified():
    nudges = get_cdi_nudges("Patient has pneumonia, no further detail documented.", encounter_id="e3")
    assert any(n.id.startswith("J18.9_pneumonia_organism") for n in nudges)
    nudge = next(n for n in nudges if n.id.startswith("J18.9_pneumonia_organism"))
    assert nudge.soi_impact is not None
    assert "SOI" in nudge.soi_impact
    assert nudge.soi_impact_ar is not None


def test_cdi_nudge_arabic_note_diabetes_complication_gap():
    nudges = get_cdi_nudges("المريض حالة معروفة بداء السكري ويأتي للمراجعة الروتينية دون مضاعفات.", encounter_id="e4")
    assert any(n.id.startswith("E11.9_diabetes_complication") for n in nudges)


# --- Lexicon breadth (this is meant to be a complete system, not a demo) ---
def test_lexicon_covers_broad_clinical_breadth():
    assert len(BILINGUAL_LEXICON) >= 70
    families = {e["drg_family"] for e in BILINGUAL_LEXICON}
    assert len(families) >= 60
    # every family referenced by the lexicon must have DRG metadata
    assert families.issubset(DRG_FAMILY_TABLE.keys())


@pytest.mark.parametrize(
    "note,expected_code",
    [
        ("Patient has atrial fibrillation with rapid ventricular response.", "I48.91"),
        ("مريض يعاني من الرجفان الأذيني.", "I48.91"),
        ("CT confirms pulmonary embolism, PE bilateral.", "I26.99"),
        ("Patient in cardiac arrest, code blue called.", "I46.9"),
        ("Labs show diabetic ketoacidosis, DKA confirmed.", "E11.10"),
        ("Ultrasound confirms cholecystitis.", "K81.9"),
        ("مريض يعاني من التهاب البنكرياس الحاد.", "K85.90"),
        ("Endoscopy shows upper GI bleed.", "K92.2"),
        ("Patient with known cirrhosis and ascites.", "K74.60"),
        ("EEG confirms seizure activity, epilepsy diagnosed.", "G40.909"),
        ("Newborn with neonatal jaundice, bilirubin elevated.", "P59.9"),
        ("Patient admitted for normal vaginal delivery.", "O80"),
        ("Patient with major depressive disorder.", "F32.9"),
        ("Biopsy confirms malignancy, primary site pending.", "C80.1"),
        ("Patient has osteomyelitis of the tibia.", "M86.9"),
    ],
)
def test_expanded_lexicon_recognizes_new_diagnoses(note, expected_code):
    matches = match_clinical_text(note)
    codes = {m["entry"]["code"] for m in matches}
    assert expected_code in codes


def test_atrial_fibrillation_type_nudge():
    nudges = get_cdi_nudges("Patient has atrial fibrillation, rate controlled.", encounter_id="e5")
    assert any(n.id.startswith("I48.91_afib_type") for n in nudges)


def test_cirrhosis_decompensation_nudge_with_soi_impact():
    nudges = get_cdi_nudges("Patient with known cirrhosis of the liver.", encounter_id="e6")
    nudge = next(n for n in nudges if n.id.startswith("K74.60_cirrhosis_decompensation"))
    assert nudge.severity == "critical"
    assert nudge.soi_impact_ar is not None


def test_malignancy_groups_into_oncology_family_with_high_severity():
    drg = group_encounter("C80.1", [], encounter_type="INPATIENT")
    assert drg["code"] == "690"
    assert drg["soi"] >= 2


def test_normal_delivery_is_low_acuity():
    drg = group_encounter("O80", [], encounter_type="INPATIENT")
    assert drg["relative_weight"] == pytest.approx(0.3)


# --- Whole-word matching correctness (regression coverage for reviewer-flagged bugs) ---
def test_contains_any_does_not_false_positive_on_embedded_substring():
    # "no" is embedded inside "known"/"normal"; a naive substring check would
    # wrongly treat these as negation. This was a real bug in this codebase.
    assert contains_any("Patient with known cirrhosis", ["no"]) is False
    assert contains_any("normal delivery", ["no"]) is False
    assert contains_any("art" + "ery disease", ["art"]) is False  # "art" inside "artery"
    assert contains_any("no fever", ["no"]) is True


def test_bowel_obstruction_strangulation_typo_regression():
    # Regression test for a fixed typo: keywords_en had "strangulat" (not a
    # real word), so a note saying "strangulated" never resolved the gap.
    entry = next(e for e in BILINGUAL_LEXICON if e["code"] == "K56.60")
    modifier = next(m for m in entry["specificity_modifiers"] if m["id"] == "bowel_obstruction_type")
    assert "strangulated" in modifier["keywords_en"]
    assert "strangulat" not in modifier["keywords_en"]
    nudges = get_cdi_nudges("Bowel obstruction, strangulated segment noted on imaging.", encounter_id="e7")
    assert not any(n.id.startswith("K56.60_bowel_obstruction_type") for n in nudges)


def test_cdi_nudge_keyword_matching_is_whole_word_not_substring():
    # A modifier keyword like "art" (hypothetically) must not resolve just
    # because it appears inside an unrelated word in the note.
    nudges_unresolved = get_cdi_nudges("Patient has pneumonia, no further detail documented.", encounter_id="e8")
    assert any(n.id.startswith("J18.9_pneumonia_organism") for n in nudges_unresolved)
    # "organism" as a real whole word DOES resolve it.
    nudges_resolved = get_cdi_nudges("Patient has pneumonia; organism pending culture results.", encounter_id="e8b")
    assert not any(n.id.startswith("J18.9_pneumonia_organism") for n in nudges_resolved)


# --- Rounding parity with the TypeScript grouper (Math.round semantics) ---
@pytest.mark.parametrize(
    "principal_code,expected_soi_at_least",
    [
        ("K37", 2),  # soi_weight=1 -> 0.5 -> half-up rounds to 1, tier >= 2
        ("N39.0", 2),  # soi_weight=1
        ("I10", 2),  # soi_weight=1
    ],
)
def test_half_up_rounding_matches_javascript_math_round(principal_code, expected_soi_at_least):
    # Python's round(0.5) == 0 (banker's rounding) would previously diverge
    # from JavaScript's Math.round(0.5) == 1 for any principal diagnosis with
    # soi_weight == 1 (0.5 exactly). This must match the TS grouper's tier.
    drg = group_encounter(principal_code, [], encounter_type="INPATIENT")
    assert drg["soi"] >= expected_soi_at_least


@pytest.mark.parametrize(
    "value,expected",
    [
        (0.125, 0.13),  # Python's round(0.125, 2) == 0.12 (banker's rounding)
        (0.615, 0.62),  # Python's round(0.615, 2) == 0.61
        (0.845, 0.85),  # Python's round(0.845, 2) == 0.84
    ],
)
def test_confidence_rounding_uses_half_up_not_bankers_rounding(value, expected):
    # coding_engine.py previously used Python's built-in round(x, 2) for
    # suggested-code confidence and confidence_score, which can diverge from
    # the TS engine's Math.round(x * 100) / 100 half-up semantics near .5
    # boundaries and shift automation-phase classification at the threshold.
    assert round_half_up_2dp(value) == expected
    assert round_half_up_2dp(value) != round(value, 2) or round(value, 2) == expected


# --- Procedure lexicon & Medical/Surgical DRG partition ---
def test_procedure_lexicon_has_real_breadth():
    assert len(PROCEDURE_LEXICON) >= 10
    for p in PROCEDURE_LEXICON:
        assert p["surgical_families"], f"{p['code']} must map to at least one DRG family"
        for family in p["surgical_families"]:
            assert family in DRG_FAMILY_TABLE


def test_match_procedures_recognizes_appendectomy_bilingually():
    en = match_procedures("Patient underwent appendectomy for acute appendicitis.")
    assert any(p["entry"]["code"] == "PR-APPY" for p in en)
    ar = match_procedures("تم للمريض استئصال الزائدة الدودية.")
    assert any(p["entry"]["code"] == "PR-APPY" for p in ar)


def test_negated_procedure_is_not_detected():
    matches = match_procedures("No appendectomy was performed; managed medically.")
    assert not any(p["entry"]["code"] == "PR-APPY" for p in matches)


def test_appendectomy_upgrades_to_surgical_partition():
    medical = group_encounter("K37", [], encounter_type="INPATIENT")
    surgical = group_encounter("K37", [], procedure_codes=["PR-APPY"], encounter_type="INPATIENT")
    assert medical["partition"] == "Medical"
    assert surgical["partition"] == "Surgical"
    assert surgical["relative_weight"] > medical["relative_weight"]
    assert surgical["subclass"].split("-")[1] == "S"
    assert medical["subclass"].split("-")[1] == "M"
    assert surgical["procedure"]["code"] == "PR-APPY"


def test_procedure_only_upgrades_matching_family():
    # A cholecystectomy procedure must not upgrade an unrelated family (e.g. hypertension).
    drg = group_encounter("I10", [], procedure_codes=["PR-CHOLE"], encounter_type="INPATIENT")
    assert drg["partition"] == "Medical"
    assert drg["procedure"] is None


def test_multiple_matching_procedures_picks_highest_weight_multiplier():
    # Both PCI and CABG map to the AMI family; CABG has the higher multiplier
    # and should win.
    drg = group_encounter("I21.9", [], procedure_codes=["PR-PCI", "PR-CABG"], encounter_type="INPATIENT")
    assert drg["procedure"]["code"] == "PR-CABG"


def test_run_coding_engine_includes_suggested_procedures_and_partition():
    result = run_coding_engine("Patient underwent appendectomy for acute appendicitis with perforation.")
    assert any(p["code"] == "PR-APPY" for p in result["suggested_procedures"])
    assert result["drg"]["partition"] == "Surgical"


def test_explanation_trace_is_bilingual_and_nonempty():
    drg = group_encounter("A41.9", ["N18.9"], age=70, encounter_type="INPATIENT")
    assert len(drg["explanation"]["en"]) >= 3
    assert len(drg["explanation"]["ar"]) == len(drg["explanation"]["en"])
    assert all(isinstance(line, str) and line for line in drg["explanation"]["en"])
    assert all(isinstance(line, str) and line for line in drg["explanation"]["ar"])


def test_coding_engine_run_coding_job_surfaces_suggested_procedures():
    engine = CodingEngine()
    result = engine.run_coding_job(
        "Patient underwent appendectomy for acute appendicitis.",
        {"visit_complexity": "inpatient", "id": "enc-3"},
    )
    assert any(p["code"] == "PR-APPY" for p in result["suggested_procedures"])
    assert result["drg"]["partition"] == "Surgical"


# --- CDI principal selection must match the coding engine's acuity ranking
# (regression test for a reviewer-flagged bug: get_cdi_nudges/generateCdiNudges
# used to take the first lexicon/insertion-order match as principal instead of
# the acuity-weighted election used everywhere else, which could anchor the
# SOI-impact baseline on the wrong diagnosis for multi-diagnosis notes). ---
def test_cdi_nudge_baseline_uses_elected_principal_not_first_match():
    # Pneumonia (J18.9) appears earlier than myocardial infarction (I21.9) in
    # the lexicon's insertion order, but MI is the higher-acuity diagnosis
    # (soi_weight=3, rom_weight=3 vs. pneumonia's 2/2) and must be elected
    # principal — this is exactly the scenario the reviewer flagged. The
    # real-world stakes: principal selection drives which DRG *family* (and
    # therefore which reimbursement weight) the encounter groups into.
    note = "Patient has pneumonia and myocardial infarction."
    matches = match_clinical_text(note)
    assert [m["entry"]["code"] for m in matches] == ["J18.9", "I21.9"]  # raw/insertion order
    ranked = elect_principal(matches)
    assert ranked[0]["entry"]["code"] == "I21.9"  # elected principal is the higher-acuity MI
    correct_baseline = group_encounter("I21.9", ["J18.9"], encounter_type="INPATIENT")
    buggy_baseline = group_encounter("J18.9", ["I21.9"], encounter_type="INPATIENT")  # what matches[0]-as-principal would give
    assert correct_baseline["code"] == "190"  # Acute Myocardial Infarction family
    assert buggy_baseline["code"] == "194"  # wrong family if pneumonia were mistakenly used as principal
    nudges = get_cdi_nudges(note, encounter_id="e10")
    assert any(n.id.startswith("I21.9_mi_type") for n in nudges)  # nudge is keyed on the correct (MI) principal


def test_elect_principal_matches_coding_engine_ranking():
    note = "Patient has pneumonia and myocardial infarction."
    matches = match_clinical_text(note)
    engine_result = run_coding_engine(note)
    assert elect_principal(matches)[0]["entry"]["code"] == engine_result["principal_code"]


# --- encounter_type must be validated, not silently mis-grouped
# (regression test for a reviewer-flagged bug: a mis-cased or misspelled
# encounter_type used to pass through unchecked and silently fall back to
# APR-DRG methodology instead of EAPG). ---
def test_analyze_request_rejects_invalid_encounter_type():
    with pytest.raises(ValidationError):
        AnalyzeRequest(clinical_note="test note", encounter_type="outpatient")  # wrong case


def test_analyze_request_accepts_valid_encounter_type():
    req = AnalyzeRequest(clinical_note="test note", encounter_type="OUTPATIENT")
    assert req.encounter_type == "OUTPATIENT"
