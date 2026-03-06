import { BrowserRouter, Routes, Route, Navigate, Outlet, Link } from "react-router-dom";
import AppShell from "./components/AppShell";
import Dashboard from "./components/Dashboard";
import DevicesPage from "./components/DevicesPage";
import AlertsPage from "./pages/Alerts";
import DeviceDetails from "./components/DeviceDetails";
import SitesPage from "./pages/Sites";
import AdminClientsPage from "./pages/AdminClients";
import AdminUsersPage from "./pages/AdminUsers";
import LoginPage from "./pages/Login";
import MyCompanyUsersPage from "./pages/MyCompanyUsers";
import ReportsPage from "./pages/Reports";
import ReportCenterPage from "./pages/ReportCenter";
import { AuthProvider, useAuth } from "./lib/auth";
import { isSuperAdmin, canManageCompanyUsers } from "./lib/roles";

function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950">Loading session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user && !isSuperAdmin(user)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function ClientAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user && !canManageCompanyUsers(user)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function ClientScopedRoute() {
  const { user, loading, selectedClientId } = useAuth();

  if (loading) return null;

  const superAdmin = user ? isSuperAdmin(user) : false;

  // If super admin and no client is selected, show empty state instead of rendering the route
  if (superAdmin && !selectedClientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-inner">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          Select a client to view data
        </h2>
        <p className="text-slate-500 max-w-md mb-8">
          You are logged in as a Super Admin. To view the dashboard, devices, or alerts, please select a client from the directory to impersonate their workspace.
        </p>
        <Link
          to="/admin/clients"
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm"
        >
          Go to Clients Directory
        </Link>
      </div>
    );
  }

  // Passing key={selectedClientId} forces React to unmount and remount ALL child 
  // components when the impersonation target changes. This completely obliterates 
  // any internal state/cache inside Dashboard, Devices, etc., guaranteeing zero stale data.
  return <Outlet key={selectedClientId || 'self'} />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<ClientScopedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/devices" element={<DevicesPage />} />
              <Route path="/sites" element={<SitesPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/device/:id" element={<DeviceDetails />} />
              <Route path="/reports" element={<ReportCenterPage />} />
              <Route path="/reports/asset-compliance" element={<ReportsPage />} />
            </Route>
            <Route path="/my-company/users" element={<ClientAdminRoute><MyCompanyUsersPage /></ClientAdminRoute>} />
            <Route path="/admin/clients" element={<SuperAdminRoute><AdminClientsPage /></SuperAdminRoute>} />
            <Route path="/admin/users" element={<SuperAdminRoute><AdminUsersPage /></SuperAdminRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

