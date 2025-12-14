import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '../ui/button';
import { FilePlus2 } from 'lucide-react';
import { ThemeToggle } from '../ThemeToggle';
import { useIsMobile } from '@/hooks/use-mobile';
type AppLayoutProps = {
  children: React.ReactNode;
};
export function AppLayout({ children }: AppLayoutProps): JSX.Element {
  const navigate = useNavigate();
  const user = useAuth(s => s.user);
  const isMobile = useIsMobile();
  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <div className="relative min-h-screen w-full">
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-14 min-h-[44px] items-center gap-4 border-b bg-background/95 backdrop-blur-sm px-4 sm:px-6">
            <div className="lg:hidden">
              <SidebarTrigger className="h-[44px] w-[44px]" />
            </div>
            <div className="flex-1">
              {/* Optional: Add a search bar or other header content here */}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground hidden sm:inline">
                Welcome, {user?.username}!
              </span>
              <Button size="sm" className="bg-[#0E5FFF] hover:bg-[#0E5FFF]/90 text-white min-h-[44px]" onClick={() => navigate('/')}>
                <FilePlus2 className="mr-0 sm:mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Ingest Note</span>
              </Button>
              <ThemeToggle className="relative top-0 right-0" />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto scroll-snap-type-y mandatory snap-mandatory">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}