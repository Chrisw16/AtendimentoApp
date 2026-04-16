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
      if (idx === -1) return { conversas: [conv, ...s.conversas] };
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

  /* ── FILTROS ──────────────────────────────────────────────── */
  filtro: 'todas',   // 'todas' | 'ia' | 'aguardando' | 'ativa' | 'encerrada'
  busca:  '',

  setFiltro: (filtro) => set({ filtro }),
  setBusca:  (busca)  => set({ busca }),

  /* ── MODO ─────────────────────────────────────────────────── */
  modo: 'bot',   // 'bot' | 'humano'
  setModo: (modo) => set({ modo }),

  /* ── COMPUTED ─────────────────────────────────────────────── */
  conversasFiltradas: () => {
    const { conversas, filtro, busca } = get();
    let list = conversas;

    if (filtro !== 'todas') {
      list = list.filter(c => c.status === filtro);
    }

    if (busca.trim()) {
      const q = busca.toLowerCase();
      list = list.filter(c =>
        c.nome?.toLowerCase().includes(q) ||
        c.telefone?.includes(q) ||
        c.ultima_mensagem?.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      // Urgência primeiro
      const urgA = calcUrgencia(a);
      const urgB = calcUrgencia(b);
      if (urgA !== urgB) return urgA - urgB;
      return new Date(b.atualizado || 0) - new Date(a.atualizado || 0);
    });
  },

  /* ── RESPOSTAS RÁPIDAS ────────────────────────────────────── */
  respostasRapidas: [],
  setRespostasRapidas: (rr) => set({ respostasRapidas: rr }),
}));

function calcUrgencia(conv) {
  if (conv.status !== 'aguardando') return 99;
  const min = Math.floor((Date.now() - new Date(conv.aguardando_desde || 0)) / 60000);
  if (conv.prioridade >= 2 || min >= 10) return 0;  // crítico
  if (min >= 5)  return 1;  // alto
  if (min >= 2)  return 2;  // médio
  return 3;                 // baixo
}
