import { useState, useRef, useEffect } from 'react';
import { fluxosApi } from '../../lib/api';
import { useStore } from '../../store';
import Button from '../ui/Button';
import { X, Send, RotateCcw, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import styles from './TesteFluxoModal.module.css';

// Renderiza texto estilo WhatsApp (*negrito*, `mono`, quebras de linha) sem innerHTML.
export function formatWa(texto = '') {
  const linhas = String(texto).split('\n');
  return linhas.map((linha, li) => {
    const partes = linha.split(/(\*[^*]+\*|`[^`]+`)/g).filter(Boolean);
    return (
      <span key={li}>
        {partes.map((p, i) => {
          if (p.length > 1 && p.startsWith('*') && p.endsWith('*')) return <strong key={i}>{p.slice(1, -1)}</strong>;
          if (p.length > 1 && p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
          return <span key={i}>{p}</span>;
        })}
        {li < linhas.length - 1 && <br />}
      </span>
    );
  });
}

// Bolha do bot: renderiza cada tipo de resposta como no WhatsApp.
// Se `onOpcao` for passado, botões/itens viram clicáveis (enviam a opção).
export function BotBubble({ resp, onOpcao, disabled }) {
  switch (resp.tipo) {
    case 'botoes':
      return (
        <div className={styles.botWrap}>
          {resp.corpo && <div className={styles.botBubble}>{formatWa(resp.corpo)}</div>}
          <div className={styles.chips}>
            {(resp.botoes || []).map((b, i) => {
              const label = typeof b === 'object' ? b.label : b;
              return onOpcao
                ? <button key={i} className={styles.chip} disabled={disabled} onClick={() => onOpcao(label)}>{label}</button>
                : <span key={i} className={styles.chipStatic}>{label}</span>;
            })}
          </div>
        </div>
      );

    case 'lista':
      return (
        <div className={styles.botWrap}>
          {resp.corpo && <div className={styles.botBubble}>{formatWa(resp.corpo)}</div>}
          {resp.titulo_secao && <div className={styles.listaSecao}>{resp.titulo_secao}</div>}
          <div className={styles.listaOpts}>
            {(Array.isArray(resp.itens) ? resp.itens : []).map((it, i) => {
              const titulo = it.titulo || it.id;
              return onOpcao
                ? <button key={i} className={styles.listaOpt} disabled={disabled} onClick={() => onOpcao(titulo)}>
                    <span>{titulo}</span>
                    {it.descricao && <span className={styles.listaDesc}>{it.descricao}</span>}
                  </button>
                : <span key={i} className={styles.listaOptStatic}>{titulo}</span>;
            })}
          </div>
        </div>
      );

    case 'cta':
      return (
        <div className={styles.botWrap}>
          <div className={styles.botBubble}>{formatWa(resp.corpo || '')}</div>
          {resp.url && <a className={styles.ctaBtn} href={resp.url} target="_blank" rel="noreferrer">{resp.label || 'Abrir link'}</a>}
        </div>
      );

    case 'imagem':
    case 'audio':
    case 'arquivo': {
      const icone = resp.tipo === 'imagem' ? '🖼️' : resp.tipo === 'audio' ? '🎵' : '📎';
      return (
        <div className={styles.botBubble}>
          {icone} {resp.legenda || resp.filename || resp.tipo}
          {resp.url && <div><a className={styles.midiaLink} href={resp.url} target="_blank" rel="noreferrer">{resp.url}</a></div>}
        </div>
      );
    }

    case 'localizacao':
      return <div className={styles.botBubble}>📍 {resp.nome || 'Localização'}{resp.address ? ` — ${resp.address}` : ''}</div>;

    default:
      return <div className={styles.botBubble}>{formatWa(resp.texto || resp.corpo || '')}</div>;
  }
}

// ── Aba: Validação estática ───────────────────────────────────────
function Validacao({ fluxo, toast }) {
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);

  const rodar = async () => {
    setLoading(true);
    try { setRes(await fluxosApi.validar(fluxo.id)); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const erros  = res?.problemas.filter(p => p.nivel === 'erro')  || [];
  const avisos = res?.problemas.filter(p => p.nivel === 'aviso') || [];

  return (
    <div className={styles.pane}>
      <div className={styles.paneHead}>
        <p className={styles.paneHint}>
          Analisa o grafo do fluxo <strong>sem executar nada</strong>: becos sem saída (cliente perdido),
          portas soltas, nós inalcançáveis, loops sem espera e arestas mortas.
        </p>
        <Button variant="primary" size="sm" onClick={rodar} loading={loading}>Rodar validação</Button>
      </div>

      {res && (
        <>
          <div className={styles.veredito}>
            {res.ok
              ? <span className={styles.okPass}><CheckCircle2 size={15} style={{ verticalAlign: '-2px' }} /> Sem erros</span>
              : <span className={styles.okFail}><AlertCircle size={15} style={{ verticalAlign: '-2px' }} /> {erros.length} erro(s)</span>}
            <span className={styles.contagem}>· {avisos.length} aviso(s)</span>
          </div>

          {res.problemas.length === 0 && <p className={styles.paneHint}>Nenhum problema encontrado. 🎉</p>}

          <div className={styles.lista}>
            {[...erros, ...avisos].map((p, i) => (
              <div key={i} className={[styles.item, p.nivel === 'erro' ? styles.itemErro : styles.itemAviso].join(' ')}>
                {p.nivel === 'erro' ? <AlertCircle size={15} color="var(--danger)" /> : <AlertTriangle size={15} color="var(--warning, #E8902A)" />}
                <div className={styles.itemBody}>
                  <div className={styles.itemTopo}>
                    <span className={styles.codigo}>{p.codigo}</span>
                    {p.no && <span className={styles.alvo}>nó {p.no}{p.porta ? ` · porta ${p.porta}` : ''}</span>}
                  </div>
                  <p className={styles.itemMsg}>{p.msg}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Aba: Simulação ────────────────────────────────────────────────
function Simulacao({ fluxo, toast }) {
  const [modo, setModo] = useState('real');
  return (
    <div className={styles.pane}>
      <div className={styles.modoRow}>
        <Button variant={modo === 'real' ? 'primary' : 'ghost'} size="sm" onClick={() => setModo('real')}>Conversa real</Button>
        <Button variant={modo === 'roteiro' ? 'primary' : 'ghost'} size="sm" onClick={() => setModo('roteiro')}>Roteiro</Button>
      </div>
      {modo === 'real' ? <ConversaReal fluxo={fluxo} toast={toast} /> : <Roteiro fluxo={fluxo} toast={toast} />}
    </div>
  );
}

// Link público de teste — gera/copia/revoga o link /teste/<token> (sem login).
function LinkTeste({ fluxo, toast }) {
  const [link, setLink] = useState('');
  const [carregando, setCarregando] = useState(false);

  const gerar = async (regenerar) => {
    setCarregando(true);
    try {
      const r = await fluxosApi.compartilhar(fluxo.id, regenerar ? { regenerar: true } : {});
      const url = `${window.location.origin}/teste/${r.token}`;
      setLink(url);
      navigator.clipboard?.writeText(url).catch(() => {});
      toast(regenerar ? 'Novo link gerado e copiado ✓' : 'Link copiado ✓', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setCarregando(false); }
  };
  const revogar = async () => {
    if (!window.confirm('Revogar o link? Quem tiver o link antigo perde o acesso.')) return;
    try { await fluxosApi.revogarLink(fluxo.id); setLink(''); toast('Link revogado', 'info'); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', flex: 1 }}>🔗 Link público de teste (sem login)</span>
        <Button variant="ghost" size="sm" onClick={() => gerar(false)} loading={carregando}>Gerar / copiar</Button>
      </div>
      {link && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input readOnly value={link} onFocus={e => e.target.select()}
            style={{ flex: 1, fontSize: 11, padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }} />
          <button onClick={() => gerar(true)} title="Gerar novo link (revoga o anterior)" style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>↻</button>
          <button onClick={revogar} title="Revogar link" style={{ border: '1px solid var(--danger-bg)', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>revogar</button>
        </div>
      )}
    </div>
  );
}

// Conversa real: motor de verdade (SGP + IA) em sandbox. Chat estilo WhatsApp.
function ConversaReal({ fluxo, toast }) {
  const [estado, setEstado] = useState(null);
  const [log, setLog] = useState([]);
  const [input, setInput] = useState('');
  const [encerrado, setEncerrado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const logRef = useRef(null);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [log]);

  const enviar = async (textoArg) => {
    const viaInput = typeof textoArg !== 'string';
    const msg = (viaInput ? input : textoArg).trim();
    if (!msg || enviando || encerrado) return;
    setLog(l => [...l, { de: 'cliente', texto: msg }]);
    if (viaInput) setInput('');
    setEnviando(true);
    try {
      const r = await fluxosApi.simularReal(fluxo.id, { mensagem: msg, estado });
      setEstado(r.estado || null);
      (r.respostas || []).forEach(resp => setLog(l => [...l, { de: 'bot', resp }]));
      if (r.status === 'encerrado') { setEncerrado(true); setLog(l => [...l, { de: 'sys', texto: '— conversa encerrada —' }]); }
    } catch (e) { toast(e.message, 'error'); }
    finally { setEnviando(false); }
  };

  const reiniciar = () => { setEstado(null); setLog([]); setInput(''); setEncerrado(false); };

  return (
    <div className={styles.chat}>
      <LinkTeste fluxo={fluxo} toast={toast} />
      <p className={styles.aviso}>
        ⚠️ Roda o motor <strong>de verdade</strong> com SGP e IA reais — mas em <strong>modo sandbox</strong>:
        as respostas são capturadas aqui (não vão pro WhatsApp) e ações que gravam dados
        (abrir chamado, promessa, pré-cadastro, transferência) são simuladas.
      </p>
      <div className={styles.chatLog} ref={logRef}>
        {log.length === 0 && <p className={styles.paneHint}>Mande uma mensagem como se fosse o cliente (ex: "oi").</p>}
        {log.map((m, i) =>
          m.de === 'sys'
            ? <p key={i} className={styles.sysMsg}>{m.texto}</p>
            : m.de === 'cliente'
              ? <div key={i} className={styles.msgCliente}>{m.texto}</div>
              : <BotBubble key={i} resp={m.resp} onOpcao={enviar} disabled={enviando || encerrado} />,
        )}
        {enviando && <p className={styles.sysMsg}>digitando…</p>}
      </div>
      <div className={styles.chatInput}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && enviar()}
          placeholder={encerrado ? 'Conversa encerrada — reinicie para testar de novo' : 'Mensagem do cliente…'}
          disabled={encerrado || enviando}
        />
        <Button variant="primary" size="sm" icon={Send} onClick={() => enviar()} loading={enviando} aria-label="Enviar" />
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={reiniciar} aria-label="Reiniciar" />
      </div>
    </div>
  );
}

// Roteiro: simulação roteirizada (sem IA/SGP) — mensagens + decisões por nó.
function Roteiro({ fluxo, toast }) {
  const [mensagens, setMensagens] = useState('oi');
  const [decisoesTxt, setDecisoesTxt] = useState('');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);

  const rodar = async () => {
    let decisoes = {};
    if (decisoesTxt.trim()) {
      try { decisoes = JSON.parse(decisoesTxt); }
      catch { toast('Decisões: JSON inválido', 'error'); return; }
    }
    const turnos = mensagens.split('\n').map(s => s.trim()).filter(Boolean);
    setLoading(true);
    try { setRes(await fluxosApi.simular(fluxo.id, { turnos, decisoes })); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const VBOX = {
    concluido:  { cls: styles.vbOk,   txt: '✅ Concluído — chegou ao fim normalmente' },
    aguardando: { cls: styles.vbWait, txt: '⏳ Aguardando — parou esperando o cliente' },
    perdido:    { cls: styles.vbRuim, txt: '❌ Perdido — morreu num nó sem saída' },
    travado:    { cls: styles.vbRuim, txt: '❌ Travado — loop sem pausa (teto de 15)' },
    erro:       { cls: styles.vbRuim, txt: '❌ Erro — um nó lançou exceção' },
    sem_entrada:{ cls: styles.vbRuim, txt: '❌ Sem entrada — fluxo sem início' },
  };
  const v = res && (VBOX[res.status] || { cls: styles.vbRuim, txt: res.status });

  return (
    <div className={styles.pane}>
      <div className={styles.campo}>
        <label className={styles.campoLabel}>Mensagens do cliente (uma por linha)</label>
        <textarea className={styles.textarea} value={mensagens} onChange={e => setMensagens(e.target.value)} />
      </div>
      <div className={styles.campo}>
        <label className={styles.campoLabel}>Decisões por nó (JSON, opcional — ex: {'{'}"consultar_sgp":"encontrado"{'}'})</label>
        <textarea className={styles.textarea} value={decisoesTxt} onChange={e => setDecisoesTxt(e.target.value)} placeholder='{ "no_id": "porta" }' />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" size="sm" onClick={rodar} loading={loading}>Rodar simulação</Button>
      </div>

      {res && (
        <>
          <div className={[styles.veredictoBox, v.cls].join(' ')}>{v.txt}</div>
          <div className={styles.transcript}>
            {res.turnos.map((t, i) => (
              <div key={i} className={styles.turno}>
                <div className={styles.turnoHead}>
                  <span>cliente: "{t.mensagem}"</span>
                  <span className={styles.turnoStatus}>{t.status}</span>
                </div>
                <div className={styles.turnoBolhas}>
                  {t.respostas.length === 0
                    ? <div className={styles.bolha} style={{ color: 'var(--text-tertiary)' }}>(sem resposta)</div>
                    : t.respostas.map((resp, j) => <BotBubble key={j} resp={resp} />)}
                </div>
                <div className={styles.trilha}>{t.trilha.join(' → ') || '(nenhum nó)'}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────
export default function TesteFluxoModal({ fluxo, onClose }) {
  const toast = useStore(s => s.toast);
  const [tab, setTab] = useState('validacao');

  return (
    <div className={styles.overlay} role="dialog" aria-modal onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <header className={styles.header}>
          <h2 className={styles.title}>Testar fluxo · {fluxo.nome}</h2>
          <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Fechar" />
        </header>
        <nav className={styles.tabs}>
          <button className={tab === 'validacao' ? styles.tabActive : styles.tab} onClick={() => setTab('validacao')}>Validação</button>
          <button className={tab === 'simulacao' ? styles.tabActive : styles.tab} onClick={() => setTab('simulacao')}>Simulação</button>
        </nav>
        <div className={styles.body}>
          {tab === 'validacao'
            ? <Validacao fluxo={fluxo} toast={toast} />
            : <Simulacao fluxo={fluxo} toast={toast} />}
        </div>
      </div>
    </div>
  );
}
