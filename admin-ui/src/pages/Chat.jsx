import React, { useEffect, useState, useRef, useCallback } from 'react';
import { apiJson, api, fetchConversas, fetchConversa, enviarMensagem, assumirConversa, devolverIA, encerrarConversa, adicionarNota, transferirConversa, apagarMensagem, fetchRespostasRapidas, fetchClienteCompleto, fetchAgentes, createChatSSE, enviarBoleto, fecharOcorrencia, notaOcorrencia, criarChamado, fetchConexao, liberarContrato, agendarRetorno, cancelarRetorno, promessaPagamento } from '../api';
import { useStore } from '../store';

const EMOJIS_REACAO = ['👍','❤️','😂','😮','😢','🙏'];
const fmtHora = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoje.toDateString()) return hora;
  if (d.toDateString() === ontem.toDateString()) return `ontem ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
};
const fmtData = (ts) => ts ? new Date(ts).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
const statusDef = {
  ia:        { label:'IA',        cls:'badge-green',  dot:'#00c896' },
  aguardando:{ label:'Fila',      cls:'badge-yellow', dot:'#f5c518' },
  ativa:     { label:'Agente',    cls:'badge-blue',   dot:'#3ecfff' },
  encerrada: { label:'Encerrada', cls:'badge-red',    dot:'#555'    },
};

function calcUrgencia(aguardandoDesde, prioridade=0) {
  if (!aguardandoDesde) return { nivel:'ativa', minutos:0 };
  const min = Math.floor((Date.now()-new Date(aguardandoDesde))/60000);
  if (prioridade>=2||min>=10) return { nivel:'critico', minutos:min };
  if (min>=5) return { nivel:'alto', minutos:min };
  if (min>=2) return { nivel:'medio', minutos:min };
  return { nivel:'baixo', minutos:min };
}
const URG_COLOR = { critico:'#ff4757', alto:'#ff6b35', medio:'#f5c518', baixo:'#00c896', ativa:'transparent' };

function sortConvs(convs) {
  return [...convs].sort((a,b) => {
    const ord = { critico:0, alto:1, medio:2, baixo:3, ativa:4 };
    const ua = calcUrgencia(a.aguardando_desde,a.prioridade), ub = calcUrgencia(b.aguardando_desde,b.prioridade);
    if (ord[ua.nivel]!==ord[ub.nivel]) return ord[ua.nivel]-ord[ub.nivel];
    return new Date(b.atualizado||0)-new Date(a.atualizado||0);
  });
}

/* ─── AVATAR ─────────────────────────────────────────────────────────────────── */
function Avatar({ conv, size=36 }) {
  const initial = (conv?.nome||conv?.telefone||'?').charAt(0).toUpperCase();
  const colors = ['#00c896','#3ecfff','#f5c518','#ff6b35','#a78bfa','#f472b6'];
  const color = colors[(initial.charCodeAt(0)||0)%colors.length];
  const [imgFailed, setImgFailed] = useState(false);
  if (conv?.foto_perfil && !imgFailed) return (
    <img src={conv.foto_perfil} alt="" style={{width:size,height:size,borderRadius:'50%',objectFit:'cover',flexShrink:0}}
      onError={()=>setImgFailed(true)} />
  );
  return (
    <div style={{width:size,height:size,borderRadius:'50%',background:`${color}1a`,border:`1.5px solid ${color}33`,
      display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*.38+'px',fontWeight:700,color,flexShrink:0}}>
      {initial}
    </div>
  );
}

/* ─── CONTEÚDO DA MENSAGEM ───────────────────────────────────────────────────── */
function MsgContent({ content }) {
  if (!content) return null;
  if (content==='[reaction]') return <span style={{fontSize:'1.4rem'}}>👍</span>;
  const rm = content.match(/^\[reaction:(.+)\]$/);
  if (rm) return <span style={{fontSize:'1.4rem'}}>{rm[1]}</span>;
  const mm = content.match(/^\[media:([^:]+):([^\]]+)\]\n?(.*)$/s);
  if (mm) {
    const [,midiaId,mime,desc] = mm;
    const isImg=mime.startsWith('image/'), isAudio=mime.startsWith('audio/');
    const token=localStorage.getItem('maxxi_token')||'';
    const src=`/admin/api/chat/midia/${midiaId}?token=${encodeURIComponent(token)}`;
    const ext=mime.split('/')[1]||'bin';
    if (isAudio) return (
      <div style={{minWidth:200}}>
        <div style={{fontSize:'.65rem',color:'rgba(255,255,255,.4)',marginBottom:4,letterSpacing:'.5px',textTransform:'uppercase'}}>🎙 Áudio de voz</div>
        <audio controls style={{width:'100%',height:34,borderRadius:6}}><source src={src} type={mime}/></audio>
        <a href={src} download={`audio.${ext}`} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:'.68rem',color:'#00c896',textDecoration:'none',marginTop:4}}>⬇ Baixar</a>
        {desc && <div style={{marginTop:6,fontSize:'.78rem',borderTop:'1px solid rgba(255,255,255,.06)',paddingTop:6,color:'rgba(255,255,255,.5)',fontStyle:'italic'}}><div style={{fontSize:'.6rem',color:'rgba(255,255,255,.25)',marginBottom:2}}>TRANSCRIÇÃO</div>{desc}</div>}
      </div>
    );
    if (isImg) return (
      <div>
        <img src={src} alt="Imagem" style={{maxWidth:'100%',maxHeight:240,borderRadius:8,display:'block',objectFit:'contain',cursor:'pointer'}}
          onClick={()=>window.open(src,'_blank')} onError={e=>e.target.style.display='none'} />
        <a href={src} download={`img.${ext}`} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:'.68rem',color:'#00c896',textDecoration:'none',marginTop:4}}>⬇ Baixar imagem</a>
        {desc && <div style={{marginTop:4,fontSize:'.8rem'}}>{desc}</div>}
      </div>
    );
    return <a href={src} download={`arquivo.${ext}`} style={{display:'inline-flex',alignItems:'center',gap:6,color:'#00c896',textDecoration:'none',fontSize:'.82rem'}}>📎 {desc||`Arquivo .${ext}`}</a>;
  }
  // Botão clicado pelo cliente — renderiza como chip
  const btnMatch = content.match(/^\[botão:\s*(.+)\]$/);
  if (btnMatch) {
    const label = btnMatch[1].trim();
    return (
      <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(0,200,150,.08)',border:'1px solid rgba(0,200,150,.2)',borderRadius:8,padding:'5px 10px',fontSize:'.82rem',color:'#00c896'}}>
        <span style={{fontSize:'.75rem',opacity:.7}}>👆 Selecionou</span>
        <span style={{fontWeight:600}}>{label}</span>
      </div>
    );
  }

  // Mensagem com opções de botão/lista enviada pela IA
  // Formato: "Texto da mensagem\n[opções: Opção 1 | Opção 2 | Opção 3]"
  const opcoesMatch = content.match(/^([\s\S]*?)\n\[opções:\s*(.+)\]$/);
  if (opcoesMatch) {
    const texto = opcoesMatch[1].trim();
    const opcoes = opcoesMatch[2].split('|').map(o => o.trim()).filter(Boolean);
    const parts2 = texto.split(/(\*[^*]+\*|_[^_]+_)/g);
    return (
      <div>
        {texto && <div style={{marginBottom:8,lineHeight:1.55,whiteSpace:'pre-wrap'}}>{parts2.map((p,i)=>{
          if (p.startsWith('*')&&p.endsWith('*')) return <strong key={i}>{p.slice(1,-1)}</strong>;
          if (p.startsWith('_')&&p.endsWith('_')) return <em key={i}>{p.slice(1,-1)}</em>;
          return p;
        })}</div>}
        <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:texto?4:0}}>
          {opcoes.map((op,i) => (
            <div key={i} style={{background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,padding:'6px 10px',fontSize:'.78rem',color:'rgba(255,255,255,.7)',display:'flex',alignItems:'center',gap:6}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:'rgba(0,200,150,.5)',flexShrink:0}}/>
              {op}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const dm = content.match(/^\[documento: ([^\]]+)\]/);
  if (dm) return <span style={{color:'rgba(255,255,255,.4)',fontSize:'.8rem',fontStyle:'italic'}}>📄 {dm[1]}</span>;
  // Mensagens de botões enviados pela IA (ex: template de botões)
  const listaMatch = content.match(/^\[lista:\s*([^|]+)\|(.+)\]$/s);
  if (listaMatch) {
    const titulo = listaMatch[1].trim();
    const opcoes = listaMatch[2].split('|').map(o => o.trim()).filter(Boolean);
    return (
      <div>
        <div style={{fontSize:'.83rem',marginBottom:6}}>{titulo}</div>
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          {opcoes.map((op,i) => (
            <div key={i} style={{background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:7,padding:'5px 10px',fontSize:'.78rem',color:'rgba(255,255,255,.65)'}}>
              {op}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const am = content.match(/^\[audio:([^\]]+)\]/);
  if (am) {
    const token = localStorage.getItem('maxxi_token') || '';
    const raw = am[1]; // pode ser URL completa ou "mediaId:mime"
    let src, mime = 'audio/ogg';
    if (raw.startsWith('http')) {
      src = raw;
    } else {
      // formato: mediaId:mime ou só mediaId
      const parts = raw.split(':');
      const mediaId = parts[0];
      mime = parts.slice(1).join(':') || 'audio/ogg';
      src = `/admin/api/chat/midia/${mediaId}?token=${encodeURIComponent(token)}`;
    }
    return (
      <div style={{minWidth:220}}>
        <div style={{fontSize:'.63rem',color:'rgba(255,255,255,.4)',marginBottom:5,letterSpacing:'.5px',textTransform:'uppercase'}}>🎙 Áudio de voz</div>
        <audio controls style={{width:'100%',height:36,borderRadius:8,outline:'none'}}>
          <source src={src} type={mime}/>
        </audio>
      </div>
    );
  }

  // Áudio recebido sem transcrição — mostra player placeholder
  if (content.startsWith('[ÁUDIO RECEBIDO]') || content.startsWith('[AUDIO RECEBIDO]')) {
    return (
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'6px 4px',minWidth:180}}>
        <div style={{width:36,height:36,borderRadius:'50%',background:'rgba(0,200,150,.15)',border:'1px solid rgba(0,200,150,.2)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:16}}>🎙</div>
        <div style={{flex:1}}>
          <div style={{fontSize:'.75rem',fontWeight:600,color:'rgba(255,255,255,.7)',marginBottom:2}}>Mensagem de áudio</div>
          <div style={{fontSize:'.65rem',color:'rgba(255,255,255,.3)'}}>Não foi possível transcrever</div>
        </div>
      </div>
    );
  }
  const parts = content.split(/(\*[^*]+\*|_[^_]+_|~[^~]+~|```[\s\S]*?```)/g);
  return <span style={{whiteSpace:'pre-wrap',lineHeight:1.6}}>{parts.map((p,i)=>{
    if (p.startsWith('*')&&p.endsWith('*')) return <strong key={i}>{p.slice(1,-1)}</strong>;
    if (p.startsWith('_')&&p.endsWith('_')) return <em key={i}>{p.slice(1,-1)}</em>;
    if (p.startsWith('~')&&p.endsWith('~')) return <del key={i}>{p.slice(1,-1)}</del>;
    if (p.startsWith('```')&&p.endsWith('```')) return <code key={i} style={{background:'rgba(0,0,0,.3)',borderRadius:4,padding:'1px 5px',fontSize:'.82em',fontFamily:"'JetBrains Mono',monospace"}}>{p.slice(3,-3).trim()}</code>;
    return p;
  })}</span>;
}

/* ─── MODAL ──────────────────────────────────────────────────────────────────── */
function Modal({ title, children, onClose }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9000,backdropFilter:'blur(6px)'}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'rgba(2,40,50,.97)',border:'1px solid rgba(0,200,150,.15)',borderRadius:14,padding:22,width:400,maxWidth:'95vw',maxHeight:'82vh',overflowY:'auto',animation:'scaleIn .15s ease'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:'.9rem'}}>{title}</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'rgba(255,255,255,.4)',cursor:'pointer',fontSize:'1rem',lineHeight:1,padding:4}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─── LISTA DE CONVERSAS ─────────────────────────────────────────────────────── */
function ConvList({ convs, activeId, onSelect, filtro, setFiltro, search, setSearch }) {
  const tabs = [
    {id:'todos',label:'Todos',n:convs.length},
    {id:'ia',label:'IA',n:convs.filter(c=>c.status==='ia').length},
    {id:'fila',label:'Fila',n:convs.filter(c=>c.status==='aguardando').length},
    {id:'agente',label:'Agente',n:convs.filter(c=>c.status==='ativa').length},
  ];
  const map = {ia:'ia',fila:'aguardando',agente:'ativa'};
  const filtered = sortConvs(convs.filter(c=>{
    if (filtro!=='todos'&&c.status!==map[filtro]) return false;
    if (search){const q=search.toLowerCase();return (c.nome||'').toLowerCase().includes(q)||(c.telefone||'').includes(q);}
    return true;
  }));
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      <div style={{padding:'10px 10px 6px'}}>
        <div style={{position:'relative'}}>
          <span style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',opacity:.35,fontSize:'.78rem',pointerEvents:'none'}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..." aria-label="Buscar"
            style={{width:'100%',paddingLeft:28,paddingRight:8,paddingTop:6,paddingBottom:6,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.07)',borderRadius:8,color:'inherit',fontSize:'.78rem',outline:'none',boxSizing:'border-box'}}/>
        </div>
      </div>
      <div style={{display:'flex',borderBottom:'1px solid rgba(255,255,255,.06)',flexShrink:0,padding:'0 6px'}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setFiltro(t.id)}
            style={{flex:1,padding:'6px 2px',background:'none',border:'none',cursor:'pointer',fontSize:'.7rem',
              color:filtro===t.id?'#00c896':'rgba(255,255,255,.38)',
              borderBottom:filtro===t.id?'2px solid #00c896':'2px solid transparent',
              fontWeight:filtro===t.id?600:400,transition:'.15s',whiteSpace:'nowrap',letterSpacing:'.2px'}}>
            {t.label}
            {t.n>0&&<span style={{marginLeft:3,background:filtro===t.id?'rgba(0,200,150,.15)':'rgba(255,255,255,.06)',borderRadius:8,padding:'0 5px',fontSize:'.62rem'}}>{t.n}</span>}
          </button>
        ))}
      </div>
      <div style={{flex:1,overflowY:'auto'}}>
        {filtered.length===0&&<div style={{padding:20,textAlign:'center',color:'rgba(255,255,255,.2)',fontSize:'.78rem'}}>Nenhuma conversa</div>}
        {filtered.map(c=>{
          const urg = c.status==='aguardando' ? calcUrgencia(c.aguardando_desde) : {nivel:'ativa'};
          const urgColor = URG_COLOR[urg.nivel];
          const isActive = c.id===activeId;
          const st = statusDef[c.status]||statusDef.ia;
          return (
            <div key={c.id} onClick={()=>onSelect(c)}
              style={{display:'flex',alignItems:'center',gap:9,padding:'9px 10px',cursor:'pointer',
                background:isActive?'rgba(0,200,150,.07)':'transparent',
                borderLeft:isActive?'2px solid #00c896':`2px solid ${urgColor}`,
                transition:'.12s'}}
              onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background='rgba(255,255,255,.03)';}}
              onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background='transparent';}}>
              <Avatar conv={c} size={32}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:1}}>
                  <span style={{fontWeight:600,fontSize:'.8rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:110}}>
                    {c.prioridade==='urgente'&&<span style={{color:'#ff4757',marginRight:3,fontSize:'.6rem'}}>●</span>}
                    {c.nome || (c.telefone ? c.telefone.slice(-9) : '—')}
                  </span>
                  <span style={{fontSize:'.6rem',color:'rgba(255,255,255,.25)',flexShrink:0,marginLeft:4}}>{fmtHora(c.atualizado)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:'.7rem',color:'rgba(255,255,255,.3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:120}}>{c.ultima_msg || c.telefone || '—'}</span>
                  <div style={{display:'flex',alignItems:'center',gap:3,flexShrink:0}}>
                    {c.nao_lidas>0&&<span style={{background:'#00c896',color:'#001a14',borderRadius:10,padding:'0 5px',fontSize:'.58rem',fontWeight:700}}>{c.nao_lidas}</span>}
                    <span style={{fontSize:'.58rem',background:c.status==='aguardando'?'rgba(245,197,24,.1)':c.status==='ativa'?'rgba(62,207,255,.1)':c.status==='ia'?'rgba(0,200,150,.08)':'rgba(255,255,255,.06)',
                      color:st.dot,borderRadius:4,padding:'1px 5px',fontWeight:600}}>{st.label}</span>
                  </div>
                </div>
                {c.tags?.length>0&&(
                  <div style={{display:'flex',gap:3,marginTop:2,flexWrap:'wrap'}}>
                    {c.tags.slice(0,2).map(t=><span key={t} style={{fontSize:'.55rem',background:'rgba(0,200,150,.06)',color:'#00c896',borderRadius:3,padding:'0 4px'}}>{t}</span>)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── PAINEL DO CLIENTE ──────────────────────────────────────────────────────── */
function ClientPanel({ telefone, cpfSessao, convId, canal, accountId }) {
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [tab,setTab]=useState('dados');
  const [ocModal,setOcModal]=useState(null);
  const [ocText,setOcText]=useState('');
  const [ocTipo,setOcTipo]=useState('');
  const [ocTipos,setOcTipos]=useState([]);
  const [ocResponse,setOcResponse]=useState(null);
  const [searchCpf,setSearchCpf]=useState('');
  const [searching,setSearching]=useState(false);
  const [liberando,setLiberando]=useState(null);
  const [expandedOc,setExpandedOc]=useState(null);
  const { showToast } = useStore();

  // ── Reseta dados quando muda de conversa ──────────────────────────────────
  useEffect(() => {
    setData(null);
    setSearchCpf('');
    setTab('dados');
    setOcModal(null);
  }, [convId]);

  const loadByCpf = useCallback(async (cpf) => {
    if (!cpf) return;
    setLoading(true);
    try { const r=await fetchClienteCompleto(cpf,convId,canal,accountId); setData(r); } catch { setData(null); } finally { setLoading(false); }
  },[convId,canal,accountId]);

  const doLiberar = async (id) => {
    if (!window.confirm('Liberar contrato?')) return;
    setLiberando(id);
    try { await liberarContrato(id,canal,accountId); showToast('✅ Liberado!'); loadByCpf(data?.cpfcnpj||data?.cpf_cnpj); } catch(e){showToast('Erro: '+e.message,true);} finally {setLiberando(null);}
  };
  const loadTipos = useCallback(async () => {
    try { const r=await apiJson('/api/erp/tipos-ocorrencia'); const arr=Array.isArray(r)?r:(r?.tipos||[]); setOcTipos(arr); if(arr.length>0&&!ocTipo)setOcTipo(String(arr[0].id)); } catch {}
  },[ocTipo]);
  const doBoleto = async (b) => { try { await enviarBoleto(convId,canal,telefone,accountId,b); showToast('📤 Boleto enviado!'); } catch(e){showToast('Erro: '+e.message,true);} };
  const doPix = async (b) => {
    if (!b.pix_copia_cola){showToast('Sem PIX disponível',true);return;}
    try { await api('/api/chat/enviar-pix',{method:'POST',body:JSON.stringify({convId,canal,telefone,accountId,boleto:b})}); showToast('💠 PIX enviado!'); } catch(e){showToast('Erro: '+e.message,true);}
  };
  const [enviandoBoleto, setEnviandoBoleto] = useState({});
  const [enviandoPix, setEnviandoPix] = useState({});
  const [enviandoPromessa, setEnviandoPromessa] = useState({});

  const doBoletoCom = async (b, idx) => {
    setEnviandoBoleto(p=>({...p,[idx]:true}));
    try { await enviarBoleto(convId,canal,telefone,accountId,b); showToast('📄 Boleto enviado!'); }
    catch(e){showToast('Erro: '+e.message,true);}
    setEnviandoBoleto(p=>({...p,[idx]:false}));
  };
  const doPixCom = async (b, idx) => {
    if (!b.pix_copia_cola&&!b.link_cobranca){showToast('Sem PIX disponível',true);return;}
    setEnviandoPix(p=>({...p,[idx]:true}));
    try { await api('/api/chat/enviar-pix',{method:'POST',body:JSON.stringify({convId,canal,telefone,accountId,boleto:b})}); showToast('💠 PIX enviado!'); }
    catch(e){showToast('Erro: '+e.message,true);}
    setEnviandoPix(p=>({...p,[idx]:false}));
  };
  const doPromessa = async (contratoId, idx) => {
    if(!window.confirm(`Fazer promessa de pagamento para o contrato #${contratoId}?\n\nIsso libera a conexão por 3 dias.`)) return;
    setEnviandoPromessa(p=>({...p,[idx]:true}));
    try {
      const r = await promessaPagamento(contratoId);
      if(r?.liberado || r?.ok) showToast(`✅ Promessa registrada! Contrato #${contratoId} liberado por 3 dias.`);
      else showToast(r?.msg || r?.erro || 'Erro ao registrar promessa', true);
    } catch(e){showToast('Erro: '+e.message,true);}
    setEnviandoPromessa(p=>({...p,[idx]:false}));
  };
  const doEnviarTodosVencidos = async () => {
    const todos = (data?.boletos||[]);
    const vencidos = todos.filter(b => b.vencido || (b.vencimento_atual && new Date(b.vencimento_atual) < new Date()));
    if(!vencidos.length){showToast('Sem boletos vencidos',true);return;}
    if(!window.confirm(`Enviar ${vencidos.length} boleto(s) vencido(s) para o cliente?`)) return;
    for(let i=0;i<vencidos.length;i++){
      try { await enviarBoleto(convId,canal,telefone,accountId,vencidos[i]); } catch{}
      await new Promise(r=>setTimeout(r,500));
    }
    showToast(`📤 ${vencidos.length} boleto(s) enviado(s)!`);
  };
  const doFechar = async (id) => { if(!window.confirm('Fechar?'))return; try{await fecharOcorrencia(id,'Fechada via painel');showToast('✅ Fechada');loadByCpf(data?.cpfcnpj||data?.cpf_cnpj);}catch(e){showToast('Erro: '+e.message,true);} };
  const doNotaOc = async (id) => { if(!ocText.trim())return; try{await notaOcorrencia(id,ocText.trim());showToast('📝 Nota adicionada');setOcModal(null);setOcText('');}catch(e){showToast('Erro: '+e.message,true);} };
  const doAbrir = async () => {
    if(!ocText.trim()){showToast('Descreva o problema',true);return;}
    const cId=data?.contratos?.[0]?.id;
    if(!cId){showToast('Nenhum contrato encontrado',true);return;}
    try {
      const r=await criarChamado(String(cId),ocTipo,ocText.trim(),{contato_nome:data.nome,contato_telefone:telefone,usuario:'maxxi'});
      setOcResponse(r);
      if(r.ok){showToast('🎫 Chamado'+(r.protocolo?' #'+r.protocolo:'')+' aberto!');setOcModal(null);setOcText('');}
      else showToast(r.msg||'Erro ao abrir chamado',true);
    } catch(e){showToast('Erro: '+e.message,true);}
  };
  useEffect(()=>{ if(cpfSessao) loadByCpf(cpfSessao.replace(/\D/g,'')); },[cpfSessao,loadByCpf]);

  // Auto-detecta CPF nas mensagens do cliente quando não há cpfSessao
  useEffect(()=>{
    if (cpfSessao || data) return;
    apiJson(`/api/conversas/${convId}`).then(c => {
      const msgs = c?.mensagens || [];
      for (const m of msgs) {
        // Só mensagens do cliente (role='cliente') não da IA (role='ia') nem agente (role='agente')
        if (m.role === 'ia' || m.role === 'agente' || m.role === 'assistant') continue;
        const texto = m.content || m.conteudo || m.texto || '';
        const digits = texto.replace(/\D/g, '');
        if (digits.length === 11 || digits.length === 14) {
          loadByCpf(digits);
          break;
        }
      }
    }).catch(()=>{});
  }, [convId, cpfSessao, data, loadByCpf]);

  const pill = (txt,ok) => <span style={{fontSize:'.62rem',background:ok?'rgba(0,200,150,.1)':'rgba(255,71,87,.08)',color:ok?'#00c896':'#ff4757',borderRadius:4,padding:'2px 6px'}}>{txt}</span>;

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'rgba(1,18,24,.5)'}}>
      {/* Busca */}
      <div style={{padding:'10px 12px 8px',borderBottom:'1px solid rgba(255,255,255,.05)',display:'flex',gap:6}}>
        <input value={searchCpf} onChange={e=>setSearchCpf(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&(setSearching(true),loadByCpf(searchCpf.replace(/\D/g,'')).finally(()=>setSearching(false)))}
          placeholder="Buscar CPF ou CNPJ…"
          style={{flex:1,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',borderRadius:8,padding:'7px 10px',color:'inherit',fontSize:'.77rem',outline:'none'}}/>
        <button onClick={()=>{setSearching(true);loadByCpf(searchCpf.replace(/\D/g,'')).finally(()=>setSearching(false));}} disabled={searching}
          style={{padding:'0 12px',borderRadius:8,background:'rgba(0,200,150,.12)',border:'1px solid rgba(0,200,150,.25)',color:'#00c896',cursor:'pointer',fontSize:'.8rem',fontWeight:700,flexShrink:0}}>
          {searching?'…':'🔍'}
        </button>
      </div>

      {loading&&(
        <div style={{padding:20,textAlign:'center'}}>
          <div style={{width:24,height:24,border:'2px solid rgba(0,200,150,.2)',borderTop:'2px solid #00c896',borderRadius:'50%',margin:'0 auto',animation:'spin 1s linear infinite'}}/>
        </div>
      )}

      {!data&&!loading&&(
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,padding:24,textAlign:'center'}}>
          <div style={{width:48,height:48,borderRadius:'50%',background:'rgba(255,255,255,.04)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,opacity:.4}}>👤</div>
          <div style={{color:'rgba(255,255,255,.25)',fontSize:'.77rem',lineHeight:1.5}}>Busque um CPF ou o cliente<br/>será identificado automaticamente</div>
        </div>
      )}

      {data&&!loading&&(
        <>
          {/* Header cliente */}
          <div style={{padding:'12px 14px',borderBottom:'1px solid rgba(255,255,255,.05)',background:'rgba(0,200,150,.03)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,rgba(0,200,150,.25),rgba(0,200,150,.08))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:800,color:'#00c896',flexShrink:0}}>
                {(data.nome||'?')[0].toUpperCase()}
              </div>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:700,fontSize:'.88rem',color:'#e2e8f0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{data.nome||'—'}</div>
                <div style={{fontSize:'.65rem',color:'rgba(255,255,255,.3)',fontFamily:"'JetBrains Mono',monospace",marginTop:1}}>{data.cpfcnpj||data.cpf_cnpj||'—'}</div>
              </div>
            </div>
            {/* Resumo contratos */}
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              {data.contratos?.slice(0,8).map(ct=>(
                <span key={ct.id} style={{fontSize:'.6rem',fontWeight:600,padding:'2px 7px',borderRadius:20,
                  background:ct.status==='Ativo'?'rgba(0,200,150,.1)':ct.status==='Suspenso'?'rgba(245,197,24,.1)':'rgba(255,71,87,.08)',
                  color:ct.status==='Ativo'?'#00c896':ct.status==='Suspenso'?'#f5c518':'#ff4757',
                  border:`1px solid ${ct.status==='Ativo'?'rgba(0,200,150,.2)':ct.status==='Suspenso'?'rgba(245,197,24,.2)':'rgba(255,71,87,.15)'}`}}>
                  #{ct.id} {ct.status}
                </span>
              ))}
              {(data.contratos?.length||0)>8&&<span style={{fontSize:'.6rem',color:'rgba(255,255,255,.3)'}}>+{data.contratos.length-8}</span>}
            </div>
          </div>

          {/* Tabs */}
          <div style={{display:'flex',borderBottom:'1px solid rgba(255,255,255,.05)',flexShrink:0}}>
            {[
            ['dados','📋 Dados'],
            ['boletos', '💰 Boletos' + ((data.boletos||[]).length ? ` (${(data.boletos||[]).length})` : '')],
            ['chamados','🎫 Chamados']
          ].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)}
                style={{flex:1,padding:'8px 4px',background:'none',border:'none',cursor:'pointer',fontSize:'.68rem',fontWeight:tab===id?700:400,
                  color:tab===id?'#00c896':'rgba(255,255,255,.3)',
                  borderBottom:tab===id?'2px solid #00c896':'2px solid transparent',letterSpacing:'.2px',transition:'.15s'}}>
                {label}
              </button>
            ))}
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'10px 12px'}}>

            {/* ABA DADOS */}
            {tab==='dados'&&(
              <div>
                {data.contratos?.map((ct,i)=>(
                  <div key={i} style={{marginBottom:10,borderRadius:10,border:'1px solid rgba(255,255,255,.07)',overflow:'hidden'}}>
                    {/* Header contrato */}
                    <div style={{padding:'9px 12px',background:ct.status==='Ativo'?'rgba(0,200,150,.06)':ct.status==='Suspenso'?'rgba(245,197,24,.06)':'rgba(255,71,87,.05)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <div style={{width:7,height:7,borderRadius:'50%',background:ct.status_internet?'#00c896':'#ff4757',flexShrink:0}}/>
                        <span style={{fontSize:'.8rem',fontWeight:700}}>Contrato #{ct.id}</span>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontSize:'.62rem',color:ct.status==='Ativo'?'#00c896':ct.status==='Suspenso'?'#f5c518':'#ff4757'}}>{ct.status}</span>
                        {ct.status_internet!==undefined&&(
                          <button onClick={()=>doLiberar(ct.id)} disabled={liberando===ct.id}
                            style={{padding:'2px 8px',borderRadius:5,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',color:'rgba(255,255,255,.6)',cursor:'pointer',fontSize:'.62rem'}}>
                            {liberando===ct.id?'…':'🔓 Liberar'}
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Detalhes */}
                    <div style={{padding:'9px 12px',display:'flex',flexDirection:'column',gap:5}}>
                      {ct.plano&&(
                        <div style={{display:'flex',justifyContent:'space-between'}}>
                          <span style={{fontSize:'.65rem',color:'rgba(255,255,255,.3)'}}>Plano</span>
                          <span style={{fontSize:'.72rem',fontWeight:600,color:'#e2e8f0'}}>{ct.plano}</span>
                        </div>
                      )}
                      {(ct.endereco||ct.end)&&(
                        <div>
                          <span style={{fontSize:'.65rem',color:'rgba(255,255,255,.3)',display:'block',marginBottom:2}}>Endereço</span>
                          <span style={{fontSize:'.7rem',color:'rgba(255,255,255,.55)',lineHeight:1.4}}>{ct.endereco||ct.end}</span>
                        </div>
                      )}
                      {ct.status_internet!==undefined&&(
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:4,borderTop:'1px solid rgba(255,255,255,.05)',marginTop:2}}>
                          <span style={{fontSize:'.65rem',color:'rgba(255,255,255,.3)'}}>Conexão</span>
                          <span style={{fontSize:'.7rem',color:ct.status_internet?'#00c896':'#ff4757',fontWeight:600}}>
                            {ct.status_internet?'🟢 Online':'🔴 Offline'}
                            {ct.bloqueado&&<span style={{color:'#f5c518',marginLeft:5}}>⚠ Bloqueado</span>}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {!data.contratos?.length&&<div style={{textAlign:'center',color:'rgba(255,255,255,.2)',fontSize:'.78rem',paddingTop:20}}>Sem contratos</div>}
              </div>
            )}

            {/* ABA BOLETOS */}
            {tab==='boletos'&&(()=>{
              const todos = data.boletos || [];
              // SGP já retorna só boletos em aberto — todos são para mostrar
              // Determina vencido pelo campo vencido ou pela data
              const comVencido = todos.map(b => ({
                ...b,
                _vencido: b.vencido || (b.vencimento_atual && new Date(b.vencimento_atual) < new Date()),
              }));
              // Ordena: vencidos primeiro, depois por data
              const ordenados = [...comVencido].sort((a,b2) => {
                if (a._vencido && !b2._vencido) return -1;
                if (!a._vencido && b2._vencido) return 1;
                return new Date(a.vencimento_atual||0) - new Date(b2.vencimento_atual||0);
              });
              const qtdVencidos = ordenados.filter(b=>b._vencido).length;
              return (
                <div>
                  {/* Header resumo */}
                  {ordenados.length > 0 && (
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,padding:'8px 10px',background:'rgba(255,255,255,.03)',borderRadius:8,border:'1px solid rgba(255,255,255,.06)'}}>
                      <div>
                        <span style={{fontSize:'.75rem',fontWeight:700,color:'#e2e8f0'}}>{ordenados.length} em aberto</span>
                        {qtdVencidos>0&&<span style={{fontSize:'.65rem',color:'#ff4757',marginLeft:8}}>⚠ {qtdVencidos} vencido{qtdVencidos>1?'s':''}</span>}
                      </div>
                      {qtdVencidos>0&&(
                        <button onClick={doEnviarTodosVencidos}
                          style={{padding:'4px 10px',borderRadius:6,background:'rgba(255,71,87,.08)',border:'1px solid rgba(255,71,87,.2)',color:'#ff4757',cursor:'pointer',fontSize:'.65rem',fontWeight:600}}>
                          📤 Enviar todos vencidos
                        </button>
                      )}
                    </div>
                  )}

                  {!ordenados.length&&<div style={{textAlign:'center',color:'rgba(255,255,255,.2)',fontSize:'.78rem',paddingTop:20,paddingBottom:20}}>✅ Sem boletos em aberto</div>}

                  {ordenados.map((b,i)=>{
                    const contratoId = b.contrato || b.contrato_id || data.contratos?.[0]?.id;
                    const valor = b.valor_cobrado || b.valor || '—';
                    const multa = parseFloat(b.multa||0)+parseFloat(b.juros||0);
                    const venc = b.vencimento_atual || b.vencimento || '—';
                    const vencOrig = b.vencimento_original;
                    const temPix = !!(b.pix_copia_cola || b.link_cobranca);
                    return (
                      <div key={i} style={{marginBottom:10,borderRadius:10,border:`1px solid ${b._vencido?'rgba(255,71,87,.2)':'rgba(245,197,24,.15)'}`,overflow:'hidden',background:b._vencido?'rgba(255,71,87,.03)':'rgba(245,197,24,.02)'}}>
                        <div style={{padding:'9px 12px',borderBottom:'1px solid rgba(255,255,255,.05)',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                          <div>
                            <div style={{fontSize:'.88rem',fontWeight:800,color:b._vencido?'#ff6b6b':'#f5c518'}}>
                              R$ {valor}
                              {multa>0&&<span style={{fontSize:'.63rem',color:'rgba(255,71,87,.7)',fontWeight:400,marginLeft:5}}>(+R$ {multa.toFixed(2)} juros/multa)</span>}
                            </div>
                            <div style={{fontSize:'.65rem',color:'rgba(255,255,255,.35)',marginTop:2}}>
                              {vencOrig && vencOrig!==venc
                                ? <span>Orig: {vencOrig} → Atual: <strong style={{color:'rgba(255,255,255,.5)'}}>{venc}</strong></span>
                                : <span>Venc: {venc}</span>
                              }
                              {contratoId&&<span style={{marginLeft:6,color:'rgba(255,255,255,.2)'}}>· #{ contratoId}</span>}
                            </div>
                          </div>
                          <span style={{fontSize:'.6rem',padding:'2px 8px',borderRadius:20,fontWeight:700,flexShrink:0,
                            background:b._vencido?'rgba(255,71,87,.12)':'rgba(245,197,24,.1)',
                            color:b._vencido?'#ff4757':'#f5c518',
                            border:`1px solid ${b._vencido?'rgba(255,71,87,.25)':'rgba(245,197,24,.2)'}`}}>
                            {b._vencido?'VENCIDO':'A vencer'}
                          </span>
                        </div>
                        <div style={{padding:'8px 10px',display:'grid',gridTemplateColumns:`1fr${temPix?' 1fr':''} 1fr`,gap:5}}>
                          <button onClick={()=>doBoletoCom(b,i)} disabled={enviandoBoleto[i]}
                            style={{padding:'6px 4px',borderRadius:7,background:'rgba(62,207,255,.08)',border:'1px solid rgba(62,207,255,.2)',color:'#3ecfff',cursor:'pointer',fontSize:'.68rem',fontWeight:600,textAlign:'center'}}>
                            {enviandoBoleto[i]?'…':'📄 Boleto'}
                          </button>
                          {temPix&&(
                            <button onClick={()=>doPixCom(b,i)} disabled={enviandoPix[i]}
                              style={{padding:'6px 4px',borderRadius:7,background:'rgba(167,139,250,.08)',border:'1px solid rgba(167,139,250,.2)',color:'#a78bfa',cursor:'pointer',fontSize:'.68rem',fontWeight:600,textAlign:'center'}}>
                              {enviandoPix[i]?'…':'💠 PIX'}
                            </button>
                          )}
                          {contratoId&&(
                            <button onClick={()=>doPromessa(contratoId,i)} disabled={enviandoPromessa[i]}
                              style={{padding:'6px 4px',borderRadius:7,background:'rgba(245,197,24,.07)',border:'1px solid rgba(245,197,24,.2)',color:'#f5c518',cursor:'pointer',fontSize:'.68rem',fontWeight:600,textAlign:'center'}}>
                              {enviandoPromessa[i]?'…':'🤝 Promessa'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ABA CHAMADOS */}
            {tab==='chamados'&&(
              <div>
                <button onClick={()=>{setOcModal('abrir');setOcText('');setOcResponse(null);loadTipos();}}
                  style={{width:'100%',marginBottom:10,padding:'8px',borderRadius:8,background:'rgba(0,200,150,.1)',border:'1px solid rgba(0,200,150,.2)',color:'#00c896',cursor:'pointer',fontSize:'.75rem',fontWeight:700}}>
                  ➕ Abrir chamado
                </button>
                {(!data.ocorrencias?.length)&&<div style={{textAlign:'center',color:'rgba(255,255,255,.2)',fontSize:'.78rem',paddingTop:10}}>Sem chamados</div>}
                {data.ocorrencias?.map((oc,i)=>{
                  const ocId=oc.id||`oc-${i}`;
                  const isOpen=expandedOc===ocId;
                  const aberta=oc.status!=='Fechada';
                  return (
                    <div key={ocId} style={{marginBottom:6,background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.06)',borderRadius:9,overflow:'hidden'}}>
                      <div style={{padding:'9px 11px',display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer'}} onClick={()=>setExpandedOc(isOpen?null:ocId)}>
                        <div style={{minWidth:0,flex:1}}>
                          <div style={{fontSize:'.77rem',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {oc.tipo_nome||oc.tipo||'Chamado'} <span style={{fontWeight:400,color:'rgba(255,255,255,.3)'}}>#{ocId}</span>
                          </div>
                          <div style={{fontSize:'.62rem',color:'rgba(255,255,255,.3)',marginTop:1}}>{fmtData(oc.criado_em||oc.data)}</div>
                        </div>
                        <span style={{fontSize:'.6rem',padding:'2px 7px',borderRadius:20,flexShrink:0,marginLeft:8,
                          background:aberta?'rgba(245,197,24,.1)':'rgba(85,85,85,.2)',
                          color:aberta?'#f5c518':'#666',
                          border:`1px solid ${aberta?'rgba(245,197,24,.2)':'rgba(85,85,85,.3)'}`}}>
                          {oc.status}
                        </span>
                      </div>
                      {isOpen&&(
                        <div style={{padding:'8px 11px',borderTop:'1px solid rgba(255,255,255,.05)'}}>
                          <div style={{fontSize:'.74rem',color:'rgba(255,255,255,.45)',marginBottom:8,lineHeight:1.5}}>{oc.descricao||'—'}</div>
                          <div style={{display:'flex',gap:5}}>
                            {aberta&&<button onClick={()=>doFechar(ocId)}
                              style={{padding:'4px 10px',borderRadius:6,background:'rgba(0,200,150,.08)',border:'1px solid rgba(0,200,150,.2)',color:'#00c896',cursor:'pointer',fontSize:'.68rem'}}>
                              ✓ Fechar
                            </button>}
                            <button onClick={()=>{setOcModal('nota-'+ocId);setOcText('');}}
                              style={{padding:'4px 10px',borderRadius:6,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',color:'rgba(255,255,255,.5)',cursor:'pointer',fontSize:'.68rem'}}>
                              📝 Nota
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {ocModal&&(
            <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9100,backdropFilter:'blur(4px)'}}
              onClick={e=>e.target===e.currentTarget&&setOcModal(null)}>
              <div style={{background:'rgba(2,22,32,.98)',border:'1px solid rgba(0,200,150,.15)',borderRadius:12,padding:20,width:340,maxWidth:'95vw'}}>
                <div style={{fontWeight:700,marginBottom:12,fontSize:'.88rem'}}>{ocModal==='abrir'?'🎫 Abrir chamado':'📝 Adicionar nota'}</div>
                {ocModal==='abrir'&&ocTipos.length>0&&(
                  <select value={ocTipo} onChange={e=>setOcTipo(e.target.value)}
                    style={{width:'100%',marginBottom:8,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:7,padding:'7px 9px',color:'inherit',fontSize:'.8rem',outline:'none'}}>
                    {ocTipos.map(t=><option key={t.id} value={t.id}>{t.nome||t.descricao}</option>)}
                  </select>
                )}
                <textarea value={ocText} onChange={e=>setOcText(e.target.value)} rows={4}
                  placeholder={ocModal==='abrir'?'Descreva o problema...':'Nota interna...'}
                  style={{width:'100%',background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:7,padding:'8px 10px',color:'inherit',fontSize:'.8rem',resize:'vertical',outline:'none',boxSizing:'border-box'}}/>
                {ocResponse&&!ocResponse.ok&&<div style={{color:'#ff4757',fontSize:'.74rem',marginTop:4}}>{ocResponse.msg}</div>}
                <div style={{display:'flex',gap:8,marginTop:10}}>
                  <button onClick={()=>setOcModal(null)}
                    style={{flex:1,padding:'8px',borderRadius:8,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',color:'rgba(255,255,255,.5)',cursor:'pointer',fontSize:'.8rem'}}>
                    Cancelar
                  </button>
                  <button onClick={ocModal==='abrir'?doAbrir:()=>doNotaOc(ocModal.replace('nota-',''))}
                    style={{flex:2,padding:'8px',borderRadius:8,background:'rgba(0,200,150,.12)',border:'1px solid rgba(0,200,150,.3)',color:'#00c896',cursor:'pointer',fontSize:'.8rem',fontWeight:700}}>
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════════ */
export default function Chat() {
  const [convs,setConvs]=useState([]);
  const [activeConv,setActiveConv]=useState(null);
  const [messages,setMessages]=useState([]);
  const [filtro,setFiltro]=useState('todos');
  const [search,setSearch]=useState('');
  const [input,setInput]=useState('');
  const [canned,setCanned]=useState([]);
  const [cannedVisible,setCannedVisible]=useState(false);
  const [cannedIdx,setCannedIdx]=useState(-1);
  const [mobileView,setMobileView]=useState('list');
  const [modal,setModal]=useState(null);
  const [notaText,setNotaText]=useState('');
  const [reacaoHover,setReacaoHover]=useState(null);
  const [transferTarget,setTransferTarget]=useState('');
  const [retornoModal,setRetornoModal]=useState(false);
  const [retornoMin,setRetornoMin]=useState(10);
  const [retornoAgendado,setRetornoAgendado]=useState(null);
  const [meuDesempenho,setMeuDesempenho]=useState(null);
  const [digitando,setDigitando]=useState({});
  const [respondendo,setRespondendo]=useState(null);
  const [showTags,setShowTags]=useState(false);
  const [showHistorico,setShowHistorico]=useState(false);
  const [historico,setHistorico]=useState([]);
  const [showTransferAgente,setShowTransferAgente]=useState(false);
  const [agentesLista,setAgentesLista]=useState([]);
  const digitandoTimer=useRef({});

  const {userId,userName,showToast,setChatUnread,sidebarCollapsed,toggleSidebar}=useStore();
  const msgsEndRef=useRef(null);
  const sseRef=useRef(null);
  const inputRef=useRef(null);
  const activeRef=useRef(null);
  const prevAguardandoRef=useRef(0);
  const audioCtxRef=useRef(null);
  activeRef.current=activeConv;

  useEffect(()=>{ if('Notification' in window&&Notification.permission==='default') Notification.requestPermission(); },[]);

  const playAlert=useCallback((title,body)=>{
    try {
      if(!audioCtxRef.current) audioCtxRef.current=new (window.AudioContext||window.webkitAudioContext)();
      const ctx=audioCtxRef.current;
      [0,0.18].forEach(d=>{const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=880;o.type='sine';g.gain.value=.3;o.start(ctx.currentTime+d);o.stop(ctx.currentTime+d+.12);});
    } catch {}
    if('Notification' in window&&Notification.permission==='granted'&&document.hidden) try{new Notification(title,{body,icon:'/admin/favicon.ico',tag:'maxxi-'+Date.now()});}catch{}
  },[]);

  const loadConvs=useCallback(async()=>{
    try{const l=await fetchConversas();const a=Array.isArray(l)?l:[];setConvs(a);setChatUnread(a.filter(c=>c.status==='aguardando').length);}catch{}
  },[setChatUnread]);

  const loadDesempenho=useCallback(async()=>{
    try{const r=await apiJson('/api/agentes/monitor/ranking?dias=1');const m=(Array.isArray(r)?r:[]).find(a=>a.id===userId);if(m)setMeuDesempenho(m);
      try{const al=await apiJson('/api/sla/alertas');const mn=(Array.isArray(al)?al:[]).filter(a=>a.agente_id===userId);setMeuDesempenho(p=>p?{...p,sla_atrasadas:mn.length}:p);}catch{}}catch{}
  },[userId]);

  const loadConv=useCallback(async(id)=>{
    try{const c=await fetchConversa(id);if(c&&!c.error){setMessages(c.mensagens||[]);setActiveConv(c);}}catch{}
  },[]);

  useEffect(()=>{
    const connect=()=>{
      if(sseRef.current) sseRef.current.close();
      const sse=createChatSSE(); sseRef.current=sse;
      ['nova_mensagem','resposta_ia','mensagem_agente','status_alterado','conversa_assumida','conversa_encerrada','modo_alterado'].forEach(evt=>{
        sse.addEventListener(evt,(e)=>{
          let d=null;try{d=JSON.parse(e.data);}catch{}
          loadConvs().then(()=>{setConvs(curr=>{
            const aw=curr.filter(c=>c.status==='aguardando').length;
            if(aw>prevAguardandoRef.current) playAlert('🔔 Novo na fila',`${aw} aguardando`);
            if(evt==='nova_mensagem'&&d?.convId){const m=curr.find(c=>c.id===d.convId&&c.agente_id===userId&&c.status==='ativa');if(m&&d.convId!==activeRef.current?.id)playAlert('💬 Nova mensagem',m.nome||'Cliente');}
            prevAguardandoRef.current=aw;return curr;
          });});
          if(d?.convId&&activeRef.current?.id&&d.convId===activeRef.current.id) loadConv(activeRef.current.id);
        });
      });
      sse.addEventListener('cliente_frustrado',()=>loadConvs());
      sse.addEventListener('mensagem_apagada',()=>{if(activeRef.current?.id)loadConv(activeRef.current.id);});
      sse.addEventListener('mensagem_editada',(e)=>{try{const d=JSON.parse(e.data);if(d.convId===activeRef.current?.id)setMessages(p=>p.map(m=>String(m.id)===String(d.msgId)?{...m,content:d.novoTexto,editado:true}:m));}catch{}});
      sse.addEventListener('digitando',(e)=>{try{const d=JSON.parse(e.data);setDigitando(p=>({...p,[d.convId]:d.ativo}));if(d.ativo){clearTimeout(digitandoTimer.current[d.convId]);digitandoTimer.current[d.convId]=setTimeout(()=>setDigitando(p=>({...p,[d.convId]:false})),5000);}}catch{}});
      sse.addEventListener('tags_atualizadas',(e)=>{try{const d=JSON.parse(e.data);setConvs(p=>p.map(cv=>cv.id===d.convId?{...cv,tags:d.tags}:cv));if(activeRef.current?.id===d.convId)loadConv(d.convId);}catch{}});
      sse.addEventListener('prioridade_atualizada',(e)=>{try{const d=JSON.parse(e.data);setConvs(p=>p.map(cv=>cv.id===d.convId?{...cv,prioridade:d.prioridade}:cv));}catch{}});
      sse.addEventListener('status_mensagem',(e)=>{try{const d=JSON.parse(e.data);setMessages(p=>p.map(m=>{if(String(m.id)!==String(d.msgId))return m;const status_ts={...(m.status_ts||{})};if(d.ts)status_ts[d.status]=d.ts;return {...m,status:d.status,status_ts};}));}catch{}});
      sse.addEventListener('mensagem_editada',(e)=>{try{const d=JSON.parse(e.data);setMessages(p=>p.map(m=>String(m.id)===String(d.msgId)?{...m,content:d.novoTexto,editado:true}:m));}catch{}});
      sse.onerror=()=>setTimeout(connect,3000);
    };
    connect();
    return ()=>{if(sseRef.current)sseRef.current.close();};
  },[]); // eslint-disable-line

  useEffect(()=>{loadConvs();const t=setInterval(loadConvs,20000);return()=>clearInterval(t);},[loadConvs]);
  useEffect(()=>{loadDesempenho();const t=setInterval(loadDesempenho,60000);return()=>clearInterval(t);},[loadDesempenho]);
  useEffect(()=>{msgsEndRef.current?.scrollIntoView({behavior:'smooth'});},[messages]);
  useEffect(()=>{
    const aw=convs.filter(c=>c.status==='aguardando').length;
    const mw=convs.filter(c=>c.agente_id===userId&&c.status==='ativa'&&c.nao_lidas>0).length;
    const tot=aw+mw;
    if(!tot){document.title='Maxxi · Chat';return;}
    const orig=`(${tot}) Maxxi · Chat`,alerta=aw>0?`⚠️ ${aw} na fila!`:`💬 ${mw} nova`;
    document.title=orig;if(!document.hidden)return;
    const t=setInterval(()=>{document.title=document.title===orig?alerta:orig;},1500);
    const onF=()=>{document.title=orig;clearInterval(t);};
    window.addEventListener('focus',onF);
    return()=>{clearInterval(t);window.removeEventListener('focus',onF);document.title='Maxxi · Chat';};
  },[convs,userId]);

  const [isMobile,setIsMobile]=useState(typeof window!=='undefined'&&window.innerWidth<=900);
  useEffect(()=>{const ch=()=>setIsMobile(window.innerWidth<=900);window.addEventListener('resize',ch);return()=>window.removeEventListener('resize',ch);},[]);

  const selectConv=(c)=>{loadConv(c.id);setMobileView('chat');setShowTags(false);setShowTransferAgente(false);};
  const sendMsg=async()=>{
    if(!input.trim()||!activeConv?.id)return;
    const txt=input.trim();setInput('');setCannedVisible(false);setRespondendo(null);
    try{const r=await enviarMensagem(activeConv.id,txt,userId,userName);if(r.aviso)showToast(r.aviso,true);loadConv(activeConv.id);}catch(e){showToast('Erro: '+e.message,true);}
  };
  const handleInput=async(val)=>{
    setInput(val);
    if(val.startsWith('/')){try{const l=await fetchRespostasRapidas();const q=val.slice(1).toLowerCase();const f=l.filter(r=>r.atalho?.toLowerCase().includes(q)||r.texto?.toLowerCase().includes(q)).slice(0,6);setCanned(f);setCannedVisible(f.length>0);setCannedIdx(-1);}catch{}}
    else setCannedVisible(false);
  };
  const handleKeyDown=(e)=>{
    if(cannedVisible){
      if(e.key==='ArrowDown'){e.preventDefault();setCannedIdx(i=>Math.min(i+1,canned.length-1));}
      else if(e.key==='ArrowUp'){e.preventDefault();setCannedIdx(i=>Math.max(i-1,0));}
      else if(e.key==='Enter'){e.preventDefault();if(cannedIdx>=0&&canned[cannedIdx]){setInput(canned[cannedIdx].texto);setCannedVisible(false);inputRef.current?.focus();}}
      else if(e.key==='Escape')setCannedVisible(false);
    } else if(e.key==='Enter'){e.preventDefault();sendMsg();}
  };

  const doAssumir=async()=>{await assumirConversa(activeConv.id,userId,userName);showToast('✋ Assumida');loadConv(activeConv.id);loadConvs();};
  const doDevolver=async()=>{await devolverIA(activeConv.id);showToast('🤖 Devolvida');loadConv(activeConv.id);loadConvs();};
  const doEncerrar=async()=>{if(!window.confirm('Encerrar conversa?'))return;await encerrarConversa(activeConv.id);showToast('✓ Encerrada');setActiveConv(null);setMessages([]);setMobileView('list');loadConvs();};

  const doReabrir=async()=>{
    try {
      const r = await api(`/api/conversas/${activeConv.id}/reabrir`,{method:'POST',body:JSON.stringify({status:'aguardando'})});
      if (r.ok) { showToast('📂 Conversa reaberta!'); loadConv(activeConv.id); loadConvs(); }
      else showToast(r.error||'Erro ao reabrir',true);
    } catch(e){ showToast(e.message,true); }
  };

  const [showFluxoMenu, setShowFluxoMenu] = useState(false);
  const [fluxosDisponiveis, setFluxosDisponiveis] = useState([]);
  const abrirMenuFluxo = async () => {
    try {
      const lista = await apiJson('/api/fluxos');
      setFluxosDisponiveis((Array.isArray(lista)?lista:[]).filter(f=>f.publicado));
      setShowFluxoMenu(true);
    } catch { showToast('Erro ao carregar fluxos',true); }
  };
  const doTransferirFluxo = async (fluxoId, fluxoNome) => {
    if (transferindoFluxo) return;
    setShowFluxoMenu(false);
    if (!window.confirm(`Transferir para o fluxo "${fluxoNome}"?`)) return;
    setTransferindoFluxo(true);
    try {
      const r = await api(`/api/conversas/${activeConv.id}/transferir-fluxo`,{method:'POST',body:JSON.stringify({fluxo_id:fluxoId})});
      if (r.ok) { showToast(`🔀 Transferido para "${fluxoNome}"`); loadConv(activeConv.id); loadConvs(); }
      else showToast(r.error||'Erro',true);
    } catch(e){ showToast(e.message,true); }
    finally { setTransferindoFluxo(false); }
  };

  // Verifica se conversa encerrada pode ser reaberta (WhatsApp + dentro janela 24h)
  const podeReabrir = activeConv?.status==='encerrada' &&
    (activeConv?.canal||'').toLowerCase().includes('whatsapp') &&
    (Date.now() - Number(activeConv?.ultima_msg||0)) < 86400000;
  const doReacao=async(msgId,emoji)=>{if(!activeConv)return;try{await api(`/api/conversas/${activeConv.id}/reacao`,{method:'POST',body:JSON.stringify({msgId,emoji})});setReacaoHover(null);loadConv(activeConv.id);}catch(e){showToast('Erro: '+e.message,true);}};
  const loadAgentes=async()=>{try{const a=await fetchAgentes();setAgentesLista(Array.isArray(a)?a:[]);}catch{}};
  const loadHistoricoFn=async(tel)=>{try{const h=await apiJson(`/api/clientes/${tel}/historico`);setHistorico(Array.isArray(h)?h:[]);setShowHistorico(true);}catch{}};
  const salvarTags=async(tags)=>{if(!activeConv)return;try{await api(`/api/conversas/${activeConv.id}/tags`,{method:'PUT',body:JSON.stringify({tags})});setActiveConv(p=>({...p,tags}));showToast('🏷️ Tags salvas');}catch(e){showToast('Erro: '+e.message,true);}};
  const salvarPrioridade=async(p)=>{if(!activeConv)return;try{await api(`/api/conversas/${activeConv.id}/prioridade`,{method:'PUT',body:JSON.stringify({prioridade:p})});setActiveConv(prev=>({...prev,prioridade:p}));showToast(p==='urgente'?'🔴 Urgente':'⚪ Normal');}catch(e){showToast('Erro: '+e.message,true);}};
  const transferirParaAgente=async(aId)=>{if(!activeConv)return;try{const r=await apiJson(`/api/conversas/${activeConv.id}/transferir-agente`,{method:'POST',body:JSON.stringify({agenteId:aId})},true);showToast(`✅ Transferido para ${r.agente}`);setShowTransferAgente(false);loadConv(activeConv.id);}catch(e){showToast('Erro: '+e.message,true);}};
  const notificarDigitando=useCallback(async(ativo)=>{if(!activeConv)return;try{await api(`/api/conversas/${activeConv.id}/digitando`,{method:'POST',body:JSON.stringify({quem:'agente',ativo})});}catch{}},[activeConv]);
  const doNota=async()=>{if(!notaText.trim())return;await adicionarNota(activeConv.id,notaText.trim(),userId,userName);showToast('📝 Nota adicionada');setModal(null);setNotaText('');loadConv(activeConv.id);};
  const doTransferir=async()=>{if(!transferTarget)return;await transferirConversa(activeConv.id,transferTarget,userName);showToast('🔄 Transferida');setModal(null);loadConv(activeConv.id);loadConvs();};
  const doDelete=async(msgId)=>{if(!window.confirm('Apagar mensagem?'))return;await apagarMensagem(activeConv.id,msgId);loadConv(activeConv.id);};

  const [encaminharModal, setEncaminharModal] = useState(null); // { content, fromName }
  const [encaminharTel, setEncaminharTel] = useState('');
  const [stickerModal, setStickerModal] = useState(false);

  // Stickers CITmax pré-definidos (URLs de WebP públicos)
  const STICKERS = [
    { emoji: '👍', label: 'Ótimo!',       url: 'https://stickershop.line-scdn.net/stickershop/v1/product/1/iPhone/main@2x.png' },
    { emoji: '✅', label: 'Confirmado',   url: '' },
    { emoji: '🎉', label: 'Parabéns',     url: '' },
    { emoji: '💚', label: 'Obrigado',     url: '' },
    { emoji: '🌐', label: 'CITmax',       url: '' },
  ];

  const doEnviarSticker = async (stickerUrl) => {
    if (!activeConv?.telefone || !stickerUrl) { showToast('Sticker sem URL', true); return; }
    try {
      await api('/api/wa/sticker', { method:'POST', body: JSON.stringify({ para: activeConv.telefone, stickerUrl }) });
      showToast('🎭 Sticker enviado!');
      setStickerModal(false);
    } catch(e) { showToast('Erro: ' + e.message, true); }
  };

  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const doEnviarArquivo = async (file) => {
    if (!activeConv?.telefone) { showToast('Nenhuma conversa ativa', true); return; }
    if (file.size > 16 * 1024 * 1024) { showToast('Arquivo muito grande (máx 16MB)', true); return; }
    setEnviandoArquivo(true);
    try {
      const b64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const caption = file.type.startsWith('image/') ? '' : file.name;
      const r = await api('/api/chat/enviar-arquivo', { method:'POST', body: JSON.stringify({
        convId: activeConv.id,
        canal: canalAtivo,
        telefone: activeConv.telefone,
        filename: file.name,
        mimeType: file.type,
        data: b64,
        caption,
      })}).then(r=>r.json());
      if (r.ok) { showToast('📎 Arquivo enviado!'); loadConv(activeConv.id); }
      else showToast(r.error || 'Erro ao enviar arquivo', true);
    } catch(e) { showToast('Erro: ' + e.message, true); }
    setEnviandoArquivo(false);
  };
  const doEncaminhar = (m) => {
    setEncaminharTel('');
    setEncaminharModal({ content: m.content, fromName: activeConv?.nome || 'Cliente' });
  };
  const doEnviarEncaminhamento = async () => {
    if (!encaminharTel.trim() || !encaminharModal) return;
    try {
      await api('/api/wa/encaminhar', { method:'POST', body: JSON.stringify({
        para: encaminharTel.replace(/\D/g,''),
        content: encaminharModal.content,
        fromName: encaminharModal.fromName,
      })});
      showToast('⟫ Mensagem encaminhada!');
      setEncaminharModal(null);
    } catch(e) { showToast('Erro: '+e.message, true); }
  };
  const openTransferir=async()=>{try{setAgentesLista(await fetchAgentes());}catch{}setModal('transferir');};

  const doEnviarFila=async()=>{
    if(!window.confirm('Enviar para a fila de espera?')) return;
    try {
      const r = await api(`/api/conversas/${activeConv.id}/fila`,{method:'POST',body:'{}'});
      const d = await r.json();
      if(d.ok) {
        showToast('⏳ Enviado para a fila');
        await loadConvs();
        loadConv(activeConv.id);
      } else showToast(d.error||'Erro',true);
    } catch(e){ showToast(e.message,true); }
  };

  const [transferindoFluxo, setTransferindoFluxo] = useState(false);
  const doAgendarRetorno=async()=>{if(!activeConv)return;try{const r=await agendarRetorno(activeConv.id,activeConv.telefone,activeConv.canal,retornoMin);setRetornoAgendado(r);setRetornoModal(false);showToast(`⏰ Retorno em ${retornoMin} min`);}catch{showToast('Erro ao agendar',true);}};
  const doCancelarRetorno=async()=>{if(!activeConv)return;try{await cancelarRetorno(activeConv.id);setRetornoAgendado(null);showToast('Retorno cancelado');}catch{}};

  const st=statusDef[activeConv?.status]||statusDef.ia;
  const canalAtivo=activeConv?.canal||(activeConv?.id||'').split('_')[0]||'';
  const aguardandoCount=convs.filter(c=>c.status==='aguardando').length;

  /* ── RENDER ─────────────────────────────────────────────────────────────────── */
  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100dvh - 56px)',overflow:'hidden',animation:'fadeIn .2s ease'}}>

      {/* TOPBAR */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 14px',borderBottom:'1px solid rgba(255,255,255,.06)',flexShrink:0,gap:8,flexWrap:'wrap'}}>
        <div>
          <h1 style={{fontSize:'.92rem',fontWeight:700,margin:0,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:'1px'}}>💬 Chat Interno</h1>
          <p style={{margin:0,fontSize:'.68rem',color:'rgba(255,255,255,.3)'}}>
            {convs.length} conversas ·{' '}
            {aguardandoCount>0?<span style={{color:'#f5c518',fontWeight:600}}>{aguardandoCount} na fila</span>:'0 na fila'}
          </p>
        </div>
        {meuDesempenho&&(()=>{
          const d=meuDesempenho,mn=convs.filter(c=>c.agente_id===userId&&c.status==='ativa').length,tma=parseFloat(d.tempo_medio_min||0);
          return <div style={{display:'flex',gap:10,fontSize:'.7rem',color:'rgba(255,255,255,.35)',alignItems:'center'}}>
            <span>📊 <b style={{color:'rgba(255,255,255,.6)'}}>{d.atendimentos_hoje||0}</b> hoje</span>
            <span>💬 <b style={{color:'rgba(255,255,255,.6)'}}>{mn}</b> ativas</span>
            {tma>0&&<span>⏱ <b style={{color:tma>30?'#ff4757':'rgba(255,255,255,.6)'}}>{tma}min</b></span>}
            {(d.sla_atrasadas||0)>0&&<span style={{color:'#ff4757',fontWeight:700}}>⚠️ {d.sla_atrasadas} SLA</span>}
          </div>;
        })()}
        {/* Botão modo foco — recolhe/expande sidebar */}
        {!isMobile && (
          <button onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Expandir menu' : 'Modo foco (recolher menu)'}
            style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:7,cursor:'pointer',fontSize:'.75rem',color:'rgba(255,255,255,.5)',transition:'.15s',flexShrink:0}}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(0,200,150,.08)';e.currentTarget.style.color='#00c896';e.currentTarget.style.borderColor='rgba(0,200,150,.2)';}}
            onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,.04)';e.currentTarget.style.color='rgba(255,255,255,.5)';e.currentTarget.style.borderColor='rgba(255,255,255,.08)';}}>
            <span style={{fontSize:'.85rem'}}>{sidebarCollapsed ? '▶' : '◀'}</span>
            <span>{sidebarCollapsed ? 'Expandir' : 'Modo foco'}</span>
          </button>
        )}

        {isMobile&&(
          <div style={{display:'flex',gap:3}}>
            {['list','chat','client'].map(v=>(
              <button key={v} onClick={()=>setMobileView(v)}
                style={{padding:'4px 10px',borderRadius:6,border:'none',cursor:'pointer',fontSize:'.68rem',
                  background:mobileView===v?'rgba(0,200,150,.12)':'rgba(255,255,255,.04)',
                  color:mobileView===v?'#00c896':'rgba(255,255,255,.4)'}}>
                {v==='list'?'Lista':v==='chat'?'Chat':'Cliente'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* GRID */}
      <div style={{flex:1,display:'grid',gridTemplateColumns:isMobile?'1fr':'260px 1fr 285px',overflow:'hidden',minHeight:0}}>

        {/* COL 1 — LISTA */}
        <div style={{borderRight:'1px solid rgba(255,255,255,.06)',display:isMobile&&mobileView!=='list'?'none':'flex',flexDirection:'column',overflow:'hidden'}}>
          <ConvList convs={convs} activeId={activeConv?.id} onSelect={selectConv} filtro={filtro} setFiltro={setFiltro} search={search} setSearch={setSearch}/>
        </div>

        {/* COL 2 — CHAT */}
        <div style={{display:isMobile&&mobileView!=='chat'?'none':'flex',flexDirection:'column',overflow:'hidden',position:'relative',background:'rgba(1,30,38,.5)'}}>
          {!activeConv?(
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,.12)',gap:10}}>
              <div style={{fontSize:'2.8rem'}}>💬</div>
              <div style={{fontSize:'.82rem',letterSpacing:'.3px'}}>Selecione uma conversa</div>
            </div>
          ):(
            <>
              {/* HEADER DA CONVERSA */}
              <div style={{padding:'8px 12px',borderBottom:'1px solid rgba(255,255,255,.06)',display:'flex',alignItems:'center',gap:10,flexShrink:0,background:'rgba(2,40,50,.7)'}}>
                {isMobile&&<button onClick={()=>setMobileView('list')} style={{background:'none',border:'none',color:'rgba(255,255,255,.4)',cursor:'pointer',fontSize:'1rem',padding:0,lineHeight:1}}>←</button>}
                <Avatar conv={activeConv} size={32}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
                    {activeConv.prioridade==='urgente'&&<span style={{width:6,height:6,borderRadius:'50%',background:'#ff4757',display:'inline-block',flexShrink:0}}/>}
                    <span style={{fontWeight:600,fontSize:'.85rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{activeConv.nome||activeConv.telefone}</span>
                    <span className={`badge ${st.cls}`} style={{fontSize:'.58rem',flexShrink:0}}>{st.label}</span>
                    {/* Badge de canal */}
                    {activeConv.canal&&<span style={{fontSize:'.58rem',padding:'1px 6px',borderRadius:4,flexShrink:0,fontWeight:700,
                      background: activeConv.canal==='whatsapp'?'rgba(37,211,102,.12)':activeConv.canal==='instagram'?'rgba(193,53,132,.12)':activeConv.canal==='facebook'?'rgba(24,119,242,.12)':activeConv.canal==='telegram'?'rgba(0,136,204,.12)':'rgba(255,255,255,.07)',
                      color: activeConv.canal==='whatsapp'?'#25d366':activeConv.canal==='instagram'?'#c13584':activeConv.canal==='facebook'?'#1877f2':activeConv.canal==='telegram'?'#0088cc':'rgba(255,255,255,.4)',
                    }}>
                      {activeConv.canal==='whatsapp'?'WhatsApp':activeConv.canal==='instagram'?'Instagram':activeConv.canal==='facebook'?'Facebook':activeConv.canal==='telegram'?'Telegram':activeConv.canal==='widget'?'Web Widget':activeConv.canal}
                    </span>}
                    {activeConv.tags?.map(t=><span key={t} style={{fontSize:'.58rem',background:'rgba(0,200,150,.08)',color:'#00c896',borderRadius:4,padding:'1px 5px'}}>{t}</span>)}
                  </div>
                  <div style={{fontSize:'.65rem',color:'rgba(255,255,255,.3)',fontFamily:"'JetBrains Mono',monospace"}}>{activeConv.telefone}</div>
                </div>

                {/* BOTÕES DE AÇÃO */}
                <div style={{display:'flex',gap:2,alignItems:'center',flexShrink:0,flexWrap:'wrap'}}>
                  {(activeConv.status==='ia'||activeConv.status==='aguardando')&&
                    <button className="btn btn-primary btn-xs" onClick={doAssumir} title="Assumir conversa">✋</button>}
                  {activeConv.status==='ativa'&&
                    <button className="btn btn-outline btn-xs" onClick={doDevolver} title="Devolver para IA">🤖</button>}
                  {activeConv.status==='aguardando'&&!retornoAgendado&&
                    <button className="btn btn-outline btn-xs" onClick={()=>setRetornoModal(true)} title="Agendar retorno">⏰</button>}
                  {retornoAgendado&&
                    <button className="btn btn-outline btn-xs" onClick={doCancelarRetorno} title="Cancelar retorno" style={{color:'#f5c518'}}>⏰✕</button>}
                  <div style={{width:1,height:16,background:'rgba(255,255,255,.08)',margin:'0 2px',flexShrink:0}}/>
                  <button className="btn btn-outline btn-xs" onClick={()=>salvarPrioridade(activeConv.prioridade==='urgente'?'normal':'urgente')}
                    title={activeConv.prioridade==='urgente'?'Remover urgência':'Marcar urgente'}
                    style={{opacity:activeConv.prioridade==='urgente'?1:.4}}>🔴</button>
                  <button className="btn btn-outline btn-xs" onClick={()=>setShowTags(t=>!t)} title="Gerenciar tags"
                    style={{opacity:activeConv.tags?.length?1:.4}}>🏷️</button>
                  <button className="btn btn-outline btn-xs" onClick={()=>loadHistoricoFn(activeConv.telefone)} title="Histórico do cliente">🕐</button>
                  <button className="btn btn-outline btn-xs" onClick={()=>{setNotaText('');setModal('nota');}} title="Nota interna">📝</button>
                  <button className="btn btn-outline btn-xs" onClick={doEnviarFila} title="Enviar para fila de espera">⏳</button>
                  <button className="btn btn-outline btn-xs" onClick={()=>{loadAgentes();setShowTransferAgente(t=>!t);}} title="Transferir para agente">👤</button>
                  <button className="btn btn-outline btn-xs" onClick={abrirMenuFluxo} disabled={transferindoFluxo} title="Transferir para fluxo" style={{color:'#a78bfa',borderColor:'rgba(167,139,250,.3)'}}>🔀</button>
                  {podeReabrir
                    ? <button className="btn btn-primary btn-xs" onClick={doReabrir} title="Reabrir conversa (dentro da janela 24h WhatsApp)" style={{background:'rgba(0,200,150,.15)',borderColor:'rgba(0,200,150,.3)',color:'#00c896'}}>📂 Reabrir</button>
                    : <button className="btn btn-danger btn-xs" onClick={doEncerrar} title="Encerrar conversa">✕</button>
                  }
                </div>
              </div>

              {/* DROPDOWN TAGS */}
              {showTags&&(
                <div style={{position:'absolute',top:54,right:12,zIndex:200,background:'rgba(2,38,48,.98)',border:'1px solid rgba(0,200,150,.12)',borderRadius:10,padding:12,minWidth:185,boxShadow:'0 8px 30px rgba(0,0,0,.4)',backdropFilter:'blur(8px)'}}>
                  <div style={{fontSize:'.68rem',fontWeight:700,marginBottom:8,color:'rgba(255,255,255,.4)',letterSpacing:'.5px',textTransform:'uppercase'}}>🏷️ Tags</div>
                  {['instalação','cancelamento','suporte','reclamação','financeiro','comercial','elogio'].map(tag=>{
                    const ativas=activeConv?.tags||[];
                    const ativa=ativas.includes(tag);
                    return <button key={tag} onClick={()=>salvarTags(ativa?ativas.filter(t=>t!==tag):[...ativas,tag])}
                      style={{display:'flex',alignItems:'center',gap:8,width:'100%',textAlign:'left',padding:'6px 8px',borderRadius:6,
                        background:ativa?'rgba(0,200,150,.1)':'transparent',border:'none',cursor:'pointer',
                        color:ativa?'#00c896':'rgba(255,255,255,.55)',fontSize:'.78rem',transition:'.1s'}}>
                      <div style={{width:5,height:5,borderRadius:'50%',background:ativa?'#00c896':'rgba(255,255,255,.2)',flexShrink:0}}/>
                      {tag}
                    </button>;
                  })}
                  <button onClick={()=>setShowTags(false)} style={{marginTop:6,width:'100%',padding:'4px 0',background:'none',border:'1px solid rgba(255,255,255,.07)',borderRadius:6,cursor:'pointer',fontSize:'.7rem',color:'rgba(255,255,255,.3)'}}>Fechar</button>
                </div>
              )}

              {/* DROPDOWN TRANSFERIR FLUXO */}
              {showFluxoMenu&&(
                <div style={{position:'absolute',top:54,right:12,zIndex:200,background:'rgba(2,38,48,.98)',border:'1px solid rgba(167,139,250,.2)',borderRadius:10,padding:12,minWidth:210,boxShadow:'0 8px 30px rgba(0,0,0,.4)',backdropFilter:'blur(8px)'}}>
                  <div style={{fontSize:'.68rem',fontWeight:700,marginBottom:8,color:'rgba(167,139,250,.7)',letterSpacing:'.5px',textTransform:'uppercase'}}>🔀 Transferir para fluxo</div>
                  {fluxosDisponiveis.length===0
                    ? <div style={{fontSize:'.76rem',color:'rgba(255,255,255,.3)',padding:'8px 0'}}>Nenhum fluxo publicado</div>
                    : fluxosDisponiveis.map(f=>(
                      <button key={f.id} onClick={()=>doTransferirFluxo(f.id, f.nome)}
                        style={{display:'block',width:'100%',textAlign:'left',background:'none',border:'none',color:'rgba(255,255,255,.8)',padding:'7px 8px',borderRadius:6,cursor:'pointer',fontSize:'.8rem'}}
                        onMouseEnter={e=>e.target.style.background='rgba(167,139,250,.1)'}
                        onMouseLeave={e=>e.target.style.background='none'}>
                        <span style={{color:'#a78bfa',marginRight:6}}>⬡</span>{f.nome}
                      </button>
                    ))
                  }
                  <button onClick={()=>setShowFluxoMenu(false)} style={{display:'block',width:'100%',textAlign:'center',marginTop:6,background:'none',border:'none',color:'rgba(255,255,255,.25)',fontSize:'.72rem',cursor:'pointer'}}>Cancelar</button>
                </div>
              )}

              {/* DROPDOWN TRANSFERIR AGENTE */}
              {showTransferAgente&&(
                <div style={{position:'absolute',top:54,right:12,zIndex:200,background:'rgba(2,38,48,.98)',border:'1px solid rgba(0,200,150,.12)',borderRadius:10,padding:12,minWidth:195,boxShadow:'0 8px 30px rgba(0,0,0,.4)',backdropFilter:'blur(8px)'}}>
                  <div style={{fontSize:'.68rem',fontWeight:700,marginBottom:8,color:'rgba(255,255,255,.4)',letterSpacing:'.5px',textTransform:'uppercase'}}>👤 Transferir agente</div>
                  {agentesLista.filter(a=>a.online&&String(a.id)!==String(userId)).length===0
                    ?<div style={{fontSize:'.76rem',color:'rgba(255,255,255,.3)',padding:'8px 0'}}>Nenhum agente online</div>
                    :agentesLista.filter(a=>a.online&&String(a.id)!==String(userId)).map(a=>(
                      <button key={a.id} onClick={()=>transferirParaAgente(a.id)}
                        style={{display:'flex',alignItems:'center',gap:8,width:'100%',textAlign:'left',padding:'6px 8px',borderRadius:6,border:'none',cursor:'pointer',fontSize:'.78rem',color:'rgba(255,255,255,.65)',background:'transparent',transition:'.1s'}}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(0,200,150,.06)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <div style={{width:7,height:7,borderRadius:'50%',background:'#00c896',flexShrink:0}}/>
                        {a.nome}
                        {a.pausa_atual&&<span style={{fontSize:'.62rem',color:'#f5c518',marginLeft:'auto'}}>pausa</span>}
                      </button>
                    ))
                  }
                  <button onClick={()=>setShowTransferAgente(false)} style={{marginTop:6,width:'100%',padding:'4px 0',background:'none',border:'1px solid rgba(255,255,255,.07)',borderRadius:6,cursor:'pointer',fontSize:'.7rem',color:'rgba(255,255,255,.3)'}}>Fechar</button>
                </div>
              )}

              {/* ÁREA DE MENSAGENS */}
              <div style={{flex:1,overflowY:'auto',padding:'12px 14px',display:'flex',flexDirection:'column',gap:1}}>
                {messages.map((m,idx)=>{
                  const role=m.role||(m.sender==='client'?'client':'agent');
                  const isRight=role==='ia'||role==='agente'||role==='agent';
                  const isNota=role==='nota';
                  const prevMsg=messages[idx-1];
                  const sameRole=prevMsg?.role===role;
                  const showName=!sameRole;

                  if (isNota) return (
                    <div key={m.id||idx} style={{display:'flex',justifyContent:'center',margin:'8px 0'}}>
                      <div style={{background:'rgba(245,197,24,.05)',border:'1px solid rgba(245,197,24,.1)',borderRadius:8,padding:'5px 12px',maxWidth:'78%',fontSize:'.73rem',color:'rgba(245,197,24,.65)',display:'flex',alignItems:'center',gap:6}}>
                        <span>📝</span><em style={{flex:1}}>{m.content}</em><span style={{opacity:.4,flexShrink:0,fontSize:'.6rem'}}>{fmtHora(m.ts)}</span>
                      </div>
                    </div>
                  );

                  return (
                    <div key={m.id||idx} style={{display:'flex',flexDirection:'column',alignItems:isRight?'flex-end':'flex-start',marginTop:showName?8:1}}>\
                      <div style={{position:'relative',maxWidth:'70%'}}
                        onMouseEnter={()=>{clearTimeout(window._reacaoTimer);setReacaoHover(m.id||idx);}}
                        onMouseLeave={()=>{window._reacaoTimer=setTimeout(()=>setReacaoHover(null),180);}}>

                        <div style={{padding:'8px 11px',
                          borderRadius:isRight?'12px 3px 12px 12px':'3px 12px 12px 12px',
                          background:isRight?'rgba(0,200,150,.13)':'rgba(255,255,255,.07)',
                          border:isRight?'1px solid rgba(0,200,150,.18)':'1px solid rgba(255,255,255,.07)',
                          fontSize:'.83rem',lineHeight:1.55}}>
                          <MsgContent content={m.content}/>
                          {m.reacoes?.length>0&&(
                            <div style={{marginTop:4,display:'flex',gap:3,flexWrap:'wrap'}}>
                              {m.reacoes.map((r,i)=><span key={i} style={{fontSize:'.82rem',background:'rgba(255,255,255,.07)',borderRadius:8,padding:'1px 5px'}}>{r.emoji}</span>)}
                            </div>
                          )}
                        </div>

                        {/* Picker reações */}
                        {reacaoHover===(m.id||idx)&&(
                          <div
                            onMouseEnter={()=>clearTimeout(window._reacaoTimer)}
                            onMouseLeave={()=>{window._reacaoTimer=setTimeout(()=>setReacaoHover(null),180);}}
                            style={{position:'absolute',[isRight?'right':'left']:0,bottom:'calc(100% + 3px)',display:'flex',gap:2,background:'rgba(2,38,48,.98)',border:'1px solid rgba(255,255,255,.1)',borderRadius:18,padding:'4px 8px',boxShadow:'0 4px 20px rgba(0,0,0,.5)',zIndex:10}}>
                            {EMOJIS_REACAO.map(em=>(
                              <button key={em} onClick={()=>doReacao(m.id||idx,em)}
                                style={{background:'none',border:'none',cursor:'pointer',fontSize:'1.1rem',padding:'3px 4px',borderRadius:6,transition:'.1s',lineHeight:1}}
                                onMouseEnter={e=>e.target.style.background='rgba(255,255,255,.1)'}
                                onMouseLeave={e=>e.target.style.background='none'}>{em}</button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Meta */}
                      <div style={{display:'flex',alignItems:'center',gap:5,marginTop:1,padding:'0 2px',color:'rgba(255,255,255,.22)',fontSize:'.6rem'}}>
                        {isRight&&m.status&&(()=>{
                          const ts = m.status_ts || {};
                          const fmtTs = (iso) => iso ? new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
                          const tooltip = [
                            ts.sent      ? `Enviado ${fmtTs(ts.sent)}`      : null,
                            ts.delivered ? `Entregue ${fmtTs(ts.delivered)}` : null,
                            ts.read      ? `Lido ${fmtTs(ts.read)}`          : null,
                          ].filter(Boolean).join(' · ');
                          if (m.status==='read') return (
                            <span title={tooltip||'Lido'} style={{color:'#53bdeb',cursor:'default',letterSpacing:'-1px'}}>✓✓</span>
                          );
                          if (m.status==='delivered') return (
                            <span title={tooltip||'Entregue'} style={{color:'rgba(255,255,255,.45)',cursor:'default',letterSpacing:'-1px'}}>✓✓</span>
                          );
                          return <span title={tooltip||'Enviado'} style={{color:'rgba(255,255,255,.3)',cursor:'default'}}>✓</span>;
                        })()}
                        <span>{role==='ia'?'Maxxi IA':role==='agente'||role==='agent'?(m.agenteNome||'Agente'):(activeConv?.nome||'Cliente')}</span>
                        {m.editado&&<span style={{fontSize:'.55rem',color:'rgba(255,255,255,.25)',fontStyle:'italic'}}>editado</span>}
                        <span>{fmtHora(m.ts)}</span>
                        {m.editado&&<span title={`Editado ${m.editado_em?new Date(m.editado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):''}`} style={{fontSize:'.55rem',color:'rgba(255,255,255,.25)',fontStyle:'italic'}}>editado</span>}
                        {m.id&&!isNota&&(
                          <button onClick={()=>setRespondendo(m)} title="Responder" style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.18)',fontSize:'.6rem',padding:'1px 2px',transition:'.1s'}}
                            onMouseEnter={e=>e.target.style.color='rgba(255,255,255,.55)'}
                            onMouseLeave={e=>e.target.style.color='rgba(255,255,255,.18)'}>↩</button>
                        )}
                        {m.content&&!isNota&&(
                          <button onClick={()=>doEncaminhar(m)} title="Encaminhar" style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.12)',fontSize:'.6rem',padding:'1px 2px',transition:'.1s'}}
                            onMouseEnter={e=>e.target.style.color='rgba(62,207,255,.6)'}
                            onMouseLeave={e=>e.target.style.color='rgba(255,255,255,.12)'}>⟫</button>
                        )}
                        {m.id&&<button onClick={()=>doDelete(m.id)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.12)',fontSize:'.6rem',padding:'1px 2px',transition:'.1s'}}
                          onMouseEnter={e=>e.target.style.color='rgba(255,71,87,.5)'}
                          onMouseLeave={e=>e.target.style.color='rgba(255,255,255,.12)'}>🗑</button>}
                      </div>
                    </div>
                  );
                })}

                {/* Digitando */}
                {digitando[activeConv.id]&&(
                  <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 2px',color:'rgba(255,255,255,.3)',fontSize:'.73rem'}}>
                    {[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:'50%',background:'rgba(255,255,255,.3)',animation:`bounce 1.2s ease infinite ${i*0.2}s`}}/>)}
                    <span style={{marginLeft:2,fontStyle:'italic'}}>digitando…</span>
                  </div>
                )}
                <div ref={msgsEndRef}/>
              </div>

              {/* INPUT */}
              <div style={{borderTop:'1px solid rgba(255,255,255,.06)',background:'rgba(1,30,38,.8)',flexShrink:0}}>
                {respondendo&&(
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 12px',borderBottom:'1px solid rgba(255,255,255,.05)',background:'rgba(0,200,150,.04)',fontSize:'.73rem'}}>
                    <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>
                      <span style={{color:'#00c896',fontWeight:600,marginRight:6}}>↩</span>
                      <span style={{color:'rgba(255,255,255,.4)'}}>{respondendo.content?.slice(0,65)}</span>
                    </div>
                    <button onClick={()=>setRespondendo(null)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.35)',fontSize:'.85rem',padding:'0 6px',flexShrink:0}}>✕</button>
                  </div>
                )}
                {cannedVisible&&canned.length>0&&(
                  <div style={{borderTop:'1px solid rgba(255,255,255,.06)',maxHeight:150,overflowY:'auto'}}>
                    {canned.map((r,i)=>(
                      <div key={i} onClick={()=>{setInput(r.texto);setCannedVisible(false);inputRef.current?.focus();}}
                        style={{padding:'6px 12px',cursor:'pointer',fontSize:'.78rem',background:cannedIdx===i?'rgba(0,200,150,.06)':'transparent',transition:'.1s',display:'flex',gap:10,alignItems:'center'}}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.03)'}
                        onMouseLeave={e=>e.currentTarget.style.background=cannedIdx===i?'rgba(0,200,150,.06)':'transparent'}>
                        <span style={{color:'#00c896',fontSize:'.7rem',fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>/{r.atalho}</span>
                        <span style={{color:'rgba(255,255,255,.4)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.texto}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{display:'flex',alignItems:'flex-end',gap:8,padding:'8px 10px'}}>
                  <button onClick={()=>setStickerModal(true)} title="Enviar sticker"
                    style={{width:32,height:32,borderRadius:8,border:'1px solid rgba(255,255,255,.08)',background:'rgba(255,255,255,.04)',cursor:'pointer',fontSize:'.85rem',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,.4)',transition:'.15s'}}
                    onMouseEnter={e=>{e.currentTarget.style.background='rgba(245,197,24,.1)';e.currentTarget.style.borderColor='rgba(245,197,24,.2)';}}
                    onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,.04)';e.currentTarget.style.borderColor='rgba(255,255,255,.08)';}}>
                    🎭
                  </button>
                  {/* Botão de anexar arquivo */}
                  <label title="Enviar arquivo" style={{width:32,height:32,borderRadius:8,border:`1px solid ${enviandoArquivo?'rgba(0,200,150,.3)':'rgba(255,255,255,.08)'}`,background:enviandoArquivo?'rgba(0,200,150,.1)':'rgba(255,255,255,.04)',cursor:'pointer',fontSize:'.85rem',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',color:enviandoArquivo?'#00c896':'rgba(255,255,255,.4)',transition:'.15s'}}
                    onMouseEnter={e=>{if(!enviandoArquivo){e.currentTarget.style.background='rgba(62,207,255,.1)';e.currentTarget.style.borderColor='rgba(62,207,255,.2)';}}}
                    onMouseLeave={e=>{if(!enviandoArquivo){e.currentTarget.style.background='rgba(255,255,255,.04)';e.currentTarget.style.borderColor='rgba(255,255,255,.08)';}}}> 
                    {enviandoArquivo ? '⏳' : '📎'}
                    <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" style={{display:'none'}} disabled={enviandoArquivo} onChange={e=>{if(e.target.files[0])doEnviarArquivo(e.target.files[0]);e.target.value='';}}/>
                  </label>
                  <textarea ref={inputRef} value={input}
                    onChange={e=>{handleInput(e.target.value);notificarDigitando(true);}}
                    onBlur={()=>notificarDigitando(false)}
                    onKeyDown={handleKeyDown}
                    placeholder="Mensagem… (/ para atalhos)"
                    rows={1}
                    style={{flex:1,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',borderRadius:10,padding:'8px 12px',color:'inherit',fontSize:'.83rem',resize:'none',outline:'none',lineHeight:1.5,maxHeight:110,overflowY:'auto',fontFamily:'inherit',transition:'border-color .15s'}}
                    onFocus={e=>e.target.style.borderColor='rgba(0,200,150,.25)'}
                    onBlur2={e=>e.target.style.borderColor='rgba(255,255,255,.08)'}/>
                  <button onClick={sendMsg} disabled={!input.trim()}
                    style={{width:36,height:36,borderRadius:10,border:'none',cursor:input.trim()?'pointer':'default',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.9rem',transition:'.15s',
                      background:input.trim()?'linear-gradient(135deg,#00c896,#008b87)':'rgba(255,255,255,.05)',
                      color:input.trim()?'#fff':'rgba(255,255,255,.25)',transform:input.trim()?'scale(1)':'scale(.92)'}}>➤</button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* COL 3 — PAINEL CLIENTE */}
        <div style={{borderLeft:'1px solid rgba(255,255,255,.06)',display:isMobile&&mobileView!=='client'?'none':'flex',flexDirection:'column',overflow:'hidden',background:'rgba(1,25,32,.4)'}}>
          {activeConv
            ?<ClientPanel telefone={activeConv.telefone} cpfSessao={activeConv.cpfcnpj_sessao} convId={activeConv.id} canal={canalAtivo} accountId={activeConv.account_id}/>
            :<div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,.12)',gap:8}}>
              <div style={{fontSize:'2rem',opacity:.5}}>👤</div>
              <div style={{fontSize:'.78rem'}}>Dados do cliente</div>
            </div>
          }
        </div>
      </div>

      {/* ── MODAIS ── */}
      {modal==='nota'&&(
        <Modal title="📝 Nota Interna" onClose={()=>setModal(null)}>
          <textarea value={notaText} onChange={e=>setNotaText(e.target.value)} rows={4} placeholder="Nota interna…"
            style={{width:'100%',background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:8,padding:'9px 12px',color:'inherit',fontSize:'.84rem',resize:'vertical',outline:'none',boxSizing:'border-box',marginBottom:12}}/>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-outline" style={{flex:1}} onClick={()=>setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" style={{flex:1}} onClick={doNota}>Salvar</button>
          </div>
        </Modal>
      )}

      {modal==='transferir'&&(
        <Modal title="🔄 Transferir Conversa" onClose={()=>setModal(null)}>
          <div style={{marginBottom:6,fontSize:'.78rem',color:'rgba(255,255,255,.4)'}}>Selecione o agente:</div>
          <select value={transferTarget} onChange={e=>setTransferTarget(e.target.value)}
            style={{width:'100%',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,padding:'8px 12px',color:'inherit',fontSize:'.84rem',marginBottom:14,outline:'none'}}>
            <option value="">— Escolha um agente —</option>
            {agentesLista.filter(a=>String(a.id)!==String(userId)).map(a=>(
              <option key={a.id} value={a.nome}>{a.nome}{a.online?' (online)':''}</option>
            ))}
          </select>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-outline" style={{flex:1}} onClick={()=>setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" style={{flex:1}} onClick={doTransferir}>Transferir</button>
          </div>
        </Modal>
      )}

      {encaminharModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9200,backdropFilter:'blur(4px)'}}
          onClick={e=>e.target===e.currentTarget&&setEncaminharModal(null)}>
          <div style={{background:'rgba(2,22,32,.98)',border:'1px solid rgba(62,207,255,.15)',borderRadius:12,padding:20,width:340,maxWidth:'95vw'}}>
            <div style={{fontWeight:700,marginBottom:12,fontSize:'.88rem'}}>⟫ Encaminhar mensagem</div>
            <div style={{marginBottom:12,padding:'8px 10px',background:'rgba(255,255,255,.03)',borderRadius:7,fontSize:'.75rem',color:'rgba(255,255,255,.5)',maxHeight:80,overflow:'hidden',textOverflow:'ellipsis'}}>
              {encaminharModal.content?.slice(0,120)}{encaminharModal.content?.length>120?'…':''}
            </div>
            <label style={{fontSize:'.72rem',color:'rgba(255,255,255,.4)',display:'block',marginBottom:4}}>Encaminhar para (número WhatsApp)</label>
            <input value={encaminharTel} onChange={e=>setEncaminharTel(e.target.value)}
              placeholder="5584987654321" style={{width:'100%',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:7,padding:'8px 10px',color:'inherit',fontSize:'.82rem',outline:'none',boxSizing:'border-box',marginBottom:12}}/>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setEncaminharModal(null)}
                style={{flex:1,padding:'8px',borderRadius:8,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',color:'rgba(255,255,255,.5)',cursor:'pointer',fontSize:'.8rem'}}>
                Cancelar
              </button>
              <button onClick={doEnviarEncaminhamento} disabled={!encaminharTel.trim()}
                style={{flex:2,padding:'8px',borderRadius:8,background:'rgba(62,207,255,.1)',border:'1px solid rgba(62,207,255,.25)',color:'#3ecfff',cursor:'pointer',fontSize:'.8rem',fontWeight:700}}>
                ⟫ Encaminhar
              </button>
            </div>
          </div>
        </div>
      )}

      {stickerModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9200,backdropFilter:'blur(4px)'}}
          onClick={e=>e.target===e.currentTarget&&setStickerModal(false)}>
          <div style={{background:'rgba(2,22,32,.98)',border:'1px solid rgba(245,197,24,.15)',borderRadius:12,padding:20,width:360,maxWidth:'95vw'}}>
            <div style={{fontWeight:700,marginBottom:4,fontSize:'.88rem'}}>🎭 Enviar sticker</div>
            <div style={{fontSize:'.72rem',color:'rgba(255,255,255,.35)',marginBottom:14}}>
              Stickers precisam ser WebP (≤100KB, 512×512px). Insira a URL pública ou escolha abaixo.
            </div>
            {/* URL customizada */}
            <div style={{marginBottom:14}}>
              <label style={{fontSize:'.72rem',color:'rgba(255,255,255,.4)',display:'block',marginBottom:4}}>URL de sticker personalizado (WebP)</label>
              <div style={{display:'flex',gap:6}}>
                <input id="sticker-url-input" placeholder="https://..." defaultValue=""
                  style={{flex:1,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:7,padding:'7px 10px',color:'inherit',fontSize:'.8rem',outline:'none'}}/>
                <button onClick={()=>{const u=document.getElementById('sticker-url-input').value.trim();if(u)doEnviarSticker(u);}}
                  style={{padding:'7px 12px',borderRadius:7,background:'rgba(245,197,24,.1)',border:'1px solid rgba(245,197,24,.25)',color:'#f5c518',cursor:'pointer',fontSize:'.78rem',fontWeight:700}}>
                  Enviar
                </button>
              </div>
            </div>
            {/* Stickers rápidos — reações por emoji convertidos em texto */}
            <div style={{fontSize:'.72rem',color:'rgba(255,255,255,.4)',marginBottom:8}}>Ou envie reação como mensagem:</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {['👍','✅','🎉','💚','🌐','😊','🔧','📶'].map(e=>(
                <button key={e} onClick={async()=>{
                  // Envia emoji como texto se não tiver sticker WebP
                  try { await enviarMensagem(activeConv?.id, e, userId, userName); showToast('Enviado!'); setStickerModal(false); loadConv(activeConv.id); }
                  catch(err){showToast('Erro',true);}
                }} style={{width:44,height:44,borderRadius:10,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',fontSize:22,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'.1s'}}
                  onMouseEnter={e2=>{e2.currentTarget.style.background='rgba(245,197,24,.12)';e2.currentTarget.style.borderColor='rgba(245,197,24,.25)';}}
                  onMouseLeave={e2=>{e2.currentTarget.style.background='rgba(255,255,255,.05)';e2.currentTarget.style.borderColor='rgba(255,255,255,.08)';}}>
                  {e}
                </button>
              ))}
            </div>
            <div style={{marginTop:14,textAlign:'right'}}>
              <button onClick={()=>setStickerModal(false)}
                style={{padding:'7px 16px',borderRadius:8,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',color:'rgba(255,255,255,.4)',cursor:'pointer',fontSize:'.8rem'}}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {retornoModal&&(
        <Modal title="⏰ Agendar Retorno" onClose={()=>setRetornoModal(false)}>
          <div style={{marginBottom:6,fontSize:'.78rem',color:'rgba(255,255,255,.4)'}}>Retornar em quantos minutos?</div>
          <input type="number" value={retornoMin} onChange={e=>setRetornoMin(parseInt(e.target.value)||10)} min={1} max={120}
            style={{width:'100%',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,padding:'8px 12px',color:'inherit',fontSize:'.84rem',marginBottom:14,outline:'none',boxSizing:'border-box'}}/>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-outline" style={{flex:1}} onClick={()=>setRetornoModal(false)}>Cancelar</button>
            <button className="btn btn-primary" style={{flex:1}} onClick={doAgendarRetorno}>Agendar</button>
          </div>
        </Modal>
      )}

      {showHistorico&&(
        <div style={{position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}}
          onClick={()=>setShowHistorico(false)}>
          <div style={{background:'rgba(2,38,48,.97)',border:'1px solid rgba(0,200,150,.12)',borderRadius:14,padding:20,width:490,maxWidth:'95vw',maxHeight:'80vh',overflowY:'auto'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div style={{fontWeight:700,fontSize:'.9rem'}}>🕐 Histórico de Atendimentos</div>
              <button onClick={()=>setShowHistorico(false)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.4)',fontSize:'1rem'}}>✕</button>
            </div>
            {historico.length===0
              ?<div style={{textAlign:'center',color:'rgba(255,255,255,.25)',padding:24,fontSize:'.8rem'}}>Nenhum atendimento anterior</div>
              :historico.map((h,i)=>(
                <div key={i} style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,.06)',display:'flex',justifyContent:'space-between',gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'.8rem',fontWeight:600,marginBottom:2,display:'flex',alignItems:'center',gap:6}}>
                      {h.status==='encerrada'?'✅':h.status==='aguardando'?'⏳':'💬'}
                      {new Date(h.criado_em).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})}
                      {h.agente_nome&&<span style={{color:'rgba(255,255,255,.3)',fontWeight:400,fontSize:'.72rem'}}>· {h.agente_nome}</span>}
                    </div>
                    <div style={{fontSize:'.73rem',color:'rgba(255,255,255,.38)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.ultima_msg?.slice(0,65)||'—'}</div>
                    {h.tags?.length>0&&<div style={{display:'flex',gap:3,marginTop:3,flexWrap:'wrap'}}>{h.tags.map(t=><span key={t} style={{fontSize:'.58rem',background:'rgba(0,200,150,.07)',color:'#00c896',borderRadius:3,padding:'1px 5px'}}>{t}</span>)}</div>}
                  </div>
                  <div style={{fontSize:'.68rem',color:'rgba(255,255,255,.28)',textAlign:'right',flexShrink:0}}>
                    <div>{h.total_msgs} msgs</div><div>{h.canal}</div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}
