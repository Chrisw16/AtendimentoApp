import { lazy, Suspense, useState } from 'react';
import { Routes, Route, Navigate, BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStore } from './store';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import Toast from './components/ui/Toast';
import styles from './App.module.css';

// ── LAZY PAGES ──────────────────────────────────────────────────
const Login       = lazy(() => import('./pages/Login'));
const Dashboard   = lazy(() => import('./pages/Dashboard'));
const Chat        = lazy(() => import('./pages/Chat'));
const Historico   = lazy(() => import('./pages/Historico'));
const Satisfacao  = lazy(() => import('./pages/Satisfacao'));
const Agentes     = lazy(() => import('./pages/Agentes'));
const Fluxos      = lazy(() => import('./pages/Fluxos'));
const FluxoEditor = lazy(() => import('./pages/FluxoEditor'));
const Canais      = lazy(() => import('./pages/Canais'));
const Clientes    = lazy(() => import('./pages/Clientes'));
const Ocorrencias = lazy(() => import('./pages/Ocorrencias'));
const OrdensServico = lazy(() => import('./pages/OrdensServico'));
const Cobertura   = lazy(() => import('./pages/Cobertura'));
const MonitorRede = lazy(() => import('./pages/MonitorRede'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));
const Analytics     = lazy(() => import('./pages/stubs.jsx').then(m => ({ default: m.Analytics })));


const Loading = () => (
  <div className={styles.loading}>
    <span className="spinner spinner-lg" aria-label="Carregando..." />
  </div>
);

// ── GUARDS ──────────────────────────────────────────────────────
function PrivateRoute({ children }) {
  const token = useStore(s => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const role = useStore(s => s.role);
  if (role !== 'admin') return <Navigate to="/chat" replace />;
  return children;
}

// ── QUERY CLIENT ─────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ── APP LAYOUT ───────────────────────────────────────────────────
function AppLayout() {
  const [cmdOpen, setCmdOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Topbar onCommandPalette={() => setCmdOpen(true)} />
        <main className={styles.content} role="main">
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/"             element={<AdminRoute><Dashboard /></AdminRoute>} />
              <Route path="/chat"         element={<Chat />} />
              <Route path="/historico"    element={<Historico />} />
              <Route path="/satisfacao"   element={<Satisfacao />} />
              <Route path="/agentes"      element={<AdminRoute><Agentes /></AdminRoute>} />
              <Route path="/fluxos"       element={<AdminRoute><Fluxos /></AdminRoute>} />
              <Route path="/fluxos/:id"   element={<AdminRoute><FluxoEditor /></AdminRoute>} />
              <Route path="/canais"       element={<AdminRoute><Canais /></AdminRoute>} />
              <Route path="/analytics"    element={<AdminRoute><Analytics /></AdminRoute>} />
              <Route path="/clientes"     element={<Clientes />} />
              <Route path="/ocorrencias"  element={<Ocorrencias />} />
              <Route path="/ordens"       element={<OrdensServico />} />
              <Route path="/cobertura"    element={<Cobertura />} />
              <Route path="/rede"         element={<AdminRoute><MonitorRede /></AdminRoute>} />
              <Route path="/configuracoes" element={<AdminRoute><Configuracoes /></AdminRoute>} />
              <Route path="*"             element={<Navigate to="/chat" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <Toast />
    </div>
  );
}

// ── ROOT ─────────────────────────────────────────────────────────
export default function App() {
  const token = useStore(s => s.token);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
            <Route
              path="/*"
              element={
                <PrivateRoute>
                  <AppLayout />
                </PrivateRoute>
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
