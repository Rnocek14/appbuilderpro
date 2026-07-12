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
import Mind from './pages/Mind';
import Memory from './pages/Memory';
import Opportunities from './pages/Opportunities';
import MissionControl from './pages/MissionControl';
import NewProject from './pages/NewProject';
import ImportProject from './pages/ImportProject';
import Autopilot from './pages/Autopilot';
import Queue from './pages/Queue';
import ProjectWorkspace from './pages/ProjectWorkspace';
import Settings from './pages/Settings';
import Pricing from './pages/Pricing';
import Billing from './pages/Billing';
import AdminDashboard from './pages/admin/AdminDashboard';
import ClusterSpike from './pages/spike/ClusterSpike';
import Brain from './pages/Brain';
import Contacts from './pages/Contacts';
import Money from './pages/Money';
import Health from './pages/Health';
import WorkWebs from './pages/WorkWebs';
import WorkWeb from './pages/WorkWeb';
import SystemAltitude from './pages/SystemAltitude';
import { lazy, Suspense as RSuspense } from 'react';
const Universe3D = lazy(() => import('./pages/Universe3D'));
import PreviewEngine from './pages/PreviewEngine';
import PreviewSite from './pages/PreviewSite';
import PreviewReport from './pages/PreviewReport';

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
              {/* ONE MEMORY (design review P2): the nav door; the old rooms stay routable below. */}
              <Route path="/garvis/memory" element={<Protected><Memory /></Protected>} />
              <Route path="/garvis/mind" element={<Protected><Mind /></Protected>} />
              <Route path="/garvis/control" element={<Protected><MissionControl /></Protected>} />
              <Route path="/garvis/marketing" element={<Protected><Marketing /></Protected>} />
              <Route path="/garvis/missions" element={<Protected><Missions /></Protected>} />
              <Route path="/garvis/opportunities" element={<Protected><Opportunities /></Protected>} />
              <Route path="/garvis/brain" element={<Protected><Brain /></Protected>} />
              {/* ONE QUEUE (design review P0): the three triage rooms merged. Old doors redirect —
                  every deep link, toast, and waking move keeps working (merge and relocate). */}
              <Route path="/garvis/queue" element={<Protected><Queue /></Protected>} />
              <Route path="/garvis/inbox" element={<Navigate to="/garvis/queue" replace />} />
              <Route path="/garvis/contacts" element={<Protected><Contacts /></Protected>} />
              <Route path="/garvis/money" element={<Protected><Money /></Protected>} />
              <Route path="/garvis/health" element={<Protected><Health /></Protected>} />
              <Route path="/garvis/approvals" element={<Navigate to="/garvis/queue" replace />} />
              <Route path="/garvis/webs" element={<Protected><WorkWebs /></Protected>} />
              <Route path="/garvis/webs/:worldId" element={<Protected><WorkWeb /></Protected>} />
              <Route path="/garvis/system/:worldId" element={<Protected><SystemAltitude /></Protected>} />
              <Route path="/garvis/universe" element={<Protected><RSuspense fallback={<div className="p-8 text-sm text-forge-dim">Opening the sky…</div>}><Universe3D /></RSuspense></Protected>} />
              {/* ONE SKY: the flat map is the same page's fallback + toggle now, not a second door. */}
              <Route path="/garvis/universe/flat" element={<Navigate to="/garvis/universe?mode=flat" replace />} />
              <Route path="/garvis/explore" element={<Protected><ClusterSpike /></Protected>} />
              <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
              <Route path="/new" element={<Protected><NewProject /></Protected>} />
              <Route path="/import" element={<Protected><ImportProject /></Protected>} />
              <Route path="/autopilot" element={<Protected><Autopilot /></Protected>} />
              <Route path="/inbox" element={<Navigate to="/garvis/queue" replace />} />
              <Route path="/project/:id" element={<Protected><ProjectWorkspace /></Protected>} />
              <Route path="/settings" element={<Protected><Settings /></Protected>} />
              <Route path="/billing" element={<Protected><Billing /></Protected>} />
              <Route path="/admin" element={<Protected adminOnly><AdminDashboard /></Protected>} />
              {/* /spike/clusters removed — same component as /garvis/explore (audit: one page, two doors). */}
              <Route path="/business-preview-engine" element={<Protected><PreviewEngine /></Protected>} />
              {/* PUBLIC — the link business owners open from the outreach email (no login). */}
              <Route path="/preview-site/:slug" element={<PreviewSite />} />
              <Route path="/preview-site/:slug/email-shot" element={<PreviewSite shot />} />
              <Route path="/preview-site/:slug/report" element={<PreviewReport />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
