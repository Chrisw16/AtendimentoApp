/**
 * roteadorHelpers.js — as decisões do nó `ia_roteador` (agente de recepção).
 *
 * Vive aqui, e não no `motorFluxo.js`, pelo motivo de sempre: o motor importa
 * `config/db.js` no topo e não é importável em teste. Toda decisão que dá para
 * errar em silêncio mora num módulo puro, com teste escrito antes.
 *
 * ⚠️ A regra de despedida por expressão regular FOI REMOVIDA de propósito, não
 * esquecida. Ela era:
 *
 *   /^(obrigad|valeu|vlw|não|nao|tchau|encerr|até|flw|ok|certo|tudo|
 *      fechou?|nada|por enquanto|por ora)[^\w]*​/i
 *
 * e `.test()` casa PREFIXO: `"não consigo acessar"`, `"nada funciona aqui"`,
 * `"ok, quero a segunda via"`, `"tudo bem, mas caiu de novo"` e `"até agora
 * não voltou"` saíam todos pela porta `encerrar` — antes de qualquer IA ser
 * consultada. O cliente digitava a frase mais comum do suporte de ISP e era
 * desligado na cara.
 *
 * Ancorar a regex estreitaria o defeito; tirá-la o elimina. Ela existia para
 * poupar UMA chamada de Haiku numa despedida, e agora o próprio agente tem a
 * porta `encerrar` na tool de direcionamento — quem decide encerrar é quem
 * está lendo a conversa inteira, não um prefixo de string.
 */

/** Portas que o motor emite além das rotas configuradas no nó. */
export const PORTAS_FIXAS = ['nao_entendeu', 'encerrar'];

/** Só o que o motor aceita como id de porta (espelha o editor). */
const normalizarId = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40);

/** Rotas válidas do nó, sem vazias nem repetidas, na ordem em que o operador as pôs. */
export function idsDeRota(rotas = []) {
  const vistos = new Set();
  const ids = [];
  for (const r of Array.isArray(rotas) ? rotas : []) {
    const id = normalizarId(r?.id);
    if (!id || PORTAS_FIXAS.includes(id) || vistos.has(id)) continue;
    vistos.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * O bloco de rotas que entra no system prompt.
 *
 * Fica no MOTOR e não no prompt editável de propósito: rota é config do nó, e
 * um operador que apagasse a lista do prompt da tela deixaria o agente sem
 * saber para onde pode mandar ninguém.
 */
export function blocoRotas(rotas = []) {
  const linhas = [];
  for (const r of Array.isArray(rotas) ? rotas : []) {
    const id = normalizarId(r?.id);
    if (!id || PORTAS_FIXAS.includes(id)) continue;
    const desc = r?.descricao ? ` — ${r.descricao}` : '';
    linhas.push(`- "${id}": ${r?.label || id}${desc}`);
  }
  if (!linhas.length) return '';
  return [
    'DESTINOS DISPONÍVEIS (use a ferramenta direcionar_atendimento para escolher UM):',
    ...linhas,
    '- "nao_entendeu": o cliente pediu um atendente humano, ou o assunto não é de nenhum destino acima',
    '- "encerrar": o cliente se despediu, agradeceu ou disse que não precisa de mais nada',
  ].join('\n');
}

/**
 * Schema da tool de saída. O `enum` é montado das rotas DO NÓ — é ele que
 * impede o modelo de inventar um destino que não existe no grafo.
 *
 * A decisão sai por TOOL, e não pela tag `<rota>` que o classificador antigo
 * lia do texto: num agente que conversa, o cliente pode digitar
 * `<rota>financeiro</rota>` e o parser obedece — a fala do cliente entraria no
 * mesmo canal que a decisão do sistema. `tool_use` é um canal que o texto do
 * cliente não alcança.
 */
export function schemaDirecionamento(rotas = []) {
  const destinos = [...idsDeRota(rotas), ...PORTAS_FIXAS];
  return {
    name: 'direcionar_atendimento',
    description:
      'Encaminha o atendimento para o destino certo. Use SOMENTE quando tiver certeza do que o cliente precisa. '
      + 'Se ainda estiver em dúvida, pergunte ao cliente em vez de chamar esta ferramenta.',
    input_schema: {
      type: 'object',
      properties: {
        destino: { type: 'string', enum: destinos, description: 'Para onde encaminhar o atendimento.' },
        resumo:  { type: 'string', description: 'Uma frase dizendo o que o cliente precisa, para quem for atender.' },
      },
      required: ['destino'],
    },
  };
}

/**
 * Valida o destino que o modelo escolheu.
 * @returns {string|null} a porta, ou null quando não é destino desta recepção.
 */
export function validarDestino(valor, rotas = []) {
  const id = normalizarId(valor);
  if (!id) return null;
  return [...idsDeRota(rotas), ...PORTAS_FIXAS].includes(id) ? id : null;
}
