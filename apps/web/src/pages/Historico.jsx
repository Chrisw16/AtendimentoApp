import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, MessageSquare, Clock, User, Bot, ChevronRight, Filter } from 'lucide-react';
import { chatApi } from '../lib/api';
import styles from './Historico.module.css';

const STATUS_META = {
  ia:         { label: 'IA',       cls: styles.badgeIa },
  aguardando: { label: 'Fila',     cls: styles.badgeWaiting },
  ativa:      { label: 'Agente',   cls: styles.badgeActive },
  encerrada:  { label: 'Encerrada',cls: styles.badgeClosed },
};

const CANAIS = ['todos','whatsapp','telegram','widget','email','voip','sms'];

function fmtData(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function ConvRow({ conv, onClick }) {
  const meta = STATUS_META[conv.status] || STATUS_META.encerrada;
  const initial = (conv.nome || conv.telefone || '?').charAt(0).toUpperCase();

  return (
    <button className={styles.row} onClick={onClick} aria-label={`Ver conversa com ${conv.nome || conv.telefone}`}>
      <div className={styles.rowAvatar}>
        {initial}
        <span className={[styles.rowDot, meta.cls].join(' ')} />
      </div>

      <div className={styles.rowMain}>
        <div className={styles.rowTop}>
          <span className={styles.rowNome}>{conv.nome || conv.telefone || 'Desconhecido'}</span>
          <span className={styles.rowData}>{fmtData(conv.atualizado)}</span>
        </div>
        <div className={styles.rowBottom}>
          <span className={styles.rowPreview}>{conv.ultima_mensagem || '—'}</span>
          <span className={[styles.rowBadge, meta.cls].join(' ')}>{meta.label}</span>
        </div>
        <div className={styles.rowMeta}>
          <span className={styles.rowCanal}>{conv.canal}</span>
          {conv.protocolo && <span className={styles.rowProtocolo}>#{conv.protocolo}</span>}
          {conv.agente_nome && (
            <span className={styles.rowAgente}>
              <User size={10} /> {conv.agente_nome}
            </span>
          )}
        </div>
      </div>

      <ChevronRight size={14} className={styles.rowArrow} />
    </button>
  );
}

// ── DETALHE DA CONVERSA (drawer inline) ──────────────────────────
function ConvDetalhe({ conv, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['mensagens', conv.id],
    queryFn:  () => chatApi.mensagens(conv.id, { limit: 100 }),
    enabled:  !!conv.id,
  });

  const msgs = data?.mensagens || [];

  return (
    <div className={styles.detalhe}>
      <div className={styles.detalheHeader}>
        <div>
          <p className={styles.detalheNome}>{conv.nome || conv.telefone}</p>
          <p className={styles.detalheMeta}>{conv.canal} · #{conv.protocolo}</p>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className={styles.detalheMsgs}>
        {isLoading ? (
          <div className={styles.loading}><span className="spinner" /></div>
        ) : msgs.length === 0 ? (
          <p className={styles.empty}>Sem mensagens</p>
        ) : msgs.map(msg => (
          <div
            key={msg.id}
            className={[
              styles.detMsg,
              msg.origem === 'agente' && styles.detMsgAgente,
              msg.origem === 'ia'     && styles.detMsgIA,
            ].filter(Boolean).join(' ')}
          >
            <span className={styles.detMsgOrigem}>
              {msg.origem === 'ia' ? '🤖 IA' : msg.origem === 'agente' ? (msg.agente_nome || 'Agente') : '👤 Cliente'}
            </span>
            <p className={styles.detMsgTexto}>{msg.texto || '[mídia]'}</p>
            <span className={styles.detMsgHora}>
              {new Date(msg.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HISTORICO PAGE ────────────────────────────────────────────────
export default function Historico() {
  const [busca,   setBusca]   = useState('');
  const [canal,   setCanal]   = useState('todos');
  const [status,  setStatus]  = useState('encerrada');
  const [selected,setSelected]= useState(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['historico', { canal, status, busca }],
    queryFn:  () => chatApi.conversas({
      status: status === 'todos' ? undefined : status,
      canal:  canal  === 'todos' ? undefined : canal,
      limit: 80,
    }),
    select: (d) => {
      const list = d.conversas || [];
      if (!busca.trim()) return list;
      const q = busca.toLowerCase();
      return list.filter(c =>
        c.nome?.toLowerCase().includes(q)   ||
        c.telefone?.includes(q)             ||
        c.protocolo?.includes(q)            ||
        c.ultima_mensagem?.toLowerCase().includes(q)
      );
    },
  });

  const conversas = data || [];

  return (
    <div className={styles.root}>
      {/* ── FILTROS ── */}
      <div className={styles.filters}>
        <div className={styles.searchWrap}>
          <Search size={13} className={styles.searchIcon} />
          <input
            type="search"
            className={styles.search}
            placeholder="Buscar por nome, telefone, protocolo..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            aria-label="Buscar conversa"
          />
        </div>

        <div className={styles.filterGroup}>
          <Filter size={12} className={styles.filterIcon} />
          <select className={styles.select} value={status} onChange={e => setStatus(e.target.value)} aria-label="Filtrar por status">
            <option value="todos">Todos os status</option>
            <option value="encerrada">Encerradas</option>
            <option value="ativa">Em atendimento</option>
            <option value="ia">Com IA</option>
            <option value="aguardando">Na fila</option>
          </select>
          <select className={styles.select} value={canal} onChange={e => setCanal(e.target.value)} aria-label="Filtrar por canal">
            {CANAIS.map(c => (
              <option key={c} value={c}>{c === 'todos' ? 'Todos os canais' : c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── CONTADOR ── */}
      <div className={styles.counter}>
        {isFetching
          ? <span className="spinner spinner-sm" />
          : <span>{conversas.length} conversa{conversas.length !== 1 ? 's' : ''}</span>
        }
      </div>

      {/* ── CONTEÚDO ── */}
      <div className={styles.content}>
        {/* Lista */}
        <div className={styles.lista} role="list">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={styles.skelRow}>
                <div className={`skeleton ${styles.skelAvatar}`} />
                <div className={styles.skelLines}>
                  <div className={`skeleton ${styles.skelLine1}`} />
                  <div className={`skeleton ${styles.skelLine2}`} />
                </div>
              </div>
            ))
          ) : conversas.length === 0 ? (
            <div className={styles.empty}>
              <Clock size={32} className={styles.emptyIcon} />
              <p>Nenhuma conversa encontrada</p>
              {busca && <p className={styles.emptyHint}>Tente outros termos de busca</p>}
            </div>
          ) : (
            conversas.map(c => (
              <ConvRow
                key={c.id}
                conv={c}
                onClick={() => setSelected(c.id === selected?.id ? null : c)}
              />
            ))
          )}
        </div>

        {/* Detalhe */}
        {selected && (
          <ConvDetalhe conv={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}
