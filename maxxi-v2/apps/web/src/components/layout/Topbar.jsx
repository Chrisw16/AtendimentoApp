import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Bell, LogOut, Command } from 'lucide-react';
import { useStore } from '../../store';
import Button from '../ui/Button';
import styles from './Topbar.module.css';

const ROUTE_LABELS = {
  '/':               'Dashboard',
  '/chat':           'Chat',
  '/historico':      'Histórico',
  '/tarefas':        'Tarefas',
  '/satisfacao':     'Satisfação',
  '/agentes':        'Agentes',
  '/fluxos':         'Fluxos',
  '/canais':         'Canais',
  '/analytics':      'Analytics',
  '/clientes':       'Clientes',
  '/ocorrencias':    'Ocorrências',
  '/ordens':         'Ordens de Serviço',
  '/frota':          'Frota',
  '/cobertura':      'Cobertura',
  '/rede':           'Monitor de Rede',
  '/dispositivos':   'Dispositivos CPE',
  '/financeiro':     'Financeiro',
  '/email':          'E-mail',
  '/voip':           'VoIP',
  '/configuracoes':  'Configurações',
};

export default function Topbar({ onCommandPalette }) {
  const { pathname } = useLocation();
  const { logout, notifCount } = useStore(s => ({
    logout: s.logout,
    notifCount: s.notifCount,
  }));
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);

  const pageTitle = ROUTE_LABELS[pathname] || pathname.slice(1);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Ctrl+K → command palette
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onCommandPalette?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCommandPalette]);

  return (
    <header className={styles.topbar} role="banner">
      {/* ── LEFT: TITLE ── */}
      <div className={styles.left}>
        <h1 className={styles.pageTitle}>{pageTitle}</h1>
      </div>

      {/* ── RIGHT: ACTIONS ── */}
      <div className={styles.right}>
        {/* Search / Command Palette */}
        <button
          className={styles.searchTrigger}
          onClick={onCommandPalette}
          aria-label="Buscar (Ctrl+K)"
        >
          <Search size={13} />
          <span className={styles.searchHint}>Buscar...</span>
          <kbd className={styles.kbd}>
            <Command size={10} />K
          </kbd>
        </button>

        {/* Notifications */}
        <button
          className={styles.iconBtn}
          aria-label={`Notificações${notifCount > 0 ? ` (${notifCount} novas)` : ''}`}
        >
          <Bell size={15} />
          {notifCount > 0 && (
            <span className={styles.badge} aria-hidden>
              {notifCount > 9 ? '9+' : notifCount}
            </span>
          )}
        </button>

        <div className={styles.divider} />

        {/* Logout */}
        <Button
          variant="ghost"
          size="sm"
          icon={LogOut}
          onClick={logout}
          aria-label="Sair"
          data-tooltip="Sair"
        />
      </div>
    </header>
  );
}
