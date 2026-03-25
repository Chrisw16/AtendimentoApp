import React, { useCallback, useEffect, useState, useRef } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, Panel,
  addEdge, useNodesState, useEdgesState,
  MarkerType, Handle, Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { apiJson, api } from '../api';
import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';

/* ── DEFINIÇÃO DOS NÓS ──────────────────────────────────────────────────────── */
const NODE_TYPES_DEF = {
  inicio:                { label: 'Início',               color: '#00c896', group: 'gatilho',  portas: ['saida'] },
  enviar_texto:          { label: 'Enviar texto',          color: '#3ecfff', group: 'mensagem', portas: ['saida'] },
  enviar_botoes:         { label: 'Enviar botões',         color: '#3ecfff', group: 'mensagem', portas: [] },
  enviar_lista:          { label: 'Enviar lista',          color: '#3ecfff', group: 'mensagem', portas: [] },
  aguardar_resposta:     { label: 'Aguardar resposta',     color: '#f5c518', group: 'logica',   portas: ['saida'] },
  condicao:              { label: 'Condição',              color: '#f5c518', group: 'logica',   portas: ['sim','nao'] },
  definir_variavel:      { label: 'Definir variável',      color: '#f5c518', group: 'logica',   portas: ['saida'] },
  consultar_cliente:     { label: 'Consultar cliente',     color: '#a78bfa', group: 'sgp',      portas: ['encontrado','multiplos_contratos','max_tentativas'] },
  consultar_boleto:      { label: 'Consultar boleto',      color: '#a78bfa', group: 'sgp',      portas: ['encontrado','nao_encontrado'] },
  verificar_status:      { label: 'Verificar status',      color: '#f5c518', group: 'sgp',      portas: ['ativo','inativo','cancelado','suspenso','inviabilidade','novo','reduzido'] },
  verificar_manutencao:  { label: 'Verificar manutenção',  color: '#a78bfa', group: 'sgp',      portas: ['sim','nao'] },
  abrir_chamado:         { label: 'Abrir chamado',         color: '#a78bfa', group: 'sgp',      portas: ['saida'] },
  fechar_ocorrencia:     { label: 'Fechar ocorrência',     color: '#a78bfa', group: 'sgp',      portas: ['saida'] },
  cancelar_contrato:     { label: 'Cancelar contrato',     color: '#ff6b35', group: 'sgp',      portas: ['saida'] },
  promessa_pagamento:    { label: 'Promessa pagamento',    color: '#a78bfa', group: 'sgp',      portas: ['sucesso','adimplente','erro'] },
  listar_planos:         { label: 'Listar planos',         color: '#a78bfa', group: 'sgp',      portas: ['saida'] },
  consultar_historico:   { label: 'Histórico chamados',    color: '#a78bfa', group: 'sgp',      portas: ['saida'] },
  consultar_radius:      { label: 'Consultar Radius',      color: '#a78bfa', group: 'sgp',      portas: ['saida'] },
  ia_responde:           { label: 'IA responde',           color: '#f472b6', group: 'ia',       portas: ['resolvido','transferir','max_turnos'] },
  ia_roteador:           { label: 'IA roteador',           color: '#e879f9', group: 'ia',       portas: [] },
  transferir_agente:     { label: 'Transferir agente',     color: '#ff6b35', group: 'acao',     portas: [] },
  enviar_flow:           { label: 'Enviar Flow WA',        color: '#00c896', group: 'acao',     portas: ['concluido','erro'] },
  encerrar:              { label: 'Encerrar',              color: '#ff4757', group: 'fim',       portas: [] },
};

const GRUPOS = {
  gatilho:  { label: 'Gatilho',   color: '#00c896' },
  mensagem: { label: 'Mensagens', color: '#3ecfff' },
  logica:   { label: 'Lógica',    color: '#f5c518' },
  sgp:      { label: 'SGP / ERP', color: '#a78bfa' },
  ia:       { label: 'IA',        color: '#f472b6' },
  acao:     { label: 'Ações',     color: '#ff6b35' },
  fim:      { label: 'Fim',       color: '#ff4757' },
};

const VARS = [
  '{{saudacao}}','{{protocolo}}',
  '{{cliente.nome}}','{{cliente.cpf}}','{{cliente.contrato}}',
  '{{cliente.plano}}','{{cliente.status}}','{{cliente.cidade}}',
  '{{resposta}}','{{opcao_escolhida}}',
  '{{boleto.valor}}','{{boleto.vencimento}}','{{boleto.link}}','{{boleto.pix}}',
  '{{chamado.protocolo}}','{{manutencao.mensagem}}',
  '{{planos.lista}}','{{historico.resumo}}',
];

/* ── CUSTOM NODE ────────────────────────────────────────────────────────────── */
const FlowNode = ({ data, selected }) => {
  const def = NODE_TYPES_DEF[data.tipo] || { label: data.tipo, color: '#888', portas: [] };
  const cfg = data.config || {};
  const botoes = Array.isArray(cfg.botoes) ? cfg.botoes : [];
  const itensList = data.tipo === 'enviar_lista'
    ? (cfg.itens||'').split('\n').map(l=>l.trim()).filter(Boolean)
    : [];
  const temMuitosItens = itensList.length > 3;

  return (
    <div style={{
      background: selected ? 'rgba(2,40,50,.98)' : 'rgba(2,35,45,.95)',
      border: selected ? `1.5px solid ${def.color}` : `1px solid rgba(255,255,255,.12)`,
      borderRadius: 10,
      minWidth: data.tipo === 'enviar_lista' && itensList.length ? 210 : 165,
      maxWidth: data.tipo === 'enviar_lista' && itensList.length ? 260 : 220,
      boxShadow: selected ? `0 0 0 3px ${def.color}22` : 'none',
      transition: 'all .15s',
      position: 'relative',
    }}>
      {/* Badge de alias */}
      {cfg.alias && (
        <div style={{ position:'absolute', top:-9, left:10, background:'rgba(167,139,250,.2)', border:'1px solid rgba(167,139,250,.4)', borderRadius:4, padding:'1px 6px', fontSize:8.5, fontFamily:'monospace', color:'#a78bfa', whiteSpace:'nowrap' }}>
          #{cfg.alias}
        </div>
      )}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: def.color, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: def.color, textTransform: 'uppercase', letterSpacing: '.06em' }}>{def.label}</span>
      </div>
      <div style={{ padding: '7px 12px', fontSize: 11, color: 'rgba(255,255,255,.55)', lineHeight: 1.5, overflow: 'hidden' }}>
        {data.tipo === 'inicio' && <span style={{ color: '#00c896' }}>Início do fluxo</span>}
        {data.tipo === 'enviar_texto' && <span style={{ display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cfg.texto?.slice(0,55) || <em style={{ opacity:.5 }}>clique para editar...</em>}</span>}
        {data.tipo === 'enviar_botoes' && (
          <div>
            <div style={{ marginBottom: 4, color: 'rgba(255,255,255,.65)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cfg.corpo?.slice(0,40) || <em style={{ opacity:.5 }}>mensagem...</em>}</div>
            {botoes.map((b, i) => (
              <span key={i} style={{ fontSize: 9, background: 'rgba(255,255,255,.08)', borderRadius: 3, padding: '1px 6px', marginRight: 3, color: 'rgba(255,255,255,.5)', display: 'inline-block', marginBottom: 2, whiteSpace:'nowrap' }}>
                {typeof b === 'object' ? (b.label || '—') : String(b)}
              </span>
            ))}
          </div>
        )}
        {data.tipo === 'enviar_lista' && (
          <div>
            <div style={{ marginBottom: 5, color: 'rgba(255,255,255,.65)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontSize: 10 }}>{cfg.corpo?.slice(0,40) || <em style={{ opacity:.5 }}>mensagem...</em>}</div>
            {itensList.length > 0 ? itensList.map((l, i) => {
              const [id, ...rest] = l.split('|');
              const titulo = rest.join('|').trim() || id.trim();
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 3, paddingRight: 18 }}>
                  <span style={{ fontSize: 9.5, background:'rgba(62,207,255,.08)', border:'1px solid rgba(62,207,255,.15)', borderRadius:4, padding:'2px 7px', color: 'rgba(255,255,255,.6)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth: 155, flex:1 }}>
                    {titulo}
                  </span>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#3ecfff', flexShrink: 0, marginLeft: 5 }} />
                </div>
              );
            }) : <em style={{ opacity:.4, fontSize:10 }}>sem itens...</em>}
          </div>
        )}
        {data.tipo === 'condicao' && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}><span style={{ color: '#f5c518' }}>{cfg.variavel||'var'}</span> {cfg.operador||'=='} <span style={{ color: '#f5c518' }}>{cfg.valor||'valor'}</span></span>}
        {data.tipo === 'aguardar_resposta' && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}>salvar → <span style={{ color: '#f5c518', fontFamily:'monospace' }}>{`{{${cfg.variavel||'resposta'}}}`}</span></span>}
        {data.tipo === 'definir_variavel' && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}><span style={{ color:'#f5c518', fontFamily:'monospace' }}>{`{{${cfg.variavel||'var'}}}`}</span> = {cfg.valor?.slice(0,20)||'...'}</span>}
        {data.tipo === 'consultar_cliente' && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}>CPF: <span style={{ color:'#a78bfa',fontFamily:'monospace' }}>{'{{cliente.cpf}}'}</span>{cfg.max_tentativas ? <span style={{color:'rgba(255,255,255,.35)'}}> · {cfg.max_tentativas}x</span> : ''}</span>}
        {data.tipo === 'consultar_boleto' && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}>contrato: <span style={{ color:'#a78bfa',fontFamily:'monospace' }}>{'{{cliente.contrato}}'}</span></span>}
        {data.tipo === 'verificar_status' && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block', color:'#f5c518' }}>contrato: <span style={{fontFamily:'monospace'}}>{'{{cliente.contrato}}'}</span></span>}
        {data.tipo === 'verificar_manutencao' && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}>CPF: <span style={{ color:'#a78bfa',fontFamily:'monospace' }}>{'{{cliente.cpf}}'}</span></span>}
        {data.tipo === 'abrir_chamado' && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}>{cfg.descricao?.slice(0,40)||'Abrir chamado técnico'}</span>}
        {data.tipo === 'fechar_ocorrencia' && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}>OS: <span style={{ color:'#a78bfa',fontFamily:'monospace' }}>{'{{chamado.id}}'}</span></span>}
        {data.tipo === 'cancelar_contrato' && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}>contrato: <span style={{ color:'#ff6b35',fontFamily:'monospace' }}>{'{{cliente.contrato}}'}</span></span>}
        {data.tipo === 'promessa_pagamento' && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}>contrato: <span style={{ color:'#a78bfa',fontFamily:'monospace' }}>{'{{cliente.contrato}}'}</span></span>}
        {data.tipo === 'listar_planos' && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}>cidade: <span style={{ color:'#a78bfa',fontFamily:'monospace' }}>{cfg.cidade||'{{cliente.cidade}}'}</span></span>}
        {data.tipo === 'consultar_historico' && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}>contrato: <span style={{ color:'#a78bfa',fontFamily:'monospace' }}>{'{{cliente.contrato}}'}</span></span>}
        {data.tipo === 'consultar_radius' && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'block' }}>CPF: <span style={{ color:'#a78bfa',fontFamily:'monospace' }}>{'{{cliente.cpf}}'}</span></span>}
        {data.tipo === 'ia_responde' && <span>contexto: <span style={{ color:'#f472b6' }}>{cfg.contexto||'geral'}</span></span>}
        {data.tipo === 'ia_roteador' && (
          <div>
            <div style={{ color:'rgba(232,121,249,.7)', marginBottom:3, fontSize:10 }}>{cfg.mensagem?.slice(0,45) || 'Posso ajudar em mais algo?'}</div>
            {(Array.isArray(cfg.rotas)?cfg.rotas:[]).slice(0,4).map((r,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2, paddingRight:16 }}>
                <span style={{ fontSize:9.5, color:'rgba(255,255,255,.5)' }}>{r.label||r.id}</span>
                <div style={{ width:5, height:5, borderRadius:'50%', background:'#e879f9', flexShrink:0 }}/>
              </div>
            ))}
            {(Array.isArray(cfg.rotas)?cfg.rotas:[]).length>4 && <div style={{fontSize:9,color:'rgba(255,255,255,.3)'}}>+{cfg.rotas.length-4} rotas</div>}
            <div style={{ display:'flex', gap:4, marginTop:3 }}>
              <div style={{ width:5, height:5, borderRadius:'50%', background:'#888' }}/><span style={{fontSize:9,color:'rgba(255,255,255,.3)'}}>não entendeu</span>
              <div style={{ width:5, height:5, borderRadius:'50%', background:'#ff4757', marginLeft:4 }}/><span style={{fontSize:9,color:'rgba(255,255,255,.3)'}}>encerrar</span>
            </div>
          </div>
        )}
        {data.tipo === 'transferir_agente' && (cfg.motivo?.slice(0,40)||'Transferir para fila')}
        {data.tipo === 'enviar_flow' && <span style={{fontFamily:'monospace',fontSize:'.7rem',color:'#00c896'}}>Flow: {cfg.flow_id||'—'}</span>}
        {data.tipo === 'encerrar' && <span style={{ fontStyle:'italic' }}>{cfg.mensagem?.slice(0,45)||'Atendimento encerrado.'}</span>}
      </div>

      {/* Handle entrada */}
      {data.tipo !== 'inicio' && (
        <Handle type="target" position={Position.Left} style={{ width:10, height:10, background:'rgba(255,255,255,.2)', border:'1.5px solid rgba(255,255,255,.4)', left:-5 }} />
      )}

      {/* ── SAÍDAS COM LABELS ───────────────────────────────────────────── */}
      {(() => {
        // Definição centralizada de todas as portas fixas
        const PORTAS_FIXAS = {
          saida:               { color: def.color,   label: 'saída' },
          sim:                 { color: '#00c896',   label: 'sim' },
          nao:                 { color: '#ff4757',   label: 'não' },
          encontrado:          { color: '#00c896',   label: 'encontrado' },
          nao_encontrado:      { color: '#ff4757',   label: 'não encontrado' },
          multiplos_contratos: { color: '#3ecfff',   label: 'múltiplos' },
          max_tentativas:      { color: '#ff4757',   label: 'max tentativas' },
          ativo:               { color: '#00c896',   label: '1 — Ativo' },
          inativo:             { color: '#ff4757',   label: '2 — Inativo' },
          cancelado:           { color: '#ff6b35',   label: '3 — Cancelado' },
          suspenso:            { color: '#f5c518',   label: '4 — Suspenso' },
          inviabilidade:       { color: '#888',      label: '5 — Inviab. técnica' },
          novo:                { color: '#3ecfff',   label: '6 — Novo' },
          reduzido:            { color: '#a78bfa',   label: '7 — V. Reduzida' },
          online:              { color: '#00c896',   label: 'online' },
          offline:             { color: '#ff4757',   label: 'offline' },
          sucesso:             { color: '#00c896',   label: 'sucesso' },
          adimplente:          { color: '#3ecfff',   label: 'adimplente' },
          erro:                { color: '#ff4757',   label: 'erro' },
          resolvido:           { color: '#00c896',   label: 'resolvido' },
          transferir:          { color: '#ff6b35',   label: 'transferir' },
          max_turnos:          { color: '#f5c518',   label: 'max turnos' },
          nao_entendeu:        { color: '#888',      label: 'não entendeu' },
          encerrar:            { color: '#ff4757',   label: 'encerrar' },
        };

        // Monta lista de portas para este nó
        let portas = [];

        if (data.tipo === 'enviar_botoes') {
          portas = botoes.map((b, i) => {
            const id = typeof b === 'object' ? (b.id || b.label?.toLowerCase().replace(/\s+/g,'_') || `btn_${i}`) : `btn_${i}`;
            return { id, color:'#3ecfff', label: '' };
          });
        } else if (data.tipo === 'enviar_lista') {
          if (!itensList.length) {
            portas = [{ id:'saida', color:'#3ecfff', label: '' }];
          } else {
            portas = itensList.map(l => {
              const [id] = l.split('|');
              const bid = (id||'').trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'') || 'item';
              return { id: bid, color:'#3ecfff', label: '' };
            });
          }
        } else if (data.tipo === 'ia_roteador') {
          const rotas = Array.isArray(cfg.rotas) ? cfg.rotas : [];
          portas = [
            ...rotas.map(r => ({ id: r.id||'?', color:'#e879f9', label: '' })),
            { id:'nao_entendeu', color:'#888', label: '' },
            { id:'encerrar',     color:'#ff4757', label: '' },
          ];
        } else {
          portas = (def.portas||[]).filter(p => p !== 'saida' || def.portas.length === 1).map(p => ({
            id: p, ...( PORTAS_FIXAS[p] || { color: def.color, label: p }),
          }));
          if (def.portas?.includes('saida') && def.portas.length === 1) {
            return <Handle type="source" position={Position.Right} id="saida" style={{ width:10, height:10, background:def.color, border:'2px solid rgba(2,35,45,.95)', right:-5 }} />;
          }
        }

        if (!portas.length) return null;

        // Renderiza footer de saídas + handles posicionados
        const temLabels = portas.some(p => p.label);
        return (
          <>
            {temLabels && (
              <div style={{ borderTop:'1px solid rgba(255,255,255,.06)', padding:'4px 0 3px' }}>
                {portas.map((p) => (
                  <div key={p.id} style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', padding:'2px 20px 2px 10px', position:'relative', minHeight:20 }}>
                    {p.label && <span style={{ fontSize:9.5, color:'rgba(255,255,255,.38)', marginRight:7, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:140, textAlign:'right' }}>{p.label}</span>}
                    <div style={{ width:6, height:6, borderRadius:'50%', background:p.color, flexShrink:0 }} />
                    <Handle type="source" position={Position.Right} id={p.id}
                      style={{ position:'absolute', right:-5, top:'50%', transform:'translateY(-50%)', width:10, height:10, background:p.color, border:'2px solid rgba(2,35,45,.95)' }} />
                  </div>
                ))}
              </div>
            )}
            {!temLabels && portas.map((p, i) => {
              const top = portas.length === 1 ? 50 : (25 + (i / Math.max(portas.length-1,1)) * 50);
              return <Handle key={p.id} type="source" position={Position.Right} id={p.id}
                style={{ top:`${top}%`, width:10, height:10, background:p.color, border:'2px solid rgba(2,35,45,.95)', right:-5 }} />;
            })}
          </>
        );
      })()}
    </div>
  );
};

const nodeTypes = { fluxo: FlowNode };

/* ── PAINEL DE PROPRIEDADES ─────────────────────────────────────────────────── */
const inputStyle = { width:'100%', background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.1)', borderRadius:6, padding:'6px 9px', color:'#fff', fontSize:12, outline:'none', fontFamily:'DM Sans,sans-serif', boxSizing:'border-box' };
const taStyle = { ...inputStyle, resize:'vertical', fontFamily:'JetBrains Mono,monospace', lineHeight:1.5 };
const labelStyle = { fontSize:11, color:'rgba(255,255,255,.4)', marginBottom:4, fontWeight:600, letterSpacing:'.03em', display:'block' };

function Field({ label, children }) {
  return <div style={{ marginBottom:11 }}><span style={labelStyle}>{label}</span>{children}</div>;
}
function Hint({ children }) {
  return <div style={{ fontSize:10, color:'rgba(255,255,255,.25)', marginTop:3, fontStyle:'italic' }}>{children}</div>;
}

function PropsPanel({ node, onChange, onDelete }) {
  if (!node) return null;
  const def = NODE_TYPES_DEF[node.data.tipo] || {};
  const cfg = node.data.config || {};
  const set = (k, v) => onChange({ ...node.data, config: { ...cfg, [k]: v } });
  const botoes = Array.isArray(cfg.botoes) ? cfg.botoes : [];

  return (
    <div style={{ width:265, background:'rgba(2,30,40,.97)', border:'1px solid rgba(255,255,255,.1)', borderRadius:12, padding:16, display:'flex', flexDirection:'column', gap:0, overflowY:'auto', maxHeight:'calc(100vh - 120px)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:def.color||'#888', flexShrink:0 }} />
        <span style={{ fontSize:13, fontWeight:700, color:def.color||'#fff' }}>{def.label||node.data.tipo}</span>
        <button onClick={onDelete} style={{ marginLeft:'auto', background:'rgba(255,71,87,.12)', border:'1px solid rgba(255,71,87,.2)', color:'#ff4757', borderRadius:6, padding:'2px 8px', fontSize:11, cursor:'pointer' }}>Excluir</button>
      </div>

      {node.data.tipo === 'enviar_texto' && (
        <Field label="Texto da mensagem">
          <textarea value={cfg.texto||''} onChange={e=>set('texto',e.target.value)} rows={4} placeholder="Olá {{cliente.nome}}! Como posso ajudar?" style={taStyle} />
          <Hint>Use {'{{variavel}}'} para valores dinâmicos</Hint>
        </Field>
      )}

      {node.data.tipo === 'enviar_botoes' && (
        <>
          <Field label="Mensagem principal">
            <textarea value={cfg.corpo||''} onChange={e=>set('corpo',e.target.value)} rows={2} placeholder="Como posso te ajudar?" style={taStyle} />
          </Field>
          <Field label="Botões (máx 3)">
            {botoes.map((b, i) => {
              const label = typeof b === 'object' ? (b.label||'') : String(b);
              return (
                <div key={i} style={{ display:'flex', gap:6, marginBottom:5 }}>
                  <input value={label} onChange={e => {
                    const nb = [...botoes];
                    nb[i] = { label: e.target.value, id: e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'') };
                    set('botoes', nb);
                  }} placeholder={`Botão ${i+1}`} style={inputStyle} />
                  <button onClick={() => { const nb=[...botoes]; nb.splice(i,1); set('botoes',nb); }} style={{ background:'none', border:'none', color:'#ff4757', cursor:'pointer', fontSize:15, padding:'0 4px', flexShrink:0 }}>×</button>
                </div>
              );
            })}
            {botoes.length < 3 && (
              <button onClick={() => set('botoes',[...botoes, { label:'', id:'' }])}
                style={{ width:'100%', padding:'6px 0', background:'rgba(62,207,255,.08)', border:'1px dashed rgba(62,207,255,.3)', borderRadius:6, color:'#3ecfff', fontSize:11, cursor:'pointer', marginTop:2 }}>
                + Adicionar botão
              </button>
            )}
          </Field>
        </>
      )}

      {node.data.tipo === 'enviar_lista' && (
        <>
          <Field label="Mensagem"><textarea value={cfg.corpo||''} onChange={e=>set('corpo',e.target.value)} rows={2} placeholder="Selecione uma opção:" style={taStyle} /></Field>
          <Field label="Label do botão"><input value={cfg.label_botao||''} onChange={e=>set('label_botao',e.target.value)} placeholder="Ver opções" style={inputStyle} /></Field>
          <Field label="Título da seção"><input value={cfg.titulo_secao||''} onChange={e=>set('titulo_secao',e.target.value)} placeholder="Opções disponíveis" style={inputStyle} /></Field>
          <Field label="Itens da lista">{(() => {
            const linhas = (cfg.itens||'').split('\n').map(l=>l.trim()).filter(Boolean);
            const setLinhas = (arr) => set('itens', arr.join('\n'));
            return (
              <>
                {linhas.map((linha, i) => {
                  const [id, ...rest] = linha.split('|');
                  const titulo = rest.join('|');
                  return (
                    <div key={i} style={{ display:'flex', gap:4, marginBottom:5, alignItems:'center' }}>
                      <input value={id||''} onChange={e=>{const n=[...linhas];n[i]=`${e.target.value}|${titulo}`;setLinhas(n);}}
                        placeholder="id" title="ID (porta de saída)"
                        style={{...inputStyle, width:80, fontFamily:'monospace', fontSize:10, flex:'0 0 80px'}} />
                      <input value={titulo||''} onChange={e=>{const n=[...linhas];n[i]=`${id}|${e.target.value}`;setLinhas(n);}}
                        placeholder="Título exibido"
                        style={{...inputStyle, flex:1, fontSize:10.5}} />
                      <button onClick={()=>{const n=[...linhas];n.splice(i,1);setLinhas(n);}}
                        style={{background:'none',border:'none',color:'#ff4757',cursor:'pointer',fontSize:14,padding:'0 3px',flexShrink:0}}>×</button>
                    </div>
                  );
                })}
                <button onClick={()=>setLinhas([...linhas,'|'])}
                  style={{width:'100%',padding:'5px 0',background:'rgba(62,207,255,.05)',border:'1px dashed rgba(62,207,255,.25)',borderRadius:5,color:'#3ecfff',fontSize:11,cursor:'pointer',marginTop:2}}>
                  + Adicionar item
                </button>
                <Hint>ID = porta de saída no nó. Conecte cada um ao próximo passo.</Hint>
              </>
            );
          })()}</Field>
        </>
      )}

      {node.data.tipo === 'aguardar_resposta' && (
        <>
          <Field label="Mensagem (opcional)"><textarea value={cfg.mensagem||''} onChange={e=>set('mensagem',e.target.value)} rows={2} placeholder="Qual é o seu CPF?" style={taStyle} /></Field>
          <Field label="Salvar resposta em">
            <input value={cfg.variavel||''} onChange={e=>set('variavel',e.target.value)} placeholder="resposta" style={inputStyle} />
            <Hint>Disponível como {'{{resposta}}'} nos próximos nós</Hint>
          </Field>
        </>
      )}

      {node.data.tipo === 'condicao' && (
        <>
          <Field label="Variável"><input value={cfg.variavel||''} onChange={e=>set('variavel',e.target.value)} placeholder="cliente.cadastrado" style={inputStyle} /></Field>
          <Field label="Operador">
            <select value={cfg.operador||'=='} onChange={e=>set('operador',e.target.value)} style={inputStyle}>
              <option value="==">igual a</option>
              <option value="!=">diferente de</option>
              <option value=">">maior que</option>
              <option value="<">menor que</option>
              <option value="contem">contém</option>
              <option value="nao_contem">não contém</option>
              <option value="vazio">está vazio</option>
              <option value="nao_vazio">não está vazio</option>
            </select>
          </Field>
          <Field label="Valor"><input value={cfg.valor||''} onChange={e=>set('valor',e.target.value)} placeholder="true" style={inputStyle} /></Field>
        </>
      )}

      {node.data.tipo === 'definir_variavel' && (
        <>
          <Field label="Nome da variável"><input value={cfg.variavel||''} onChange={e=>set('variavel',e.target.value)} placeholder="minha_variavel" style={inputStyle} /></Field>
          <Field label="Valor"><input value={cfg.valor||''} onChange={e=>set('valor',e.target.value)} placeholder="{{resposta}}" style={inputStyle} /></Field>
        </>
      )}

      {node.data.tipo === 'consultar_cliente' && (
        <>
          <Field label="Pergunta para CPF/CNPJ (opcional)">
            <textarea value={cfg.pergunta||''} onChange={e=>set('pergunta',e.target.value)} rows={2}
              placeholder="Qual o seu CPF ou CNPJ?" style={taStyle} />
            <Hint>Se preenchido, o nó pergunta e aguarda a digitação antes de consultar. Deixe vazio se já tiver {'{{cliente.cpf}}'}</Hint>
          </Field>
          <Field label="Variável CPF/CNPJ">
            <input value={cfg.cpf||''} onChange={e=>set('cpf',e.target.value)} placeholder="{{cliente.cpf}}" style={inputStyle} />
          </Field>
          <Field label="Máx. tentativas de CPF errado">
            <input type="number" min={1} max={10} value={cfg.max_tentativas||3} onChange={e=>set('max_tentativas',parseInt(e.target.value)||3)} style={{...inputStyle, width:80}} />
            <Hint>Após este número de erros, sai pela porta vermelha "Máx. tentativas"</Hint>
          </Field>
          <Field label="Mensagem quando CPF não encontrado">
            <textarea value={cfg.mensagem_erro||''} onChange={e=>set('mensagem_erro',e.target.value)} rows={2}
              placeholder="CPF não encontrado. Verifique e tente novamente." style={taStyle} />
            <Hint>Enviada a cada erro antes de pedir o CPF de novo</Hint>
          </Field>
          <Field label="Exibir múltiplos contratos como">
            <div style={{ display:'flex', gap:8 }}>
              {[['lista','📋 Lista interativa'],['texto','🔢 Texto numerado']].map(([val, lbl]) => (
                <button key={val} onClick={()=>set('modo_contratos',val)}
                  style={{ flex:1, padding:'6px 8px', borderRadius:6, fontSize:11, cursor:'pointer', fontWeight: cfg.modo_contratos===val||(!cfg.modo_contratos&&val==='lista') ? 700 : 400,
                    background: cfg.modo_contratos===val||(!cfg.modo_contratos&&val==='lista') ? 'rgba(62,207,255,.15)' : 'rgba(255,255,255,.04)',
                    border: cfg.modo_contratos===val||(!cfg.modo_contratos&&val==='lista') ? '1px solid rgba(62,207,255,.4)' : '1px solid rgba(255,255,255,.08)',
                    color: cfg.modo_contratos===val||(!cfg.modo_contratos&&val==='lista') ? '#3ecfff' : 'rgba(255,255,255,.5)' }}>
                  {lbl}
                </button>
              ))}
            </div>
            <Hint>{cfg.modo_contratos==='texto' ? 'Envia lista numerada com emoji. Cliente digita 1, 2, 3...' : 'Envia lista nativa do WhatsApp. Cliente toca para selecionar.'}</Hint>
          </Field>
          <div style={{ marginBottom:11, padding:'8px 10px', background:'rgba(62,207,255,.05)', borderRadius:6, border:'1px solid rgba(62,207,255,.12)' }}>
            <div style={{ fontSize:10, color:'rgba(62,207,255,.7)', fontWeight:700, marginBottom:5, textTransform:'uppercase', letterSpacing:'.04em' }}>📋 Saídas do nó</div>
            <div style={{ fontSize:10.5, color:'rgba(255,255,255,.5)', lineHeight:1.7 }}>
              <span style={{ color:'#00c896' }}>●</span> <b>Encontrado</b> — 1 contrato, segue direto<br/>
              <span style={{ color:'#3ecfff' }}>●</span> <b>Múltiplos contratos</b> — cliente selecionou da lista<br/>
              <span style={{ color:'#ff4757' }}>●</span> <b>Máx. tentativas</b> — esgotou as tentativas
            </div>
          </div>
          <Hint>Preenche: cliente.nome, cliente.contrato, cliente.plano, cliente.status, cliente.cidade</Hint>
        </>
      )}

      {node.data.tipo === 'consultar_boleto' && (
        <>
          <Field label="ID do contrato">
            <input value={cfg.contrato||''} onChange={e=>set('contrato',e.target.value)} placeholder="{{cliente.contrato}}" style={inputStyle} />
          </Field>
          <Field label="Mensagem do boleto">
            <textarea value={cfg.mensagem_boleto||''} onChange={e=>set('mensagem_boleto',e.target.value)} rows={5}
              placeholder={'📄 *Boleto CITmax*\n\n💰 Valor: *R$ {{boleto.valor}}*\n📅 Vencimento: {{boleto.vencimento}}\n\n🔗 {{boleto.link}}\n\n💠 PIX:\n{{boleto.pix}}'} style={taStyle} />
            <Hint>Enviada automaticamente após encontrar o boleto. Use {'{{boleto.valor}}'}, {'{{boleto.vencimento}}'}, {'{{boleto.link}}'}, {'{{boleto.pix}}'}</Hint>
          </Field>
          <Field label="Mensagem quando não tem boleto">
            <textarea value={cfg.mensagem_sem_boleto||''} onChange={e=>set('mensagem_sem_boleto',e.target.value)} rows={2}
              placeholder="✅ Nenhum boleto em aberto. Conta em dia! 🎉" style={taStyle} />
          </Field>
          <Field label="Exibir múltiplos boletos como">
            <div style={{ display:'flex', gap:8 }}>
              {[['texto','🔢 Texto numerado'],['lista','📋 Lista interativa']].map(([val, lbl]) => (
                <button key={val} onClick={()=>set('modo_boletos',val)}
                  style={{ flex:1, padding:'6px 8px', borderRadius:6, fontSize:11, cursor:'pointer',
                    fontWeight: (cfg.modo_boletos||'texto')===val ? 700 : 400,
                    background: (cfg.modo_boletos||'texto')===val ? 'rgba(62,207,255,.15)' : 'rgba(255,255,255,.04)',
                    border: (cfg.modo_boletos||'texto')===val ? '1px solid rgba(62,207,255,.4)' : '1px solid rgba(255,255,255,.08)',
                    color: (cfg.modo_boletos||'texto')===val ? '#3ecfff' : 'rgba(255,255,255,.5)' }}>
                  {lbl}
                </button>
              ))}
            </div>
          </Field>
          <div style={{ padding:'8px 10px', background:'rgba(62,207,255,.05)', borderRadius:6, border:'1px solid rgba(62,207,255,.12)', marginBottom:11 }}>
            <div style={{ fontSize:10, color:'rgba(62,207,255,.7)', fontWeight:700, marginBottom:4, textTransform:'uppercase' }}>📋 Saídas</div>
            <div style={{ fontSize:10.5, color:'rgba(255,255,255,.5)', lineHeight:1.7 }}>
              <span style={{color:'#00c896'}}>●</span> <b>encontrado</b> — boleto enviado (1 ou múltiplos)<br/>
              <span style={{color:'#ff4757'}}>●</span> <b>nao_encontrado</b> — nenhum boleto em aberto
            </div>
          </div>
        </>
      )}

      {node.data.tipo === 'verificar_status' && (
        <>
          <Field label="ID do contrato">
            <div style={{ padding:'6px 9px', background:'rgba(245,197,24,.08)', border:'1px solid rgba(245,197,24,.2)', borderRadius:6, fontSize:12, fontFamily:'monospace', color:'#f5c518' }}>
              {'{{cliente.contrato}}'}
            </div>
            <Hint>Fixo — usa o contrato identificado do cliente</Hint>
          </Field>
          <div style={{ marginBottom:11 }}>
            <div style={{ fontSize:10, color:'rgba(245,197,24,.8)', fontWeight:700, marginBottom:8, textTransform:'uppercase', letterSpacing:'.04em' }}>📋 Saídas por status</div>
            {[
              { id:'ativo',         color:'#00c896', num:'1', label:'Ativo',                desc:'Contrato ativo, sem débito' },
              { id:'inativo',       color:'#ff4757', num:'2', label:'Inativo',              desc:'Contrato inativo' },
              { id:'cancelado',     color:'#ff6b35', num:'3', label:'Cancelado',            desc:'Contrato cancelado' },
              { id:'suspenso',      color:'#f5c518', num:'4', label:'Suspenso',             desc:'Suspenso por débito — pode fazer promessa' },
              { id:'inviabilidade', color:'#888',    num:'5', label:'Inviabilidade Técnica',desc:'Endereço sem cobertura técnica' },
              { id:'novo',          color:'#3ecfff', num:'6', label:'Novo',                 desc:'Contrato recém-criado' },
              { id:'reduzido',      color:'#a78bfa', num:'7', label:'Ativo V. Reduzida',    desc:'Velocidade reduzida — pode fazer promessa' },
            ].map(s => (
              <div key={s.id} style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:7, padding:'6px 8px', background:'rgba(255,255,255,.03)', borderRadius:6, border:`1px solid ${s.color}22` }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:s.color, flexShrink:0, marginTop:3 }} />
                <div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.8)', fontWeight:600 }}>{s.num} — {s.label}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginTop:1 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {node.data.tipo === 'verificar_conexao' && (
        <Field label="ID do contrato">
          <div style={{ padding:'6px 9px', background:'rgba(167,139,250,.08)', border:'1px solid rgba(167,139,250,.2)', borderRadius:6, fontSize:12, fontFamily:'monospace', color:'#a78bfa' }}>
            {'{{cliente.contrato}}'}
          </div>
          <Hint>Fixo — usa automaticamente o contrato do cliente identificado</Hint>
          <Hint>Saída "online" = conectado, "offline" = sem sinal</Hint>
        </Field>
      )}

      {node.data.tipo === 'verificar_manutencao' && (
        <Field label="CPF do cliente">
          <div style={{ padding:'6px 9px', background:'rgba(167,139,250,.08)', border:'1px solid rgba(167,139,250,.2)', borderRadius:6, fontSize:12, fontFamily:'monospace', color:'#a78bfa' }}>
            {'{{cliente.cpf}}'}
          </div>
          <Hint>Fixo — usa automaticamente o CPF do cliente identificado</Hint>
          <Hint>Preenche: manutencao.mensagem</Hint>
        </Field>
      )}

      {node.data.tipo === 'abrir_chamado' && (
        <>
          <Field label="ID do contrato">
            <div style={{ padding:'6px 9px', background:'rgba(167,139,250,.08)', border:'1px solid rgba(167,139,250,.2)', borderRadius:6, fontSize:12, fontFamily:'monospace', color:'#a78bfa' }}>
              {'{{cliente.contrato}}'}
            </div>
            <Hint>Fixo — usa automaticamente o contrato do cliente</Hint>
          </Field>
          <Field label="Tipo de chamado"><input value={cfg.tipo_id||''} onChange={e=>set('tipo_id',e.target.value)} placeholder="5 = Outros" style={inputStyle} /></Field>
          <Field label="Descrição"><textarea value={cfg.descricao||''} onChange={e=>set('descricao',e.target.value)} rows={2} placeholder="Chamado aberto via WhatsApp" style={taStyle} /></Field>
          <Hint>Preenche: chamado.protocolo</Hint>
        </>
      )}

      {node.data.tipo === 'fechar_ocorrencia' && (
        <>
          <Field label="ID da ocorrência"><input value={cfg.ocorrencia_id||''} onChange={e=>set('ocorrencia_id',e.target.value)} placeholder="{{chamado.id}}" style={inputStyle} /></Field>
          <Field label="Motivo de encerramento"><input value={cfg.conteudo||''} onChange={e=>set('conteudo',e.target.value)} placeholder="Resolvido via autoatendimento" style={inputStyle} /></Field>
        </>
      )}

      {node.data.tipo === 'cancelar_contrato' && (
        <>
          <Field label="ID do contrato">
            <div style={{ padding:'6px 9px', background:'rgba(167,139,250,.08)', border:'1px solid rgba(167,139,250,.2)', borderRadius:6, fontSize:12, fontFamily:'monospace', color:'#a78bfa' }}>
              {'{{cliente.contrato}}'}
            </div>
            <Hint>Fixo — usa automaticamente o contrato do cliente</Hint>
          </Field>
          <div style={{ marginTop:6, background:'rgba(255,71,87,.08)', border:'1px solid rgba(255,71,87,.2)', borderRadius:6, padding:'6px 9px', fontSize:11, color:'#ff6b35' }}>⚠️ Ação irreversível — use com condição de confirmação antes</div>
        </>
      )}

      {node.data.tipo === 'promessa_pagamento' && (
        <>
          <Field label="ID do contrato">
            <div style={{ padding:'6px 9px', background:'rgba(167,139,250,.08)', border:'1px solid rgba(167,139,250,.2)', borderRadius:6, fontSize:12, fontFamily:'monospace', color:'#a78bfa' }}>
              {'{{cliente.contrato}}'}
            </div>
            <Hint>Fixo — usa automaticamente o contrato do cliente</Hint>
          </Field>
          <div style={{ marginBottom:10, padding:'7px 9px', background:'rgba(62,207,255,.04)', borderRadius:6, border:'1px solid rgba(62,207,255,.1)', fontSize:10.5, color:'rgba(255,255,255,.45)', lineHeight:1.6 }}>
            ℹ️ Apenas contratos <b style={{color:'rgba(255,255,255,.7)'}}>Suspenso (4)</b> e <b style={{color:'rgba(255,255,255,.7)'}}>Ativo V. Reduzida (7)</b> podem fazer promessa. Status Ativo sai por <span style={{color:'#3ecfff'}}>adimplente</span>, outros por <span style={{color:'#ff4757'}}>erro</span>.
          </div>
          <Field label="✅ Mensagem de sucesso">
            <textarea value={cfg.mensagem_sucesso||''} onChange={e=>set('mensagem_sucesso',e.target.value)} rows={4}
              placeholder={'✅ *Promessa registrada!*\n\nAcesso liberado por {{promessa.dias}} dias.\n📅 Pague até: *{{promessa.data}}*\n🔑 Protocolo: {{promessa.protocolo}}'} style={taStyle} />
            <Hint>Variáveis: {'{{promessa.dias}}'}, {'{{promessa.data}}'}, {'{{promessa.protocolo}}'}</Hint>
          </Field>
          <Field label="🟢 Mensagem quando já está em dia (Ativo)">
            <textarea value={cfg.mensagem_adimplente||''} onChange={e=>set('mensagem_adimplente',e.target.value)} rows={3}
              placeholder={'✅ Seu contrato já está ativo e em dia!\nNão há necessidade de promessa. 🎉'} style={taStyle} />
            <Hint>Status 1 (Ativo) — contrato sem débito</Hint>
          </Field>
          <Field label="❌ Mensagem de erro">
            <textarea value={cfg.mensagem_erro||''} onChange={e=>set('mensagem_erro',e.target.value)} rows={3}
              placeholder={'❌ Não foi possível registrar a promessa.\n\n*Motivo:* {{promessa.motivo}}\n\nDeseja falar com um atendente?'} style={taStyle} />
            <Hint>Variável: {'{{promessa.motivo}}'} — ex: "já utilizado neste mês"</Hint>
          </Field>
          <div style={{ padding:'8px 10px', background:'rgba(167,139,250,.05)', borderRadius:6, border:'1px solid rgba(167,139,250,.12)', marginBottom:11 }}>
            <div style={{ fontSize:10, color:'rgba(167,139,250,.8)', fontWeight:700, marginBottom:4, textTransform:'uppercase' }}>📋 Saídas</div>
            <div style={{ fontSize:10.5, color:'rgba(255,255,255,.5)', lineHeight:1.8 }}>
              <span style={{color:'#00c896'}}>●</span> <b>sucesso</b> — promessa registrada, acesso liberado<br/>
              <span style={{color:'#3ecfff'}}>●</span> <b>adimplente</b> — status Ativo (1), sem débito<br/>
              <span style={{color:'#ff4757'}}>●</span> <b>erro</b> — já usou no mês, cancelado ou inválido
            </div>
          </div>
        </>
      )}

      {node.data.tipo === 'listar_planos' && (
        <Field label="Cidade">
          <input value={cfg.cidade||''} onChange={e=>set('cidade',e.target.value)} placeholder="{{cliente.cidade}}" style={inputStyle} />
          <Hint>Preenche: planos.lista (texto formatado)</Hint>
        </Field>
      )}

      {node.data.tipo === 'consultar_historico' && (
        <Field label="ID do contrato">
          <input value={cfg.contrato||''} onChange={e=>set('contrato',e.target.value)} placeholder="{{cliente.contrato}}" style={inputStyle} />
          <Hint>Preenche: historico.resumo</Hint>
        </Field>
      )}

      {node.data.tipo === 'consultar_radius' && (
        <Field label="CPF">
          <input value={cfg.cpf||''} onChange={e=>set('cpf',e.target.value)} placeholder="{{cliente.cpf}}" style={inputStyle} />
          <Hint>Retorna dados de acesso do Radius</Hint>
        </Field>
      )}

      {node.data.tipo === 'ia_roteador' && (() => {
        const rotas = Array.isArray(cfg.rotas) ? cfg.rotas : [];
        const setRotas = (r) => set('rotas', r);
        return (
          <>
            <Field label="Mensagem inicial">
              <textarea value={cfg.mensagem||''} onChange={e=>set('mensagem',e.target.value)} rows={2}
                placeholder="Posso te ajudar com mais alguma coisa? 😊" style={taStyle} />
              <Hint>Enviada antes de esperar a resposta do cliente</Hint>
            </Field>

            <Field label="Rotas (o que a IA pode direcionar)">
              {rotas.map((r, i) => (
                <div key={i} style={{ marginBottom:8, padding:'8px 10px', background:'rgba(232,121,249,.05)', borderRadius:7, border:'1px solid rgba(232,121,249,.15)' }}>
                  <div style={{ display:'flex', gap:5, marginBottom:5 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:9.5, color:'rgba(255,255,255,.3)', marginBottom:3 }}>ID da porta</div>
                      <input value={r.id||''} onChange={e=>{const n=[...rotas];n[i]={...n[i],id:e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')};setRotas(n);}}
                        placeholder="boleto" style={{...inputStyle, fontSize:11, fontFamily:'monospace'}} />
                    </div>
                    <div style={{ flex:2 }}>
                      <div style={{ fontSize:9.5, color:'rgba(255,255,255,.3)', marginBottom:3 }}>Label (nome amigável)</div>
                      <input value={r.label||''} onChange={e=>{const n=[...rotas];n[i]={...n[i],label:e.target.value};setRotas(n);}}
                        placeholder="2ª via de boleto" style={{...inputStyle, fontSize:11}} />
                    </div>
                    <button onClick={()=>{const n=[...rotas];n.splice(i,1);setRotas(n);}}
                      style={{ background:'none', border:'none', color:'#ff4757', cursor:'pointer', fontSize:15, padding:'0 4px', flexShrink:0, alignSelf:'flex-end', marginBottom:2 }}>×</button>
                  </div>
                  <div style={{ fontSize:9.5, color:'rgba(255,255,255,.3)', marginBottom:3 }}>Descrição para a IA</div>
                  <input value={r.descricao||''} onChange={e=>{const n=[...rotas];n[i]={...n[i],descricao:e.target.value};setRotas(n);}}
                    placeholder="quando o cliente quer ver ou pagar boleto" style={{...inputStyle, fontSize:10.5}} />
                </div>
              ))}
              <button onClick={()=>setRotas([...rotas,{id:'',label:'',descricao:''}])}
                style={{ width:'100%', padding:'6px 0', background:'rgba(232,121,249,.06)', border:'1px dashed rgba(232,121,249,.3)', borderRadius:6, color:'#e879f9', fontSize:11, cursor:'pointer', marginTop:2 }}>
                + Adicionar rota
              </button>
              <Hint>Cada rota vira uma porta de saída no nó. Conecte ao próximo nó do fluxo correspondente.</Hint>
            </Field>

            <div style={{ padding:'8px 10px', background:'rgba(232,121,249,.04)', borderRadius:6, border:'1px solid rgba(232,121,249,.1)', marginBottom:11 }}>
              <div style={{ fontSize:10, color:'rgba(232,121,249,.8)', fontWeight:700, marginBottom:5, textTransform:'uppercase' }}>📋 Saídas fixas</div>
              <div style={{ fontSize:10.5, color:'rgba(255,255,255,.5)', lineHeight:1.8 }}>
                <span style={{color:'#888'}}>●</span> <b>nao_entendeu</b> — IA não conseguiu classificar<br/>
                <span style={{color:'#ff4757'}}>●</span> <b>encerrar</b> — cliente disse tchau/obrigado/não precisa
              </div>
            </div>
          </>
        );
      })()}

      {node.data.tipo === 'ia_responde' && (
        <>
          <Field label="Contexto / assunto">
            <input value={cfg.contexto||''} onChange={e=>set('contexto',e.target.value)} placeholder="suporte, comercial, geral..." style={inputStyle} />
            <Hint>Define o tom e foco da IA neste ponto do fluxo</Hint>
          </Field>
          <Field label="Instrução extra">
            <textarea value={cfg.prompt||''} onChange={e=>set('prompt',e.target.value)} rows={3} placeholder="Ex: O cliente já está identificado. Ajude com suporte técnico. Abra chamado se necessário." style={taStyle} />
          </Field>

          <Field label="Modelo de IA">
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {[
                ['haiku',       '⚡ Claude Haiku',    'Rápido e eficiente — ideal para FAQ e respostas simples'],
                ['gpt-4o-mini', '🔵 GPT-4o-mini',     'Equilibrado — bom raciocínio e custo acessível'],
                ['sonnet',      '🧠 Claude Sonnet',   'Mais capaz — para casos complexos e análises'],
              ].map(([val, lbl, desc]) => (
                <button key={val} onClick={()=>set('modelo',val)} style={{
                  padding:'7px 10px', borderRadius:7, cursor:'pointer', textAlign:'left',
                  background: (cfg.modelo||'haiku')===val ? 'rgba(244,114,182,.12)' : 'rgba(255,255,255,.03)',
                  border: (cfg.modelo||'haiku')===val ? '1px solid rgba(244,114,182,.4)' : '1px solid rgba(255,255,255,.08)',
                }}>
                  <div style={{ fontSize:11, color:(cfg.modelo||'haiku')===val ? '#f472b6' : 'rgba(255,255,255,.7)', fontWeight:(cfg.modelo||'haiku')===val?700:400 }}>{lbl}</div>
                  <div style={{ fontSize:9.5, color:'rgba(255,255,255,.3)', marginTop:2 }}>{desc}</div>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Ferramentas disponíveis para a IA">
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {[
                ['segunda_via_boleto',  '📄 2ª via de boleto'],
                ['criar_chamado',       '🔧 Abrir chamado técnico'],
                ['verificar_conexao',   '📡 Verificar conexão'],
                ['promessa_pagamento',  '🤝 Promessa de pagamento'],
                ['verificar_cobertura', '📍 Verificar cobertura'],
                ['consultar_clientes',  '👤 Consultar cliente no SGP'],
              ].map(([tid, tlabel]) => {
                const ativas = Array.isArray(cfg.tools_ativas) ? cfg.tools_ativas : ['segunda_via_boleto','criar_chamado','verificar_conexao','promessa_pagamento'];
                const on = ativas.includes(tid);
                return (
                  <label key={tid} style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', padding:'4px 6px', borderRadius:5, background: on ? 'rgba(244,114,182,.07)' : 'rgba(255,255,255,.02)', border: on ? '1px solid rgba(244,114,182,.2)' : '1px solid rgba(255,255,255,.05)' }}>
                    <input type="checkbox" checked={on} onChange={()=>{
                      const curr = Array.isArray(cfg.tools_ativas) ? cfg.tools_ativas : ['segunda_via_boleto','criar_chamado','verificar_conexao','promessa_pagamento'];
                      set('tools_ativas', on ? curr.filter(t=>t!==tid) : [...curr, tid]);
                    }} style={{ accentColor:'#f472b6', width:13, height:13 }} />
                    <span style={{ fontSize:10.5, color: on ? 'rgba(244,114,182,.9)' : 'rgba(255,255,255,.4)' }}>{tlabel}</span>
                  </label>
                );
              })}
            </div>
            <Hint>A IA já recebe CPF, contrato e dados do cliente automaticamente</Hint>
          </Field>

          <Field label="Máx. de turnos">
            <input type="number" value={cfg.max_turns||5} onChange={e=>set('max_turns',parseInt(e.target.value)||5)} style={{...inputStyle, width:80}} />
            <Hint>Após este número de trocas, sai pela porta amarela "max_turnos"</Hint>
          </Field>

          <div style={{ padding:'8px 10px', background:'rgba(244,114,182,.05)', borderRadius:6, border:'1px solid rgba(244,114,182,.12)', marginBottom:11 }}>
            <div style={{ fontSize:10, color:'rgba(244,114,182,.8)', fontWeight:700, marginBottom:4, textTransform:'uppercase' }}>📋 Saídas</div>
            <div style={{ fontSize:10.5, color:'rgba(255,255,255,.5)', lineHeight:1.8 }}>
              <span style={{color:'#00c896'}}>●</span> <b>resolvido</b> — IA concluiu ou encerrou<br/>
              <span style={{color:'#ff6b35'}}>●</span> <b>transferir</b> — IA pediu atendente humano<br/>
              <span style={{color:'#f5c518'}}>●</span> <b>max_turnos</b> — esgotou o limite de trocas
            </div>
          </div>
        </>
      )}

      {node.data.tipo === 'transferir_agente' && (
        <>
          <Field label="Motivo"><textarea value={cfg.motivo||''} onChange={e=>set('motivo',e.target.value)} rows={2} placeholder="Cliente solicitou atendimento humano" style={taStyle} /></Field>
          <Hint>As variáveis disponíveis são enviadas como contexto para o agente</Hint>
        </>
      )}

      {node.data.tipo === 'enviar_flow' && (
        <>
          <Field label="Flow ID *">
            <input value={cfg.flow_id||''} onChange={e=>set('flow_id',e.target.value.trim())} placeholder="123456789012345" style={inputStyle}/>
            <div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginTop:3}}>ID do Flow criado no Meta Business Suite</div>
          </Field>
          <Field label="Cabeçalho">
            <input value={cfg.header||''} onChange={e=>set('header',e.target.value)} placeholder="CITmax Internet" style={inputStyle}/>
          </Field>
          <Field label="Corpo da mensagem">
            <textarea value={cfg.corpo||''} onChange={e=>set('corpo',e.target.value)} rows={2}
              placeholder="Preencha o formulário para contratar o plano:" style={taStyle}/>
          </Field>
          <Field label="Texto do botão">
            <input value={cfg.botao||''} onChange={e=>set('botao',e.target.value)} placeholder="📋 Fazer cadastro" style={inputStyle}/>
          </Field>
          <Field label="Flow Token">
            <input value={cfg.flow_token||''} onChange={e=>set('flow_token',e.target.value)} placeholder="FLOW_TOKEN_CITMAX" style={inputStyle}/>
            <div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginTop:3}}>Token de segurança (qualquer string)</div>
          </Field>
          <Hint>Saídas: <strong>concluido</strong> (cliente preencheu) · <strong>erro</strong> (falha)</Hint>
          <div style={{marginTop:8,padding:'7px 10px',background:'rgba(0,200,150,.06)',border:'1px solid rgba(0,200,150,.15)',borderRadius:7,fontSize:10,color:'rgba(0,200,150,.8)',lineHeight:1.5}}>
            💡 O endpoint dinâmico do Flow é:<br/>
            <span style={{fontFamily:'monospace',fontSize:9}}>POST https://maxxi.citmax.com.br/admin/api/wa/flows/data</span>
          </div>
        </>
      )}

      {node.data.tipo === 'encerrar' && (
        <Field label="Mensagem final">
          <textarea value={cfg.mensagem||''} onChange={e=>set('mensagem',e.target.value)} rows={2} placeholder="Obrigado pelo contato! 😊" style={taStyle} />
        </Field>
      )}

      {/* ── Alias — roteamento automático ──────────────────────────────── */}
      {node.data.tipo !== 'inicio' && (
        <div style={{ marginTop:10, padding:'8px 10px', background:'rgba(167,139,250,.05)', borderRadius:7, border:'1px solid rgba(167,139,250,.12)' }}>
          <div style={{ fontSize:10, color:'rgba(167,139,250,.8)', fontWeight:700, marginBottom:5, textTransform:'uppercase', letterSpacing:'.04em' }}>Alias (roteamento automático)</div>
          <input value={cfg.alias||''} onChange={e=>set('alias', e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''))}
            placeholder="ex: boleto, suporte, pagamento"
            style={{...inputStyle, fontFamily:'monospace', fontSize:11}} />
          <div style={{ fontSize:9.5, color:'rgba(255,255,255,.28)', marginTop:4, lineHeight:1.5 }}>
            Quando uma porta tiver o mesmo ID deste alias e <em>não</em> tiver linha manual, o motor vem direto pra cá. Linha manual sempre tem prioridade.
          </div>
        </div>
      )}

      {/* Variáveis disponíveis */}
      <div style={{ marginTop:12, padding:8, background:'rgba(255,255,255,.04)', borderRadius:7, border:'1px solid rgba(255,255,255,.06)' }}>
        <div style={{ fontSize:10, color:'rgba(255,255,255,.3)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6, fontWeight:600 }}>Variáveis disponíveis</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
          {VARS.map(v => (
            <button key={v} onClick={() => navigator.clipboard?.writeText(v)}
              style={{ fontSize:9.5, color:'rgba(255,255,255,.4)', fontFamily:'monospace', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:4, padding:'1px 6px', cursor:'pointer' }}
              title="Copiar">
              {v}
            </button>
          ))}
        </div>
        <div style={{ fontSize:9, color:'rgba(255,255,255,.2)', marginTop:5 }}>Clique para copiar</div>
      </div>
    </div>
  );
}

/* ── PALETA LATERAL ─────────────────────────────────────────────────────────── */
function NodePalette() {
  const onDragStart = (e, tipo) => {
    e.dataTransfer.setData('application/reactflow', tipo);
    e.dataTransfer.effectAllowed = 'move';
  };
  return (
    <div style={{ width:185, background:'rgba(2,30,40,.97)', borderRight:'1px solid rgba(255,255,255,.07)', padding:'10px 8px', overflowY:'auto', display:'flex', flexDirection:'column', flexShrink:0 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.3)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10, paddingLeft:4 }}>Nós</div>
      {Object.entries(GRUPOS).map(([grpKey, grp]) => (
        <div key={grpKey} style={{ marginBottom:8 }}>
          <div style={{ fontSize:9.5, color:grp.color, textTransform:'uppercase', letterSpacing:'.08em', fontWeight:700, margin:'4px 4px 5px', display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ flex:1, height:1, background:`${grp.color}33` }} />
            {grp.label}
            <div style={{ flex:1, height:1, background:`${grp.color}33` }} />
          </div>
          {Object.entries(NODE_TYPES_DEF).filter(([,d])=>d.group===grpKey).map(([tipo,d])=>(
            <div key={tipo} draggable onDragStart={e=>onDragStart(e,tipo)}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 8px', borderRadius:6, border:'1px solid rgba(255,255,255,.06)', background:'rgba(255,255,255,.02)', marginBottom:3, cursor:'grab', userSelect:'none', transition:'border-color .1s' }}
              onMouseEnter={e=>e.currentTarget.style.borderColor=d.color+'55'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,.06)'}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:d.color, flexShrink:0 }} />
              <span style={{ fontSize:10.5, color:'rgba(255,255,255,.65)', fontWeight:500 }}>{d.label}</span>
            </div>
          ))}
        </div>
      ))}
      <div style={{ marginTop:4, padding:'7px 6px', background:'rgba(255,255,255,.02)', borderRadius:6, border:'1px dashed rgba(255,255,255,.08)', fontSize:9.5, color:'rgba(255,255,255,.25)', textAlign:'center', lineHeight:1.5 }}>
        Arraste para o canvas
      </div>
    </div>
  );
}

/* ── EDITOR PRINCIPAL ───────────────────────────────────────────────────────── */
export default function FluxoEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useStore();
  const [fluxo, setFluxo] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedEdge, setSelectedEdge] = React.useState(null);

  React.useEffect(() => {
    const handler = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdge) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        setEdges(eds => eds.filter(ed => ed.id !== selectedEdge));
        setSelectedEdge(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedEdge]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [saving, setSaving] = useState(false);
  const reactFlowWrapper = useRef(null);
  const [rfInstance, setRfInstance] = useState(null);

  useEffect(() => { if (id) loadFluxo(); }, [id]);

  const loadFluxo = async () => {
    try {
      const f = await apiJson(`/api/fluxos/${id}`);
      setFluxo(f);
      const d = typeof f.dados === 'string' ? JSON.parse(f.dados) : f.dados;
      setNodes((d.nodes||[]).map(n => ({
        id: n.id, type: 'fluxo',
        position: { x: n.posX||0, y: n.posY||0 },
        data: { tipo: n.tipo, config: n.config||{} },
      })));
      setEdges((d.edges||[]).map(e => ({
        id: `e-${e.from}-${e.to}-${e.port||''}`,
        source: e.from, target: e.to,
        sourceHandle: e.port||'saida',
        markerEnd: { type: MarkerType.ArrowClosed, width:12, height:12, color:'rgba(255,255,255,.3)' },
        style: { stroke:'rgba(255,255,255,.22)', strokeWidth:1.5 },
      })));
    } catch { showToast('Erro ao carregar fluxo', true); }
  };

  const onConnect = useCallback((params) => setEdges(eds => addEdge({
    ...params,
    markerEnd: { type: MarkerType.ArrowClosed, width:12, height:12, color:'rgba(255,255,255,.3)' },
    style: { stroke:'rgba(255,255,255,.22)', strokeWidth:1.5 },
  }, eds)), []);

  const onEdgeClick = useCallback((_evt, edge) => {
    setEdges(eds => eds.map(e => e.id === edge.id
      ? { ...e, style:{ ...e.style, stroke:'#ff4757', strokeWidth:2 }, selected: true }
      : { ...e, style:{ stroke:'rgba(255,255,255,.22)', strokeWidth:1.5 }, selected: false }
    ));
    setSelectedEdge(edge.id);
  }, []);

  const onPaneClickEdge = useCallback(() => {
    setEdges(eds => eds.map(e => ({ ...e, style:{ stroke:'rgba(255,255,255,.22)', strokeWidth:1.5 }, selected:false })));
    setSelectedEdge(null);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const tipo = e.dataTransfer.getData('application/reactflow');
    if (!tipo || !rfInstance) return;
    const pos = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setNodes(ns => [...ns, { id:`n_${Date.now()}`, type:'fluxo', position:pos, data:{ tipo, config:{} } }]);
  }, [rfInstance]);

  const onDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect='move'; }, []);
  const onNodeClick = useCallback((_,n) => setSelectedNode(n), []);
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  const updateNodeData = useCallback((data) => {
    if (!selectedNode) return;
    setNodes(ns => ns.map(n => n.id===selectedNode.id ? {...n,data} : n));
    setSelectedNode(p => ({...p, data}));
  }, [selectedNode]);

  const deleteNode = useCallback(() => {
    if (!selectedNode) return;
    setNodes(ns => ns.filter(n => n.id!==selectedNode.id));
    setEdges(es => es.filter(e => e.source!==selectedNode.id && e.target!==selectedNode.id));
    setSelectedNode(null);
  }, [selectedNode]);

  const buildDados = () => ({
    nodes: nodes.map(n => ({ id:n.id, tipo:n.data.tipo, config:n.data.config||{}, posX:Math.round(n.position.x), posY:Math.round(n.position.y) })),
    edges: edges.map(e => ({ from:e.source, to:e.target, ...(e.sourceHandle && e.sourceHandle!=='saida' ? { port:e.sourceHandle } : {}) })),
  });

  const salvar = async () => {
    setSaving(true);
    try {
      await api(`/api/fluxos/${id}`, { method:'PUT', body:JSON.stringify({ nome:fluxo.nome, descricao:fluxo.descricao, dados:buildDados() }) });
      // Publica automaticamente ao salvar
      const r = await apiJson(`/api/fluxos/${id}/publicar`, { method:'POST' });
      setFluxo(r);
      showToast('✅ Salvo e publicado!');
    } catch { showToast('Erro ao salvar', true); }
    setSaving(false);
  };

  // Mantido apenas para compatibilidade interna — não exposto no UI
  const despublicar = async () => {
    try { await api(`/api/fluxos/${id}/despublicar`,{method:'POST'}); setFluxo(f=>({...f,publicado:false,ativo:false})); showToast('Fluxo despublicado'); }
    catch { showToast('Erro', true); }
  };

  const handleKeyDown = useCallback((e) => {
    if ((e.key==='Delete'||e.key==='Backspace') && selectedNode && !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) deleteNode();
    if ((e.ctrlKey||e.metaKey) && e.key==='s') { e.preventDefault(); salvar(); }
  }, [selectedNode, deleteNode, salvar]);

  useEffect(() => { window.addEventListener('keydown',handleKeyDown); return ()=>window.removeEventListener('keydown',handleKeyDown); }, [handleKeyDown]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100dvh - 52px)', overflow:'hidden' }}>
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 14px', background:'rgba(2,30,40,.97)', borderBottom:'1px solid rgba(255,255,255,.07)', flexShrink:0, zIndex:10 }}>
        <button onClick={()=>navigate('/fluxos')} style={{ background:'none', border:'none', color:'rgba(255,255,255,.35)', cursor:'pointer', fontSize:12, padding:'3px 7px', borderRadius:5 }}>← Fluxos</button>
        <div style={{ width:1, height:18, background:'rgba(255,255,255,.08)' }} />
        <input value={fluxo?.nome||''} onChange={e=>setFluxo(f=>({...f,nome:e.target.value}))}
          style={{ background:'none', border:'none', color:'#fff', fontSize:13, fontWeight:600, outline:'none', minWidth:180 }} placeholder="Nome do fluxo" />
        {fluxo?.publicado && <span style={{ fontSize:9.5, background:'rgba(0,200,150,.12)', color:'#00c896', border:'1px solid rgba(0,200,150,.22)', borderRadius:12, padding:'2px 8px', fontWeight:700 }}>● ATIVO v{fluxo.versao}</span>}
        <div style={{ display:'flex', gap:6, marginLeft:'auto', alignItems:'center' }}>
          <span style={{ fontSize:10, color:'rgba(255,255,255,.25)' }}>{nodes.length} nós · Ctrl+S salvar · Del excluir</span>
          <button onClick={salvar} disabled={saving} style={{ padding:'5px 14px', borderRadius:6, border:'none', background: saving ? 'rgba(255,255,255,.08)' : 'linear-gradient(135deg,#00c896,#008b87)', color: saving ? '#aaa' : '#032d3d', fontSize:11, cursor:'pointer', fontWeight:700 }}>
            {saving ? '...' : '💾 Salvar'}
          </button>
          {fluxo?.publicado && (
            <button onClick={despublicar} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid rgba(255,71,87,.2)', background:'rgba(255,71,87,.05)', color:'rgba(255,71,87,.6)', fontSize:10, cursor:'pointer' }}>Despublicar</button>
          )}
        </div>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <NodePalette />
        <div ref={reactFlowWrapper} style={{ flex:1, position:'relative' }}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={() => { onPaneClick(); onPaneClickEdge(); }}
            onEdgeClick={onEdgeClick}
            onInit={setRfInstance} nodeTypes={nodeTypes} deleteKeyCode={null}
            style={{ background:'transparent' }}
          >
            {selectedEdge && (
              <Panel position="top-center">
                <div style={{ background:'rgba(2,25,35,.95)', border:'1px solid rgba(255,71,87,.35)', borderRadius:8, padding:'6px 12px', display:'flex', alignItems:'center', gap:10, fontSize:12, color:'rgba(255,255,255,.7)' }}>
                  <span>Conexão selecionada</span>
                  <button onClick={() => { setEdges(eds=>eds.filter(e=>e.id!==selectedEdge)); setSelectedEdge(null); }}
                    style={{ background:'rgba(255,71,87,.15)', border:'1px solid rgba(255,71,87,.4)', borderRadius:5, color:'#ff4757', padding:'3px 10px', cursor:'pointer', fontSize:11, fontWeight:700 }}>
                    × Apagar
                  </button>
                  <button onClick={onPaneClickEdge}
                    style={{ background:'none', border:'1px solid rgba(255,255,255,.1)', borderRadius:5, color:'rgba(255,255,255,.4)', padding:'3px 8px', cursor:'pointer', fontSize:11 }}>
                    Cancelar
                  </button>
                </div>
              </Panel>
            )}
            <Background color="rgba(255,255,255,.04)" gap={24} size={1} />
            <Controls style={{ background:'rgba(2,30,40,.9)', border:'1px solid rgba(255,255,255,.08)', borderRadius:8 }} />
            <MiniMap style={{ background:'rgba(2,30,40,.9)', border:'1px solid rgba(255,255,255,.08)' }} nodeColor={n=>NODE_TYPES_DEF[n.data?.tipo]?.color||'#444'} />
            {nodes.length===0 && (
              <Panel position="top-center">
                <div style={{ marginTop:80, background:'rgba(2,30,40,.9)', border:'1px dashed rgba(255,255,255,.1)', borderRadius:12, padding:'24px 36px', textAlign:'center', color:'rgba(255,255,255,.35)', fontSize:13 }}>
                  <div style={{ fontSize:26, marginBottom:8 }}>✦</div>
                  <div style={{ fontWeight:600, marginBottom:3 }}>Canvas vazio</div>
                  <div style={{ fontSize:11 }}>Arraste um nó da paleta esquerda para começar</div>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>
        {selectedNode && (
          <div style={{ padding:10, background:'rgba(2,22,30,.97)', borderLeft:'1px solid rgba(255,255,255,.07)', overflowY:'auto', flexShrink:0 }}>
            <PropsPanel node={selectedNode} onChange={updateNodeData} onDelete={deleteNode} />
          </div>
        )}
      </div>
    </div>
  );
}
