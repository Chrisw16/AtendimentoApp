import React, { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { api } from './api';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Toast from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import CommandPalette from './components/CommandPalette';
import useNotifications from './hooks/useNotifications';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Agentes = lazy(() => import('./pages/Agentes'));
const Chat = lazy(() => import('./pages/Chat'));
const Canais = lazy(() => import('./pages/Canais'));
const Respostas = lazy(() => import('./pages/Respostas'));
const Horario = lazy(() => import('./pages/Horario'));
const Satisfacao = lazy(() => import('./pages/Satisfacao'));
const Prompt = lazy(() => import('./pages/Prompt'));
const Logs = lazy(() => import('./pages/Logs'));
const Sessoes = lazy(() => import('./pages/Sessoes'));
const Integracoes = lazy(() => import('./pages/Integracoes'));
const TiposOcorrencia = lazy(() => import('./pages/TiposOcorrencia'));
const CadastroLead = lazy(() => import('./pages/CadastroLead'));
const CidadesPlanos = lazy(() => import('./pages/CidadesPlanos'));
const Equipe = lazy(() => import('./pages/Equipe'));
const PromptsIA = lazy(() => import('./pages/PromptsIA'));
const Alertas = lazy(() => import('./pages/Alertas'));
const Reativacao = lazy(() => import('./pages/Reativacao'));
const Relatorio = lazy(() => import('./pages/Relatorio'));
const MeuPainel = lazy(() => import('./pages/MeuPainel'));
const Cobertura = lazy(() => import('./pages/Cobertura'));
const Fluxos = lazy(() => import('./pages/Fluxos'));
const FluxoEditor = lazy(() => import('./pages/FluxoEditor'));
const MonitorRede = lazy(() => import('./pages/MonitorRede'));
const DispositivosCPE = lazy(() => import('./pages/DispositivosCPE'));
const GatewaySMS = lazy(() => import('./pages/GatewaySMS'));
const WaTemplates = lazy(() => import('./pages/WaTemplates'));
const WaFlows     = lazy(() => import('./pages/WaFlows'));

const Loading = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
    <span className="spinner spinner-lg" aria-label="Carregando..." />
  </div>
);

function AdminOnly({ children }) {
  const role = useStore(s => s.role);
  if (role !== 'admin') return <Navigate to="/chat" replace />;
  return children;
}

function AppLayout() {
  const role = useStore(s => s.role);
  const defaultRoute = role === 'admin' ? '/' : '/chat';
  useNotifications();

  useEffect(() => {
    const hb = () => api('/api/agentes/monitor/heartbeat', { method: 'POST', body: '{}' }).catch(() => {});
    const logout = () => {
      const token = localStorage.getItem('maxxi_token') || '';
      navigator.sendBeacon?.(
        window.location.origin + '/admin/api/agentes/monitor/logout-beacon?token=' + encodeURIComponent(token),
        ''
      );
    };
    const onVisibility = () => {
      if (!document.hidden) hb();
    };

    hb();
    const t = setInterval(hb, 15000);
    window.addEventListener('beforeunload', logout);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(t);
      window.removeEventListener('beforeunload', logout);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-area">
        <Topbar />
        <main className="content" id="main-content" tabIndex={-1}>
          <ErrorBoundary>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<AdminOnly><Dashboard /></AdminOnly>} />
                <Route path="/agentes" element={<AdminOnly><Agentes /></AdminOnly>} />
                <Route path="/canais" element={<AdminOnly><Canais /></AdminOnly>} />
                <Route path="/respostas" element={<AdminOnly><Respostas /></AdminOnly>} />
                <Route path="/horario" element={<AdminOnly><Horario /></AdminOnly>} />
                <Route path="/satisfacao" element={<AdminOnly><Satisfacao /></AdminOnly>} />
                <Route path="/prompt" element={<AdminOnly><Prompt /></AdminOnly>} />
                <Route path="/logs" element={<AdminOnly><Logs /></AdminOnly>} />
                <Route path="/sessoes" element={<AdminOnly><Sessoes /></AdminOnly>} />
                <Route path="/integracoes" element={<AdminOnly><Integracoes /></AdminOnly>} />
                <Route path="/tipos-ocorrencia" element={<AdminOnly><TiposOcorrencia /></AdminOnly>} />
                <Route path="/cadastro-lead" element={<CadastroLead />} />
                <Route path="/cidades-planos" element={<AdminOnly><CidadesPlanos /></AdminOnly>} />
                <Route path="/equipe" element={<AdminOnly><Equipe /></AdminOnly>} />
                <Route path="/prompts-ia" element={<AdminOnly><PromptsIA /></AdminOnly>} />
                <Route path="/alertas" element={<AdminOnly><Alertas /></AdminOnly>} />
                <Route path="/reativacao" element={<AdminOnly><Reativacao /></AdminOnly>} />
                <Route path="/relatorio" element={<AdminOnly><Relatorio /></AdminOnly>} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/meu-painel" element={<MeuPainel />} />
                <Route path="/cobertura" element={<AdminOnly><Cobertura /></AdminOnly>} />
                <Route path="/fluxos" element={<AdminOnly><Fluxos /></AdminOnly>} />
                <Route path="/fluxos/:id" element={<AdminOnly><FluxoEditor /></AdminOnly>} />
                <Route path="/monitor-rede" element={<AdminOnly><MonitorRede /></AdminOnly>} />
                <Route path="/dispositivos-cpe" element={<AdminOnly><DispositivosCPE /></AdminOnly>} />
                <Route path="/gateway-sms" element={<AdminOnly><GatewaySMS /></AdminOnly>} />
                <Route path="/wa-templates" element={<AdminOnly><WaTemplates /></AdminOnly>} />
                <Route path="/wa-flows"     element={<AdminOnly><WaFlows /></AdminOnly>} />
                <Route path="/configuracoes" element={<AdminOnly><Configuracoes /></AdminOnly>} />
                <Route path="/super-admin"   element={<SuperAdmin />} />
                <Route path="*" element={<Navigate to={defaultRoute} replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <Toast />
      <CommandPalette />
    </div>
  );
}

export default function App() {
  const isLoggedIn = useStore(s => s.isLoggedIn);

  // Rota pública — acessível sem login
  if (window.location.pathname === '/admin/onboarding' ||
      window.location.pathname === '/onboarding') {
    return (
      <Suspense fallback={<Loading />}>
        <Onboarding />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<Loading />}>
      {isLoggedIn ? <AppLayout /> : <Login />}
    </Suspense>
  );
}
