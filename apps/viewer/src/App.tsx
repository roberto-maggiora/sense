import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/sites" element={<SitesPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/device/:id" element={<DeviceDetails />} />
            <Route path="/my-company/users" element={<ClientAdminRoute><MyCompanyUsersPage /></ClientAdminRoute>} />
            <Route path="/admin/clients" element={<SuperAdminRoute><AdminClientsPage /></SuperAdminRoute>} />
            <Route path="/admin/users" element={<SuperAdminRoute><AdminUsersPage /></SuperAdminRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

