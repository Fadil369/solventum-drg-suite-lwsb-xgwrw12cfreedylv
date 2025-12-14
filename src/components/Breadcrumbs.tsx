import { Link, useLocation } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import React from 'react';
const ROUTE_MAP: Record<string, string> = {
  dashboard: 'Dashboard',
  'claims-manager': 'Claims Manager',
  'coding-workspace': 'Coding Workspace',
  'cdi-nudges': 'CDI Nudges',
  integration: 'Integration Console',
  'audit-reconciliation': 'Audit & Reconciliation',
};
export function Breadcrumbs() {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);
  if (pathnames.length === 0) {
    return null;
  }
  return (
    <Breadcrumb className="hidden md:flex mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/dashboard">Dashboard</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {pathnames.map((value, index) => {
          const last = index === pathnames.length - 1;
          const to = `/${pathnames.slice(0, index + 1).join('/')}`;
          const label = ROUTE_MAP[value] || value.charAt(0).toUpperCase() + value.slice(1);
          if (value === 'dashboard' && index === 0 && pathnames.length > 1) {
            return null;
          }
          if (value === 'dashboard' && index === 0 && pathnames.length === 1) {
             return (
                <React.Fragment key={to}>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage>{label}</BreadcrumbPage>
                    </BreadcrumbItem>
                </React.Fragment>
             )
          }
          return last ? (
            <React.Fragment key={to}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{label}</BreadcrumbPage>
              </BreadcrumbItem>
            </React.Fragment>
          ) : (
            <React.Fragment key={to}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={to}>{label}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}