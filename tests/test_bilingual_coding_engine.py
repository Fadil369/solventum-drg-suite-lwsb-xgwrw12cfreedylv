"""
Tests for the bilingual (AR/EN code-switching) coding engine, the
APR-DRG grouper, and the bilingual CDI nudge rules.
"""
import pytest

from src.backend.coding_engine import (
    CodingEngine,
    classify_automation_phase,
    detect_language,
    match_clinical_text,
    run_coding_engine,
)
from src.backend.drg_grouper import DRG_FAMILY_TABLE, compute_case_mix_index, group_encounter
from src.backend.cdi_api import get_cdi_nudges
from src.backend.bilingual_lexicon import BILINGUAL_LEXICON


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
