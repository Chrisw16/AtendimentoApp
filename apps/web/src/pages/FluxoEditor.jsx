import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Panel,
  addEdge, useNodesState, useEdgesState, MarkerType,
  Handle, Position, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '../store';
import { NODE_TYPES, NODE_GROUPS, PORTA_META } from '../lib/nodeTypes';

// ── CSS OVERRIDE — apenas ajustes visuais que NÃO interferem na detecção
//    de eventos do @xyflow/react v12. Não mexer no posicionamento/transform
//    dos .react-flow__handle, pois isso quebra a hitbox de conexão na v12.
const RF_STYLE = `
  /* Cursor no nó */
  .react-flow__node {
    cursor: default !important;
  }
  .react-flow__node-fluxo:hover {
    cursor: grab !important;
  }
  /* Linha de conexão arrastando */
  .react-flow__connection-line {
    stroke: rgba(255,255,255,0.7) !important;
    stroke-width: 2 !important;
  }
  /* Edge selecionada */
  .react-flow__edge.selected .react-flow__edge-path {
    stroke: #f5c518 !important;
    stroke-width: 2.5 !important;
  }
  .react-flow__edge-path {
    cursor: pointer !important;
  }
  /* Edges padrão — azul-ciano suave */
  .react-flow__edge .react-flow__edge-path {
    stroke: rgba(62,207,255,.5) !important;
    stroke-width: 1.5px !important;
  }
  .react-flow__edge:hover .react-flow__edge-path {
    stroke: rgba(62,207,255,.85) !important;
    stroke-width: 2px !important;
  }
  .react-flow__edge.selected .react-flow__edge-path {
    stroke: #f5c518 !important;
    stroke-width: 2.5px !important;
  }
  /* Controles */
  .react-flow__controls {
    box-shadow: none !important;
  }
  .react-flow__controls button {
    background: rgba(8,14,22,.95) !important;
    border: 1px solid rgba(255,255,255,.1) !important;
    color: rgba(255,255,255,.6) !important;
    fill: rgba(255,255,255,.6) !important;
  }
  .react-flow__controls button:hover {
    background: rgba(255,255,255,.1) !important;
    color: rgba(255,255,255,.9) !important;
    fill: rgba(255,255,255,.9) !important;
  }
  .react-flow__minimap {
    border-radius: 8px !important;
    overflow: hidden !important;
    border: 1px solid rgba(255,255,255,.1) !important;
  }
  /* Background dots */
  .react-flow__background {
    background: #080C14 !important;
  }
`;

// ── VARS DISPONÍVEIS ─────────────────────────────────────────────
const VARS = [
  '{{saudacao}}','{{protocolo}}','{{cliente.nome}}','{{cliente.cpf}}',
  '{{cliente.contrato}}','{{cliente.plano}}','{{cliente.status}}',
  '{{cliente.cidade}}','{{cliente.email}}','{{boleto.valor}}',
  '{{boleto.vencimento}}','{{boleto.link}}','{{boleto.pix}}',
  '{{chamado.protocolo}}','{{promessa.dias}}','{{promessa.data}}',
  '{{localizacao_lat}}','{{localizacao_lng}}','{{resposta}}',
];

// ── ESTILOS BASE ──────────────────────────────────────────────────
const IS  = { width:'100%', background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.12)', borderRadius:6, padding:'6px 9px', color:'#fff', fontSize:12, outline:'none', fontFamily:'DM Sans,sans-serif', boxSizing:'border-box' };
const TA  = { ...IS, resize:'vertical', fontFamily:'JetBrains Mono,monospace', lineHeight:1.5 };
const LBL = { fontSize:11, color:'rgba(255,255,255,.4)', marginBottom:4, fontWeight:600, letterSpacing:'.03em', display:'block' };

function Fld({ label, hint, children }) {
  return (
    <div style={{ marginBottom:11 }}>
      {label && <span style={LBL}>{label}</span>}
      {children}
      {hint && <div style={{ fontSize:10, color:'rgba(255,255,255,.25)', marginTop:3, fontStyle:'italic' }}>{hint}</div>}
    </div>
  );
}

// ── NODE PREVIEW ──────────────────────────────────────────────────
function NodePreview({ tipo, cfg = {} }) {
  const s = { fontSize:10, color:'rgba(255,255,255,.65)', display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' };
  switch (tipo) {
    case 'inicio':          return <span style={{color:'#00E5A0',fontSize:11}}>Início do fluxo</span>;
    case 'gatilho_keyword': return <span style={{fontSize:10,color:'rgba(255,255,255,.5)'}}>{cfg.palavras?.split('\n')[0]?.slice(0,30)||'palavras-chave...'}</span>;
    case 'enviar_texto':    return <span style={s}>{cfg.texto?.slice(0,55)||<em style={{opacity:.4}}>clique para editar...</em>}</span>;
    case 'enviar_cta':      return <div><span style={s}>{cfg.corpo?.slice(0,40)||'mensagem...'}</span><span style={{fontSize:10,color:'#3ecfff',fontWeight:600}}>🔗 {cfg.label||'Botão'}</span></div>;
    case 'enviar_imagem':   return <span style={{fontSize:10,color:'#3ecfff'}}>🖼 {cfg.legenda?.slice(0,35)||cfg.url?.slice(0,35)||'imagem...'}</span>;
    case 'enviar_audio':    return <span style={{fontSize:10,color:'#3ecfff'}}>🎵 {cfg.url?.slice(0,40)||'áudio...'}</span>;
    case 'enviar_arquivo':  return <span style={{fontSize:10,color:'#3ecfff'}}>📄 {cfg.filename||'arquivo...'}</span>;
    case 'enviar_localizacao': return <span style={{fontSize:10,color:'#3ecfff'}}>📍 {cfg.nome||'localização...'}</span>;
    case 'aguardar_tempo':  return <span style={{fontSize:10,color:'#f5c518'}}>⏱ {cfg.segundos||60}s</span>;
    case 'condicao':        return <span style={{fontSize:10,color:'rgba(255,255,255,.7)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',display:'block'}}><span style={{color:'#f5c518'}}>{cfg.variavel||'var'}</span> {cfg.operador||'=='} <span style={{color:'#f5c518'}}>{cfg.valor||'valor'}</span></span>;
    case 'aguardar_resposta': return <span style={{fontSize:10}}>→ <span style={{color:'#f5c518',fontFamily:'monospace'}}>{`{{${cfg.variavel||'resposta'}}}`}</span></span>;
    case 'definir_variavel': return <span style={{fontSize:10,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',display:'block'}}><span style={{color:'#f5c518',fontFamily:'monospace'}}>{`{{${cfg.variavel||'var'}}}`}</span> = {cfg.valor?.slice(0,20)||'...'}</span>;
    case 'divisao_ab':      return <span style={{fontSize:10,color:'#f5c518'}}>A: {cfg.pct_a||50}% · B: {100-(cfg.pct_a||50)}%</span>;
    case 'condicao_multipla': return <span style={{fontSize:10,color:'#f5c518'}}>{(cfg.ramos||[]).length} condição(ões)</span>;
    case 'consultar_cliente': return <span style={{fontSize:10}}>CPF: <span style={{color:'#a78bfa',fontFamily:'monospace'}}>{'{{cliente.cpf}}'}</span></span>;
    case 'consultar_boleto':  return <span style={{fontSize:10}}>contrato: <span style={{color:'#a78bfa',fontFamily:'monospace'}}>{'{{cliente.contrato}}'}</span></span>;
    case 'verificar_status':  return <span style={{fontSize:10,color:'#f5c518',fontFamily:'monospace'}}>{'{{cliente.contrato}}'}</span>;
    case 'abrir_chamado':   return <span style={{fontSize:10}}>{cfg.descricao?.slice(0,40)||'Abrir chamado técnico'}</span>;
    case 'promessa_pagamento': return <span style={{fontSize:10}}>contrato: <span style={{color:'#a78bfa',fontFamily:'monospace'}}>{'{{cliente.contrato}}'}</span></span>;
    case 'ia_responde':     return <span style={{fontSize:10}}>contexto: <span style={{color:'#f472b6'}}>{cfg.contexto||'geral'}</span></span>;
    case 'ia_roteador': {
      const rotas = Array.isArray(cfg.rotas)?cfg.rotas:[];
      return <div><div style={{fontSize:10,color:'rgba(232,121,249,.7)',marginBottom:2}}>{cfg.mensagem?.slice(0,40)||'Posso ajudar?'}</div>{rotas.slice(0,3).map((r,i)=><div key={i} style={{fontSize:9.5,color:'rgba(255,255,255,.4)'}}>{r.label||r.id}</div>)}</div>;
    }
    case 'transferir_agente': return <span style={{fontSize:10}}>{cfg.motivo?.slice(0,40)||'Transferir para fila'}</span>;
    case 'chamada_http':    return <span style={{fontFamily:'monospace',fontSize:10,color:'#fb923c'}}>{cfg.method||'GET'} {cfg.url?.slice(0,25)||'url...'}</span>;
    case 'nota_interna':    return <span style={{fontSize:10,color:'#fb923c'}}>📝 {cfg.nota?.slice(0,40)||'nota...'}</span>;
    case 'enviar_email':    return <span style={{fontSize:10,color:'#fb923c'}}>📧 {cfg.assunto?.slice(0,35)||cfg.para||'e-mail...'}</span>;
    case 'nps_inline':      return <span style={{fontSize:10,color:'#f472b6'}}>⭐ Pesquisa NPS</span>;
    case 'encerrar':        return <span style={{fontSize:10,fontStyle:'italic',color:'rgba(255,255,255,.5)'}}>{cfg.mensagem?.slice(0,45)||'Atendimento encerrado.'}</span>;
    case 'enviar_botoes': {
      const bts = Array.isArray(cfg.botoes)?cfg.botoes:[];
      return (
        <div>
          <div style={{fontSize:10,color:'rgba(255,255,255,.5)',marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cfg.corpo?.slice(0,40)||'mensagem...'}</div>
          {bts.slice(0,3).map((b,i)=>(
            <div key={i} style={{marginBottom:3,paddingRight:14}}>
              <span style={{display:'block',fontSize:9.5,background:'rgba(62,207,255,.08)',border:'1px solid rgba(62,207,255,.2)',borderRadius:4,padding:'2px 7px',color:'rgba(255,255,255,.65)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {(typeof b==='object'?(b.label||''):(b||'')).slice(0,22)||`Botão ${i+1}`}
              </span>
            </div>
          ))}
          {cfg.ia_menu_ativo&&<div style={{fontSize:9,color:'#f472b6',fontWeight:700,marginTop:3}}>🤖 IA ativa</div>}
        </div>
      );
    }
    case 'enviar_lista': {
      const itens = Array.isArray(cfg.itens)?cfg.itens:[];
      return (
        <div>
          <div style={{fontSize:10,color:'rgba(255,255,255,.5)',marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cfg.corpo?.slice(0,40)||'mensagem...'}</div>
          {itens.slice(0,3).map((it,i)=>(
            <div key={i} style={{marginBottom:3,paddingRight:14}}>
              <span style={{display:'block',fontSize:9.5,background:'rgba(62,207,255,.08)',border:'1px solid rgba(62,207,255,.2)',borderRadius:4,padding:'2px 7px',color:'rgba(255,255,255,.65)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {(it.titulo||it.id||'item').slice(0,22)}
              </span>
            </div>
          ))}
          {cfg.ia_menu_ativo&&<div style={{fontSize:9,color:'#f472b6',fontWeight:700,marginTop:3}}>🤖 IA ativa</div>}
        </div>
      );
    }
    default: return null;
  }
}

// ── GET PORTAS ────────────────────────────────────────────────────
function getPortas(tipo, cfg = {}) {
  const def = NODE_TYPES[tipo]; if (!def) return [];
  if (tipo === 'enviar_botoes') { const bts=Array.isArray(cfg.botoes)?cfg.botoes:[]; return bts.map((b,i)=>{ const id=typeof b==='object'?(b.id||`btn_${i}`):`btn_${i}`; return {id,color:'#3ecfff',label:typeof b==='object'?(b.label||''):(b||'')}; }); }
  if (tipo === 'enviar_lista') { const itens=Array.isArray(cfg.itens)?cfg.itens:[]; if(!itens.length)return [{id:'saida',color:'#3ecfff',label:'saída'}]; return itens.map(it=>({id:it.id||(it.titulo||'').toLowerCase().replace(/\s+/g,'_')||'item',color:'#3ecfff',label:it.titulo||it.id||'item'})); }
  if (tipo === 'ia_roteador') { const rotas=Array.isArray(cfg.rotas)?cfg.rotas:[]; return [...rotas.map(r=>({id:r.id||'rota',color:'#e879f9',label:r.label||r.id})),{id:'nao_entendeu',color:'#888',label:'não entendeu'},{id:'encerrar',color:'#ff4757',label:'encerrar'}]; }
  if (tipo === 'condicao_multipla') { const ramos=Array.isArray(cfg.ramos)?cfg.ramos:[]; return [...ramos.map(r=>({id:r.porta||r.id||'ramo',color:'#f5c518',label:r.porta||r.id||'ramo'})),{id:'default',color:'#888',label:'default'}]; }
  return def.portas.map(p=>({id:p,color:PORTA_META[p]?.color||def.color,label:PORTA_META[p]?.label||p}));
}

// ── FLOW NODE — visual idêntico ao sistema de inspiração ─────────
const FlowNode = memo(({ data, selected }) => {
  const def    = NODE_TYPES[data.tipo] || { label:data.tipo, color:'#888', group:'logica', portas:['saida'] };
  const cfg    = data.config || {};
  const portas = getPortas(data.tipo, cfg);
  const isSingle = portas.length === 1 && portas[0].id === 'saida';

  // Listas inline para enviar_lista
  const itensList = data.tipo === 'enviar_lista'
    ? (Array.isArray(cfg.itens) ? cfg.itens : [])
    : [];

  return (
    <div style={{
      background: selected ? 'rgba(2,40,50,.98)' : 'rgba(2,35,45,.95)',
      border: selected ? `1.5px solid ${def.color}` : '1px solid rgba(255,255,255,.12)',
      borderRadius: 10,
      minWidth: itensList.length ? 210 : 165,
      maxWidth: itensList.length ? 260 : 220,
      boxShadow: selected ? `0 0 0 3px ${def.color}22` : 'none',
      transition: 'all .15s',
      position: 'relative',
      fontFamily: 'DM Sans, sans-serif',
    }}>

      {/* Badge alias */}
      {cfg.alias && (
        <div style={{ position:'absolute', top:-9, left:10, background:'rgba(167,139,250,.2)', border:'1px solid rgba(167,139,250,.4)', borderRadius:4, padding:'1px 6px', fontSize:8.5, fontFamily:'monospace', color:'#a78bfa', whiteSpace:'nowrap' }}>
          #{cfg.alias}
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ padding:'8px 12px', borderBottom:'1px solid rgba(255,255,255,.07)', display:'flex', alignItems:'center', gap:7 }}>
        <div style={{ width:7, height:7, borderRadius:'50%', background:def.color, flexShrink:0 }}/>
        <span style={{ fontSize:10, fontWeight:700, color:def.color, textTransform:'uppercase', letterSpacing:'.06em' }}>{def.label}</span>
      </div>

      {/* ── PREVIEW ── */}
      <div style={{ padding:'7px 12px', fontSize:11, color:'rgba(255,255,255,.55)', lineHeight:1.5, overflow:'hidden' }}>
        <NodePreview tipo={data.tipo} cfg={cfg}/>
      </div>

      {/* Handle entrada */}
      {data.tipo !== 'inicio' && (
        <Handle
          type="target"
          position={Position.Left}
          id="entrada"
          style={{ width:10, height:10, background:'rgba(255,255,255,.2)', border:'1.5px solid rgba(255,255,255,.4)', left:-5, borderRadius:'50%' }}
        />
      )}

      {/* ── HANDLES SAÍDA ── */}
      {isSingle ? (
        // Saída única: Handle no meio-direito, sem seção extra
        <Handle
          type="source"
          position={Position.Right}
          id="saida"
          style={{ width:10, height:10, background:def.color, border:'2px solid rgba(2,35,45,.95)', right:-5, borderRadius:'50%' }}
        />
      ) : portas.length > 0 ? (
        // Portas de saída — formato idêntico ao sistema de inspiração que funciona.
        // Cada porta é uma row com position:relative; o Handle é absolute dentro dela.
        <div style={{ borderTop:'1px solid rgba(255,255,255,.06)', padding:'4px 0 3px' }}>
          {portas.map((p) => (
            <div key={p.id} style={{
              display:'flex', alignItems:'center', justifyContent:'flex-end',
              padding:'2px 20px 2px 10px', position:'relative', minHeight:20,
            }}>
              {p.label && (
                <span style={{
                  fontSize:9.5, color:'rgba(255,255,255,.38)', marginRight:7,
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                  maxWidth:140, textAlign:'right',
                }}>{p.label}</span>
              )}
              <div style={{ width:6, height:6, borderRadius:'50%', background:p.color, flexShrink:0 }}/>
              <Handle
                type="source"
                position={Position.Right}
                id={p.id}
                style={{
                  position:'absolute', right:-5, top:'50%',
                  transform:'translateY(-50%)',
                  width:10, height:10,
                  background:p.color,
                  border:'2px solid rgba(2,35,45,.95)',
                  borderRadius:'50%',
                  cursor:'crosshair',
                }}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});
FlowNode.displayName = 'FlowNode';

// IMPORTANTE: fora do componente para não recriar a cada render
const NODE_TYPES_MAP = { fluxo: FlowNode };

// ── PROPS PANEL ───────────────────────────────────────────────────
function PropsPanel({ node, onChange, onDelete }) {
  if (!node) return null;
  const def = NODE_TYPES[node.data.tipo] || {};
  const cfg = node.data.config || {};
  const set = (k, v) => onChange({ ...node.data, config:{ ...cfg, [k]:v } });
  const bts = Array.isArray(cfg.botoes)?cfg.botoes:[];

  return (
    <div style={{width:270,background:'rgba(6,10,18,.98)',border:'1px solid rgba(255,255,255,.1)',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 8px 32px rgba(0,0,0,.6)'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,.08)'}}>
        <div style={{width:8,height:8,borderRadius:'50%',background:def.color||'#888',flexShrink:0}}/>
        <span style={{fontSize:13,fontWeight:700,color:def.color||'#fff',flex:1}}>{def.label||node.data.tipo}</span>
        <button onClick={()=>onDelete(node.id)} style={{background:'rgba(255,71,87,.12)',border:'1px solid rgba(255,71,87,.2)',color:'#ff4757',borderRadius:6,padding:'2px 8px',fontSize:11,cursor:'pointer'}}>Excluir</button>
      </div>
      <div style={{padding:12,overflowY:'auto',flex:1,maxHeight:'calc(100vh - 160px)'}}>

        {node.data.tipo==='gatilho_keyword'&&<><Fld label="Palavras-chave (uma por linha)" hint="O cliente digita isso para ativar"><textarea value={cfg.palavras||''} onChange={e=>set('palavras',e.target.value)} rows={4} placeholder={'boleto\nsuporte\ncancelar'} style={TA}/></Fld><Fld label="Tipo"><select value={cfg.exato!==false?'exato':'contem'} onChange={e=>set('exato',e.target.value==='exato')} style={{...IS,cursor:'pointer'}}><option value="exato">Exato</option><option value="contem">Contém</option></select></Fld></>}

        {node.data.tipo==='enviar_texto'&&<Fld label="Texto" hint="Use {{variavel}} para valores dinâmicos"><textarea value={cfg.texto||''} onChange={e=>set('texto',e.target.value)} rows={5} placeholder="Olá {{cliente.nome}}! Como posso ajudar?" style={TA}/></Fld>}

        {node.data.tipo==='enviar_cta'&&<><Fld label="Corpo"><textarea value={cfg.corpo||''} onChange={e=>set('corpo',e.target.value)} rows={3} placeholder="Acesse sua fatura 👇" style={TA}/></Fld><Fld label="Texto do botão (máx 20)"><input value={cfg.label||''} onChange={e=>set('label',e.target.value.slice(0,20))} placeholder="Ver fatura" style={IS} maxLength={20}/></Fld><Fld label="URL"><input value={cfg.url||''} onChange={e=>set('url',e.target.value)} placeholder="https://..." style={IS}/></Fld><Fld label="Rodapé"><input value={cfg.rodape||''} onChange={e=>set('rodape',e.target.value.slice(0,60))} placeholder="Sua empresa" style={IS}/></Fld></>}

        {node.data.tipo==='enviar_botoes'&&<><Fld label="Mensagem"><textarea value={cfg.corpo||''} onChange={e=>set('corpo',e.target.value)} rows={2} placeholder="Como posso te ajudar?" style={TA}/></Fld><Fld label="Botões (máx 3)">{bts.map((b,i)=><div key={i} style={{display:'flex',gap:6,marginBottom:5}}><input value={typeof b==='object'?(b.label||''):String(b)} onChange={e=>{const nb=[...bts];nb[i]={label:e.target.value,id:e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')};set('botoes',nb);}} placeholder={`Botão ${i+1}`} style={IS}/><button onClick={()=>{const nb=[...bts];nb.splice(i,1);set('botoes',nb);}} style={{background:'none',border:'none',color:'#ff4757',cursor:'pointer',fontSize:15,padding:'0 4px',flexShrink:0}}>×</button></div>)}{bts.length<3&&<button onClick={()=>set('botoes',[...bts,{label:'',id:''}])} style={{width:'100%',padding:'6px 0',background:'rgba(62,207,255,.08)',border:'1px dashed rgba(62,207,255,.3)',borderRadius:6,color:'#3ecfff',fontSize:11,cursor:'pointer'}}>+ Adicionar botão</button>}</Fld><Fld label=""><label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',padding:'8px 10px',background:cfg.ia_menu_ativo?'rgba(244,114,182,.08)':'rgba(255,255,255,.03)',border:`1px solid ${cfg.ia_menu_ativo?'rgba(244,114,182,.3)':'rgba(255,255,255,.08)'}`,borderRadius:7}}><div onClick={()=>set('ia_menu_ativo',!cfg.ia_menu_ativo)} style={{width:32,height:18,borderRadius:9,background:cfg.ia_menu_ativo?'#f472b6':'rgba(255,255,255,.1)',position:'relative',transition:'.2s',flexShrink:0,cursor:'pointer'}}><div style={{position:'absolute',top:2,left:cfg.ia_menu_ativo?16:2,width:14,height:14,borderRadius:'50%',background:'#fff',transition:'.2s'}}/></div><div><div style={{fontSize:11,fontWeight:700,color:cfg.ia_menu_ativo?'#f472b6':'rgba(255,255,255,.5)'}}>🤖 IA no menu</div><div style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>Responde texto livre</div></div></label></Fld></>}

        {node.data.tipo==='enviar_lista'&&<><Fld label="Mensagem"><textarea value={cfg.corpo||''} onChange={e=>set('corpo',e.target.value)} rows={2} placeholder="Selecione uma opção:" style={TA}/></Fld><Fld label="Label do botão"><input value={cfg.label_botao||''} onChange={e=>set('label_botao',e.target.value)} placeholder="Ver opções" style={IS}/></Fld><Fld label="Itens" hint="ID = porta de saída">{(()=>{const itens=Array.isArray(cfg.itens)?cfg.itens:[];const setI=arr=>set('itens',arr);return(<>{itens.map((it,i)=><div key={i} style={{display:'flex',gap:4,marginBottom:5,alignItems:'center'}}><input value={it.id||''} onChange={e=>{const n=[...itens];n[i]={...it,id:e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')};setI(n);}} placeholder="id" style={{...IS,width:80,fontFamily:'monospace',fontSize:10,flex:'0 0 80px'}}/><input value={it.titulo||''} onChange={e=>{const n=[...itens];n[i]={...it,titulo:e.target.value};setI(n);}} placeholder="Título" style={{...IS,flex:1,fontSize:10.5}}/><button onClick={()=>setI(itens.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'#ff4757',cursor:'pointer',fontSize:14,padding:'0 3px'}}>×</button></div>)}<button onClick={()=>setI([...itens,{id:'',titulo:''}])} style={{width:'100%',padding:'5px 0',background:'rgba(62,207,255,.05)',border:'1px dashed rgba(62,207,255,.25)',borderRadius:5,color:'#3ecfff',fontSize:11,cursor:'pointer'}}>+ Adicionar item</button></>);})()}</Fld></>}

        {node.data.tipo==='enviar_imagem'&&<><Fld label="URL da imagem"><input value={cfg.url||''} onChange={e=>set('url',e.target.value)} placeholder="https://..." style={IS}/></Fld><Fld label="Legenda"><input value={cfg.legenda||''} onChange={e=>set('legenda',e.target.value)} placeholder="Legenda" style={IS}/></Fld></>}

        {node.data.tipo==='enviar_audio'&&<Fld label="URL do áudio" hint="OGG/Opus para melhor compatibilidade"><input value={cfg.url||''} onChange={e=>set('url',e.target.value)} placeholder="https://..." style={IS}/></Fld>}

        {node.data.tipo==='enviar_arquivo'&&<><Fld label="URL"><input value={cfg.url||''} onChange={e=>set('url',e.target.value)} placeholder="https://..." style={IS}/></Fld><Fld label="Nome do arquivo"><input value={cfg.filename||''} onChange={e=>set('filename',e.target.value)} placeholder="documento.pdf" style={IS}/></Fld></>}

        {node.data.tipo==='enviar_localizacao'&&<><Fld label="Nome"><input value={cfg.nome||''} onChange={e=>set('nome',e.target.value)} placeholder="Escritório" style={IS}/></Fld><Fld label="Endereço"><input value={cfg.address||''} onChange={e=>set('address',e.target.value)} placeholder="Rua X, 123" style={IS}/></Fld><div style={{display:'flex',gap:8}}><Fld label="Latitude"><input value={cfg.lat||''} onChange={e=>set('lat',e.target.value)} placeholder="-5.79" style={IS}/></Fld><Fld label="Longitude"><input value={cfg.lng||''} onChange={e=>set('lng',e.target.value)} placeholder="-35.21" style={IS}/></Fld></div></>}

        {node.data.tipo==='aguardar_resposta'&&<><Fld label="Mensagem (opcional)"><textarea value={cfg.mensagem||''} onChange={e=>set('mensagem',e.target.value)} rows={2} placeholder="Qual é o seu CPF?" style={TA}/></Fld><Fld label="Salvar resposta em" hint={`Disponível como {{${cfg.variavel||'resposta'}}}`}><input value={cfg.variavel||''} onChange={e=>set('variavel',e.target.value)} placeholder="resposta" style={IS}/></Fld><Fld label="Máx. tentativas"><input type="number" min={1} max={10} value={cfg.max_tentativas||3} onChange={e=>set('max_tentativas',parseInt(e.target.value)||3)} style={{...IS,width:80}}/></Fld></>}

        {node.data.tipo==='condicao'&&<><Fld label="Variável"><input value={cfg.variavel||''} onChange={e=>set('variavel',e.target.value)} placeholder="cliente.status" style={IS}/></Fld><Fld label="Operador"><select value={cfg.operador||'=='} onChange={e=>set('operador',e.target.value)} style={{...IS,cursor:'pointer'}}>{['==','!=','>','<','contem','nao_contem','vazio','nao_vazio'].map(op=><option key={op} value={op}>{op}</option>)}</select></Fld><Fld label="Valor"><input value={cfg.valor||''} onChange={e=>set('valor',e.target.value)} placeholder="ativo" style={IS}/></Fld></>}

        {node.data.tipo==='condicao_multipla'&&<><div style={{fontSize:10.5,color:'rgba(255,255,255,.45)',marginBottom:8,lineHeight:1.6}}>Verifica em ordem. Primeira que bater define a saída. Se nenhuma → <em>default</em>.</div>{(cfg.ramos||[]).map((r,i)=><div key={i} style={{padding:'8px',border:'1px solid rgba(255,255,255,.08)',borderRadius:7,marginBottom:6}}><div style={{display:'flex',gap:6,marginBottom:6}}><input value={r.variavel||''} onChange={e=>{const rs=[...(cfg.ramos||[])];rs[i]={...r,variavel:e.target.value};set('ramos',rs);}} placeholder="variavel" style={{...IS,flex:1,fontSize:11}}/><select value={r.operador||'=='} onChange={e=>{const rs=[...(cfg.ramos||[])];rs[i]={...r,operador:e.target.value};set('ramos',rs);}} style={{...IS,width:80,fontSize:11}}>{['==','!=','>','<','contem','nao_contem','vazio','nao_vazio'].map(op=><option key={op} value={op}>{op}</option>)}</select><input value={r.valor||''} onChange={e=>{const rs=[...(cfg.ramos||[])];rs[i]={...r,valor:e.target.value};set('ramos',rs);}} placeholder="valor" style={{...IS,flex:1,fontSize:11}}/></div><div style={{display:'flex',gap:6,alignItems:'center'}}><span style={{fontSize:10,color:'rgba(255,255,255,.4)'}}>porta:</span><input value={r.porta||`ramo${i+1}`} onChange={e=>{const rs=[...(cfg.ramos||[])];rs[i]={...r,porta:e.target.value};set('ramos',rs);}} style={{...IS,flex:1,fontSize:11,fontFamily:'monospace'}}/><button onClick={()=>set('ramos',(cfg.ramos||[]).filter((_,j)=>j!==i))} style={{background:'rgba(255,71,87,.15)',border:'1px solid rgba(255,71,87,.3)',color:'#ff4757',borderRadius:5,padding:'2px 8px',cursor:'pointer',fontSize:11}}>✕</button></div></div>)}<button onClick={()=>set('ramos',[...(cfg.ramos||[]),{variavel:'',operador:'==',valor:'',porta:`ramo${(cfg.ramos||[]).length+1}`}])} style={{width:'100%',padding:'6px',border:'1px dashed rgba(255,255,255,.2)',borderRadius:7,background:'transparent',color:'rgba(255,255,255,.5)',cursor:'pointer',fontSize:12}}>+ Adicionar condição</button></>}

        {node.data.tipo==='definir_variavel'&&<><Fld label="Variável"><input value={cfg.variavel||''} onChange={e=>set('variavel',e.target.value)} placeholder="minha_variavel" style={IS}/></Fld><Fld label="Valor"><input value={cfg.valor||''} onChange={e=>set('valor',e.target.value)} placeholder="{{resposta}}" style={IS}/></Fld></>}

        {node.data.tipo==='aguardar_tempo'&&<Fld label="Aguardar (segundos)" hint="60=1min · 300=5min · 3600=1h"><input type="number" min={5} max={86400} value={cfg.segundos||60} onChange={e=>set('segundos',parseInt(e.target.value))} style={IS}/></Fld>}

        {node.data.tipo==='divisao_ab'&&<Fld label={`% para variante A — B recebe ${100-(cfg.pct_a||50)}%`}><input type="number" min={1} max={99} value={cfg.pct_a||50} onChange={e=>set('pct_a',parseInt(e.target.value))} style={IS}/></Fld>}

        {node.data.tipo==='consultar_cliente'&&<><Fld label="Pergunta para CPF (opcional)" hint="Se vazio, usa {{cliente.cpf}} já disponível"><textarea value={cfg.pergunta||''} onChange={e=>set('pergunta',e.target.value)} rows={2} placeholder="Qual o seu CPF ou CNPJ?" style={TA}/></Fld><Fld label="Máx. tentativas"><input type="number" min={1} max={10} value={cfg.max_tentativas||3} onChange={e=>set('max_tentativas',parseInt(e.target.value)||3)} style={{...IS,width:80}}/></Fld><Fld label="Mensagem quando não encontrado"><textarea value={cfg.mensagem_erro||''} onChange={e=>set('mensagem_erro',e.target.value)} rows={2} placeholder="CPF não encontrado. Tente novamente." style={TA}/></Fld><div style={{padding:'8px',background:'rgba(62,207,255,.05)',borderRadius:6,border:'1px solid rgba(62,207,255,.12)',fontSize:10.5,color:'rgba(255,255,255,.5)',lineHeight:1.7}}><b style={{color:'rgba(62,207,255,.7)'}}>Saídas:</b><br/><span style={{color:'#00c896'}}>●</span> encontrado · <span style={{color:'#3ecfff'}}>●</span> múltiplos_contratos · <span style={{color:'#ff4757'}}>●</span> max_tentativas</div></>}

        {node.data.tipo==='consultar_boleto'&&<><Fld label="ID do contrato"><input value={cfg.contrato||''} onChange={e=>set('contrato',e.target.value)} placeholder="{{cliente.contrato}}" style={IS}/></Fld><Fld label="Mensagem do boleto" hint="{{boleto.valor}}, {{boleto.vencimento}}, {{boleto.link}}, {{boleto.pix}}"><textarea value={cfg.mensagem_boleto||''} onChange={e=>set('mensagem_boleto',e.target.value)} rows={4} placeholder={'📄 Valor: R$ {{boleto.valor}}\n📅 Venc: {{boleto.vencimento}}\n🔗 {{boleto.link}}'} style={TA}/></Fld><Fld label="Mensagem sem boleto"><textarea value={cfg.mensagem_sem_boleto||''} onChange={e=>set('mensagem_sem_boleto',e.target.value)} rows={2} placeholder="✅ Nenhum boleto em aberto!" style={TA}/></Fld></>}

        {node.data.tipo==='verificar_status'&&<><Fld label="Contrato (fixo)"><div style={{padding:'6px 9px',background:'rgba(245,197,24,.08)',border:'1px solid rgba(245,197,24,.2)',borderRadius:6,fontSize:12,fontFamily:'monospace',color:'#f5c518'}}>{'{{cliente.contrato}}'}</div></Fld><div style={{fontSize:10,color:'rgba(245,197,24,.7)',fontWeight:700,marginBottom:6}}>Saídas por status:</div>{[{id:'ativo',color:'#00c896',label:'1 — Ativo'},{id:'inativo',color:'#ff4757',label:'2 — Inativo'},{id:'cancelado',color:'#ff6b35',label:'3 — Cancelado'},{id:'suspenso',color:'#f5c518',label:'4 — Suspenso'},{id:'inviabilidade',color:'#888',label:'5 — Inviab. técnica'},{id:'novo',color:'#3ecfff',label:'6 — Novo'},{id:'reduzido',color:'#a78bfa',label:'7 — V. Reduzida'}].map(s=><div key={s.id} style={{display:'flex',alignItems:'center',gap:7,marginBottom:4,padding:'4px 8px',background:'rgba(255,255,255,.02)',borderRadius:5}}><div style={{width:7,height:7,borderRadius:'50%',background:s.color}}/><span style={{fontSize:11,color:'rgba(255,255,255,.7)'}}>{s.label}</span></div>)}</>}

        {node.data.tipo==='abrir_chamado'&&<><Fld label="Tipo de chamado"><input value={cfg.tipo_id||''} onChange={e=>set('tipo_id',e.target.value)} placeholder="5 = Outros" style={IS}/></Fld><Fld label="Descrição"><textarea value={cfg.descricao||''} onChange={e=>set('descricao',e.target.value)} rows={2} placeholder="Chamado aberto via WhatsApp" style={TA}/></Fld></>}

        {node.data.tipo==='promessa_pagamento'&&<><Fld label="Mensagem de sucesso" hint="{{promessa.dias}}, {{promessa.data}}, {{promessa.protocolo}}"><textarea value={cfg.mensagem_sucesso||''} onChange={e=>set('mensagem_sucesso',e.target.value)} rows={4} placeholder={'✅ Promessa registrada!\n\nAcesso liberado por {{promessa.dias}} dias.\n📅 Pague até: {{promessa.data}}'} style={TA}/></Fld><Fld label="Mensagem adimplente"><textarea value={cfg.mensagem_adimplente||''} onChange={e=>set('mensagem_adimplente',e.target.value)} rows={2} placeholder="✅ Contrato em dia!" style={TA}/></Fld><Fld label="Mensagem de erro"><textarea value={cfg.mensagem_erro||''} onChange={e=>set('mensagem_erro',e.target.value)} rows={2} placeholder="❌ Não foi possível registrar." style={TA}/></Fld></>}

        {node.data.tipo==='listar_planos'&&<Fld label="Cidade" hint="Preenche: planos.lista"><input value={cfg.cidade||''} onChange={e=>set('cidade',e.target.value)} placeholder="{{cliente.cidade}}" style={IS}/></Fld>}

        {node.data.tipo==='ia_responde'&&<><Fld label="Contexto/assunto"><input value={cfg.contexto||''} onChange={e=>set('contexto',e.target.value)} placeholder="suporte, comercial, geral..." style={IS}/></Fld><Fld label="Instrução extra"><textarea value={cfg.prompt||''} onChange={e=>set('prompt',e.target.value)} rows={3} placeholder="O cliente já está identificado. Ajude com suporte técnico." style={TA}/></Fld><Fld label="Modelo"><select value={cfg.modelo||'haiku'} onChange={e=>set('modelo',e.target.value)} style={{...IS,cursor:'pointer'}}><option value="haiku">⚡ Claude Haiku — rápido</option><option value="sonnet">🧠 Claude Sonnet — capaz</option></select></Fld><Fld label="Máx. turnos" hint="Após este número → porta max_turnos"><input type="number" value={cfg.max_turns||5} onChange={e=>set('max_turns',parseInt(e.target.value)||5)} style={{...IS,width:80}}/></Fld><div style={{padding:'8px',background:'rgba(244,114,182,.05)',borderRadius:6,border:'1px solid rgba(244,114,182,.12)',fontSize:10.5,color:'rgba(255,255,255,.5)',lineHeight:1.7}}><b style={{color:'rgba(244,114,182,.8)'}}>Saídas:</b><br/><span style={{color:'#00c896'}}>●</span> resolvido · <span style={{color:'#ff6b35'}}>●</span> transferir · <span style={{color:'#f5c518'}}>●</span> max_turnos</div></>}

        {node.data.tipo==='ia_roteador'&&(()=>{const rotas=Array.isArray(cfg.rotas)?cfg.rotas:[];const setR=r=>set('rotas',r);return(<><Fld label="Mensagem inicial"><textarea value={cfg.mensagem||''} onChange={e=>set('mensagem',e.target.value)} rows={2} placeholder="Posso te ajudar com mais alguma coisa? 😊" style={TA}/></Fld><Fld label="Rotas (intenções)" hint="Cada rota = uma porta de saída">{rotas.map((r,i)=><div key={i} style={{marginBottom:8,padding:'8px',background:'rgba(232,121,249,.05)',borderRadius:7,border:'1px solid rgba(232,121,249,.15)'}}><div style={{display:'flex',gap:5,marginBottom:5}}><div style={{flex:1}}><div style={{fontSize:9.5,color:'rgba(255,255,255,.3)',marginBottom:2}}>ID da porta</div><input value={r.id||''} onChange={e=>{const n=[...rotas];n[i]={...n[i],id:e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')};setR(n);}} placeholder="boleto" style={{...IS,fontSize:11,fontFamily:'monospace'}}/></div><div style={{flex:2}}><div style={{fontSize:9.5,color:'rgba(255,255,255,.3)',marginBottom:2}}>Label</div><input value={r.label||''} onChange={e=>{const n=[...rotas];n[i]={...n[i],label:e.target.value};setR(n);}} placeholder="2ª via de boleto" style={{...IS,fontSize:11}}/></div><button onClick={()=>{const n=[...rotas];n.splice(i,1);setR(n);}} style={{background:'none',border:'none',color:'#ff4757',cursor:'pointer',fontSize:15,padding:'0 4px',flexShrink:0,alignSelf:'flex-end',marginBottom:2}}>×</button></div><div style={{fontSize:9.5,color:'rgba(255,255,255,.3)',marginBottom:2}}>Descrição para a IA</div><input value={r.descricao||''} onChange={e=>{const n=[...rotas];n[i]={...n[i],descricao:e.target.value};setR(n);}} placeholder="quando o cliente quer ver ou pagar boleto" style={{...IS,fontSize:10.5}}/></div>)}<button onClick={()=>setR([...rotas,{id:'',label:'',descricao:''}])} style={{width:'100%',padding:'6px 0',background:'rgba(232,121,249,.06)',border:'1px dashed rgba(232,121,249,.3)',borderRadius:6,color:'#e879f9',fontSize:11,cursor:'pointer'}}>+ Adicionar rota</button></Fld></>);})()}

        {node.data.tipo==='transferir_agente'&&<><Fld label="Motivo"><textarea value={cfg.motivo||''} onChange={e=>set('motivo',e.target.value)} rows={2} placeholder="Cliente solicitou atendimento humano" style={TA}/></Fld><Fld label="Fila (opcional)" hint="Vazio = fila geral"><input value={cfg.fila||''} onChange={e=>set('fila',e.target.value)} placeholder="Suporte, Financeiro..." style={IS}/></Fld><Fld label="Mensagem fora do horário"><textarea value={cfg.msg_fora||''} onChange={e=>set('msg_fora',e.target.value)} rows={2} placeholder="Atendemos seg-sex 8h-18h." style={TA}/></Fld><Fld label="Mensagem sem agente"><textarea value={cfg.msg_sem_agente||''} onChange={e=>set('msg_sem_agente',e.target.value)} rows={2} placeholder="Todos ocupados. Retornamos em breve!" style={TA}/></Fld></>}

        {node.data.tipo==='chamada_http'&&<><div style={{display:'flex',gap:6,marginBottom:10}}><select value={cfg.method||'GET'} onChange={e=>set('method',e.target.value)} style={{...IS,width:75,fontSize:11}}>{['GET','POST','PUT','PATCH'].map(m=><option key={m} value={m}>{m}</option>)}</select><input value={cfg.url||''} onChange={e=>set('url',e.target.value)} placeholder="https://api.exemplo.com" style={{...IS,flex:1}}/></div>{(cfg.method||'GET')!=='GET'&&<Fld label="Corpo (JSON)"><textarea value={cfg.body||''} onChange={e=>set('body',e.target.value)} rows={3} placeholder={'{"cpf":"{{cliente.cpf}}"}'} style={{...TA,fontFamily:'monospace',fontSize:11}}/></Fld>}<Fld label="Salvar resposta em" hint="Use {{http_resposta}} nos próximos nós"><input value={cfg.variavel||'http_resposta'} onChange={e=>set('variavel',e.target.value)} style={{...IS,fontFamily:'monospace'}}/></Fld></>}

        {node.data.tipo==='nota_interna'&&<Fld label="Nota interna"><textarea value={cfg.nota||''} onChange={e=>set('nota',e.target.value)} rows={3} placeholder="Informação relevante..." style={TA}/></Fld>}

        {node.data.tipo==='enviar_email'&&<><Fld label="Para"><input value={cfg.para||''} onChange={e=>set('para',e.target.value)} placeholder="{{cliente.email}}" style={IS}/></Fld><Fld label="Assunto"><input value={cfg.assunto||''} onChange={e=>set('assunto',e.target.value)} placeholder="Sua solicitação" style={IS}/></Fld><Fld label="Corpo"><textarea value={cfg.corpo||''} onChange={e=>set('corpo',e.target.value)} rows={4} placeholder="Olá {{cliente.nome}},..." style={TA}/></Fld></>}

        {node.data.tipo==='nps_inline'&&<Fld label="Pergunta"><textarea value={cfg.pergunta||''} onChange={e=>set('pergunta',e.target.value)} rows={2} placeholder="De 1 a 10, qual nota você dá ao nosso atendimento? ⭐" style={TA}/></Fld>}

        {node.data.tipo==='solicitar_localizacao'&&<><Fld label="Mensagem de solicitação"><textarea value={cfg.mensagem||''} onChange={e=>set('mensagem',e.target.value)} rows={4} placeholder={'📍 Para verificar a cobertura:\n1️⃣ Envie sua localização GPS\n2️⃣ Ou informe seu CEP'} style={TA}/></Fld><Fld label="Salvar endereço em"><input value={cfg.variavel||''} onChange={e=>set('variavel',e.target.value)} placeholder="endereco_cliente" style={IS}/></Fld></>}

        {node.data.tipo==='encerrar'&&<Fld label="Mensagem final"><textarea value={cfg.mensagem||''} onChange={e=>set('mensagem',e.target.value)} rows={2} placeholder="Obrigado pelo contato! 😊" style={TA}/></Fld>}

        {/* Alias */}
        {node.data.tipo!=='inicio'&&<div style={{marginTop:10,padding:'8px',background:'rgba(167,139,250,.05)',borderRadius:7,border:'1px solid rgba(167,139,250,.12)'}}><div style={{fontSize:10,color:'rgba(167,139,250,.8)',fontWeight:700,marginBottom:4,textTransform:'uppercase'}}>Alias (roteamento automático)</div><input value={cfg.alias||''} onChange={e=>set('alias',e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''))} placeholder="ex: boleto, suporte" style={{...IS,fontFamily:'monospace',fontSize:11}}/><div style={{fontSize:9.5,color:'rgba(255,255,255,.25)',marginTop:3,lineHeight:1.5}}>Porta com mesmo ID do alias roteia aqui automaticamente.</div></div>}

        {/* Variáveis */}
        <div style={{marginTop:12,padding:8,background:'rgba(255,255,255,.04)',borderRadius:7,border:'1px solid rgba(255,255,255,.06)'}}>
          <div style={{fontSize:10,color:'rgba(255,255,255,.3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6,fontWeight:600}}>Variáveis disponíveis</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:3}}>{VARS.map(v=><button key={v} onClick={()=>navigator.clipboard?.writeText(v)} style={{fontSize:9.5,color:'rgba(255,255,255,.4)',fontFamily:'monospace',background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:4,padding:'1px 6px',cursor:'pointer'}} title="Copiar">{v}</button>)}</div>
          <div style={{fontSize:9,color:'rgba(255,255,255,.2)',marginTop:5}}>Clique para copiar</div>
        </div>
      </div>
    </div>
  );
}

// ── PALETA LATERAL ────────────────────────────────────────────────
function NodePalette() {
  const onDragStart = (e, tipo) => {
    e.dataTransfer.setData('application/reactflow', tipo);
    e.dataTransfer.effectAllowed = 'move';
  };
  const groups = {};
  Object.entries(NODE_TYPES).forEach(([tipo,def])=>{ if(!groups[def.group])groups[def.group]=[]; groups[def.group].push({tipo,...def}); });
  return (
    <div style={{width:185,background:'rgba(2,8,16,.98)',borderRight:'1px solid rgba(255,255,255,.07)',padding:'10px 8px',overflowY:'auto',display:'flex',flexDirection:'column',flexShrink:0}}>
      <div style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,.3)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10,paddingLeft:4}}>Nós</div>
      {Object.entries(NODE_GROUPS).map(([grpKey,grp])=>{
        const items=groups[grpKey]||[]; if(!items.length)return null;
        return (
          <div key={grpKey} style={{marginBottom:8}}>
            <div style={{fontSize:9.5,color:grp.color,textTransform:'uppercase',letterSpacing:'.08em',fontWeight:700,margin:'4px 4px 5px',display:'flex',alignItems:'center',gap:4}}>
              <div style={{flex:1,height:1,background:`${grp.color}33`}}/>{grp.label}<div style={{flex:1,height:1,background:`${grp.color}33`}}/>
            </div>
            {items.map(({tipo,label,color})=>(
              <div key={tipo} draggable onDragStart={e=>onDragStart(e,tipo)}
                style={{display:'flex',alignItems:'center',gap:7,padding:'5px 8px',borderRadius:6,border:'1px solid rgba(255,255,255,.06)',background:'rgba(255,255,255,.02)',marginBottom:3,cursor:'grab',userSelect:'none',transition:'border-color .1s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=color+'66'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,.06)'}>
                <div style={{width:6,height:6,borderRadius:'50%',background:color,flexShrink:0}}/>
                <span style={{fontSize:10.5,color:'rgba(255,255,255,.65)',fontWeight:500}}>{label}</span>
              </div>
            ))}
          </div>
        );
      })}
      <div style={{marginTop:4,padding:'7px 6px',background:'rgba(255,255,255,.02)',borderRadius:6,border:'1px dashed rgba(255,255,255,.08)',fontSize:9.5,color:'rgba(255,255,255,.25)',textAlign:'center',lineHeight:1.5}}>Arraste para o canvas</div>
    </div>
  );
}

// ── CANVAS INTERNO (usa hooks do ReactFlow) ───────────────────────
function FluxoCanvas({ id }) {
  const navigate      = useNavigate();
  const toast         = useStore(s => s.toast);
  const qc            = useQueryClient();
  const { screenToFlowPosition } = useReactFlow();
  const reactFlowWrapper = useRef(null);
  const uploadRef     = useRef(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode]  = useState(null);
  const [selectedEdge, setSelectedEdge]  = useState(null);
  const [fluxo,   setFluxo]   = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  // Carrega fluxo
  useEffect(() => {
    if (!id || id === 'novo') { setLoaded(true); return; }
    const token = JSON.parse(localStorage.getItem('maxxi-store') || '{}')?.state?.token || '';
    fetch(`/api/fluxos/${id}`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r => r.json())
      .then(f => {
        setFluxo(f);
        const d = typeof f.dados === 'string' ? JSON.parse(f.dados || '{}') : (f.dados || {});
        const ns = (d.nodes || []).map(n => ({
          id: n.id, type: 'fluxo',
          position: { x: n.posX || 0, y: n.posY || 0 },
          data: { tipo: n.tipo, config: n.config || {} },
        }));
        const es = (d.edges || []).map(e => ({
          id: `e-${e.from}-${e.to}-${e.port || ''}`,
          source: e.from, target: e.to,
          sourceHandle: e.port || 'saida',
          targetHandle: 'entrada',
          markerEnd: { type: MarkerType.ArrowClosed, width:12, height:12, color:'rgba(255,255,255,.35)' },
          style: { stroke:'rgba(255,255,255,.25)', strokeWidth:1.5 },
        }));
        setNodes(ns);
        setEdges(es);
        setLoaded(true);
      })
      .catch(() => { toast('Erro ao carregar fluxo', 'error'); setLoaded(true); });
  }, [id]);

  const buildDados = useCallback(() => ({
    nodes: nodes.map(n => ({ id:n.id, tipo:n.data.tipo, config:n.data.config||{}, posX:Math.round(n.position.x), posY:Math.round(n.position.y) })),
    edges: edges.map(e => ({ from:e.source, to:e.target, ...(e.sourceHandle && e.sourceHandle !== 'saida' ? {port:e.sourceHandle} : {}) })),
  }), [nodes, edges]);

  const salvar = useCallback(async () => {
    setSaving(true);
    try {
      // Lê token do store Zustand (salvo em maxxi-store, não maxxi_token)
      let token = '';
      try {
        const raw = localStorage.getItem('maxxi-store');
        if (raw) token = JSON.parse(raw)?.state?.token || '';
      } catch {}
      const dados  = buildDados();
      const body   = JSON.stringify({ nome: fluxo?.nome || 'Novo fluxo', gatilho: fluxo?.gatilho || 'nova_conversa', dados, ativo: fluxo?.ativo || false });
      const url    = id && id !== 'novo' ? `/api/fluxos/${id}` : '/api/fluxos';
      const method = id && id !== 'novo' ? 'PUT' : 'POST';
      const r      = await fetch(url, { method, headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body });
      const saved  = await r.json();
      if (!r.ok) throw new Error(saved.error || 'Erro ao salvar');
      setFluxo(saved);
      toast('Fluxo salvo!', 'success');
      qc.invalidateQueries({ queryKey: ['fluxos'] });
      if (id === 'novo') navigate(`/fluxos/${saved.id}`, { replace:true });
    } catch(err) { toast(err.message, 'error'); }
    setSaving(false);
  }, [id, fluxo, buildDados, navigate, toast, qc]);

  // Auto-layout (BFS)
  const autoLayout = useCallback(() => {
    if (!nodes.length) return;
    const W=220, H=100, GX=60, GY=80;
    const ch={}, pa={};
    nodes.forEach(n=>{ ch[n.id]=[]; pa[n.id]=[]; });
    edges.forEach(e=>{ ch[e.source]?.push(e.target); pa[e.target]?.push(e.source); });
    const roots=nodes.filter(n=>!pa[n.id]?.length).map(n=>n.id);
    if(!roots.length) roots.push(nodes[0].id);
    const layer={}, q=roots.map(r=>({id:r,d:0})), vis=new Set();
    while(q.length){ const {id,d}=q.shift(); if(vis.has(id))continue; vis.add(id); layer[id]=Math.max(layer[id]??0,d); (ch[id]||[]).forEach(c=>q.push({id:c,d:d+1})); }
    const maxL=Math.max(0,...Object.values(layer));
    nodes.forEach(n=>{ if(layer[n.id]==null)layer[n.id]=maxL+1; });
    const byL={};
    Object.entries(layer).forEach(([id,l])=>{ if(!byL[l])byL[l]=[]; byL[l].push(id); });
    const pos={};
    Object.entries(byL).forEach(([l,ids])=>{ const tw=ids.length*W+(ids.length-1)*GX; const sx=-tw/2; ids.forEach((id,i)=>{ pos[id]={x:sx+i*(W+GX),y:Number(l)*(H+GY)}; }); });
    setNodes(ns=>ns.map(n=>({...n,position:pos[n.id]??n.position})));
  }, [nodes, edges, setNodes]);

  // Conexões
  const onConnect = useCallback(params => {
    setEdges(es => addEdge({
      ...params,
      targetHandle: 'entrada',
      markerEnd: { type:MarkerType.ArrowClosed, width:12, height:12, color:'rgba(255,255,255,.35)' },
      style: { stroke:'rgba(255,255,255,.25)', strokeWidth:1.5 },
    }, es));
  }, [setEdges]);

  // Drop de nó
  const onDrop = useCallback(e => {
    e.preventDefault();
    const tipo = e.dataTransfer.getData('application/reactflow');
    if (!tipo) return;
    const rect = reactFlowWrapper.current.getBoundingClientRect();
    const pos  = screenToFlowPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setNodes(ns => [...ns, { id:`n_${Date.now()}`, type:'fluxo', position:pos, data:{ tipo, config:{} } }]);
  }, [screenToFlowPosition, setNodes]);

  const onDragOver = useCallback(e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  const onNodeClick  = useCallback((_,n) => setSelectedNode(n), []);
  const onEdgeClick  = useCallback((_,e) => {
    setEdges(es => es.map(ed => ed.id === e.id
      ? { ...ed, style:{ stroke:'#f5c518', strokeWidth:2.5 }, selected:true }
      : { ...ed, style:{ stroke:'rgba(255,255,255,.25)', strokeWidth:1.5 }, selected:false }
    ));
    setSelectedEdge(e.id);
  }, [setEdges]);
  const onPaneClick  = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setEdges(es => es.map(e => ({ ...e, style:{ stroke:'rgba(255,255,255,.25)', strokeWidth:1.5 }, selected:false })));
  }, [setEdges]);

  const updateNode = useCallback(data => {
    if (!selectedNode) return;
    setNodes(ns => ns.map(n => n.id===selectedNode.id ? {...n,data} : n));
    setSelectedNode(p => p ? {...p,data} : p);
  }, [selectedNode, setNodes]);

  const deleteNode = useCallback(nodeId => {
    const nid = typeof nodeId==='string' ? nodeId : selectedNode?.id;
    if (!nid) return;
    setNodes(ns => ns.filter(n => n.id !== nid));
    setEdges(es => es.filter(e => e.source !== nid && e.target !== nid));
    if (selectedNode?.id === nid) setSelectedNode(null);
  }, [selectedNode, setNodes, setEdges]);

  // Teclado
  useEffect(() => {
    const fn = e => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNode) deleteNode(selectedNode.id);
        else if (selectedEdge) { setEdges(es=>es.filter(ed=>ed.id!==selectedEdge)); setSelectedEdge(null); }
      }
      if ((e.ctrlKey||e.metaKey) && e.key==='s') { e.preventDefault(); salvar(); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [selectedNode, selectedEdge, deleteNode, salvar, setEdges]);

  // Export/Import
  const baixar = () => {
    const blob = new Blob([JSON.stringify({_maxxi_fluxo:true, nome:fluxo?.nome||'fluxo', dados:buildDados()},null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`fluxo_${(fluxo?.nome||'novo').replace(/[^a-z0-9]/gi,'_').toLowerCase()}.json`; a.click(); URL.revokeObjectURL(a.href);
    toast('Exportado!','success');
  };
  const importar = e => {
    const file=e.target.files?.[0]; if(!file)return;
    const r=new FileReader();
    r.onload=ev=>{
      try {
        const obj=JSON.parse(ev.target.result);
        const d=obj._maxxi_fluxo?obj.dados:obj;
        if(!d?.nodes||!Array.isArray(d.nodes)){toast('Arquivo inválido','error');return;}
        if(!window.confirm(`Importar "${obj.nome||file.name}"? Vai substituir o fluxo atual.`))return;
        setNodes(d.nodes.map(n=>({id:n.id,type:'fluxo',position:{x:n.posX||0,y:n.posY||0},data:{tipo:n.tipo,config:n.config||{}}})));
        setEdges((d.edges||[]).map(e=>({id:`e-${e.from}-${e.to}-${e.port||''}`,source:e.from,target:e.to,sourceHandle:e.port||'saida',targetHandle:'entrada',style:{stroke:'rgba(62,207,255,.5)',strokeWidth:1.5},type:'smoothstep'})));
        if(obj.nome)setFluxo(f=>({...f,nome:obj.nome}));
        toast('Importado! Clique em Salvar.','success');
      } catch(err){toast('Erro: '+err.message,'error');}
    };
    r.readAsText(file); e.target.value='';
  };

  if (!loaded) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',background:'#060a10',color:'rgba(255,255,255,.4)'}}>Carregando...</div>;

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'#060a10'}}>
      {/* CSS override injetado */}
      <style>{RF_STYLE}</style>

      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'0 14px',height:46,background:'rgba(2,8,16,.98)',borderBottom:'1px solid rgba(255,255,255,.07)',flexShrink:0}}>
        <button onClick={()=>navigate('/fluxos')} style={{background:'none',border:'none',color:'rgba(255,255,255,.4)',cursor:'pointer',fontSize:12,padding:'4px 8px',borderRadius:5,whiteSpace:'nowrap'}}>← Fluxos</button>
        <div style={{width:1,height:18,background:'rgba(255,255,255,.1)'}}/>
        <input value={fluxo?.nome||''} onChange={e=>setFluxo(f=>({...f,nome:e.target.value}))} style={{background:'none',border:'none',color:'#fff',fontSize:14,fontWeight:600,outline:'none',minWidth:180,fontFamily:'inherit'}} placeholder="Nome do fluxo"/>
        {fluxo?.ativo&&<span style={{fontSize:10,background:'rgba(0,229,160,.12)',color:'#00E5A0',border:'1px solid rgba(0,229,160,.22)',borderRadius:12,padding:'2px 8px',fontWeight:700,whiteSpace:'nowrap'}}>● ATIVO</span>}
        <div style={{flex:1}}/>
        <span style={{fontSize:10,color:'rgba(255,255,255,.2)',whiteSpace:'nowrap'}}>{nodes.length} nós · Ctrl+S · Del</span>
        <input ref={uploadRef} type="file" accept=".json" onChange={importar} style={{display:'none'}}/>
        <button onClick={autoLayout} style={{padding:'5px 10px',borderRadius:6,border:'1px solid rgba(62,207,255,.2)',background:'rgba(62,207,255,.06)',color:'#3ecfff',fontSize:11,cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>⚡ Organizar</button>
        <button onClick={()=>uploadRef.current?.click()} style={{padding:'5px 10px',borderRadius:6,border:'1px solid rgba(245,197,24,.25)',background:'rgba(245,197,24,.07)',color:'#f5c518',fontSize:11,cursor:'pointer',fontWeight:600}}>📂 Importar</button>
        <button onClick={baixar} style={{padding:'5px 10px',borderRadius:6,border:'1px solid rgba(167,139,250,.25)',background:'rgba(167,139,250,.07)',color:'#a78bfa',fontSize:11,cursor:'pointer',fontWeight:600}}>📤 Exportar</button>
        <button onClick={salvar} disabled={saving} style={{padding:'5px 16px',borderRadius:6,border:'none',background:saving?'rgba(255,255,255,.08)':'linear-gradient(135deg,#00E5A0,#00a875)',color:saving?'#aaa':'#021a12',fontSize:11,cursor:saving?'not-allowed':'pointer',fontWeight:700,whiteSpace:'nowrap'}}>
          {saving?'Salvando...':'💾 Salvar'}
        </button>
      </div>

      {/* Canvas area */}
      <div style={{flex:1,display:'flex',overflow:'hidden'}}>
        <NodePalette/>
        <div ref={reactFlowWrapper} style={{flex:1,position:'relative',overflow:'hidden'}}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            nodeTypes={NODE_TYPES_MAP}
            deleteKeyCode={null}
            connectionRadius={30}
            snapToGrid={false}
            connectionLineStyle={{ stroke:'rgba(255,255,255,0.7)', strokeWidth:2, strokeDasharray:'5 3' }}
            connectionLineType="smoothstep"
            defaultEdgeOptions={{
              type: 'smoothstep',
              markerEnd: { type:MarkerType.ArrowClosed, width:14, height:14, color:'rgba(255,255,255,.4)' },
              style: { stroke:'rgba(255,255,255,.3)', strokeWidth:1.8 },
            }}
            style={{ background:'#080C14' }}
            minZoom={0.2}
            maxZoom={2}
            fitView
            fitViewOptions={{ padding:0.25 }}
          >
            {/* Barra de ação de edge selecionado */}
            {selectedEdge && (
              <Panel position="top-center">
                <div style={{background:'rgba(4,10,20,.95)',border:'1px solid rgba(245,197,24,.4)',borderRadius:8,padding:'6px 14px',display:'flex',alignItems:'center',gap:12,fontSize:12,color:'rgba(255,255,255,.8)',boxShadow:'0 4px 16px rgba(0,0,0,.5)'}}>
                  <span>Conexão selecionada</span>
                  <button onClick={()=>{setEdges(es=>es.filter(e=>e.id!==selectedEdge));setSelectedEdge(null);}} style={{background:'rgba(255,71,87,.15)',border:'1px solid rgba(255,71,87,.4)',borderRadius:5,color:'#ff4757',padding:'3px 10px',cursor:'pointer',fontSize:11,fontWeight:700}}>× Apagar</button>
                  <button onClick={onPaneClick} style={{background:'none',border:'1px solid rgba(255,255,255,.1)',borderRadius:5,color:'rgba(255,255,255,.4)',padding:'3px 8px',cursor:'pointer',fontSize:11}}>Cancelar</button>
                </div>
              </Panel>
            )}

            <Background color="rgba(255,255,255,.03)" gap={24} size={1}/>
            <Controls style={{background:'rgba(4,10,20,.9)',border:'1px solid rgba(255,255,255,.1)',borderRadius:8}}/>
            <MiniMap
              style={{background:'rgba(4,10,20,.9)',border:'1px solid rgba(255,255,255,.1)',borderRadius:8}}
              nodeColor={n=>NODE_TYPES[n.data?.tipo]?.color||'#444'}
              maskColor="rgba(4,10,20,.75)"
            />

            {nodes.length===0&&(
              <Panel position="top-center">
                <div style={{marginTop:100,background:'rgba(4,10,20,.9)',border:'1px dashed rgba(255,255,255,.12)',borderRadius:12,padding:'28px 40px',textAlign:'center',color:'rgba(255,255,255,.35)',fontSize:13,pointerEvents:'none'}}>
                  <div style={{fontSize:28,marginBottom:10}}>✦</div>
                  <div style={{fontWeight:600,marginBottom:4}}>Canvas vazio</div>
                  <div style={{fontSize:11}}>Arraste um nó da paleta esquerda para começar</div>
                  <div style={{fontSize:10,marginTop:6,color:'rgba(255,255,255,.2)'}}>Comece com o nó <strong style={{color:'#00E5A0'}}>Início</strong></div>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Painel propriedades */}
        {selectedNode&&(
          <div style={{padding:10,background:'rgba(4,10,18,.98)',borderLeft:'1px solid rgba(255,255,255,.07)',overflowY:'auto',flexShrink:0}}>
            <PropsPanel node={selectedNode} onChange={updateNode} onDelete={deleteNode}/>
          </div>
        )}
      </div>
    </div>
  );
}

// ── WRAPPER com ReactFlowProvider ─────────────────────────────────
export default function FluxoEditor() {
  const { id } = useParams();
  return (
    <ReactFlowProvider>
      <FluxoCanvas id={id} />
    </ReactFlowProvider>
  );
}
