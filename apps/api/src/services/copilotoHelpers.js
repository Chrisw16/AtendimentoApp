/**
 * copilotoHelpers.js — as decisões PURAS do Copiloto (FASE 10).
 *
 * O coração desta fase não é "um botão que chama o LLM" — é o §79: o copiloto
 * precisa decidir se a hora é de **responder**, de **consultar** ou de
 * **avançar o procedimento**, e não gerar texto bonito quando ainda faltam
 * dados objetivos. Um copiloto que sempre escreve um parágrafo é um gerador de
 * texto; um que sabe dizer "primeiro identifique o cliente" é um copiloto.
 *
 * Essa decisão é determinística e mora aqui — não custa uma chamada de modelo,
 * não varia entre execuções e pode ser testada.
 */

/** §83/§84 — sinais que mudam o que o atendente deve fazer AGORA. */
const SINAIS = [
  { id: 'objecao_preco',    lado: 'comercial', label: 'Objeção de preço',
    re: /muito caro|t[áa] caro|caro demais|mais barato|desconto|pre[çc]o alto|n[ãa]o cabe no bolso|concorr[êe]ncia|a outra operadora/i },
  { id: 'sinal_compra',     lado: 'comercial', label: 'Sinal de compra',
    re: /quero contratar|como fa[çz]o para (assinar|contratar)|pode instalar|quando (instala|vem)|fechar|vou querer|me manda o link/i },
  { id: 'upsell',           lado: 'comercial', label: 'Oportunidade de upgrade',
    re: /mais r[áa]pid|aumentar (a )?velocidade|upgrade|plano maior|t[áa] lento pro que eu preciso/i },
  { id: 'frustracao',       lado: 'ambos',     label: 'Cliente frustrado',
    re: /absurdo|inaceit[áa]vel|nunca funciona|toda semana|de novo|cansad[oa]|vergonha|procon|cancelar/i },
  { id: 'recorrencia',      lado: 'suporte',   label: 'Problema recorrente',
    re: /de novo|outra vez|mesma coisa|j[áa] liguei|j[áa] abri chamado|terceira vez|sempre acontece/i },
  { id: 'falha_fisica',     lado: 'suporte',   label: 'Possível falha física',
    // Proximidade em vez de adjacência: ninguém escreve "cabo rompido" — escreve
    // "o cabo tá rompido", "o fio foi cortado", "meu cabo parece arrebentado".
    // Exigir as palavras coladas deixava passar o relato mais comum de todos.
    re: /(cabo|fio)[^.!?]{0,20}(rompid|cortad|arrebentad|solto|quebrad|partid)|poste|caiu o fio|obra na rua|luz vermelha/i },
];

export function detectarSinais(texto) {
  const t = String(texto || '');
  return SINAIS.filter(s => s.re.test(t)).map(({ id, label, lado }) => ({ id, label, lado }));
}

/**
 * §79 — responder, consultar ou avançar?
 *
 * A ordem das checagens é a ordem da urgência operacional, e cada uma existe
 * por um erro que se vê em atendimento real:
 *
 *  1. **cliente não identificado** → responder qualquer coisa sobre a conta
 *     dele é chute. Consultar primeiro;
 *  2. **manutenção ativa na região** → a resposta muda por completo, e abrir
 *     chamado individual seria trabalho jogado fora;
 *  3. **diagnóstico não rodado num caso técnico** → sugerir texto antes de
 *     saber se o cliente está online é adivinhação;
 *  4. **procedimento com etapa pendente** → o playbook já disse o que fazer;
 *  5. só então: responder.
 */
export function decidirProximaAcao({ ficha = null, playbook = null, ultimaMensagem = '', sinais = [] } = {}) {
  const temCliente  = !!(ficha?.contrato_principal || ficha?.identidade?.cpf);
  const texto       = String(ultimaMensagem || '');
  const pareceTecnico = /internet|conex[ãa]o|lent|caiu|sem sinal|wi-?fi|roteador|onu|offline|oscila/i.test(texto);

  if (!temCliente) {
    return {
      acao: 'consultar',
      tools: ['consultar_cliente'],
      motivo: 'O cliente ainda não foi identificado — responder sobre a conta dele agora seria chute.',
    };
  }

  if (ficha?.manutencao?.ativa) {
    return {
      acao: 'responder',
      tools: [],
      motivo: 'Há manutenção ativa na região: informe a previsão e NÃO abra chamado individual.',
      destaque: true,
    };
  }

  if (pareceTecnico && !ficha?.diagnostico?.executado) {
    return {
      acao: 'consultar',
      tools: ['verificar_conexao', 'consultar_manutencao'],
      motivo: 'Caso técnico sem diagnóstico: verifique a conexão antes de responder.',
    };
  }

  if (playbook?.foco) {
    return {
      acao: 'avancar_playbook',
      tools: playbook.foco.tools || [],
      motivo: `Procedimento em andamento — próxima etapa: ${playbook.foco.titulo}.`,
    };
  }

  const critico = sinais.find(s => s.id === 'frustracao' || s.id === 'objecao_preco');
  return {
    acao: 'responder',
    tools: [],
    motivo: critico ? `Atenção: ${critico.label.toLowerCase()}.` : 'Dados suficientes para responder.',
  };
}

/**
 * §82 — resumo vivo, montado de FATOS, não de texto gerado.
 *
 * Poderia ser uma chamada de modelo a cada mensagem; seria caro, lento, não
 * determinístico e diria a mesma coisa. O resumo existe para troca de
 * atendente e retomada — quem lê quer os fatos, não prosa.
 */
export function montarResumo({ ficha = null, playbook = null, sinais = [], mensagens = [] } = {}) {
  const linhas = [];

  const nome = ficha?.identidade?.nome;
  const ctr  = ficha?.contrato_principal;
  if (nome || ctr) {
    linhas.push([nome || 'Cliente', ctr ? `contrato ${ctr.id} (${ctr.status})` : null, ctr?.plano]
      .filter(Boolean).join(' · '));
  }

  const fin = ficha?.financeiro;
  if (fin?.titulos_abertos > 0) linhas.push(`${fin.titulos_abertos} título(s) em aberto, R$ ${Number(fin.valor_aberto || 0).toFixed(2)}`);
  if (ficha?.manutencao?.ativa) linhas.push('Manutenção ativa afetando a região');

  const conexao = ficha?.diagnostico?.conexao;
  if (conexao) linhas.push(`Conexão: ${conexao.online ? 'online' : 'OFFLINE'}`);

  if (playbook?.playbook) {
    const feitas = (playbook.etapas || []).filter(e => e.feita).length;
    linhas.push(`Procedimento "${playbook.playbook.nome}": ${feitas}/${(playbook.etapas || []).length} etapas`);
  }

  if (sinais.length) linhas.push(`Sinais: ${sinais.map(s => s.label).join(', ')}`);

  const doCliente = mensagens.filter(m => m.origem === 'cliente');
  if (doCliente.length) {
    linhas.push(`${doCliente.length} mensagem(ns) do cliente. Última: "${String(doCliente.at(-1).texto || '').slice(0, 120)}"`);
  }

  return linhas.length ? linhas.join('\n') : 'Ainda não há dados suficientes para resumir.';
}

/** Rótulo curto da ação, para o botão da tela. */
export const LABEL_ACAO = {
  responder:        'Sugerir resposta',
  consultar:        'Consultar antes de responder',
  avancar_playbook: 'Avançar o procedimento',
};
