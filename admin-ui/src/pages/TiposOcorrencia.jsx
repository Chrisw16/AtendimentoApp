import React, { useEffect, useState } from 'react';
import { apiJson, api } from '../api';
import { useStore } from '../store';

export default function TiposOcorrencia() {
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const showToast = useStore(s => s.showToast);

  const load = async () => {
    try {
      const data = await apiJson('/api/ocorrencia-tipos');
      setTipos(Array.isArray(data) ? data : []);
    } catch { setTipos([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!modal.sgp_id || !modal.nome) { showToast('ID SGP e nome são obrigatórios', true); return; }
    try {
      const isEdit = !!modal.id;
      const path = isEdit ? `/api/ocorrencia-tipos/${modal.id}` : '/api/ocorrencia-tipos';
      await api(path, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(modal) });
      showToast(isEdit ? '✅ Tipo atualizado' : '✅ Tipo criado');
      setModal(null);
      load();
    } catch (e) { showToast('Erro: ' + e.message, true); }
  };

  const handleDelete = async (id, nome) => {
    if (!confirm(`Remover "${nome}"?`)) return;
    try {
      await api(`/api/ocorrencia-tipos/${id}`, { method: 'DELETE' });
      showToast('✅ Removido');
      load();
    } catch (e) { showToast('Erro: ' + e.message, true); }
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.6rem', letterSpacing: 1 }}>🎫 Tipos de Ocorrência</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.82rem', marginTop: 4 }}>IDs do SGP usados pela IA para abrir chamados automaticamente</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ sgp_id: '', nome: '', descricao: '', keywords: '', ativo: true, ordem: 0 })}>➕ Novo Tipo</button>
      </div>

      {loading ? <div className="skeleton" style={{ height: 200, borderRadius: 12 }} /> :
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['ID SGP', 'Nome', 'Keywords (IA)', 'Ativo', 'Ordem', 'Ações'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '12px 14px', color: 'var(--muted)', fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.08em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tipos.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Nenhum tipo cadastrado</td></tr>
            ) : tipos.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: 'var(--g1)' }}>{t.sgp_id}</span>
                </td>
                <td style={{ fontWeight: 600 }}>{t.nome}</td>
                <td style={{ maxWidth: 200 }}>
                  <div style={{ fontSize: '.72rem', color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.keywords || '—'}
                  </div>
                </td>
                <td>
                  <span className={`badge ${t.ativo ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '.6rem' }}>
                    {t.ativo ? '● Ativo' : '○ Inativo'}
                  </span>
                </td>
                <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '.75rem', color: 'var(--dim)' }}>{t.ordem}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-outline btn-xs" onClick={() => setModal({ ...t })}>✏️</button>
                    <button className="btn btn-danger btn-xs" onClick={() => handleDelete(t.id, t.nome)}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <div style={{ fontSize: '.75rem', color: 'var(--muted)', lineHeight: 1.6 }}>
          💡 <strong>Como funciona:</strong> A IA usa as <strong>keywords</strong> para identificar qual tipo de ocorrência abrir.
          Por exemplo, se o cliente diz "minha internet caiu", a IA identifica as keywords "internet caiu, sem internet" e escolhe o tipo <strong>200 - Reparo</strong>.
          O <strong>ID SGP</strong> é o código usado na API do SGP para abrir o chamado.
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, backdropFilter: 'blur(6px)' }} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={{ background: 'rgba(2,55,65,.9)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 16, padding: 28, width: 480, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,.5)', animation: 'scaleIn .2s ease' }}>
            <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.2rem', marginBottom: 20 }}>
              {modal.id ? '✏️ Editar Tipo' : '➕ Novo Tipo'}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>ID SGP *</label>
                <input className="input" type="number" value={modal.sgp_id} onChange={e => setModal({ ...modal, sgp_id: e.target.value })} placeholder="200" />
              </div>
              <div>
                <label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Ordem</label>
                <input className="input" type="number" value={modal.ordem} onChange={e => setModal({ ...modal, ordem: e.target.value })} placeholder="0" />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Nome *</label>
              <input className="input" value={modal.nome} onChange={e => setModal({ ...modal, nome: e.target.value })} placeholder="Reparo" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Descrição</label>
              <input className="input" value={modal.descricao} onChange={e => setModal({ ...modal, descricao: e.target.value })} placeholder="Problema na conexão, equipamento defeituoso" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Keywords (IA usa para identificar)</label>
              <textarea className="input" rows={2} value={modal.keywords} onChange={e => setModal({ ...modal, keywords: e.target.value })} placeholder="internet caiu,sem internet,lento,offline,roteador" style={{ resize: 'vertical' }} />
              <div style={{ fontSize: '.65rem', color: 'var(--dim)', marginTop: 4 }}>Separe por vírgula. A IA compara com o que o cliente escreveu.</div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.85rem', marginBottom: 16 }}>
              <input type="checkbox" checked={modal.ativo} onChange={e => setModal({ ...modal, ativo: e.target.checked })} style={{ accentColor: 'var(--g1)', width: 16, height: 16 }} />
              Ativo
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
