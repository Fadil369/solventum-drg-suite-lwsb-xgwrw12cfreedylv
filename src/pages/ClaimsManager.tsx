import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, RotateCw, Eye } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { Claim } from '@shared/types';
import { format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
const getStatusVariant = (status: Claim['status']) => {
  switch (status) {
    case 'FC_3': return 'default';
    case 'SENT': return 'default';
    case 'REJECTED': return 'destructive';
    case 'NEEDS_REVIEW': return 'secondary';
    case 'DRAFT': return 'outline';
    default: return 'outline';
  }
};
export function ClaimsManager() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['claims', { limit: 20 }],
    queryFn: () => api<{ items: Claim[] }>('/api/claims', { params: { limit: 20 } }),
  });
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);
  if (error) toast.error('Failed to load claims data.');
  const filteredClaims = useMemo(() => {
    if (!data?.items) return [];
    return data.items.filter(claim => {
      const matchesText = debouncedSearchTerm ? claim.claim_number.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) : true;
      const matchesStatus = statusFilter !== 'all' ? claim.status === statusFilter : true;
      return matchesText && matchesStatus;
    });
  }, [data, debouncedSearchTerm, statusFilter]);
  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      const json = JSON.stringify(filteredClaims, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'brainsait-claims_export.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Claims exported successfully.');
      setIsExporting(false);
    }, 500);
  };
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 lg:py-12">
        <Breadcrumbs />
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-2xl font-display">Claims Manager</CardTitle>
                <CardDescription>Search, filter, and manage all claims.</CardDescription>
              </div>
              <Button onClick={handleExport} variant="outline" disabled={isExporting} className={cn("min-h-[44px]", isExporting && "shimmer-bg")}>
                {isExporting ? <RotateCw className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {isExporting ? 'Exporting...' : 'Export JSON'}
              </Button>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-4">
              <Input
                placeholder="Filter by Claim #"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:max-w-sm focus:ring-2 focus:ring-blue-500 shadow-glow"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="SENT">Sent</SelectItem>
                  <SelectItem value="FC_3">Approved (FC_3)</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="NEEDS_REVIEW">Needs Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto scroll-snap-type-x mandatory snap-mandatory">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Submitted At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-32 shimmer-bg" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-24 shimmer-bg" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20 shimmer-bg" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28 shimmer-bg" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto shimmer-bg" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredClaims.length > 0 ? (
                    filteredClaims.map((claim, index) => (
                      <motion.tr
                        key={claim.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        className="hover:shadow-lg transform hover:-translate-y-px transition-all duration-200 even:bg-muted/30"
                      >
                        <TableCell className="font-medium text-sm sm:text-base">{claim.claim_number}</TableCell>
                        <TableCell><Badge variant={getStatusVariant(claim.status)} className="bg-gradient-primary/20 text-primary">{claim.status}</Badge></TableCell>
                        <TableCell>SAR {claim.amount.toLocaleString()}</TableCell>
                        <TableCell>{claim.submitted_at ? format(new Date(claim.submitted_at), 'PPp') : 'N/A'}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="icon" className="h-[44px] w-[44px]"><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-[44px] w-[44px]"><RotateCw className="h-4 w-4" /></Button>
                        </TableCell>
                      </motion.tr>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center">
                        No claims found.
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