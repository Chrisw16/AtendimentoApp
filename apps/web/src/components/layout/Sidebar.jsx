import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  MessageSquare, LayoutDashboard, Users, GitBranch,
  BarChart2, Clock, Star, Bell, Settings,
  ChevronLeft, Zap, Network, Map,
  Building, ChevronDown, Wrench,
} from 'lucide-react';
import { useStore } from '../../store';
import styles from './Sidebar.module.css';

const NAV = [
  {
    group: 'Atendimento',
    items: [
      { to: '/chat',       icon: MessageSquare, label: 'Chat' },
      { to: '/historico',  icon: Clock,         label: 'Histórico' },
      { to: '/satisfacao', icon: Star,          label: 'Satisfação' },
    ],
  },
  {
    group: 'Configuração',
    items: [
      { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard',  adminOnly: true },
      { to: '/agentes',    icon: Users,           label: 'Agentes',    adminOnly: true },
      { to: '/fluxos',     icon: GitBranch,       label: 'Fluxos',     adminOnly: true },
      { to: '/canais',     icon: Zap,             label: 'Canais',     adminOnly: true },
      { to: '/analytics',  icon: BarChart2,       label: 'Analytics',  adminOnly: true },
    ],
  },
  {
    group: 'Operações',
    items: [
      { to: '/clientes',   icon: Building, label: 'Clientes' },
      { to: '/ocorrencias',icon: Bell,     label: 'Ocorrências' },
      { to: '/ordens',     icon: Wrench,   label: 'Ordens de Serviço' },
      { to: '/cobertura',  icon: Map,      label: 'Cobertura' },
    ],
  },
  {
    group: 'Infraestrutura',
    items: [
      { to: '/rede',        icon: Network,  label: 'Monitor de Rede',  adminOnly: true },
    ],
  },
];

function NavItem({ item, collapsed }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        [styles.navItem, isActive && styles.active].filter(Boolean).join(' ')
      }
      data-tooltip={collapsed ? item.label : undefined}
    >
      <Icon size={15} className={styles.navIcon} />
      {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
    </NavLink>
  );
}

// Logo GoCHAT com cores da NetGo
function GoLogo({ collapsed }) {
  return (
    <div className={styles.logoMark}>
      {collapsed ? (
        <span className={styles.logoIcon}>G</span>
      ) : (
        <div className={styles.logoFull}>
          <span className={styles.logoGo}>Go</span>
          <span className={styles.logoChat}>CHAT</span>
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { role, user } = useStore(s => ({ role: s.role, user: s.user }));
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(
    new Set(['Atendimento', 'Configuração', 'Operações', 'Infraestrutura'])
  );

  const toggleGroup = (group) => {
    if (collapsed) return;
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  };

  const visibleNav = NAV.map(section => ({
    ...section,
    items: section.items.filter(item => !item.adminOnly || role === 'admin'),
  })).filter(s => s.items.length > 0);

  const initial = (user?.nome || user?.login || 'G').charAt(0).toUpperCase();

  return (
    <aside
      className={[styles.sidebar, collapsed && styles.collapsed].filter(Boolean).join(' ')}
      aria-label="Navegação principal"
    >
      {/* ── BRAND ── */}
      <div className={styles.brand}>
        <GoLogo collapsed={collapsed} />
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(v => !v)}
          aria-label={collapsed ? 'Expandir' : 'Recolher'}
          data-tooltip={collapsed ? 'Expandir' : undefined}
        >
          <ChevronLeft
            size={14}
            style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s' }}
          />
        </button>
      </div>

      {/* ── NAV ── */}
      <nav className={styles.nav}>
        {visibleNav.map(section => (
          <div key={section.group} className={styles.section}>
            {!collapsed && (
              <button
                className={styles.groupHeader}
                onClick={() => toggleGroup(section.group)}
              >
                <span>{section.group}</span>
                <ChevronDown
                  size={11}
                  className={[
                    styles.groupChevron,
                    expandedGroups.has(section.group) && styles.groupOpen,
                  ].filter(Boolean).join(' ')}
                />
              </button>
            )}
            {(collapsed || expandedGroups.has(section.group)) && (
              <div className={styles.items}>
                {section.items.map(item => (
                  <NavItem key={item.to} item={item} collapsed={collapsed} />
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* ── USER ── */}
      <div className={styles.userArea}>
        <NavLink
          to="/configuracoes"
          className={({ isActive }) =>
            [styles.userRow, isActive && styles.active].filter(Boolean).join(' ')
          }
          data-tooltip={collapsed ? 'Configurações' : undefined}
        >
          <div className={styles.avatar}>
            {initial}
          </div>
          {!collapsed && (
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user?.nome || user?.login || 'Usuário'}</span>
              <span className={styles.userRole}>{role === 'admin' ? 'Administrador' : 'Agente'}</span>
            </div>
          )}
          {!collapsed && <Settings size={13} className={styles.settingsIcon} />}
        </NavLink>
      </div>
    </aside>
  );
}
