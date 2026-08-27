/**
 * agruparConversas.js — a lógica da lateral do Chat, pura.
 *
 * JS puro de propósito: sem React, sem CSS, sem import de fora do arquivo. É o
 * que permite a suíte do `apps/api` importar daqui e travar esta lógica, já que
 * não existe runner de teste no `apps/web` (mesmo arranjo do `nodeTypes.js`).
 *
 * A lateral trocou 5 abas por 5 grupos porque aba ESCONDE o resto: com 18
 * conversas em cinco estados, a atendente precisa ver os cinco números de uma
 * vez e abrir só o que pede ação.
 */

/**
 * O filtro da busca da lateral, num lugar só.
 *
 * A lateral filtra em DOIS pontos — o store, para as conversas próprias, e a
 * lista, para a fila que vem de `/chat/fila`. Enquanto foram duas cópias elas
 * divergiram: uma dava `trim` no termo e a outra não, então digitar com espaço
 * à esquerda escondia as conversas próprias e deixava a fila inteira na tela.
 */
export function combinaBusca(conversa, termo) {
  const q = String(termo || '').trim().toLowerCase();
  if (!q) return true;
  if (!conversa) return false;
  return !!(conversa.nome?.toLowerCase().includes(q)
    || conversa.telefone?.includes(q)
    || conversa.ultima_mensagem?.toLowerCase().includes(q));
}

export const GRUPOS = [
  // A ordem é a da urgência operacional, não a do ciclo de vida.
  { key: 'aguardando', label: 'Aguardando',      abreDefault: true  },
  { key: 'ativa',      label: 'Em atendimento',  abreDefault: false },
  { key: 'ia',         label: 'Com a IA',        abreDefault: false },
  { key: 'fora_hora',  label: 'Fora de hora',    abreDefault: false },
  { key: 'encerrada',  label: 'Encerradas hoje', abreDefault: false },
];

const ehHoje = (ts, agora) => {
  if (!ts) return false;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return false;
  // Data LOCAL do navegador, nunca UTC: às 21h de Natal o dia UTC já virou, e
  // "encerradas hoje" ficaria vazia bem no fim do turno da noite.
  return d.toDateString() === new Date(agora).toDateString();
};

/**
 * Em qual grupo esta conversa entra. Exclusivo, nesta precedência.
 *
 * `fora_hora` só existe para quem ESPERA: conversa já assumida tem gente
 * cuidando dela, e conversa com a IA não depende de horário humano. E conversa
 * sem `fila_id` nunca é fora de hora — não há horário a violar (regra da FASE
 * 5: fila nula = visível para todos).
 */
function grupoDe(c, filasFechadas, agora) {
  if (c.status === 'encerrada') {
    return ehHoje(c.encerrada_em || c.atualizado, agora) ? 'encerrada' : null;
  }
  if (c.status === 'aguardando') {
    return c.fila_id && filasFechadas.has(c.fila_id) ? 'fora_hora' : 'aguardando';
  }
  if (c.status === 'ativa') return 'ativa';
  // Inclui `status` ausente, que NÃO é hipótese: o evento SSE `mensagem` faz
  // upsert de `{id, ultima_mensagem, atualizado}` e pode inserir uma conversa
  // sem status. Some da tela é pior que aparecer no grupo errado.
  return 'ia';
}

const ts = (v) => {
  const n = v == null ? NaN : new Date(v).getTime();
  return Number.isNaN(n) ? null : n;
};

/**
 * @param {Array} conversas  a lista já filtrada pela busca
 * @param {object} opts
 *   @param {Set<string>} filasFechadas  `fila_id` cujo horário está fechado agora.
 *          Vem de `GET /atendimento/filas` → `aberta`, que o BACKEND calcula com
 *          `dentroDoHorario`. Copiar a regra para cá criaria uma segunda verdade
 *          sobre o horário da operação — o defeito que esta casa mais persegue.
 *   @param {number} agora  injetável para teste
 * @returns {Array<{key,label,abreDefault,conversas,total}>} sempre os 5, na ordem
 */
export function agruparConversas(conversas, { filasFechadas = new Set(), agora = Date.now() } = {}) {
  const buckets = Object.fromEntries(GRUPOS.map(g => [g.key, []]));

  // Dedup por id: "Aguardando" é alimentado por `/chat/fila` (o endpoint que
  // aplica `conversaVisivel`) e o resto por `/chat/conversas`. Para o admin as
  // duas devolvem a mesma conversa, e sem isto o contador do grupo mentiria.
  // Vence o registro mais completo — o da fila traz `pos_na_fila`.
  const porId = new Map();
  for (const c of Array.isArray(conversas) ? conversas : []) {
    if (!c?.id) continue;
    porId.set(c.id, porId.has(c.id) ? { ...porId.get(c.id), ...c } : c);
  }

  for (const c of porId.values()) {
    const key = grupoDe(c, filasFechadas, agora);
    if (key) buckets[key].push(c);   // encerrada de outro dia fica fora dos cinco
  }

  // Quem espera há MAIS tempo primeiro — é a ordem em que a fila deve ser
  // atendida. Ordenar por `conv.urgencia.minutos` seria errado: eventos SSE
  // parciais reemitem `urgencia` zerada e o cronômetro do cartão voltaria ao
  // início sem a conversa ter saído da fila. `aguardando_desde` é o fato.
  buckets.aguardando.sort((a, b) => (ts(a.aguardando_desde) ?? Infinity) - (ts(b.aguardando_desde) ?? Infinity));
  buckets.fora_hora.sort((a, b) => (ts(a.aguardando_desde) ?? Infinity) - (ts(b.aguardando_desde) ?? Infinity));
  for (const k of ['ativa', 'ia', 'encerrada']) {
    buckets[k].sort((a, b) => (ts(b.atualizado) ?? 0) - (ts(a.atualizado) ?? 0));
  }

  // Grupo vazio CONTINUA na lista: sumir faria os outros pularem de posição a
  // cada tecla da busca, e a atendente perderia o alvo do clique.
  return GRUPOS.map(g => ({ ...g, conversas: buckets[g.key], total: buckets[g.key].length }));
}
