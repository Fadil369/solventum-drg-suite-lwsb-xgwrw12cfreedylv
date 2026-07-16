import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Zap, ShieldCheck, ArrowRight, Database, Scale, Stethoscope, Lightbulb, LogIn, RotateCcw, Building2,
  Activity, HeartPulse, Scale3d, Scissors, Languages, TrendingUp, CheckCircle2, Upload, Sparkles, Clock, AlertCircle,
  HelpCircle, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Toaster, toast } from 'sonner';
import { api } from '@/lib/api-client';
import { motion } from 'framer-motion';
import type { CodingJob, HospitalBranchId } from '@shared/types';
import type { DemoAnalysisResult } from '@shared/coding-engine';
import { HOSPITAL_BRANCHES } from '@shared/hospital-branches';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
const DEMO_NOTE_MAX_LENGTH = 4000;
// Three bilingual samples chosen to showcase the flagship differentiator —
// same-sentence Arabic/English code-switching — without requiring a visitor
// to have a real clinical note handy to try the public demo.
const EXAMPLE_NOTES: { label_en: string; label_ar: string; text: string }[] = [
  {
    label_en: 'English',
    label_ar: 'إنجليزي',
    text: 'Patient presents with acute myocardial infarction, EKG confirms STEMI. History of hypertension crisis, well controlled currently on medication.',
  },
  {
    label_en: 'Arabic',
    label_ar: 'عربي',
    text: 'مريض يعاني من التهاب رئوي بكتيري مع سعال شديد وحمى، وكسر في الساق اليسرى بعد سقوط.',
  },
  {
    label_en: 'Mixed (code-switched)',
    label_ar: 'مختلط (تبديل لغوي)',
    text: 'Patient known case of sukari, presents with ضغط دم مرتفع and suspected appendicitis, ألم شديد في الزائدة الدودية مع حمى.',
  },
];
const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <Card className="text-center bg-card/50 backdrop-blur-sm floating-card">
    <CardHeader>
      <div className="mx-auto bg-primary/10 text-primary rounded-lg w-12 h-12 flex items-center justify-center mb-4">
        {icon}
      </div>
      <CardTitle className="text-xl font-semibold">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);
export function HomePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [branch, setBranch] = useState<HospitalBranchId | ''>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [demoResult, setDemoResult] = useState<DemoAnalysisResult | null>(null);
  const [priorResult, setPriorResult] = useState<DemoAnalysisResult | null>(null);
  const [wizardActive, setWizardActive] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardAnswers, setWizardAnswers] = useState<string[]>([]);
  const [isRefining, setIsRefining] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { t, language, isRtl } = useLanguage();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const resetModal = () => {
    setDemoResult(null);
    setPriorResult(null);
    setWizardActive(false);
    setWizardStep(0);
    setWizardAnswers([]);
    setNoteText('');
  };
  const startRefinementWizard = () => {
    setWizardStep(0);
    setWizardAnswers([]);
    setWizardActive(true);
  };
  const submitRefinement = async (answers: string[]) => {
    setWizardActive(false);
    if (answers.length === 0) return; // every question was skipped — nothing to refine
    setIsRefining(true);
    try {
      const refined = await api<DemoAnalysisResult>('/api/demo/refine-note', {
        method: 'POST',
        body: JSON.stringify({ clinical_note: noteText, answers }),
      });
      setPriorResult(demoResult);
      setDemoResult(refined);
      toast.success(isRtl ? 'تم تحسين الترميز بناءً على إجاباتك.' : 'Coding refined based on your answers.');
    } catch (error) {
      toast.error(isRtl ? 'تعذر تحسين الترميز.' : 'Failed to refine coding.', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsRefining(false);
    }
  };
  const answerWizardQuestion = (answerText: string | null) => {
    const nextAnswers = answerText ? [...wizardAnswers, answerText] : wizardAnswers;
    setWizardAnswers(nextAnswers);
    const totalQuestions = demoResult?.questions.length ?? 0;
    if (wizardStep + 1 < totalQuestions) {
      setWizardStep(wizardStep + 1);
    } else {
      void submitRefinement(nextAnswers);
    }
  };
  // Plain text only for now — real PDF/image OCR needs a dedicated parsing
  // pipeline this pass doesn't build; reading a .txt file client-side is
  // simple, safe (no server-side file handling of untrusted uploads at all),
  // and covers the common case of a report already exported/copied as text.
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.txt') && file.type !== 'text/plain') {
      toast.error(isRtl ? 'صيغة الملف غير مدعومة' : 'Unsupported file type', {
        description: isRtl
          ? 'يدعم الرفع حالياً ملفات نصية (.txt) فقط. الصق النص مباشرة للصيغ الأخرى.'
          : 'Upload currently supports plain text (.txt) files only. Paste the text directly for other formats.',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const truncated = text.length > DEMO_NOTE_MAX_LENGTH;
      setNoteText(text.slice(0, DEMO_NOTE_MAX_LENGTH));
      if (truncated) {
        toast.info(isRtl ? 'تم اقتطاع النص' : 'Text truncated', {
          description: isRtl
            ? `تم الاحتفاظ بأول ${DEMO_NOTE_MAX_LENGTH} حرفًا فقط لمعاينة العرض التجريبي.`
            : `Only the first ${DEMO_NOTE_MAX_LENGTH} characters were kept for the public preview.`,
        });
      }
    };
    reader.onerror = () => {
      toast.error(isRtl ? 'فشلت قراءة الملف.' : 'Failed to read the file.');
    };
    reader.readAsText(file);
  };
  const handleAnalyze = async () => {
    if (!noteText.trim()) {
      toast.error(isRtl ? 'يرجى لصق ملاحظة سريرية للتحليل.' : 'Please paste a clinical note to analyze.');
      return;
    }
    setIsAnalyzing(true);
    try {
      // Signed-in users get the real, persisted workflow. A visitor who
      // isn't signed in previously hit this same call, got a 401 from the
      // server, and was silently bounced to /login with a confusing
      // "Session Expired" message — even though they'd never had a session.
      // They now get a genuine, unauthenticated preview instead: same coding
      // engine, no data persisted, with a clear path to sign in for the full
      // Coding Workspace.
      if (isAuthenticated) {
        const response = await api<CodingJob>('/api/ingest-note', {
          method: 'POST',
          body: JSON.stringify({ clinical_note: noteText, branch: branch || undefined }),
        });
        toast.success(isRtl ? 'تم إدخال الملاحظة بنجاح!' : 'Note ingested successfully!', {
          description: isRtl ? 'يتم تحويلك إلى مساحة الترميز لعرض النتائج.' : 'Redirecting to the Coding Workspace to see the results.',
        });
        setIsModalOpen(false);
        navigate('/coding-workspace', { state: { codingJob: response } });
      } else {
        const result = await api<DemoAnalysisResult>('/api/demo/analyze-note', {
          method: 'POST',
          body: JSON.stringify({ clinical_note: noteText }),
        });
        setDemoResult(result);
      }
    } catch (error) {
      // Keep the dialog open (and the typed note intact) on failure — closing
      // it here previously threw away the physician's note on every error,
      // forcing them to retype it before they could even try again.
      toast.error(isRtl ? 'فشل إدخال الملاحظة.' : 'Failed to ingest note.', {
        description: error instanceof Error ? error.message : (isRtl ? 'حدث خطأ غير معروف.' : 'An unknown error occurred.'),
        action: { label: isRtl ? 'إعادة المحاولة' : 'Retry', onClick: () => { void handleAnalyze(); } },
      });
    } finally {
      setIsAnalyzing(false);
    }
  };
  return (
    <div className="min-h-screen w-full bg-background text-foreground relative overflow-x-hidden">
      <div className="fixed top-4 end-4 z-50 flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle className="relative top-0 right-0" />
      </div>
      <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center absolute top-0 start-0 end-0 z-40">
        <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-primary" />
            <span className="text-lg font-bold font-display">{t('appName')}</span>
        </div>
        <nav className="hidden md:flex items-center gap-2">
            <Button variant="ghost" asChild><Link to="/dashboard">{t('nav.dashboard')}</Link></Button>
            <Button variant="ghost" asChild><Link to="/claims-manager">{t('nav.claimsManager')}</Link></Button>
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-8 md:py-10 lg:py-12">
          <section className="relative min-h-screen flex items-center justify-center text-center py-20 md:py-28 lg:py-32">
            <div className="absolute inset-0 -z-10 h-full w-full bg-background bg-[radial-gradient(#0E5FFF_1px,transparent_1px)] [background-size:32px_32px] opacity-20"></div>
            <div className="absolute inset-0 bg-gradient-primary/10 -z-10"></div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-bold text-balance leading-tight bg-clip-text text-transparent bg-gradient-primary">
                {t('appName')}
              </h1>
              <p className="text-xl md:text-2xl font-display text-foreground/90">
                {t('home.heroSubtitle')}
              </p>
              <p className="max-w-3xl mx-auto text-lg text-muted-foreground text-pretty">
                {t('home.heroDescription')}
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6">
                <Button
                  size="lg"
                  onClick={() => setIsModalOpen(true)}
                  className="bg-gradient-primary text-white px-8 py-6 text-lg font-semibold shadow-lg hover:shadow-xl hover:scale-105 hover:-translate-y-0.5 transition-all duration-200 min-h-[44px] active:scale-95"
                >
                  {t('home.ctaIngest')}
                  <ArrowRight className="ms-2 h-5 w-5 rtl-flip" />
                </Button>
                <Button size="lg" variant="outline" asChild className="px-8 py-6 text-lg font-semibold hover:scale-105 transition-transform duration-200 min-h-[44px]">
                  <Link to="/dashboard">{t('home.ctaDashboard')}</Link>
                </Button>
              </div>
            </motion.div>
          </section>
          <section className="py-16 md:py-24 lg:py-32">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold font-display">{t('home.sectionTitle')}</h2>
              <p className="mt-4 max-w-2xl mx-auto text-muted-foreground">
                {t('home.sectionSubtitle')}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-12">
              <FeatureCard icon={<Zap className="w-6 h-6" />} title={t('home.feature.coding.title')} description={t('home.feature.coding.desc')} />
              <FeatureCard icon={<Stethoscope className="w-6 h-6" />} title={t('home.feature.drg.title')} description={t('home.feature.drg.desc')} />
              <FeatureCard icon={<Lightbulb className="w-6 h-6" />} title={t('home.feature.cdi.title')} description={t('home.feature.cdi.desc')} />
              <FeatureCard icon={<ShieldCheck className="w-6 h-6" />} title={t('home.feature.nphies.title')} description={t('home.feature.nphies.desc')} />
              <FeatureCard icon={<Database className="w-6 h-6" />} title={t('home.feature.claims.title')} description={t('home.feature.claims.desc')} />
              <FeatureCard icon={<Scale className="w-6 h-6" />} title={t('home.feature.audit.title')} description={t('home.feature.audit.desc')} />
            </div>
          </section>
        </div>
      </main>
      <footer className="text-center py-8 border-t">
        <p className="text-muted-foreground">{t('home.footer')}</p>
      </footer>
      <Dialog open={isModalOpen} onOpenChange={(open) => { setIsModalOpen(open); if (!open) resetModal(); }}>
        <DialogContent className={cn((demoResult || wizardActive) ? "sm:max-w-[700px]" : "sm:max-w-[625px]")}>
          {wizardActive && demoResult ? (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle className="text-2xl font-display">{isRtl ? 'أسئلة توضيحية' : 'Clarifying Questions'}</DialogTitle>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 -mt-2 -me-2" onClick={() => setWizardActive(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <DialogDescription>
                  {isRtl
                    ? `سؤال ${wizardStep + 1} من ${demoResult.questions.length} — إجاباتك تُعاد صياغتها كتوضيح نصي ويُعاد تشغيل محرك الترميز الفعلي عليها.`
                    : `Question ${wizardStep + 1} of ${demoResult.questions.length} — your answers are appended as clarifying text and the real coding engine re-runs on them.`}
                </DialogDescription>
              </DialogHeader>
              <div className="py-6 space-y-5">
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(wizardStep / demoResult.questions.length) * 100}%` }}
                  />
                </div>
                {demoResult.questions[wizardStep] && (
                  <>
                    <div className="flex items-start gap-2">
                      <Badge
                        variant={demoResult.questions[wizardStep].severity === 'critical' ? 'destructive' : demoResult.questions[wizardStep].severity === 'warning' ? 'default' : 'secondary'}
                        className="text-2xs shrink-0 mt-0.5"
                      >
                        {demoResult.questions[wizardStep].severity}
                      </Badge>
                      <p className="text-base" dir="auto">
                        {isRtl ? demoResult.questions[wizardStep].prompt_ar : demoResult.questions[wizardStep].prompt_en}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {demoResult.questions[wizardStep].options.map((opt) => (
                        <Button
                          key={opt.answer_text}
                          type="button"
                          variant="outline"
                          className="justify-start h-auto py-3 text-start min-h-[44px]"
                          onClick={() => answerWizardQuestion(opt.answer_text)}
                        >
                          {isRtl ? opt.label_ar : opt.label_en}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="ghost" onClick={() => answerWizardQuestion(null)} className="min-h-[44px]">
                  {isRtl ? 'تخطي هذا السؤال' : 'Skip this question'}
                </Button>
              </DialogFooter>
            </>
          ) : demoResult ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-display">{isRtl ? 'معاينة النتائج (وضع العرض التجريبي)' : 'Preview Results (Demo Mode)'}</DialogTitle>
                <DialogDescription>
                  {isRtl
                    ? 'هذه معاينة مباشرة فقط — لم يتم حفظ أي بيانات. سجّل الدخول للوصول إلى مساحة الترميز الكاملة وحفظ عملك.'
                    : 'This is a live preview only — nothing was saved. Sign in for the full Coding Workspace and to save your work.'}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-5 max-h-[60vh] overflow-y-auto pe-1">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('coding.drgTitle')}</p>
                      <p className="font-semibold font-display">
                        {demoResult.drg.subclass} · {language === 'ar' ? demoResult.drg.title_ar : demoResult.drg.title_en}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="gap-1"><Languages className="h-3 w-3" />{t(demoResult.detected_language === 'ar' ? 'lang.ar' : demoResult.detected_language === 'mixed' ? 'lang.mixed' : 'lang.en')}</Badge>
                      <Badge variant="secondary">{isRtl ? 'الثقة' : 'Confidence'}: {(demoResult.confidence_score * 100).toFixed(0)}%</Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="gap-1"><Building2 className="h-3 w-3" />{language === 'ar' ? demoResult.drg.department_ar : demoResult.drg.department_en}</Badge>
                    <Badge variant={demoResult.drg.partition === 'Surgical' ? 'default' : 'secondary'} className="gap-1">
                      {demoResult.drg.partition === 'Surgical' ? <Scissors className="h-3 w-3" /> : <Stethoscope className="h-3 w-3" />}
                      {t(demoResult.drg.partition === 'Surgical' ? 'coding.partition.surgical' : 'coding.partition.medical')}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <div className="flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-orange-500" />
                      <span className="text-xs text-muted-foreground">{t('coding.soi')}</span>
                      <span className="font-bold text-sm">{demoResult.drg.soi}/4</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <HeartPulse className="h-3.5 w-3.5 text-red-500" />
                      <span className="text-xs text-muted-foreground">{t('coding.rom')}</span>
                      <span className="font-bold text-sm">{demoResult.drg.rom}/4</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Scale3d className="h-3.5 w-3.5 text-blue-500" />
                      <span className="text-xs text-muted-foreground">{t('coding.relativeWeight')}</span>
                      <span className="font-bold text-sm">{demoResult.drg.relative_weight.toFixed(2)}</span>
                    </div>
                  </div>
                  {demoResult.drg.procedure && (
                    <p className="text-sm flex items-center gap-1.5 text-purple-700 dark:text-purple-400">
                      <Scissors className="h-3.5 w-3.5 shrink-0" />
                      {t('coding.procedureDetected')}: {language === 'ar' ? demoResult.drg.procedure.desc_ar : demoResult.drg.procedure.desc_en}
                    </p>
                  )}
                  {demoResult.drg.explanation && (
                    <Accordion type="single" collapsible>
                      <AccordionItem value="explanation" className="border-b-0">
                        <AccordionTrigger className="text-xs text-muted-foreground py-1 hover:no-underline">{t('coding.explanation')}</AccordionTrigger>
                        <AccordionContent>
                          <ul className="text-xs text-muted-foreground space-y-1 list-disc ps-4" dir="auto">
                            {(language === 'ar' ? demoResult.drg.explanation.ar : demoResult.drg.explanation.en).map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </div>
                {priorResult && (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-sm flex items-start gap-2">
                    <TrendingUp className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                    <span>
                      {isRtl ? 'تم تحسين الترميز بناءً على إجاباتك: ' : 'Coding refined based on your answers: '}
                      {isRtl ? 'الثقة' : 'confidence'} {(priorResult.confidence_score * 100).toFixed(0)}% → {(demoResult.confidence_score * 100).toFixed(0)}%
                      {priorResult.drg.subclass !== demoResult.drg.subclass && ` · DRG ${priorResult.drg.subclass} → ${demoResult.drg.subclass}`}
                    </span>
                  </div>
                )}
                {demoResult.questions.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <HelpCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">
                          {isRtl
                            ? `${demoResult.questions.length} سؤال توضيحي يمكنه تحسين دقة الترميز`
                            : `${demoResult.questions.length} clarifying question${demoResult.questions.length > 1 ? 's' : ''} could improve coding accuracy`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isRtl ? 'أجب عليها لإعادة حساب ترميز أكثر دقة.' : 'Answer them to recalculate a more specific code.'}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" onClick={startRefinementWizard} disabled={isRefining} className="shrink-0 min-h-[44px]">
                      {isRefining ? t('home.modal.analyzing') : (isRtl ? 'ابدأ التوضيح' : 'Refine This Coding')}
                      {!isRefining && <ArrowRight className="ms-2 h-4 w-4 rtl-flip" />}
                    </Button>
                  </div>
                )}
                {demoResult.suggested_procedures.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium flex items-center gap-1.5"><Scissors className="h-4 w-4" />{isRtl ? 'الإجراءات المكتشفة (رموز SBS)' : 'Detected Procedures (SBS Codes)'}</p>
                    {demoResult.suggested_procedures.map((p) => (
                      <div key={p.code} className="rounded-md border px-3 py-2 text-sm space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span dir="auto">{language === 'ar' && p.desc_ar ? p.desc_ar : p.desc}</span>
                          {p.sbs_code ? (
                            <Badge variant="outline" className="font-mono text-2xs shrink-0">SBS {p.sbs_code}</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-2xs shrink-0">{isRtl ? 'يتطلب تحديد الموقع' : 'needs site specificity'}</Badge>
                          )}
                        </div>
                        {p.sbs_desc_en && <p className="text-xs text-muted-foreground">{p.sbs_desc_en}</p>}
                        {p.sbs_laterality_unspecified && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            {isRtl ? 'يلزم تحديد الجانبية (أحادي/ثنائي) لاختيار رمز SBS الصحيح' : 'Laterality (unilateral/bilateral) not yet specified for the correct SBS code'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {demoResult.ai_summary && (
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/10 p-4 space-y-3">
                    <p className="text-sm font-medium flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
                      <Sparkles className="h-4 w-4" />{isRtl ? 'الملخص السريري بالذكاء الاصطناعي' : 'AI Clinical Summary'}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      {isRtl
                        ? 'ملخص مساعد تم إنشاؤه بالذكاء الاصطناعي — وليس تشخيصًا. يرجى التحقق دائمًا من الملاحظة الأصلية.'
                        : 'AI-generated assistive summary — not a diagnosis. Always verify against the source note.'}
                    </p>
                    {demoResult.ai_summary.timeline.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" />{isRtl ? 'تسلسل الأحداث السريرية' : 'Clinical Event Sequence'}
                        </p>
                        <ol className="text-sm space-y-1 list-decimal ps-4" dir="auto">
                          {demoResult.ai_summary.timeline.map((event, i) => <li key={i}>{event}</li>)}
                        </ol>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{isRtl ? 'الانطباع التشخيصي' : 'Diagnostic Impression'}</p>
                      <p className="text-sm" dir="auto">{demoResult.ai_summary.impression}</p>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('coding.suggestedCodes')}</p>
                  {demoResult.suggested_codes.map((c) => (
                    <div key={c.code} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                      <span className="font-mono font-medium">{c.code}</span>
                      <span className="flex-1 text-muted-foreground truncate" dir="auto">{language === 'ar' && c.desc_ar ? c.desc_ar : c.desc}</span>
                      {c.is_principal && <Badge variant="secondary" className="text-2xs shrink-0">{t('coding.principal')}</Badge>}
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-1.5"><Lightbulb className="h-4 w-4" />{isRtl ? 'تنبيهات سلامة التوثيق (CDI)' : 'CDI Documentation Nudges'}</p>
                  {demoResult.nudges.length > 0 ? (
                    demoResult.nudges.map((n) => (
                      <div key={n.id} className="rounded-md border px-3 py-2 space-y-1">
                        <Badge variant={n.severity === 'critical' ? 'destructive' : n.severity === 'warning' ? 'default' : 'secondary'} className="text-2xs">{n.severity}</Badge>
                        <p className="text-sm" dir="auto">{language === 'ar' && n.prompt_ar ? n.prompt_ar : n.prompt}</p>
                        {(language === 'ar' ? n.soi_impact_ar : n.soi_impact) && (
                          <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <TrendingUp className="h-3 w-3 shrink-0" />{language === 'ar' ? n.soi_impact_ar : n.soi_impact}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      {isRtl ? 'لم يتم رصد أي فجوات توثيقية لهذه الملاحظة.' : 'No documentation gaps detected for this note.'}
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="secondary" onClick={resetModal} className="min-h-[44px]">
                  <RotateCcw className="me-2 h-4 w-4" />{isRtl ? 'جرّب ملاحظة أخرى' : 'Try Another Note'}
                </Button>
                <Button type="button" asChild className="bg-[#0E5FFF] hover:bg-[#0E5FFF]/90 text-white min-h-[44px]">
                  <Link to="/login"><LogIn className="me-2 h-4 w-4" />{isRtl ? 'سجّل الدخول للوصول الكامل' : 'Sign In For Full Access'}</Link>
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-display">{t('home.modal.title')}</DialogTitle>
                <DialogDescription>
                  {isAuthenticated
                    ? t('home.modal.description')
                    : (isRtl
                        ? 'أنت لست مسجلاً الدخول — ستحصل على معاينة تجريبية فقط، ولن يتم حفظ أي بيانات. سجّل الدخول للوصول إلى مساحة الترميز الكاملة.'
                        : "You're not signed in — you'll get a live preview only, and nothing will be saved. Sign in for the full Coding Workspace.")}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                {isAuthenticated ? (
                  <div className="space-y-2">
                    <Label htmlFor="branch-select">{isRtl ? 'الفرع' : 'Hospital Branch'}</Label>
                    <Select value={branch} onValueChange={(v) => setBranch(v as HospitalBranchId)} disabled={isAnalyzing}>
                      <SelectTrigger id="branch-select">
                        <SelectValue placeholder={isRtl ? 'اختر الفرع (اختياري)' : 'Select branch (optional)'} />
                      </SelectTrigger>
                      <SelectContent>
                        {HOSPITAL_BRANCHES.map((b) => (
                          <SelectItem key={b.id} value={b.id}>{isRtl ? b.name_ar : b.name_en}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{isRtl ? 'أو جرّب أحد الأمثلة، أو ارفع تقريرًا نصيًا' : 'Or try an example, or upload a text report'}</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {EXAMPLE_NOTES.map((ex) => (
                        <Button
                          key={ex.label_en}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs h-8"
                          disabled={isAnalyzing}
                          onClick={() => setNoteText(ex.text)}
                        >
                          {isRtl ? ex.label_ar : ex.label_en}
                        </Button>
                      ))}
                      <input ref={fileInputRef} type="file" accept=".txt,text/plain" className="hidden" onChange={handleFileUpload} />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-8"
                        disabled={isAnalyzing}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="me-1.5 h-3.5 w-3.5" />
                        {isRtl ? 'رفع تقرير (.txt)' : 'Upload Report (.txt)'}
                      </Button>
                    </div>
                  </div>
                )}
                <Textarea
                  placeholder={t('home.modal.placeholder')}
                  className={cn("min-h-[200px] text-base", isAnalyzing && "shimmer-bg")}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  disabled={isAnalyzing}
                  maxLength={isAuthenticated ? undefined : DEMO_NOTE_MAX_LENGTH}
                  dir="auto"
                />
                {!isAuthenticated && (
                  <p className={cn("text-xs text-end", noteText.length > DEMO_NOTE_MAX_LENGTH * 0.9 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                    {noteText.length} / {DEMO_NOTE_MAX_LENGTH}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isAnalyzing} className="min-h-[44px]">{t('common.cancel')}</Button>
                <Button type="submit" onClick={handleAnalyze} className="bg-[#0E5FFF] hover:bg-[#0E5FFF]/90 text-white min-h-[44px] active:scale-95" disabled={isAnalyzing}>
                  {isAnalyzing
                    ? (isAuthenticated ? t('home.modal.analyzing') : (isRtl ? 'جارٍ التحليل بالذكاء الاصطناعي...' : 'Analyzing with AI...'))
                    : t('home.modal.analyze')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Toaster richColors closeButton />
    </div>
  );
}