/**
 * contextCards.js — os cartões do Cliente 360 (FASE 6, §34).
 *
 * Puro de propósito: é a única parte do Cliente 360 que **decide** alguma
 * coisa, e decisão sem teste vira boato na tela do agente. Tudo aqui recebe a
 * ficha já composta e devolve cartões; nada consulta banco ou SGP.
 *
 * Duas regras de produto que valem mais que o código:
 *
 *  - **Cartão é o que MUDA o atendimento nos primeiros 10 segundos.** Se o
 *    agente não faz nada diferente por causa do cartão, ele é ruído — e ruído
 *    empurra para baixo o cartão que importava. Por isso são poucos e todos
 *    têm ação sugerida.
 *  - **Nunca invente certeza.** Sem dado, não há cartão; um "risco de churn"
 *    montado sobre ficha vazia faz o agente tratar mal um cliente fiel.
 */

/** Ordem de exibição = urgência operacional. */
const SEVERIDADE = { critico: 0, alerta: 1, info: 2, oportunidade: 3 };

const dias = (desde, agora) => {
  const t = new Date(desde).getTime();
  return Number.isFinite(t) ? (agora - t) / 86_400_000 : Infinity;
};

/**
 * @param {object} ficha
 *   contratos[]        {status, titulos_abertos, valor_aberto, plano}
 *   conexao            {online} | null
 *   chamados[]         {data_cadastro, status}
 *   manutencao         {ativa, descricao} | null
 *   conversas_anteriores  número
 *   ultimo_nps         {nota, escala, criado_em} | null
 *   ultima_conversa_em  ISO | null
 * @param {number} agora  epoch ms (injetável para teste)
 * @returns {Array<{id,titulo,detalhe,severidade,acao}>}
 */
export function gerarCards(ficha = {}, agora = Date.now()) {
  const cards = [];
  const contratos = Array.isArray(ficha.contratos) ? ficha.contratos : [];
  const chamados  = Array.isArray(ficha.chamados)  ? ficha.chamados  : [];

  // ── Manutenção regional: vem PRIMEIRO porque muda a resposta inteira.
  // Sem isto o agente abre chamado individual para uma queda coletiva.
  if (ficha.manutencao?.ativa) {
    cards.push({
      id: 'manutencao_regional',
      titulo: 'Manutenção na região',
      detalhe: ficha.manutencao.descricao || 'Há manutenção programada afetando a área deste cliente.',
      severidade: 'critico',
      acao: 'Informe a previsão e NÃO abra chamado individual.',
    });
  }

  // ── Conexão offline (só afirma quando a consulta respondeu).
  if (ficha.conexao && ficha.conexao.online === false) {
    cards.push({
      id: 'conexao_offline',
      titulo: 'Conexão offline agora',
      detalhe: ficha.conexao.msg || 'O contrato está sem conexão neste momento.',
      severidade: 'critico',
      acao: 'Rode o diagnóstico completo antes de prometer visita.',
    });
  }

  // ── Financeiro. Suspenso por débito é diferente de "tem boleto aberto":
  // um explica a reclamação inteira, o outro é rotina.
  const emAberto  = contratos.reduce((s, c) => s + (Number(c.valor_aberto) || 0), 0);
  const titulos   = contratos.reduce((s, c) => s + (Number(c.titulos_abertos) || 0), 0);
  const suspenso  = contratos.some(c => String(c.status || '').includes('suspenso'));

  if (suspenso && titulos > 0) {
    cards.push({
      id: 'suspenso_por_debito',
      titulo: 'Contrato suspenso com débito',
      detalhe: `${titulos} título(s) em aberto, R$ ${emAberto.toFixed(2)}.`,
      severidade: 'critico',
      acao: 'Ofereça 2ª via ou promessa de pagamento — é provavelmente o motivo do contato.',
    });
  } else if (titulos > 0) {
    cards.push({
      id: 'titulos_em_aberto',
      titulo: `${titulos} título(s) em aberto`,
      detalhe: `Total de R$ ${emAberto.toFixed(2)}.`,
      severidade: 'alerta',
      acao: 'Segunda via disponível nas ações rápidas.',
    });
  }

  // ── Chamados recentes: repetição é o sinal, não o volume histórico.
  const recentes = chamados.filter(c => dias(c.data_cadastro, agora) <= 30);
  if (recentes.length >= 3) {
    cards.push({
      id: 'multiplos_chamados',
      titulo: `${recentes.length} chamados em 30 dias`,
      detalhe: 'Problema recorrente — o anterior provavelmente não resolveu.',
      severidade: 'alerta',
      acao: 'Leia o último chamado antes de abrir outro.',
    });
  }

  // ── Recorrência de conversa (dado nosso, não do ERP).
  if (Number(ficha.conversas_anteriores) >= 3) {
    cards.push({
      id: 'cliente_recorrente',
      titulo: `${ficha.conversas_anteriores} atendimentos anteriores`,
      detalhe: 'Cliente já falou conosco várias vezes.',
      severidade: 'info',
      acao: 'Veja o histórico antes de pedir o CPF de novo.',
    });
  }

  // ── NPS detrator recente.
  const nps = ficha.ultimo_nps;
  if (nps && Number.isFinite(Number(nps.nota))) {
    const escala = Number(nps.escala) === 5 ? 5 : 10;
    const nota   = Number(nps.nota);
    const detrator = escala === 5 ? nota <= 2 : nota <= 6;
    if (detrator && dias(nps.criado_em, agora) <= 90) {
      cards.push({
        id: 'nps_detrator',
        titulo: `Avaliou ${nota}/${escala} recentemente`,
        detalhe: 'Cliente insatisfeito na última pesquisa.',
        severidade: 'alerta',
        acao: 'Trate com cuidado extra; considere escalar.',
      });
    }
  }

  // ── Risco de churn: COMBINAÇÃO, nunca um sinal só. Um boleto atrasado não
  // é churn; boleto atrasado + insatisfação + chamado repetido é.
  const sinais = [
    suspenso || titulos > 0,
    recentes.length >= 2,
    cards.some(c => c.id === 'nps_detrator'),
  ].filter(Boolean).length;
  if (sinais >= 2) {
    cards.push({
      id: 'risco_churn',
      titulo: 'Risco de cancelamento',
      detalhe: 'Débito, chamados repetidos e/ou insatisfação ao mesmo tempo.',
      severidade: 'critico',
      acao: 'Resolva na primeira conversa; evite transferir de novo.',
    });
  }

  // ── Sem contrato ativo: muda quem atende, não como se atende.
  // `suspenso` NÃO entra aqui: suspenso é cliente com contrato, bloqueado por
  // débito — mandar isso para o comercial como "provável novo contrato" é
  // atender errado, e o cartão financeiro já cobriu o caso.
  const VIVO = ['ativo', 'novo', 'suspenso'];
  if (contratos.length && !contratos.some(c => VIVO.some(v => String(c.status || '').startsWith(v)))) {
    cards.push({
      id: 'sem_contrato_ativo',
      titulo: 'Nenhum contrato ativo',
      detalhe: `Situação: ${[...new Set(contratos.map(c => c.status))].join(', ')}.`,
      severidade: 'info',
      acao: 'Provável assunto comercial (retorno/novo contrato).',
    });
  }

  return cards.sort((a, b) => SEVERIDADE[a.severidade] - SEVERIDADE[b.severidade]);
}
