/**
 * permissoes.js — permissões de visualização e de ação (FASE 6).
 *
 * `agentes.permissoes` existe desde a 001 e a tela de Agentes sempre soube
 * editá-lo — mas **nada no backend nunca leu o campo**. Era controle de
 * mentira: o admin marcava caixas e o sistema seguia deixando todo mundo fazer
 * tudo. Aqui ele passa a decidir.
 *
 * A regra difícil é a compatibilidade. Negar por padrão trancaria, no primeiro
 * deploy, todo agente já cadastrado (nenhum tem permissão nenhuma marcada) —
 * a operação pararia. Então:
 *
 *  - **capacidades que já existiam na prática** (ver o painel, o financeiro, o
 *    diagnóstico, agir) são **permitidas por omissão**: só bloqueiam quando o
 *    admin desmarcar explicitamente (`false`);
 *  - **`ver_dados_completos` é NEGADA por omissão.** É capacidade nova —
 *    ninguém a tinha ontem, então exigi-la não tira nada de ninguém, e é
 *    justamente o que a FASE 3 deixou em aberto: CPF e telefone inteiros só
 *    para quem foi autorizado.
 *
 * Admin passa em tudo: é quem configura as permissões, trancá-lo fora criaria
 * um sistema sem saída.
 */

/** Capacidades conhecidas → é permitida quando o admin nunca se manifestou? */
export const CAPACIDADES = {
  cliente360:          { padrao: true,  label: 'Ver painel do cliente' },
  financeiro:          { padrao: true,  label: 'Ver financeiro (títulos, boletos)' },
  diagnostico:         { padrao: true,  label: 'Ver diagnóstico técnico' },
  acoes:               { padrao: true,  label: 'Executar ações (boleto, chamado, promessa)' },
  ver_dados_completos: { padrao: false, label: 'Ver CPF e telefone SEM máscara' },
};

/**
 * @param {object} agente  { role, permissoes }
 * @param {string} capacidade  chave de CAPACIDADES
 */
export function pode(agente, capacidade) {
  if (!agente) return false;
  if (agente.role === 'admin') return true;

  const def = CAPACIDADES[capacidade];
  // Capacidade desconhecida nega: um typo em `pode(a, 'finaceiro')` tem que
  // fechar a porta, não abri-la para todo mundo.
  if (!def) return false;

  const v = (agente.permissoes || {})[capacidade];
  return v === undefined || v === null ? def.padrao : !!v;
}

/** Todas as capacidades resolvidas — é o que a tela usa para esconder botão. */
export function capacidadesDe(agente) {
  return Object.fromEntries(Object.keys(CAPACIDADES).map(c => [c, pode(agente, c)]));
}
