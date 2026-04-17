import { useEffect, useCallback, useRef } from 'react';
import { chatApi, createSSE } from '../lib/api';
import { useChatStore } from '../store/chat';
import { useStore } from '../store';

/**
 * useChat — gerencia SSE, carregamento de conversas e mensagens
 * Centraliza toda lógica de negócio do chat fora do componente de UI
 */
export function useChat() {
  const store  = useChatStore();
  const toast  = useStore(s => s.toast);
  const sseRef = useRef(null);

  /* ── CARREGAR CONVERSAS ────────────────────────────────────── */
  const loadConversas = useCallback(async () => {
    try {
      const data = await chatApi.conversas();
      store.setConversas(data.conversas || data);
      store.setModo(data.modo || 'bot');
    } catch (err) {
      toast(err.message, 'error');
    }
  }, []);

  /* ── CARREGAR MENSAGENS ────────────────────────────────────── */
  const loadMensagens = useCallback(async (conversaId) => {
    if (!conversaId) return;
    try {
      const data = await chatApi.mensagens(conversaId, { limit: 50 });
      store.setMensagens(conversaId, data.mensagens || data);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, []);

  /* ── SSE ────────────────────────────────────────────────────── */
  useEffect(() => {
    loadConversas();

    sseRef.current = createSSE('/chat/sse', {
      nova_conversa: (data) => {
        store.upsertConversa(data);
      },
      mensagem: (data) => {
        store.appendMensagem(data.conversa_id, data);
        store.upsertConversa({ id: data.conversa_id, ultima_mensagem: data.texto, atualizado: data.criado_em });
      },
      conversa_atualizada: (data) => {
        store.upsertConversa(data);
      },
      mensagem_atualizada: (data) => {
        store.updateMensagem(data.conversa_id, data.id, data);
      },
      mensagem_removida: (data) => {
        store.removeMensagem(data.conversa_id, data.id);
      },
      modo_alterado: (data) => {
        store.setModo(data.modo);
      },
      sla_critico: (data) => {
        toast(`🚨 Fila crítica: ${data.nome} aguarda ${data.minutos}min`, 'error', 8000);
      },
      agente_fantasma: (data) => {
        toast(`⚠️ ${data.agenteNome} assumiu mas não respondeu (${data.minutos}min)`, 'warning', 8000);
      },
      onError: () => {
        // Reconecta automaticamente após 3s em caso de falha
        setTimeout(loadConversas, 3000);
      },
    });

    return () => sseRef.current?.();
  }, []);

  /* ── SELECIONAR CONVERSA ────────────────────────────────────── */
  const selecionarConversa = useCallback((id) => {
    store.setConversaAtiva(id);
    if (id && !store.mensagens[id]) {
      loadMensagens(id);
    }
  }, [store.mensagens]);

  /* ── AÇÕES ──────────────────────────────────────────────────── */
  const enviarMensagem = useCallback(async (conversaId, texto, tipo = 'texto') => {
    const tempId = `temp-${Date.now()}`;
    // Optimistic update
    store.appendMensagem(conversaId, {
      id: tempId, texto, tipo, origem: 'agente',
      criado_em: new Date().toISOString(), enviando: true,
    });
    try {
      const msg = await chatApi.enviar(conversaId, { texto, tipo });
      store.removeMensagem(conversaId, tempId);
      store.appendMensagem(conversaId, msg);
    } catch (err) {
      store.updateMensagem(conversaId, tempId, { erro: true, enviando: false });
      toast(err.message, 'error');
    }
  }, []);

  const assumir = useCallback(async (conversaId) => {
    try {
      const conv = await chatApi.assumir(conversaId);
      store.upsertConversa(conv);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, []);

  const devolverIA = useCallback(async (conversaId) => {
    try {
      const conv = await chatApi.devolverIA(conversaId);
      store.upsertConversa(conv);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, []);

  const encerrar = useCallback(async (conversaId, motivo) => {
    try {
      const conv = await chatApi.encerrar(conversaId, { motivo });
      store.upsertConversa(conv);
      if (store.conversaAtiva === conversaId) store.setConversaAtiva(null);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, [store.conversaAtiva]);

  const transferir = useCallback(async (conversaId, agenteId) => {
    try {
      const conv = await chatApi.transferir(conversaId, { agente_id: agenteId });
      store.upsertConversa(conv);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, []);

  return {
    ...store,
    conversasFiltradas: store.conversasFiltradas(),
    selecionarConversa,
    enviarMensagem,
    assumir,
    devolverIA,
    encerrar,
    transferir,
    loadMensagens,
  };
}
