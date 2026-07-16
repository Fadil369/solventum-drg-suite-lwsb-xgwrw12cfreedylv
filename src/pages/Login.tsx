import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Toaster, toast } from 'sonner';
import { useLanguage } from '@/hooks/use-language';
export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuth(s => s.login);
  const isAuthenticated = useAuth(s => s.isAuthenticated);
  const { t, isRtl } = useLanguage();
  const from = location.state?.from?.pathname || '/dashboard';
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(username, password);
      toast.success(isRtl ? 'تم تسجيل الدخول بنجاح!' : 'Login successful!');
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isRtl ? 'فشل تسجيل الدخول' : 'Login failed'));
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/40 p-4">
      <div className="fixed top-4 end-4 flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle className="relative top-0 right-0" />
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex items-center justify-center">
        <Card className="w-full max-w-sm animate-fade-in">
          <form onSubmit={handleSubmit}>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-10 w-10 rounded-lg bg-gradient-to-br from-[#0E5FFF] to-[#083e9e]" />
              <CardTitle className="text-2xl font-display">{t('login.title')}</CardTitle>
              <CardDescription>{t('appName')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t('login.username')}</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="admin or coder"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('login.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full bg-[#0E5FFF] hover:bg-[#0E5FFF]/90 text-white" disabled={isLoading}>
                {isLoading ? t('common.loading') : t('login.submit')}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
      <Toaster richColors closeButton />
    </div>
  );
}