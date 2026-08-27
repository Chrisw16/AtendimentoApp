import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { filasApi, chatApi } from '../lib/api';
import { useStore } from '../store';
import { useChat } from '../hooks/useChat';
import ConversaList  from '../components/chat/ConversaList';
import ConversaView  from '../components/chat/ConversaView';
import ConversaInfo  from '../components/chat/ConversaInfo';
import Copiloto      from '../components/chat/Copiloto';
import PainelNotas   from '../components/chat/PainelNotas';
import ReguaIcones, { PAINEIS } from '../components/chat/ReguaIcones';
import Gaveta        from '../components/chat/Gaveta';
import styles from './Chat.module.css';

/**
 * Chat — a tela onde a atendente passa o dia.
 *
 * Layout: [lista agrupada] | [conversa] | [régua] + [gaveta por cima]
 *
 * A terceira coluna fixa virou régua + gaveta porque ficha do assinante e
 * Copiloto montavam JUNTO com a conversa, e cada um dispara um `montarFicha`
 * inteiro — até três POSTs ao SGP mais a consulta de manutenção. Eram duas idas
 * completas ao ERP por troca de conversa, para painéis que ninguém tinha
 * pedido. Agora é uma por clique, e só a pedida.
 */
export default function Chat() {
  const chat = useChat();
  const agenteId = useStore(s => s.user?.id);
  const ehAdmin  = useStore(s => s.role) === 'admin';
  const [painel, setPainel] = useState(null);          // null | 'assinante' | 'copiloto' | 'notas'
  const [textoCopiloto, setTextoCopiloto] = useState('');

  /**
   * Mesma `queryKey` da lateral: o React Query serve do cache, sem request
   * extra. E ela é obrigatória aqui — a conversa que o agente comum abre pela
   * FILA não existe em `chat.conversas`, porque `/chat/conversas` só devolve o
   * que já é dele. Procurar só ali fazia o cartão abrir o vazio.
   */
  const { data: filaEspera } = useQuery({
    queryKey: ['chat-fila'],
    queryFn:  () => chatApi.fila(),
    staleTime: 10_000,
  });

  const conversa = useMemo(() => {
    const id = chat.conversaAtiva;
    if (!id) return null;
    return chat.conversas.find(c => c.id === id)
        || (filaEspera?.fila || []).find(c => c.id === id)
        || null;
  }, [chat.conversas, chat.conversaAtiva, filaEspera]);

  /**
   * As filas alimentam DUAS coisas: o "Transferir de setor" e o grupo "Fora de
   * hora" (via `aberta`, que o backend calcula com `dentroDoHorario`).
   *
   * Vive aqui, com `staleTime`, e não num `useEffect` por conversa: antes era
   * refeito a cada mudança de status vinda do SSE e caía em lista vazia no
   * catch — uma falha transitória esvaziaria o grupo inteiro.
   */
  const { data: filas = [] } = useQuery({
    queryKey: ['filas'],
    queryFn:  filasApi.list,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,   // o horário da fila vira sozinho ao longo do dia
  });

  // Encerrar e transferir limpam `conversaAtiva`; sem isto a gaveta ficaria
  // flutuando sobre a tela de "selecione uma conversa".
  useEffect(() => { if (!conversa) setPainel(null); }, [conversa]);

  const titulo = PAINEIS.find(p => p.key === painel)?.titulo || '';

  return (
    <div className={styles.root}>
      <ConversaList chat={chat} filas={filas} agenteId={agenteId} ehAdmin={ehAdmin} />

      <ConversaView chat={chat} conversa={conversa} filas={filas}
        textoExterno={textoCopiloto}
        onConsumirExterno={() => setTextoCopiloto('')} />

      {conversa && (
        <>
          {/* A ordem importa: a coluna vem ANTES da régua, para a régua ficar
              sempre encostada na borda direita da tela. */}

          {/* `key`: trocar de conversa com o painel aberto precisa remontar o
              conteúdo, senão o contrato do cliente anterior atravessa. */}
          <Gaveta key={conversa.id} aberta={!!painel} titulo={titulo} onFechar={() => setPainel(null)}>
            {painel === 'assinante' && <ConversaInfo conversa={conversa} chat={chat} />}
            {painel === 'copiloto'  && (
              <Copiloto conversa={conversa}
                onInserir={(t) => { setTextoCopiloto(t); setPainel(null); }}
                onEnviar={(t) => { chat.enviarMensagem(conversa.id, t); setPainel(null); }} />
            )}
            {painel === 'notas'     && <PainelNotas conversa={conversa} />}
          </Gaveta>

          <ReguaIcones ativo={painel} onAbrir={setPainel} status={conversa.status} />
        </>
      )}
    </div>
  );
}
