import { create } from 'zustand';

export const useChatStore = create((set, get) => ({
  /* ── CONVERSAS ────────────────────────────────────────────── */
  conversas:        [],
  conversaAtiva:    null,
  mensagens:        {},     // { [conversaId]: mensagem[] }
  loading:          false,
  loadingMensagens: false,

  setConversas: (conversas) => set({ conversas }),

  upsertConversa: (conv) =>
    set(s => {
      const idx = s.conversas.findIndex(c => c.id === conv.id);
      // Patch de conversa DESCONHECIDA não vira linha nova. O evento SSE
      // `mensagem` manda só `{id, ultima_mensagem, atualizado}`; sem esta
      // guarda ele inseria um item sem `status` e sem `nome` — um cartão
      // fantasma, que com a lateral agrupada não teria nem grupo.
      if (idx === -1) return conv?.status ? { conversas: [conv, ...s.conversas] } : {};
      const next = [...s.conversas];
      next[idx] = { ...next[idx], ...conv };
      return { conversas: next };
    }),

  setConversaAtiva: (id) => set({ conversaAtiva: id }),

  setMensagens: (conversaId, mensagens) =>
    set(s => ({ mensagens: { ...s.mensagens, [conversaId]: mensagens } })),

  appendMensagem: (conversaId, msg) =>
    set(s => {
      const atual = s.mensagens[conversaId] || [];
      // Evita duplicatas por id
      if (atual.some(m => m.id === msg.id)) return {};
      return { mensagens: { ...s.mensagens, [conversaId]: [...atual, msg] } };
    }),

  updateMensagem: (conversaId, msgId, patch) =>
    set(s => {
      const atual = s.mensagens[conversaId] || [];
      return {
        mensagens: {
          ...s.mensagens,
          [conversaId]: atual.map(m => m.id === msgId ? { ...m, ...patch } : m),
        },
      };
    }),

  removeMensagem: (conversaId, msgId) =>
    set(s => ({
      mensagens: {
        ...s.mensagens,
        [conversaId]: (s.mensagens[conversaId] || []).filter(m => m.id !== msgId),
      },
    })),

  /* ── BUSCA ────────────────────────────────────────────────── */
  // O `filtro` de aba morreu com os grupos colapsáveis da lateral: aba mostra
  // um estado e ESCONDE os outros quatro; grupo mostra os cinco contadores.
  busca: '',

  setBusca: (busca) => set({ busca }),

  /* ── MODO ─────────────────────────────────────────────────── */
  modo: 'bot',   // 'bot' | 'humano'
  setModo: (modo) => set({ modo }),

  /* ── COMPUTED ─────────────────────────────────────────────── */
  // Só a busca. Agrupar e ORDENAR é de `lib/agruparConversas.js`, que é puro e
  // testado — aqui ficava um `calcUrgencia` local com limiares próprios
  // (10/5/2 min) divergentes dos do servidor (5/15, e por fila desde a FASE 5):
  // a ordem da lista e a cor do cronômetro discordavam.
  conversasBuscadas: () => {
    const { conversas, busca } = get();
    let list = conversas;

    if (busca.trim()) {
      const q = busca.toLowerCase();
      list = list.filter(c =>
        c.nome?.toLowerCase().includes(q) ||
        c.telefone?.includes(q) ||
        c.ultima_mensagem?.toLowerCase().includes(q)
      );
    }

    return list;
  },

  /* ── RESPOSTAS RÁPIDAS ────────────────────────────────────── */
  respostasRapidas: [],
  setRespostasRapidas: (rr) => set({ respostasRapidas: rr }),
}));

