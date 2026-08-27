import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  MessageSquare, LayoutDashboard, Users, GitBranch,
  BarChart2, Clock, Star, Settings, Bot,
  ChevronLeft, Zap, Map,
  Building, ChevronDown, Inbox, BookOpen, ListChecks, ClipboardCheck, Activity,
} from 'lucide-react';
import { useStore } from '../../store';
import styles from './Sidebar.module.css';

/**
 * A navegação é agrupada por O QUE VOCÊ ESTÁ FAZENDO, não por onde a tela mora.
 *
 * O agrupamento anterior tinha um grupo "Configuração" com 11 dos 17 itens —
 * Dashboard e Analytics inclusive, que não configuram coisa nenhuma. Grupo que
 * recebe tudo não agrupa nada: vira a lista original com um título em cima. E
 * o título "Configuração" abrigava um item "Configurações", que faz o operador
 * ler duas vezes para achar o que já tinha achado.
 *
 * Os cinco grupos são cinco perguntas diferentes:
 *   Atendimento — o que eu abro COM o cliente na linha
 *   Desempenho  — como fomos (auditoria interna + nota do cliente, juntas)
 *   Automação   — como a IA atende quando não tem gente
 *   Operação    — quem atende e por onde a mensagem entra
 *   Sistema     — a casa
 *
 * A ordem dos grupos segue FREQUÊNCIA de uso, não ordem de montagem: quem
 * mexe em fluxo mexe toda semana, quem mexe em canal mexeu uma vez.
 *
 * ⚠️ Grupo que fica vazio depois do filtro `adminOnly` não é renderizado
 * (`.filter(s => s.items.length > 0)` mais abaixo) — sem isso, um agente
 * comum veria três cabeçalhos de grupo sem nada dentro.
 */
const NAV = [
  {
    group: 'Atendimento',
    items: [
      { to: '/chat',        icon: MessageSquare,   label: 'Chat' },
      { to: '/historico',   icon: Clock,           label: 'Histórico' },
      { to: '/clientes',    icon: Building,        label: 'Clientes' },
      { to: '/knowledge',   icon: BookOpen,        label: 'Conhecimento' },
      { to: '/cobertura',   icon: Map,             label: 'Cobertura' },
    ],
  },
  {
    group: 'Desempenho',
    items: [
      { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard',  adminOnly: true },
      { to: '/analytics',   icon: BarChart2,       label: 'Analytics',  adminOnly: true },
      { to: '/qualidade',   icon: ClipboardCheck,  label: 'Qualidade',  adminOnly: true },
      { to: '/satisfacao',  icon: Star,            label: 'Satisfação' },
    ],
  },
  {
    group: 'Automação',
    items: [
      { to: '/fluxos',      icon: GitBranch,       label: 'Fluxos',        adminOnly: true },
      { to: '/playbooks',   icon: ListChecks,      label: 'Procedimentos', adminOnly: true },
      { to: '/prompts-ia',  icon: Bot,             label: 'Prompts IA',    adminOnly: true },
    ],
  },
  {
    group: 'Operação',
    items: [
      { to: '/agentes',     icon: Users,           label: 'Agentes', adminOnly: true },
      { to: '/filas',       icon: Inbox,           label: 'Filas',   adminOnly: true },
      { to: '/canais',      icon: Zap,             label: 'Canais',  adminOnly: true },
    ],
  },
  {
    group: 'Sistema',
    items: [
      { to: '/configuracoes', icon: Settings,      label: 'Configurações',     adminOnly: true },
      { to: '/saude',         icon: Activity,      label: 'Saúde do Sistema',  adminOnly: true },
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
    new Set(['Atendimento', 'Desempenho', 'Automação', 'Operação', 'Sistema'])
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
