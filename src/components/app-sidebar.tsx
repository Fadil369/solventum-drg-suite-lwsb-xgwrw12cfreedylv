import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Bot, FileText, Lightbulb, Settings, Scale, LogOut, Users } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarSeparator,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/hooks/use-language';
import type { TranslationKey } from '@/i18n/translations';
const navItems: { href: string; labelKey: TranslationKey; icon: typeof LayoutDashboard }[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/coding-workspace', labelKey: 'nav.codingWorkspace', icon: Bot },
  { href: '/claims-manager', labelKey: 'nav.claimsManager', icon: FileText },
  { href: '/cdi-nudges', labelKey: 'nav.cdiNudges', icon: Lightbulb },
];
const adminNavItems: { href: string; labelKey: TranslationKey; icon: typeof Settings }[] = [
  { href: '/integration', labelKey: 'nav.integration', icon: Settings },
  { href: '/audit-reconciliation', labelKey: 'nav.auditReconciliation', icon: Scale },
  { href: '/accounts', labelKey: 'nav.accounts', icon: Users },
];
export function AppSidebar(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuth(s => s.user);
  const logout = useAuth(s => s.logout);
  const { t, isRtl } = useLanguage();
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  return (
    <Sidebar side={isRtl ? 'right' : 'left'}>
      <SidebarHeader>
        <Link to="/" className="flex items-center gap-2 px-2 py-1">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary" />
          <span className="text-lg font-bold font-display">{t('appName')}</span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex flex-col justify-between h-full">
        <div className="space-y-2">
          <SidebarGroup>
            <SidebarMenu className="space-y-1">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={location.pathname.startsWith(item.href)} className="h-[44px] data-[state=open]:bg-accent/50">
                    <Link to={item.href}>
                      <item.icon className="size-5 sm:size-4 me-2 sm:me-3" />
                      <span className="text-sm">{t(item.labelKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          {user?.role === 'admin' && (
            <>
              <SidebarSeparator />
              <SidebarGroup>
                <SidebarGroupLabel>{t('nav.admin')}</SidebarGroupLabel>
                <SidebarMenu className="space-y-1">
                  {adminNavItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={location.pathname.startsWith(item.href)} className="h-[44px]">
                        <Link to={item.href}>
                          <item.icon className="size-5 sm:size-4 me-2 sm:me-3" />
                          <span className="text-sm">{t(item.labelKey)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            </>
          )}
        </div>
        <div className="mt-auto">
          <SidebarSeparator />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout} className="h-[44px]">
                <LogOut className="size-5 sm:size-4 me-2 sm:me-3" />
                <span className="text-sm">{t('nav.logout')}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-2 text-xs text-muted-foreground">
          {t('nav.loggedInAs')} {user?.username} ({user?.role})
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
