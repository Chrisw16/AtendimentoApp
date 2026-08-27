import { useRef, useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Bot, User, ArrowDownToLine, Inbox } from 'lucide-react';
import { chatApi } from '../../lib/api';
import { agruparConversas, GRUPOS } from '../../lib/agruparConversas';
import { useStore } from '../../store';
import GrupoConversas from './GrupoConversas';
import ConversaCard from './ConversaCard';
import styles from './ConversaList.module.css';

const CHAVE_ABERTOS = 'gochat.chat.grupos';

function lerAbertos() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_ABERTOS) || 'null');
    if (salvo && typeof salvo === 'object') return salvo;
  } catch { /* localStorage indisponível ou lixo: cai no padrão */ }
  return Object.fromEntries(GRUPOS.map(g => [g.key, g.abreDefault]));
}

export default function ConversaList({ chat, filas = [], agenteId, ehAdmin }) {
  const { conversasBuscadas, conversaAtiva, busca, setBusca, selecionarConversa,
          modo, setModo, assumirProximo, assumir, transferirFila, devolverIA, encerrar } = chat;

  const [puxando, setPuxando] = useState(false);
  const [abertos, setAbertos] = useState(lerAbertos);
  const searchRef = useRef(null);
  const toast = useStore(s => s.toast);

  /**
   * ⚠️ O grupo "Aguardando" NÃO pode sair de `conversasBuscadas`.
   *
   * `GET /chat/conversas` devolve ao agente comum só as conversas onde ele já é
   * o dono (`routes/chat.js`: `agenteId = req.agente.role !== 'admin' ? ...`),
   * então quem está na fila nem aparece — o grupo nasceria vazio para todo
   * mundo que não é admin. `GET /chat/fila` é a rota que faz certo: aplica
   * `conversaVisivel`, e calcula `pos_na_fila` ANTES do filtro de visibilidade.
   * Ela existia em `chatApi.fila()` sem nenhum consumidor.
   */
  const { data: filaEspera } = useQuery({
    queryKey: ['chat-fila'],
    queryFn: () => chatApi.fila(),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  const filasFechadas = useMemo(
    // `aberta` é calculado pelo BACKEND (`dentroDoHorario`). Recalcular aqui
    // criaria uma segunda verdade sobre o horário da operação.
    () => new Set(filas.filter(f => f.aberta === false).map(f => f.id)),
    [filas],
  );

  const grupos = useMemo(() => {
    // `conversasBuscadas` já veio filtrada pelo store, mas a fila vem de OUTRO
    // endpoint e chegava crua: digitar na busca escondia as conversas próprias
    // e deixava a fila inteira na tela, e o "Nada encontrado" nunca aparecia.
    const q = busca.trim().toLowerCase();
    const daFila = (filaEspera?.fila || []).filter(c => !q
      || c.nome?.toLowerCase().includes(q)
      || c.telefone?.includes(q)
      || c.ultima_mensagem?.toLowerCase().includes(q));
    return agruparConversas([...(conversasBuscadas || []), ...daFila], { filasFechadas });
  },
    // `conversasBuscadas` é recalculada a cada render do hook, então a memo
    // depende dela por referência mesmo — o ganho aqui é não reordenar cem
    // conversas a cada tecla da busca, que é o custo que dói.
  [conversasBuscadas, filaEspera, filasFechadas, busca]);

  const alternar = (key) => setAbertos(a => {
    const proximo = { ...a, [key]: !a[key] };
    try { localStorage.setItem(CHAVE_ABERTOS, JSON.stringify(proximo)); } catch { /* modo privado */ }
    return proximo;
  });

  /**
   * O toggle IA/Humano mudava só o Zustand: `PUT /chat/modo` existe desde
   * sempre e não tinha cliente nenhum. O backend continuava no modo antigo e o
   * próximo `loadConversas` revertia o botão — um interruptor que mentia.
   * A rota é `adminMiddleware`, então quem não é admin não vê o botão.
   */
  const alternarModo = async () => {
    const novo = modo === 'bot' ? 'humano' : 'bot';
    setModo(novo);                                   // otimista: a tela responde na hora
    try { await chatApi.setModo(novo); }
    catch (err) { setModo(modo); toast(err.message || 'Não foi possível trocar o modo', 'error'); }
  };

  const puxarProxima = async () => {
    setPuxando(true);
    try { await assumirProximo(); } finally { setPuxando(false); }
  };

  // Ctrl+F foca a busca.
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const vazio = grupos.every(g => g.total === 0);
  const acoes = { onTransferirFila: transferirFila, onDevolverIA: devolverIA, onFinalizar: encerrar };

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.title}>Conversas</span>
          <div className={styles.headerActions}>
            <button className={styles.proximaBtn} onClick={puxarProxima} disabled={puxando}
              title="Assumir a próxima conversa da fila">
              <ArrowDownToLine size={13} />
              <span>{puxando ? '…' : 'Próxima'}</span>
            </button>
            {ehAdmin && <button
              className={[styles.modeBtn, modo === 'bot' && styles.modeBot].filter(Boolean).join(' ')}
              onClick={alternarModo}
              title={modo === 'bot' ? 'Modo IA ativo — clique para modo humano' : 'Modo humano ativo — clique para IA'}>
              {modo === 'bot' ? <Bot size={13} /> : <User size={13} />}
              <span>{modo === 'bot' ? 'IA' : 'Humano'}</span>
            </button>}
          </div>
        </div>

        <div className={styles.searchWrap}>
          <Search size={12} className={styles.searchIcon} />
          <input ref={searchRef} type="search" className={styles.search}
            placeholder="Buscar conversa..." value={busca}
            onChange={e => setBusca(e.target.value)} aria-label="Buscar conversa" />
        </div>
      </div>

      <div className={styles.lista}>
        {vazio ? (
          <div className={styles.empty}>
            <Inbox size={22} className={styles.emptyIcon} />
            <p>{busca ? 'Nada encontrado' : 'Nenhuma conversa'}</p>
          </div>
        ) : grupos.map(grupo => (
          <GrupoConversas key={grupo.key} grupo={grupo}
            aberto={!!abertos[grupo.key]} onToggle={() => alternar(grupo.key)}>
            {grupo.conversas.map(conv => (
              <ConversaCard key={conv.id} conv={conv} filas={filas} agenteId={agenteId}
                ativa={conv.id === conversaAtiva}
                onSelect={() => selecionarConversa(conv.id)}
                onAssumir={assumir}
                acoes={acoes} />
            ))}
          </GrupoConversas>
        ))}
      </div>
    </aside>
  );
}
