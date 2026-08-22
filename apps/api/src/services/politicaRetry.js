/**
 * politicaRetry.js — as decisões de tempo da FASE 4, em funções puras.
 *
 * O §130 pede "retry central". Central não é uma tabela de config: é ter UM
 * lugar que responde "retenta? quando? desiste?" para inbox, outbox, jobs e
 * para o TTL do estado do fluxo. Sem banco, sem relógio próprio (`agora` entra
 * por parâmetro) — então dá para testar as bordas sem Postgres, que é o padrão
 * da casa (`fluxoHelpers`, `metaSeguranca`).
 *
 * A regra que governa tudo aqui: **leitura pode retentar, escrita não** (§23).
 * Reenviar uma mensagem é chato; reprocessar um turno do motor que já chamou
 * `criar_chamado` abre um SEGUNDO chamado no SGP. Enquanto as tools não tiverem
 * chave de idempotência (Tool Registry, §23 — a FASE 2 entregou registry mínimo
 * de propósito), o retry automático de escrita fica proibido.
 */

const H = 3600_000;

/** Estado de fluxo sem sinal de vida por este tempo = conversa abandonada. */
export const TTL_MS = 2 * H;

/** Teto duro para execução parada em timer — `_parkedAte` não cria blob imortal. */
export const TETO_PARK_MS = 72 * H;

/** Depois disto, linha `processando` é dada como órfã (worker morto). */
export const LEASE_MS = 2 * 60_000;

/** Tentativas de ENVIO antes da DLQ. */
export const MAX_TENTATIVAS = 5;

/**
 * A execução do fluxo expirou?
 *
 * O TTL de 2h existe porque abandono é o comportamento normal do cliente: quem
 * abre o menu, some e volta semanas depois com um "bom dia" teria isso lido
 * como resposta ao menu antigo. Mas espera de timer é a categoria OPOSTA — a
 * conversa está parada de propósito, e o TTL a mataria antes do `flow_resume`.
 * Daí `_parkedAte`: enquanto for futuro, segura; o teto de 72h impede que um
 * `_parkedAte` absurdo (ou nunca limpo) mantenha a linha para sempre.
 *
 * @param {string|Date} atualizadoEm  `flow_executions.atualizado_em`
 * @param {object|null} estado        o blob do motor (lê `_parkedAte`)
 */
export function expirou(atualizadoEm, estado, agora = Date.now()) {
  const idade = agora - new Date(atualizadoEm).getTime();
  if (!Number.isFinite(idade)) return false;      // data ilegível: não apaga por engano
  if (idade > TETO_PARK_MS) return true;

  const ate = Date.parse(estado?._parkedAte ?? '');
  if (Number.isFinite(ate) && ate > agora) return false;

  return idade > TTL_MS;
}

/** Backoff exponencial com teto de 5 min. `tentativas` já conta a que falhou. */
export function backoffMs(tentativas) {
  const n = Math.max(1, Number(tentativas) || 1);
  return Math.min(2 ** n * 1000, 5 * 60_000);
}

export function proximaTentativaEm(tentativas, agora = Date.now()) {
  return new Date(agora + backoffMs(tentativas));
}

/**
 * Prazo de validade da mensagem de saída.
 *
 * Mensagem de atendimento entregue horas depois é pior que não entregue — o
 * cliente já resolveu ou já desistiu. 24h no canal da Meta porque é a janela de
 * sessão dela: fora dela o envio é recusado de qualquer forma.
 */
export function expiraEm(canal, agora = Date.now()) {
  const horas = canal === 'whatsapp_oficial' ? 24 : 6;
  return new Date(agora + horas * H);
}

/**
 * Para onde vai a linha cujo lease venceu (worker morto no meio).
 *
 * `outbox` é reenvio: seguro, volta para a fila. `inbox` e `jobs` re-executam um
 * turno do motor, que pode ter chamado tool de escrita — vão para `falha` e
 * esperam decisão humana pela rota de reprocessamento (§132). É o teto mais
 * importante desta fase, e é declarado, não acidental.
 */
export function destinoLease(tabela) {
  return tabela === 'outbox' ? 'pendente' : 'falha';
}

/** Uma falha de envio: retentar, desistir ou expirar. */
export function decidirFalhaEnvio({ tentativas, expiraEm: prazo, agora = Date.now() }) {
  const proxima = proximaTentativaEm(tentativas, agora);
  const limite  = Date.parse(prazo);

  // O prazo manda: não adianta agendar uma tentativa para depois da validade.
  if (Number.isFinite(limite) && (limite <= agora || proxima.getTime() > limite)) {
    return { status: 'expirada', proximaTentativaEm: null };
  }
  if (tentativas >= MAX_TENTATIVAS) return { status: 'falha', proximaTentativaEm: null };

  return { status: 'pendente', proximaTentativaEm: proxima };
}
