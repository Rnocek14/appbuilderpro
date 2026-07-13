import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Spinner } from './components/ui';

// The unauthenticated entry surface stays eager — it's the first paint and must not flash a spinner.
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import OAuthCallback from './pages/OAuthCallback';

// Every workspace behind auth (and the heavy public preview pages) is code-split, so the main bundle
// no longer carries Monaco, Sandpack, three.js, pdf.js, Recharts, xterm, etc. up front — each route
// pulls its own chunk on navigation. A per-route error boundary + Suspense wraps them all below.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Garvis = lazy(() => import('./pages/Garvis'));
const Marketing = lazy(() => import('./pages/Marketing'));
const Missions = lazy(() => import('./pages/Missions'));
const Command = lazy(() => import('./pages/Command'));
const Mind = lazy(() => import('./pages/Mind'));
const Memory = lazy(() => import('./pages/Memory'));
const Opportunities = lazy(() => import('./pages/Opportunities'));
const MissionControl = lazy(() => import('./pages/MissionControl'));
const NewProject = lazy(() => import('./pages/NewProject'));
const ImportProject = lazy(() => import('./pages/ImportProject'));
const Autopilot = lazy(() => import('./pages/Autopilot'));
const Queue = lazy(() => import('./pages/Queue'));
const ProjectWorkspace = lazy(() => import('./pages/ProjectWorkspace'));
const Settings = lazy(() => import('./pages/Settings'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Billing = lazy(() => import('./pages/Billing'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const ClusterSpike = lazy(() => import('./pages/spike/ClusterSpike'));
const Brain = lazy(() => import('./pages/Brain'));
const Contacts = lazy(() => import('./pages/Contacts'));
const Money = lazy(() => import('./pages/Money'));
const Health = lazy(() => import('./pages/Health'));
const ClientReadiness = lazy(() => import('./pages/ClientReadiness'));
const WorkWebs = lazy(() => import('./pages/WorkWebs'));
const WorkWeb = lazy(() => import('./pages/WorkWeb'));
const SystemAltitude = lazy(() => import('./pages/SystemAltitude'));
const Universe3D = lazy(() => import('./pages/Universe3D'));
const PreviewEngine = lazy(() => import('./pages/PreviewEngine'));
const PreviewSite = lazy(() => import('./pages/PreviewSite'));
const PreviewReport = lazy(() => import('./pages/PreviewReport'));

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

function AppRoutes() {
  const location = useLocation();
  return (
    // resetKey = pathname: a page crash shows the recoverable card, and navigating away clears it —
    // a crash in one workspace no longer strands the whole app (no remount on ordinary navigation).
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Spinner label="Loading…" /></div>}>
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
          <Route path="/garvis/setup" element={<Protected><ClientReadiness /></Protected>} />
          <Route path="/garvis/approvals" element={<Navigate to="/garvis/queue" replace />} />
          <Route path="/garvis/webs" element={<Protected><WorkWebs /></Protected>} />
          <Route path="/garvis/webs/:worldId" element={<Protected><WorkWeb /></Protected>} />
          <Route path="/garvis/system/:worldId" element={<Protected><SystemAltitude /></Protected>} />
          <Route path="/garvis/universe" element={<Protected><Universe3D /></Protected>} />
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
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
