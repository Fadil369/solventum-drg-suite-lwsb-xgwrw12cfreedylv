import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, X, Lightbulb } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { Nudge } from '@shared/types';
import { formatDistanceToNow } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { motion } from 'framer-motion';
const getSeverityVariant = (severity: Nudge['severity']) => {
  switch (severity) {
    case 'critical': return 'destructive';
    case 'warning': return 'default';
    case 'info': return 'secondary';
    default: return 'outline';
  }
};
export function CDINudgesConsole() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const { data, isLoading, error } = useQuery({
    queryKey: ['nudges'],
    queryFn: () => api<{ items: Nudge[] }>('/api/nudges'),
  });
  const applyNudgeMutation = useMutation({
    mutationFn: (nudgeId: string) => api(`/api/nudges/${nudgeId}/apply`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Nudge applied successfully!');
      queryClient.invalidateQueries({ queryKey: ['nudges'] });
    },
    onError: () => {
      toast.error('Failed to apply nudge.');
    },
  });
  if (error) toast.error('Failed to load CDI nudges.');
  const filteredNudges = data?.items.filter(nudge => statusFilter === 'all' || nudge.status === statusFilter) ?? [];
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 lg:py-12">
        <Breadcrumbs />
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-2xl font-display">CDI Nudges Console</CardTitle>
                <CardDescription>Review and action real-time Clinical Documentation Integrity prompts.</CardDescription>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Nudges</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto scroll-snap-type-x mandatory snap-mandatory">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Prompt</TableHead>
                    <TableHead>Encounter</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-6 w-20 shimmer-bg" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-full shimmer-bg" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16 shimmer-bg" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24 shimmer-bg" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto shimmer-bg" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredNudges.length > 0 ? (
                    filteredNudges.map((nudge) => (
                      <TableRow key={nudge.id} className="hover:bg-muted/50">
                        <TableCell>
                          <motion.div whileHover={{ scale: 1.05 }}>
                            <Badge variant={getSeverityVariant(nudge.severity)} className="bg-gradient-primary/20 text-gradient font-semibold">{nudge.severity}</Badge>
                          </motion.div>
                        </TableCell>
                        <TableCell className="font-medium max-w-xs sm:max-w-md truncate text-sm sm:text-base">{nudge.prompt}</TableCell>
                        <TableCell className="text-muted-foreground">{nudge.encounter_id}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDistanceToNow(new Date(nudge.created_at), { addSuffix: true })}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="icon" className="h-11 w-11 min-h-[44px]" title="Apply Suggestion" onClick={() => applyNudgeMutation.mutate(nudge.id)} disabled={nudge.status !== 'active'}>
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-11 w-11 min-h-[44px]" title="Dismiss Nudge" disabled={nudge.status !== 'active'}>
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center">
                        <Lightbulb className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                        No nudges found for the selected filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
      <Toaster richColors closeButton />
    </AppLayout>
  );
}