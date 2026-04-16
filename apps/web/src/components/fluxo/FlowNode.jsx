import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { NODE_TYPES, PORTA_META } from '../../lib/nodeTypes';

// ── PREVIEW DE CONTEÚDO POR TIPO ──────────────────────────────────
function NodePreview({ tipo, config = {} }) {
  switch (tipo) {
    case 'inicio':
      return <span style={{ color: '#00E5A0', fontSize: 11 }}>Início do fluxo</span>;

    case 'gatilho_keyword':
      return (
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)' }}>
          {config.palavras?.split('\n')[0]?.slice(0, 30) || 'palavras-chave...'}
        </span>
      );

    case 'enviar_texto':
      return (
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,.65)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {config.texto?.slice(0, 55) || <em style={{ opacity: .5 }}>clique para editar...</em>}
        </span>
      );

    case 'enviar_cta':
      return (
        <div>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{config.corpo?.slice(0, 40) || 'mensagem...'}</span>
          <span style={{ fontSize: 10, color: '#3ecfff', fontWeight: 600 }}>🔗 {config.label || 'Botão com link'}</span>
        </div>
      );

    case 'enviar_imagem':
      return <span style={{ fontSize: 10, color: '#3ecfff' }}>🖼 {config.legenda?.slice(0, 35) || config.url?.slice(0, 35) || 'imagem...'}</span>;

    case 'enviar_audio':
      return <span style={{ fontSize: 10, color: '#3ecfff' }}>🎵 {config.url?.slice(0, 40) || 'áudio...'}</span>;

    case 'enviar_arquivo':
      return <span style={{ fontSize: 10, color: '#3ecfff' }}>📄 {config.filename || 'arquivo...'}</span>;

    case 'enviar_localizacao':
      return <span style={{ fontSize: 10, color: '#3ecfff' }}>📍 {config.nome || 'localização...'}</span>;

    case 'aguardar_tempo':
      return <span style={{ fontSize: 10, color: '#f5c518' }}>⏱ {config.segundos || 60}s</span>;

    case 'condicao':
      return (
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
          <span style={{ color: '#f5c518' }}>{config.variavel || 'var'}</span>
          {' '}{config.operador || '=='}{' '}
          <span style={{ color: '#f5c518' }}>{config.valor || 'valor'}</span>
        </span>
      );

    case 'aguardar_resposta':
      return (
        <span style={{ fontSize: 10 }}>
          salvar → <span style={{ color: '#f5c518', fontFamily: 'monospace' }}>{`{{${config.variavel || 'resposta'}}}`}</span>
        </span>
      );

    case 'definir_variavel':
      return (
        <span style={{ fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
          <span style={{ color: '#f5c518', fontFamily: 'monospace' }}>{`{{${config.variavel || 'var'}}}`}</span>
          {' = '}{config.valor?.slice(0, 20) || '...'}
        </span>
      );

    case 'divisao_ab':
      return <span style={{ fontSize: 10, color: '#f5c518' }}>A: {config.pct_a || 50}% · B: {100 - (config.pct_a || 50)}%</span>;

    case 'condicao_multipla':
      return <span style={{ fontSize: 10, color: '#f5c518' }}>{(config.ramos || []).length} condição(ões)</span>;

    case 'consultar_cliente':
      return <span style={{ fontSize: 10 }}>CPF: <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{'{{cliente.cpf}}'}</span></span>;

    case 'consultar_boleto':
      return <span style={{ fontSize: 10 }}>contrato: <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{'{{cliente.contrato}}'}</span></span>;

    case 'verificar_status':
      return <span style={{ fontSize: 10, color: '#f5c518', fontFamily: 'monospace' }}>{'{{cliente.contrato}}'}</span>;

    case 'abrir_chamado':
      return <span style={{ fontSize: 10 }}>{config.descricao?.slice(0, 40) || 'Abrir chamado técnico'}</span>;

    case 'promessa_pagamento':
      return <span style={{ fontSize: 10 }}>contrato: <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{'{{cliente.contrato}}'}</span></span>;

    case 'listar_planos':
      return <span style={{ fontSize: 10 }}>cidade: <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{config.cidade || '{{cliente.cidade}}'}</span></span>;

    case 'ia_responde':
      return <span style={{ fontSize: 10 }}>contexto: <span style={{ color: '#f472b6' }}>{config.contexto || 'geral'}</span></span>;

    case 'ia_roteador': {
      const rotas = Array.isArray(config.rotas) ? config.rotas : [];
      return (
        <div>
          <div style={{ fontSize: 10, color: 'rgba(232,121,249,.7)', marginBottom: 3 }}>{config.mensagem?.slice(0, 45) || 'Posso ajudar em mais algo?'}</div>
          {rotas.slice(0, 3).map((r, i) => (
            <div key={i} style={{ fontSize: 9.5, color: 'rgba(255,255,255,.45)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <span>{r.label || r.id}</span>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#e879f9', display: 'inline-block', flexShrink: 0 }} />
            </div>
          ))}
          {rotas.length > 3 && <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)' }}>+{rotas.length - 3} rotas</div>}
        </div>
      );
    }

    case 'transferir_agente':
      return <span style={{ fontSize: 10 }}>{config.motivo?.slice(0, 40) || 'Transferir para fila'}</span>;

    case 'chamada_http':
      return <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#fb923c' }}>{config.method || 'GET'} {config.url?.slice(0, 30) || 'url...'}</span>;

    case 'nota_interna':
      return <span style={{ fontSize: 10, color: '#fb923c' }}>📝 {config.nota?.slice(0, 40) || 'nota...'}</span>;

    case 'enviar_email':
      return <span style={{ fontSize: 10, color: '#fb923c' }}>📧 {config.assunto?.slice(0, 35) || config.para || 'e-mail...'}</span>;

    case 'nps_inline':
      return <span style={{ fontSize: 10, color: '#f472b6' }}>⭐ Pesquisa de satisfação</span>;

    case 'encerrar':
      return <span style={{ fontSize: 10, fontStyle: 'italic', color: 'rgba(255,255,255,.5)' }}>{config.mensagem?.slice(0, 45) || 'Atendimento encerrado.'}</span>;

    default:
      return null;
  }
}

// ── PORTAS DE SAÍDA ───────────────────────────────────────────────
function getPortas(tipo, config = {}) {
  const def = NODE_TYPES[tipo];
  if (!def) return [];

  if (tipo === 'enviar_botoes') {
    const botoes = Array.isArray(config.botoes) ? config.botoes : [];
    return botoes.map((b, i) => {
      const id = typeof b === 'object' ? (b.id || `btn_${i}`) : `btn_${i}`;
      return { id, color: '#3ecfff', label: typeof b === 'object' ? b.label : String(b) };
    });
  }

  if (tipo === 'enviar_lista') {
    const itens = Array.isArray(config.itens) ? config.itens : [];
    if (!itens.length) return [{ id: 'saida', color: '#3ecfff', label: 'saída' }];
    return itens.map(item => ({
      id: item.id || item.titulo?.toLowerCase().replace(/\s+/g, '_') || 'item',
      color: '#3ecfff',
      label: item.titulo || item.id || 'item',
    }));
  }

  if (tipo === 'ia_roteador') {
    const rotas = Array.isArray(config.rotas) ? config.rotas : [];
    return [
      ...rotas.map(r => ({ id: r.id || 'rota', color: '#e879f9', label: r.label || r.id })),
      { id: 'nao_entendeu', color: '#888', label: 'não entendeu' },
      { id: 'encerrar',     color: '#ff4757', label: 'encerrar' },
    ];
  }

  if (tipo === 'condicao_multipla') {
    const ramos = Array.isArray(config.ramos) ? config.ramos : [];
    return ramos.map(r => ({
      id: r.id || 'ramo',
      color: '#f5c518',
      label: r.label || r.id,
    }));
  }

  return def.portas.map(p => ({
    id: p,
    color: PORTA_META[p]?.color || def.color,
    label: PORTA_META[p]?.label || p,
  }));
}

// ── FLOW NODE ─────────────────────────────────────────────────────
const FlowNode = memo(({ data, selected }) => {
  const def    = NODE_TYPES[data.tipo] || { label: data.tipo, color: '#888', group: 'logica', portas: ['saida'] };
  const portas = getPortas(data.tipo, data.config || {});
  const isSingleSaida = portas.length === 1 && portas[0].id === 'saida';

  return (
    <div style={{
      background:   'rgba(10,15,20,.97)',
      border:       `1.5px solid ${selected ? def.color : 'rgba(255,255,255,.12)'}`,
      borderRadius: 10,
      minWidth:     165,
      maxWidth:     220,
      boxShadow:    selected ? `0 0 0 2px ${def.color}33` : '0 4px 16px rgba(0,0,0,.5)',
      fontFamily:   'DM Sans, sans-serif',
      fontSize:     12,
      color:        'rgba(255,255,255,.85)',
      cursor:       'default',
      transition:   'border-color .15s, box-shadow .15s',
    }}>
      {/* Header */}
      <div style={{
        padding:         '7px 10px 6px',
        borderBottom:    'portas.length > 1 ? 1px solid rgba(255,255,255,.06) : none',
        display:         'flex',
        alignItems:      'center',
        gap:             6,
      }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: def.color, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: def.color, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          {def.label}
        </span>
      </div>

      {/* Preview */}
      <div style={{ padding: '6px 10px 7px', minHeight: 22 }}>
        <NodePreview tipo={data.tipo} config={data.config || {}} />
      </div>

      {/* Handle de entrada (esquerda) — todos exceto início */}
      {data.tipo !== 'inicio' && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ width: 10, height: 10, background: 'rgba(255,255,255,.2)', border: '1.5px solid rgba(255,255,255,.4)', left: -5 }}
        />
      )}

      {/* Saídas */}
      {isSingleSaida ? (
        // Porta única — handle simples no centro direito
        <Handle
          type="source"
          position={Position.Right}
          id="saida"
          style={{ width: 10, height: 10, background: def.color, border: '2px solid rgba(10,15,20,.95)', right: -5 }}
        />
      ) : portas.length > 0 ? (
        // Múltiplas portas — renderiza footer com labels
        <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 3, paddingBottom: 3 }}>
          {portas.map((p, i) => {
            const topPct = portas.length === 1 ? 50 : 25 + (i / Math.max(portas.length - 1, 1)) * 50;
            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                padding: '2px 20px 2px 10px', position: 'relative', minHeight: 20,
              }}>
                {p.label && (
                  <span style={{
                    fontSize: 9.5, color: 'rgba(255,255,255,.38)', marginRight: 7,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: 140, textAlign: 'right',
                  }}>
                    {p.label}
                  </span>
                )}
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                <Handle
                  type="source"
                  position={Position.Right}
                  id={p.id}
                  style={{
                    position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)',
                    width: 10, height: 10, background: p.color, border: '2px solid rgba(10,15,20,.95)',
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});

FlowNode.displayName = 'FlowNode';
export default FlowNode;
