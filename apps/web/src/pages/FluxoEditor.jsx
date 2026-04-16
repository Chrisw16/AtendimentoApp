import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  addEdge, useNodesState, useEdgesState, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from '../lib/api';
import { useStore } from '../store';
import { NODE_TYPES, NODE_GROUPS, PORTA_META } from '../lib/nodeTypes';
import { Handle, Position } from '@xyflow/react';

// ── VARS DISPONÍVEIS ─────────────────────────────────────────────
const VARS = [
  '{{saudacao}}','{{protocolo}}','{{cliente.nome}}','{{cliente.cpf}}',
  '{{cliente.contrato}}','{{cliente.plano}}','{{cliente.status}}',
  '{{cliente.cidade}}','{{cliente.email}}','{{boleto.valor}}',
  '{{boleto.vencimento}}','{{boleto.link}}','{{boleto.pix}}',
  '{{chamado.protocolo}}','{{promessa.dias}}','{{promessa.data}}',
  '{{localizacao_lat}}','{{localizacao_lng}}','{{resposta}}',
];

// ── ESTILOS GLOBAIS ───────────────────────────────────────────────
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
  switch (tipo) {
    case 'inicio':          return <span style={{ color:'#00E5A0',fontSize:11 }}>Início do fluxo</span>;
    case 'gatilho_keyword': return <span style={{ fontSize:10,color:'rgba(255,255,255,.5)' }}>{cfg.palavras?.split('\n')[0]?.slice(0,30)||'palavras-chave...'}</span>;
    case 'enviar_texto':    return <span style={{ fontSize:10,color:'rgba(255,255,255,.65)',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{cfg.texto?.slice(0,55)||<em style={{opacity:.4}}>clique para editar...</em>}</span>;
    case 'enviar_cta':      return <div><span style={{ fontSize:10,color:'rgba(255,255,255,.5)',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{cfg.corpo?.slice(0,40)||'mensagem...'}</span><span style={{ fontSize:10,color:'#3ecfff',fontWeight:600 }}>🔗 {cfg.label||'Botão com link'}</span></div>;
    case 'enviar_imagem':   return <span style={{ fontSize:10,color:'#3ecfff' }}>🖼 {cfg.legenda?.slice(0,35)||cfg.url?.slice(0,35)||'imagem...'}</span>;
    case 'enviar_audio':    return <span style={{ fontSize:10,color:'#3ecfff' }}>🎵 {cfg.url?.slice(0,40)||'áudio...'}</span>;
    case 'enviar_arquivo':  return <span style={{ fontSize:10,color:'#3ecfff' }}>📄 {cfg.filename||'arquivo...'}</span>;
    case 'enviar_localizacao': return <span style={{ fontSize:10,color:'#3ecfff' }}>📍 {cfg.nome||'localização...'}</span>;
    case 'aguardar_tempo':  return <span style={{ fontSize:10,color:'#f5c518' }}>⏱ {cfg.segundos||60}s</span>;
    case 'condicao':        return <span style={{ fontSize:10,color:'rgba(255,255,255,.7)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',display:'block' }}><span style={{color:'#f5c518'}}>{cfg.variavel||'var'}</span>{' '}{cfg.operador||'=='}{' '}<span style={{color:'#f5c518'}}>{cfg.valor||'valor'}</span></span>;
    case 'aguardar_resposta': return <span style={{fontSize:10}}>salvar → <span style={{color:'#f5c518',fontFamily:'monospace'}}>{`{{${cfg.variavel||'resposta'}}}`}</span></span>;
    case 'definir_variavel': return <span style={{fontSize:10,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',display:'block'}}><span style={{color:'#f5c518',fontFamily:'monospace'}}>{`{{${cfg.variavel||'var'}}}`}</span>{' = '}{cfg.valor?.slice(0,20)||'...'}</span>;
    case 'divisao_ab':      return <span style={{fontSize:10,color:'#f5c518'}}>A: {cfg.pct_a||50}% · B: {100-(cfg.pct_a||50)}%</span>;
    case 'condicao_multipla': return <span style={{fontSize:10,color:'#f5c518'}}>{(cfg.ramos||[]).length} condição(ões)</span>;
    case 'consultar_cliente': return <span style={{fontSize:10}}>CPF: <span style={{color:'#a78bfa',fontFamily:'monospace'}}>{'{{cliente.cpf}}'}</span></span>;
    case 'consultar_boleto':  return <span style={{fontSize:10}}>contrato: <span style={{color:'#a78bfa',fontFamily:'monospace'}}>{'{{cliente.contrato}}'}</span></span>;
    case 'verificar_status':  return <span style={{fontSize:10,color:'#f5c518',fontFamily:'monospace'}}>{'{{cliente.contrato}}'}</span>;
    case 'abrir_chamado':   return <span style={{fontSize:10}}>{cfg.descricao?.slice(0,40)||'Abrir chamado técnico'}</span>;
    case 'promessa_pagamento': return <span style={{fontSize:10}}>contrato: <span style={{color:'#a78bfa',fontFamily:'monospace'}}>{'{{cliente.contrato}}'}</span></span>;
    case 'listar_planos':   return <span style={{fontSize:10}}>cidade: <span style={{color:'#a78bfa',fontFamily:'monospace'}}>{cfg.cidade||'{{cliente.cidade}}'}</span></span>;
    case 'ia_responde':     return <span style={{fontSize:10}}>contexto: <span style={{color:'#f472b6'}}>{cfg.contexto||'geral'}</span></span>;
    case 'ia_roteador': {
      const rotas = Array.isArray(cfg.rotas) ? cfg.rotas : [];
      return (
        <div>
          <div style={{fontSize:10,color:'rgba(232,121,249,.7)',marginBottom:3}}>{cfg.mensagem?.slice(0,45)||'Posso ajudar em mais algo?'}</div>
          {rotas.slice(0,3).map((r,i)=><div key={i} style={{fontSize:9.5,color:'rgba(255,255,255,.45)',display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:2}}><span>{r.label||r.id}</span><span style={{width:5,height:5,borderRadius:'50%',background:'#e879f9',display:'inline-block'}}/></div>)}
          {rotas.length>3&&<div style={{fontSize:9,color:'rgba(255,255,255,.3)'}}>+{rotas.length-3} rotas</div>}
        </div>
      );
    }
    case 'transferir_agente': return <span style={{fontSize:10}}>{cfg.motivo?.slice(0,40)||'Transferir para fila'}</span>;
    case 'chamada_http':    return <span style={{fontFamily:'monospace',fontSize:10,color:'#fb923c'}}>{cfg.method||'GET'} {cfg.url?.slice(0,28)||'url...'}</span>;
    case 'nota_interna':    return <span style={{fontSize:10,color:'#fb923c'}}>📝 {cfg.nota?.slice(0,40)||'nota...'}</span>;
    case 'enviar_email':    return <span style={{fontSize:10,color:'#fb923c'}}>📧 {cfg.assunto?.slice(0,35)||cfg.para||'e-mail...'}</span>;
    case 'nps_inline':      return <span style={{fontSize:10,color:'#f472b6'}}>⭐ Pesquisa de satisfação</span>;
    case 'encerrar':        return <span style={{fontSize:10,fontStyle:'italic',color:'rgba(255,255,255,.5)'}}>{cfg.mensagem?.slice(0,45)||'Atendimento encerrado.'}</span>;
    case 'enviar_botoes': {
      const bts = Array.isArray(cfg.botoes) ? cfg.botoes : [];
      return (
        <div>
          <div style={{fontSize:10,color:'rgba(255,255,255,.5)',marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cfg.corpo?.slice(0,40)||'mensagem...'}</div>
          {bts.slice(0,3).map((b,i)=><div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:2,paddingRight:18}}><span style={{fontSize:9.5,background:'rgba(62,207,255,.08)',border:'1px solid rgba(62,207,255,.15)',borderRadius:4,padding:'1px 7px',color:'rgba(255,255,255,.6)'}}>{(typeof b==='object'?(b.label||''):(b||'')).slice(0,20)||`Botão ${i+1}`}</span><div style={{width:5,height:5,borderRadius:'50%',background:'#3ecfff',flexShrink:0,marginLeft:5}}/></div>)}
          {cfg.ia_menu_ativo&&<div style={{marginTop:3,fontSize:9,color:'#f472b6',fontWeight:700}}>🤖 IA ativa</div>}
        </div>
      );
    }
    case 'enviar_lista': {
      const itens = Array.isArray(cfg.itens) ? cfg.itens : typeof cfg.itens === 'string' ? cfg.itens.split('\n').filter(Boolean).map(l=>{ const [id,...r]=l.split('|'); return { id:id.trim(), titulo:r.join('|').trim() }; }) : [];
      return (
        <div>
          <div style={{marginBottom:4,color:'rgba(255,255,255,.55)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',fontSize:10}}>{cfg.corpo?.slice(0,40)||<em style={{opacity:.4}}>mensagem...</em>}</div>
          {itens.slice(0,4).map((it,i)=><div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:2,paddingRight:18}}><span style={{fontSize:9.5,background:'rgba(62,207,255,.08)',border:'1px solid rgba(62,207,255,.15)',borderRadius:4,padding:'1px 7px',color:'rgba(255,255,255,.6)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:140,flex:1}}>{(it.titulo||it.id||'item').slice(0,25)}</span><div style={{width:5,height:5,borderRadius:'50%',background:'#3ecfff',flexShrink:0,marginLeft:5}}/></div>)}
          {cfg.ia_menu_ativo&&<div style={{marginTop:3,fontSize:9,color:'#f472b6',fontWeight:700}}>🤖 IA ativa</div>}
        </div>
      );
    }
    default: return null;
  }
}

// ── GET PORTAS ────────────────────────────────────────────────────
function getPortas(tipo, cfg = {}) {
  const def = NODE_TYPES[tipo];
  if (!def) return [];
  if (tipo === 'enviar_botoes') {
    const bts = Array.isArray(cfg.botoes) ? cfg.botoes : [];
    return bts.map((b,i)=>{ const id=typeof b==='object'?(b.id||`btn_${i}`):`btn_${i}`; return { id, color:'#3ecfff', label:typeof b==='object'?(b.label||''):(b||'') }; });
  }
  if (tipo === 'enviar_lista') {
    const itens = Array.isArray(cfg.itens) ? cfg.itens : typeof cfg.itens==='string' ? cfg.itens.split('\n').filter(Boolean).map(l=>{ const [id,...r]=l.split('|'); return { id:id.trim(), titulo:r.join('|').trim() }; }) : [];
    if (!itens.length) return [{ id:'saida', color:'#3ecfff', label:'' }];
    return itens.map(it=>({ id:it.id||(it.titulo||'').toLowerCase().replace(/\s+/g,'_')||'item', color:'#3ecfff', label:it.titulo||it.id||'item' }));
  }
  if (tipo === 'ia_roteador') {
    const rotas = Array.isArray(cfg.rotas) ? cfg.rotas : [];
    return [...rotas.map(r=>({ id:r.id||'rota', color:'#e879f9', label:r.label||r.id })), { id:'nao_entendeu', color:'#888', label:'não entendeu' }, { id:'encerrar', color:'#ff4757', label:'encerrar' }];
  }
  if (tipo === 'condicao_multipla') {
    const ramos = Array.isArray(cfg.ramos) ? cfg.ramos : [];
    return ramos.map(r=>({ id:r.porta||r.id||'ramo', color:'#f5c518', label:r.porta||r.id||'ramo' }));
  }
  return def.portas.map(p=>({ id:p, color:PORTA_META[p]?.color||def.color, label:PORTA_META[p]?.label||p }));
}

// ── FLOW NODE ─────────────────────────────────────────────────────
function FlowNode({ data, selected }) {
  const def    = NODE_TYPES[data.tipo] || { label:data.tipo, color:'#888', group:'logica', portas:['saida'] };
  const portas = getPortas(data.tipo, data.config||{});
  const isSingle = portas.length===1 && portas[0].id==='saida';

  return (
    <div style={{
      background:'rgba(8,14,22,.97)', border:`1.5px solid ${selected ? def.color : 'rgba(255,255,255,.1)'}`,
      borderRadius:10, minWidth:165, maxWidth:230,
      boxShadow: selected ? `0 0 0 2px ${def.color}33` : '0 4px 16px rgba(0,0,0,.5)',
      fontFamily:'DM Sans,sans-serif', fontSize:12, color:'rgba(255,255,255,.85)',
    }}>
      {/* Header */}
      <div style={{ padding:'7px 10px 6px', borderBottom:'1px solid rgba(255,255,255,.06)', display:'flex', alignItems:'center', gap:6 }}>
        <div style={{ width:7, height:7, borderRadius:'50%', background:def.color, flexShrink:0 }}/>
        <span style={{ fontSize:10, fontWeight:700, color:def.color, textTransform:'uppercase', letterSpacing:'.06em' }}>{def.label}</span>
      </div>
      {/* Preview */}
      <div style={{ padding:'6px 10px 7px', minHeight:22 }}>
        <NodePreview tipo={data.tipo} cfg={data.config||{}}/>
      </div>
      {/* Handle entrada */}
      {data.tipo !== 'inicio' && (
        <Handle type="target" position={Position.Left} style={{ width:10, height:10, background:'rgba(255,255,255,.2)', border:'1.5px solid rgba(255,255,255,.4)', left:-5 }}/>
      )}
      {/* Saídas */}
      {isSingle ? (
        <Handle type="source" position={Position.Right} id="saida" style={{ width:10, height:10, background:def.color, border:'2px solid rgba(8,14,22,.95)', right:-5 }}/>
      ) : portas.length > 0 ? (
        <div style={{ borderTop:'1px solid rgba(255,255,255,.06)', paddingTop:3, paddingBottom:3 }}>
          {portas.map((p,i) => (
            <div key={p.id} style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', padding:'2px 20px 2px 10px', position:'relative', minHeight:20 }}>
              {p.label && <span style={{ fontSize:9.5, color:'rgba(255,255,255,.38)', marginRight:7, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:140, textAlign:'right' }}>{p.label}</span>}
              <div style={{ width:6, height:6, borderRadius:'50%', background:p.color, flexShrink:0 }}/>
              <Handle type="source" position={Position.Right} id={p.id} style={{ position:'absolute', right:-5, top:'50%', transform:'translateY(-50%)', width:10, height:10, background:p.color, border:'2px solid rgba(8,14,22,.95)' }}/>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
const nodeTypes = { fluxo: FlowNode };

// ── PROPS PANEL ───────────────────────────────────────────────────
function PropsPanel({ node, onChange, onDelete }) {
  if (!node) return null;
  const def   = NODE_TYPES[node.data.tipo] || {};
  const cfg   = node.data.config || {};
  const set   = (k, v) => onChange({ ...node.data, config:{ ...cfg, [k]:v } });
  const bts   = Array.isArray(cfg.botoes) ? cfg.botoes : [];

  return (
    <div style={{ width:270, background:'rgba(6,12,20,.98)', border:'1px solid rgba(255,255,255,.1)', borderRadius:12, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,.6)' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:def.color||'#888', flexShrink:0 }}/>
        <span style={{ fontSize:13, fontWeight:700, color:def.color||'#fff', flex:1 }}>{def.label||node.data.tipo}</span>
        <button onClick={()=>onDelete(node.id)} style={{ background:'rgba(255,71,87,.12)', border:'1px solid rgba(255,71,87,.2)', color:'#ff4757', borderRadius:6, padding:'2px 8px', fontSize:11, cursor:'pointer' }}>Excluir</button>
      </div>
      {/* Body */}
      <div style={{ padding:12, overflowY:'auto', flex:1, maxHeight:'calc(100vh - 160px)' }}>

        {node.data.tipo === 'gatilho_keyword' && (
          <>
            <Fld label="Palavras-chave (uma por linha)" hint="O cliente digita isso para ativar este nó de qualquer ponto">
              <textarea value={cfg.palavras||''} onChange={e=>set('palavras',e.target.value)} rows={4} placeholder={'boleto\nsuporte\ncancelar\n2a via'} style={TA}/>
            </Fld>
            <Fld label="Tipo de comparação">
              <select value={cfg.exato!==false?'exato':'contem'} onChange={e=>set('exato',e.target.value==='exato')} style={{...IS,cursor:'pointer'}}>
                <option value="exato">Exato — mensagem igual à palavra</option>
                <option value="contem">Contém — palavra aparece na mensagem</option>
              </select>
            </Fld>
          </>
        )}

        {node.data.tipo === 'enviar_texto' && (
          <Fld label="Texto da mensagem" hint="Use {{variavel}} para valores dinâmicos">
            <textarea value={cfg.texto||''} onChange={e=>set('texto',e.target.value)} rows={5} placeholder="Olá {{cliente.nome}}! Como posso ajudar?" style={TA}/>
          </Fld>
        )}

        {node.data.tipo === 'enviar_cta' && (
          <>
            <Fld label="Mensagem (corpo)"><textarea value={cfg.corpo||''} onChange={e=>set('corpo',e.target.value)} rows={3} placeholder="Clique abaixo para acessar sua fatura 👇" style={TA}/></Fld>
            <Fld label="Texto do botão (máx 20 chars)"><input value={cfg.label||''} onChange={e=>set('label',e.target.value.slice(0,20))} placeholder="Ver fatura" style={IS} maxLength={20}/></Fld>
            <Fld label="URL do botão" hint="Suporta {{boleto.link}}"><input value={cfg.url||''} onChange={e=>set('url',e.target.value)} placeholder="https://..." style={IS}/></Fld>
            <Fld label="Rodapé (opcional)"><input value={cfg.rodape||''} onChange={e=>set('rodape',e.target.value.slice(0,60))} placeholder="Sua empresa" style={IS} maxLength={60}/></Fld>
          </>
        )}

        {node.data.tipo === 'enviar_botoes' && (
          <>
            <Fld label="Mensagem principal"><textarea value={cfg.corpo||''} onChange={e=>set('corpo',e.target.value)} rows={2} placeholder="Como posso te ajudar?" style={TA}/></Fld>
            <Fld label="Botões (máx 3)">
              {bts.map((b,i)=>{
                const lbl = typeof b==='object'?(b.label||''):String(b);
                return (
                  <div key={i} style={{display:'flex',gap:6,marginBottom:5}}>
                    <input value={lbl} onChange={e=>{const nb=[...bts];nb[i]={label:e.target.value,id:e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')};set('botoes',nb);}} placeholder={`Botão ${i+1}`} style={IS}/>
                    <button onClick={()=>{const nb=[...bts];nb.splice(i,1);set('botoes',nb);}} style={{background:'none',border:'none',color:'#ff4757',cursor:'pointer',fontSize:15,padding:'0 4px',flexShrink:0}}>×</button>
                  </div>
                );
              })}
              {bts.length<3 && <button onClick={()=>set('botoes',[...bts,{label:'',id:''}])} style={{width:'100%',padding:'6px 0',background:'rgba(62,207,255,.08)',border:'1px dashed rgba(62,207,255,.3)',borderRadius:6,color:'#3ecfff',fontSize:11,cursor:'pointer',marginTop:2}}>+ Adicionar botão</button>}
            </Fld>
            <Fld label="">
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',padding:'8px 10px',background:cfg.ia_menu_ativo?'rgba(244,114,182,.08)':'rgba(255,255,255,.03)',border:`1px solid ${cfg.ia_menu_ativo?'rgba(244,114,182,.3)':'rgba(255,255,255,.08)'}`,borderRadius:7,transition:'.15s'}}>
                <div onClick={()=>set('ia_menu_ativo',!cfg.ia_menu_ativo)} style={{width:32,height:18,borderRadius:9,background:cfg.ia_menu_ativo?'#f472b6':'rgba(255,255,255,.1)',position:'relative',transition:'.2s',flexShrink:0,cursor:'pointer'}}>
                  <div style={{position:'absolute',top:2,left:cfg.ia_menu_ativo?16:2,width:14,height:14,borderRadius:'50%',background:'#fff',transition:'.2s'}}/>
                </div>
                <div><div style={{fontSize:11,fontWeight:700,color:cfg.ia_menu_ativo?'#f472b6':'rgba(255,255,255,.5)'}}>🤖 IA no menu</div><div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginTop:1}}>Responde texto livre e incentiva a escolha</div></div>
              </label>
            </Fld>
          </>
        )}

        {node.data.tipo === 'enviar_lista' && (
          <>
            <Fld label="Mensagem"><textarea value={cfg.corpo||''} onChange={e=>set('corpo',e.target.value)} rows={2} placeholder="Selecione uma opção:" style={TA}/></Fld>
            <Fld label="Label do botão"><input value={cfg.label_botao||''} onChange={e=>set('label_botao',e.target.value)} placeholder="Ver opções" style={IS}/></Fld>
            <Fld label="Título da seção"><input value={cfg.titulo_secao||''} onChange={e=>set('titulo_secao',e.target.value)} placeholder="Opções disponíveis" style={IS}/></Fld>
            <Fld label="Itens" hint="ID = porta de saída. Conecte cada um ao próximo passo.">{(() => {
              const itens = Array.isArray(cfg.itens) ? cfg.itens : [];
              const setItens = (arr) => set('itens', arr);
              return (
                <>
                  {itens.map((it,i)=>(
                    <div key={i} style={{display:'flex',gap:4,marginBottom:5,alignItems:'center'}}>
                      <input value={it.id||''} onChange={e=>{const n=[...itens];n[i]={...it,id:e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')};setItens(n);}} placeholder="id" style={{...IS,width:80,fontFamily:'monospace',fontSize:10,flex:'0 0 80px'}}/>
                      <input value={it.titulo||''} onChange={e=>{const n=[...itens];n[i]={...it,titulo:e.target.value};setItens(n);}} placeholder="Título exibido" style={{...IS,flex:1,fontSize:10.5}}/>
                      <button onClick={()=>setItens(itens.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:'#ff4757',cursor:'pointer',fontSize:14,padding:'0 3px',flexShrink:0}}>×</button>
                    </div>
                  ))}
                  <button onClick={()=>setItens([...itens,{id:'',titulo:''}])} style={{width:'100%',padding:'5px 0',background:'rgba(62,207,255,.05)',border:'1px dashed rgba(62,207,255,.25)',borderRadius:5,color:'#3ecfff',fontSize:11,cursor:'pointer',marginTop:2}}>+ Adicionar item</button>
                </>
              );
            })()}</Fld>
            <Fld label="">
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',padding:'8px 10px',background:cfg.ia_menu_ativo?'rgba(244,114,182,.08)':'rgba(255,255,255,.03)',border:`1px solid ${cfg.ia_menu_ativo?'rgba(244,114,182,.3)':'rgba(255,255,255,.08)'}`,borderRadius:7}}>
                <div onClick={()=>set('ia_menu_ativo',!cfg.ia_menu_ativo)} style={{width:32,height:18,borderRadius:9,background:cfg.ia_menu_ativo?'#f472b6':'rgba(255,255,255,.1)',position:'relative',transition:'.2s',flexShrink:0,cursor:'pointer'}}>
                  <div style={{position:'absolute',top:2,left:cfg.ia_menu_ativo?16:2,width:14,height:14,borderRadius:'50%',background:'#fff',transition:'.2s'}}/>
                </div>
                <div><div style={{fontSize:11,fontWeight:700,color:cfg.ia_menu_ativo?'#f472b6':'rgba(255,255,255,.5)'}}>🤖 IA no menu</div><div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginTop:1}}>Responde texto livre e incentiva a escolha</div></div>
              </label>
            </Fld>
          </>
        )}

        {node.data.tipo === 'enviar_imagem' && (
          <>
            <Fld label="URL da imagem"><input value={cfg.url||''} onChange={e=>set('url',e.target.value)} placeholder="https://..." style={IS}/></Fld>
            <Fld label="Legenda (opcional)"><input value={cfg.legenda||''} onChange={e=>set('legenda',e.target.value)} placeholder="Legenda" style={IS}/></Fld>
          </>
        )}

        {node.data.tipo === 'enviar_audio' && (
          <Fld label="URL do áudio (MP3, OGG)" hint="Use OGG/Opus para melhor compatibilidade no WhatsApp">
            <input value={cfg.url||''} onChange={e=>set('url',e.target.value)} placeholder="https://..." style={IS}/>
          </Fld>
        )}

        {node.data.tipo === 'enviar_arquivo' && (
          <>
            <Fld label="URL do arquivo"><input value={cfg.url||''} onChange={e=>set('url',e.target.value)} placeholder="https://..." style={IS}/></Fld>
            <Fld label="Nome do arquivo"><input value={cfg.filename||''} onChange={e=>set('filename',e.target.value)} placeholder="documento.pdf" style={IS}/></Fld>
          </>
        )}

        {node.data.tipo === 'enviar_localizacao' && (
          <>
            <Fld label="Nome do local"><input value={cfg.nome||''} onChange={e=>set('nome',e.target.value)} placeholder="Escritório" style={IS}/></Fld>
            <Fld label="Endereço"><input value={cfg.address||''} onChange={e=>set('address',e.target.value)} placeholder="Rua X, 123" style={IS}/></Fld>
            <div style={{display:'flex',gap:8}}><Fld label="Latitude"><input value={cfg.lat||''} onChange={e=>set('lat',e.target.value)} placeholder="-5.79" style={IS}/></Fld><Fld label="Longitude"><input value={cfg.lng||''} onChange={e=>set('lng',e.target.value)} placeholder="-35.21" style={IS}/></Fld></div>
          </>
        )}

        {node.data.tipo === 'aguardar_resposta' && (
          <>
            <Fld label="Mensagem (opcional)"><textarea value={cfg.mensagem||''} onChange={e=>set('mensagem',e.target.value)} rows={2} placeholder="Qual é o seu CPF?" style={TA}/></Fld>
            <Fld label="Salvar resposta em" hint={`Disponível como {{${cfg.variavel||'resposta'}}} nos próximos nós`}><input value={cfg.variavel||''} onChange={e=>set('variavel',e.target.value)} placeholder="resposta" style={IS}/></Fld>
            <Fld label="Máx. tentativas inválidas"><input type="number" min={1} max={10} value={cfg.max_tentativas||3} onChange={e=>set('max_tentativas',parseInt(e.target.value)||3)} style={{...IS,width:80}}/></Fld>
          </>
        )}

        {node.data.tipo === 'condicao' && (
          <>
            <Fld label="Variável"><input value={cfg.variavel||''} onChange={e=>set('variavel',e.target.value)} placeholder="cliente.cadastrado" style={IS}/></Fld>
            <Fld label="Operador">
              <select value={cfg.operador||'=='} onChange={e=>set('operador',e.target.value)} style={{...IS,cursor:'pointer'}}>
                {['==','!=','>','<','contem','nao_contem','vazio','nao_vazio'].map(op=><option key={op} value={op}>{op}</option>)}
              </select>
            </Fld>
            <Fld label="Valor"><input value={cfg.valor||''} onChange={e=>set('valor',e.target.value)} placeholder="true" style={IS}/></Fld>
          </>
        )}

        {node.data.tipo === 'condicao_multipla' && (
          <>
            <div style={{fontSize:10.5,color:'rgba(255,255,255,.45)',marginBottom:8,lineHeight:1.6}}>Verifica em ordem. A primeira que bater define a saída. Se nenhuma bater → porta <em>default</em>.</div>
            {(cfg.ramos||[]).map((r,i)=>(
              <div key={i} style={{padding:'8px',border:'1px solid rgba(255,255,255,.08)',borderRadius:7,marginBottom:6}}>
                <div style={{display:'flex',gap:6,marginBottom:6}}>
                  <input value={r.variavel||''} onChange={e=>{const rs=[...cfg.ramos];rs[i]={...r,variavel:e.target.value};set('ramos',rs);}} placeholder="variavel" style={{...IS,flex:1,fontSize:11}}/>
                  <select value={r.operador||'=='} onChange={e=>{const rs=[...cfg.ramos];rs[i]={...r,operador:e.target.value};set('ramos',rs);}} style={{...IS,width:80,fontSize:11}}>
                    {['==','!=','>','<','contem','nao_contem','vazio','nao_vazio'].map(op=><option key={op} value={op}>{op}</option>)}
                  </select>
                  <input value={r.valor||''} onChange={e=>{const rs=[...cfg.ramos];rs[i]={...r,valor:e.target.value};set('ramos',rs);}} placeholder="valor" style={{...IS,flex:1,fontSize:11}}/>
                </div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <span style={{fontSize:10,color:'rgba(255,255,255,.4)'}}>porta:</span>
                  <input value={r.porta||`ramo${i+1}`} onChange={e=>{const rs=[...cfg.ramos];rs[i]={...r,porta:e.target.value};set('ramos',rs);}} style={{...IS,flex:1,fontSize:11,fontFamily:'monospace'}}/>
                  <button onClick={()=>set('ramos',cfg.ramos.filter((_,j)=>j!==i))} style={{background:'rgba(255,71,87,.15)',border:'1px solid rgba(255,71,87,.3)',color:'#ff4757',borderRadius:5,padding:'2px 8px',cursor:'pointer',fontSize:11}}>✕</button>
                </div>
              </div>
            ))}
            <button onClick={()=>set('ramos',[...(cfg.ramos||[]),{variavel:'',operador:'==',valor:'',porta:`ramo${(cfg.ramos||[]).length+1}`}])} style={{width:'100%',padding:'6px',border:'1px dashed rgba(255,255,255,.2)',borderRadius:7,background:'transparent',color:'rgba(255,255,255,.5)',cursor:'pointer',fontSize:12}}>+ Adicionar condição</button>
          </>
        )}

        {node.data.tipo === 'definir_variavel' && (
          <>
            <Fld label="Nome da variável"><input value={cfg.variavel||''} onChange={e=>set('variavel',e.target.value)} placeholder="minha_variavel" style={IS}/></Fld>
            <Fld label="Valor"><input value={cfg.valor||''} onChange={e=>set('valor',e.target.value)} placeholder="{{resposta}}" style={IS}/></Fld>
          </>
        )}

        {node.data.tipo === 'aguardar_tempo' && (
          <Fld label="Aguardar (segundos)" hint="60 = 1min · 300 = 5min · 3600 = 1h">
            <input type="number" min={5} max={86400} value={cfg.segundos||60} onChange={e=>set('segundos',parseInt(e.target.value))} style={IS}/>
          </Fld>
        )}

        {node.data.tipo === 'divisao_ab' && (
          <Fld label={`% para variante A (o resto vai para B)`}>
            <input type="number" min={1} max={99} value={cfg.pct_a||50} onChange={e=>set('pct_a',parseInt(e.target.value))} style={IS}/>
            <Hint>50 = distribuição igual · 70 = 70% vai para A, 30% para B</Hint>
          </Fld>
        )}

        {node.data.tipo === 'consultar_cliente' && (
          <>
            <Fld label="Pergunta para CPF/CNPJ (opcional)" hint="Se preenchido, o nó pergunta antes de consultar"><textarea value={cfg.pergunta||''} onChange={e=>set('pergunta',e.target.value)} rows={2} placeholder="Qual o seu CPF ou CNPJ?" style={TA}/></Fld>
            <Fld label="Máx. tentativas de CPF errado" hint="Após este número de erros, sai pela porta vermelha"><input type="number" min={1} max={10} value={cfg.max_tentativas||3} onChange={e=>set('max_tentativas',parseInt(e.target.value)||3)} style={{...IS,width:80}}/></Fld>
            <Fld label="Mensagem quando CPF não encontrado"><textarea value={cfg.mensagem_erro||''} onChange={e=>set('mensagem_erro',e.target.value)} rows={2} placeholder="CPF não encontrado. Verifique e tente novamente." style={TA}/></Fld>
            <div style={{padding:'8px 10px',background:'rgba(62,207,255,.05)',borderRadius:6,border:'1px solid rgba(62,207,255,.12)',marginBottom:11}}>
              <div style={{fontSize:10,color:'rgba(62,207,255,.7)',fontWeight:700,marginBottom:5,textTransform:'uppercase'}}>📋 Saídas</div>
              <div style={{fontSize:10.5,color:'rgba(255,255,255,.5)',lineHeight:1.7}}><span style={{color:'#00c896'}}>●</span> <b>encontrado</b> — 1 contrato<br/><span style={{color:'#3ecfff'}}>●</span> <b>múltiplos contratos</b> — cliente selecionou<br/><span style={{color:'#ff4757'}}>●</span> <b>máx tentativas</b> — esgotou</div>
            </div>
            <div style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>Preenche: cliente.nome, cliente.contrato, cliente.plano, cliente.status, cliente.cidade</div>
          </>
        )}

        {node.data.tipo === 'consultar_boleto' && (
          <>
            <Fld label="ID do contrato"><input value={cfg.contrato||''} onChange={e=>set('contrato',e.target.value)} placeholder="{{cliente.contrato}}" style={IS}/></Fld>
            <Fld label="Mensagem do boleto" hint="Use {{boleto.valor}}, {{boleto.vencimento}}, {{boleto.link}}, {{boleto.pix}}"><textarea value={cfg.mensagem_boleto||''} onChange={e=>set('mensagem_boleto',e.target.value)} rows={5} placeholder={'📄 *Boleto*\n\n💰 Valor: *R$ {{boleto.valor}}*\n📅 Venc: {{boleto.vencimento}}\n\n🔗 {{boleto.link}}'} style={TA}/></Fld>
            <Fld label="Mensagem quando não tem boleto"><textarea value={cfg.mensagem_sem_boleto||''} onChange={e=>set('mensagem_sem_boleto',e.target.value)} rows={2} placeholder="✅ Nenhum boleto em aberto. Conta em dia! 🎉" style={TA}/></Fld>
          </>
        )}

        {node.data.tipo === 'verificar_status' && (
          <>
            <Fld label="Contrato (fixo)">
              <div style={{padding:'6px 9px',background:'rgba(245,197,24,.08)',border:'1px solid rgba(245,197,24,.2)',borderRadius:6,fontSize:12,fontFamily:'monospace',color:'#f5c518'}}>{'{{cliente.contrato}}'}</div>
            </Fld>
            <div style={{marginBottom:11}}>
              <div style={{fontSize:10,color:'rgba(245,197,24,.8)',fontWeight:700,marginBottom:8,textTransform:'uppercase'}}>📋 Saídas por status</div>
              {[{id:'ativo',color:'#00c896',num:'1',label:'Ativo'},{id:'inativo',color:'#ff4757',num:'2',label:'Inativo'},{id:'cancelado',color:'#ff6b35',num:'3',label:'Cancelado'},{id:'suspenso',color:'#f5c518',num:'4',label:'Suspenso'},{id:'inviabilidade',color:'#888',num:'5',label:'Inviab. Técnica'},{id:'novo',color:'#3ecfff',num:'6',label:'Novo'},{id:'reduzido',color:'#a78bfa',num:'7',label:'V. Reduzida'}].map(s=>(
                <div key={s.id} style={{display:'flex',alignItems:'center',gap:8,marginBottom:5,padding:'4px 8px',background:'rgba(255,255,255,.02)',borderRadius:5,border:`1px solid ${s.color}22`}}>
                  <div style={{width:7,height:7,borderRadius:'50%',background:s.color,flexShrink:0}}/>
                  <span style={{fontSize:11,color:'rgba(255,255,255,.7)'}}>{s.num} — {s.label}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {node.data.tipo === 'abrir_chamado' && (
          <>
            <Fld label="Contrato (fixo)"><div style={{padding:'6px 9px',background:'rgba(167,139,250,.08)',border:'1px solid rgba(167,139,250,.2)',borderRadius:6,fontSize:12,fontFamily:'monospace',color:'#a78bfa'}}>{'{{cliente.contrato}}'}</div></Fld>
            <Fld label="Tipo de chamado"><input value={cfg.tipo_id||''} onChange={e=>set('tipo_id',e.target.value)} placeholder="5 = Outros" style={IS}/></Fld>
            <Fld label="Descrição"><textarea value={cfg.descricao||''} onChange={e=>set('descricao',e.target.value)} rows={2} placeholder="Chamado aberto via WhatsApp" style={TA}/></Fld>
          </>
        )}

        {node.data.tipo === 'promessa_pagamento' && (
          <>
            <Fld label="Contrato (fixo)"><div style={{padding:'6px 9px',background:'rgba(167,139,250,.08)',border:'1px solid rgba(167,139,250,.2)',borderRadius:6,fontSize:12,fontFamily:'monospace',color:'#a78bfa'}}>{'{{cliente.contrato}}'}</div></Fld>
            <Fld label="✅ Mensagem de sucesso" hint="{{promessa.dias}}, {{promessa.data}}, {{promessa.protocolo}}"><textarea value={cfg.mensagem_sucesso||''} onChange={e=>set('mensagem_sucesso',e.target.value)} rows={4} placeholder={'✅ *Promessa registrada!*\n\nAcesso liberado por {{promessa.dias}} dias.\n📅 Pague até: *{{promessa.data}}*'} style={TA}/></Fld>
            <Fld label="🟢 Mensagem quando já está em dia"><textarea value={cfg.mensagem_adimplente||''} onChange={e=>set('mensagem_adimplente',e.target.value)} rows={2} placeholder="✅ Seu contrato está em dia!" style={TA}/></Fld>
            <Fld label="❌ Mensagem de erro"><textarea value={cfg.mensagem_erro||''} onChange={e=>set('mensagem_erro',e.target.value)} rows={2} placeholder="❌ Não foi possível registrar." style={TA}/></Fld>
          </>
        )}

        {node.data.tipo === 'listar_planos' && (
          <Fld label="Cidade" hint="Preenche: planos.lista"><input value={cfg.cidade||''} onChange={e=>set('cidade',e.target.value)} placeholder="{{cliente.cidade}}" style={IS}/></Fld>
        )}

        {node.data.tipo === 'consultar_historico' && (
          <Fld label="ID do contrato" hint="Preenche: historico.resumo"><input value={cfg.contrato||''} onChange={e=>set('contrato',e.target.value)} placeholder="{{cliente.contrato}}" style={IS}/></Fld>
        )}

        {node.data.tipo === 'ia_responde' && (
          <>
            <Fld label="Contexto / assunto" hint="Define o tom e foco da IA"><input value={cfg.contexto||''} onChange={e=>set('contexto',e.target.value)} placeholder="suporte, comercial, geral..." style={IS}/></Fld>
            <Fld label="Instrução extra"><textarea value={cfg.prompt||''} onChange={e=>set('prompt',e.target.value)} rows={3} placeholder="Ex: O cliente já está identificado. Ajude com suporte técnico." style={TA}/></Fld>
            <Fld label="Modelo de IA">
              <div style={{display:'flex',flexDirection:'column',gap:5}}>
                {[['haiku','⚡ Claude Haiku','Rápido — ideal para FAQ'],['sonnet','🧠 Claude Sonnet','Mais capaz — para casos complexos']].map(([val,lbl,desc])=>(
                  <button key={val} onClick={()=>set('modelo',val)} style={{padding:'7px 10px',borderRadius:7,cursor:'pointer',textAlign:'left',background:(cfg.modelo||'haiku')===val?'rgba(244,114,182,.12)':'rgba(255,255,255,.03)',border:(cfg.modelo||'haiku')===val?'1px solid rgba(244,114,182,.4)':'1px solid rgba(255,255,255,.08)'}}>
                    <div style={{fontSize:11,color:(cfg.modelo||'haiku')===val?'#f472b6':'rgba(255,255,255,.7)',fontWeight:(cfg.modelo||'haiku')===val?700:400}}>{lbl}</div>
                    <div style={{fontSize:9.5,color:'rgba(255,255,255,.3)',marginTop:2}}>{desc}</div>
                  </button>
                ))}
              </div>
            </Fld>
            <Fld label="Máx. de turnos" hint="Após este número, sai pela porta amarela"><input type="number" value={cfg.max_turns||5} onChange={e=>set('max_turns',parseInt(e.target.value)||5)} style={{...IS,width:80}}/></Fld>
            <div style={{padding:'8px 10px',background:'rgba(244,114,182,.05)',borderRadius:6,border:'1px solid rgba(244,114,182,.12)',marginBottom:11}}>
              <div style={{fontSize:10,color:'rgba(244,114,182,.8)',fontWeight:700,marginBottom:4,textTransform:'uppercase'}}>📋 Saídas</div>
              <div style={{fontSize:10.5,color:'rgba(255,255,255,.5)',lineHeight:1.8}}><span style={{color:'#00c896'}}>●</span> <b>resolvido</b><br/><span style={{color:'#ff6b35'}}>●</span> <b>transferir</b><br/><span style={{color:'#f5c518'}}>●</span> <b>max_turnos</b></div>
            </div>
          </>
        )}

        {node.data.tipo === 'ia_roteador' && (()=>{
          const rotas = Array.isArray(cfg.rotas) ? cfg.rotas : [];
          const setRotas = r => set('rotas', r);
          return (
            <>
              <Fld label="Mensagem inicial" hint="Enviada antes de esperar a resposta"><textarea value={cfg.mensagem||''} onChange={e=>set('mensagem',e.target.value)} rows={2} placeholder="Posso te ajudar com mais alguma coisa? 😊" style={TA}/></Fld>
              <Fld label="Rotas (intenções)" hint="Cada rota vira uma porta de saída">
                {rotas.map((r,i)=>(
                  <div key={i} style={{marginBottom:8,padding:'8px 10px',background:'rgba(232,121,249,.05)',borderRadius:7,border:'1px solid rgba(232,121,249,.15)'}}>
                    <div style={{display:'flex',gap:5,marginBottom:5}}>
                      <div style={{flex:1}}><div style={{fontSize:9.5,color:'rgba(255,255,255,.3)',marginBottom:3}}>ID da porta</div><input value={r.id||''} onChange={e=>{const n=[...rotas];n[i]={...n[i],id:e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')};setRotas(n);}} placeholder="boleto" style={{...IS,fontSize:11,fontFamily:'monospace'}}/></div>
                      <div style={{flex:2}}><div style={{fontSize:9.5,color:'rgba(255,255,255,.3)',marginBottom:3}}>Label</div><input value={r.label||''} onChange={e=>{const n=[...rotas];n[i]={...n[i],label:e.target.value};setRotas(n);}} placeholder="2ª via de boleto" style={{...IS,fontSize:11}}/></div>
                      <button onClick={()=>{const n=[...rotas];n.splice(i,1);setRotas(n);}} style={{background:'none',border:'none',color:'#ff4757',cursor:'pointer',fontSize:15,padding:'0 4px',flexShrink:0,alignSelf:'flex-end',marginBottom:2}}>×</button>
                    </div>
                    <div style={{fontSize:9.5,color:'rgba(255,255,255,.3)',marginBottom:3}}>Descrição para a IA</div>
                    <input value={r.descricao||''} onChange={e=>{const n=[...rotas];n[i]={...n[i],descricao:e.target.value};setRotas(n);}} placeholder="quando o cliente quer ver ou pagar boleto" style={{...IS,fontSize:10.5}}/>
                  </div>
                ))}
                <button onClick={()=>setRotas([...rotas,{id:'',label:'',descricao:''}])} style={{width:'100%',padding:'6px 0',background:'rgba(232,121,249,.06)',border:'1px dashed rgba(232,121,249,.3)',borderRadius:6,color:'#e879f9',fontSize:11,cursor:'pointer',marginTop:2}}>+ Adicionar rota</button>
              </Fld>
            </>
          );
        })()}

        {node.data.tipo === 'transferir_agente' && (
          <>
            <Fld label="Motivo da transferência"><textarea value={cfg.motivo||''} onChange={e=>set('motivo',e.target.value)} rows={2} placeholder="Cliente solicitou atendimento humano" style={TA}/></Fld>
            <Fld label="Fila / Grupo (opcional)" hint="Deixe vazio para fila geral"><input value={cfg.fila||''} onChange={e=>set('fila',e.target.value)} placeholder="Suporte, Comercial, Financeiro..." style={IS}/></Fld>
            <Fld label="Mensagem fora do horário"><textarea value={cfg.msg_fora||''} onChange={e=>set('msg_fora',e.target.value)} rows={2} placeholder="Nosso atendimento funciona de seg-sex das 8h às 18h." style={TA}/></Fld>
            <Fld label="Mensagem sem agente online"><textarea value={cfg.msg_sem_agente||''} onChange={e=>set('msg_sem_agente',e.target.value)} rows={2} placeholder="Todos os atendentes estão ocupados no momento." style={TA}/></Fld>
          </>
        )}

        {node.data.tipo === 'chamada_http' && (
          <>
            <div style={{display:'flex',gap:6,marginBottom:10}}>
              <select value={cfg.method||'GET'} onChange={e=>set('method',e.target.value)} style={{...IS,width:75,fontSize:11}}>{['GET','POST','PUT','PATCH'].map(m=><option key={m} value={m}>{m}</option>)}</select>
              <input value={cfg.url||''} onChange={e=>set('url',e.target.value)} placeholder="https://api.exemplo.com/dados" style={{...IS,flex:1}}/>
            </div>
            {(cfg.method||'GET')!=='GET' && <Fld label="Corpo (JSON)"><textarea value={cfg.body||''} onChange={e=>set('body',e.target.value)} rows={3} placeholder={'{"cpf":"{{cliente.cpf}}"}'} style={{...TA,fontFamily:'monospace',fontSize:11}}/></Fld>}
            <Fld label="Salvar resposta em variável" hint="Use {{http_resposta}} nos próximos nós"><input value={cfg.variavel||'http_resposta'} onChange={e=>set('variavel',e.target.value)} style={{...IS,fontFamily:'monospace'}}/></Fld>
          </>
        )}

        {node.data.tipo === 'nota_interna' && (
          <Fld label="Texto da nota (visível só para atendentes)"><textarea value={cfg.nota||''} onChange={e=>set('nota',e.target.value)} rows={3} placeholder="Cliente informou problema de conexão." style={TA}/></Fld>
        )}

        {node.data.tipo === 'enviar_email' && (
          <>
            <Fld label="Para (destinatário)"><input value={cfg.para||''} onChange={e=>set('para',e.target.value)} placeholder="{{cliente.email}}" style={IS}/></Fld>
            <Fld label="Assunto"><input value={cfg.assunto||''} onChange={e=>set('assunto',e.target.value)} placeholder="Sua solicitação" style={IS}/></Fld>
            <Fld label="Corpo"><textarea value={cfg.corpo||''} onChange={e=>set('corpo',e.target.value)} rows={4} placeholder="Olá {{cliente.nome}},..." style={TA}/></Fld>
          </>
        )}

        {node.data.tipo === 'nps_inline' && (
          <Fld label="Pergunta"><textarea value={cfg.pergunta||''} onChange={e=>set('pergunta',e.target.value)} rows={2} placeholder="De 1 a 10, qual nota você dá ao nosso atendimento? ⭐" style={TA}/></Fld>
        )}

        {node.data.tipo === 'solicitar_localizacao' && (
          <>
            <Fld label="Mensagem de solicitação"><textarea value={cfg.mensagem||''} onChange={e=>set('mensagem',e.target.value)} rows={4} placeholder={'📍 Para verificar a cobertura, preciso da sua localização!\n\n1️⃣ Envie sua localização GPS\n2️⃣ Ou informe seu CEP'} style={TA}/></Fld>
            <Fld label="Variável para salvar endereço"><input value={cfg.variavel||''} onChange={e=>set('variavel',e.target.value)} placeholder="endereco_cliente" style={IS}/></Fld>
          </>
        )}

        {node.data.tipo === 'encerrar' && (
          <Fld label="Mensagem final"><textarea value={cfg.mensagem||''} onChange={e=>set('mensagem',e.target.value)} rows={2} placeholder="Obrigado pelo contato! 😊" style={TA}/></Fld>
        )}

        {/* Alias */}
        {node.data.tipo !== 'inicio' && (
          <div style={{marginTop:10,padding:'8px 10px',background:'rgba(167,139,250,.05)',borderRadius:7,border:'1px solid rgba(167,139,250,.12)'}}>
            <div style={{fontSize:10,color:'rgba(167,139,250,.8)',fontWeight:700,marginBottom:5,textTransform:'uppercase',letterSpacing:'.04em'}}>Alias (roteamento automático)</div>
            <input value={cfg.alias||''} onChange={e=>set('alias',e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''))} placeholder="ex: boleto, suporte, pagamento" style={{...IS,fontFamily:'monospace',fontSize:11}}/>
            <div style={{fontSize:9.5,color:'rgba(255,255,255,.28)',marginTop:4,lineHeight:1.5}}>Quando uma porta tiver o mesmo ID deste alias e não tiver linha manual, o motor vem direto pra cá.</div>
          </div>
        )}

        {/* Variáveis disponíveis */}
        <div style={{marginTop:12,padding:8,background:'rgba(255,255,255,.04)',borderRadius:7,border:'1px solid rgba(255,255,255,.06)'}}>
          <div style={{fontSize:10,color:'rgba(255,255,255,.3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6,fontWeight:600}}>Variáveis disponíveis</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
            {VARS.map(v=>(
              <button key={v} onClick={()=>navigator.clipboard?.writeText(v)} style={{fontSize:9.5,color:'rgba(255,255,255,.4)',fontFamily:'monospace',background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:4,padding:'1px 6px',cursor:'pointer'}} title="Copiar">{v}</button>
            ))}
          </div>
          <div style={{fontSize:9,color:'rgba(255,255,255,.2)',marginTop:5}}>Clique para copiar</div>
        </div>
      </div>
    </div>
  );
}

// pequeno helper usado em PropsPanel
function Hint({ children }) {
  return <div style={{fontSize:10,color:'rgba(255,255,255,.25)',marginTop:3,fontStyle:'italic'}}>{children}</div>;
}

// ── PALETA DE NÓS ─────────────────────────────────────────────────
function NodePalette() {
  const onDragStart = (e, tipo) => { e.dataTransfer.setData('application/reactflow', tipo); e.dataTransfer.effectAllowed = 'move'; };
  const groups = {};
  Object.entries(NODE_TYPES).forEach(([tipo,def])=>{ if(!groups[def.group])groups[def.group]=[]; groups[def.group].push({tipo,...def}); });
  return (
    <div style={{ width:185, background:'rgba(2,8,16,.98)', borderRight:'1px solid rgba(255,255,255,.07)', padding:'10px 8px', overflowY:'auto', display:'flex', flexDirection:'column', flexShrink:0 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10, paddingLeft:4 }}>Nós</div>
      {Object.entries(NODE_GROUPS).map(([grpKey,grp])=>{
        const items = groups[grpKey]||[];
        if (!items.length) return null;
        return (
          <div key={grpKey} style={{marginBottom:8}}>
            <div style={{fontSize:9.5,color:grp.color,textTransform:'uppercase',letterSpacing:'.08em',fontWeight:700,margin:'4px 4px 5px',display:'flex',alignItems:'center',gap:4}}>
              <div style={{flex:1,height:1,background:`${grp.color}33`}}/>
              {grp.label}
              <div style={{flex:1,height:1,background:`${grp.color}33`}}/>
            </div>
            {items.map(({tipo,label,color})=>(
              <div key={tipo} draggable onDragStart={e=>onDragStart(e,tipo)}
                style={{display:'flex',alignItems:'center',gap:7,padding:'5px 8px',borderRadius:6,border:'1px solid rgba(255,255,255,.06)',background:'rgba(255,255,255,.02)',marginBottom:3,cursor:'grab',userSelect:'none',transition:'border-color .1s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=color+'55'}
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

// ── EDITOR PRINCIPAL ──────────────────────────────────────────────
export default function FluxoEditor() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const toast      = useStore(s => s.toast);
  const qc         = useQueryClient();
  const reactFlowWrapper = useRef(null);
  const uploadRef  = useRef(null);
  const [rfInstance, setRfInstance] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode]  = useState(null);
  const [selectedEdge, setSelectedEdge]  = useState(null);
  const [fluxo, setFluxo]     = useState(null);
  const [saving, setSaving]   = useState(false);

  // Carrega fluxo
  useEffect(() => {
    if (!id || id === 'novo') return;
    fetch(`/api/fluxos/${id}`, { headers:{ Authorization:`Bearer ${localStorage.getItem('maxxi_token')||''}` } })
      .then(r=>r.json())
      .then(f=>{
        setFluxo(f);
        const d = typeof f.dados==='string' ? JSON.parse(f.dados||'{}') : (f.dados||{});
        setNodes((d.nodes||[]).map(n=>({ id:n.id, type:'fluxo', position:{ x:n.posX||0, y:n.posY||0 }, data:{ tipo:n.tipo, config:n.config||{} } })));
        setEdges((d.edges||[]).map(e=>({ id:`e-${e.from}-${e.to}-${e.port||''}`, source:e.from, target:e.to, sourceHandle:e.port||'saida', markerEnd:{ type:MarkerType.ArrowClosed, width:12, height:12, color:'rgba(255,255,255,.3)' }, style:{ stroke:'rgba(255,255,255,.22)', strokeWidth:1.5 } })));
      })
      .catch(()=>toast('Erro ao carregar fluxo', 'error'));
  }, [id]);

  const buildDados = () => ({
    nodes: nodes.map(n=>({ id:n.id, tipo:n.data.tipo, config:n.data.config||{}, posX:Math.round(n.position.x), posY:Math.round(n.position.y) })),
    edges: edges.map(e=>({ from:e.source, to:e.target, ...(e.sourceHandle&&e.sourceHandle!=='saida'?{port:e.sourceHandle}:{}) })),
  });

  const salvar = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('maxxi_token')||'';
      const body  = JSON.stringify({ nome:fluxo?.nome||'Fluxo', dados:buildDados(), ativo:fluxo?.ativo||false, gatilho:fluxo?.gatilho||'nova_conversa' });
      const url   = id&&id!=='novo' ? `/api/fluxos/${id}` : '/api/fluxos';
      const method= id&&id!=='novo' ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body });
      const saved = await r.json();
      if (!r.ok) throw new Error(saved.error||'Erro ao salvar');
      setFluxo(saved);
      toast('Fluxo salvo!', 'success');
      qc.invalidateQueries({ queryKey:['fluxos'] });
      if (id==='novo') navigate(`/fluxos/${saved.id}`, { replace:true });
    } catch(err) { toast(err.message, 'error'); }
    setSaving(false);
  };

  const autoLayout = useCallback(()=>{
    if (!nodes.length) return;
    const NODE_W=220, NODE_H=100, GAP_X=60, GAP_Y=80;
    const children={}, parents={};
    nodes.forEach(n=>{ children[n.id]=[]; parents[n.id]=[]; });
    edges.forEach(e=>{ children[e.source]?.push(e.target); parents[e.target]?.push(e.source); });
    const roots = nodes.filter(n=>!parents[n.id]?.length).map(n=>n.id);
    if (!roots.length) roots.push(nodes[0].id);
    const layer={}, queue=roots.map(r=>({id:r,d:0})), visited=new Set();
    while (queue.length) { const {id,d}=queue.shift(); if(visited.has(id))continue; visited.add(id); layer[id]=Math.max(layer[id]??0,d); (children[id]||[]).forEach(c=>queue.push({id:c,d:d+1})); }
    const maxLayer=Math.max(0,...Object.values(layer));
    nodes.forEach(n=>{ if(layer[n.id]==null)layer[n.id]=maxLayer+1; });
    const byLayer={};
    Object.entries(layer).forEach(([id,l])=>{ if(!byLayer[l])byLayer[l]=[]; byLayer[l].push(id); });
    const posMap={};
    Object.entries(byLayer).forEach(([l,ids])=>{ const totalW=ids.length*NODE_W+(ids.length-1)*GAP_X; const startX=-totalW/2; ids.forEach((id,i)=>{ posMap[id]={ x:startX+i*(NODE_W+GAP_X), y:Number(l)*(NODE_H+GAP_Y) }; }); });
    setNodes(ns=>ns.map(n=>({...n,position:posMap[n.id]??n.position})));
    setTimeout(()=>rfInstance?.fitView({padding:.15,duration:400}),50);
  }, [nodes, edges, rfInstance, setNodes]);

  const onConnect = useCallback(params => setEdges(es=>addEdge({ ...params, markerEnd:{ type:MarkerType.ArrowClosed, width:12, height:12, color:'rgba(255,255,255,.3)' }, style:{ stroke:'rgba(255,255,255,.22)', strokeWidth:1.5 } }, es)), []);
  const onDrop = useCallback(e=>{ e.preventDefault(); const tipo=e.dataTransfer.getData('application/reactflow'); if(!tipo||!rfInstance)return; const pos=rfInstance.screenToFlowPosition({x:e.clientX,y:e.clientY}); setNodes(ns=>[...ns,{id:`n_${Date.now()}`,type:'fluxo',position:pos,data:{tipo,config:{}}}]); }, [rfInstance]);
  const onDragOver = useCallback(e=>{ e.preventDefault(); e.dataTransfer.dropEffect='move'; }, []);
  const onNodeClick = useCallback((_,n)=>setSelectedNode(n), []);
  const onEdgeClick = useCallback((_evt,edge)=>{ setEdges(es=>es.map(e=>e.id===edge.id?{...e,style:{...e.style,stroke:'#ff4757',strokeWidth:2},selected:true}:{...e,style:{stroke:'rgba(255,255,255,.22)',strokeWidth:1.5},selected:false})); setSelectedEdge(edge.id); }, []);
  const onPaneClick = useCallback(()=>{ setSelectedNode(null); setEdges(es=>es.map(e=>({...e,style:{stroke:'rgba(255,255,255,.22)',strokeWidth:1.5},selected:false}))); setSelectedEdge(null); }, []);
  const updateNodeData = useCallback(data=>{ if(!selectedNode)return; setNodes(ns=>ns.map(n=>n.id===selectedNode.id?{...n,data}:n)); setSelectedNode(p=>({...p,data})); }, [selectedNode]);
  const deleteNode = useCallback((nodeId)=>{ const id2=typeof nodeId==='string'?nodeId:selectedNode?.id; if(!id2)return; setNodes(ns=>ns.filter(n=>n.id!==id2)); setEdges(es=>es.filter(e=>e.source!==id2&&e.target!==id2)); if(selectedNode?.id===id2)setSelectedNode(null); }, [selectedNode]);

  // Ctrl+S / Delete
  useEffect(()=>{
    const fn = e => {
      if ((e.key==='Delete'||e.key==='Backspace') && !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
        if (selectedNode) deleteNode(selectedNode.id);
        else if (selectedEdge) { setEdges(es=>es.filter(ed=>ed.id!==selectedEdge)); setSelectedEdge(null); }
      }
      if ((e.ctrlKey||e.metaKey)&&e.key==='s') { e.preventDefault(); salvar(); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [selectedNode, selectedEdge, salvar, deleteNode]);

  // Exportar
  const baixarFluxo = () => {
    const blob = new Blob([JSON.stringify({ _maxxi_fluxo:true, nome:fluxo?.nome||'fluxo', dados:buildDados() },null,2)],{type:'application/json'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`maxxi_fluxo_${(fluxo?.nome||'fluxo').replace(/[^a-z0-9]/gi,'_').toLowerCase()}.json`; a.click(); URL.revokeObjectURL(a.href);
    toast('Fluxo exportado!', 'success');
  };
  const importarFluxo = e => {
    const file = e.target.files?.[0]; if(!file)return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const obj = JSON.parse(ev.target.result);
        const dados = obj._maxxi_fluxo ? obj.dados : obj;
        if (!dados?.nodes||!Array.isArray(dados.nodes)) { toast('Arquivo inválido','error'); return; }
        if (!window.confirm(`Importar "${obj.nome||file.name}"?\nIsso vai substituir o fluxo atual.`)) return;
        setNodes(dados.nodes.map(n=>({ id:n.id, type:'fluxo', position:{x:n.posX||0,y:n.posY||0}, data:{tipo:n.tipo,config:n.config||{}} })));
        setEdges(dados.edges.map(e=>({ id:`e-${e.from}-${e.to}-${e.port||''}`, source:e.from, target:e.to, sourceHandle:e.port||'saida', style:{stroke:'rgba(255,255,255,.22)',strokeWidth:1.5} })));
        if (obj.nome) setFluxo(f=>({...f,nome:obj.nome}));
        toast('Fluxo importado! Clique em Salvar.','success');
      } catch(err) { toast('Erro ao ler arquivo: '+err.message,'error'); }
    };
    reader.readAsText(file); e.target.value='';
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 14px', background:'rgba(2,8,16,.98)', borderBottom:'1px solid rgba(255,255,255,.07)', flexShrink:0, zIndex:10 }}>
        <button onClick={()=>navigate('/fluxos')} style={{ background:'none', border:'none', color:'rgba(255,255,255,.35)', cursor:'pointer', fontSize:12, padding:'3px 7px', borderRadius:5 }}>← Fluxos</button>
        <div style={{ width:1, height:18, background:'rgba(255,255,255,.08)' }}/>
        <input value={fluxo?.nome||''} onChange={e=>setFluxo(f=>({...f,nome:e.target.value}))} style={{ background:'none', border:'none', color:'#fff', fontSize:13, fontWeight:600, outline:'none', minWidth:180, fontFamily:'Syne,sans-serif' }} placeholder="Nome do fluxo"/>
        {fluxo?.ativo && <span style={{ fontSize:9.5, background:'rgba(0,229,160,.12)', color:'#00E5A0', border:'1px solid rgba(0,229,160,.22)', borderRadius:12, padding:'2px 8px', fontWeight:700 }}>● ATIVO</span>}
        <div style={{ display:'flex', gap:6, marginLeft:'auto', alignItems:'center' }}>
          <span style={{ fontSize:10, color:'rgba(255,255,255,.25)' }}>{nodes.length} nós · Ctrl+S salvar · Del excluir</span>
          <input ref={uploadRef} type="file" accept=".json" onChange={importarFluxo} style={{ display:'none' }}/>
          <button onClick={autoLayout} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid rgba(62,207,255,.2)', background:'rgba(62,207,255,.06)', color:'#3ecfff', fontSize:11, cursor:'pointer', fontWeight:600 }}>⚡ Organizar</button>
          <div style={{ width:1, height:18, background:'rgba(255,255,255,.1)' }}/>
          <button onClick={()=>uploadRef.current?.click()} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid rgba(245,197,24,.25)', background:'rgba(245,197,24,.07)', color:'#f5c518', fontSize:11, cursor:'pointer', fontWeight:600 }}>📂 Importar</button>
          <button onClick={baixarFluxo} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid rgba(167,139,250,.25)', background:'rgba(167,139,250,.07)', color:'#a78bfa', fontSize:11, cursor:'pointer', fontWeight:600 }}>📤 Exportar</button>
          <div style={{ width:1, height:18, background:'rgba(255,255,255,.1)' }}/>
          <button onClick={salvar} disabled={saving} style={{ padding:'5px 14px', borderRadius:6, border:'none', background:saving?'rgba(255,255,255,.08)':'linear-gradient(135deg,#00E5A0,#00a875)', color:saving?'#aaa':'#021a12', fontSize:11, cursor:'pointer', fontWeight:700 }}>
            {saving?'Salvando...':'💾 Salvar'}
          </button>
        </div>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <NodePalette/>
        <div ref={reactFlowWrapper} style={{ flex:1, position:'relative' }}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver}
            onNodeClick={onNodeClick} onPaneClick={onPaneClick} onEdgeClick={onEdgeClick}
            onInit={setRfInstance} nodeTypes={nodeTypes} deleteKeyCode={null}
            style={{ background:'transparent' }}
          >
            {selectedEdge && (
              <Panel position="top-center">
                <div style={{ background:'rgba(2,8,16,.95)', border:'1px solid rgba(255,71,87,.35)', borderRadius:8, padding:'6px 12px', display:'flex', alignItems:'center', gap:10, fontSize:12, color:'rgba(255,255,255,.7)' }}>
                  <span>Conexão selecionada</span>
                  <button onClick={()=>{ setEdges(es=>es.filter(e=>e.id!==selectedEdge)); setSelectedEdge(null); }} style={{ background:'rgba(255,71,87,.15)', border:'1px solid rgba(255,71,87,.4)', borderRadius:5, color:'#ff4757', padding:'3px 10px', cursor:'pointer', fontSize:11, fontWeight:700 }}>× Apagar</button>
                  <button onClick={()=>setSelectedEdge(null)} style={{ background:'none', border:'1px solid rgba(255,255,255,.1)', borderRadius:5, color:'rgba(255,255,255,.4)', padding:'3px 8px', cursor:'pointer', fontSize:11 }}>Cancelar</button>
                </div>
              </Panel>
            )}
            <Background color="rgba(255,255,255,.04)" gap={24} size={1}/>
            <Controls style={{ background:'rgba(2,8,16,.9)', border:'1px solid rgba(255,255,255,.08)', borderRadius:8 }}/>
            <MiniMap style={{ background:'rgba(2,8,16,.9)', border:'1px solid rgba(255,255,255,.08)' }} nodeColor={n=>NODE_TYPES[n.data?.tipo]?.color||'#444'} maskColor="rgba(2,8,16,.7)"/>
            {nodes.length===0 && (
              <Panel position="top-center">
                <div style={{ marginTop:80, background:'rgba(2,8,16,.9)', border:'1px dashed rgba(255,255,255,.1)', borderRadius:12, padding:'24px 36px', textAlign:'center', color:'rgba(255,255,255,.35)', fontSize:13 }}>
                  <div style={{ fontSize:26, marginBottom:8 }}>✦</div>
                  <div style={{ fontWeight:600, marginBottom:3 }}>Canvas vazio</div>
                  <div style={{ fontSize:11 }}>Arraste um nó da paleta esquerda para começar</div>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>
        {selectedNode && (
          <div style={{ padding:10, background:'rgba(2,8,16,.98)', borderLeft:'1px solid rgba(255,255,255,.07)', overflowY:'auto', flexShrink:0 }}>
            <PropsPanel node={selectedNode} onChange={updateNodeData} onDelete={deleteNode}/>
          </div>
        )}
      </div>
    </div>
  );
}
