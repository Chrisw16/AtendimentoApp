import { Bell } from 'lucide-react';
import { useStore } from '../../store';
import styles from './Topbar.module.css';

export default function Topbar() {
  const notifications = useStore(s => s.notifications || []);
  const unread = notifications.filter(n => !n.lida).length;

  return (
    <header className={styles.topbar}>
      <div className={styles.statusBar}>
        <div className={styles.statusDot} />
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Online</span>
      </div>

      <div className={styles.title} />

      <div className={styles.brandTag}>
        <div className={styles.brandDot} />
        NetGo Internet
      </div>

      <div className={styles.actions}>
        <button className={styles.actionBtn} aria-label="Notificações">
          <Bell size={15} />
          {unread > 0 && (
            <span className={styles.badge}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
