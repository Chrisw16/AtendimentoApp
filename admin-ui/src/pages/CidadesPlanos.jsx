import React, { useEffect, useState, useCallback } from 'react';
import { apiJson, api } from '../api';
import { useStore } from '../store';

const BENEFICIOS_PREDEFINIDOS = [
  'Wi-Fi incluso', 'Roteador emprestado', 'Sem fidelidade', 'Com fidelidade',
  'Pós-pago mensal', 'Instalação gratuita', 'Sem taxa de adesão',
  '1 app incluso (Standard)', '1 app Premium + 1 Standard',
  'Zapping TV (+45 canais)', 'IP fixo', 'Upload simétrico', 'Suporte 24h',
];

export default function CidadesPlanos() {
  const [cidades, setCidades]   = useState([]);
  const [planos, setPlanos]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('planos');
  const [modal, setModal]       = useState(null);
  const showToast = useStore(s => s.showToast);

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([apiJson('/api/cidades'), apiJson('/api/planos')]);
      setCidades(Array.isArray(c) ? c : []);
      setPlanos(Array.isArray(p) ? p : []);
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── CIDADES ──────────────────────────────────────────────────────────────
  const saveCidade = async () => {
    if (!modal.nome) { showToast('Nome obrigatório', true); return; }
    const isEdit = !!modal.id;
    const body = { nome: modal.nome, uf: modal.uf, pop_id: modal.pop_id, portador_id: modal.portador_id, ativo: modal.ativo, ordem: modal.ordem };
    await api(`/api/cidades${isEdit ? '/' + modal.id : ''}`, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(body) });
    showToast(isEdit ? '✅ Cidade atualizada' : '✅ Cidade criada');
    setModal(null); load();
  };

  const deleteCidade = async (id, nome) => {
    if (!confirm(`Remover "${nome}"? Isso desvincula todos os planos.`)) return;
    await api(`/api/cidades/${id}`, { method: 'DELETE' });
    showToast('✅ Removida'); load();
  };

  // ── PLANOS ────────────────────────────────────────────────────────────────
  const openPlanoModal = (plano) => {
    if (plano) {
      // vinculados: array simples de cidade_id (números)
      const vinculados = (plano.cidades || [])
        .filter(c => c.cidade_id != null)
        .map(c => Number(c.cidade_id));
      setModal({
        _type: 'plano',
        id:         plano.id,
        sgp_id:     plano.sgp_id,
        nome:       plano.nome,
        velocidade: plano.velocidade,
        unidade:    plano.unidade || 'Mega',
        valor:      plano.valor,
        ordem:      plano.ordem,
        destaque:   !!plano.destaque,
        ativo:      plano.ativo !== false,
        beneficios: Array.isArray(plano.beneficios) ? plano.beneficios : [],
        vinculados,
        _custom: '',
      });
    } else {
      setModal({ _type:'plano', id:null, sgp_id:'', nome:'', velocidade:'', unidade:'Mega', valor:'', ordem:'', destaque:false, ativo:true, beneficios:[], vinculados:[], _custom:'' });
    }
  };

  const savePlano = async () => {
    const sgp = (modal.sgp_id === '' || modal.sgp_id == null) ? null : parseInt(String(modal.sgp_id), 10);
    if (!sgp || !modal.nome || !modal.velocidade) {
      showToast('ID ERP, nome e velocidade são obrigatórios', true); return;
    }
    const isEdit = !!modal.id;
    const body = {
      sgp_id:     sgp,
      nome:       modal.nome,
      velocidade: modal.velocidade,
      unidade:    modal.unidade || 'Mega',
      valor:      modal.valor || 0,
      ordem:      modal.ordem || 0,
      destaque:   modal.destaque || false,
      ativo:      modal.ativo !== false,
      beneficios: modal.beneficios || [],
      cidades:    (modal.vinculados || []).map(id => ({ cidade_id: id })),
    };
    const res = await api(
      `/api/planos${isEdit ? '/' + modal.id : ''}`,
      { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(body) }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { showToast('Erro: ' + (json.error || res.status), true); return; }
    showToast(isEdit ? '✅ Plano atualizado' : '✅ Plano criado');
    setModal(null); load();
  };

  const deletePlano = async (id, nome) => {
    if (!confirm(`Remover "${nome}"?`)) return;
    await api(`/api/planos/${id}`, { method: 'DELETE' });
    showToast('✅ Removido'); load();
  };

  const toggleBenef = (b) => {
    const arr = modal.beneficios || [];
    setModal({ ...modal, beneficios: arr.includes(b) ? arr.filter(x => x !== b) : [...arr, b] });
  };

  const addCustom = () => {
    const v = (modal._custom || '').trim();
    if (!v) return;
    setModal({ ...modal, beneficios: [...(modal.beneficios||[]), v], _custom: '' });
  };

  const toggleCidade = (cidId) => {
    const arr = modal.vinculados || [];
    setModal({ ...modal, vinculados: arr.includes(cidId) ? arr.filter(x => x !== cidId) : [...arr, cidId] });
  };

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <div className="page-head">
        <div>
          <h1>📡 Cidades &amp; Planos</h1>
          <p>Gerencie cidades atendidas e planos de internet</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className={`btn btn-sm ${tab==='planos'  ? 'btn-primary':'btn-outline'}`} onClick={() => setTab('planos')}>📡 Planos ({planos.length})</button>
          <button className={`btn btn-sm ${tab==='cidades' ? 'btn-primary':'btn-outline'}`} onClick={() => setTab('cidades')}>📍 Cidades ({cidades.length})</button>
        </div>
      </div>

      {loading ? <div className="skeleton" style={{ height:300 }} /> : <>

      {/* PLANOS */}
      {tab === 'planos' && <>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginBottom:12 }}>
          <button className="btn btn-primary btn-sm" onClick={() => openPlanoModal(null)}>➕ Novo Plano</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
          {planos.map(p => {
            const bens = Array.isArray(p.beneficios) ? p.beneficios : [];
            const cvs  = Array.isArray(p.cidades) ? p.cidades.filter(c => c.cidade_id) : [];
            return (
              <div key={p.id} className="card" style={{ borderTop: p.destaque ? '3px solid var(--g1)':'3px solid var(--border)', position:'relative' }}>
                {p.destaque && <span style={{ position:'absolute',top:8,right:8,background:'var(--g1)',color:'#032d3d',fontSize:'.6rem',fontWeight:800,padding:'2px 8px',borderRadius:99,textTransform:'uppercase' }}>Destaque</span>}
                <div style={{ textAlign:'center', marginBottom:12 }}>
                  <div style={{ fontSize:'2rem',fontWeight:800,color:'var(--g1)',lineHeight:1 }}>{p.velocidade}</div>
                  <div style={{ fontSize:'.75rem',color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:1 }}>{p.unidade}</div>
                  <div style={{ fontSize:'1rem',fontWeight:700,marginTop:4 }}>{p.nome}</div>
                  <div style={{ fontSize:'.68rem',color:'var(--dim)',fontFamily:"'JetBrains Mono',monospace",marginTop:2 }}>
                    ID ERP: <strong style={{ color: (p.sgp_id != null && p.sgp_id !== '') ? 'var(--g1)':'var(--red)' }}>
                      {(p.sgp_id != null && p.sgp_id !== '') ? p.sgp_id : '⚠ não definido'}
                    </strong>
                  </div>
                  <div style={{ fontSize:'1.1rem',fontWeight:800,color:'var(--g1)',marginTop:4 }}>
                    R$ {parseFloat(p.valor||0).toFixed(2).replace('.',',')}<span style={{ fontSize:'.7rem',fontWeight:400,color:'var(--muted)' }}>/mês</span>
                  </div>
                </div>
                {bens.length > 0 && <div style={{ marginBottom:12 }}>
                  {bens.map((b,i) => <div key={i} style={{ fontSize:'.78rem',color:'var(--text)',padding:'2px 0' }}>✅ {b}</div>)}
                </div>}
                <div style={{ fontSize:'.68rem',color:'var(--dim)',borderTop:'1px solid var(--border)',paddingTop:8,marginTop:'auto' }}>
                  {cvs.length === 0
                    ? <span style={{ color:'var(--red)' }}>⚠️ Sem cidades</span>
                    : cvs.map((c,i) => <span key={i} className="badge badge-blue" style={{ fontSize:'.55rem',marginRight:4 }}>{c.cidade_nome}</span>)}
                </div>
                <div style={{ display:'flex',gap:6,marginTop:10 }}>
                  <button className="btn btn-outline btn-xs" onClick={() => openPlanoModal(p)}>✏️ Editar</button>
                  <button className="btn btn-danger btn-xs" onClick={() => deletePlano(p.id,p.nome)}>🗑️</button>
                  <span className={`badge ${p.ativo ? 'badge-green':'badge-red'}`} style={{ fontSize:'.55rem',marginLeft:'auto' }}>{p.ativo?'Ativo':'Inativo'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </>}

      {/* CIDADES */}
      {tab === 'cidades' && <>
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ _type:'cidade',nome:'',uf:'RN',pop_id:'',portador_id:'',ativo:true,ordem:0 })}>➕ Nova Cidade</button>
        </div>
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.82rem' }}>
            <thead><tr style={{ borderBottom:'1px solid var(--border)' }}>
              {['Cidade','UF','POP ID','Portador ID','Ativo','Ações'].map(h => (
                <th key={h} style={{ textAlign:'left',padding:'10px 14px',color:'var(--muted)',fontSize:'.68rem',textTransform:'uppercase' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {cidades.map(c => (
                <tr key={c.id} style={{ borderBottom:'1px solid rgba(255,255,255,.03)' }}>
                  <td style={{ padding:'10px 14px',fontWeight:600 }}>📍 {c.nome}</td>
                  <td>{c.uf}</td>
                  <td style={{ fontFamily:"'JetBrains Mono',monospace" }}>{c.pop_id||'—'}</td>
                  <td style={{ fontFamily:"'JetBrains Mono',monospace" }}>{c.portador_id||'—'}</td>
                  <td><span className={`badge ${c.ativo?'badge-green':'badge-red'}`} style={{ fontSize:'.55rem' }}>{c.ativo?'● Ativo':'○ Inativo'}</span></td>
                  <td><div style={{ display:'flex',gap:6 }}>
                    <button className="btn btn-outline btn-xs" onClick={() => setModal({ ...c,_type:'cidade' })}>✏️</button>
                    <button className="btn btn-danger btn-xs" onClick={() => deleteCidade(c.id,c.nome)}>🗑️</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      </>}

      {/* MODAL CIDADE */}
      {modal?._type === 'cidade' && (
        <div style={OV} onClick={e => e.target===e.currentTarget && setModal(null)}>
          <div style={MB(440)}>
            <h3 style={H3}>{modal.id ? '✏️ Editar Cidade' : '➕ Nova Cidade'}</h3>
            <div style={{ display:'grid',gap:12,marginBottom:16 }}>
              <div><label style={LB}>Nome *</label><input className="input" value={modal.nome} onChange={e=>setModal({...modal,nome:e.target.value})} placeholder="Natal" /></div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10 }}>
                <div><label style={LB}>UF</label><input className="input" value={modal.uf} onChange={e=>setModal({...modal,uf:e.target.value})} placeholder="RN" /></div>
                <div><label style={LB}>POP ID</label><input className="input" type="number" value={modal.pop_id||''} onChange={e=>setModal({...modal,pop_id:e.target.value})} /></div>
                <div><label style={LB}>Portador ID</label><input className="input" type="number" value={modal.portador_id||''} onChange={e=>setModal({...modal,portador_id:e.target.value})} /></div>
              </div>
              <label style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer' }}>
                <input type="checkbox" checked={modal.ativo} onChange={e=>setModal({...modal,ativo:e.target.checked})} style={{ accentColor:'var(--g1)' }} /> Ativa
              </label>
            </div>
            <div style={AC}><button className="btn btn-outline" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={saveCidade}>Salvar</button></div>
          </div>
        </div>
      )}

      {/* MODAL PLANO */}
      {modal?._type === 'plano' && (
        <div style={OV} onClick={e => e.target===e.currentTarget && setModal(null)}>
          <div style={{ ...MB(580), maxHeight:'90vh', overflowY:'auto' }}>
            <h3 style={H3}>{modal.id ? '✏️ Editar Plano' : '➕ Novo Plano'}</h3>

            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10,marginBottom:14 }}>
              <div>
                <label style={LB}>ID ERP (SGP) *</label>
                <input
                  className="input"
                  type="number"
                  placeholder="12"
                  value={modal.sgp_id === '' || modal.sgp_id == null ? '' : modal.sgp_id}
                  onChange={e => {
                    const v = e.target.value.trim();
                    setModal({ ...modal, sgp_id: v === '' ? '' : parseInt(v, 10) });
                  }}
                />
              </div>
              <div><label style={LB}>Nome *</label><input className="input" value={modal.nome} onChange={e=>setModal({...modal,nome:e.target.value})} placeholder="Premium" /></div>
              <div><label style={LB}>Velocidade *</label><input className="input" value={modal.velocidade} onChange={e=>setModal({...modal,velocidade:e.target.value})} placeholder="600" /></div>
              <div><label style={LB}>Unidade</label>
                <select className="input" value={modal.unidade} onChange={e=>setModal({...modal,unidade:e.target.value})}>
                  <option>Mega</option><option>Giga</option>
                </select>
              </div>
            </div>

            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14 }}>
              <div><label style={LB}>Valor (R$/mês)</label><input className="input" type="number" step="0.01" value={modal.valor||''} onChange={e=>setModal({...modal,valor:e.target.value})} placeholder="119.90" /></div>
              <div><label style={LB}>Ordem</label><input className="input" type="number" value={modal.ordem||''} onChange={e=>setModal({...modal,ordem:e.target.value})} /></div>
            </div>

            <div style={{ display:'flex',gap:16,marginBottom:16 }}>
              <label style={{ display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:'.85rem' }}>
                <input type="checkbox" checked={modal.destaque} onChange={e=>setModal({...modal,destaque:e.target.checked})} style={{ accentColor:'var(--g1)' }} /> ⭐ Destaque
              </label>
              <label style={{ display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:'.85rem' }}>
                <input type="checkbox" checked={modal.ativo} onChange={e=>setModal({...modal,ativo:e.target.checked})} style={{ accentColor:'var(--g1)' }} /> Ativo
              </label>
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={{ ...LB, marginBottom:8 }}>Benefícios</label>
              <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:8 }}>
                {BENEFICIOS_PREDEFINIDOS.map(b => (
                  <button key={b} className={`btn btn-xs ${(modal.beneficios||[]).includes(b)?'btn-primary':'btn-outline'}`}
                    onClick={()=>toggleBenef(b)} style={{ fontSize:'.72rem' }}>{b}</button>
                ))}
              </div>
              <div style={{ display:'flex',gap:6 }}>
                <input className="input" value={modal._custom||''} onChange={e=>setModal({...modal,_custom:e.target.value})}
                  placeholder="Benefício personalizado..." onKeyDown={e=>e.key==='Enter'&&addCustom()} style={{ flex:1 }} />
                <button className="btn btn-outline btn-sm" onClick={addCustom}>+</button>
              </div>
              {(modal.beneficios||[]).filter(b=>!BENEFICIOS_PREDEFINIDOS.includes(b)).map((b,i)=>(
                <span key={i} style={{ display:'inline-flex',alignItems:'center',gap:4,fontSize:'.72rem',background:'rgba(0,200,150,.1)',padding:'3px 8px',borderRadius:6,margin:'4px 4px 0 0' }}>
                  {b} <span style={{ cursor:'pointer',color:'var(--red)' }} onClick={()=>setModal({...modal,beneficios:modal.beneficios.filter(x=>x!==b)})}>✕</span>
                </span>
              ))}
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={{ ...LB, marginBottom:8 }}>Cidades & ID SGP</label>
              <div style={{ background:'rgba(0,0,0,.15)',borderRadius:10,padding:12 }}>
                {cidades.map(c => {
                  const on = (modal.vinculados||[]).includes(c.id);
                  return (
                    <div key={c.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,.03)' }}>
                      <label style={{ display:'flex',alignItems:'center',gap:6,cursor:'pointer',flex:1,fontSize:'.82rem' }}>
                        <input type="checkbox" checked={on} onChange={()=>toggleCidade(c.id)} style={{ accentColor:'var(--g1)' }} />
                        📍 {c.nome}
                        <span style={{ fontSize:'.65rem',color:'var(--dim)',fontFamily:"'JetBrains Mono',monospace" }}>POP:{c.pop_id} Port:{c.portador_id}</span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={AC}><button className="btn btn-outline" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={savePlano}>Salvar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

const LB = { fontSize:'.72rem', color:'var(--muted)', fontWeight:600, display:'block', marginBottom:4 };
const H3 = { fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.2rem', marginBottom:20 };
const AC = { display:'flex', gap:8, justifyContent:'flex-end', paddingTop:16, borderTop:'1px solid var(--border)' };
const OV = { position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, backdropFilter:'blur(6px)' };
const MB = (w) => ({ background:'rgba(2,55,65,.95)', border:'1px solid rgba(0,200,150,.15)', borderRadius:16, padding:28, width:w, maxWidth:'95vw', animation:'scaleIn .2s ease' });
