import React, { useState } from 'react';
import { login as apiLogin, setToken } from '../api';
import { useStore } from '../store';
import Antigravity from '../components/Antigravity';
import { LogIn } from 'lucide-react';

export default function Login() {
  const [user, setUser] = useState('');
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useStore(s => s.setAuth);

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (!pwd) { setError('Digite a senha.'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await apiLogin(user || 'admin', pwd);
      if (data.ok) { setToken(data.token); setAuth(data); }
      else setError(data.error || 'Login ou senha incorretos.');
    } catch {
      setError('Servidor offline. Tente novamente.');
    }
    setLoading(false);
  };

  return (
    <div className="login-screen">
      <Antigravity
        count={300}
        magnetRadius={120}
        waveSpeed={0.4}
        waveAmplitude={1}
        particleSize={2}
        lerpSpeed={0.1}
        color="#00c896"
      />

      <div className="login-wrap">
        <img
          src="/admin/icons/logo.svg"
          alt="Maxxi — Painel de Atendimento CITmax"
          style={{
            width: '65%',
            maxWidth: 340,
            minWidth: 180,
            marginBottom: 12,
            filter: 'drop-shadow(0 4px 16px rgba(0,200,150,.25))',
            animation: 'fadeIn .8s ease',
          }}
        />
        <p className="login-sub">PAINEL DE ATENDIMENTO · CITMAX</p>

        <form className="login-card" onSubmit={handleLogin} noValidate>
          <div className="login-field">
            <label htmlFor="login-user" className="login-label">Login</label>
            <input
              id="login-user"
              className="input"
              type="text"
              placeholder="admin ou usuário"
              value={user}
              onChange={e => setUser(e.target.value)}
              autoComplete="username"
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-pwd" className="login-label">Senha</label>
            <input
              id="login-pwd"
              className="input"
              type="password"
              placeholder="••••••••"
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              autoComplete="current-password"
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} aria-hidden="true" />
                Verificando...
              </>
            ) : (
              <>
                <LogIn size={15} aria-hidden="true" />
                Entrar
              </>
            )}
          </button>

          {error && (
            <p id="login-error" className="login-error" role="alert" aria-live="polite">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
