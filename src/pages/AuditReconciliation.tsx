import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Clock, Bot, FileArchive, ArrowUpDown } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { Payment, AuditLog } from '@shared/types';
import { format, formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';
type SortKey = 'amount' | 'received_at';
type SortDirection = 'asc' | 'desc';
export function AuditReconciliation() {
  const queryClient = useQueryClient();
  const [isReconciling, setIsReconciling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('received_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { data: paymentsData, isLoading: isLoadingPayments } = useQuery({
    queryKey: ['payments'],
    queryFn: () => api<{ items: Payment[] }>('/api/payments'),
  });
  const { data: auditData, isLoading: isLoadingAudits } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => api<{ items: AuditLog[] }>('/api/audit-logs'),
  });
  const reconcileMutation = useMutation({
    mutationFn: () => api('/api/reconcile-batch', { method: 'POST' }),
    onSuccess: () => {
      toast.success('Batch reconciliation completed!');
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
    onError: () => toast.error('Batch reconciliation failed.'),
    onSettled: () => setIsReconciling(false),
  });
  const handleBatchReconcile = () => {
    setIsReconciling(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          return 100;
        }
        return p + 10;
      });
    }, 150);
    reconcileMutation.mutate();
  };
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };
  const sortedPayments = useMemo(() => {
    if (!paymentsData?.items) return [];
    return [...paymentsData.items].sort((a, b) => {
      const valA = sortKey === 'received_at' ? new Date(a.received_at).getTime() : a.amount;
      const valB = sortKey === 'received_at' ? new Date(b.received_at).getTime() : b.amount;
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [paymentsData, sortKey, sortDirection]);
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 lg:py-12">
        <Breadcrumbs />
        <div className="grid gap-8 grid-cols-1 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>Payments Reconciliation</CardTitle>
                  <CardDescription>Match incoming payments to claims.</CardDescription>
                </div>
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button onClick={handleBatchReconcile} disabled={isReconciling} className="min-h-[44px] active:scale-95">
                    <Bot className="mr-2 h-4 w-4" />
                    {isReconciling ? 'Reconciling...' : 'Run Batch'}
                  </Button>
                </motion.div>
              </div>
              {isReconciling && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
                  <Progress value={progress} className="w-full h-2" />
                </motion.div>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border scroll-snap-type-x mandatory snap-mandatory">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim ID</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('amount')}>
                        <div className="flex items-center">Amount <ArrowUpDown className={`ml-2 h-4 w-4 transition-transform ${sortKey === 'amount' && sortDirection === 'desc' ? 'rotate-180' : ''}`} /></div>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort('received_at')}>
                        <div className="flex items-center">Received <ArrowUpDown className={`ml-2 h-4 w-4 transition-transform ${sortKey === 'received_at' && sortDirection === 'desc' ? 'rotate-180' : ''}`} /></div>
                      </TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingPayments ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-24 shimmer-bg" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20 shimmer-bg" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-32 shimmer-bg" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-24 shimmer-bg" /></TableCell>
                        </TableRow>
                      ))
                    ) : sortedPayments.map(p => (
                      <TableRow key={p.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-xs">{p.claim_id}</TableCell>
                        <TableCell>SAR {p.amount.toLocaleString()}</TableCell>
                        <TableCell>{format(new Date(p.received_at), 'PP')}</TableCell>
                        <TableCell>
                          <Badge variant={p.reconciled ? 'default' : 'secondary'}>
                            {p.reconciled ? <CheckCircle className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
                            {p.reconciled ? 'Reconciled' : 'Pending'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>System Audit Logs</CardTitle>
              <CardDescription>A trail of system events for SOC2 compliance.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 overflow-x-auto">
                {isLoadingAudits ? (
                  Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full shimmer-bg" />)
                ) : auditData?.items.map(log => (
                  <div key={log.id} className="flex items-center">
                    <FileArchive className="h-5 w-5 text-muted-foreground" />
                    <div className="ml-4 flex-1">
                      <p className="text-sm font-medium">{log.action}</p>
                      <p className="text-xs text-muted-foreground">by {log.actor} on {log.object_type}:{log.object_id}</p>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(log.occurred_at), { addSuffix: true })}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Toaster richColors closeButton />
    </AppLayout>
  );
}