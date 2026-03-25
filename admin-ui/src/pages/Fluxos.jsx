import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson, api } from '../api';
import { useStore } from '../store';

export default function Fluxos() {
  const [fluxos, setFluxos] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useStore();
  const navigate = useNavigate();

  const load = async () => {
    try { const r = await apiJson('/api/fluxos'); setFluxos(Array.isArray(r) ? r : []); }
    catch { showToast('Erro ao carregar fluxos', true); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const [seeding, setSeeding] = useState(false);

  const instalarPadrao = async () => {
    if (!window.confirm('Instalar o fluxo padrão CITmax? Se já existir, será atualizado e ativado.')) return;
    setSeeding(true);
    try {
      const r = await apiJson('/api/fluxos/seed-padrao', { method: 'POST' }, true);
      showToast('✅ ' + r.mensagem);
      load();
    } catch { showToast('Erro ao instalar fluxo padrão', true); }
    setSeeding(false);
  };

  const criar = async () => {
    try {
      const r = await apiJson('/api/fluxos', { method: 'POST', body: JSON.stringify({ nome: 'Novo fluxo' }) }, true);
      navigate(`/fluxos/${r.id}`);
    } catch { showToast('Erro ao criar fluxo', true); }
  };

  const duplicar = async (id, e) => {
    e.stopPropagation();
    try { const r = await apiJson(`/api/fluxos/${id}/duplicar`, { method: 'POST' }, true); navigate(`/fluxos/${r.id}`); }
    catch { showToast('Erro ao duplicar', true); }
  };

  const excluir = async (id, nome, e) => {
    e.stopPropagation();
    if (!window.confirm(`Excluir "${nome}"?`)) return;
    try { await api(`/api/fluxos/${id}`, { method: 'DELETE' }); load(); showToast('Fluxo excluído'); }
    catch { showToast('Erro ao excluir', true); }
  };

  const fmtData = (ts) => ts ? new Date(ts).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';

  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <div className="page-head">
        <div>
          <h1>Editor de Fluxos</h1>
          <p>Construa visualmente o fluxo de atendimento sem código</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-outline" onClick={instalarPadrao} disabled={seeding} title="Instala o fluxo padrão CITmax com todo o atendimento já configurado">
            {seeding ? '...' : '⚡ Instalar fluxo padrão'}
          </button>
          <button className="btn btn-primary" onClick={criar}>+ Novo fluxo</button>
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-2)' }}><span className="spinner" /></div>}

      {!loading && fluxos.length === 0 && (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 8, opacity: .3 }}>✦</div>
          <div className="empty-state-title">Nenhum fluxo criado ainda</div>
          <div className="empty-state-desc">Crie seu primeiro fluxo de atendimento visual</div>
          <div className="empty-state-action"><button className="btn btn-primary" onClick={criar}>Criar primeiro fluxo</button></div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {fluxos.map(f => (
          <div key={f.id} onClick={() => navigate(`/fluxos/${f.id}`)}
            style={{ background: 'var(--surface-1)', border: f.ativo ? '1px solid rgba(0,200,150,.3)' : '1px solid var(--border-1)', borderRadius: 12, padding: '16px 18px', cursor: 'pointer', transition: 'all .15s', position: 'relative', overflow: 'hidden' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,200,150,.25)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = f.ativo ? 'rgba(0,200,150,.3)' : 'var(--border-1)'}>

            {f.ativo && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#00c896,#008b87)' }} />
            )}

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 3 }}>{f.nome}</div>
                {f.descricao && <div style={{ fontSize: '.75rem', color: 'var(--text-2)' }}>{f.descricao}</div>}
              </div>
              {f.ativo
                ? <span style={{ fontSize: '.6rem', background: 'rgba(0,200,150,.15)', color: '#00c896', border: '1px solid rgba(0,200,150,.25)', borderRadius: 20, padding: '2px 8px', fontWeight: 700, white_space: 'nowrap', flexShrink: 0 }}>● ATIVO</span>
                : f.publicado
                  ? <span style={{ fontSize: '.6rem', background: 'rgba(62,207,255,.1)', color: '#3ecfff', border: '1px solid rgba(62,207,255,.2)', borderRadius: 20, padding: '2px 8px', fontWeight: 700, flexShrink: 0 }}>publicado</span>
                  : <span style={{ fontSize: '.6rem', background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.35)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>rascunho</span>
              }
            </div>

            <div style={{ display: 'flex', gap: 12, fontSize: '.72rem', color: 'var(--text-3)', marginBottom: 12 }}>
              <span>v{f.versao || 1}</span>
              <span>·</span>
              <span>atualizado {fmtData(f.atualizado)}</span>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => navigate(`/fluxos/${f.id}`)}
                style={{ flex: 1, padding: '5px 0', background: 'rgba(0,200,150,.08)', border: '1px solid rgba(0,200,150,.18)', borderRadius: 6, color: '#00c896', fontSize: '.75rem', cursor: 'pointer', fontWeight: 600 }}>
                Editar
              </button>
              <button onClick={e => duplicar(f.id, e)}
                style={{ padding: '5px 10px', background: 'none', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, color: 'rgba(255,255,255,.5)', fontSize: '.75rem', cursor: 'pointer' }}
                title="Duplicar">⧉</button>
              <button onClick={e => excluir(f.id, f.nome, e)}
                style={{ padding: '5px 10px', background: 'none', border: '1px solid rgba(255,71,87,.15)', borderRadius: 6, color: '#ff4757', fontSize: '.75rem', cursor: 'pointer' }}
                title="Excluir">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
