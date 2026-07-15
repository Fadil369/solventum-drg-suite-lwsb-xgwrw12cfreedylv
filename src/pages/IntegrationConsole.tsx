import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Server, Languages, Activity, Building2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { AuditLog, NphiesLiveStatus } from '@shared/types';
import type { NphiesFieldMapping } from '@shared/nphies-field-map';
import { HOSPITAL_BRANCHES } from '@shared/hospital-branches';
import { format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { useLanguage } from '@/hooks/use-language';
export function IntegrationConsole() {
  const { t, language, isRtl } = useLanguage();
  const { data, isLoading, error } = useQuery({
    queryKey: ['integration-logs'],
    queryFn: () => api<{ items: AuditLog[] }>('/api/audit-logs', { params: { limit: 7 } }),
  });
  const { data: fieldMapData, isLoading: isLoadingFieldMap } = useQuery({
    queryKey: ['nphies-field-map'],
    queryFn: () => api<NphiesFieldMapping[]>('/api/nphies-field-map'),
  });
  const { data: nphiesStatus, isLoading: isLoadingNphiesStatus, refetch: refetchNphiesStatus, isFetching: isRefetchingNphiesStatus } = useQuery({
    queryKey: ['nphies-status'],
    queryFn: () => api<NphiesLiveStatus>('/api/nphies-status'),
    refetchInterval: 120_000,
  });
  if (error) toast.error(isRtl ? 'فشل تحميل سجلات التكامل.' : 'Failed to load integration logs.');
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 lg:py-12">
        <Breadcrumbs />
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="hover:shadow-xl hover:-translate-y-1 duration-300 transition-all lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-2xl font-display">nphies Integration</CardTitle>
                <CardDescription>{t('integration.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-2">
                  {nphiesStatus?.nphies_auth_healthy ? (
                    <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {isRtl ? 'متصل' : 'Connected'}</Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1"><XCircle className="h-3.5 w-3.5" /> {isRtl ? 'مصادقة معطلة' : 'Auth Degraded'}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isRtl
                    ? 'يتم تفويض بيانات اعتماد OAuth الفعلية إلى خدمة nphies-mirror المؤمّنة بشكل منفصل — لا يتم تخزينها أو الاطلاع عليها من هذا النظام.'
                    : 'Real OAuth credentials are delegated to the separately-secured nphies-mirror service — this system never stores or sees them.'}
                </p>
                {nphiesStatus?.sync_error && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{nphiesStatus.sync_error}</span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>{isRtl ? 'آخر مزامنة ناجحة:' : 'Last good sync:'} {nphiesStatus?.last_good_sync ? format(new Date(nphiesStatus.last_good_sync), 'PPp') : '—'}</div>
                  <div>{isRtl ? 'آخر محاولة:' : 'Last attempt:'} {nphiesStatus?.last_sync_attempt ? format(new Date(nphiesStatus.last_sync_attempt), 'PPp') : '—'}</div>
                </div>
                <Button variant="outline" className="active:scale-95 transition-transform min-h-[44px]" onClick={() => refetchNphiesStatus()} disabled={isRefetchingNphiesStatus}>
                  <RefreshCw className={`me-2 h-4 w-4 ${isRefetchingNphiesStatus ? 'animate-spin' : ''}`} />
                  {isRtl ? 'تحديث الحالة' : 'Refresh Status'}
                </Button>
              </CardContent>
            </Card>
            <Card className="hover:shadow-xl hover:-translate-y-1 duration-300 transition-all lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> {isRtl ? 'حالة الفروع الحية (NPHIES وأوراكل)' : 'Live Branch Status (NPHIES & Oracle Health)'}</CardTitle>
                <CardDescription>
                  {isRtl
                    ? 'بيانات مزامنة NPHIES الفعلية وحالة بوابة أوراكل لكل فرع مستشفى، عبر nphies-mirror و oracle-bridge.'
                    : 'Real NPHIES sync data and Oracle Health portal status per hospital branch, via nphies-mirror and oracle-bridge.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingNphiesStatus ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full shimmer-bg" />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {HOSPITAL_BRANCHES.map((branch) => {
                      const status = nphiesStatus?.branches.find((b) => b.branch === branch.id);
                      const portalStatus = status?.oracle_portal_status ?? 'unknown';
                      return (
                        <div key={branch.id} className="rounded-lg border p-3 flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> {isRtl ? branch.name_ar : branch.name_en}</span>
                            <Badge variant={portalStatus === 'online' ? 'default' : portalStatus === 'maintenance' ? 'secondary' : 'outline'} className="text-2xs">
                              {portalStatus}
                            </Badge>
                          </div>
                          <div className="text-2xs text-muted-foreground flex gap-3 flex-wrap">
                            <span>GSS {status?.gss ?? 0}</span>
                            <span>PA {status?.pa ?? 0}</span>
                            <span>CoC {status?.coc ?? 0}</span>
                            <span>SC {status?.sc ?? 0}</span>
                          </div>
                          {status?.stale && (
                            <span className="text-2xs text-amber-600 dark:text-amber-400">{isRtl ? 'بيانات غير محدثة' : 'stale data'}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Languages className="h-5 w-5" /> {t('integration.fieldMapTitle')}</CardTitle>
              <CardDescription>PRD Section 4.0 — BrainSAIT ↔ nphies/Etimad data localization mapping.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('integration.concept')}</TableHead>
                      <TableHead>{t('integration.targetField')}</TableHead>
                      <TableHead>{t('integration.source')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingFieldMap ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-40 shimmer-bg" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-56 shimmer-bg" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-32 shimmer-bg" /></TableCell>
                        </TableRow>
                      ))
                    ) : fieldMapData?.map((row) => (
                      <TableRow key={row.brainsait_concept_en} className="even:bg-muted/30 hover:bg-muted/50">
                        <TableCell className="font-medium" dir="auto">{language === 'ar' ? row.brainsait_concept_ar : row.brainsait_concept_en}</TableCell>
                        <TableCell dir="auto">{language === 'ar' ? row.nphies_field_ar : row.nphies_field_en}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{row.source}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{isRtl ? 'سجلات التكامل الأخيرة' : 'Recent Integration Logs'}</CardTitle>
              <CardDescription>{isRtl ? 'سجل لآخر تفاعلات API وأحداث النظام.' : 'A stream of recent API interactions and system events.'}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isRtl ? 'الوقت' : 'Timestamp'}</TableHead>
                      <TableHead>{isRtl ? 'الجهة' : 'Actor'}</TableHead>
                      <TableHead>{isRtl ? 'الإجراء' : 'Action'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-32 shimmer-bg" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24 shimmer-bg" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-48 shimmer-bg" /></TableCell>
                        </TableRow>
                      ))
                    ) : data?.items.length ? (
                      data.items.map((log) => (
                        <TableRow key={log.id} className="even:bg-muted/30 hover:bg-muted/50">
                          <TableCell>{format(new Date(log.occurred_at), 'PPp')}</TableCell>
                          <TableCell><Badge variant="secondary">{log.actor}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{log.action}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center">
                          <Server className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                          {isRtl ? 'لا توجد سجلات حديثة.' : 'No recent logs found.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Toaster richColors closeButton />
    </AppLayout>
  );
}