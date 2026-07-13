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
import { CheckCircle, XCircle, Send, ThumbsUp, FilePlus2, Activity, HeartPulse, Scale3d, Languages, Stethoscope, Scissors } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Toaster, toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { CodingJob } from '@shared/types';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLanguage } from '@/hooks/use-language';
const mockEncounterDetails = {
  patientName: 'Abdullah Al-Farsi',
  mrn: 'MRN789012',
  admissionDate: '2024-08-15',
  encounterType: 'Inpatient',
};
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
                    {mockEncounterDetails.patientName} (MRN: {mockEncounterDetails.mrn})
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
                <Button size="sm" className="bg-[#0E5FFF] hover:bg-[#0E5FFF]/90 text-white shadow-md min-h-[44px]">
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
                  <p className="text-xs text-muted-foreground">{drg.methodology}</p>
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
        <ResizablePanelGroup direction={isMobile ? "vertical" : "horizontal"} className="flex-1 w-full rounded-lg border bg-background h-full scroll-snap-type-y mandatory">
          <ResizablePanel defaultSize={50} minSize={30}>
            <Card className="h-full flex flex-col border-0 rounded-none">
              <CardHeader className="py-4">
                <CardTitle>{t('coding.clinicalNote')}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-4">
                <ScrollArea className="h-full pr-4 scroll-snap-type-y snap-mandatory">
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
                                <Button variant="ghost" size="icon" className="text-green-600 hover:text-green-700 h-11 w-11">
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 h-11 w-11">
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
      <Toaster richColors closeButton />
    </AppLayout>
  );
}