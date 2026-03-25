import React, { useEffect, useState, useCallback } from 'react';
import { apiJson, api } from '../api';
import { useStore } from '../store';

export default function Sessoes() {
  const [sessoes, setSessoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const showToast = useStore(s => s.showToast);

  const load = useCallback(async () => {
    try { setSessoes(await apiJson('/api/sessoes')); } catch {} setLoading(false);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const limpar = async (tel) => {
    if (!window.confirm(`Limpar sessão de ${tel}?`)) return;
    await api(`/api/sessoes/${tel}`, { method: 'DELETE' });
    showToast('✅ Sessão limpa'); setDetail(null); load();
  };

  const filtered = sessoes.filter(s => !search || (s.telefone || '').includes(search) || (s.nome || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <div className="page-head">
        <div><h1>🔌 Sessões Ativas</h1><p>{sessoes.length} sessões na memória · Atualiza a cada 15s</p></div>
        <button className="btn btn-outline btn-sm" onClick={load}>🔄</button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input className="input" style={{ maxWidth: 300, padding: '8px 14px' }} placeholder="🔍 Buscar por telefone ou nome..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <div className="skeleton" style={{ height: 300 }} /> : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Nenhuma sessão ativa</div>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
            <thead><tr>{['Telefone', 'Nome', 'CPF', 'Canal', 'Última atividade', 'Ações'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--muted)', fontSize: '.68rem', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
            <tbody>{filtered.map((s, i) => {
              const isAnon = !s.telefone || s.telefone.startsWith('sess_') || s.telefone.length < 8;
              return (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.03)', opacity: isAnon ? 0.6 : 1 }}>
                <td style={{ padding: '10px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: '.75rem' }}>{isAnon ? <span style={{ color: 'var(--dim)', fontStyle: 'italic' }}>Não identificado</span> : s.telefone}</td>
                <td style={{ fontWeight: 600 }}>{s.nome || <span style={{ color: 'var(--dim)' }}>—</span>}</td>
                <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '.72rem', color: 'var(--muted)' }}>{s.cpfcnpj || '—'}</td>
                <td><span className={`badge ${s.canal ? 'badge-blue' : ''}`} style={{ fontSize: '.6rem' }}>{s.canal || 'WhatsApp'}</span></td>
                <td style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{s.ultima_atividade ? new Date(s.ultima_atividade).toLocaleString('pt-BR') : '—'}</td>
                <td><div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-outline btn-xs" onClick={() => setDetail(s)}>👁</button>
                  <button className="btn btn-danger btn-xs" onClick={() => limpar(s.telefone)}>🗑</button>
                </div></td>
              </tr>);
            })}</tbody>
          </table>
        </div>
      )}

      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, backdropFilter: 'blur(6px)' }} onClick={e => e.target === e.currentTarget && setDetail(null)}>
          <div style={{ background: 'rgba(2,55,65,.9)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 16, padding: 24, width: 500, maxWidth: '95vw', maxHeight: '80vh', overflowY: 'auto', animation: 'scaleIn .2s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontFamily: "'Bebas Neue',sans-serif" }}>🔌 Sessão: {detail.telefone}</h3>
              <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>
            <pre style={{ background: 'rgba(3,45,61,.5)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, fontSize: '.72rem', fontFamily: "'JetBrains Mono',monospace", overflow: 'auto', maxHeight: 400, color: 'var(--g1)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(detail, null, 2)}</pre>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-danger btn-sm" onClick={() => limpar(detail.telefone)}>🗑 Limpar Sessão</button>
              <button className="btn btn-outline" onClick={() => setDetail(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
