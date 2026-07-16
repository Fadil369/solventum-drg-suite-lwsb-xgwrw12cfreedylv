import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Zap, ShieldCheck, ArrowRight, Database, Scale, Stethoscope, Lightbulb, LogIn, RotateCcw, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Toaster, toast } from 'sonner';
import { api } from '@/lib/api-client';
import { motion } from 'framer-motion';
import type { CodingJob, HospitalBranchId } from '@shared/types';
import type { CodingEngineResult } from '@shared/coding-engine';
import { HOSPITAL_BRANCHES } from '@shared/hospital-branches';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
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
  const [demoResult, setDemoResult] = useState<CodingEngineResult | null>(null);
  const navigate = useNavigate();
  const { t, language, isRtl } = useLanguage();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const resetModal = () => {
    setDemoResult(null);
    setNoteText('');
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
        const result = await api<CodingEngineResult>('/api/demo/analyze-note', {
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
        <DialogContent className="sm:max-w-[625px]">
          {demoResult ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-display">{isRtl ? 'معاينة النتائج (وضع العرض التجريبي)' : 'Preview Results (Demo Mode)'}</DialogTitle>
                <DialogDescription>
                  {isRtl
                    ? 'هذه معاينة مباشرة فقط — لم يتم حفظ أي بيانات. سجّل الدخول للوصول إلى مساحة الترميز الكاملة وحفظ عملك.'
                    : 'This is a live preview only — nothing was saved. Sign in for the full Coding Workspace and to save your work.'}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4 max-h-[50vh] overflow-y-auto">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('coding.drgTitle')}</p>
                  <p className="font-semibold font-display">
                    {demoResult.drg.subclass} · {language === 'ar' ? demoResult.drg.title_ar : demoResult.drg.title_en}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="gap-1"><Building2 className="h-3 w-3" />{language === 'ar' ? demoResult.drg.department_ar : demoResult.drg.department_en}</Badge>
                    <Badge variant="secondary">{isRtl ? 'الثقة' : 'Confidence'}: {(demoResult.confidence_score * 100).toFixed(0)}%</Badge>
                  </div>
                </div>
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
                {isAuthenticated && (
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
                )}
                <Textarea
                  placeholder={t('home.modal.placeholder')}
                  className={cn("min-h-[200px] text-base", isAnalyzing && "shimmer-bg")}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  disabled={isAnalyzing}
                  dir="auto"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isAnalyzing} className="min-h-[44px]">{t('common.cancel')}</Button>
                <Button type="submit" onClick={handleAnalyze} className="bg-[#0E5FFF] hover:bg-[#0E5FFF]/90 text-white min-h-[44px] active:scale-95" disabled={isAnalyzing}>
                  {isAnalyzing ? t('home.modal.analyzing') : t('home.modal.analyze')}
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