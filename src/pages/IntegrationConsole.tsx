import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PlayCircle, RefreshCw, Server, Copy, Languages } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { AuditLog } from '@shared/types';
import type { NphiesFieldMapping } from '@shared/nphies-field-map';
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
  if (error) toast.error(isRtl ? 'فشل تحميل سجلات التكامل.' : 'Failed to load integration logs.');
  const handleTestEndpoint = (endpoint: string) => {
    toast.info(isRtl ? `جارٍ اختبار نقطة ${endpoint}...` : `Testing ${endpoint} endpoint...`);
    setTimeout(() => {
      toast.success(isRtl ? `اتصال ${endpoint} ناجح!` : `${endpoint} connection successful!`, {
        description: isRtl ? 'تم استلام استجابة 200 OK من الخادم التجريبي.' : 'Received a 200 OK response from the mock server.',
      });
    }, 1000);
  };
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(isRtl ? 'تم النسخ إلى الحافظة!' : 'Copied to clipboard!');
  };
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
                  <Switch id="sandbox-mode" defaultChecked />
                  <Label htmlFor="sandbox-mode">{isRtl ? 'وضع الاختبار (Sandbox)' : 'Sandbox Mode'}</Label>
                  <Badge variant="default">{isRtl ? 'مفعّل' : 'Enabled'}</Badge>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-id">OAuth Client ID</Label>
                  <div className="flex items-center gap-2">
                    <Input id="client-id" value="**********" readOnly className="focus:ring-2 ring-blue-500 shadow-glow" />
                    <Button variant="outline" size="icon" onClick={() => handleCopy('mock_client_id_12345')}><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-secret">OAuth Client Secret</Label>
                  <div className="flex items-center gap-2">
                    <Input id="client-secret" type="password" value="********************" readOnly className="focus:ring-2 ring-blue-500 shadow-glow" />
                    <Button variant="outline" size="icon" onClick={() => handleCopy('mock_client_secret_67890')}><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
                <Button variant="outline" className="active:scale-95 transition-transform min-h-[44px]">
                  <RefreshCw className="me-2 h-4 w-4" />
                  {isRtl ? 'تحديث الرمز' : 'Refresh Token'}
                </Button>
              </CardContent>
            </Card>
            <Card className="hover:shadow-xl hover:-translate-y-1 duration-300 transition-all lg:col-span-2">
              <CardHeader>
                <CardTitle>{isRtl ? 'فحص سلامة نقاط النهاية' : 'Endpoint Health Check'}</CardTitle>
                <CardDescription>{isRtl ? 'تشغيل اختبارات حية على نقاط نهاية بيئة الاختبار.' : 'Run live tests against sandbox endpoints.'}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <Button onClick={() => handleTestEndpoint('Claims')} className="active:scale-95 transition-transform h-[44px]"><PlayCircle className="me-2 h-4 w-4" /> {isRtl ? 'اختبار المطالبات' : 'Test Claims'}</Button>
                <Button onClick={() => handleTestEndpoint('Pre-Auth')} className="active:scale-95 transition-transform h-[44px]"><PlayCircle className="me-2 h-4 w-4" /> {isRtl ? 'اختبار الموافقة المسبقة' : 'Test Pre-Auth'}</Button>
                <Button onClick={() => handleTestEndpoint('Status Check')} className="active:scale-95 transition-transform h-[44px]"><PlayCircle className="me-2 h-4 w-4" /> {isRtl ? 'اختبار فحص الحالة' : 'Test Status Check'}</Button>
                <Button onClick={() => handleTestEndpoint('Payments')} className="active:scale-95 transition-transform h-[44px]"><PlayCircle className="me-2 h-4 w-4" /> {isRtl ? 'اختبار المدفوعات' : 'Test Payments'}</Button>
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