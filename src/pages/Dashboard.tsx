import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Clock, FileText, Lightbulb, Percent } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { Claim, CodingJob, Nudge } from '@shared/types';
import { AppLayout } from '@/components/layout/AppLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};
const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
  },
};
const StatCard = ({ title, value, icon, isLoading, linkTo, children }: { title: string; value: string | number; icon: React.ReactNode; isLoading?: boolean; linkTo?: string; children?: React.ReactNode }) => {
  const cardContent = (
    <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1.5 active:scale-98 duration-300 rounded-xl transition-all">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-1/2 shimmer-bg" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        {children}
      </CardContent>
    </Card>
  );
  return linkTo ? <Link to={linkTo} className="focus:outline-none focus:ring-2 focus:ring-ring rounded-lg">{cardContent}</Link> : cardContent;
};
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
const PIE_COLORS = ['#0E5FFF', '#F38020', '#0F172A'];
export function Dashboard() {
  const { data: claimsData, isLoading: isLoadingClaims } = useQuery({
    queryKey: ['claims', { limit: 5 }],
    queryFn: () => api<{ items: Claim[] }>('/api/claims', { params: { limit: 5 } }),
  });
  const { data: jobsData, isLoading: isLoadingJobs } = useQuery({
    queryKey: ['coding-jobs', { limit: 5 }],
    queryFn: () => api<{ items: CodingJob[] }>('/api/coding-jobs', { params: { limit: 5 } }),
  });
  const { data: nudgesData, isLoading: isLoadingNudges } = useQuery({
    queryKey: ['nudges'],
    queryFn: () => api<{ items: Nudge[] }>('/api/nudges'),
  });
  const { data: analyticsData, isLoading: isLoadingAnalytics, error: analyticsError } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api<{ accuracy: number; claimStats: { approved: number; rejected: number; totalAmount: number } }>('/api/analytics'),
  });
  if (analyticsError) toast.error('Failed to load analytics data.');
  const pendingJobs = jobsData?.items?.filter(j => j.status === 'NEEDS_REVIEW').length ?? 0;
  const activeNudges = nudgesData?.items?.filter(n => n.status === 'active').length ?? 0;
  const claimStatusData = [
    { name: 'Approved', value: analyticsData?.claimStats.approved ?? 0 },
    { name: 'Rejected', value: analyticsData?.claimStats.rejected ?? 0 },
  ];
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 lg:py-12">
        <Breadcrumbs />
        <motion.div
          className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <StatCard title="Total Claims Value" value={`SAR ${analyticsData?.claimStats.totalAmount.toLocaleString() ?? '0'}`} icon={<FileText className="h-4 w-4 text-muted-foreground" />} isLoading={isLoadingAnalytics} linkTo="/claims-manager" />
          </motion.div>
          <motion.div variants={itemVariants}>
            <StatCard title="Avg. Coding Accuracy" value={`${analyticsData?.accuracy ?? 0}%`} icon={<Percent className="h-4 w-4 text-muted-foreground" />} isLoading={isLoadingAnalytics}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${analyticsData?.accuracy ?? 0}%` }} transition={{ type: 'spring', stiffness: 50, damping: 20 }}>
                <Progress value={analyticsData?.accuracy} className="h-2 mt-2" />
              </motion.div>
            </StatCard>
          </motion.div>
          <motion.div variants={itemVariants}>
            <StatCard title="Pending Coding Jobs" value={pendingJobs} icon={<Clock className="h-4 w-4 text-muted-foreground" />} isLoading={isLoadingJobs} linkTo="/coding-workspace" />
          </motion.div>
          <motion.div variants={itemVariants}>
            <StatCard title="Active CDI Nudges" value={activeNudges} icon={<Lightbulb className="h-4 w-4 text-muted-foreground" />} isLoading={isLoadingNudges} linkTo="/cdi-nudges" />
          </motion.div>
        </motion.div>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 mt-8">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent Claims</CardTitle>
              <CardDescription>A view of the latest claims processed by the system.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border scroll-snap-type-x mandatory snap-mandatory">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim #</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingClaims ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-24 shimmer-bg" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-20 shimmer-bg" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16 shimmer-bg" /></TableCell>
                        </TableRow>
                      ))
                    ) : claimsData?.items && claimsData.items.length > 0 ? (
                      claimsData.items.map(claim => (
                        <TableRow key={claim.id} className="transition-colors hover:bg-muted/50">
                          <TableCell className="font-medium">{claim.claim_number}</TableCell>
                          <TableCell><Badge variant={getStatusVariant(claim.status)}>{claim.status}</Badge></TableCell>
                          <TableCell>SAR {claim.amount.toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow><TableCell colSpan={3} className="text-center h-24">No recent claims found.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Claim Status Overview</CardTitle>
              <CardDescription>Approved vs. Rejected claims.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingAnalytics ? (
                <div className="flex justify-center items-center h-[200px] sm:h-[250px] md:h-[300px]">
                  <Skeleton className="h-48 w-48 rounded-full shimmer-bg" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={claimStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                      {claimStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <Toaster richColors closeButton />
    </AppLayout>
  );
}