import { useState } from 'react';
import { fluxosApi } from '../../lib/api';
import { useStore } from '../../store';
import Button from '../ui/Button';
import { X, Send, RotateCcw, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import styles from './TesteFluxoModal.module.css';

// Formata uma resposta do bot para exibição.
function fmtResp(resp) {
  const corpo = resp.texto || resp.corpo || '';
  const opc = resp.botoes?.length ? ` · botões: ${resp.botoes.map(b => b.label || b.id || b).join(', ')}`
    : resp.itens?.length ? ` · lista: ${resp.itens.map(i => i.titulo || i.id).join(', ')}` : '';
  return { tipo: resp.tipo, texto: corpo + opc };
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

          {res.problemas.length === 0 && (
            <p className={styles.paneHint}>Nenhum problema encontrado. 🎉</p>
          )}

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
  const [modo, setModo] = useState('real'); // 'real' | 'roteiro'
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

// Conversa real: roda o motor de verdade (SGP + IA), captura as respostas. Turno a turno.
function ConversaReal({ fluxo, toast }) {
  const [estado, setEstado] = useState(null);
  const [log, setLog] = useState([]);
  const [input, setInput] = useState('');
  const [encerrado, setEncerrado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    const msg = input.trim();
    if (!msg || enviando || encerrado) return;
    setLog(l => [...l, { de: 'cliente', texto: msg }]);
    setInput(''); setEnviando(true);
    try {
      const r = await fluxosApi.simularReal(fluxo.id, { mensagem: msg, estado });
      setEstado(r.estado || null);
      (r.respostas || []).forEach(resp => {
        const f = fmtResp(resp);
        setLog(l => [...l, { de: 'bot', texto: f.texto, tipo: f.tipo }]);
      });
      if (r.status === 'encerrado') { setEncerrado(true); setLog(l => [...l, { de: 'sys', texto: '— conversa encerrada —' }]); }
    } catch (e) { toast(e.message, 'error'); }
    finally { setEnviando(false); }
  };

  const reiniciar = () => { setEstado(null); setLog([]); setInput(''); setEncerrado(false); };

  return (
    <div className={styles.chat}>
      <p className={styles.aviso}>
        ⚠️ Roda o motor <strong>de verdade</strong> com SGP e IA reais — mas em <strong>modo sandbox</strong>:
        as respostas são capturadas aqui (não vão pro WhatsApp) e ações que gravam dados
        (abrir chamado, promessa, pré-cadastro, transferência) são simuladas, não executadas.
      </p>
      <div className={styles.chatLog}>
        {log.length === 0 && <p className={styles.paneHint}>Mande uma mensagem como se fosse o cliente (ex: "oi").</p>}
        {log.map((m, i) =>
          m.de === 'sys'
            ? <p key={i} className={styles.paneHint} style={{ textAlign: 'center' }}>{m.texto}</p>
            : <div key={i} className={m.de === 'cliente' ? styles.msgCliente : styles.msgBot}>
                {m.tipo && <span className={styles.bolhaTipo}>{m.tipo}</span>}{m.texto}
              </div>,
        )}
      </div>
      <div className={styles.chatInput}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && enviar()}
          placeholder={encerrado ? 'Conversa encerrada — reinicie para testar de novo' : 'Mensagem do cliente…'}
          disabled={encerrado || enviando}
        />
        <Button variant="primary" size="sm" icon={Send} onClick={enviar} loading={enviando} aria-label="Enviar" />
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
                {t.respostas.length === 0
                  ? <div className={styles.bolha} style={{ color: 'var(--text-tertiary)' }}>(sem resposta)</div>
                  : t.respostas.map((resp, j) => {
                      const f = fmtResp(resp);
                      return <div key={j} className={styles.bolha}><span className={styles.bolhaTipo}>{f.tipo}</span>{f.texto}</div>;
                    })}
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
