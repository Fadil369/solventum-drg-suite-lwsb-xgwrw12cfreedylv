"""
BrainSAIT APR-DRG / EAPG Grouper (Python port)
-----------------------------------------------------------------------------
Mirrors `shared/drg-grouper.ts`. See that module for full design rationale.
BrainSAIT's own calibration — not a certified 3M grouper.
"""
from typing import Dict, List, Optional, Tuple, TypedDict

from .bilingual_lexicon import find_lexicon_entry
from .procedure_lexicon import find_procedure_entry


class DrgExplanation(TypedDict):
    en: List[str]
    ar: List[str]


class DrgProcedureRef(TypedDict):
    code: str
    desc_en: str
    desc_ar: str


class DrgResult(TypedDict):
    code: str
    title_en: str
    title_ar: str
    department_en: str
    department_ar: str
    soi: int
    rom: int
    relative_weight: float
    subclass: str
    methodology: str
    partition: str
    procedure: Optional[DrgProcedureRef]
    explanation: DrgExplanation


def round_half_up(value: float) -> int:
    """Half-up rounding to match JavaScript's Math.round (Python's round() uses
    banker's rounding, e.g. round(0.5) == 0, which silently diverges from the
    TypeScript engine/grouper for any value landing exactly on a .5 boundary).
    Exported so coding_engine.py can use the same semantics for confidence
    scores, not just SOI/ROM tiers."""
    return int(value + 0.5)


def round_half_up_2dp(value: float) -> float:
    """Half-up rounding to 2 decimal places, mirroring the TypeScript engine's
    `Math.round(x * 100) / 100` for confidence scores."""
    return round_half_up(value * 100) / 100


class DrgFamilyMeta(TypedDict):
    title_en: str
    title_ar: str
    department_en: str
    department_ar: str
    base_weight: Tuple[float, float, float, float]


DRG_FAMILY_TABLE: Dict[str, DrgFamilyMeta] = {
    "128": {"title_en": "Venous Thrombosis", "title_ar": "الخثار الوريدي", "department_en": "Internal Medicine", "department_ar": "الطب الباطني", "base_weight": (0.5, 0.7, 0.95, 1.25)},
    "129": {"title_en": "Cardiac Arrest & Resuscitation", "title_ar": "توقف القلب والإنعاش", "department_en": "Critical Care", "department_ar": "العناية المركزة", "base_weight": (1.5, 2.2, 3, 4)},
    "131": {"title_en": "Respiratory Failure", "title_ar": "الفشل التنفسي", "department_en": "Critical Care", "department_ar": "العناية المركزة", "base_weight": (1.2, 1.75, 2.4, 3.2)},
    "138": {"title_en": "Cardiac Arrhythmia", "title_ar": "اضطراب نظم القلب", "department_en": "Cardiology", "department_ar": "أمراض القلب", "base_weight": (0.5, 0.7, 0.95, 1.25)},
    "140": {"title_en": "Chronic Obstructive Pulmonary Disease", "title_ar": "مرض الانسداد الرئوي المزمن", "department_en": "Pulmonology", "department_ar": "أمراض الرئة", "base_weight": (0.55, 0.8, 1.15, 1.55)},
    "141": {"title_en": "Asthma", "title_ar": "الربو", "department_en": "Pulmonology", "department_ar": "أمراض الرئة", "base_weight": (0.4, 0.55, 0.75, 1)},
    "143": {"title_en": "Chest Pain, Unspecified", "title_ar": "ألم الصدر غير المحدد", "department_en": "Emergency Medicine", "department_ar": "طب الطوارئ", "base_weight": (0.2, 0.3, 0.4, 0.55)},
    "175": {"title_en": "Pulmonary Embolism", "title_ar": "الانصمام الرئوي", "department_en": "Pulmonology", "department_ar": "أمراض الرئة", "base_weight": (1, 1.5, 2.1, 2.9)},
    "190": {"title_en": "Acute Myocardial Infarction", "title_ar": "احتشاء عضلة القلب الحاد", "department_en": "Cardiology", "department_ar": "أمراض القلب", "base_weight": (1.1, 1.6, 2.2, 3)},
    "194": {"title_en": "Cardiopulmonary Medical Management", "title_ar": "الإدارة الطبية لأمراض القلب والرئة", "department_en": "Internal Medicine", "department_ar": "الطب الباطني", "base_weight": (0.65, 0.95, 1.35, 1.9)},
    "200": {"title_en": "Hepatitis & Liver Inflammation", "title_ar": "التهاب الكبد", "department_en": "Gastroenterology", "department_ar": "أمراض الجهاز الهضمي", "base_weight": (0.5, 0.75, 1.05, 1.4)},
    "201": {"title_en": "Hypertension", "title_ar": "ارتفاع ضغط الدم", "department_en": "Cardiology", "department_ar": "أمراض القلب", "base_weight": (0.4, 0.6, 0.85, 1.15)},
    "205": {"title_en": "Cirrhosis & Chronic Liver Disease", "title_ar": "تليف الكبد ومرض الكبد المزمن", "department_en": "Gastroenterology", "department_ar": "أمراض الجهاز الهضمي", "base_weight": (0.8, 1.2, 1.7, 2.3)},
    "220": {"title_en": "Cholecystitis & Biliary Disease", "title_ar": "التهاب المرارة وأمراض القنوات الصفراوية", "department_en": "General Surgery", "department_ar": "الجراحة العامة", "base_weight": (0.55, 0.8, 1.1, 1.5)},
    "221": {"title_en": "Pancreatitis", "title_ar": "التهاب البنكرياس", "department_en": "Gastroenterology", "department_ar": "أمراض الجهاز الهضمي", "base_weight": (0.6, 0.9, 1.25, 1.7)},
    "246": {"title_en": "Abdominal Pain, Unspecified", "title_ar": "ألم البطن غير المحدد", "department_en": "Gastroenterology", "department_ar": "أمراض الجهاز الهضمي", "base_weight": (0.2, 0.3, 0.4, 0.55)},
    "249": {"title_en": "Gastroenteritis", "title_ar": "التهاب المعدة والأمعاء", "department_en": "Gastroenterology", "department_ar": "أمراض الجهاز الهضمي", "base_weight": (0.3, 0.45, 0.6, 0.8)},
    "254": {"title_en": "Bowel Obstruction", "title_ar": "الانسداد المعوي", "department_en": "General Surgery", "department_ar": "الجراحة العامة", "base_weight": (0.7, 1, 1.4, 1.9)},
    "261": {"title_en": "Appendectomy & Appendiceal Conditions", "title_ar": "استئصال الزائدة الدودية وحالاتها", "department_en": "General Surgery", "department_ar": "الجراحة العامة", "base_weight": (0.55, 0.8, 1.1, 1.5)},
    "280": {"title_en": "Gastrointestinal Hemorrhage", "title_ar": "نزيف الجهاز الهضمي", "department_en": "Gastroenterology", "department_ar": "أمراض الجهاز الهضمي", "base_weight": (0.9, 1.3, 1.85, 2.5)},
    "282": {"title_en": "Peptic Ulcer & Gastritis", "title_ar": "القرحة الهضمية والتهاب المعدة", "department_en": "Gastroenterology", "department_ar": "أمراض الجهاز الهضمي", "base_weight": (0.4, 0.6, 0.85, 1.15)},
    "300": {"title_en": "Osteoarthritis & Joint Disease", "title_ar": "الفصال العظمي وأمراض المفاصل", "department_en": "Orthopedics", "department_ar": "جراحة العظام", "base_weight": (0.3, 0.4, 0.55, 0.75)},
    "301": {"title_en": "Back Pain & Spine Disorders", "title_ar": "آلام الظهر واضطرابات العمود الفقري", "department_en": "Orthopedics", "department_ar": "جراحة العظام", "base_weight": (0.25, 0.35, 0.5, 0.65)},
    "302": {"title_en": "Fractures & Musculoskeletal Trauma", "title_ar": "الكسور وإصابات الجهاز العضلي الهيكلي", "department_en": "Orthopedics", "department_ar": "جراحة العظام", "base_weight": (0.5, 0.75, 1.05, 1.4)},
    "310": {"title_en": "Soft Tissue Injury", "title_ar": "إصابات الأنسجة الرخوة", "department_en": "Orthopedics", "department_ar": "جراحة العظام", "base_weight": (0.2, 0.3, 0.4, 0.55)},
    "350": {"title_en": "Burns", "title_ar": "الحروق", "department_en": "General Surgery", "department_ar": "الجراحة العامة", "base_weight": (0.7, 1.1, 1.6, 2.3)},
    "383": {"title_en": "Cellulitis & Skin Infections", "title_ar": "التهاب النسيج الخلوي وعدوى الجلد", "department_en": "Infectious Disease", "department_ar": "الأمراض المعدية", "base_weight": (0.4, 0.6, 0.85, 1.15)},
    "384": {"title_en": "Osteomyelitis", "title_ar": "التهاب العظم والنقي", "department_en": "Infectious Disease", "department_ar": "الأمراض المعدية", "base_weight": (0.65, 0.95, 1.35, 1.85)},
    "420": {"title_en": "Diabetes", "title_ar": "داء السكري", "department_en": "Endocrinology", "department_ar": "الغدد الصماء", "base_weight": (0.5, 0.7, 1, 1.4)},
    "447": {"title_en": "Obesity", "title_ar": "السمنة", "department_en": "Endocrinology", "department_ar": "الغدد الصماء", "base_weight": (0.15, 0.15, 0.15, 0.15)},
    "448": {"title_en": "Dehydration & Fluid Disorders", "title_ar": "الجفاف واضطرابات السوائل", "department_en": "Internal Medicine", "department_ar": "الطب الباطني", "base_weight": (0.3, 0.45, 0.6, 0.8)},
    "449": {"title_en": "Malnutrition", "title_ar": "سوء التغذية", "department_en": "Internal Medicine", "department_ar": "الطب الباطني", "base_weight": (0.4, 0.6, 0.85, 1.15)},
    "460": {"title_en": "Renal Failure", "title_ar": "الفشل الكلوي", "department_en": "Nephrology", "department_ar": "أمراض الكلى", "base_weight": (0.6, 0.9, 1.3, 1.8)},
    "461": {"title_en": "Acute Kidney Injury", "title_ar": "الإصابة الكلوية الحادة", "department_en": "Nephrology", "department_ar": "أمراض الكلى", "base_weight": (0.9, 1.3, 1.85, 2.5)},
    "465": {"title_en": "Kidney Stones", "title_ar": "حصوات الكلى", "department_en": "Urology", "department_ar": "المسالك البولية", "base_weight": (0.3, 0.4, 0.55, 0.75)},
    "466": {"title_en": "Urinary Tract Infection", "title_ar": "التهاب المسالك البولية", "department_en": "Urology", "department_ar": "المسالك البولية", "base_weight": (0.45, 0.65, 0.95, 1.3)},
    "468": {"title_en": "Diabetic Ketoacidosis", "title_ar": "الحماض الكيتوني السكري", "department_en": "Endocrinology", "department_ar": "الغدد الصماء", "base_weight": (1.1, 1.6, 2.2, 3)},
    "560": {"title_en": "Normal Delivery", "title_ar": "الولادة الطبيعية", "department_en": "Obstetrics & Gynecology", "department_ar": "النساء والولادة", "base_weight": (0.3, 0.3, 0.3, 0.3)},
    "561": {"title_en": "Cesarean Delivery", "title_ar": "الولادة القيصرية", "department_en": "Obstetrics & Gynecology", "department_ar": "النساء والولادة", "base_weight": (0.55, 0.7, 0.9, 1.15)},
    "570": {"title_en": "Preeclampsia & Eclampsia", "title_ar": "تسمم الحمل والإرجاج", "department_en": "Obstetrics & Gynecology", "department_ar": "النساء والولادة", "base_weight": (0.8, 1.2, 1.7, 2.3)},
    "580": {"title_en": "Miscarriage & Spontaneous Abortion", "title_ar": "الإجهاض التلقائي", "department_en": "Obstetrics & Gynecology", "department_ar": "النساء والولادة", "base_weight": (0.3, 0.45, 0.6, 0.8)},
    "630": {"title_en": "Neonatal Jaundice", "title_ar": "اليرقان الوليدي", "department_en": "Pediatrics", "department_ar": "طب الأطفال", "base_weight": (0.35, 0.5, 0.7, 0.95)},
    "631": {"title_en": "Febrile Seizure (Pediatric)", "title_ar": "التشنج الحروري", "department_en": "Pediatrics", "department_ar": "طب الأطفال", "base_weight": (0.3, 0.4, 0.55, 0.75)},
    "632": {"title_en": "Bronchiolitis (Pediatric)", "title_ar": "التهاب القصيبات", "department_en": "Pediatrics", "department_ar": "طب الأطفال", "base_weight": (0.4, 0.6, 0.85, 1.15)},
    "660": {"title_en": "Anemia", "title_ar": "فقر الدم", "department_en": "Hematology & Oncology", "department_ar": "أمراض الدم والأورام", "base_weight": (0.35, 0.5, 0.7, 0.95)},
    "690": {"title_en": "Malignancy / Oncology", "title_ar": "الأورام الخبيثة", "department_en": "Hematology & Oncology", "department_ar": "أمراض الدم والأورام", "base_weight": (1.2, 1.75, 2.4, 3.2)},
    "691": {"title_en": "Chemotherapy Encounter", "title_ar": "زيارة العلاج الكيميائي", "department_en": "Hematology & Oncology", "department_ar": "أمراض الدم والأورام", "base_weight": (0.5, 0.5, 0.5, 0.5)},
    "720": {"title_en": "Septicemia & Sepsis", "title_ar": "تعفن الدم والإنتان", "department_en": "Critical Care", "department_ar": "العناية المركزة", "base_weight": (1.3, 1.9, 2.7, 3.8)},
    "750": {"title_en": "Depression & Mood Disorders", "title_ar": "الاكتئاب واضطرابات المزاج", "department_en": "Psychiatry", "department_ar": "الطب النفسي", "base_weight": (0.35, 0.5, 0.7, 0.95)},
    "751": {"title_en": "Anxiety Disorders", "title_ar": "اضطرابات القلق", "department_en": "Psychiatry", "department_ar": "الطب النفسي", "base_weight": (0.25, 0.35, 0.5, 0.65)},
    "755": {"title_en": "Substance Use Disorder", "title_ar": "اضطراب تعاطي المواد", "department_en": "Psychiatry", "department_ar": "الطب النفسي", "base_weight": (0.45, 0.65, 0.9, 1.2)},
    "780": {"title_en": "COVID-19 & Viral Respiratory Infection", "title_ar": "كوفيد-19 وعدوى الجهاز التنفسي الفيروسية", "department_en": "Infectious Disease", "department_ar": "الأمراض المعدية", "base_weight": (0.55, 0.8, 1.15, 1.55)},
    "790": {"title_en": "Tuberculosis", "title_ar": "السل", "department_en": "Infectious Disease", "department_ar": "الأمراض المعدية", "base_weight": (0.6, 0.9, 1.25, 1.7)},
    "890": {"title_en": "Endocrine & Thyroid Disorders", "title_ar": "اضطرابات الغدد الصماء والدرقية", "department_en": "Endocrinology", "department_ar": "الغدد الصماء", "base_weight": (0.3, 0.45, 0.6, 0.8)},
    "895": {"title_en": "Electrolyte Imbalance", "title_ar": "اختلال توازن الشوارد", "department_en": "Nephrology", "department_ar": "أمراض الكلى", "base_weight": (0.4, 0.6, 0.85, 1.15)},
    "999": {"title_en": "Unspecified Medical Encounter", "title_ar": "زيارة طبية غير محددة", "department_en": "General Medicine", "department_ar": "الطب العام", "base_weight": (0.5, 0.7, 0.95, 1.25)},
    "045": {"title_en": "Cerebrovascular Disorders", "title_ar": "الاضطرابات الدماغية الوعائية", "department_en": "Neurology", "department_ar": "الأعصاب", "base_weight": (0.9, 1.3, 1.85, 2.5)},
    "056": {"title_en": "Syncope & Dizziness", "title_ar": "الإغماء والدوخة", "department_en": "Emergency Medicine", "department_ar": "طب الطوارئ", "base_weight": (0.3, 0.45, 0.6, 0.8)},
    "065": {"title_en": "Seizure & Epilepsy", "title_ar": "الصرع والنوبات التشنجية", "department_en": "Neurology", "department_ar": "الأعصاب", "base_weight": (0.45, 0.65, 0.9, 1.2)},
    "070": {"title_en": "Central Nervous System Infections", "title_ar": "عدوى الجهاز العصبي المركزي", "department_en": "Neurology", "department_ar": "الأعصاب", "base_weight": (1, 1.5, 2.1, 2.9)},
    "024": {"title_en": "Transient Ischemic Attack", "title_ar": "نوبة إقفارية دماغية عابرة", "department_en": "Neurology", "department_ar": "الأعصاب", "base_weight": (0.6, 0.85, 1.15, 1.5)},
    "050": {"title_en": "Headache & Migraine", "title_ar": "الصداع والشقيقة", "department_en": "Neurology", "department_ar": "الأعصاب", "base_weight": (0.2, 0.3, 0.4, 0.55)},
    "AMB": {"title_en": "Ambulatory / Minor Encounter", "title_ar": "زيارة عيادات خارجية بسيطة", "department_en": "General Medicine", "department_ar": "الطب العام", "base_weight": (0.15, 0.15, 0.15, 0.15)},
}



def _tier_from_score(score: int) -> int:
    if score >= 5:
        return 4
    if score >= 3:
        return 3
    if score >= 1:
        return 2
    return 1


def group_encounter(
    principal_code: str,
    secondary_codes: Optional[List[str]] = None,
    procedure_codes: Optional[List[str]] = None,
    age: Optional[float] = None,
    encounter_type: str = "INPATIENT",
    poa_exclusions: Optional[List[str]] = None,
) -> DrgResult:
    """poa_exclusions: secondary diagnosis codes confirmed (via the
    refinement wizard's Present-On-Admission questions) to have developed
    *during* this stay rather than being present at admission. Still listed
    among the secondary diagnoses for documentation completeness, but
    excluded from the SOI/ROM contribution — see shared/drg-grouper.ts."""
    secondary_codes = secondary_codes or []
    procedure_codes = procedure_codes or []
    poa_exclusion_set = set(poa_exclusions or [])
    principal_entry = find_lexicon_entry(principal_code)
    family = principal_entry["drg_family"] if principal_entry else "999"
    family_meta = DRG_FAMILY_TABLE.get(family, DRG_FAMILY_TABLE["999"])
    unique_secondary = list(dict.fromkeys(c for c in secondary_codes if c != principal_code))
    all_secondary_entries = [e for e in (find_lexicon_entry(c) for c in unique_secondary) if e]
    secondary_entries = [e for e in all_secondary_entries if e["code"] not in poa_exclusion_set]
    excluded_entries = [e for e in all_secondary_entries if e["code"] in poa_exclusion_set]
    explanation_en: List[str] = []
    explanation_ar: List[str] = []
    principal_soi = round_half_up(principal_entry["soi_weight"] * 0.5) if principal_entry else 0
    principal_rom = round_half_up(principal_entry["rom_weight"] * 0.5) if principal_entry else 0
    if principal_entry:
        explanation_en.append(
            f'Principal diagnosis "{principal_entry["desc_en"]}" ({principal_code}) anchors DRG family {family} '
            f'and contributes {principal_soi} SOI / {principal_rom} ROM point(s).'
        )
        explanation_ar.append(
            f'التشخيص الأساسي "{principal_entry["desc_ar"]}" ({principal_code}) يحدد فئة DRG رقم {family} '
            f'ويساهم بـ {principal_soi} نقطة شدة و {principal_rom} نقطة خطر وفاة.'
        )
    else:
        explanation_en.append(f"No lexicon match for principal code {principal_code}; falling back to family {family}.")
        explanation_ar.append(f"لا توجد مطابقة في المعجم للرمز الأساسي {principal_code}؛ تم استخدام الفئة الافتراضية {family}.")
    soi_score = principal_soi + sum(e["soi_weight"] for e in secondary_entries)
    rom_score = principal_rom + sum(e["rom_weight"] for e in secondary_entries)
    if secondary_entries:
        soi_sum = sum(e["soi_weight"] for e in secondary_entries)
        rom_sum = sum(e["rom_weight"] for e in secondary_entries)
        codes_joined = ", ".join(e["code"] for e in secondary_entries)
        explanation_en.append(f"{len(secondary_entries)} secondary diagnosis(es) ({codes_joined}) add {soi_sum} SOI / {rom_sum} ROM point(s).")
        explanation_ar.append(f"{len(secondary_entries)} تشخيص(ات) ثانوية ({codes_joined}) تضيف {soi_sum} نقطة شدة و {rom_sum} نقطة خطر وفاة.")
    if excluded_entries:
        excluded_codes_joined = ", ".join(e["code"] for e in excluded_entries)
        explanation_en.append(
            f"{len(excluded_entries)} secondary diagnosis(es) ({excluded_codes_joined}) were confirmed as not present "
            "on admission — excluded from the admission-severity score and flagged for hospital-acquired complication review."
        )
        explanation_ar.append(
            f"{len(excluded_entries)} تشخيص(ات) ثانوية ({excluded_codes_joined}) تم تأكيد عدم وجودها عند الدخول — "
            "استُبعدت من درجة شدة الحالة عند الدخول وتم وضع علامة عليها لمراجعة المضاعفات المكتسبة داخل المستشفى."
        )
    if age is not None:
        if age >= 75:
            rom_score += 2
            explanation_en.append(f"Age {age} (≥75) adds 2 ROM points.")
            explanation_ar.append(f"العمر {age} (≥75) يضيف نقطتي خطر وفاة.")
        elif age >= 65:
            rom_score += 1
            explanation_en.append(f"Age {age} (≥65) adds 1 ROM point.")
            explanation_ar.append(f"العمر {age} (≥65) يضيف نقطة خطر وفاة واحدة.")
        if age < 1:
            rom_score += 1
            explanation_en.append("Neonatal age (<1 year) adds 1 ROM point.")
            explanation_ar.append("عمر حديثي الولادة (أقل من سنة) يضيف نقطة خطر وفاة واحدة.")
    soi = _tier_from_score(soi_score)
    rom = _tier_from_score(rom_score)
    explanation_en.append(f"Severity score {soi_score} → SOI tier {soi}; mortality score {rom_score} → ROM tier {rom}.")
    explanation_ar.append(f"درجة الشدة {soi_score} ← المستوى {soi}؛ درجة خطر الوفاة {rom_score} ← المستوى {rom}.")
    methodology = "BrainSAIT-EAPG" if encounter_type == "OUTPATIENT" else "BrainSAIT-APR-DRG"
    # Medical vs. Surgical partition: a matching OR procedure materially
    # upgrades resource consumption within the same clinical category, exactly
    # as real APR-DRG methodology partitions each DRG into Medical/Surgical.
    matching_procedures = [
        p for p in (find_procedure_entry(c) for c in dict.fromkeys(procedure_codes)) if p and family in p["surgical_families"]
    ]
    chosen_procedure = max(matching_procedures, key=lambda p: p["weight_multiplier"], default=None)
    partition = "Surgical" if chosen_procedure else "Medical"
    base_weight = family_meta["base_weight"][soi - 1]
    relative_weight = round(base_weight * chosen_procedure["weight_multiplier"], 3) if chosen_procedure else base_weight
    if chosen_procedure:
        explanation_en.append(
            f'Procedure "{chosen_procedure["desc_en"]}" detected → Surgical partition, relative weight '
            f'×{chosen_procedure["weight_multiplier"]} ({base_weight} → {relative_weight}).'
        )
        explanation_ar.append(
            f'تم رصد إجراء "{chosen_procedure["desc_ar"]}" ← القسم الجراحي، الوزن النسبي '
            f'×{chosen_procedure["weight_multiplier"]} ({base_weight} ← {relative_weight}).'
        )
    else:
        explanation_en.append(f"No matching OR procedure detected → Medical partition, relative weight {relative_weight}.")
        explanation_ar.append(f"لم يتم رصد إجراء جراحي مطابق ← القسم الطبي، الوزن النسبي {relative_weight}.")
    return {
        "code": family,
        "title_en": family_meta["title_en"],
        "title_ar": family_meta["title_ar"],
        "department_en": family_meta["department_en"],
        "department_ar": family_meta["department_ar"],
        "soi": soi,
        "rom": rom,
        "relative_weight": relative_weight,
        "subclass": f"{family}-{'S' if partition == 'Surgical' else 'M'}-{soi}",
        "methodology": methodology,
        "partition": partition,
        "procedure": (
            {"code": chosen_procedure["code"], "desc_en": chosen_procedure["desc_en"], "desc_ar": chosen_procedure["desc_ar"]}
            if chosen_procedure
            else None
        ),
        "explanation": {"en": explanation_en, "ar": explanation_ar},
    }


def compute_case_mix_index(relative_weights: List[float]) -> float:
    if not relative_weights:
        return 0.0
    return round(sum(relative_weights) / len(relative_weights), 3)


class DepartmentCaseMixRow(TypedDict):
    department_en: str
    department_ar: str
    encounter_count: int
    case_mix_index: float


# The full set of clinical departments a DRG family can route to.
DEPARTMENTS: List[Dict[str, str]] = sorted(
    {meta["department_en"]: {"en": meta["department_en"], "ar": meta["department_ar"]} for meta in DRG_FAMILY_TABLE.values()}.values(),
    key=lambda d: d["en"],
)


def compute_department_distribution(results: List[DrgResult]) -> List[DepartmentCaseMixRow]:
    """Breaks a set of grouped encounters down by owning clinical department, each with its own Case Mix Index."""
    by_dept: Dict[str, Dict[str, object]] = {}
    for r in results:
        bucket = by_dept.setdefault(r["department_en"], {"department_ar": r["department_ar"], "weights": []})
        bucket["weights"].append(r["relative_weight"])  # type: ignore[union-attr]
    rows = [
        {
            "department_en": dept_en,
            "department_ar": bucket["department_ar"],
            "encounter_count": len(bucket["weights"]),
            "case_mix_index": round(sum(bucket["weights"]) / len(bucket["weights"]), 3),
        }
        for dept_en, bucket in by_dept.items()
    ]
    rows.sort(key=lambda r: r["encounter_count"], reverse=True)
    return rows
