import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { useStore } from '../store';
import styles from './Login.module.css';

export default function Login() {
  const navigate = useNavigate();
  const setAuth  = useStore(s => s.setAuth);
  const [form,    setForm]    = useState({ login: '', senha: '' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass,setShowPass]= useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.login || !form.senha) { setError('Preencha login e senha'); return; }
    setError(''); setLoading(true);
    try {
      const data = await api.post('/auth/login', form);
      if (data.token) {
        setAuth(data.token, data.agente);
        navigate('/', { replace: true });
      } else {
        setError(data.error || 'Credenciais inválidas');
      }
    } catch (err) {
      setError(err.message || 'Erro ao conectar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        {/* Logo GoCHAT */}
        <div className={styles.logoWrap}>
          <span className={styles.logoGo}>Go</span>
          <span className={styles.logoChat}>CHAT</span>
          <p className={styles.logoSub}>Painel de Atendimento</p>
        </div>

        <div className={styles.divider} />

        <form className={styles.form} onSubmit={handleSubmit}>
          <div>
            <label className={styles.label}>Login</label>
            <input
              className={styles.input}
              type="text"
              placeholder="seu.login"
              value={form.login}
              onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
              autoFocus
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className={styles.label}>Senha</label>
            <div className={styles.inputWrap}>
              <input
                className={styles.input}
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.senha}
                onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                autoComplete="current-password"
                required
                style={{ paddingRight: 36 }}
              />
              <button
                type="button"
                className={styles.togglePass}
                onClick={() => setShowPass(v => !v)}
                aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <button
            type="submit"
            className={styles.submit}
            disabled={loading}
          >
            {loading ? (
              <span className="spinner" style={{ borderTopColor: '#fff' }} />
            ) : (
              <>
                Entrar
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        <p className={styles.footer}>
          Powered by <span className={styles.footerBrand}>NetGo Internet</span>
        </p>
      </div>
    </div>
  );
}
