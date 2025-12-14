import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
}
export function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const isAuthenticated = useAuth(s => s.isAuthenticated);
  const user = useAuth(s => s.user);
  const location = useLocation();
  if (!isAuthenticated) {
    // Redirect them to the /login page, but save the current location they were
    // trying to go to. This allows us to send them along to that page after they
    // log in, which is a nicer user experience than dropping them off on the home page.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (adminOnly && user?.role !== 'admin') {
    // Redirect to a more appropriate page if not an admin, e.g., dashboard
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}