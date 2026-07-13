/**
 * BrainSAIT UI translation dictionary (EN / AR).
 * Every key maps to both languages so `useLanguage().t(key)` is fully typed
 * and can never silently fall back to a missing string.
 */
export const TRANSLATIONS = {
  // --- Brand / shell ---
  appName: { en: 'BrainSAIT DRG Suite', ar: 'جناح برينسايت لتصنيف DRG' },
  tagline: { en: 'Automated DRG & ICD Coding for Saudi Healthcare', ar: 'ترميز DRG و ICD آلي للرعاية الصحية السعودية' },
  // --- Language toggle ---
  switchToArabic: { en: 'العربية', ar: 'العربية' },
  switchToEnglish: { en: 'English', ar: 'English' },
  // --- Nav ---
  'nav.dashboard': { en: 'Dashboard', ar: 'لوحة التحكم' },
  'nav.codingWorkspace': { en: 'Coding Workspace', ar: 'مساحة الترميز' },
  'nav.claimsManager': { en: 'Claims Manager', ar: 'إدارة المطالبات' },
  'nav.cdiNudges': { en: 'CDI Nudges', ar: 'تنبيهات سلامة التوثيق' },
  'nav.integration': { en: 'Integration', ar: 'التكامل' },
  'nav.auditReconciliation': { en: 'Audit & Reconciliation', ar: 'التدقيق والمطابقة' },
  'nav.admin': { en: 'Admin', ar: 'الإدارة' },
  'nav.logout': { en: 'Logout', ar: 'تسجيل الخروج' },
  'nav.welcome': { en: 'Welcome', ar: 'مرحبًا' },
  'nav.loggedInAs': { en: 'Logged in as', ar: 'تم تسجيل الدخول باسم' },
  // --- Common ---
  'common.ingestNote': { en: 'Ingest Note', ar: 'إدخال ملاحظة' },
  'common.viewDashboard': { en: 'View Dashboard', ar: 'عرض لوحة التحكم' },
  'common.cancel': { en: 'Cancel', ar: 'إلغاء' },
  'common.loading': { en: 'Loading…', ar: 'جارٍ التحميل…' },
  // --- HomePage ---
  'home.heroSubtitle': { en: 'Automated DRG & ICD Coding for Saudi Healthcare', ar: 'ترميز DRG و ICD آلي للرعاية الصحية السعودية' },
  'home.heroDescription': {
    en: 'A bilingual (Arabic/English), SOC2+ compliant AI engine that understands mixed-language Saudi clinical notes, groups encounters with an explainable APR-DRG methodology, automates nphies claim submissions, and closes documentation gaps in real time — in the clinician\'s own language.',
    ar: 'محرك ذكاء اصطناعي ثنائي اللغة (عربي/إنجليزي) ومتوافق مع SOC2+ يفهم الملاحظات السريرية السعودية المتداخلة اللغة، ويصنّف الزيارات باستخدام منهجية APR-DRG قابلة للتفسير، ويؤتمت تقديم المطالبات إلى نفيس، ويغلق فجوات التوثيق فوريًا — بلغة الطبيب نفسها.',
  },
  'home.ctaIngest': { en: 'Ingest Note & Start Demo', ar: 'إدخال ملاحظة وبدء العرض' },
  'home.ctaDashboard': { en: 'View Dashboard', ar: 'عرض لوحة التحكم' },
  'home.sectionTitle': { en: 'A Complete Bilingual Revenue Cycle Platform', ar: 'منصة متكاملة ثنائية اللغة لدورة الإيرادات' },
  'home.sectionSubtitle': {
    en: 'From code-switched clinical documentation to the final DRG, all in one place.',
    ar: 'من التوثيق السريري متعدد اللغات إلى ترميز DRG النهائي، كل ذلك في مكان واحد.',
  },
  'home.feature.coding.title': { en: 'Bilingual Code-Switching AI', ar: 'ذكاء اصطناعي ثنائي اللغة لتبديل اللغة' },
  'home.feature.coding.desc': {
    en: 'Reads mixed Arabic/English clinical notes in one pass and assigns ICD-10-AM codes with bilingual justification — CAC, Semi-Autonomous, and Fully Autonomous.',
    ar: 'يقرأ الملاحظات السريرية العربية/الإنجليزية المتداخلة دفعة واحدة ويحدد رموز ICD-10-AM مع تبرير ثنائي اللغة — بمراحل CAC وشبه المستقل والمستقل الكامل.',
  },
  'home.feature.drg.title': { en: 'APR-DRG & EAPG Grouper', ar: 'مصنّف APR-DRG وEAPG المبسّط' },
  'home.feature.drg.desc': {
    en: 'A transparent, explainable grouper computes Severity of Illness (SOI) and Risk of Mortality (ROM) from every diagnosis, driving a real Case Mix Index.',
    ar: 'مصنّف شفاف وقابل للتفسير يحسب درجة شدة المرض (SOI) وخطر الوفاة (ROM) من كل تشخيص، ليقود مؤشر مزيج حالات حقيقي.',
  },
  'home.feature.cdi.title': { en: "CDI 'Engage One' Nudges", ar: 'تنبيهات سلامة التوثيق السريري' },
  'home.feature.cdi.desc': {
    en: 'Proactively prompts clinicians — in Arabic or English — for greater specificity at the point of documentation, quantified in SOI points.',
    ar: 'يحث الأطباء استباقيًا — بالعربية أو الإنجليزية — على مزيد من الدقة عند التوثيق، مع تحديد الأثر بنقاط شدة المرض (SOI).',
  },
  'home.feature.nphies.title': { en: 'nphies Integration', ar: 'التكامل مع نفيس' },
  'home.feature.nphies.desc': {
    en: 'Seamlessly submit claims, check statuses, and manage pre-authorizations with our secure, compliant connector.',
    ar: 'إرسال المطالبات والتحقق من الحالات وإدارة طلبات الموافقة المسبقة بسلاسة عبر موصل آمن ومتوافق.',
  },
  'home.feature.claims.title': { en: 'Claims Management', ar: 'إدارة المطالبات' },
  'home.feature.claims.desc': {
    en: 'A centralized console to track, filter, and manage the entire lifecycle of your claims.',
    ar: 'وحدة تحكم مركزية لتتبع وتصفية وإدارة دورة حياة المطالبات بالكامل.',
  },
  'home.feature.audit.title': { en: 'Audit & Reconciliation', ar: 'التدقيق والمطابقة' },
  'home.feature.audit.desc': {
    en: 'Streamline payment posting and reconciliation with robust audit trails for SOC2 compliance.',
    ar: 'تبسيط ترحيل الدفعات ومطابقتها مع سجلات تدقيق قوية للامتثال لمعيار SOC2.',
  },
  'home.modal.title': { en: 'Ingest a Clinical Note', ar: 'إدخال ملاحظة سريرية' },
  'home.modal.description': {
    en: 'Paste an unstructured clinical note in Arabic, English, or both. The bilingual engine will assign codes, group the encounter, and redirect you to the Coding Workspace.',
    ar: 'الصق ملاحظة سريرية غير منظمة بالعربية أو الإنجليزية أو كليهما. سيقوم المحرك ثنائي اللغة بتحديد الرموز وتصنيف الزيارة ثم تحويلك إلى مساحة الترميز.',
  },
  'home.modal.placeholder': {
    en: 'e.g., Patient with sukari symptoms, ضغط دم مرتفع controlled with medication...',
    ar: 'مثال: مريض يعاني من أعراض السكري، ضغط دم مرتفع تحت السيطرة بالأدوية...',
  },
  'home.modal.analyze': { en: 'Analyze Note', ar: 'تحليل الملاحظة' },
  'home.modal.analyzing': { en: 'Analyzing…', ar: 'جارٍ التحليل…' },
  'home.footer': { en: 'Built for the Saudi healthcare ecosystem', ar: 'صُمم لمنظومة الرعاية الصحية السعودية' },
  // --- Coding Workspace ---
  'coding.title': { en: 'Coding Workspace', ar: 'مساحة الترميز' },
  'coding.clinicalNote': { en: 'Clinical Note', ar: 'الملاحظة السريرية' },
  'coding.suggestedCodes': { en: 'AI-Suggested Codes', ar: 'الرموز المقترحة بالذكاء الاصطناعي' },
  'coding.code': { en: 'Code', ar: 'الرمز' },
  'coding.description': { en: 'Description', ar: 'الوصف' },
  'coding.confidence': { en: 'Confidence', ar: 'الثقة' },
  'coding.actions': { en: 'Actions', ar: 'الإجراءات' },
  'coding.acceptAll': { en: 'Accept All', ar: 'قبول الكل' },
  'coding.codesAccepted': { en: 'Codes Accepted', ar: 'تم قبول الرموز' },
  'coding.submitClaim': { en: 'Submit Claim', ar: 'إرسال المطالبة' },
  'coding.noNote': { en: 'No clinical note available. Please ingest a note from the home page.', ar: 'لا توجد ملاحظة سريرية متاحة. يرجى إدخال ملاحظة من الصفحة الرئيسية.' },
  'coding.noCodes': { en: 'No codes suggested for this note.', ar: 'لا توجد رموز مقترحة لهذه الملاحظة.' },
  'coding.ingestNew': { en: 'Ingest a New Note', ar: 'إدخال ملاحظة جديدة' },
  'coding.principal': { en: 'Principal', ar: 'أساسي' },
  'coding.secondary': { en: 'Secondary', ar: 'ثانوي' },
  'coding.drgTitle': { en: 'APR-DRG Grouping', ar: 'تصنيف APR-DRG المبسّط' },
  'coding.soi': { en: 'Severity of Illness (SOI)', ar: 'درجة شدة المرض (SOI)' },
  'coding.rom': { en: 'Risk of Mortality (ROM)', ar: 'خطر الوفاة (ROM)' },
  'coding.relativeWeight': { en: 'Relative Weight', ar: 'الوزن النسبي' },
  'coding.methodology': { en: 'Methodology', ar: 'المنهجية' },
  'coding.detectedLanguage': { en: 'Detected language', ar: 'اللغة المكتشفة' },
  'lang.en': { en: 'English', ar: 'الإنجليزية' },
  'lang.ar': { en: 'Arabic', ar: 'العربية' },
  'lang.mixed': { en: 'Mixed (code-switched)', ar: 'مختلطة (تبديل لغوي)' },
  // --- CDI Nudges ---
  'cdi.title': { en: 'CDI Nudges Console', ar: 'وحدة تنبيهات سلامة التوثيق' },
  'cdi.description': { en: 'Review and action real-time, bilingual Clinical Documentation Integrity prompts.', ar: 'مراجعة واتخاذ إجراء بشأن تنبيهات سلامة التوثيق السريري ثنائية اللغة والفورية.' },
  'cdi.filter.all': { en: 'All Nudges', ar: 'جميع التنبيهات' },
  'cdi.filter.active': { en: 'Active', ar: 'نشطة' },
  'cdi.filter.resolved': { en: 'Resolved', ar: 'تم حلها' },
  'cdi.filter.dismissed': { en: 'Dismissed', ar: 'تم تجاهلها' },
  'cdi.severity': { en: 'Severity', ar: 'الخطورة' },
  'cdi.prompt': { en: 'Prompt', ar: 'التنبيه' },
  'cdi.encounter': { en: 'Encounter', ar: 'الزيارة' },
  'cdi.created': { en: 'Created', ar: 'تاريخ الإنشاء' },
  'cdi.actions': { en: 'Actions', ar: 'الإجراءات' },
  'cdi.apply': { en: 'Apply Suggestion', ar: 'تطبيق الاقتراح' },
  'cdi.dismiss': { en: 'Dismiss Nudge', ar: 'تجاهل التنبيه' },
  'cdi.empty': { en: 'No nudges found for the selected filter.', ar: 'لا توجد تنبيهات مطابقة للتصفية المحددة.' },
  'cdi.soiImpact': { en: 'SOI impact', ar: 'الأثر على درجة الشدة' },
  // --- Dashboard ---
  'dashboard.totalClaims': { en: 'Total Claims Value', ar: 'إجمالي قيمة المطالبات' },
  'dashboard.avgAccuracy': { en: 'Avg. Coding Accuracy', ar: 'متوسط دقة الترميز' },
  'dashboard.pendingJobs': { en: 'Pending Coding Jobs', ar: 'مهام الترميز المعلقة' },
  'dashboard.activeNudges': { en: 'Active CDI Nudges', ar: 'تنبيهات سلامة التوثيق النشطة' },
  'dashboard.caseMixIndex': { en: 'Case Mix Index (CMI)', ar: 'مؤشر مزيج الحالات (CMI)' },
  'dashboard.recentClaims': { en: 'Recent Claims', ar: 'أحدث المطالبات' },
  'dashboard.recentClaimsDesc': { en: 'A view of the latest claims processed by the system.', ar: 'عرض لأحدث المطالبات التي عالجها النظام.' },
  'dashboard.claimNumber': { en: 'Claim #', ar: 'رقم المطالبة' },
  'dashboard.status': { en: 'Status', ar: 'الحالة' },
  'dashboard.amount': { en: 'Amount', ar: 'المبلغ' },
  'dashboard.claimStatusOverview': { en: 'Claim Status Overview', ar: 'نظرة عامة على حالة المطالبات' },
  'dashboard.approvedVsRejected': { en: 'Approved vs. Rejected claims.', ar: 'المطالبات المعتمدة مقابل المرفوضة.' },
  'dashboard.noRecentClaims': { en: 'No recent claims found.', ar: 'لا توجد مطالبات حديثة.' },
  // --- Login ---
  'login.title': { en: 'Sign in to BrainSAIT', ar: 'تسجيل الدخول إلى برينسايت' },
  'login.username': { en: 'Username', ar: 'اسم المستخدم' },
  'login.password': { en: 'Password', ar: 'كلمة المرور' },
  'login.submit': { en: 'Sign In', ar: 'تسجيل الدخول' },
  // --- Claims Manager ---
  'claims.title': { en: 'Claims Manager', ar: 'إدارة المطالبات' },
  'claims.description': { en: 'Track, filter, and manage the lifecycle of every claim.', ar: 'تتبع المطالبات وتصفيتها وإدارة دورة حياتها.' },
  // --- Integration Console ---
  'integration.title': { en: 'Integration Console', ar: 'وحدة التكامل' },
  'integration.description': { en: 'Monitor the nphies connector and the bilingual data mapping table.', ar: 'مراقبة موصل نفيس وجدول تعيين البيانات ثنائي اللغة.' },
  'integration.fieldMapTitle': { en: 'BrainSAIT ↔ nphies/Etimad Field Mapping', ar: 'تعيين الحقول بين برينسايت ونفيس/اعتماد' },
  'integration.concept': { en: 'BrainSAIT Concept', ar: 'مفهوم برينسايت' },
  'integration.targetField': { en: 'nphies Target Field', ar: 'حقل نفيس المستهدف' },
  'integration.source': { en: 'Source', ar: 'المصدر' },
  // --- Audit & Reconciliation ---
  'audit.title': { en: 'Audit & Reconciliation', ar: 'التدقيق والمطابقة' },
  'audit.description': { en: 'SOC2-ready audit trails and payment reconciliation.', ar: 'سجلات تدقيق جاهزة لمعيار SOC2 ومطابقة المدفوعات.' },
} as const;
export type TranslationKey = keyof typeof TRANSLATIONS;
export type Language = 'en' | 'ar';
export function translate(key: TranslationKey, lang: Language): string {
  return TRANSLATIONS[key][lang];
}
