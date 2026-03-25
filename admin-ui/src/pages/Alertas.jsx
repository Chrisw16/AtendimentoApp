import React, { useEffect, useState, useCallback } from 'react';
import { apiJson, api } from '../api';
import { useStore } from '../store';

export default function Alertas() {
  const [config, setConfig] = useState({});
  const [historico, setHistorico] = useState([]);
  const [status, setStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('status');
  const showToast = useStore(s => s.showToast);

  const load = useCallback(async () => {
    try {
      const [c, h, s] = await Promise.all([
        apiJson('/api/alertas/config').catch(() => ({})),
        apiJson('/api/alertas/historico').catch(() => []),
        apiJson('/api/alertas/status').catch(() => ({})),
      ]);
      setConfig(c || {}); setHistorico(Array.isArray(h) ? h : []); setStatus(s || {});
    } catch {} setLoading(false);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const salvar = async () => {
    setSaving(true);
    try { await api('/api/alertas/config', { method: 'PUT', body: JSON.stringify(config) }); showToast('✅ Config salva!'); }
    catch (e) { showToast('Erro: ' + e.message, true); }
    setSaving(false);
  };

  const alertasAtivos = Object.entries(status).filter(([_, v]) => (v?.clientes_unicos || 0) > 0);

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <div className="page-head">
        <div><h1>🚨 Alertas Massivos</h1><p>Detecta quando vários clientes relatam o mesmo problema</p></div>
        <div style={{ display: 'flex', gap: 6 }}>{[['status', '📡 Status'], ['historico', '📋 Histórico'], ['config', '⚙️ Config']].map(([id, lbl]) => (
          <button key={id} className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab(id)}>{lbl}</button>
        ))}</div>
      </div>

      {tab === 'status' && (
        <div>
          {alertasAtivos.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: '3rem', marginBottom: 12, opacity: .4 }}>✅</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--g1)' }}>Tudo normal</div>
              <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginTop: 4 }}>Nenhum alerta massivo detectado</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
              {alertasAtivos.map(([key, val]) => (
                <div key={key} className="card" style={{ borderLeft: `3px solid ${val.clientes_unicos >= 5 ? 'var(--red)' : 'var(--yellow)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '.88rem' }}>🚨 {key.replace(/_/g, ' ')}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: '1.2rem', color: val.clientes_unicos >= 5 ? 'var(--red)' : 'var(--yellow)' }}>{val.clientes_unicos}</span>
                  </div>
                  <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>clientes afetados na janela</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'historico' && (
        <div className="card">
          <div className="card-title">📋 Histórico de Alertas</div>
          {historico.length === 0 ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Sem histórico</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {historico.slice(0, 30).map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '.82rem' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '.72rem', color: 'var(--dim)', width: 120 }}>{h.data ? new Date(h.data).toLocaleString('pt-BR') : '—'}</span>
                  <span style={{ fontWeight: 600, flex: 1 }}>🚨 {h.tipo || h.alerta || '—'}</span>
                  <span className="badge badge-red" style={{ fontSize: '.65rem' }}>{h.clientes || 0} clientes</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'config' && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-title">⚙️ Configuração de Alertas</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Janela de detecção (minutos)</label>
              <input className="input" type="number" min={5} value={config.janela_minutos ?? 30} onChange={e => setConfig({ ...config, janela_minutos: parseInt(e.target.value) || 30 })} /></div>
            <div><label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Mínimo de clientes para alerta</label>
              <input className="input" type="number" min={2} value={config.min_clientes ?? 3} onChange={e => setConfig({ ...config, min_clientes: parseInt(e.target.value) || 3 })} /></div>
          </div>
          <div style={{ marginBottom: 12 }}><label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Palavras-chave (uma por linha)</label>
            <textarea className="input" rows={5} value={config.palavras_chave || ''} onChange={e => setConfig({ ...config, palavras_chave: e.target.value })} placeholder="sem internet&#10;caiu a conexão&#10;lento&#10;sem sinal" style={{ resize: 'vertical' }} /></div>
          <button className="btn btn-primary btn-sm" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : '💾 Salvar'}</button>
        </div>
      )}
    </div>
  );
}
