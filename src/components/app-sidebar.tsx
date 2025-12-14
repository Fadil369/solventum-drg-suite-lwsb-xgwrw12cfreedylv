import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Bot, FileText, Lightbulb, Settings, Scale, LogOut } from 'lucide-react';
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
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/coding-workspace', label: 'Coding Workspace', icon: Bot },
  { href: '/claims-manager', label: 'Claims Manager', icon: FileText },
  { href: '/cdi-nudges', label: 'CDI Nudges', icon: Lightbulb },
];
const adminNavItems = [
  { href: '/integration', label: 'Integration', icon: Settings },
  { href: '/audit-reconciliation', label: 'Audit & Reconciliation', icon: Scale },
];
export function AppSidebar(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuth(s => s.user);
  const logout = useAuth(s => s.logout);
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  return (
    <Sidebar>
      <SidebarHeader>
        <Link to="/" className="flex items-center gap-2 px-2 py-1">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary" />
          <span className="text-lg font-bold font-display">BrainSAIT</span>
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
                      <item.icon className="size-5 sm:size-4 mr-2 sm:mr-3" />
                      <span className="text-sm">{item.label}</span>
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
                <SidebarGroupLabel>Admin</SidebarGroupLabel>
                <SidebarMenu className="space-y-1">
                  {adminNavItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={location.pathname.startsWith(item.href)} className="h-[44px]">
                        <Link to={item.href}>
                          <item.icon className="size-5 sm:size-4 mr-2 sm:mr-3" />
                          <span className="text-sm">{item.label}</span>
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
                <LogOut className="size-5 sm:size-4 mr-2 sm:mr-3" />
                <span className="text-sm">Logout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-2 text-xs text-muted-foreground">
          Logged in as {user?.username} ({user?.role})
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}