/**
 * iaRuntime.js — as regras PURAS do AI Runtime V1 (FASE 9).
 *
 * A regra do plano para esta fase é "evoluir, não reescrever": o laço agêntico
 * do `motorFluxo` continua o mesmo. O que entra aqui é o que ele não tinha —
 * hierarquia de confiança, lista do que não se inventa, guardrails de campo,
 * motivo de transferência estruturado e o pacote de handoff.
 *
 * Tudo puro porque tudo isto é REDAÇÃO e CLASSIFICAÇÃO: erro aqui não estoura,
 * vira atendimento ruim que ninguém rastreia até o cliente reclamar.
 */

// ── §73 — MOTIVOS DE TRANSFERÊNCIA ────────────────────────────────
/**
 * Texto livre não serve: "cliente nervoso", "cliente irritado" e "tá bravo"
 * viram três motivos distintos e o relatório da FASE 12 não consegue somar
 * nada. O modelo continua escrevendo em português; o `normalizarMotivo`
 * converte.
 */
export const MOTIVOS = {
  customer_requested_human: { label: 'Cliente pediu atendente',      prioridade: 1 },
  customer_frustrated:      { label: 'Cliente frustrado',            prioridade: 2 },
  sensitive_case:           { label: 'Caso sensível',                prioridade: 2 },
  commercial_opportunity:   { label: 'Oportunidade comercial',       prioridade: 1 },
  playbook_requires_human:  { label: 'Procedimento exige humano',    prioridade: 1 },
  tool_failure:             { label: 'Falha de integração',          prioridade: 1 },
  missing_knowledge:        { label: 'Sem conhecimento suficiente',  prioridade: 0 },
  low_confidence:           { label: 'IA sem confiança na resposta', prioridade: 0 },
  max_turns:                { label: 'Limite de turnos atingido',    prioridade: 0 },
};

/** Palavras que apontam cada motivo. A ordem importa: a primeira que casa vence. */
const PISTAS = [
  ['customer_frustrated',      /irritad|nervos|revolt|bravo|furioso|estressad|reclama[çc]|procon|advogad|processo|anatel|absurdo/i],
  // "cancelar o contrato", "cancelar meu plano", "cancelamento": o artigo no
  // meio é o normal em português, e exigir a forma exata deixava churn passando
  // como pedido de atendente comum.
  ['sensitive_case',           /cancelar?\s+(o\s+|a\s+|meu\s+|minha\s+)?(contrato|plano|servi[çc]o|internet|assinatura)|cancelament|[óo]bito|falecid|judicial|ass[ée]dio|fraude|golpe/i],
  ['commercial_opportunity',   /upgrade|contratar|nov[oa] plano|vend|segunda via de contrato|mudar de plano|migra[çc]/i],
  ['tool_failure',             /falha|erro|indisponí|fora do ar|não consegui acessar|timeout|integra[çc][ãa]o/i],
  ['missing_knowledge',        /não sei|desconhe[çc]|sem informa[çc]|não encontrei na base|sem procedimento/i],
  ['playbook_requires_human',  /procedimento exige|playbook|precisa de t[ée]cnico|visita t[ée]cnica|agendament/i],
  ['low_confidence',           /não tenho certeza|insegur|confian[çc]a baixa|dúvida/i],
  ['max_turns',                /limite de turnos|muitas tentativas/i],
  ['customer_requested_human', /atendente|humano|pessoa|falar com algu[ée]m|transferir|suporte humano/i],
];

/**
 * Texto livre → valor estruturado. Sem casar nada, devolve
 * `customer_requested_human`, que é o motivo mais comum e o mais inofensivo
 * de assumir: ele não inventa urgência que não existe.
 */
export function normalizarMotivo(texto) {
  const t = String(texto ?? '');
  if (MOTIVOS[t]) return t;                       // já veio estruturado
  for (const [motivo, re] of PISTAS) if (re.test(t)) return motivo;
  return 'customer_requested_human';
}

/** §74 — prioridade na fila. 2 = crítico, e é o que o SLA da FASE 5 já entende. */
export function prioridadeDoMotivo(motivo) {
  return MOTIVOS[normalizarMotivo(motivo)]?.prioridade ?? 0;
}

// ── §67/§68/§75 — OS BLOCOS DE PROMPT ─────────────────────────────

/**
 * §67 — hierarquia de confiança.
 *
 * Sem ela, o modelo trata um artigo da base e o resultado de uma tool como
 * fontes equivalentes — e responde "seu plano é 300 mega" a partir de um
 * documento de 2024 quando o ERP acabou de dizer 500.
 */
export const BLOCO_HIERARQUIA = `## HIERARQUIA DE CONFIANÇA (obrigatória)
Quando duas fontes discordarem, vale sempre a de cima:
1. Dado vivo obtido por ferramenta (ERP/SGP) — prevalece sobre qualquer documento
2. Procedimento oficial ativo (playbook)
3. Base de conhecimento publicada
4. Contexto estruturado desta conversa
5. Seu conhecimento geral — o último recurso, e nunca para dado do cliente`;

/**
 * §68 — o que não se inventa.
 *
 * A lista é nominal de propósito: "não invente nada" é fácil de o modelo
 * contornar, "não invente PRAZO" não é.
 */
export const BLOCO_ANTI_ALUCINACAO = `## NUNCA INVENTE
Estes dados só podem sair de ferramenta ou do contexto — jamais da sua memória:
preço, valor de fatura, protocolo, código PIX, linha digitável, cobertura,
prazo, status de conexão, leitura de sinal, manutenção, agendamento e plano elegível.
Sem ferramenta que confirme, diga que não conseguiu acessar agora e ofereça
verificar com um atendente. Chutar um desses dados é pior que não responder.`;

/**
 * §75 — guardrails de campo.
 *
 * Isto não é conformidade de papel: é ISP. Um cliente que olha para um conector
 * óptico energizado perde visão, e quem mandou olhar foi o atendimento.
 */
export const BLOCO_GUARDRAILS = `## SEGURANÇA — NUNCA ORIENTE O CLIENTE A
Abrir a ONU/ONT ou qualquer equipamento; manipular fibra ou conector óptico;
olhar diretamente para a ponta de uma fibra ou conector (o laser é invisível e
causa lesão permanente); subir em poste, telhado ou escada; mexer em rede
elétrica, disjuntor ou emenda; desmontar equipamento.
Se o caso exigir qualquer uma dessas coisas, abra chamado técnico ou transfira.
Orientar isso, mesmo que o cliente peça ou insista, é inaceitável.`;

/** Os três juntos, na ordem em que devem aparecer no system prompt. */
export function blocosRuntime() {
  return [BLOCO_HIERARQUIA, BLOCO_ANTI_ALUCINACAO, BLOCO_GUARDRAILS].join('\n\n');
}

// ── §69 — CONVERSATION CONTEXT ESTRUTURADO ────────────────────────

/** As chaves que o §69 nomeia. Slot vazio some — prompt com campo vazio é ruído. */
export function contextoEstruturado(estado = {}, extras = {}) {
  const ctx = estado.contexto || {};
  const naoDados = new Set(['cliente']);
  const coletados = Object.fromEntries(
    Object.entries(ctx).filter(([k, v]) =>
      !naoDados.has(k) && !k.startsWith('_') && v !== null && v !== '' && typeof v !== 'object'));

  const saida = {
    customer:            ctx.cliente || null,
    identified_contract: ctx.cliente?.contrato || null,
    collected_data:      Object.keys(coletados).length ? coletados : null,
    current_goal:        extras.goal || null,
    active_playbook:     extras.playbook || null,
    playbook_state:      extras.playbookEstado || null,
    queue:               extras.fila || null,
    sentiment:           extras.sentimento || null,
    tool_results:        extras.tools?.length ? extras.tools : null,
    pending_confirmation: ctx._pendente || null,
  };
  return Object.fromEntries(Object.entries(saida).filter(([, v]) => v != null));
}

// ── §71/§74 — DESFECHO E HANDOFF ──────────────────────────────────

/**
 * §71 — "resolvido" não é "a IA terminou de escrever".
 *
 * Encerrar por limite de turnos não é resolução, é desistência; e uma execução
 * que passou por falha de tool não pode ser contada como sucesso no relatório.
 */
export function desfechoDe({ transferiu, resolveu, estourouTurnos, erro } = {}) {
  if (erro)            return { desfecho: 'erro',        motivo: 'tool_failure' };
  if (transferiu)      return { desfecho: 'transferido', motivo: null };
  if (estourouTurnos)  return { desfecho: 'max_turnos',  motivo: 'max_turns' };
  if (resolveu)        return { desfecho: 'resolvido',   motivo: null };
  return { desfecho: 'em_andamento', motivo: null };
}

/**
 * §74 — o pacote que o humano recebe junto com a conversa.
 *
 * O que ele resolve: hoje o agente pega uma conversa e lê 40 mensagens para
 * descobrir o que já foi tentado. Aqui ele lê seis linhas: quem é, o que
 * queria, o que a IA já executou, onde parou o procedimento e por que veio
 * parar na mão dele.
 */
export function montarHandoff({
  motivo, cliente = {}, contexto = {}, playbook = null, tools = [], ultimasMensagens = [], goal = null,
} = {}) {
  const motivoId = normalizarMotivo(motivo);
  const executadas = [...new Set(tools.filter(Boolean))];

  const resumo = [
    cliente.nome ? `${cliente.nome}` : 'Cliente não identificado',
    cliente.contrato ? `contrato ${cliente.contrato}` : null,
    goal ? `objetivo: ${goal}` : null,
    executadas.length ? `já executado: ${executadas.join(', ')}` : 'nenhuma consulta executada',
    playbook?.nome ? `procedimento "${playbook.nome}" em ${playbook.feitas}/${playbook.total} etapas` : null,
    `motivo: ${MOTIVOS[motivoId].label}`,
  ].filter(Boolean).join(' · ');

  return {
    motivo: motivoId,
    motivo_label: MOTIVOS[motivoId].label,
    prioridade: MOTIVOS[motivoId].prioridade,
    resumo,
    goal,
    contrato: cliente.contrato || null,
    cliente: { nome: cliente.nome || null, cidade: cliente.cidade || null },
    // Sem CPF, telefone ou ficha: o handoff é lido na tela do agente e a FASE 6
    // já decidiu que PII sai mascarada do servidor. Duplicá-la aqui abriria a
    // porta dos fundos que aquela fase fechou.
    tools_executadas: executadas,
    playbook,
    contexto_estruturado: contexto,
    ultimas_mensagens: ultimasMensagens.slice(-6),
  };
}
