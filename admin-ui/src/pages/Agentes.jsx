import React, { useEffect, useState, useCallback } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { apiJson, api } from '../api';
import HeatmapAgente from '../components/HeatmapAgente';
import { useStore } from '../store';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const STATUS_MAP = {
  online:  { emoji: '🟢', label: 'Online',  color: 'var(--g1)',    cls: 'badge-green' },
  idle:    { emoji: '🟡', label: 'Ausente',  color: 'var(--yellow)', cls: 'badge-yellow' },
  pausa:   { emoji: '☕', label: 'Em pausa', color: 'var(--blue)',   cls: 'badge-blue' },
  offline: { emoji: '🔴', label: 'Offline',  color: 'var(--red)',    cls: 'badge-red' },
};

const PAUSA_OPCOES = [
  { id: 'almoco', label: '🍽️ Almoço' },
  { id: 'banheiro', label: '🚻 Banheiro' },
  { id: 'intervalo', label: '☕ Intervalo' },
  { id: 'reuniao', label: '📋 Reunião' },
  { id: 'outro', label: '⏸️ Outro' },
];

function fmtMin(min) { if (!min || min <= 0) return '0min'; const h = Math.floor(min/60), m = Math.round(min%60); return h > 0 ? `${h}h ${m}min` : `${m}min`; }
function timeAgo(dt) { if (!dt) return '—'; const d = Math.floor((Date.now()-new Date(dt).getTime())/60000); return d < 1 ? 'agora' : d < 60 ? `há ${d}min` : d < 1440 ? `há ${Math.floor(d/60)}h` : `há ${Math.floor(d/1440)}d`; }
function fmtHora(dt) { return dt ? new Date(dt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—'; }

// ══════════════════════════════════════════════════════════════
// MODAL — Criar/Editar Agente
// ══════════════════════════════════════════════════════════════
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function AgentModal({ agente, onClose, onSave }) {
  const [form, setForm] = useState({
    nome: agente?.nome || '',
    login: agente?.login || '',
    senha: '',
    avatar: agente?.avatar || '🧑',
    ativo: agente?.ativo !== false,
    whatsapp: agente?.whatsapp || '',
    categoria: agente?.categoria || 'atendente',
  });
  const [horario, setHorario] = useState(() => {
    const h = agente?.horario_trabalho || {};
    const def = {};
    for (let i = 0; i < 7; i++) {
      def[i] = h[i] || {
        ativo: i >= 1 && i <= 5,
        inicio: '08:00',
        fim: '18:00',
        // Intervalos tolerados (ausência permitida sem alerta)
        // Cada intervalo: { inicio: 'HH:MM', fim: 'HH:MM', label: string }
        intervalos: i >= 1 && i <= 5 ? [{ inicio: '12:00', fim: '13:00', label: 'Almoço' }] : [],
      };
    }
    return def;
  });

  const addIntervalo = (dia) => {
    const cfg = horario[dia];
    const novos = [...(cfg.intervalos || []), { inicio: '12:00', fim: '13:00', label: 'Almoço' }];
    setHorario({ ...horario, [dia]: { ...cfg, intervalos: novos } });
  };
  const removeIntervalo = (dia, idx) => {
    const cfg = horario[dia];
    const novos = (cfg.intervalos || []).filter((_, i) => i !== idx);
    setHorario({ ...horario, [dia]: { ...cfg, intervalos: novos } });
  };
  const updateIntervalo = (dia, idx, field, val) => {
    const cfg = horario[dia];
    const novos = (cfg.intervalos || []).map((iv, i) => i === idx ? { ...iv, [field]: val } : iv);
    setHorario({ ...horario, [dia]: { ...cfg, intervalos: novos } });
  };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isEdit = !!agente?.id;

  const handleSave = async () => {
    if (!form.nome || !form.login) { setError('Nome e login são obrigatórios'); return; }
    if (!isEdit && !form.senha) { setError('Senha é obrigatória para novo agente'); return; }
    setSaving(true); setError('');
    try {
      const body = { nome: form.nome, login: form.login, avatar: form.avatar, ativo: form.ativo, whatsapp: form.whatsapp || '', categoria: form.categoria || 'atendente' };
      if (form.senha) body.senha = form.senha;
      const path = isEdit ? `/api/agentes/${agente.id}` : '/api/agentes';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await api(path, { method, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) {
        // Salvar horário de trabalho (se editando)
        const agId = isEdit ? agente.id : data.id;
        if (agId) {
          await api(`/api/agentes/${agId}/horario-trabalho`, { method: 'PUT', body: JSON.stringify(horario) }).catch(() => {});
        }
        onSave(); onClose();
      }
      else setError(data.error || 'Erro ao salvar');
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,backdropFilter:'blur(6px)',animation:'fadeIn .2s ease' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'rgba(2,55,65,.85)',backdropFilter:'blur(16px)',border:'1px solid rgba(0,200,150,.15)',borderRadius:16,padding:28,width:520,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,.5)',animation:'scaleIn .25s ease' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
          <h3 style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:'1.2rem',letterSpacing:'.5px' }}>{isEdit ? '✏️ Editar Agente' : '➕ Novo Agente'}</h3>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'1.1rem',padding:4 }}>✕</button>
        </div>

        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:12 }}>
          <div>
            <label style={{ fontSize:'.72rem',color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4 }}>Nome completo</label>
            <input className="input" value={form.nome} onChange={e => setForm({...form, nome:e.target.value})} placeholder="Maria Silva" />
          </div>
          <div>
            <label style={{ fontSize:'.72rem',color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4 }}>Avatar (emoji)</label>
            <input className="input" value={form.avatar} onChange={e => setForm({...form, avatar:e.target.value})} placeholder="🧑" style={{ textAlign:'center',fontSize:'1.2rem' }} />
          </div>
          <div>
            <label style={{ fontSize:'.72rem',color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4 }}>Login</label>
            <input className="input" value={form.login} onChange={e => setForm({...form, login:e.target.value})} placeholder="maria" autoComplete="off" />
          </div>
          <div>
            <label style={{ fontSize:'.72rem',color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4 }}>{isEdit ? 'Nova senha (vazio = manter)' : 'Senha'}</label>
            <input className="input" type="password" value={form.senha} onChange={e => setForm({...form, senha:e.target.value})} placeholder={isEdit ? '••••••' : 'Obrigatório'} autoComplete="new-password" />
          </div>
        </div>

        {/* WhatsApp + Categoria */}
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
          <div>
            <label style={{ fontSize:'.72rem',color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4 }}>📱 WhatsApp (DDI+DDD+número)</label>
            <div style={{ display:'flex', gap:6 }}>
              <input className="input" style={{ flex:1 }} value={form.whatsapp||''} onChange={e => setForm({...form, whatsapp:e.target.value.replace(/\D/g,'')})}
                placeholder="5584999999999" />
              <button type="button" className="btn btn-outline btn-sm" style={{ whiteSpace:'nowrap' }}
                onClick={async () => {
                  const num = (form.whatsapp||'').replace(/\D/g,'');
                  if (num.length < 10) { alert('Digite o número primeiro'); return; }
                  try {
                    const r = await fetch(window.location.origin + '/admin/api/equipe/testar-numero', {
                      method: 'POST',
                      headers: { 'Content-Type':'application/json', 'x-admin-token': localStorage.getItem('maxxi_token')||'' },
                      body: JSON.stringify({ numero: num, nome: form.nome || 'Agente' }),
                    });
                    const d = await r.json();
                    if (d.ok) alert('✅ Mensagem enviada para ' + num + '!\nPeça para o funcionário confirmar.');
                    else alert('Erro: ' + (d.erro || d.error || JSON.stringify(d)));
                  } catch(e) { alert('Erro: ' + e.message); }
                }}>📤 Testar</button>
            </div>
            <div style={{ fontSize:'.62rem',color:'var(--dim)',marginTop:3 }}>Para alertas diretos via Maxxi Equipe</div>
          </div>
          <div>
            <label style={{ fontSize:'.72rem',color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4 }}>👥 Categoria</label>
            <select className="input" value={form.categoria||'atendente'} onChange={e => setForm({...form, categoria:e.target.value})}
              style={{ cursor:'pointer' }}>
              <option value="atendente">👤 Atendente</option>
              <option value="tecnico">🔧 Técnico</option>
              <option value="supervisor">👁️ Supervisor</option>
              <option value="admin">👑 Admin</option>
            </select>
          </div>
        </div>

        <label style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:'.85rem',marginBottom:16 }}>
          <input type="checkbox" checked={form.ativo} onChange={e => setForm({...form, ativo:e.target.checked})} style={{ accentColor:'var(--g1)',width:16,height:16 }} />
          Agente ativo
        </label>

        {/* Horário de Trabalho + Intervalos */}
        <div style={{ borderTop:'1px solid var(--border)',paddingTop:14,marginBottom:12 }}>
          <div style={{ fontSize:'.72rem',color:'var(--g1)',textTransform:'uppercase',letterSpacing:'.1em',fontWeight:700,marginBottom:10,fontFamily:"'JetBrains Mono',monospace" }}>🕐 Horário de Trabalho & Intervalos</div>
          <div style={{ fontSize:'.68rem',color:'var(--muted)',marginBottom:10,lineHeight:1.5 }}>
            Durante os intervalos configurados, ausências não geram alertas. Ideal para almoço, estagiários com horário reduzido, etc.
          </div>
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            {DIAS_SEMANA.map((dia, i) => {
              const cfg = horario[i] || { ativo: false, inicio: '08:00', fim: '18:00', intervalos: [] };
              const intervalos = cfg.intervalos || [];
              const opacity = cfg.ativo === false ? .35 : 1;
              return (
                <div key={i} style={{ background:'rgba(3,45,61,.3)',borderRadius:8,padding:'8px 10px',border:`1px solid ${cfg.ativo !== false ? 'rgba(0,200,150,.1)' : 'rgba(255,255,255,.04)'}`,transition:'border-color .2s' }}>
                  {/* Linha principal */}
                  <div style={{ display:'flex',alignItems:'center',gap:8,fontSize:'.78rem' }}>
                    <input type="checkbox" checked={cfg.ativo !== false} onChange={e => setHorario({...horario, [i]: {...cfg, ativo: e.target.checked}})} style={{ accentColor:'var(--g1)',width:14,height:14,flexShrink:0 }} />
                    <span style={{ width:30,color: cfg.ativo !== false ? 'var(--text)' : 'var(--dim)',fontWeight:700,fontSize:'.72rem',flexShrink:0 }}>{dia}</span>
                    <input className="input" type="time" value={cfg.inicio || '08:00'} onChange={e => setHorario({...horario, [i]: {...cfg, inicio: e.target.value}})} disabled={cfg.ativo === false} style={{ width:84,padding:'3px 6px',fontSize:'.72rem',opacity }} />
                    <span style={{ color:'var(--dim)',fontSize:'.72rem',flexShrink:0 }}>até</span>
                    <input className="input" type="time" value={cfg.fim || '18:00'} onChange={e => setHorario({...horario, [i]: {...cfg, fim: e.target.value}})} disabled={cfg.ativo === false} style={{ width:84,padding:'3px 6px',fontSize:'.72rem',opacity }} />
                    {cfg.ativo !== false && (
                      <button type="button" onClick={() => addIntervalo(i)} style={{ marginLeft:'auto',background:'rgba(0,200,150,.08)',border:'1px solid rgba(0,200,150,.2)',color:'var(--g1)',borderRadius:5,padding:'2px 8px',fontSize:'.65rem',cursor:'pointer',flexShrink:0,whiteSpace:'nowrap' }}>
                        + intervalo
                      </button>
                    )}
                  </div>

                  {/* Intervalos do dia */}
                  {cfg.ativo !== false && intervalos.length > 0 && (
                    <div style={{ marginTop:6,paddingTop:6,borderTop:'1px solid rgba(255,255,255,.04)',display:'flex',flexDirection:'column',gap:4 }}>
                      {intervalos.map((iv, idx) => (
                        <div key={idx} style={{ display:'flex',alignItems:'center',gap:6,fontSize:'.72rem' }}>
                          <span style={{ width:6,height:6,borderRadius:'50%',background:'rgba(245,197,24,.5)',flexShrink:0,display:'inline-block',marginLeft:4 }}></span>
                          <input
                            className="input"
                            value={iv.label || 'Almoço'}
                            onChange={e => updateIntervalo(i, idx, 'label', e.target.value)}
                            placeholder="Almoço"
                            style={{ width:80,padding:'2px 6px',fontSize:'.68rem',background:'rgba(245,197,24,.04)',borderColor:'rgba(245,197,24,.15)' }}
                          />
                          <input className="input" type="time" value={iv.inicio || '12:00'} onChange={e => updateIntervalo(i, idx, 'inicio', e.target.value)} style={{ width:80,padding:'2px 6px',fontSize:'.68rem' }} />
                          <span style={{ color:'var(--dim)',flexShrink:0 }}>–</span>
                          <input className="input" type="time" value={iv.fim || '13:00'} onChange={e => updateIntervalo(i, idx, 'fim', e.target.value)} style={{ width:80,padding:'2px 6px',fontSize:'.68rem' }} />
                          <button type="button" onClick={() => removeIntervalo(i, idx)} style={{ background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:'.78rem',padding:'0 4px',opacity:.7,flexShrink:0 }} title="Remover intervalo">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && <div style={{ fontSize:'.78rem',color:'var(--red)',marginBottom:12 }}>{error}</div>}

        <div style={{ display:'flex',gap:8,justifyContent:'flex-end',paddingTop:16,borderTop:'1px solid var(--border)' }}>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// AGENT CARD (Monitor)
// ══════════════════════════════════════════════════════════════
function AgentCard({ ag, onEdit }) {
  const st = STATUS_MAP[ag.status_atual] || STATUS_MAP.offline;
  const ht = ag.horario_trabalho || {};
  const diaAtual = new Date().getDay();
  const diaConfig = ht[diaAtual];
  let statusPonto = null;
  if (diaConfig?.ativo && ag.primeiro_login_hoje) {
    const [hi,mi] = (diaConfig.inicio||'08:00').split(':').map(Number);
    const loginDate = new Date(ag.primeiro_login_hoje);
    const loginMin = loginDate.getHours()*60 + loginDate.getMinutes();
    const esperado = hi*60+mi;
    const diff = loginMin - esperado;
    statusPonto = diff <= 5 ? { ok: true, label: '✅ No horário' } : { ok: false, label: `⚠️ +${diff}min atraso` };
  } else if (diaConfig?.ativo && !ag.primeiro_login_hoje && ag.status_atual === 'offline') {
    const now = new Date();
    const [hi,mi] = (diaConfig.inicio||'08:00').split(':').map(Number);
    if (now.getHours()*60+now.getMinutes() > hi*60+mi+10) statusPonto = { ok: false, label: '🚨 Não logou' };
  }

  return (
    <div style={{ background:'var(--glass)',backdropFilter:'blur(8px)',border:'1px solid var(--glass-border)',borderRadius:12,padding:16,borderLeft:`3px solid ${st.color}`,transition:'all .25s' }}>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:10 }}>
        <div style={{ fontSize:'1.8rem' }}>{ag.avatar || '👤'}</div>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontWeight:700,fontSize:'.92rem',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{ag.nome}</div>
          <div style={{ display:'flex',gap:4,alignItems:'center',flexWrap:'wrap' }}>
            <span className={`badge ${st.cls}`} style={{ fontSize:'.58rem' }}>{st.emoji} {st.label}</span>
            {ag.pausa_atual && <span className="badge badge-blue" style={{ fontSize:'.55rem' }}>☕ {ag.pausa_atual}</span>}
            {statusPonto && <span className={`badge ${statusPonto.ok ? 'badge-green' : 'badge-yellow'}`} style={{ fontSize:'.55rem' }}>{statusPonto.label}</span>}
          </div>
        </div>
        <button className="btn btn-outline btn-xs" onClick={() => onEdit(ag)} title="Editar">✏️</button>
      </div>

      {/* Stats grid — métricas de produtividade */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,fontSize:'.76rem',marginBottom:8 }}>
        {[
          { lbl:'Online hoje', val: fmtMin(ag.minutos_online_hoje), color:'var(--g1)' },
          { lbl:'Atend. hoje',  val: ag.atendimentos_hoje,          color:'var(--text)' },
          { lbl:'Ativas agora', val: ag.conversas_ativas,           color:'var(--blue)' },
          { lbl:'Conv/hora',    val: ag.minutos_online_hoje > 0 ? (ag.atendimentos_hoje / (ag.minutos_online_hoje/60)).toFixed(1) : '—', color: 'var(--blue)' },
          { lbl:'TRP médio',    val: ag.trp_medio_segs != null ? (ag.trp_medio_segs < 60 ? ag.trp_medio_segs+'s' : Math.round(ag.trp_medio_segs/60)+'min') : '—', color: ag.trp_medio_segs > 300 ? 'var(--yellow)' : 'var(--g1)' },
          { lbl:'Devolvidas IA',val: ag.conv_devolvidas_hoje || 0, color: ag.conv_devolvidas_hoje > 2 ? 'var(--red)' : 'var(--muted)' },
        ].map(m => (
          <div key={m.lbl} style={{ background:'rgba(3,45,61,.3)',borderRadius:6,padding:'6px 8px' }}>
            <div style={{ fontSize:'.6rem',color:'var(--muted)',marginBottom:2 }}>{m.lbl}</div>
            <div style={{ fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:m.color,fontSize:'.8rem' }}>{m.val}</div>
          </div>
        ))}
      </div>

      {/* Última mensagem enviada */}
      {ag.ultima_msg_agente_em && (() => {
        const mins = Math.floor((Date.now() - new Date(ag.ultima_msg_agente_em).getTime()) / 60000);
        const cor = mins > 60 ? 'var(--red)' : mins > 20 ? 'var(--yellow)' : 'var(--muted)';
        return (
          <div style={{ fontSize:'.68rem',color:cor,marginBottom:6,display:'flex',alignItems:'center',gap:4 }}>
            <span>⌨</span>
            <span>Última msg enviada: {mins < 1 ? 'agora' : mins < 60 ? `há ${mins}min` : `há ${Math.floor(mins/60)}h ${mins%60}min`}</span>
            {mins > 60 && ag.status_atual === 'online' && <span style={{ background:'rgba(255,71,87,.12)',color:'var(--red)',padding:'0 5px',borderRadius:4,fontSize:'.6rem',fontWeight:700 }}>INATIVO</span>}
          </div>
        );
      })()}

      {/* Alerta fantasma */}
      {ag.status_atual === 'online' && ag.conversas_ativas > 0 && !ag.ultima_msg_agente_em && (
        <div style={{ background:'rgba(255,71,87,.07)',border:'1px solid rgba(255,71,87,.2)',borderRadius:6,padding:'5px 8px',marginBottom:6,fontSize:'.68rem',color:'var(--red)',display:'flex',gap:6,alignItems:'center' }}>
          <span style={{ animation:'pulse-glow 1.5s ease infinite',display:'inline-block',width:6,height:6,borderRadius:'50%',background:'var(--red)',flexShrink:0 }}></span>
          Assumiu conversa(s) mas ainda não respondeu
        </div>
      )}

      {/* IP + Cidade + Dispositivo */}
      {(ag.ultimo_ip || ag.ultima_cidade || ag.ultimo_dispositivo) && (
        <div style={{ background:'rgba(3,45,61,.4)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px',marginBottom:6,fontSize:'.68rem',display:'flex',flexDirection:'column',gap:2 }}>
          {ag.ultimo_ip && <div style={{ display:'flex',justifyContent:'space-between' }}>
            <span style={{ color:'var(--muted)' }}>📍 IP</span>
            <span style={{ fontFamily:"'JetBrains Mono',monospace",color:'var(--text)' }}>{ag.ultimo_ip.replace('::ffff:','')}</span>
          </div>}
          {ag.ultima_cidade && <div style={{ display:'flex',justifyContent:'space-between' }}>
            <span style={{ color:'var(--muted)' }}>🌍 Local</span>
            <span style={{ color:'var(--g1)',fontWeight:600 }}>{ag.ultima_cidade}</span>
          </div>}
          {ag.ultimo_dispositivo && <div style={{ display:'flex',justifyContent:'space-between' }}>
            <span style={{ color:'var(--muted)' }}>🖥️ Device</span>
            <span>{ag.ultimo_dispositivo}</span>
          </div>}
          {ag.ips_distintos_hoje > 1 && <div style={{ color:'var(--yellow)',fontWeight:600,marginTop:2 }}>⚠️ {ag.ips_distintos_hoje} IPs hoje</div>}
        </div>
      )}

      {/* Heatmap de atividade */}
      {ag.atendimentos_hoje > 0 || ag.atendimentos_semana > 0 ? (
        <details style={{ marginBottom: 8 }}>
          <summary style={{ fontSize: '.68rem', color: 'var(--muted)', cursor: 'pointer', padding: '4px 0', userSelect: 'none' }}>
            📊 Ver heatmap de atividade
          </summary>
          <div style={{ marginTop: 8 }}>
            <HeatmapAgente agenteId={ag.id} nome={ag.nome} />
          </div>
        </details>
      ) : null}

      {/* Horário de trabalho + intervalos */}
      {diaConfig?.ativo && (
        <div style={{ fontSize:'.65rem',color:'var(--dim)',padding:'4px 0' }}>
          <div style={{ display:'flex',justifyContent:'space-between',marginBottom: diaConfig.intervalos?.length ? 3 : 0 }}>
            <span>🕐 Horário</span>
            <span style={{ fontFamily:"'JetBrains Mono',monospace" }}>{diaConfig.inicio} — {diaConfig.fim}</span>
          </div>
          {(diaConfig.intervalos || []).map((iv, i) => (
            <div key={i} style={{ display:'flex',justifyContent:'space-between',color:'rgba(245,197,24,.6)',paddingLeft:10 }}>
              <span>↳ {iv.label || 'Intervalo'}</span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace" }}>{iv.inicio} — {iv.fim}</span>
            </div>
          ))}
        </div>
      )}

      {ag.status_atual === 'offline' && ag.ultimo_logout && (
        <div style={{ marginTop:4,fontSize:'.68rem',color:'var(--muted)',fontFamily:"'JetBrains Mono',monospace" }}>Offline {timeAgo(ag.ultimo_logout)}</div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
export default function Agentes() {
  const [agentesMonitor, setAgentesMonitor] = useState([]);
  const [agentesLista, setAgentesLista] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [sessoes, setSessoes] = useState([]);
  const [relatorio, setRelatorio] = useState([]);
  const [alertasPonto, setAlertasPonto] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('monitor');
  const [modal, setModal] = useState(null); // null | {} (novo) | {id,...} (editar)
  const showToast = useStore(s => s.showToast);
  const userId = useStore(s => s.userId);
  const role = useStore(s => s.role);

  const load = useCallback(async () => {
    try {
      const [mon, lista, res, rank, sess, rel, alPonto] = await Promise.all([
        apiJson('/api/agentes/monitor').catch(() => []),
        apiJson('/api/agentes').catch(() => []),
        apiJson('/api/agentes/monitor/resumo').catch(() => null),
        apiJson('/api/agentes/monitor/ranking').catch(() => []),
        apiJson('/api/agentes/monitor/sessoes').catch(() => []),
        apiJson('/api/agentes/monitor/relatorio').catch(() => []),
        apiJson('/api/agentes/alertas-ponto').catch(() => []),
      ]);
      setAgentesMonitor(Array.isArray(mon) ? mon : []);
      setAgentesLista(Array.isArray(lista) ? lista : []);
      setResumo(res);
      setRanking(Array.isArray(rank) ? rank : []);
      setSessoes(Array.isArray(sess) ? sess : []);
      setRelatorio(Array.isArray(rel) ? rel : []);
      setAlertasPonto(Array.isArray(alPonto) ? alPonto : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const handlePausa = async (acao, motivo) => {
    await api('/api/agentes/monitor/pausa', { method:'POST', body:JSON.stringify({acao,motivo}) });
    showToast(acao === 'iniciar' ? `☕ Pausa: ${motivo}` : '✅ Volta da pausa');
    load();
  };

  const handleDelete = async (id, nome) => {
    if (!window.confirm(`Remover agente "${nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const res = await api(`/api/agentes/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('✅ Agente removido'); load(); }
      else { const d = await res.json(); showToast('Erro: '+(d.error||'falha'), true); }
    } catch (e) { showToast('Erro: '+e.message, true); }
  };

  const exportCSV = () => {
    if (!relatorio.length) { showToast('Sem dados', true); return; }
    const dias = []; for (let i=6;i>=0;i--) { const d=new Date();d.setDate(d.getDate()-i);dias.push(d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})); }
    const bom = '\uFEFF';
    const header = 'Agente;'+dias.join(';')+';Total Semana;Logins;Pausas\n';
    const rows = relatorio.map(r => `${r.nome};${r.d6};${r.d5};${r.d4};${r.d3};${r.d2};${r.d1};${r.hoje};${r.total_semana};${r.logins_semana};${r.pausas_semana}`).join('\n');
    const blob = new Blob([bom+header+rows], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `agentes-relatorio-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); showToast('✅ CSV exportado!');
  };

  const onlines = agentesMonitor.filter(a => a.status_atual==='online').length;
  const idles = agentesMonitor.filter(a => a.status_atual==='idle').length;
  const pausados = agentesMonitor.filter(a => a.status_atual==='pausa').length;
  const offlines = agentesMonitor.filter(a => a.status_atual==='offline').length;
  const myAgent = agentesMonitor.find(a => a.id === userId);

  const rankLabels = ranking.map(r => r.nome?.split(' ')[0] || '?');
  const rankData = ranking.map(r => parseInt(r.total_atendimentos) || 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>👥 Agentes</h1>
          <p>Gestão e monitoramento em tempo real</p>
        </div>
        <div style={{ display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' }}>
          {myAgent?.status_atual === 'pausa' ? (
            <button className="btn btn-primary btn-sm" onClick={() => handlePausa('finalizar')}>▶️ Voltar</button>
          ) : (
            <div style={{ display:'flex',gap:4 }}>
              {PAUSA_OPCOES.map(p => (
                <button key={p.id} className="btn btn-outline btn-xs" onClick={() => handlePausa('iniciar',p.id)} title={p.label}>{p.label.split(' ')[0]}</button>
              ))}
            </div>
          )}
          {role === 'admin' && <button className="btn btn-primary btn-sm" onClick={() => setModal({})}>➕ Novo Agente</button>}
          <button className="btn btn-outline btn-sm" onClick={load}>🔄</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',marginBottom:16 }}>
        <div className="kpi"><div className="kpi-label">Online</div><div className="kpi-val" style={{color:'var(--g1)'}}>{loading?<span className="spinner"/>:onlines}</div></div>
        <div className="kpi"><div className="kpi-label">Ausente</div><div className="kpi-val" style={{color:'var(--yellow)'}}>{loading?<span className="spinner"/>:idles}</div></div>
        <div className="kpi"><div className="kpi-label">Em Pausa</div><div className="kpi-val" style={{color:'var(--blue)'}}>{loading?<span className="spinner"/>:pausados}</div></div>
        <div className="kpi"><div className="kpi-label">Offline</div><div className="kpi-val" style={{color:'var(--red)'}}>{loading?<span className="spinner"/>:offlines}</div></div>
        <div className="kpi"><div className="kpi-label">Atend. Hoje</div><div className="kpi-val">{resumo?.total_atendimentos||0}</div></div>
        <div className="kpi"><div className="kpi-label">Pausas Hoje</div><div className="kpi-val">{resumo?.total_pausas||0}</div></div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex',gap:6,marginBottom:16,overflowX:'auto',WebkitOverflowScrolling:'touch' }}>
        {[['monitor','📡 Tempo Real'],['gestao','⚙️ Gestão'],['ranking','🏆 Ranking'],['alertas','🚨 Alertas'],['sessoes','📋 Sessões'],['relatorio','📊 Relatório']].map(([id,label]) => (
          <button key={id} className={`btn btn-sm ${tab===id?'btn-primary':'btn-outline'}`} onClick={() => setTab(id)} style={{flexShrink:0}}>{label}</button>
        ))}
      </div>

      {/* ═══ TAB: MONITOR ═══ */}
      {tab === 'monitor' && (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12,animation:'fadeIn .3s ease' }}>
          {loading ? [1,2,3,4].map(i => <div key={i} className="skeleton" style={{height:180,borderRadius:12}}/>) :
           agentesMonitor.length === 0 ? <div style={{gridColumn:'1/-1',textAlign:'center',padding:40,color:'var(--muted)'}}>Nenhum agente ativo</div> :
           agentesMonitor.map(ag => <AgentCard key={ag.id} ag={ag} onEdit={(a) => setModal(a)} />)}
        </div>
      )}

      {/* ═══ TAB: GESTÃO (CRUD) ═══ */}
      {tab === 'gestao' && (
        <div className="card" style={{ animation:'fadeIn .3s ease' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
            <div className="card-title" style={{margin:0}}>⚙️ Gerenciar Agentes</div>
            {role === 'admin' && <button className="btn btn-primary btn-sm" onClick={() => setModal({})}>➕ Novo Agente</button>}
          </div>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:'.82rem' }}>
            <thead><tr>
              {['Avatar','Nome','Login','Status','Ativo','Ações'].map(h => (
                <th key={h} style={{ textAlign:'left',padding:'10px 12px',color:'var(--muted)',fontSize:'.68rem',textTransform:'uppercase',letterSpacing:'.08em',borderBottom:'1px solid var(--border)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {agentesLista.length === 0 ? (
                <tr><td colSpan={6} style={{textAlign:'center',padding:40,color:'var(--muted)'}}>Nenhum agente cadastrado</td></tr>
              ) : agentesLista.map(ag => {
                const isOnline = agentesMonitor.find(m => m.id === ag.id);
                const st = STATUS_MAP[isOnline?.status_atual] || STATUS_MAP.offline;
                return (
                  <tr key={ag.id} style={{borderBottom:'1px solid rgba(255,255,255,.03)'}}>
                    <td style={{padding:'10px 12px',fontSize:'1.5rem'}}>{ag.avatar || '🧑'}</td>
                    <td style={{fontWeight:600}}>{ag.nome}</td>
                    <td><code style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'.75rem',color:'var(--muted)'}}>{ag.login}</code></td>
                    <td><span className={`badge ${st.cls}`} style={{fontSize:'.62rem'}}>{st.emoji} {st.label}</span></td>
                    <td><span className={`badge ${ag.ativo ? 'badge-green':'badge-red'}`} style={{fontSize:'.62rem'}}>{ag.ativo ? '● Ativo':'○ Inativo'}</span></td>
                    <td>
                      <div style={{display:'flex',gap:6}}>
                        <button className="btn btn-outline btn-xs" onClick={() => setModal(ag)}>✏️ Editar</button>
                        {role === 'admin' && <button className="btn btn-danger btn-xs" onClick={() => handleDelete(ag.id,ag.nome)}>🗑️</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ TAB: RANKING ═══ */}
      {tab === 'ranking' && (
        <div style={{ animation:'fadeIn .3s ease' }}>
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-title">🏆 Produtividade (7 dias)</div>
            <div className="chart-wrap" style={{height:280}}>
              {rankLabels.length > 0 ? (
                <Bar data={{labels:rankLabels,datasets:[{label:'Atendimentos',data:rankData,backgroundColor:rankData.map((_,i)=>i===0?'rgba(0,200,150,.7)':i===1?'rgba(62,207,255,.6)':i===2?'rgba(245,197,24,.6)':'rgba(255,255,255,.15)'),borderRadius:6,borderSkipped:false}]}}
                  options={{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(2,55,65,.92)',titleColor:'#fff',bodyColor:'#fff',cornerRadius:8}},scales:{x:{grid:{color:'rgba(0,139,135,.2)'},ticks:{color:'rgba(255,255,255,.4)'}},y:{grid:{display:false},ticks:{color:'rgba(255,255,255,.6)',font:{size:12,weight:'600'}}}}}} />
              ) : <div style={{textAlign:'center',padding:40,color:'var(--muted)'}}>Sem dados</div>}
            </div>
          </div>
          <div className="card">
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.82rem'}}>
              <thead><tr>{['#','Agente','Status','Hoje','Semana','TMA'].map(h=><th key={h} style={{textAlign:'left',padding:'8px 10px',color:'var(--muted)',fontSize:'.68rem',textTransform:'uppercase',borderBottom:'1px solid var(--border)'}}>{h}</th>)}</tr></thead>
              <tbody>{ranking.map((r,i) => {
                const st = STATUS_MAP[r.status_atual]||STATUS_MAP.offline;
                return <tr key={r.id}><td style={{padding:'8px 10px',fontFamily:"'JetBrains Mono',monospace",color:i<3?'var(--g1)':'var(--dim)'}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</td><td style={{fontWeight:600}}>{r.avatar} {r.nome}</td><td><span className={`badge ${st.cls}`} style={{fontSize:'.62rem'}}>{st.emoji} {st.label}</span></td><td style={{fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{r.atendimentos_hoje}</td><td style={{fontFamily:"'JetBrains Mono',monospace"}}>{r.total_atendimentos}</td><td style={{fontFamily:"'JetBrains Mono',monospace",color:'var(--muted)'}}>{r.tempo_medio_min||'—'}min</td></tr>;
              })}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ TAB: ALERTAS PONTO ═══ */}
      {tab === 'alertas' && (
        <div className="card" style={{animation:'fadeIn .3s ease'}}>
          <div className="card-title">🚨 Alertas de Ponto ({alertasPonto.length})</div>
          {alertasPonto.length === 0 ? (
            <div style={{textAlign:'center',padding:40}}>
              <div style={{fontSize:'2.5rem',opacity:.3,marginBottom:8}}>✅</div>
              <div style={{color:'var(--g1)',fontWeight:600}}>Tudo em ordem</div>
              <div style={{fontSize:'.78rem',color:'var(--muted)',marginTop:4}}>Nenhum alerta de ponto detectado</div>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {alertasPonto.map((a, i) => {
                const icon = a.tipo === 'nao_logou' ? '🚨' : a.tipo === 'atraso' ? '⏰' : a.tipo === 'idle' ? '💤' : a.tipo === 'troca_ip' ? '🔀' : '⚠️';
                const color = a.tipo === 'nao_logou' ? 'var(--red)' : a.tipo === 'atraso' ? 'var(--yellow)' : a.tipo === 'idle' ? 'var(--yellow)' : 'var(--blue)';
                return (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'rgba(3,45,61,.4)',border:`1px solid ${color}30`,borderLeft:`3px solid ${color}`,borderRadius:8}}>
                    <span style={{fontSize:'1.3rem'}}>{icon}</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:'.85rem'}}>{a.agente}</div>
                      <div style={{fontSize:'.75rem',color:'var(--muted)'}}>{a.msg}</div>
                    </div>
                    <span className="badge" style={{fontSize:'.6rem',background:`${color}20`,color:color,border:`1px solid ${color}30`}}>{a.tipo.replace('_',' ')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: SESSÕES ═══ */}
      {tab === 'sessoes' && (
        <div className="card" style={{animation:'fadeIn .3s ease'}}>
          <div className="card-title">📋 Sessões de Hoje</div>
          {sessoes.length === 0 ? <div style={{textAlign:'center',padding:40,color:'var(--muted)'}}>Nenhuma sessão hoje</div> : (
            <div style={{display:'flex',flexDirection:'column',gap:2}}>
              {sessoes.filter(s=>s.tipo!=='heartbeat').map((s,i) => {
                const t = {login:{icon:'🟢',label:'Login',color:'var(--g1)'},logout:{icon:'🔴',label:'Logout',color:'var(--red)'},pausa_inicio:{icon:'☕',label:'Pausa',color:'var(--blue)'},pausa_fim:{icon:'▶️',label:'Voltou',color:'var(--g1)'}}[s.tipo]||{icon:'•',label:s.tipo,color:'var(--muted)'};
                return <div key={s.id||i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderBottom:'1px solid var(--border)',fontSize:'.82rem'}}>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'.72rem',color:'var(--dim)',width:50}}>{fmtHora(s.criado_em)}</span>
                  <span style={{fontSize:'1rem'}}>{s.avatar||'👤'}</span>
                  <span style={{fontWeight:600,flex:1}}>{s.agente_nome||s.agente_id}</span>
                  <span style={{color:t.color,fontWeight:600,fontSize:'.78rem'}}>{t.icon} {t.label}</span>
                  {s.motivo && <span style={{fontSize:'.72rem',color:'var(--muted)'}}>({s.motivo})</span>}
                </div>;
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: RELATÓRIO ═══ */}
      {tab === 'relatorio' && (
        <div style={{animation:'fadeIn .3s ease'}}>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
            <button className="btn btn-outline btn-sm" onClick={exportCSV}>⬇️ Exportar CSV</button>
          </div>
          <div className="card">
            <div className="card-title">📊 Relatório Semanal</div>
            {relatorio.length === 0 ? <div style={{textAlign:'center',padding:40,color:'var(--muted)'}}>Sem dados</div> : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.82rem',minWidth:600}}>
                  <thead><tr>
                    {['Agente',...[6,5,4,3,2,1,0].map(i=>{const d=new Date();d.setDate(d.getDate()-i);return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}),'Total','Logins','Pausas'].map(h=>(
                      <th key={h} style={{textAlign:'center',padding:'8px 6px',color:'var(--muted)',fontSize:'.65rem',textTransform:'uppercase',borderBottom:'1px solid var(--border)'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{relatorio.map(r=>(
                    <tr key={r.id}>
                      <td style={{padding:'8px 6px',fontWeight:600,textAlign:'left'}}>{r.nome}</td>
                      {['d6','d5','d4','d3','d2','d1','hoje'].map(k=>(
                        <td key={k} style={{textAlign:'center',fontFamily:"'JetBrains Mono',monospace",color:parseInt(r[k])>0?'var(--text)':'var(--dim)'}}>{r[k]||0}</td>
                      ))}
                      <td style={{textAlign:'center',fontWeight:700,color:'var(--g1)',fontFamily:"'JetBrains Mono',monospace"}}>{r.total_semana}</td>
                      <td style={{textAlign:'center',fontFamily:"'JetBrains Mono',monospace",color:'var(--muted)'}}>{r.logins_semana}</td>
                      <td style={{textAlign:'center',fontFamily:"'JetBrains Mono',monospace",color:'var(--muted)'}}>{r.pausas_semana}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL */}
      {modal !== null && <AgentModal agente={modal.id ? modal : null} onClose={() => setModal(null)} onSave={() => { load(); showToast(modal.id ? '✅ Agente atualizado' : '✅ Agente criado'); }} />}
    </>
  );
}
