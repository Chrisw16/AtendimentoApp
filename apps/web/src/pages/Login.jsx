import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Zap } from 'lucide-react';
import { useStore } from '../store';
import styles from './Login.module.css';

export default function Login() {
  const navigate = useNavigate();
  const setAuth  = useStore(s => s.setAuth);
  const toast    = useStore(s => s.toast);

  const [form, setForm]       = useState({ login: '', senha: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]  = useState(false);
  const [error, setError]      = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.login || !form.senha) { setError('Preencha login e senha.'); return; }
    setError('');
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Credenciais inválidas');
      setAuth(data);
      navigate(data.role === 'admin' ? '/' : '/chat', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.root}>
      {/* ── GRID BACKGROUND ── */}
      <div className={styles.grid} aria-hidden />

      {/* ── CARD ── */}
      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.brand}>
          <div className={styles.logoMark}>
            <Zap size={18} strokeWidth={2.5} />
          </div>
          <div className={styles.brandText}>
            <span className={styles.brandName}>MAXXI</span>
            <span className={styles.brandSub}>Painel de Atendimento</span>
          </div>
        </div>

        <div className={styles.divider} />

        {/* Form */}
        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <label htmlFor="login" className={styles.label}>Login</label>
            <input
              id="login"
              type="text"
              autoComplete="username"
              autoFocus
              className={styles.input}
              placeholder="seu.login"
              value={form.login}
              onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
              disabled={loading}
              aria-invalid={!!error}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="senha" className={styles.label}>Senha</label>
            <div className={styles.passWrap}>
              <input
                id="senha"
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                className={styles.input}
                placeholder="••••••••"
                value={form.senha}
                onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                disabled={loading}
                aria-invalid={!!error}
              />
              <button
                type="button"
                className={styles.passToggle}
                onClick={() => setShowPass(v => !v)}
                aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                tabIndex={-1}
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <p className={styles.error} role="alert">{error}</p>
          )}

          <button
            type="submit"
            className={styles.submit}
            disabled={loading}
          >
            {loading ? (
              <span className={styles.spinner} aria-hidden />
            ) : null}
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className={styles.footer}>
          Maxxi CITmax &mdash; Acesso restrito
        </p>
      </div>
    </div>
  );
}
