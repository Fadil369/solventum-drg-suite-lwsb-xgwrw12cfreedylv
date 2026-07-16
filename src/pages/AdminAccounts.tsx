import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { UserPlus, ShieldCheck, User as UserIcon, Trash2 } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { api } from '@/lib/api-client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
interface SafeAccount {
  id: string;
  username: string;
  role: 'admin' | 'coder';
}
export function AdminAccounts() {
  const queryClient = useQueryClient();
  const { t, isRtl } = useLanguage();
  const currentUser = useAuth((s) => s.user);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'coder'>('coder');
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api<SafeAccount[]>('/api/accounts'),
  });
  const createMutation = useMutation({
    mutationFn: () => api<SafeAccount>('/api/accounts', { method: 'POST', body: JSON.stringify({ username, password, role }) }),
    onSuccess: () => {
      toast.success(t('accounts.createSuccess'));
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setDialogOpen(false);
      setUsername('');
      setPassword('');
      setRole('coder');
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('accounts.deleteSuccess'));
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 lg:py-12">
        <Breadcrumbs />
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle>{t('accounts.title')}</CardTitle>
                <CardDescription>{t('accounts.description')}</CardDescription>
              </div>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="min-h-[44px] active:scale-95">
                    <UserPlus className="me-2 h-4 w-4" />
                    {t('accounts.newAccount')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createMutation.mutate();
                    }}
                  >
                    <DialogHeader>
                      <DialogTitle>{t('accounts.newAccount')}</DialogTitle>
                      <DialogDescription>{t('accounts.description')}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-username">{t('accounts.username')}</Label>
                        <Input id="new-username" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-password">{t('accounts.password')}</Label>
                        <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
                        <p className="text-xs text-muted-foreground">{t('accounts.passwordHint')}</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-role">{t('accounts.role')}</Label>
                        <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'coder')}>
                          <SelectTrigger id="new-role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="coder">{t('accounts.role.coder')}</SelectItem>
                            <SelectItem value="admin">{t('accounts.role.admin')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createMutation.isPending} className="min-h-[44px]">
                        {createMutation.isPending ? t('accounts.creating') : t('accounts.create')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('accounts.username')}</TableHead>
                    <TableHead>{t('accounts.role')}</TableHead>
                    <TableHead className="text-end">{t('accounts.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-32 shimmer-bg" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-20 shimmer-bg" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-8 shimmer-bg ms-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : accounts && accounts.length > 0 ? (
                    accounts.map((a) => {
                      const isSelf = a.username === currentUser?.username;
                      return (
                        <TableRow key={a.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium">
                            {a.username}
                            {isSelf && <span className="text-xs text-muted-foreground ms-2">({t('accounts.you')})</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={a.role === 'admin' ? 'default' : 'secondary'}>
                              {a.role === 'admin' ? <ShieldCheck className="me-1 h-3 w-3" /> : <UserIcon className="me-1 h-3 w-3" />}
                              {a.role === 'admin' ? t('accounts.role.admin') : t('accounts.role.coder')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-end">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" disabled={isSelf} className="h-9 w-9 text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('accounts.deleteConfirmTitle')}</AlertDialogTitle>
                                  <AlertDialogDescription>{t('accounts.deleteConfirmDesc')}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteMutation.mutate(a.username)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    {t('accounts.delete')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        {t('accounts.empty')}
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
