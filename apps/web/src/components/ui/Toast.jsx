import { useStore } from '../../store';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import styles from './Toast.module.css';

const ICONS = {
  success: CheckCircle,
  error:   AlertCircle,
  warning: AlertTriangle,
  info:    Info,
};

function ToastItem({ toast }) {
  const removeToast = useStore(s => s.removeToast);
  const Icon = ICONS[toast.type] || Info;

  return (
    <div className={[styles.toast, styles[toast.type]].join(' ')} role="alert">
      <Icon size={14} className={styles.icon} />
      <span className={styles.message}>{toast.message}</span>
      <button
        className={styles.close}
        onClick={() => removeToast(toast.id)}
        aria-label="Fechar"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export default function Toast() {
  const toasts = useStore(s => s.toasts);
  if (!toasts.length) return null;

  return (
    <div className={styles.container} aria-live="polite" aria-atomic="false">
      {toasts.map(t => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
