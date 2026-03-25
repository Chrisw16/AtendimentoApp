import React, { useState, useRef, useEffect } from 'react';
import { Bell, BellOff, X, CheckCheck, Trash2 } from 'lucide-react';
import { useStore } from '../store';

const TYPE_STYLES = {
  alert:   { cls: 'notif--alert',   dot: 'var(--red)' },
  warning: { cls: 'notif--warning', dot: 'var(--yellow)' },
  success: { cls: 'notif--success', dot: 'var(--g1)' },
  info:    { cls: 'notif--info',    dot: 'var(--blue)' },
};

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const { notifications, notifUnread, markAllNotifRead, clearNotifications } = useStore();
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    setOpen(o => !o);
    if (!open && notifUnread > 0) {
      setTimeout(markAllNotifRead, 800);
    }
  };

  return (
    <div ref={panelRef}>
      <button
        className="notif-bell-btn"
        onClick={handleOpen}
        aria-label={`Notificações${notifUnread > 0 ? ` — ${notifUnread} não lidas` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell size={17} aria-hidden="true" />
        {notifUnread > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {notifUnread > 9 ? '9+' : notifUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel" role="region" aria-label="Painel de notificações">
          <div className="notif-panel-header">
            <span className="notif-panel-title">Notificações</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {notifications.length > 0 && (
                <>
                  <button className="notif-action-btn" onClick={markAllNotifRead} title="Marcar todas como lidas" aria-label="Marcar todas como lidas">
                    <CheckCheck size={14} />
                  </button>
                  <button className="notif-action-btn" onClick={clearNotifications} title="Limpar todas" aria-label="Limpar todas as notificações">
                    <Trash2 size={14} />
                  </button>
                </>
              )}
              <button className="notif-action-btn" onClick={() => setOpen(false)} aria-label="Fechar painel">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <BellOff size={28} aria-hidden="true" style={{ color: 'var(--dim)', marginBottom: 8 }} />
                <p>Nenhuma notificação</p>
              </div>
            ) : (
              notifications.map(n => {
                const style = TYPE_STYLES[n.type] || TYPE_STYLES.info;
                return (
                  <div key={n.id} className={`notif-item${n.read ? '' : ' notif-item--unread'} ${style.cls}`}>
                    <div className="notif-dot" style={{ background: style.dot }} aria-hidden="true" />
                    <div className="notif-content">
                      <div className="notif-msg">{n.message}</div>
                      {n.sub && <div className="notif-sub">{n.sub}</div>}
                      <div className="notif-ts">{timeAgo(n.ts)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
