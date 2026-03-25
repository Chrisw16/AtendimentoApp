import React, { useEffect, useState, useCallback } from 'react';
import { apiJson, api } from '../api';
import { useStore } from '../store';

export default function Respostas() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | {} (new) | {id,...} (edit)
  const showToast = useStore(s => s.showToast);

  const load = useCallback(async () => {
    try { setList(await apiJson('/api/respostas-rapidas')); } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const salvar = async (data) => {
    try {
      await api('/api/respostas-rapidas', { method: 'POST', body: JSON.stringify(data) });
      showToast('✅ Salvo!'); setModal(null); load();
    } catch (e) { showToast('Erro: ' + e.message, true); }
  };

  const deletar = async (id) => {
    if (!window.confirm('Remover esta resposta?')) return;
    await api(`/api/respostas-rapidas/${id}`, { method: 'DELETE' });
    showToast('Removida'); load();
  };

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <div className="page-head">
        <div><h1>⚡ Respostas Rápidas</h1><p>Atalhos para mensagens frequentes · Digite / no chat para usar</p></div>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ atalho: '', texto: '' })}>➕ Nova Resposta</button>
      </div>

      {loading ? <div className="skeleton" style={{ height: 200 }} /> : list.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Nenhuma resposta rápida cadastrada</div>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
            <thead><tr>{['Atalho', 'Texto', 'Preview', 'Ações'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--muted)', fontSize: '.68rem', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
            <tbody>{list.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                <td style={{ padding: '10px 12px' }}><code style={{ color: 'var(--g1)', fontFamily: "'JetBrains Mono',monospace", fontSize: '.8rem' }}>/{r.atalho}</code></td>
                <td style={{ color: 'var(--muted)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(r.texto || '').slice(0, 80)}</td>
                <td><div style={{ background: 'rgba(0,200,150,.06)', border: '1px solid rgba(0,200,150,.12)', borderRadius: 10, padding: '6px 10px', fontSize: '.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.texto}</div></td>
                <td><div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-outline btn-xs" onClick={() => setModal(r)}>✏️</button>
                  <button className="btn btn-danger btn-xs" onClick={() => deletar(r.id)}>🗑</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, backdropFilter: 'blur(6px)' }} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={{ background: 'rgba(2,55,65,.9)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 16, padding: 24, width: 480, maxWidth: '95vw', animation: 'scaleIn .2s ease' }}>
            <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", marginBottom: 16 }}>{modal.id ? '✏️ Editar' : '➕ Nova'} Resposta</h3>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Atalho (sem /)</label>
              <input className="input" value={modal.atalho || ''} onChange={e => setModal({ ...modal, atalho: e.target.value })} placeholder="saudacao" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Texto da mensagem</label>
              <textarea className="input" rows={5} value={modal.texto || ''} onChange={e => setModal({ ...modal, texto: e.target.value })} placeholder="Olá! Bem-vindo à CITmax..." style={{ resize: 'vertical' }} />
            </div>
            {modal.texto && <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '.65rem', color: 'var(--dim)', marginBottom: 4, display: 'block' }}>Preview:</label>
              <div style={{ background: 'rgba(0,200,150,.08)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 12, padding: '10px 14px', fontSize: '.82rem', whiteSpace: 'pre-wrap' }}>{modal.texto}</div>
            </div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => salvar(modal)} disabled={!modal.atalho || !modal.texto}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
