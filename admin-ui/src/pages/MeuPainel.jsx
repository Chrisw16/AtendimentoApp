import React, { useEffect, useState, useCallback } from 'react';
import { apiJson, api } from '../api';
import { useStore } from '../store';
import KpiCard from '../components/KpiCard';

function fmtMin(m) { if (!m || m <= 0) return '0min'; const h = Math.floor(m/60); return h > 0 ? `${h}h ${Math.round(m%60)}min` : `${Math.round(m)}min`; }
function fmtHora(ts) { return ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'; }

export default function MeuPainel() {
  const { userId, userName, role, showToast, setAuth } = useStore();
  const [me, setMe] = useState(null);
  const [ranking, setRanking] = useState(null); // { posicao, total }
  const [sessoes, setSessoes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Perfil edit
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ avatar: '', senhaAtual: '', senhaNova: '', senhaNova2: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      // Meus dados de monitor
      const monitor = await apiJson('/api/agentes/monitor');
      const myData = (Array.isArray(monitor) ? monitor : []).find(a => a.id === userId);
      setMe(myData || null);

      // Meu ranking (posição entre todos, sem ver dados dos outros)
      const rankList = await apiJson('/api/agentes/monitor/ranking?dias=7');
      const arr = Array.isArray(rankList) ? rankList : [];
      const idx = arr.findIndex(r => r.id === userId);
      setRanking({ posicao: idx >= 0 ? idx + 1 : null, total: arr.length, meuTotal: idx >= 0 ? arr[idx].total_atendimentos : 0, meuHoje: idx >= 0 ? arr[idx].atendimentos_hoje : 0, tma: idx >= 0 ? arr[idx].tempo_medio_min : null });

      // Minhas sessões de hoje
      const sess = await apiJson('/api/agentes/monitor/sessoes');
      const minhas = (Array.isArray(sess) ? sess : []).filter(s => s.agente_id === userId && s.tipo !== 'heartbeat');
      setSessoes(minhas);

      if (myData?.avatar) setForm(f => ({ ...f, avatar: myData.avatar }));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const handleSave = async () => {
    if (form.senhaNova && form.senhaNova !== form.senhaNova2) {
      showToast('Senhas não conferem', true); return;
    }
    if (form.senhaNova && form.senhaNova.length < 4) {
      showToast('Senha mínimo 4 caracteres', true); return;
    }
    setSaving(true);
    try {
      const body = {};
      if (form.avatar && form.avatar !== me?.avatar) body.avatar = form.avatar;
      if (form.senhaNova) body.senha = form.senhaNova;

      if (Object.keys(body).length === 0) {
        showToast('Nada para salvar'); setSaving(false); return;
      }

      const res = await api('/api/agente/perfil', { method: 'PUT', body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) {
        showToast('✅ Perfil atualizado!');
        setEditMode(false);
        setForm(f => ({ ...f, senhaAtual: '', senhaNova: '', senhaNova2: '' }));
        if (body.avatar) {
          // Update store
          localStorage.setItem('maxxi_avatar', body.avatar);
        }
        load();
      } else {
        showToast('Erro: ' + (data.error || 'falha'), true);
      }
    } catch (e) { showToast('Erro: ' + e.message, true); }
    setSaving(false);
  };

  const statusMap = {
    online: { emoji: '🟢', label: 'Online', cls: 'badge-green' },
    idle: { emoji: '🟡', label: 'Ausente', cls: 'badge-yellow' },
    pausa: { emoji: '☕', label: 'Em pausa', cls: 'badge-blue' },
    offline: { emoji: '🔴', label: 'Offline', cls: 'badge-red' },
  };
  const st = statusMap[me?.status_atual] || statusMap.offline;

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <div className="page-head">
        <div>
          <h1>🏠 Meu Painel</h1>
          <p>Bem-vindo, {userName}!</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className={`badge ${st.cls}`} style={{ fontSize: '.75rem' }}>{st.emoji} {st.label}</span>
          {me?.pausa_atual && <span className="badge badge-blue" style={{ fontSize: '.7rem' }}>☕ {me.pausa_atual}</span>}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', marginBottom: 20 }}>
        <KpiCard label="Online Hoje" value={fmtMin(me?.minutos_online_hoje)} color="var(--g1)" loading={loading} />
        <KpiCard label="Atendimentos Hoje" value={me?.atendimentos_hoje || 0} loading={loading} />
        <KpiCard label="Semana" value={me?.atendimentos_semana || 0} loading={loading} />
        <KpiCard label="Mês" value={me?.atendimentos_mes || 0} loading={loading} />
        <KpiCard label="Ativas Agora" value={me?.conversas_ativas || 0} color="var(--blue)" loading={loading} />
        <KpiCard label="Último Login" value={me?.ultimo_login ? fmtHora(me.ultimo_login) : '—'} loading={loading} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Ranking pessoal */}
        <div className="card">
          <div className="card-title">🏆 Meu Ranking (7 dias)</div>
          {ranking ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: 8 }}>
                {ranking.posicao === 1 ? '🥇' : ranking.posicao === 2 ? '🥈' : ranking.posicao === 3 ? '🥉' : `#${ranking.posicao || '—'}`}
              </div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.6rem', color: 'var(--g1)' }}>
                {ranking.posicao ? `${ranking.posicao}º de ${ranking.total}` : 'Sem posição'}
              </div>
              <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginTop: 8 }}>
                {ranking.meuTotal} atendimentos na semana
              </div>
              {ranking.tma && <div style={{ fontSize: '.78rem', color: 'var(--dim)', marginTop: 4 }}>TMA: {ranking.tma}min</div>}
            </div>
          ) : <div style={{ textAlign: 'center', padding: 30 }}><span className="spinner" /></div>}
        </div>

        {/* Editar perfil */}
        <div className="card">
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>👤 Meu Perfil</span>
            {!editMode && <button className="btn btn-outline btn-xs" onClick={() => setEditMode(true)}>✏️ Editar</button>}
          </div>

          {!editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
                <div style={{ fontSize: '2.5rem' }}>{me?.avatar || '👤'}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{me?.nome || userName}</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace" }}>{me?.login || userId}</div>
                </div>
              </div>
              {[
                ['Status', st.emoji + ' ' + st.label],
                ['Online hoje', fmtMin(me?.minutos_online_hoje)],
                ['Último login', me?.ultimo_login ? new Date(me.ultimo_login).toLocaleString('pt-BR') : '—'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '.82rem' }}>
                  <span style={{ color: 'var(--muted)' }}>{l}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Avatar</label>
                  <input className="input" value={form.avatar} onChange={e => setForm({ ...form, avatar: e.target.value })} style={{ textAlign: 'center', fontSize: '1.5rem', padding: 8 }} />
                </div>
                <div>
                  <label style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Nome</label>
                  <input className="input" value={me?.nome || userName} disabled style={{ opacity: .5 }} />
                  <div style={{ fontSize: '.65rem', color: 'var(--dim)', marginTop: 2 }}>Apenas o admin pode mudar o nome</div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 12 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 600, marginBottom: 8 }}>🔒 Alterar Senha</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <input className="input" type="password" placeholder="Nova senha" value={form.senhaNova} onChange={e => setForm({ ...form, senhaNova: e.target.value })} autoComplete="new-password" />
                  <input className="input" type="password" placeholder="Confirmar nova senha" value={form.senhaNova2} onChange={e => setForm({ ...form, senhaNova2: e.target.value })} autoComplete="new-password" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => { setEditMode(false); setForm(f => ({ ...f, senhaAtual: '', senhaNova: '', senhaNova2: '' })); }}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sessões de hoje */}
      <div className="card">
        <div className="card-title">📋 Minhas Sessões (Hoje)</div>
        {sessoes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Nenhuma sessão registrada hoje</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {sessoes.map((s, i) => {
              const tipoMap = {
                login: { icon: '🟢', label: 'Login', color: 'var(--g1)' },
                logout: { icon: '🔴', label: 'Logout', color: 'var(--red)' },
                pausa_inicio: { icon: '☕', label: 'Pausa', color: 'var(--blue)' },
                pausa_fim: { icon: '▶️', label: 'Voltou', color: 'var(--g1)' },
              };
              const t = tipoMap[s.tipo] || { icon: '•', label: s.tipo, color: 'var(--muted)' };
              return (
                <div key={s.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '.82rem' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '.72rem', color: 'var(--dim)', width: 50 }}>{fmtHora(s.criado_em)}</span>
                  <span style={{ color: t.color, fontWeight: 600 }}>{t.icon} {t.label}</span>
                  {s.motivo && <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>({s.motivo})</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
