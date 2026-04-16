import { useRef, useEffect, useState, useCallback } from 'react';
import {
  Send, Paperclip, Smile, Bot, User, MoreVertical,
  CheckCheck, Check, Clock, AlertCircle, ChevronDown,
} from 'lucide-react';
import Button from '../ui/Button';
import styles from './ConversaView.module.css';

/* ── HELPERS ─────────────────────────────────────────────────── */
function fmtHora(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtData(ts) {
  if (!ts) return '';
  const d    = new Date(ts);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  if (d.toDateString() === hoje.toDateString())  return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

function StatusIcon({ msg }) {
  if (msg.enviando) return <Clock size={10} className={styles.statusClock} />;
  if (msg.erro)     return <AlertCircle size={10} className={styles.statusErr} />;
  if (msg.lida)     return <CheckCheck size={10} className={styles.statusRead} />;
  return <Check size={10} className={styles.statusSent} />;
}

/* ── MENSAGEM ────────────────────────────────────────────────── */
function Mensagem({ msg }) {
  const minha = msg.origem === 'agente';
  const iaMsg = msg.origem === 'ia';

  return (
    <div className={[styles.msgWrap, minha && styles.msgMinha, iaMsg && styles.msgIA].join(' ')}>
      <div className={[styles.msg, minha && styles.msgBubbleMinha, iaMsg && styles.msgBubbleIA].join(' ')}>
        {/* Remetente (só em mensagens de outros) */}
        {!minha && (
          <span className={styles.sender}>
            {iaMsg ? '🤖 IA' : msg.agente_nome || msg.origem}
          </span>
        )}

        {/* Conteúdo */}
        {msg.tipo === 'imagem' ? (
          <img src={msg.url || msg.texto} alt="Imagem" className={styles.msgImg} />
        ) : msg.tipo === 'audio' ? (
          <audio controls src={msg.url} className={styles.msgAudio} />
        ) : (
          <p className={styles.msgTexto}>{msg.texto}</p>
        )}

        {/* Footer */}
        <div className={styles.msgMeta}>
          <span className={styles.msgHora}>{fmtHora(msg.criado_em)}</span>
          {minha && <StatusIcon msg={msg} />}
        </div>
      </div>
    </div>
  );
}

/* ── SEPARADOR DE DATA ───────────────────────────────────────── */
function DataSep({ data }) {
  return (
    <div className={styles.dataSep} role="separator">
      <span className={styles.dataLabel}>{data}</span>
    </div>
  );
}

/* ── INPUT DE MENSAGEM ───────────────────────────────────────── */
function MessageInput({ onEnviar, disabled }) {
  const [texto, setTexto] = useState('');
  const textRef = useRef(null);

  const enviar = useCallback(() => {
    const t = texto.trim();
    if (!t || disabled) return;
    onEnviar(t);
    setTexto('');
    textRef.current?.focus();
  }, [texto, disabled, onEnviar]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  return (
    <div className={styles.inputArea}>
      <button className={styles.inputAction} aria-label="Anexar arquivo" disabled={disabled}>
        <Paperclip size={15} />
      </button>
      <button className={styles.inputAction} aria-label="Emojis" disabled={disabled}>
        <Smile size={15} />
      </button>
      <textarea
        ref={textRef}
        className={styles.textarea}
        placeholder="Digite uma mensagem... (Enter para enviar)"
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        rows={1}
        aria-label="Mensagem"
      />
      <Button
        variant="primary"
        size="sm"
        icon={Send}
        onClick={enviar}
        disabled={!texto.trim() || disabled}
        aria-label="Enviar"
      />
    </div>
  );
}

/* ── CONVERSA VIEW ───────────────────────────────────────────── */
export default function ConversaView({ chat, conversa }) {
  const { mensagens, conversaAtiva, enviarMensagem, assumir, devolverIA } = chat;
  const listRef    = useRef(null);
  const atBottom   = useRef(true);
  const [showScroll, setShowScroll] = useState(false);

  const msgs = (mensagens[conversaAtiva] || []);

  // Auto-scroll para o fim quando chega mensagem nova
  useEffect(() => {
    if (atBottom.current) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [msgs.length]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = dist < 80;
    setShowScroll(dist > 200);
  };

  const scrollBottom = () => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  };

  if (!conversa) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>💬</div>
        <p className={styles.emptyTitle}>Selecione uma conversa</p>
        <p className={styles.emptyHint}>Escolha uma conversa na lista ao lado para começar</p>
      </div>
    );
  }

  // Agrupa mensagens por data
  const groups = [];
  let lastDate = null;
  msgs.forEach(msg => {
    const d = fmtData(msg.criado_em);
    if (d !== lastDate) { groups.push({ type: 'date', label: d }); lastDate = d; }
    groups.push({ type: 'msg', msg });
  });

  const podeAssumir  = conversa.status === 'aguardando' || conversa.status === 'ia';
  const podeDevolver = conversa.status === 'ativa';
  const encerrada    = conversa.status === 'encerrada';

  return (
    <div className={styles.root}>
      {/* ── TOPBAR DA CONVERSA ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerAvatar}>
            {(conversa.nome || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <p className={styles.headerNome}>{conversa.nome || conversa.telefone}</p>
            <p className={styles.headerCanal}>{conversa.canal} · {conversa.telefone}</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          {podeAssumir && (
            <Button variant="accent" size="sm" icon={User} onClick={() => assumir(conversa.id)}>
              Assumir
            </Button>
          )}
          {podeDevolver && (
            <Button variant="ghost" size="sm" icon={Bot} onClick={() => devolverIA(conversa.id)}>
              Devolver IA
            </Button>
          )}
          <Button variant="ghost" size="sm" icon={MoreVertical} aria-label="Mais opções" />
        </div>
      </div>

      {/* ── MENSAGENS ── */}
      <div className={styles.msgs} ref={listRef} onScroll={onScroll} role="log" aria-live="polite">
        {groups.map((g, i) =>
          g.type === 'date'
            ? <DataSep key={`d-${i}`} data={g.label} />
            : <Mensagem key={g.msg.id} msg={g.msg} />
        )}
      </div>

      {/* ── SCROLL TO BOTTOM ── */}
      {showScroll && (
        <button className={styles.scrollBtn} onClick={scrollBottom} aria-label="Ir ao fim">
          <ChevronDown size={16} />
        </button>
      )}

      {/* ── INPUT ── */}
      {!encerrada ? (
        <MessageInput
          onEnviar={(texto) => enviarMensagem(conversa.id, texto)}
          disabled={false}
        />
      ) : (
        <div className={styles.encerrada}>Conversa encerrada</div>
      )}
    </div>
  );
}
