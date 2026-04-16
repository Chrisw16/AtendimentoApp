import { useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import ConversaList  from '../components/chat/ConversaList';
import ConversaView  from '../components/chat/ConversaView';
import ConversaInfo  from '../components/chat/ConversaInfo';
import styles from './Chat.module.css';

/**
 * Chat — página principal do atendimento
 * Layout: [Lista 280px] | [Conversa flex] | [Info 300px condicional]
 * Toda lógica de estado está em useChat() — aqui só composição
 */
export default function Chat() {
  const chat = useChat();

  const conversa = chat.conversas.find(c => c.id === chat.conversaAtiva) || null;

  return (
    <div className={styles.root}>
      {/* ── COLUNA 1: LISTA DE CONVERSAS ── */}
      <ConversaList chat={chat} />

      {/* ── COLUNA 2: CONVERSA ATIVA ── */}
      <ConversaView chat={chat} conversa={conversa} />

      {/* ── COLUNA 3: INFO DO CONTATO (só quando tem conversa) ── */}
      {conversa && <ConversaInfo conversa={conversa} chat={chat} />}
    </div>
  );
}
