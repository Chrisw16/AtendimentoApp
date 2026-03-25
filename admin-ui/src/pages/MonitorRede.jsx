import React, { useState, useEffect, useCallback, useRef } from 'react';

const api = (path, opts = {}) => {
  const { headers: extraH, ...rest } = opts;
  return fetch('/admin' + path, {
    headers: { 'Content-Type':'application/json', 'x-admin-token': localStorage.getItem('maxxi_token')||'', ...extraH },
    ...rest,
  }).then(async r => {
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
    return d;
  });
};

const STATUS_COR   = { online:'#00c896', lento:'#f5c518', instavel:'#ff6b35', offline:'#ff4757', desconhecido:'rgba(255,255,255,.12)' };
const STATUS_LABEL = { online:'Online', lento:'Lento', instavel:'Instável', offline:'Offline', desconhecido:'—' };
const STATUS_ORDEM = { offline:0, instavel:1, lento:2, online:3, desconhecido:4 };
const TIPOS = ['ping','tcp','http','https'];

const GROUP_COLORS = ['#3ecfff','#a78bfa','#f472b6','#f5c518','#00c896','#ff6b35','#38bdf8'];

function tempoDesde(ts) {
  if (!ts) return null;
  const s = Math.floor((Date.now()-ts)/1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}min`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

const Sparkline = ({ dados, w=100, h=24 }) => {
  if (!dados?.length) return <div style={{width:w,height:h}}/>;
  const P=2, validos=dados.filter(d=>d.latencia_ms);
  const maxMs = Math.max(...validos.map(d=>d.latencia_ms), 1);
  const pts = dados.map((d,i) => {
    const x = P+(i/(dados.length-1||1))*(w-P*2);
    const y = d.latencia_ms ? P+(1-d.latencia_ms/maxMs)*(h-P*2) : h-P;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{display:'block'}}>
      <polyline points={pts} fill="none" stroke="#3ecfff" strokeWidth="1.5" strokeLinejoin="round" opacity="0.6"/>
      {dados.filter(d=>d.status==='offline').map((d,_) => {
        const i=dados.indexOf(d), x=P+(i/(dados.length-1||1))*(w-P*2);
        return <circle key={i} cx={x.toFixed(1)} cy={h-P} r="2.5" fill="#ff4757"/>;
      })}
    </svg>
  );
};

const UptimePct = ({ v }) => {
  if (v === null || v === undefined) return null;
  const cor = v >= 99 ? '#00c896' : v >= 95 ? '#f5c518' : '#ff4757';
  return <span style={{fontSize:10,color:cor,fontWeight:700}}>{v}%</span>;
};

// ── Modal de histórico detalhado ─────────────────────────────────────────────
const ModalHistorico = ({ host, onClose }) => {
  const [historico, setHistorico] = useState([]);
  const [horario, setHorario] = useState([]);
  const [traceroute, setTraceroute] = useState(null);
  const [loadingTR, setLoadingTR] = useState(false);

  useEffect(() => {
    api(`/api/monitor/historico/${host.id}?limite=120`).then(setHistorico).catch(()=>{});
    api(`/api/monitor/historico-horario/${host.id}`).then(setHorario).catch(()=>{});
  }, [host.id]);

  const runTraceroute = async () => {
    setLoadingTR(true);
    try { setTraceroute((await api(`/api/monitor/traceroute/${host.id}`,{method:'POST',body:'{}'})).resultado); }
    catch(e) { setTraceroute('Erro: '+e.message); }
    setLoadingTR(false);
  };

  const cor = STATUS_COR[host.status]||STATUS_COR.desconhecido;

  // Calcular uptime das últimas 24h a partir do histórico
  const uptime24h = historico.length
    ? Math.round(historico.filter(h=>h.status==='online').length/historico.length*100)
    : null;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:9999,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:40,overflowY:'auto'}}>
      <div style={{background:'rgba(2,18,28,.99)',border:'1px solid rgba(255,255,255,.1)',borderRadius:14,padding:24,width:660,maxWidth:'95vw',marginBottom:40}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:cor,boxShadow:`0 0 8px ${cor}`}}/>
            <div>
              <div style={{fontSize:16,fontWeight:700,color:'#fff'}}>{host.nome}</div>
              <div style={{fontSize:11,color:'rgba(255,255,255,.35)',fontFamily:'monospace'}}>{host.host}{host.porta?':'+host.porta:''} · {host.tipo?.toUpperCase()}</div>
            </div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'rgba(255,255,255,.4)',cursor:'pointer',fontSize:20}}>×</button>
        </div>

        {/* Métricas */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
          {[
            {label:'Status',valor:<span style={{color:cor,fontWeight:700}}>{STATUS_LABEL[host.status]||'—'}</span>},
            {label:'Latência',valor:<span style={{fontFamily:'monospace',color:'#3ecfff'}}>{host.latencia_ms ? host.latencia_ms+'ms' : '—'}</span>},
            {label:'Uptime 24h',valor:<span style={{color:uptime24h>=99?'#00c896':uptime24h>=95?'#f5c518':'#ff4757',fontWeight:700}}>{uptime24h!==null?uptime24h+'%':'—'}</span>},
            {label:'Último check',valor:<span style={{fontSize:10,color:'rgba(255,255,255,.5)'}}>{host.ts ? new Date(host.ts).toLocaleTimeString('pt-BR') : '—'}</span>},
          ].map(m => (
            <div key={m.label} style={{background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.07)',borderRadius:8,padding:'10px 12px',textAlign:'center'}}>
              <div style={{fontSize:9.5,color:'rgba(255,255,255,.3)',marginBottom:4,textTransform:'uppercase'}}>{m.label}</div>
              <div style={{fontSize:14}}>{m.valor}</div>
            </div>
          ))}
        </div>

        {/* Sparkline grande */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginBottom:6,textTransform:'uppercase',letterSpacing:'.05em'}}>Latência — últimas {historico.length} verificações</div>
          <div style={{background:'rgba(0,0,0,.3)',borderRadius:8,padding:'8px 10px'}}>
            <Sparkline dados={historico} w={600} h={50}/>
          </div>
        </div>

        {/* Histórico por hora */}
        {horario.length > 0 && (
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginBottom:8,textTransform:'uppercase',letterSpacing:'.05em'}}>Uptime por hora — 48h</div>
            <div style={{display:'flex',gap:3,alignItems:'flex-end',height:40,overflowX:'auto'}}>
              {horario.slice(-48).map((h,i) => {
                const pct = h.uptime ?? 0;
                const c = pct>=99?'#00c896':pct>=95?'#f5c518':pct>0?'#ff6b35':'#ff4757';
                return (
                  <div key={i} title={`${new Date(h.hora).toLocaleString('pt-BR')}: ${pct}% uptime${h.avg_ms?' · '+h.avg_ms+'ms':''}`}
                    style={{flex:'0 0 12px',height:Math.max(4,(pct/100)*36),background:c,borderRadius:2,opacity:.85,cursor:'default'}}/>
                );
              })}
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'rgba(255,255,255,.2)',marginTop:3}}>
              <span>48h atrás</span><span>agora</span>
            </div>
          </div>
        )}

        {/* Traceroute */}
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
            <div style={{fontSize:10,color:'rgba(255,255,255,.3)',textTransform:'uppercase',letterSpacing:'.05em'}}>Traceroute</div>
            <button onClick={runTraceroute} disabled={loadingTR} style={{fontSize:10,padding:'3px 10px',borderRadius:5,cursor:'pointer',background:'rgba(62,207,255,.08)',border:'1px solid rgba(62,207,255,.2)',color:'#3ecfff'}}>
              {loadingTR ? 'Executando...' : '▶ Executar'}
            </button>
          </div>
          {traceroute && (
            <pre style={{background:'rgba(0,0,0,.4)',borderRadius:8,padding:'10px 12px',fontSize:10,color:'rgba(255,255,255,.6)',fontFamily:'monospace',whiteSpace:'pre-wrap',wordBreak:'break-all',maxHeight:200,overflowY:'auto'}}>
              {traceroute}
            </pre>
          )}
          {!traceroute && <div style={{fontSize:11,color:'rgba(255,255,255,.2)',textAlign:'center',padding:'16px 0'}}>Clique em executar para ver o caminho de rede</div>}
        </div>

        {/* Últimos checks */}
        <div style={{marginTop:16}}>
          <div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginBottom:6,textTransform:'uppercase',letterSpacing:'.05em'}}>Últimas verificações</div>
          <div style={{maxHeight:140,overflowY:'auto',display:'flex',flexDirection:'column',gap:3}}>
            {historico.slice(-20).reverse().map((c,i) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,fontSize:10.5}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:STATUS_COR[c.status]||'#444',flexShrink:0}}/>
                <span style={{color:'rgba(255,255,255,.35)',fontFamily:'monospace',minWidth:55}}>{new Date(c.checado_em).toLocaleTimeString('pt-BR')}</span>
                <span style={{color:STATUS_COR[c.status]||'#888',minWidth:60}}>{STATUS_LABEL[c.status]||c.status}</span>
                <span style={{color:'rgba(255,255,255,.3)',fontFamily:'monospace'}}>{c.latencia_ms ? c.latencia_ms+'ms' : c.erro || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Card do host ─────────────────────────────────────────────────────────────
const HostCard = ({ host, historico, uptime, onCheck, onEdit, onClick }) => {
  const cor = STATUS_COR[host.status]||STATUS_COR.desconhecido;
  const [checando, setChecando] = useState(false);
  const check = async (e) => { e.stopPropagation(); setChecando(true); await onCheck(host.id); setChecando(false); };
  const edit = (e) => { e.stopPropagation(); onEdit(host); };
  const isOff = host.status==='offline';
  const tempoOff = isOff && host.ultima_mudanca?.ts ? tempoDesde(host.ultima_mudanca.ts) : null;

  return (
    <div onClick={onClick} style={{
      background: isOff ? 'rgba(255,71,87,.06)' : 'rgba(2,35,45,.85)',
      border:`1px solid ${cor}44`, borderRadius:10, padding:'11px 13px', cursor:'pointer',
      transition:'border-color .15s',
    }}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:6}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:cor,flexShrink:0,
              boxShadow:host.status==='online'?`0 0 5px ${cor}`:'none'}}/>
            <span style={{fontSize:11.5,fontWeight:700,color:'rgba(255,255,255,.85)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{host.nome}</span>
          </div>
          <div style={{fontSize:9.5,color:'rgba(255,255,255,.3)',fontFamily:'monospace'}}>{host.host}{host.porta?':'+host.porta:''}</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2,flexShrink:0,marginLeft:8}}>
          <span style={{fontSize:10,color:cor,fontWeight:700}}>{STATUS_LABEL[host.status]||'—'}</span>
          {host.latencia_ms && <span style={{fontSize:10,color:'rgba(255,255,255,.35)',fontFamily:'monospace'}}>{host.latencia_ms}ms</span>}
        </div>
      </div>

      {/* Linha de info */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
        {uptime !== null && uptime !== undefined && <UptimePct v={uptime}/>}
        {tempoOff && <span style={{fontSize:9.5,color:'#ff4757',background:'rgba(255,71,87,.1)',border:'1px solid rgba(255,71,87,.2)',borderRadius:4,padding:'1px 6px'}}>offline há {tempoOff}</span>}
        {host.erro && !isOff && <span title={host.erro} style={{fontSize:9.5,color:'rgba(255,255,255,.25)',cursor:'help'}}>⚠ erro</span>}
      </div>

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <Sparkline dados={historico}/>
        <div style={{display:'flex',gap:5}}>
          <button onClick={check} disabled={checando} title="Verificar agora" style={{fontSize:9.5,padding:'2px 7px',borderRadius:5,cursor:'pointer',background:'rgba(62,207,255,.08)',border:'1px solid rgba(62,207,255,.2)',color:'#3ecfff'}}>
            {checando?'...':'⟳'}
          </button>
          <button onClick={edit} title="Editar" style={{fontSize:9.5,padding:'2px 7px',borderRadius:5,cursor:'pointer',background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',color:'rgba(255,255,255,.35)'}}>
            ✎
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Modal editar/criar host ──────────────────────────────────────────────────
const inpStyle = {background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',borderRadius:6,padding:'6px 9px',color:'#fff',fontSize:12,width:'100%',outline:'none',boxSizing:'border-box'};

const ModalHost = ({ host, onSave, onClose, onDelete }) => {
  const [form, setForm] = useState(host||{nome:'',host:'',tipo:'ping',porta:'',grupo:'Geral',descricao:'',ativo:true});
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'rgba(2,18,28,.99)',border:'1px solid rgba(255,255,255,.1)',borderRadius:12,padding:22,width:380,maxWidth:'95vw'}}>
        <div style={{fontSize:13,fontWeight:700,color:'#3ecfff',marginBottom:16}}>{host?.id?'Editar host':'Novo host'}</div>
        <div style={{display:'flex',gap:10,marginBottom:10}}>
          <div style={{flex:2}}><div style={{fontSize:10,color:'rgba(255,255,255,.4)',marginBottom:3}}>Nome</div><input value={form.nome||''} onChange={e=>set('nome',e.target.value)} placeholder="POP Macaíba" style={inpStyle}/></div>
          <div style={{flex:1}}><div style={{fontSize:10,color:'rgba(255,255,255,.4)',marginBottom:3}}>Grupo</div><input value={form.grupo||''} onChange={e=>set('grupo',e.target.value)} placeholder="POPs" style={inpStyle}/></div>
        </div>
        <div style={{display:'flex',gap:10,marginBottom:10}}>
          <div style={{flex:2}}><div style={{fontSize:10,color:'rgba(255,255,255,.4)',marginBottom:3}}>Host / IP</div><input value={form.host||''} onChange={e=>set('host',e.target.value)} placeholder="170.82.253.18" style={inpStyle}/></div>
          <div style={{flex:1}}><div style={{fontSize:10,color:'rgba(255,255,255,.4)',marginBottom:3}}>Tipo</div><select value={form.tipo} onChange={e=>set('tipo',e.target.value)} style={{...inpStyle,cursor:'pointer'}}>{TIPOS.map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}</select></div>
          {form.tipo==='tcp' && <div style={{flex:'0 0 80px'}}><div style={{fontSize:10,color:'rgba(255,255,255,.4)',marginBottom:3}}>Porta</div><input type="number" value={form.porta||''} onChange={e=>set('porta',e.target.value)} placeholder="55013" style={inpStyle}/></div>}
        </div>
        <div style={{marginBottom:10}}><div style={{fontSize:10,color:'rgba(255,255,255,.4)',marginBottom:3}}>Descrição (opcional)</div><input value={form.descricao||''} onChange={e=>set('descricao',e.target.value)} style={inpStyle}/></div>
        {host?.id && <label style={{display:'flex',alignItems:'center',gap:7,marginBottom:12,cursor:'pointer'}}><input type="checkbox" checked={form.ativo} onChange={e=>set('ativo',e.target.checked)}/><span style={{fontSize:11,color:'rgba(255,255,255,.5)'}}>Host ativo</span></label>}
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <button onClick={()=>onSave(form)} style={{flex:1,padding:'8px 0',borderRadius:7,background:'rgba(62,207,255,.15)',border:'1px solid rgba(62,207,255,.3)',color:'#3ecfff',fontWeight:700,fontSize:12,cursor:'pointer'}}>Salvar</button>
          {host?.id && <button onClick={()=>onDelete(host.id)} style={{padding:'8px 12px',borderRadius:7,background:'rgba(255,71,87,.1)',border:'1px solid rgba(255,71,87,.25)',color:'#ff4757',fontSize:12,cursor:'pointer'}}>Excluir</button>}
          <button onClick={onClose} style={{padding:'8px 12px',borderRadius:7,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.1)',color:'rgba(255,255,255,.4)',fontSize:12,cursor:'pointer'}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
};

// ── Modal importação em massa ────────────────────────────────────────────────
const ModalImport = ({ onImport, onClose }) => {
  const [texto, setTexto] = useState('');
  const [grupo, setGrupo] = useState('POPs');
  const [tipo, setTipo] = useState('tcp');
  const [preview, setPreview] = useState([]);
  const EXEMPLO = `POP Macaíba|170.82.253.18|55013\nPOP Natal|192.168.1.1|55013\nOLT Principal|10.0.0.1|23`;
  useEffect(() => {
    const linhas = texto.trim().split('\n').filter(l=>l.trim());
    setPreview(linhas.map(l=>{
      const p=l.split(/[|,;\t]+/);
      return {nome:p[0]?.trim()||'',host:p[1]?.trim()||'',porta:p[2]?.trim()||''};
    }).filter(p=>p.nome&&p.host));
  },[texto]);
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'rgba(2,18,28,.99)',border:'1px solid rgba(255,255,255,.1)',borderRadius:12,padding:22,width:500,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{fontSize:14,fontWeight:700,color:'#3ecfff',marginBottom:4}}>Importar hosts em massa</div>
        <div style={{fontSize:11,color:'rgba(255,255,255,.3)',marginBottom:12}}>Uma linha por host: <code style={{color:'rgba(255,255,255,.5)'}}>Nome | IP | Porta</code></div>
        <div style={{display:'flex',gap:10,marginBottom:10}}>
          <div style={{flex:1}}><div style={{fontSize:10,color:'rgba(255,255,255,.4)',marginBottom:3}}>Grupo padrão</div><input value={grupo} onChange={e=>setGrupo(e.target.value)} style={inpStyle}/></div>
          <div style={{flex:1}}><div style={{fontSize:10,color:'rgba(255,255,255,.4)',marginBottom:3}}>Tipo padrão</div><select value={tipo} onChange={e=>setTipo(e.target.value)} style={{...inpStyle,cursor:'pointer'}}>{TIPOS.map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}</select></div>
        </div>
        <textarea value={texto} onChange={e=>setTexto(e.target.value)} placeholder={EXEMPLO} rows={7} style={{...inpStyle,resize:'vertical',lineHeight:1.6,fontFamily:'monospace',fontSize:11}}/>
        {preview.length>0 && (
          <div style={{margin:'10px 0',padding:'8px 10px',background:'rgba(62,207,255,.04)',borderRadius:7,border:'1px solid rgba(62,207,255,.12)'}}>
            <div style={{fontSize:10,color:'rgba(62,207,255,.7)',marginBottom:6,fontWeight:700}}>PRÉVIA — {preview.length} hosts</div>
            {preview.slice(0,6).map((p,i)=>(
              <div key={i} style={{display:'flex',gap:10,fontSize:10.5,color:'rgba(255,255,255,.55)',marginBottom:2}}>
                <span style={{flex:2,color:'rgba(255,255,255,.7)'}}>{p.nome}</span>
                <span style={{flex:2,fontFamily:'monospace'}}>{p.host}</span>
                <span style={{flex:1,fontFamily:'monospace',color:'#f5c518'}}>{p.porta||'—'}</span>
              </div>
            ))}
            {preview.length>6 && <div style={{fontSize:10,color:'rgba(255,255,255,.2)',marginTop:3}}>+{preview.length-6} mais</div>}
          </div>
        )}
        <div style={{display:'flex',gap:8,marginTop:12}}>
          <button onClick={()=>onImport(preview,grupo,tipo)} disabled={!preview.length} style={{flex:1,padding:'8px 0',borderRadius:7,background:preview.length?'rgba(0,200,150,.15)':'rgba(255,255,255,.04)',border:`1px solid ${preview.length?'rgba(0,200,150,.3)':'rgba(255,255,255,.08)'}`,color:preview.length?'#00c896':'rgba(255,255,255,.2)',fontWeight:700,fontSize:12,cursor:preview.length?'pointer':'default'}}>
            Importar {preview.length} host{preview.length!==1?'s':''}
          </button>
          <button onClick={onClose} style={{padding:'8px 14px',borderRadius:7,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.1)',color:'rgba(255,255,255,.4)',fontSize:12,cursor:'pointer'}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
};

// ── Página principal ─────────────────────────────────────────────────────────
export default function MonitorRede() {
  const [aba, setAba]             = useState('hosts');
  const [hosts, setHosts]         = useState([]);
  const [status, setStatus]       = useState({});
  const [historicos, setHistoricos] = useState({});
  const [uptimes, setUptimes]     = useState({});
  const [modal, setModal]         = useState(null);
  const [detalhe, setDetalhe]     = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [ultimaAtt, setUltimaAtt] = useState(null);
  const timerRef = useRef(null);

  // ── Estado do painel CPE ──────────────────────────────────────────────────
  const [cpeIdServico, setCpeIdServico] = useState('');
  const [cpeInfo, setCpeInfo]           = useState(null);
  const [cpeWifi, setCpeWifi]           = useState(null);
  const [cpeAcoes, setCpeAcoes]         = useState([]);
  const [cpePingResult, setCpePingResult] = useState(null);
  const [cpeSpeedResult, setCpeSpeedResult] = useState(null);
  const [cpeLoading, setCpeLoading]     = useState(false);
  const [cpeAcao, setCpeAcao]           = useState(null); // 'reboot'|'wifi'|'ping'|'speed'
  const [wifiForm, setWifiForm]         = useState({ ssid:'', senha:'', banda:'2.4GHz' });

  const buscarCPE = async () => {
    if (!cpeIdServico.trim()) return;
    setCpeLoading(true); setCpeInfo(null); setCpeWifi(null); setCpePingResult(null); setCpeSpeedResult(null);
    try {
      const [info, wifi, acoes] = await Promise.allSettled([
        api(`/api/cpe/${cpeIdServico}`),
        api(`/api/cpe/${cpeIdServico}/wifi`),
        api(`/api/cpe/${cpeIdServico}/acoes`),
      ]);
      if (info.status === 'fulfilled')   setCpeInfo(info.value);
      if (wifi.status === 'fulfilled')   setCpeWifi(wifi.value);
      if (acoes.status === 'fulfilled')  setCpeAcoes(Array.isArray(acoes.value) ? acoes.value : []);
    } catch(e) { setCpeInfo({ erro: true, mensagem: e.message }); }
    setCpeLoading(false);
  };

  const cpeReboot = async () => {
    if (!confirm('Reiniciar a ONU do cliente remotamente?\nO serviço ficará indisponível por ~2 minutos.')) return;
    setCpeAcao('reboot');
    try {
      const r = await api(`/api/cpe/${cpeIdServico}/reboot`, { method:'POST', body:'{}' });
      alert(r.ok ? '✅ ' + r.mensagem : '❌ ' + r.mensagem);
      await buscarCPE();
    } catch(e) { alert('Erro: '+e.message); }
    setCpeAcao(null);
  };

  const cpePing = async () => {
    setCpeAcao('ping'); setCpePingResult(null);
    try {
      const r = await api(`/api/cpe/${cpeIdServico}/ping`, { method:'POST', body:'{}' });
      setCpePingResult(r);
    } catch(e) { setCpePingResult({ ok:false, mensagem: e.message }); }
    setCpeAcao(null);
  };

  const cpeSpeed = async () => {
    setCpeAcao('speed'); setCpeSpeedResult(null);
    try {
      const r = await api(`/api/cpe/${cpeIdServico}/speedtest`, { method:'POST', body:'{}' });
      setCpeSpeedResult(r);
    } catch(e) { setCpeSpeedResult({ ok:false, mensagem: e.message }); }
    setCpeAcao(null);
  };

  const cpeSetWifi = async () => {
    if (!wifiForm.ssid || !wifiForm.senha) { alert('SSID e senha são obrigatórios.'); return; }
    if (wifiForm.senha.length < 8) { alert('Senha mínima: 8 caracteres.'); return; }
    if (!confirm(`Configurar Wi-Fi:\nSSID: ${wifiForm.ssid}\nBanda: ${wifiForm.banda}\n\nConfirmar?`)) return;
    setCpeAcao('wifi');
    try {
      const r = await api(`/api/cpe/${cpeIdServico}/wifi`, { method:'POST', body: JSON.stringify(wifiForm) });
      alert(r.ok ? '✅ ' + r.mensagem : '❌ ' + r.mensagem);
      await buscarCPE();
    } catch(e) { alert('Erro: '+e.message); }
    setCpeAcao(null);
  };

  const carregarHosts = useCallback(async () => {
    const d = await api('/api/monitor/hosts');
    if (Array.isArray(d)) setHosts(d);
  }, []);

  const carregarStatus = useCallback(async () => {
    setAtualizando(true);
    const d = await api('/api/monitor/status');
    if (Array.isArray(d)) {
      const map = {};
      d.forEach(h => { map[h.id] = h; });
      setStatus(map);
      setUltimaAtt(new Date());
    }
    setAtualizando(false);
  }, []);

  const carregarHistorico = useCallback(async (id) => {
    const d = await api(`/api/monitor/historico/${id}?limite=40`);
    if (Array.isArray(d)) setHistoricos(h=>({...h,[id]:d}));
  }, []);

  const carregarUptimes = useCallback(async () => {
    const d = await api('/api/monitor/uptime-bulk');
    if (d && typeof d === 'object') setUptimes(d);
  }, []);

  const checarHost = useCallback(async (id) => {
    await api(`/api/monitor/checar/${id}`,{method:'POST',body:'{}'});
    await carregarStatus();
    await carregarHistorico(id);
  }, [carregarStatus, carregarHistorico]);

  useEffect(() => { carregarHosts(); carregarStatus(); carregarUptimes(); }, []);
  useEffect(() => { if (hosts.length) { hosts.forEach(h=>carregarHistorico(h.id)); } }, [hosts]);
  useEffect(() => {
    timerRef.current = setInterval(()=>{
      carregarStatus(); carregarUptimes();
      hosts.forEach(h=>carregarHistorico(h.id));
    }, 30000);
    return ()=>clearInterval(timerRef.current);
  }, [hosts]);

  const salvarHost = async (form) => {
    if (!form.nome?.trim()||!form.host?.trim()) { alert('Nome e Host/IP são obrigatórios.'); return; }
    try {
      const body = {...form, porta: form.porta?parseInt(form.porta):null};
      if (form.id) await api(`/api/monitor/hosts/${form.id}`,{method:'PUT',body:JSON.stringify(body)});
      else await api('/api/monitor/hosts',{method:'POST',body:JSON.stringify(body)});
      setModal(null);
      await carregarHosts(); await carregarStatus();
    } catch(e) { alert('Erro ao salvar: '+e.message); }
  };

  const excluirHost = async (id) => {
    if (!confirm('Excluir este host?')) return;
    await api(`/api/monitor/hosts/${id}`,{method:'DELETE'});
    setModal(null); await carregarHosts();
  };

  const importarHosts = async (lista, grupo, tipo) => {
    for (const h of lista) {
      await api('/api/monitor/hosts',{method:'POST',body:JSON.stringify({nome:h.nome,host:h.host,tipo:h.porta?tipo:'ping',porta:h.porta?parseInt(h.porta):null,grupo})});
    }
    setShowImport(false); await carregarHosts(); await carregarStatus();
  };

  // Agrupa por grupo, ordena offline primeiro
  const grupos = {};
  const grupoNomes = [];
  hosts.forEach(h => {
    const g = h.grupo||'Geral';
    if (!grupos[g]) { grupos[g]=[]; grupoNomes.push(g); }
    const merged = {...h,...(status[h.id]||{})};
    grupos[g].push(merged);
  });
  Object.values(grupos).forEach(arr => arr.sort((a,b) => (STATUS_ORDEM[a.status]??4)-(STATUS_ORDEM[b.status]??4)));

  const todos   = Object.values(status);
  const nOffline = todos.filter(h=>h.status==='offline').length;
  const nLento   = todos.filter(h=>h.status==='lento'||h.status==='instavel').length;
  const nOnline  = todos.filter(h=>h.status==='online').length;

  const grupoColorMap = {};
  grupoNomes.forEach((g,i) => { grupoColorMap[g] = GROUP_COLORS[i % GROUP_COLORS.length]; });

  const detalheHost = detalhe ? {...hosts.find(h=>h.id===detalhe.id)||detalhe,...(status[detalhe.id]||{})} : null;

  return (
    <div style={{padding:'20px 24px',maxWidth:1100,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div>
          <h1 style={{fontSize:18,fontWeight:700,color:'#fff',margin:0}}>Monitoramento de rede</h1>
          <div style={{fontSize:11,color:'rgba(255,255,255,.3)',marginTop:2,display:'flex',gap:8,alignItems:'center'}}>
            {ultimaAtt ? `Atualizado às ${ultimaAtt.toLocaleTimeString('pt-BR')}` : 'Aguardando...'}
            {atualizando && <span style={{color:'#3ecfff'}}>⟳ verificando</span>}
            <a href="/status" target="_blank" style={{color:'rgba(167,139,250,.7)',textDecoration:'none',fontSize:10}}>↗ página pública</a>
          </div>
        </div>
        {aba === 'hosts' && (
          <div style={{display:'flex',gap:8}}>
            <button onClick={carregarStatus} style={{padding:'7px 13px',borderRadius:7,background:'rgba(62,207,255,.08)',border:'1px solid rgba(62,207,255,.2)',color:'#3ecfff',fontSize:11,cursor:'pointer',fontWeight:700}}>⟳ Atualizar</button>
            <button onClick={()=>setShowImport(true)} style={{padding:'7px 13px',borderRadius:7,background:'rgba(167,139,250,.08)',border:'1px solid rgba(167,139,250,.2)',color:'#a78bfa',fontSize:11,cursor:'pointer',fontWeight:700}}>↓ Importar</button>
            <button onClick={()=>setModal({})} style={{padding:'7px 13px',borderRadius:7,background:'rgba(0,200,150,.1)',border:'1px solid rgba(0,200,150,.25)',color:'#00c896',fontSize:11,cursor:'pointer',fontWeight:700}}>+ Novo host</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:'1px solid rgba(255,255,255,.06)',paddingBottom:0}}>
        {[
          { id:'hosts', label:'🖧  Hosts / Infraestrutura' },
          { id:'cpe',   label:'📡  Dispositivos CPE (TR-069)' },
        ].map(t => (
          <button key={t.id} onClick={()=>setAba(t.id)} style={{
            padding:'8px 16px',borderRadius:'7px 7px 0 0',fontSize:12,fontWeight:700,cursor:'pointer',
            border:'1px solid',borderBottom:'none',
            background: aba===t.id ? 'rgba(62,207,255,.1)' : 'transparent',
            borderColor: aba===t.id ? 'rgba(62,207,255,.3)' : 'transparent',
            color: aba===t.id ? '#3ecfff' : 'rgba(255,255,255,.35)',
            transition:'all .15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ─── ABA HOSTS ─────────────────────────────────────────────────────── */}
      {aba === 'hosts' && (<>
        {/* Resumo */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:20}}>
          {[{label:'Online',valor:nOnline,cor:'#00c896'},{label:'Com lentidão',valor:nLento,cor:'#f5c518'},{label:'Offline',valor:nOffline,cor:'#ff4757'}].map(c=>(
            <div key={c.label} style={{background:'rgba(2,35,45,.8)',border:`1px solid ${c.cor}22`,borderRadius:10,padding:'14px 16px',textAlign:'center'}}>
              <div style={{fontSize:28,fontWeight:800,color:c.cor,lineHeight:1}}>{c.valor}</div>
              <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginTop:4}}>{c.label}</div>
            </div>
          ))}
        </div>

        {nOffline > 0 && (
          <div style={{background:'rgba(255,71,87,.08)',border:'1px solid rgba(255,71,87,.2)',borderRadius:8,padding:'9px 13px',marginBottom:16,fontSize:12,color:'#ff4757',display:'flex',gap:8,alignItems:'center'}}>
            ⚠️ <strong>{nOffline} host{nOffline>1?'s':''} offline</strong> — admin receberá alerta via WhatsApp
          </div>
        )}

        {hosts.length === 0 ? (
          <div style={{textAlign:'center',padding:'60px 0',color:'rgba(255,255,255,.2)'}}>
            <div style={{fontSize:30,marginBottom:10}}>📡</div>
            <div style={{fontSize:13}}>Nenhum host cadastrado</div>
            <div style={{fontSize:11,marginTop:6}}>Use "+ Novo host" ou "↓ Importar" para começar</div>
          </div>
        ) : (
          Object.entries(grupos).map(([grupo,items],gi) => {
            const corGrupo = grupoColorMap[grupo];
            return (
              <div key={grupo} style={{marginBottom:22}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                  <div style={{width:3,height:14,background:corGrupo,borderRadius:2}}/>
                  <div style={{fontSize:10,fontWeight:700,color:corGrupo,textTransform:'uppercase',letterSpacing:'.07em'}}>{grupo}</div>
                  <span style={{fontSize:10,color:'rgba(255,255,255,.2)'}}>{items.length} host{items.length!==1?'s':''}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:9}}>
                  {items.map(h => (
                    <HostCard key={h.id} host={h} historico={historicos[h.id]} uptime={uptimes[h.id]}
                      onCheck={checarHost} onEdit={setModal}
                      onClick={()=>setDetalhe(h)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}

        {/* Footer info */}
        <div style={{marginTop:14,padding:'9px 13px',background:'rgba(167,139,250,.04)',border:'1px solid rgba(167,139,250,.1)',borderRadius:7,fontSize:11,color:'rgba(255,255,255,.3)',display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <span style={{color:'#a78bfa'}}>🤖</span>
            IA de suporte tem acesso via <code style={{color:'#a78bfa',fontFamily:'monospace'}}>status_rede</code> — consulta automaticamente quando cliente reportar problemas.
          </div>
          <a href="/status" target="_blank" style={{color:'rgba(167,139,250,.6)',textDecoration:'none',fontSize:10,flexShrink:0}}>↗ Status público</a>
        </div>
      </>)}

      {/* ─── ABA CPE ─────────────────────────────────────────────────────────── */}
      {aba === 'cpe' && (
        <div>
          {/* Busca por ID Serviço */}
          <div style={{background:'rgba(2,35,45,.9)',border:'1px solid rgba(62,207,255,.15)',borderRadius:10,padding:18,marginBottom:20}}>
            <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,.5)',marginBottom:10,textTransform:'uppercase',letterSpacing:'.06em'}}>Consultar dispositivo por ID de serviço</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input
                value={cpeIdServico}
                onChange={e=>setCpeIdServico(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&buscarCPE()}
                placeholder="Ex: 12345  (ID do contrato/serviço no SGP)"
                style={{flex:1,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:7,padding:'9px 12px',color:'#fff',fontSize:13,outline:'none'}}
              />
              <button onClick={buscarCPE} disabled={cpeLoading} style={{padding:'9px 18px',borderRadius:7,background:'rgba(62,207,255,.12)',border:'1px solid rgba(62,207,255,.25)',color:'#3ecfff',fontSize:12,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
                {cpeLoading ? '⟳ Buscando...' : '🔍 Consultar'}
              </button>
            </div>
            <div style={{fontSize:10,color:'rgba(255,255,255,.2)',marginTop:7}}>
              Tip: o ID de serviço é retornado pela ferramenta <code style={{color:'#a78bfa'}}>consultar_clientes</code> no campo <code style={{color:'#a78bfa'}}>id</code> ou <code style={{color:'#a78bfa'}}>contrato</code>.
            </div>
          </div>

          {cpeInfo && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

              {/* Card info do dispositivo */}
              <div style={{background:'rgba(2,35,45,.9)',border:`1px solid ${cpeInfo.erro ? 'rgba(255,71,87,.2)' : 'rgba(62,207,255,.12)'}`,borderRadius:10,padding:18}}>
                <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,.4)',marginBottom:14,textTransform:'uppercase',letterSpacing:'.06em'}}>📟 Dispositivo</div>
                {cpeInfo.erro ? (
                  <div style={{color:'#ff4757',fontSize:13}}>❌ {cpeInfo.mensagem}</div>
                ) : (<>
                  {[
                    { l:'Modelo',    v: cpeInfo.modelo   || '—' },
                    { l:'Serial',    v: cpeInfo.serial    || '—' },
                    { l:'MAC',       v: cpeInfo.mac       || '—' },
                    { l:'Firmware',  v: cpeInfo.firmware  || '—' },
                    { l:'IP WAN',    v: cpeInfo.ip_wan    || '—' },
                    { l:'Uptime',    v: cpeInfo.uptime_fmt|| '—' },
                  ].map(r => (
                    <div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,.04)',fontSize:12}}>
                      <span style={{color:'rgba(255,255,255,.4)'}}>{r.l}</span>
                      <span style={{color:'#e2e8f0',fontFamily:'monospace',fontSize:11}}>{r.v}</span>
                    </div>
                  ))}
                </>)}
              </div>

              {/* Card sinal óptico */}
              <div style={{background:'rgba(2,35,45,.9)',border:'1px solid rgba(255,255,255,.07)',borderRadius:10,padding:18}}>
                <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,.4)',marginBottom:14,textTransform:'uppercase',letterSpacing:'.06em'}}>💡 Sinal Óptico</div>
                {cpeInfo.erro ? (
                  <div style={{color:'rgba(255,255,255,.2)',fontSize:13}}>—</div>
                ) : cpeInfo.sinal_rx === null ? (
                  <div style={{color:'rgba(255,255,255,.3)',fontSize:12}}>Sinal óptico não disponível para este modelo.</div>
                ) : (
                  <>
                    {/* Gauge do sinal Rx */}
                    {(() => {
                      const rx = cpeInfo.sinal_rx;
                      const qualidade = cpeInfo.qualidade_sinal;
                      const cor = qualidade==='otimo'?'#00c896':qualidade==='bom'?'#3ecfff':qualidade==='fraco'?'#f5c518':'#ff4757';
                      const pct = Math.max(0, Math.min(100, ((rx + 30) / 14) * 100));
                      return (
                        <div style={{marginBottom:16}}>
                          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                            <span style={{fontSize:11,color:'rgba(255,255,255,.4)'}}>Rx Power</span>
                            <span style={{fontSize:15,fontWeight:800,color:cor,fontFamily:'monospace'}}>{rx} dBm</span>
                          </div>
                          <div style={{height:8,background:'rgba(255,255,255,.07)',borderRadius:4,overflow:'hidden'}}>
                            <div style={{height:'100%',width:`${pct}%`,background:cor,borderRadius:4,transition:'width .4s'}}/>
                          </div>
                          <div style={{display:'flex',justifyContent:'space-between',marginTop:4,fontSize:9,color:'rgba(255,255,255,.2)'}}>
                            <span>-30 dBm (crítico)</span><span>-16 dBm (ótimo)</span>
                          </div>
                          <div style={{marginTop:8,display:'inline-block',padding:'3px 10px',borderRadius:20,background:`${cor}18`,border:`1px solid ${cor}44`,color:cor,fontSize:11,fontWeight:700}}>
                            {qualidade==='otimo'?'✅ Ótimo':qualidade==='bom'?'🟢 Bom':qualidade==='fraco'?'🟡 Fraco':'🔴 Crítico'}
                          </div>
                          {cpeInfo.alerta_sinal && (
                            <div style={{marginTop:10,padding:'8px 12px',background:'rgba(255,71,87,.08)',border:'1px solid rgba(255,71,87,.2)',borderRadius:7,fontSize:11,color:'#ff4757'}}>
                              ⚠️ Sinal abaixo do limite — possível degradação na fibra. Verificar caixa de distribuição.
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {cpeInfo.sinal_tx !== null && (
                      <div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderTop:'1px solid rgba(255,255,255,.05)',fontSize:12}}>
                        <span style={{color:'rgba(255,255,255,.4)'}}>Tx Power</span>
                        <span style={{color:'#e2e8f0',fontFamily:'monospace',fontSize:11}}>{cpeInfo.sinal_tx} dBm</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Ações remotas */}
              <div style={{background:'rgba(2,35,45,.9)',border:'1px solid rgba(255,255,255,.07)',borderRadius:10,padding:18}}>
                <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,.4)',marginBottom:14,textTransform:'uppercase',letterSpacing:'.06em'}}>⚡ Ações Remotas</div>
                <div style={{display:'flex',flexDirection:'column',gap:9}}>
                  <button onClick={cpeReboot} disabled={!!cpeAcao} style={{padding:'10px 14px',borderRadius:8,background:'rgba(255,71,87,.1)',border:'1px solid rgba(255,71,87,.25)',color:'#ff4757',fontSize:12,fontWeight:700,cursor:'pointer',textAlign:'left'}}>
                    {cpeAcao==='reboot' ? '⟳ Reiniciando...' : '🔄 Reiniciar ONU (Reboot)'}
                  </button>
                  <button onClick={cpePing} disabled={!!cpeAcao} style={{padding:'10px 14px',borderRadius:8,background:'rgba(62,207,255,.08)',border:'1px solid rgba(62,207,255,.2)',color:'#3ecfff',fontSize:12,fontWeight:700,cursor:'pointer',textAlign:'left'}}>
                    {cpeAcao==='ping' ? '⟳ Pingando...' : '📶 Ping (8.8.8.8)'}
                  </button>
                  <button onClick={cpeSpeed} disabled={!!cpeAcao} style={{padding:'10px 14px',borderRadius:8,background:'rgba(0,200,150,.08)',border:'1px solid rgba(0,200,150,.2)',color:'#00c896',fontSize:12,fontWeight:700,cursor:'pointer',textAlign:'left'}}>
                    {cpeAcao==='speed' ? '⟳ Testando...' : '🚀 SpeedTest no CPE'}
                  </button>
                  <button onClick={()=>{ const r=api(`/api/cpe/${cpeIdServico}/syncwan`,{method:'POST',body:'{}'}).then(()=>buscarCPE()); }} style={{padding:'10px 14px',borderRadius:8,background:'rgba(245,197,24,.08)',border:'1px solid rgba(245,197,24,.2)',color:'#f5c518',fontSize:12,fontWeight:700,cursor:'pointer',textAlign:'left'}}>
                    🔁 Sincronizar WAN
                  </button>
                </div>
                {cpePingResult && (
                  <div style={{marginTop:12,padding:'10px 12px',background:'rgba(255,255,255,.04)',borderRadius:7,fontSize:12}}>
                    <div style={{fontWeight:700,color:cpePingResult.ok?'#00c896':'#ff4757',marginBottom:4}}>
                      {cpePingResult.ok ? '✅ Ping OK' : '❌ Ping falhou'}
                    </div>
                    <pre style={{color:'rgba(255,255,255,.6)',fontSize:10,margin:0,whiteSpace:'pre-wrap',fontFamily:'monospace'}}>{JSON.stringify(cpePingResult.resultado||cpePingResult.mensagem, null, 2)}</pre>
                  </div>
                )}
                {cpeSpeedResult && (
                  <div style={{marginTop:12,padding:'10px 12px',background:'rgba(255,255,255,.04)',borderRadius:7,fontSize:12}}>
                    <div style={{fontWeight:700,color:'#00c896',marginBottom:6}}>🚀 Resultado SpeedTest</div>
                    <div style={{display:'flex',gap:12}}>
                      {cpeSpeedResult.download_mbps!=null&&<div><span style={{color:'rgba(255,255,255,.4)',fontSize:10}}>Download</span><div style={{color:'#3ecfff',fontWeight:700,fontSize:14}}>{cpeSpeedResult.download_mbps} Mbps</div></div>}
                      {cpeSpeedResult.upload_mbps!=null&&<div><span style={{color:'rgba(255,255,255,.4)',fontSize:10}}>Upload</span><div style={{color:'#00c896',fontWeight:700,fontSize:14}}>{cpeSpeedResult.upload_mbps} Mbps</div></div>}
                      {cpeSpeedResult.latencia_ms!=null&&<div><span style={{color:'rgba(255,255,255,.4)',fontSize:10}}>Latência</span><div style={{color:'#f5c518',fontWeight:700,fontSize:14}}>{cpeSpeedResult.latencia_ms} ms</div></div>}
                    </div>
                  </div>
                )}
              </div>

              {/* Wi-Fi */}
              <div style={{background:'rgba(2,35,45,.9)',border:'1px solid rgba(255,255,255,.07)',borderRadius:10,padding:18}}>
                <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,.4)',marginBottom:14,textTransform:'uppercase',letterSpacing:'.06em'}}>📶 Wi-Fi</div>
                {cpeWifi?.redes?.length ? (
                  <div style={{marginBottom:14}}>
                    {cpeWifi.redes.map((r,i) => (
                      <div key={i} style={{padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,.05)',display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:12}}>
                        <div>
                          <div style={{fontWeight:700,color:'#e2e8f0'}}>{r.ssid || '—'}</div>
                          <div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginTop:2}}>{r.banda||''} {r.canal?`• Canal ${r.canal}`:''} {r.seguranca?`• ${r.seguranca}`:''}</div>
                        </div>
                        {r.clientes!=null && <span style={{background:'rgba(62,207,255,.1)',border:'1px solid rgba(62,207,255,.2)',borderRadius:20,padding:'2px 9px',fontSize:10,color:'#3ecfff'}}>{r.clientes} cliente{r.clientes!==1?'s':''}</span>}
                      </div>
                    ))}
                  </div>
                ) : <div style={{color:'rgba(255,255,255,.2)',fontSize:12,marginBottom:12}}>Nenhuma rede Wi-Fi encontrada.</div>}

                {/* Formulário alterar Wi-Fi */}
                <div style={{borderTop:'1px solid rgba(255,255,255,.06)',paddingTop:12}}>
                  <div style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,.3)',marginBottom:8,textTransform:'uppercase',letterSpacing:'.06em'}}>Alterar Wi-Fi</div>
                  <input placeholder="SSID (nome da rede)" value={wifiForm.ssid} onChange={e=>setWifiForm(f=>({...f,ssid:e.target.value}))}
                    style={{width:'100%',marginBottom:7,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,padding:'7px 10px',color:'#fff',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                  <input type="password" placeholder="Senha (mín. 8 caracteres)" value={wifiForm.senha} onChange={e=>setWifiForm(f=>({...f,senha:e.target.value}))}
                    style={{width:'100%',marginBottom:7,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,padding:'7px 10px',color:'#fff',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                  <select value={wifiForm.banda} onChange={e=>setWifiForm(f=>({...f,banda:e.target.value}))}
                    style={{width:'100%',marginBottom:10,background:'rgba(2,15,25,.9)',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,padding:'7px 10px',color:'#fff',fontSize:12,outline:'none',boxSizing:'border-box'}}>
                    <option value="2.4GHz">2.4 GHz</option>
                    <option value="5GHz">5 GHz</option>
                    <option value="ambas">Ambas</option>
                  </select>
                  <button onClick={cpeSetWifi} disabled={!!cpeAcao} style={{width:'100%',padding:'8px',borderRadius:7,background:'rgba(167,139,250,.12)',border:'1px solid rgba(167,139,250,.25)',color:'#a78bfa',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    {cpeAcao==='wifi' ? '⟳ Configurando...' : '💾 Aplicar Wi-Fi'}
                  </button>
                </div>
              </div>

              {/* Histórico de ações */}
              <div style={{gridColumn:'1/-1',background:'rgba(2,35,45,.9)',border:'1px solid rgba(255,255,255,.07)',borderRadius:10,padding:18}}>
                <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,.4)',marginBottom:12,textTransform:'uppercase',letterSpacing:'.06em'}}>📋 Histórico de ações remotas</div>
                {cpeAcoes.length === 0 ? (
                  <div style={{color:'rgba(255,255,255,.2)',fontSize:12}}>Nenhuma ação registrada para este serviço.</div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {cpeAcoes.map(a => {
                      const res = typeof a.resultado === 'string' ? JSON.parse(a.resultado) : a.resultado;
                      const ok = res?.ok !== false;
                      return (
                        <div key={a.id} style={{display:'flex',gap:10,alignItems:'flex-start',padding:'8px 10px',background:'rgba(255,255,255,.03)',borderRadius:7,fontSize:11}}>
                          <span style={{color:ok?'#00c896':'#ff4757',flexShrink:0}}>{ok?'✅':'❌'}</span>
                          <div style={{flex:1}}>
                            <span style={{fontWeight:700,color:'#e2e8f0',textTransform:'uppercase',fontSize:10,letterSpacing:'.04em'}}>{a.acao}</span>
                            <span style={{color:'rgba(255,255,255,.25)',marginLeft:8}}>{a.agente_id}</span>
                            <div style={{color:'rgba(255,255,255,.3)',marginTop:2}}>{res?.mensagem || '—'}</div>
                          </div>
                          <span style={{color:'rgba(255,255,255,.2)',fontSize:10,flexShrink:0,fontFamily:'monospace'}}>
                            {new Date(a.criado_em).toLocaleString('pt-BR')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

          {!cpeInfo && !cpeLoading && (
            <div style={{textAlign:'center',padding:'60px 0',color:'rgba(255,255,255,.15)'}}>
              <div style={{fontSize:36,marginBottom:12}}>📡</div>
              <div style={{fontSize:14,fontWeight:700,color:'rgba(255,255,255,.25)'}}>Gerenciador CPE — TR-069</div>
              <div style={{fontSize:11,marginTop:8,maxWidth:380,margin:'8px auto 0'}}>Informe o ID do serviço acima para consultar o dispositivo do cliente, verificar o sinal óptico e executar ações remotas.</div>
            </div>
          )}

          {/* Footer */}
          <div style={{marginTop:20,padding:'9px 13px',background:'rgba(62,207,255,.03)',border:'1px solid rgba(62,207,255,.1)',borderRadius:7,fontSize:11,color:'rgba(255,255,255,.3)',display:'flex',gap:8,alignItems:'center'}}>
            <span style={{color:'#3ecfff'}}>🤖</span>
            O agente Maxxi usa automaticamente <code style={{color:'#3ecfff'}}>consultar_dispositivo</code>, <code style={{color:'#3ecfff'}}>reiniciar_onu</code> e <code style={{color:'#3ecfff'}}>consultar_sinal_optico</code> durante o atendimento técnico.
          </div>
        </div>
      )}

      {modal !== null && <ModalHost host={modal?.id?modal:null} onSave={salvarHost} onClose={()=>setModal(null)} onDelete={excluirHost}/>}
      {showImport && <ModalImport onImport={importarHosts} onClose={()=>setShowImport(false)}/>}
      {detalheHost && <ModalHistorico host={detalheHost} onClose={()=>setDetalhe(null)}/>}
    </div>
  );
}
