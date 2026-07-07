import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Spinner } from './components/ui';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import OAuthCallback from './pages/OAuthCallback';
import Dashboard from './pages/Dashboard';
import Garvis from './pages/Garvis';
import Marketing from './pages/Marketing';
import Missions from './pages/Missions';
import Command from './pages/Command';
import Opportunities from './pages/Opportunities';
import MissionControl from './pages/MissionControl';
import NewProject from './pages/NewProject';
import ImportProject from './pages/ImportProject';
import Autopilot from './pages/Autopilot';
import Inbox from './pages/Inbox';
import ProjectWorkspace from './pages/ProjectWorkspace';
import Settings from './pages/Settings';
import Pricing from './pages/Pricing';
import Billing from './pages/Billing';
import AdminDashboard from './pages/admin/AdminDashboard';
import ClusterSpike from './pages/spike/ClusterSpike';
import PreviewEngine from './pages/PreviewEngine';
import PreviewSite from './pages/PreviewSite';

function Protected({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner label="Stoking the forge…" /></div>;
  }
  if (!session) return <Navigate to="/auth" state={{ from: location }} replace />;
  if (adminOnly && profile?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/garvis" element={<Protected><Garvis /></Protected>} />
              <Route path="/garvis/command" element={<Protected><Command /></Protected>} />
              <Route path="/garvis/control" element={<Protected><MissionControl /></Protected>} />
              <Route path="/garvis/marketing" element={<Protected><Marketing /></Protected>} />
              <Route path="/garvis/missions" element={<Protected><Missions /></Protected>} />
              <Route path="/garvis/opportunities" element={<Protected><Opportunities /></Protected>} />
              <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
              <Route path="/new" element={<Protected><NewProject /></Protected>} />
              <Route path="/import" element={<Protected><ImportProject /></Protected>} />
              <Route path="/autopilot" element={<Protected><Autopilot /></Protected>} />
              <Route path="/inbox" element={<Protected><Inbox /></Protected>} />
              <Route path="/project/:id" element={<Protected><ProjectWorkspace /></Protected>} />
              <Route path="/settings" element={<Protected><Settings /></Protected>} />
              <Route path="/billing" element={<Protected><Billing /></Protected>} />
              <Route path="/admin" element={<Protected adminOnly><AdminDashboard /></Protected>} />
              <Route path="/spike/clusters" element={<Protected><ClusterSpike /></Protected>} />
              <Route path="/business-preview-engine" element={<Protected><PreviewEngine /></Protected>} />
              {/* PUBLIC — the link business owners open from the outreach email (no login). */}
              <Route path="/preview-site/:slug" element={<PreviewSite />} />
              <Route path="/preview-site/:slug/email-shot" element={<PreviewSite shot />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
