import { X, Trash2 } from 'lucide-react';
import { NODE_TYPES } from '../../lib/nodeTypes';

const iStyle = {
  width: '100%', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 6, padding: '6px 9px', color: '#fff', fontSize: 12, outline: 'none',
  fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
};
const taStyle = { ...iStyle, resize: 'vertical', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.5 };
const lblStyle = { fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 4, fontWeight: 600, letterSpacing: '.03em', display: 'block' };

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <span style={lblStyle}>{label}</span>
      {children}
      {hint && <div style={{ fontSize: 10, color: 'rgba(255,255,255,.25)', marginTop: 3, fontStyle: 'italic' }}>{hint}</div>}
    </div>
  );
}

function BotaoEditor({ botoes, onChange }) {
  const add = () => onChange([...botoes, { id: `btn_${botoes.length}`, label: '' }]);
  const upd = (i, field, val) => {
    const next = botoes.map((b, j) => j === i ? { ...b, [field]: val } : b);
    onChange(next);
  };
  const del = (i) => onChange(botoes.filter((_, j) => j !== i));

  return (
    <div>
      {botoes.map((b, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 5, alignItems: 'center' }}>
          <input value={b.id || ''} onChange={e => upd(i, 'id', e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''))}
            placeholder="id" title="ID (porta de saída)"
            style={{ ...iStyle, width: 70, fontFamily: 'monospace', fontSize: 10, flex: '0 0 70px' }} />
          <input value={b.label || ''} onChange={e => upd(i, 'label', e.target.value)}
            placeholder="Texto do botão" style={{ ...iStyle, flex: 1, fontSize: 11 }} />
          <button onClick={() => del(i)} style={{ background: 'none', border: 'none', color: '#ff4757', cursor: 'pointer', fontSize: 15, padding: '0 3px', flexShrink: 0 }}>×</button>
        </div>
      ))}
      {botoes.length < 3 && (
        <button onClick={add} style={{ ...iStyle, cursor: 'pointer', background: 'rgba(62,207,255,.08)', border: '1px dashed rgba(62,207,255,.3)', color: '#3ecfff', textAlign: 'center', width: '100%' }}>
          + Adicionar botão
        </button>
      )}
    </div>
  );
}

function ItemListaEditor({ itens, onChange }) {
  const add = () => onChange([...itens, { id: `item_${itens.length}`, titulo: '' }]);
  const upd = (i, field, val) => onChange(itens.map((it, j) => j === i ? { ...it, [field]: val } : it));
  const del = (i) => onChange(itens.filter((_, j) => j !== i));

  return (
    <div>
      {itens.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 5, alignItems: 'center' }}>
          <input value={it.id || ''} onChange={e => upd(i, 'id', e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''))}
            placeholder="id" style={{ ...iStyle, width: 80, fontFamily: 'monospace', fontSize: 10, flex: '0 0 80px' }} />
          <input value={it.titulo || ''} onChange={e => upd(i, 'titulo', e.target.value)}
            placeholder="Título" style={{ ...iStyle, flex: 1, fontSize: 11 }} />
          <button onClick={() => del(i)} style={{ background: 'none', border: 'none', color: '#ff4757', cursor: 'pointer', fontSize: 15, padding: '0 3px' }}>×</button>
        </div>
      ))}
      <button onClick={add} style={{ ...iStyle, cursor: 'pointer', background: 'rgba(62,207,255,.08)', border: '1px dashed rgba(62,207,255,.3)', color: '#3ecfff', textAlign: 'center', width: '100%' }}>
        + Adicionar item
      </button>
    </div>
  );
}

function RotaEditor({ rotas, onChange }) {
  const add = () => onChange([...rotas, { id: `rota_${rotas.length}`, label: '' }]);
  const upd = (i, field, val) => onChange(rotas.map((r, j) => j === i ? { ...r, [field]: val } : r));
  const del = (i) => onChange(rotas.filter((_, j) => j !== i));

  return (
    <div>
      {rotas.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 5, alignItems: 'center' }}>
          <input value={r.id || ''} onChange={e => upd(i, 'id', e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''))}
            placeholder="id" style={{ ...iStyle, width: 80, fontFamily: 'monospace', fontSize: 10, flex: '0 0 80px' }} />
          <input value={r.label || ''} onChange={e => upd(i, 'label', e.target.value)}
            placeholder="Intenção" style={{ ...iStyle, flex: 1, fontSize: 11 }} />
          <button onClick={() => del(i)} style={{ background: 'none', border: 'none', color: '#ff4757', cursor: 'pointer', fontSize: 15, padding: '0 3px' }}>×</button>
        </div>
      ))}
      <button onClick={add} style={{ ...iStyle, cursor: 'pointer', background: 'rgba(232,121,249,.08)', border: '1px dashed rgba(232,121,249,.3)', color: '#e879f9', textAlign: 'center', width: '100%' }}>
        + Adicionar rota
      </button>
    </div>
  );
}

export default function PropsPanel({ node, onChange, onDelete, onClose }) {
  if (!node) return null;

  const def = NODE_TYPES[node.data.tipo] || {};
  const cfg = node.data.config || {};
  const set = (k, v) => onChange({ ...node.data, config: { ...cfg, [k]: v } });

  return (
    <div style={{
      width: 275, background: 'rgba(8,14,20,.97)',
      border: '1px solid rgba(255,255,255,.1)', borderRadius: 12,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,.6)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: def.color || '#888', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: def.color || '#fff', flex: 1 }}>{def.label || node.data.tipo}</span>
        <button onClick={() => onDelete(node.id)} style={{ background: 'rgba(255,71,87,.12)', border: '1px solid rgba(255,71,87,.2)', color: '#ff4757', borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>
          Excluir
        </button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 16, padding: '0 2px' }}>
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>

        {/* ── GATILHO KEYWORD ── */}
        {node.data.tipo === 'gatilho_keyword' && (
          <>
            <Field label="Palavras-chave (uma por linha)" hint="O cliente digita exatamente isso para ativar este nó">
              <textarea value={cfg.palavras || ''} onChange={e => set('palavras', e.target.value)} rows={4}
                placeholder={'boleto\nsuporte\ncancelar\n2a via'} style={taStyle} />
            </Field>
            <Field label="Tipo de comparação">
              <select value={cfg.exato !== false ? 'exato' : 'contem'} onChange={e => set('exato', e.target.value === 'exato')}
                style={{ ...iStyle, cursor: 'pointer' }}>
                <option value="exato">Exato — mensagem igual à palavra</option>
                <option value="contem">Contém — palavra aparece na mensagem</option>
              </select>
            </Field>
          </>
        )}

        {/* ── ENVIAR TEXTO ── */}
        {node.data.tipo === 'enviar_texto' && (
          <Field label="Texto da mensagem" hint="Use {{variavel}} para inserir dados dinâmicos">
            <textarea value={cfg.texto || ''} onChange={e => set('texto', e.target.value)} rows={5}
              placeholder="Olá {{cliente.nome}}! Como posso ajudar?" style={taStyle} />
          </Field>
        )}

        {/* ── ENVIAR CTA ── */}
        {node.data.tipo === 'enviar_cta' && (
          <>
            <Field label="Mensagem (corpo)">
              <textarea value={cfg.corpo || ''} onChange={e => set('corpo', e.target.value)} rows={3}
                placeholder="Clique abaixo para acessar sua fatura 👇" style={taStyle} />
            </Field>
            <Field label="Texto do botão (máx 20 caracteres)">
              <input value={cfg.label || ''} onChange={e => set('label', e.target.value.slice(0, 20))}
                placeholder="Ver fatura" style={iStyle} maxLength={20} />
            </Field>
            <Field label="URL do botão" hint="Suporta variáveis: {{boleto.link}}">
              <input value={cfg.url || ''} onChange={e => set('url', e.target.value)}
                placeholder="https://..." style={iStyle} />
            </Field>
            <Field label="Rodapé (opcional)">
              <input value={cfg.rodape || ''} onChange={e => set('rodape', e.target.value.slice(0, 60))}
                placeholder="Sua empresa" style={iStyle} maxLength={60} />
            </Field>
          </>
        )}

        {/* ── ENVIAR IMAGEM ── */}
        {node.data.tipo === 'enviar_imagem' && (
          <>
            <Field label="URL da imagem">
              <input value={cfg.url || ''} onChange={e => set('url', e.target.value)}
                placeholder="https://..." style={iStyle} />
            </Field>
            <Field label="Legenda (opcional)">
              <input value={cfg.legenda || ''} onChange={e => set('legenda', e.target.value)}
                placeholder="Legenda da imagem" style={iStyle} />
            </Field>
          </>
        )}

        {/* ── ENVIAR ÁUDIO ── */}
        {node.data.tipo === 'enviar_audio' && (
          <Field label="URL do áudio (MP3, OGG)">
            <input value={cfg.url || ''} onChange={e => set('url', e.target.value)}
              placeholder="https://..." style={iStyle} />
          </Field>
        )}

        {/* ── ENVIAR ARQUIVO ── */}
        {node.data.tipo === 'enviar_arquivo' && (
          <>
            <Field label="URL do arquivo">
              <input value={cfg.url || ''} onChange={e => set('url', e.target.value)}
                placeholder="https://..." style={iStyle} />
            </Field>
            <Field label="Nome do arquivo">
              <input value={cfg.filename || ''} onChange={e => set('filename', e.target.value)}
                placeholder="documento.pdf" style={iStyle} />
            </Field>
          </>
        )}

        {/* ── ENVIAR LOCALIZAÇÃO ── */}
        {node.data.tipo === 'enviar_localizacao' && (
          <>
            <Field label="Nome do local">
              <input value={cfg.nome || ''} onChange={e => set('nome', e.target.value)}
                placeholder="Escritório central" style={iStyle} />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Latitude" hint="">
                <input value={cfg.lat || ''} onChange={e => set('lat', e.target.value)}
                  placeholder="-5.7945" style={iStyle} />
              </Field>
              <Field label="Longitude" hint="">
                <input value={cfg.lng || ''} onChange={e => set('lng', e.target.value)}
                  placeholder="-35.2110" style={iStyle} />
              </Field>
            </div>
          </>
        )}

        {/* ── ENVIAR BOTÕES ── */}
        {node.data.tipo === 'enviar_botoes' && (
          <>
            <Field label="Mensagem (corpo)">
              <textarea value={cfg.corpo || ''} onChange={e => set('corpo', e.target.value)} rows={3}
                placeholder="Como posso ajudar?" style={taStyle} />
            </Field>
            <Field label="Botões (máx 3)" hint="Cada botão vira uma porta de saída">
              <BotaoEditor botoes={Array.isArray(cfg.botoes) ? cfg.botoes : []} onChange={v => set('botoes', v)} />
            </Field>
          </>
        )}

        {/* ── ENVIAR LISTA ── */}
        {node.data.tipo === 'enviar_lista' && (
          <>
            <Field label="Mensagem (corpo)">
              <textarea value={cfg.corpo || ''} onChange={e => set('corpo', e.target.value)} rows={3}
                placeholder="Escolha uma das opções" style={taStyle} />
            </Field>
            <Field label="Texto do botão da lista">
              <input value={cfg.botao || ''} onChange={e => set('botao', e.target.value)}
                placeholder="Ver opções" style={iStyle} />
            </Field>
            <Field label="Título da seção">
              <input value={cfg.secao || ''} onChange={e => set('secao', e.target.value)}
                placeholder="Opções disponíveis" style={iStyle} />
            </Field>
            <Field label="Itens da lista" hint="Cada item vira uma porta de saída">
              <ItemListaEditor itens={Array.isArray(cfg.itens) ? cfg.itens : []} onChange={v => set('itens', v)} />
            </Field>
          </>
        )}

        {/* ── AGUARDAR TEMPO ── */}
        {node.data.tipo === 'aguardar_tempo' && (
          <Field label="Aguardar (segundos)">
            <input type="number" value={cfg.segundos || 60} onChange={e => set('segundos', Number(e.target.value))}
              min={1} max={86400} style={iStyle} />
          </Field>
        )}

        {/* ── AGUARDAR RESPOSTA ── */}
        {node.data.tipo === 'aguardar_resposta' && (
          <>
            <Field label="Salvar resposta em variável" hint="Ex: cpf → disponível como {{cpf}}">
              <input value={cfg.variavel || ''} onChange={e => set('variavel', e.target.value.replace(/\s+/g, '_'))}
                placeholder="cpf" style={{ ...iStyle, fontFamily: 'monospace' }} />
            </Field>
            <Field label="Tempo limite (segundos, 0 = sem limite)">
              <input type="number" value={cfg.timeout || 0} onChange={e => set('timeout', Number(e.target.value))}
                min={0} style={iStyle} />
            </Field>
            <Field label="Máx tentativas inválidas">
              <input type="number" value={cfg.max_tentativas || 3} onChange={e => set('max_tentativas', Number(e.target.value))}
                min={1} max={10} style={iStyle} />
            </Field>
          </>
        )}

        {/* ── CONDIÇÃO ── */}
        {node.data.tipo === 'condicao' && (
          <>
            <Field label="Variável">
              <input value={cfg.variavel || ''} onChange={e => set('variavel', e.target.value)}
                placeholder="cliente.status" style={{ ...iStyle, fontFamily: 'monospace' }} />
            </Field>
            <Field label="Operador">
              <select value={cfg.operador || '=='} onChange={e => set('operador', e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}>
                <option value="==">== igual a</option>
                <option value="!=">!= diferente de</option>
                <option value=">">{'>'} maior que</option>
                <option value="<">{'<'} menor que</option>
                <option value="contem">contém</option>
                <option value="nao_contem">não contém</option>
                <option value="vazio">está vazio</option>
                <option value="nao_vazio">não está vazio</option>
              </select>
            </Field>
            <Field label="Valor">
              <input value={cfg.valor || ''} onChange={e => set('valor', e.target.value)}
                placeholder="ativo" style={{ ...iStyle, fontFamily: 'monospace' }} />
            </Field>
          </>
        )}

        {/* ── DEFINIR VARIÁVEL ── */}
        {node.data.tipo === 'definir_variavel' && (
          <>
            <Field label="Variável">
              <input value={cfg.variavel || ''} onChange={e => set('variavel', e.target.value.replace(/\s+/g, '_'))}
                placeholder="nome_variavel" style={{ ...iStyle, fontFamily: 'monospace' }} />
            </Field>
            <Field label="Valor" hint="Suporta {{variavel}} e texto literal">
              <input value={cfg.valor || ''} onChange={e => set('valor', e.target.value)}
                placeholder="valor ou {{outra_variavel}}" style={{ ...iStyle, fontFamily: 'monospace' }} />
            </Field>
          </>
        )}

        {/* ── DIVISÃO A/B ── */}
        {node.data.tipo === 'divisao_ab' && (
          <Field label={`Percentual do caminho A: ${cfg.pct_a || 50}%`}>
            <input type="range" min={10} max={90} value={cfg.pct_a || 50}
              onChange={e => set('pct_a', Number(e.target.value))}
              style={{ width: '100%', accentColor: '#3ecfff' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 4 }}>
              <span>A: {cfg.pct_a || 50}%</span>
              <span>B: {100 - (cfg.pct_a || 50)}%</span>
            </div>
          </Field>
        )}

        {/* ── IA RESPONDE ── */}
        {node.data.tipo === 'ia_responde' && (
          <>
            <Field label="Contexto / especialidade" hint="Define o foco da IA neste nó">
              <input value={cfg.contexto || ''} onChange={e => set('contexto', e.target.value)}
                placeholder="suporte técnico, financeiro, geral..." style={iStyle} />
            </Field>
            <Field label="Instrução adicional" hint="Complementa o prompt base">
              <textarea value={cfg.instrucao || ''} onChange={e => set('instrucao', e.target.value)} rows={3}
                placeholder="Foque em resolver problemas de conexão..." style={taStyle} />
            </Field>
            <Field label="Máx turnos sem resolver">
              <input type="number" value={cfg.max_turnos || 5} onChange={e => set('max_turnos', Number(e.target.value))}
                min={1} max={20} style={iStyle} />
            </Field>
          </>
        )}

        {/* ── IA ROTEADOR ── */}
        {node.data.tipo === 'ia_roteador' && (
          <>
            <Field label="Mensagem para o cliente">
              <textarea value={cfg.mensagem || ''} onChange={e => set('mensagem', e.target.value)} rows={2}
                placeholder="Posso ajudar em mais algo?" style={taStyle} />
            </Field>
            <Field label="Rotas (intenções)" hint="A IA identifica a intenção e roteia">
              <RotaEditor rotas={Array.isArray(cfg.rotas) ? cfg.rotas : []} onChange={v => set('rotas', v)} />
            </Field>
          </>
        )}

        {/* ── TRANSFERIR AGENTE ── */}
        {node.data.tipo === 'transferir_agente' && (
          <>
            <Field label="Motivo da transferência">
              <input value={cfg.motivo || ''} onChange={e => set('motivo', e.target.value)}
                placeholder="Suporte técnico" style={iStyle} />
            </Field>
            <Field label="Mensagem ao cliente">
              <textarea value={cfg.mensagem || ''} onChange={e => set('mensagem', e.target.value)} rows={2}
                placeholder="Aguarde, vou transferir para um atendente..." style={taStyle} />
            </Field>
          </>
        )}

        {/* ── CHAMADA HTTP ── */}
        {node.data.tipo === 'chamada_http' && (
          <>
            <Field label="Método">
              <select value={cfg.method || 'GET'} onChange={e => set('method', e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}>
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="URL" hint="Suporta {{variavel}}">
              <input value={cfg.url || ''} onChange={e => set('url', e.target.value)}
                placeholder="https://api.seusite.com/endpoint" style={iStyle} />
            </Field>
            <Field label="Headers (JSON)" hint='{"Authorization": "Bearer token"}'>
              <textarea value={cfg.headers || ''} onChange={e => set('headers', e.target.value)} rows={2}
                placeholder="{}" style={{ ...taStyle, fontSize: 10 }} />
            </Field>
            <Field label="Body (JSON)" hint="Suporta {{variavel}}">
              <textarea value={cfg.body || ''} onChange={e => set('body', e.target.value)} rows={3}
                placeholder='{"cpf": "{{cliente.cpf}}"}' style={{ ...taStyle, fontSize: 10 }} />
            </Field>
            <Field label="Salvar resposta em" hint="Ex: resposta_api">
              <input value={cfg.salvar_em || ''} onChange={e => set('salvar_em', e.target.value)}
                placeholder="resposta_api" style={{ ...iStyle, fontFamily: 'monospace' }} />
            </Field>
          </>
        )}

        {/* ── ABRIR CHAMADO ── */}
        {node.data.tipo === 'abrir_chamado' && (
          <>
            <Field label="Descrição do chamado" hint="Suporta {{variavel}}">
              <textarea value={cfg.descricao || ''} onChange={e => set('descricao', e.target.value)} rows={3}
                placeholder="Solicitação de suporte técnico - {{cliente.nome}}" style={taStyle} />
            </Field>
            <Field label="Tipo do chamado">
              <select value={cfg.tipo || ''} onChange={e => set('tipo', e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}>
                <option value="">Selecionar tipo...</option>
                <option value="tecnico">Técnico</option>
                <option value="financeiro">Financeiro</option>
                <option value="comercial">Comercial</option>
              </select>
            </Field>
          </>
        )}

        {/* ── NOTA INTERNA ── */}
        {node.data.tipo === 'nota_interna' && (
          <Field label="Nota" hint="Visível apenas para agentes">
            <textarea value={cfg.nota || ''} onChange={e => set('nota', e.target.value)} rows={3}
              placeholder="Informação relevante sobre este atendimento..." style={taStyle} />
          </Field>
        )}

        {/* ── ENVIAR EMAIL ── */}
        {node.data.tipo === 'enviar_email' && (
          <>
            <Field label="Para (destinatário)" hint="Ex: {{cliente.email}} ou fixo@email.com">
              <input value={cfg.para || ''} onChange={e => set('para', e.target.value)}
                placeholder="{{cliente.email}}" style={iStyle} />
            </Field>
            <Field label="Assunto">
              <input value={cfg.assunto || ''} onChange={e => set('assunto', e.target.value)}
                placeholder="Sua solicitação foi recebida" style={iStyle} />
            </Field>
            <Field label="Corpo do e-mail">
              <textarea value={cfg.corpo || ''} onChange={e => set('corpo', e.target.value)} rows={4}
                placeholder="Olá {{cliente.nome}}, ..." style={taStyle} />
            </Field>
          </>
        )}

        {/* ── ENCERRAR ── */}
        {node.data.tipo === 'encerrar' && (
          <Field label="Mensagem de encerramento">
            <textarea value={cfg.mensagem || ''} onChange={e => set('mensagem', e.target.value)} rows={3}
              placeholder="Obrigado pelo contato! Qualquer dúvida, estamos à disposição. 😊" style={taStyle} />
          </Field>
        )}

        {/* ── NPS INLINE ── */}
        {node.data.tipo === 'nps_inline' && (
          <>
            <Field label="Pergunta de avaliação">
              <textarea value={cfg.pergunta || ''} onChange={e => set('pergunta', e.target.value)} rows={2}
                placeholder="Como você avalia nosso atendimento?" style={taStyle} />
            </Field>
            <Field label="Escala">
              <select value={cfg.escala || '5'} onChange={e => set('escala', e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}>
                <option value="5">1 a 5 estrelas</option>
                <option value="10">0 a 10 (NPS)</option>
              </select>
            </Field>
          </>
        )}

      </div>
    </div>
  );
}
