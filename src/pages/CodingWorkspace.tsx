import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle, XCircle, Send, ThumbsUp, FilePlus2, Activity, HeartPulse, Scale3d, Languages, Stethoscope, Scissors, Building2,
  Sparkles, Clock, AlertCircle, HelpCircle, TrendingUp, X,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Toaster, toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { CodingJob, EncounterWithPatient } from '@shared/types';
import { findBranch } from '@shared/hospital-branches';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLanguage } from '@/hooks/use-language';
const codeRowVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
};
export function CodingWorkspace() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [codingJob, setCodingJob] = useState<CodingJob | null>(location.state?.codingJob || null);
  const { data: latestJobData, isLoading: isLoadingLatestJob } = useQuery({
    queryKey: ['coding-jobs', { limit: 1 }],
    queryFn: () => api<{ items: CodingJob[] }>('/api/coding-jobs', { params: { limit: 1 } }),
    enabled: !codingJob,
  });
  useEffect(() => {
    if (!codingJob && latestJobData?.items?.[0]) {
      setCodingJob(latestJobData.items[0]);
    }
  }, [latestJobData, codingJob]);
  const { t, language, isRtl } = useLanguage();
  const { data: encounter, isLoading: isLoadingEncounter } = useQuery({
    queryKey: ['encounter', codingJob?.encounter_id],
    queryFn: () => api<EncounterWithPatient>(`/api/encounters/${codingJob!.encounter_id}`),
    enabled: !!codingJob?.encounter_id,
  });
  const acceptCodesMutation = useMutation({
    mutationFn: (jobId: string) => api(`/api/coding-jobs/${jobId}/accept`, { method: 'POST' }),
    onSuccess: () => {
      toast.success(isRtl ? 'تم قبول الرموز!' : 'Codes accepted!', { description: isRtl ? 'تم تحديث حالة المهمة إلى AUTO_DROP.' : 'Job status updated to AUTO_DROP.' });
      setCodingJob(prev => prev ? { ...prev, status: 'AUTO_DROP' } : null);
      queryClient.invalidateQueries({ queryKey: ['coding-jobs'] });
    },
    onError: (error: Error) => {
      toast.error(isRtl ? 'فشل قبول الرموز.' : 'Failed to accept codes.', { description: error.message });
    },
  });
  const prepareClaimMutation = useMutation({
    mutationFn: (jobId: string) => api<{ status: string; message: string }>(`/api/coding-jobs/${jobId}/prepare-claim`, { method: 'POST' }),
    onSuccess: (result) => {
      toast.info(isRtl ? 'تم تجهيز المطالبة' : 'Claim Prepared', { description: isRtl ? 'حزمة المطالبة جاهزة. الإرسال المباشر إلى nphies غير متاح بعد — راجع وحدة التكامل.' : result.message, duration: 8000 });
    },
    onError: (error: Error) => {
      toast.error(isRtl ? 'تعذر تجهيز المطالبة.' : 'Failed to prepare claim.', { description: error.message });
    },
  });
  const acceptCodeMutation = useMutation({
    mutationFn: (code: string) => api(`/api/coding-jobs/${codingJob!.id}/codes/${encodeURIComponent(code)}/accept`, { method: 'POST' }),
    onSuccess: (_data, code) => {
      setCodingJob((prev) => prev ? { ...prev, suggested_codes: prev.suggested_codes.map((sc) => (sc.code === code ? { ...sc, confirmed: true } : sc)) } : prev);
    },
    onError: (error: Error) => {
      toast.error(isRtl ? 'تعذر تأكيد الرمز.' : 'Failed to confirm code.', { description: error.message });
    },
  });
  const rejectCodeMutation = useMutation({
    mutationFn: (code: string) => api<{ id: string; code: string; rejected: true; principal_code?: string; drg?: CodingJob['drg'] }>(
      `/api/coding-jobs/${codingJob!.id}/codes/${encodeURIComponent(code)}/reject`,
      { method: 'POST' }
    ),
    onSuccess: (result) => {
      setCodingJob((prev) => prev ? {
        ...prev,
        suggested_codes: prev.suggested_codes.filter((sc) => sc.code !== result.code).map((sc) => ({ ...sc, is_principal: sc.code === result.principal_code })),
        secondary_codes: (prev.secondary_codes ?? []).filter((c) => c !== result.code),
        principal_code: result.principal_code ?? prev.principal_code,
        drg: result.drg ?? prev.drg,
      } : prev);
      toast.success(isRtl ? 'تم رفض الرمز وأُعيد حساب DRG.' : 'Code rejected and DRG recalculated.');
    },
    onError: (error: Error) => {
      toast.error(isRtl ? 'تعذر رفض الرمز.' : 'Failed to reject code.', { description: error.message });
    },
  });
  const [wizardActive, setWizardActive] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardAnswers, setWizardAnswers] = useState<string[]>([]);
  const refineMutation = useMutation({
    mutationFn: (answers: string[]) => api<CodingJob>(`/api/coding-jobs/${codingJob!.id}/refine`, { method: 'POST', body: JSON.stringify({ answers }) }),
    onSuccess: (updated) => {
      setCodingJob(updated);
      toast.success(isRtl ? 'تم تحسين الترميز بناءً على إجاباتك.' : 'Coding refined based on your answers.');
    },
    onError: (error: Error) => {
      toast.error(isRtl ? 'تعذر تحسين الترميز.' : 'Failed to refine coding.', { description: error.message });
    },
  });
  const startRefinementWizard = () => {
    setWizardStep(0);
    setWizardAnswers([]);
    setWizardActive(true);
  };
  const answerWizardQuestion = (answerText: string | null) => {
    const nextAnswers = answerText ? [...wizardAnswers, answerText] : wizardAnswers;
    setWizardAnswers(nextAnswers);
    const totalQuestions = codingJob?.questions?.length ?? 0;
    if (wizardStep + 1 < totalQuestions) {
      setWizardStep(wizardStep + 1);
    } else {
      setWizardActive(false);
      if (nextAnswers.length > 0) refineMutation.mutate(nextAnswers);
    }
  };
  const isLoading = isLoadingLatestJob && !codingJob;
  const drg = codingJob?.drg;
  const langLabelKey = codingJob?.detected_language === 'ar' ? 'lang.ar' : codingJob?.detected_language === 'mixed' ? 'lang.mixed' : 'lang.en';
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 lg:py-12 h-[calc(100vh-3.5rem)] flex flex-col">
        <Breadcrumbs />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
            <div>
                <h1 className="text-xl font-bold font-display">{t('coding.title')}</h1>
                <p className="text-sm text-muted-foreground">
                    {isLoadingEncounter ? (
                      <span className="inline-block h-4 w-40 rounded shimmer-bg align-middle" />
                    ) : encounter?.patient ? (
                      <>
                        {encounter.patient.given_name} {encounter.patient.family_name}
                        {' '}({isRtl ? 'رقم الهوية' : 'National ID'}: {encounter.patient.national_id})
                      </>
                    ) : codingJob ? (
                      isRtl ? 'سجل المريض غير متوفر' : 'Patient record unavailable'
                    ) : (
                      t('coding.noNote')
                    )}
                    {codingJob?.branch && (() => {
                      const b = findBranch(codingJob.branch);
                      return b ? ` · ${language === 'ar' ? b.name_ar : b.name_en}` : null;
                    })()}
                </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                {codingJob?.detected_language && (
                  <Badge variant="outline" className="gap-1.5">
                    <Languages className="h-3.5 w-3.5" />
                    {t(langLabelKey)}
                  </Badge>
                )}
                {codingJob && (
                    <Button
                    variant="outline"
                    size="sm"
                    onClick={() => acceptCodesMutation.mutate(codingJob.id)}
                    disabled={acceptCodesMutation.isPending || codingJob.status !== 'NEEDS_REVIEW'}
                    className="min-h-[44px]"
                    >
                    <ThumbsUp className="me-2 h-4 w-4" />
                    {codingJob.status === 'AUTO_DROP' ? t('coding.codesAccepted') : t('coding.acceptAll')}
                    </Button>
                )}
                <Button
                    size="sm"
                    className="bg-[#0E5FFF] hover:bg-[#0E5FFF]/90 text-white shadow-md min-h-[44px]"
                    onClick={() => codingJob && prepareClaimMutation.mutate(codingJob.id)}
                    disabled={!codingJob || prepareClaimMutation.isPending}
                >
                    <Send className="me-2 h-4 w-4 rtl-flip" />
                    {t('coding.submitClaim')}
                </Button>
            </div>
        </div>
        {drg && (
          <Card className="mb-4 border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('coding.drgTitle')}</p>
                  <p className="font-semibold font-display">
                    {drg.subclass} · {language === 'ar' ? drg.title_ar : drg.title_en}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <Badge variant="outline" className="text-xs font-normal">
                      {language === 'ar' ? drg.department_ar : drg.department_en}
                    </Badge>
                    <p className="text-xs text-muted-foreground">{drg.methodology}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 md:gap-6 md:ms-auto">
                  <div className="flex items-center gap-2">
                    {drg.partition === 'Surgical' ? <Scissors className="h-4 w-4 text-purple-500" /> : <Stethoscope className="h-4 w-4 text-teal-500" />}
                    <div>
                      <p className="text-xs text-muted-foreground">{t('coding.partition')}</p>
                      <Badge variant={drg.partition === 'Surgical' ? 'default' : 'secondary'}>
                        {t(drg.partition === 'Surgical' ? 'coding.partition.surgical' : 'coding.partition.medical')}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-orange-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t('coding.soi')}</p>
                      <p className="font-bold">{drg.soi} / 4</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <HeartPulse className="h-4 w-4 text-red-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t('coding.rom')}</p>
                      <p className="font-bold">{drg.rom} / 4</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Scale3d className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">{t('coding.relativeWeight')}</p>
                      <p className="font-bold">{drg.relative_weight.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>
              {drg.procedure && (
                <p className="mt-3 text-sm flex items-center gap-1.5 text-purple-700 dark:text-purple-400">
                  <Scissors className="h-3.5 w-3.5 shrink-0" />
                  {t('coding.procedureDetected')}: {language === 'ar' ? drg.procedure.desc_ar : drg.procedure.desc_en}
                </p>
              )}
              {drg.explanation && (
                <Accordion type="single" collapsible className="mt-2">
                  <AccordionItem value="explanation" className="border-b-0">
                    <AccordionTrigger className="text-xs text-muted-foreground py-1 hover:no-underline">
                      {t('coding.explanation')}
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="text-xs text-muted-foreground space-y-1 list-disc ps-4" dir="auto">
                        {(language === 'ar' ? drg.explanation.ar : drg.explanation.en).map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </CardContent>
          </Card>
        )}
        {codingJob && (codingJob.questions?.length ?? 0) > 0 && (
          <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <HelpCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">
                    {isRtl
                      ? `${codingJob.questions!.length} سؤال توضيحي يمكنه تحسين دقة الترميز`
                      : `${codingJob.questions!.length} clarifying question${codingJob.questions!.length > 1 ? 's' : ''} could improve coding accuracy`}
                  </p>
                  <p className="text-xs text-muted-foreground">{isRtl ? 'أجب عليها لإعادة حساب ترميز أكثر دقة وحفظه في هذه المهمة.' : 'Answer them to recalculate a more specific code and save it to this job.'}</p>
                </div>
              </div>
              <Button size="sm" onClick={startRefinementWizard} disabled={refineMutation.isPending} className="shrink-0 min-h-[44px]">
                {refineMutation.isPending ? t('common.loading') : (isRtl ? 'ابدأ التوضيح' : 'Refine This Coding')}
              </Button>
            </CardContent>
          </Card>
        )}
        {codingJob?.suggested_procedures && codingJob.suggested_procedures.length > 0 && (
          <Card className="mb-4">
            <CardContent className="py-3 space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5"><Scissors className="h-4 w-4" />{isRtl ? 'الإجراءات المكتشفة (رموز SBS)' : 'Detected Procedures (SBS Codes)'}</p>
              {codingJob.suggested_procedures.map((p) => (
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
            </CardContent>
          </Card>
        )}
        {codingJob?.ai_summary && (
          <Card className="mb-4 border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/10">
            <CardContent className="py-3 space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
                <Sparkles className="h-4 w-4" />{isRtl ? 'الملخص السريري بالذكاء الاصطناعي' : 'AI Clinical Summary'}
              </p>
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {isRtl ? 'ملخص مساعد — وليس تشخيصًا. يرجى التحقق دائمًا من الملاحظة الأصلية.' : 'Assistive summary — not a diagnosis. Always verify against the source note.'}
              </p>
              {codingJob.ai_summary.timeline.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" />{isRtl ? 'تسلسل الأحداث السريرية' : 'Clinical Event Sequence'}
                  </p>
                  <ol className="text-sm space-y-1 list-decimal ps-4" dir="auto">
                    {codingJob.ai_summary.timeline.map((event, i) => <li key={i}>{event}</li>)}
                  </ol>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">{isRtl ? 'الانطباع التشخيصي' : 'Diagnostic Impression'}</p>
                <p className="text-sm" dir="auto">{codingJob.ai_summary.impression}</p>
              </div>
            </CardContent>
          </Card>
        )}
        <ResizablePanelGroup direction={isMobile ? "vertical" : "horizontal"} className="flex-1 w-full rounded-lg border bg-background h-full">
          <ResizablePanel defaultSize={50} minSize={30}>
            <Card className="h-full flex flex-col border-0 rounded-none">
              <CardHeader className="py-4">
                <CardTitle>{t('coding.clinicalNote')}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-4">
                <ScrollArea className="h-full pr-4">
                  {isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full shimmer-bg" />
                      <Skeleton className="h-4 w-full shimmer-bg" />
                      <Skeleton className="h-4 w-3/4 shimmer-bg" />
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" dir="auto">
                      {codingJob?.source_text || t('coding.noNote')}
                    </p>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={30}>
            <Card className="h-full flex flex-col border-0 rounded-none">
              <CardHeader className="py-4">
                <CardTitle>{t('coding.suggestedCodes')}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0">
                <ScrollArea className="h-full">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-4">{t('coding.code')}</TableHead>
                        <TableHead className="px-4">{t('coding.description')}</TableHead>
                        <TableHead className="text-center px-4">{t('coding.confidence')}</TableHead>
                        <TableHead className="text-end px-4">{t('coding.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <AnimatePresence>
                        {isLoading ? (
                          Array.from({ length: 4 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell className="px-4"><Skeleton className="h-5 w-24 shimmer-bg" /></TableCell>
                              <TableCell className="px-4"><Skeleton className="h-5 w-full shimmer-bg" /></TableCell>
                              <TableCell className="text-center px-4"><Skeleton className="h-6 w-16 mx-auto shimmer-bg" /></TableCell>
                              <TableCell className="text-end px-4"><Skeleton className="h-8 w-20 ms-auto shimmer-bg" /></TableCell>
                            </TableRow>
                          ))
                        ) : codingJob?.suggested_codes?.length ? (
                          codingJob.suggested_codes.map((item, index) => (
                            <motion.tr
                              key={item.code}
                              variants={codeRowVariants}
                              initial="hidden"
                              animate="visible"
                              transition={{ duration: 0.3, delay: index * 0.05 }}
                              className="hover:bg-muted/50 hover:shadow-md hover:-translate-y-0.5 duration-200"
                            >
                              <TableCell className="font-medium px-4 min-h-[44px]">
                                <div className="flex items-center gap-2">
                                  {item.code}
                                  {item.is_principal && <Badge variant="secondary" className="text-2xs">{t('coding.principal')}</Badge>}
                                  {item.confirmed && <CheckCircle className="h-3.5 w-3.5 text-green-600" />}
                                </div>
                              </TableCell>
                              <TableCell className="px-4">
                                <p>{language === 'ar' && item.desc_ar ? item.desc_ar : item.desc}</p>
                                {item.desc_ar && (
                                  <p className="text-xs text-muted-foreground" dir={language === 'ar' ? 'ltr' : 'rtl'}>
                                    {language === 'ar' ? item.desc : item.desc_ar}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell className="text-center px-4">
                                <Badge className="bg-gradient-primary/20 text-gradient font-semibold" variant={item.confidence > 0.9 ? 'default' : 'secondary'}>
                                  {(item.confidence * 100).toFixed(0)}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-end space-x-2 rtl:space-x-reverse px-4">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={`h-11 w-11 ${item.confirmed ? 'text-green-700 bg-green-500/10' : 'text-green-600 hover:text-green-700'}`}
                                  title={isRtl ? 'تأكيد هذا الرمز' : 'Confirm this code'}
                                  disabled={acceptCodeMutation.isPending || item.confirmed}
                                  onClick={() => acceptCodeMutation.mutate(item.code)}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-600 hover:text-red-700 h-11 w-11"
                                  title={isRtl ? 'رفض هذا الرمز' : 'Reject this code'}
                                  disabled={rejectCodeMutation.isPending || (codingJob?.suggested_codes.length ?? 0) <= 1}
                                  onClick={() => rejectCodeMutation.mutate(item.code)}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </motion.tr>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center">
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4">
                                    <FilePlus2 className="h-12 w-12 text-muted-foreground/50" />
                                    <p>{t('coding.noCodes')}</p>
                                    <Button asChild variant="outline" className="min-h-[44px]">
                                        <Link to="/"><FilePlus2 className="me-2 h-4 w-4" /> {t('coding.ingestNew')}</Link>
                                    </Button>
                                </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </AnimatePresence>
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <Dialog open={wizardActive} onOpenChange={setWizardActive}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-2xl font-display">{isRtl ? 'أسئلة توضيحية' : 'Clarifying Questions'}</DialogTitle>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 -mt-2 -me-2" onClick={() => setWizardActive(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <DialogDescription>
              {isRtl
                ? `سؤال ${wizardStep + 1} من ${codingJob?.questions?.length ?? 0} — إجاباتك تُعاد صياغتها كتوضيح نصي محفوظ في هذه المهمة ويُعاد تشغيل محرك الترميز الفعلي عليها.`
                : `Question ${wizardStep + 1} of ${codingJob?.questions?.length ?? 0} — your answers are appended as clarifying text saved to this job and the real coding engine re-runs on them.`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-5">
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(wizardStep / (codingJob?.questions?.length || 1)) * 100}%` }}
              />
            </div>
            {codingJob?.questions?.[wizardStep] && (
              <>
                <div className="flex items-start gap-2">
                  <Badge
                    variant={codingJob.questions[wizardStep].severity === 'critical' ? 'destructive' : codingJob.questions[wizardStep].severity === 'warning' ? 'default' : 'secondary'}
                    className="text-2xs shrink-0 mt-0.5"
                  >
                    {codingJob.questions[wizardStep].severity}
                  </Badge>
                  <p className="text-base" dir="auto">
                    {isRtl ? codingJob.questions[wizardStep].prompt_ar : codingJob.questions[wizardStep].prompt_en}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {codingJob.questions[wizardStep].options.map((opt) => (
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => answerWizardQuestion(null)} className="min-h-[44px]">
              {isRtl ? 'تخطي هذا السؤال' : 'Skip this question'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Toaster richColors closeButton />
    </AppLayout>
  );
}