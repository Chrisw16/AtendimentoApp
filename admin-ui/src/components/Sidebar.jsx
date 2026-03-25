import React from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from '../store';
import {
  LayoutDashboard, FileText, MessageSquare, Users,
  Zap, Radio, Bell, RefreshCcw, Edit3, Star, Clock, ClipboardList,
  Plug, Key, Ticket, ChevronLeft, ChevronRight, Home, UserPlus, MapPin, Brain, Map, GitBranch, Activity, Router, Send,
} from 'lucide-react';

const ADMIN_NAV = [
  { group: 'Visão geral', items: [
    { to: '/', Icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/relatorio', Icon: FileText, label: 'Relatórios' },
  ]},
  { group: 'Atendimento', items: [
    { to: '/chat', Icon: MessageSquare, label: 'Chat', badge: true },
    { to: '/fluxos', Icon: GitBranch, label: 'Fluxos' },
    { to: '/monitor-rede', Icon: Activity, label: 'Monitor de rede' },
    { to: '/dispositivos-cpe', Icon: Router, label: 'ACS / TR-069' },
    { to: '/gateway-sms', Icon: Send, label: 'Gateway SMS' },
    { to: '/wa-templates', Icon: FileText, label: 'WA Templates' },
    { to: '/wa-flows',     Icon: FileText, label: 'WA Flows' },
    { to: '/agentes', Icon: Users, label: 'Agentes' },
    { to: '/respostas', Icon: Zap, label: 'Resp. Rápidas' },
  ]},
  { group: 'Equipe', items: [
    { to: '/equipe', Icon: MessageSquare, label: 'Maxxi Equipe', badge: false },
  ]},
  { group: 'Canais', items: [
    { to: '/canais', Icon: Radio, label: 'Canais' },
    { to: '/alertas', Icon: Bell, label: 'Alertas' },
    { to: '/reativacao', Icon: RefreshCcw, label: 'Reativação' },
  ]},
  { group: 'IA & Config', items: [
    { to: '/prompt', Icon: Edit3, label: 'Prompt IA' },
    { to: '/satisfacao', Icon: Star, label: 'NPS' },
    { to: '/horario', Icon: Clock, label: 'Horário & SLA' },
  ]},
  { group: 'Sistema', items: [
    { to: '/logs', Icon: ClipboardList, label: 'Logs' },
    { to: '/sessoes', Icon: Plug, label: 'Sessões' },
    { to: '/integracoes', Icon: Key, label: 'Integrações' },
    { to: '/tipos-ocorrencia', Icon: Ticket, label: 'Tipos Ocorrência' },
    { to: '/cadastro-lead', Icon: UserPlus, label: 'Cadastro Lead' },
    { to: '/cobertura', Icon: Map, label: 'Cobertura' },
    { to: '/cidades-planos', Icon: MapPin, label: 'Cidades & Planos' },
    { to: '/prompts-ia', Icon: Brain, label: 'Prompts IA' },
  ]},
];

const AGENTE_NAV = [
  { group: 'Atendimento', items: [
    { to: '/chat', Icon: MessageSquare, label: 'Chat', badge: true },
  ]},
  { group: 'Minha Conta', items: [
    { to: '/meu-painel', Icon: Home, label: 'Meu Painel' },
  ]},
];

export default function Sidebar() {
  const { chatUnread, role, sidebarCollapsed, toggleSidebar } = useStore();
  const nav = role === 'admin' ? ADMIN_NAV : AGENTE_NAV;

  return (
    <aside className={`sidebar${sidebarCollapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar-logo">
        <img
          src="/admin/icons/logo.svg"
          alt="Maxxi"
          className="mark"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(0,200,150,.15))' }}
          aria-hidden="true"
        />
        <span className="version">v8.8.3</span>
      </div>

      {nav.map(group => (
        <div className="nav-group" key={group.group}>
          <div className="nav-group-label">{group.group}</div>
          {group.items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              title={sidebarCollapsed ? item.label : undefined}
              aria-label={item.label}
            >
              <span className="icon" aria-hidden="true">
                <item.Icon size={15} strokeWidth={1.8} />
              </span>
              <span className="nav-label">{item.label}</span>
              {item.badge && chatUnread > 0 && (
                <span className="nav-badge" aria-label={`${chatUnread} não lidas`}>{chatUnread}</span>
              )}
            </NavLink>
          ))}
        </div>
      ))}

      <div className="sidebar-footer">
        <a href="/" className="nav-link" aria-label="Ir para o site">
          <span className="icon" aria-hidden="true"><Home size={15} strokeWidth={1.8} /></span>
          <span className="nav-label">Site</span>
        </a>
        <button
          className="sidebar-toggle-btn"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
          title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {sidebarCollapsed
            ? <ChevronRight size={14} />
            : <ChevronLeft size={14} />
          }
        </button>
      </div>
    </aside>
  );
}
