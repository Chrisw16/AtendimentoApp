/**
 * ChatTeste — página PÚBLICA do chat de teste (/teste/:token), sem login.
 * Reusa o BotBubble e o CSS do TesteFluxoModal. Conversa em modo sandbox:
 * SGP e IA reais, mas tudo que grava é simulado.
 */
import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Send, RotateCcw } from 'lucide-react';
import { chatTesteApi } from '../lib/api';
import { BotBubble } from '../components/fluxo/TesteFluxoModal';
import styles from '../components/fluxo/TesteFluxoModal.module.css';

const wrap = { minHeight: '100vh', background: '#EEF1F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'var(--font-body, system-ui)' };
const card = { width: '100%', maxWidth: 460, background: '#fff', border: '1px solid #e2e6ec', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.12)', height: 'min(85vh, 720px)' };
const header = { padding: '12px 16px', background: '#0E1A2B', color: '#fff', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 };

export default function ChatTeste() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);     // null=carregando · 'invalid' · { nome }
  const [sessao, setSessao] = useState(null);   // id opaco: a ficha do assinante fica no servidor
  const [log, setLog] = useState([]);
  const [input, setInput] = useState('');
  const [encerrado, setEncerrado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const logRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    chatTesteApi.info(token).then(r => { if (vivo) setInfo(r); }).catch(() => { if (vivo) setInfo('invalid'); });
    return () => { vivo = false; };
  }, [token]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [log]);

  const enviar = async (textoArg) => {
    const viaInput = typeof textoArg !== 'string';
    const msg = (viaInput ? input : textoArg).trim();
    if (!msg || enviando || encerrado) return;
    setLog(l => [...l, { de: 'cliente', texto: msg }]);
    if (viaInput) setInput('');
    setEnviando(true); setErro('');
    try {
      const r = await chatTesteApi.enviar(token, { mensagem: msg, sessao });
      setSessao(r.sessao || null);
      (r.respostas || []).forEach(resp => setLog(l => [...l, { de: 'bot', resp }]));
      if (r.status === 'encerrado') { setEncerrado(true); setLog(l => [...l, { de: 'sys', texto: '— conversa encerrada —' }]); }
    } catch (e) { setErro(e.message || 'Erro ao enviar'); }
    finally { setEnviando(false); }
  };
  const reiniciar = () => { setEstado(null); setLog([]); setInput(''); setEncerrado(false); setErro(''); };

  if (info === null) return <div style={wrap}>Carregando…</div>;
  if (info === 'invalid') return (
    <div style={wrap}>
      <div style={{ ...card, height: 'auto', padding: 28, textAlign: 'center', color: '#5b6472' }}>
        🔒 Link de teste inválido ou revogado.
      </div>
    </div>
  );

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={header}>
          <span><span style={{ color: '#E8572A', fontWeight: 800 }}>Go</span>CHAT</span>
          <span style={{ opacity: .7, fontWeight: 400, fontSize: 12 }}>· teste: {info.nome}</span>
        </div>

        <div className={styles.chatLog} ref={logRef} style={{ flex: 1, borderRadius: 0, border: 'none' }}>
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

        {erro && <div style={{ padding: '6px 12px', fontSize: 12, color: '#dc2626', background: 'rgba(220,38,38,.07)' }}>{erro}</div>}

        <div className={styles.chatInput} style={{ padding: 10, borderTop: '1px solid #e2e6ec' }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()}
            placeholder={encerrado ? 'Conversa encerrada — reinicie' : 'Mensagem…'} disabled={encerrado || enviando} />
          <button onClick={() => enviar()} disabled={enviando || encerrado} aria-label="Enviar"
            style={{ border: 'none', background: '#2050B8', color: '#fff', borderRadius: 8, padding: '0 12px', cursor: 'pointer' }}><Send size={16} /></button>
          <button onClick={reiniciar} aria-label="Reiniciar"
            style={{ border: '1px solid #e2e6ec', background: '#fff', borderRadius: 8, padding: '0 10px', cursor: 'pointer' }}><RotateCcw size={16} /></button>
        </div>

        <div style={{ padding: '6px 12px', fontSize: 10.5, color: '#8a93a3', textAlign: 'center', borderTop: '1px solid #f0f2f5' }}>
          🧪 Ambiente de teste — esta conversa é simulada e não cria nada de verdade.
        </div>
      </div>
    </div>
  );
}
