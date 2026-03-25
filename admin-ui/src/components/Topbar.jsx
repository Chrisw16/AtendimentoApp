import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { api, apiJson } from '../api';
import NotificationPanel from './NotificationPanel';
import { LogOut, Coffee, Search } from 'lucide-react';

const TITLES = {
  '/': 'Dashboard',
  '/chat': 'Chat Interno',
  '/agentes': 'Agentes',
  '/canais': 'Canais',
  '/respostas': 'Respostas Rápidas',
  '/horario': 'Horário & SLA',
  '/satisfacao': 'Satisfação',
  '/prompt': 'Editor de Prompt',
  '/logs': 'Logs ao Vivo',
  '/sessoes': 'Sessões',
  '/integracoes': 'Integrações',
  '/relatorio': 'Relatórios',
  '/meu-painel': 'Meu Painel',
  '/alertas': 'Alertas',
  '/reativacao': 'Reativação',
  '/tipos-ocorrencia': 'Tipos de Ocorrência',
};

const PAUSAS = [
  { id: 'almoco',    label: 'Almoço' },
  { id: 'banheiro',  label: 'Banheiro' },
  { id: 'intervalo', label: 'Intervalo' },
  { id: 'reuniao',   label: 'Reunião' },
];

export default function Topbar() {
  const location = useLocation();
  const { userName, role, userId, logout, showToast } = useStore();
  const title = TITLES[location.pathname] || 'Maxxi';
  const [pausaAtual, setPausaAtual] = useState(null);
  const [showPausas, setShowPausas] = useState(false);
  const [horaAtual, setHoraAtual] = useState('');

  useEffect(() => {
    const tick = () => setHoraAtual(
      new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (role !== 'admin') {
      apiJson('/api/agentes/monitor').then(list => {
        const me = (Array.isArray(list) ? list : []).find(a => a.id === userId);
        setPausaAtual(me?.pausa_atual || null);
      }).catch(() => {});
    }
  }, [role, userId]);

  const handlePausa = async (motivo) => {
    try {
      await api('/api/agentes/monitor/pausa', { method: 'POST', body: JSON.stringify({ acao: 'iniciar', motivo }) });
      setPausaAtual(motivo);
      setShowPausas(false);
      showToast('Pausa iniciada: ' + motivo);
    } catch {}
  };

  const handleVoltarPausa = async () => {
    try {
      await api('/api/agentes/monitor/pausa', { method: 'POST', body: JSON.stringify({ acao: 'finalizar' }) });
      setPausaAtual(null);
      showToast('Bem-vindo de volta!');
    } catch {}
  };

  return (
    <header className="topbar" role="banner">
      <h2 className="topbar-title">{title}</h2>
      {horaAtual && (
        <span style={{ fontSize: 'var(--text-xs)', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-3)', padding: '3px 10px', background: 'rgba(255,255,255,.03)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-1)', letterSpacing: '.05em', display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--accent)', display:'inline-block', animation:'pulse-glow 2s ease infinite' }}/>
          {horaAtual}
        </span>
      )}

      {/* Cmd+K hint */}
      <button
        className="topbar-search-hint"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
        aria-label="Abrir paleta de comandos (Ctrl+K)"
        title="Ctrl+K"
      >
        <Search size={13} aria-hidden="true" />
        <span>Buscar...</span>
        <kbd>Ctrl+K</kbd>
      </button>

      {/* Pausa controls — agents only */}
      {role !== 'admin' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
          {pausaAtual ? (
            <button
              className="btn btn-primary btn-xs"
              onClick={handleVoltarPausa}
              style={{ animation: 'pulse-glow 2s ease infinite' }}
              aria-label={`Voltar da pausa: ${pausaAtual}`}
            >
              ▶ Voltar ({pausaAtual})
            </button>
          ) : (
            <>
              <button
                className="btn btn-outline btn-xs"
                onClick={() => setShowPausas(!showPausas)}
                aria-haspopup="true"
                aria-expanded={showPausas}
                aria-label="Iniciar pausa"
              >
                <Coffee size={12} aria-hidden="true" />
                <span>Pausa</span>
              </button>
              {showPausas && (
                <div className="pausa-dropdown" role="menu">
                  {PAUSAS.map(p => (
                    <button
                      key={p.id}
                      className="pausa-item"
                      role="menuitem"
                      onClick={() => handlePausa(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Right side: Notifications + User */}
      <div className="topbar-right">
        <NotificationPanel />
        <div className="topbar-user">
          <div className="topbar-avatar" aria-hidden="true">
            {(userName || 'A').charAt(0).toUpperCase()}
          </div>
          <div className="topbar-user-info">
            <span className="name">{userName}</span>
            <span className="role">{role}</span>
          </div>
          <button
            className="btn btn-outline btn-sm topbar-logout"
            onClick={logout}
            aria-label="Sair do sistema"
            title="Sair"
          >
            <LogOut size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
