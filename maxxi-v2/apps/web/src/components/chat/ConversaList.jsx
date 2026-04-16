import { useRef, useEffect } from 'react';
import { Search, Bot, User, RefreshCw } from 'lucide-react';
import styles from './ConversaList.module.css';

const FILTROS = [
  { key: 'todas',     label: 'Todas' },
  { key: 'ia',        label: 'IA' },
  { key: 'aguardando',label: 'Fila' },
  { key: 'ativa',     label: 'Agente' },
  { key: 'encerrada', label: 'Encerradas' },
];

const STATUS_META = {
  ia:         { cls: styles.dotIa,       label: 'IA' },
  aguardando: { cls: styles.dotWaiting,  label: 'Fila' },
  ativa:      { cls: styles.dotActive,   label: 'Agente' },
  encerrada:  { cls: styles.dotClosed,   label: 'Fechado' },
};

const CANAL_EMOJI = {
  whatsapp: '📱',
  telegram: '✈️',
  widget:   '💬',
  email:    '✉️',
  voip:     '📞',
  sms:      '📨',
};

function fmtHora(ts) {
  if (!ts) return '';
  const d    = new Date(ts);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString())
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function ConversaItem({ conv, ativa, onClick }) {
  const meta    = STATUS_META[conv.status] || STATUS_META.encerrada;
  const initial = (conv.nome || conv.telefone || '?').charAt(0).toUpperCase();
  const colors  = ['#1a3a2a', '#1a2a3a', '#3a1a2a', '#2a1a3a', '#3a2a1a'];
  const bg      = colors[(initial.charCodeAt(0) || 0) % colors.length];

  return (
    <button
      className={[styles.item, ativa && styles.itemAtivo].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-current={ativa ? 'true' : undefined}
    >
      {/* Avatar */}
      <div className={styles.avatar} style={{ background: bg }}>
        {conv.foto_perfil
          ? <img src={conv.foto_perfil} alt="" />
          : <span>{initial}</span>
        }
        <span className={[styles.dot, meta.cls].join(' ')} aria-label={meta.label} />
      </div>

      {/* Conteúdo */}
      <div className={styles.content}>
        <div className={styles.row1}>
          <span className={styles.nome}>
            {CANAL_EMOJI[conv.canal] || '💬'}{' '}
            {conv.nome || conv.telefone || 'Desconhecido'}
          </span>
          <span className={styles.hora}>{fmtHora(conv.atualizado)}</span>
        </div>
        <div className={styles.row2}>
          <span className={styles.preview}>{conv.ultima_mensagem || '—'}</span>
          {conv.nao_lidas > 0 && (
            <span className={styles.badge}>{conv.nao_lidas > 9 ? '9+' : conv.nao_lidas}</span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function ConversaList({ chat }) {
  const { conversasFiltradas, conversaAtiva, filtro, busca,
          setFiltro, setBusca, selecionarConversa, modo, setModo } = chat;

  const searchRef = useRef(null);

  // Ctrl+F foca a busca
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <aside className={styles.panel}>
      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.title}>Conversas</span>
          <div className={styles.headerActions}>
            {/* Toggle modo bot/humano */}
            <button
              className={[styles.modeBtn, modo === 'bot' && styles.modeBot].join(' ')}
              onClick={() => setModo(modo === 'bot' ? 'humano' : 'bot')}
              title={modo === 'bot' ? 'Modo IA ativo — clique para modo humano' : 'Modo humano ativo — clique para IA'}
            >
              {modo === 'bot' ? <Bot size={13} /> : <User size={13} />}
              <span>{modo === 'bot' ? 'IA' : 'Humano'}</span>
            </button>
          </div>
        </div>

        {/* Busca */}
        <div className={styles.searchWrap}>
          <Search size={12} className={styles.searchIcon} />
          <input
            ref={searchRef}
            type="search"
            className={styles.search}
            placeholder="Buscar conversa..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            aria-label="Buscar conversa"
          />
        </div>

        {/* Filtros */}
        <div className={styles.filtros} role="tablist" aria-label="Filtrar conversas">
          {FILTROS.map(f => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filtro === f.key}
              className={[styles.filtro, filtro === f.key && styles.filtroAtivo].join(' ')}
              onClick={() => setFiltro(f.key)}
            >
              {f.label}
              {/* Contador */}
              {f.key !== 'todas' && (
                <span className={styles.count}>
                  {chat.conversas.filter(c => c.status === f.key).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── LISTA ── */}
      <div className={styles.lista} role="list">
        {conversasFiltradas.length === 0 ? (
          <div className={styles.empty}>
            <RefreshCw size={20} className={styles.emptyIcon} />
            <p>Nenhuma conversa</p>
          </div>
        ) : (
          conversasFiltradas.map(conv => (
            <ConversaItem
              key={conv.id}
              conv={conv}
              ativa={conv.id === conversaAtiva}
              onClick={() => selecionarConversa(conv.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
