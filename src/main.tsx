import '@/lib/errorReporter';
import { enableMapSet } from "immer";
enableMapSet();
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import '@/index.css'
import { HomePage } from '@/pages/HomePage'
import { CodingWorkspace } from '@/pages/CodingWorkspace';
import { Dashboard } from '@/pages/Dashboard';
import { ClaimsManager } from '@/pages/ClaimsManager';
import { CDINudgesConsole } from '@/pages/CDINudgesConsole';
import { IntegrationConsole } from '@/pages/IntegrationConsole';
import { AuditReconciliation } from '@/pages/AuditReconciliation';
import { Login } from '@/pages/Login';
import { ProtectedRoute } from '@/components/ProtectedRoute';
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
    },
  },
});
const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/login",
    element: <Login />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/dashboard",
    element: <ProtectedRoute><Dashboard /></ProtectedRoute>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/claims-manager",
    element: <ProtectedRoute><ClaimsManager /></ProtectedRoute>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/coding-workspace",
    element: <ProtectedRoute><CodingWorkspace /></ProtectedRoute>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/cdi-nudges",
    element: <ProtectedRoute><CDINudgesConsole /></ProtectedRoute>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/integration",
    element: <ProtectedRoute adminOnly={true}><IntegrationConsole /></ProtectedRoute>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/audit-reconciliation",
    element: <ProtectedRoute adminOnly={true}><AuditReconciliation /></ProtectedRoute>,
    errorElement: <RouteErrorBoundary />,
  },
]);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
)