/**
 * cliente360.js — compõe a ficha do assinante para o painel do atendente
 * (FASE 6). É orquestração: **não fala HTTP com o SGP**, chama
 * `integrations.js`, que é a camada de integração única.
 *
 * A regra do plano ("não criar integrações paralelas quando a operação já
 * puder ser executada por Tool") vale literalmente: nada aqui inventa endpoint
 * novo, e toda AÇÃO passa por `executarTool` — o mesmo catálogo, o mesmo gate
 * de sandbox e a mesma auditoria que a IA usa. O que muda é só o `actorType`.
 *
 * Três decisões que valem mais que o código:
 *
 *  - **O painel NUNCA derruba o atendimento.** Todo bloco vem de rede que pode
 *    cair; cada um é resolvido isolado e um erro vira `null` + um aviso na
 *    ficha. Um SGP fora do ar tem que deixar o agente atendendo com o que
 *    existe no banco local, não travar a tela.
 *  - **Nada bloqueante fica no caminho crítico.** Identidade e financeiro vêm
 *    do mesmo `consultarClientes`; diagnóstico (conexão, chamados) é opcional
 *    e só entra quando pedido — é o que separa "abrir a conversa" de "rodar o
 *    diagnóstico completo".
 *  - **PII sai mascarada daqui.** A máscara é aplicada na borda, não na tela.
 */
import { getDb } from '../config/db.js';
import {
  consultarClientes, verificarConexao, historicoOcorrencias, consultarManutencao,
  consultarOnuFttx, segundaViaBoleto,
} from './integrations.js';
import { diagnosticoOnu }  from './sgpDb.js';
import { classificarSinal, mesclarFaturas } from './sgpHelpers.js';
import { mascararPII } from './mascarar.js';
import { gerarCards }  from './contextCards.js';
import { pode }        from './permissoes.js';

/** Executa e nunca propaga: bloco que falha vira null e um aviso legível. */
async function tentar(nome, fn, avisos) {
  try {
    return await fn();
  } catch (err) {
    avisos.push(`${nome}: ${err.message}`);
    console.error(`[Cliente360] ${nome}:`, err.message);
    return null;
  }
}

/**
 * O CPF que identifica o cliente nesta conversa.
 *
 * Ordem: o que a conversa já gravou → o que a IA coletou no estado do fluxo.
 * A segunda fonte importa porque o `consultar_cliente` do motor guarda a ficha
 * no `contexto` antes de a conversa ganhar `cpf`.
 */
export async function identificar(conversa) {
  if (conversa?.cpf) return conversa.cpf;
  const linha = await getDb()('flow_executions').where({ conversa_id: conversa.id }).first().catch(() => null);
  const estado = typeof linha?.estado === 'string' ? JSON.parse(linha.estado) : linha?.estado;
  return estado?.contexto?.cliente?.cpf || estado?.contexto?.cliente?.cpfcnpj || null;
}

/** Relacionamento que só nós temos: conversas anteriores, NPS, chamados locais. */
async function historicoLocal(conversa) {
  const db = getDb();
  // Sem telefone não há como agrupar o relacionamento — e `where({telefone:
  // null})` casaria com TODAS as conversas sem telefone, misturando o
  // histórico de clientes que não têm nada a ver um com o outro.
  if (!conversa.telefone) return { conversas_anteriores: 0, ultimo_nps: null, conversas_recentes: [] };
  const [anteriores, nps, ultimas] = await Promise.all([
    db('conversas')
      .where({ telefone: conversa.telefone })
      .whereNot({ id: conversa.id })
      .count('id as n').first(),
    db('satisfacao as s')
      .join('conversas as c', 'c.id', 's.conversa_id')
      .where({ 'c.telefone': conversa.telefone })
      .orderBy('s.criado_em', 'desc')
      .select('s.nota', 's.escala', 's.criado_em')
      .first(),
    db('conversas')
      .where({ telefone: conversa.telefone })
      .whereNot({ id: conversa.id })
      .orderBy('criado_em', 'desc')
      .limit(5)
      .select('id', 'protocolo', 'status', 'criado_em', 'ultima_mensagem'),
  ]);
  return {
    conversas_anteriores: Number(anteriores?.n) || 0,
    ultimo_nps: nps || null,
    conversas_recentes: ultimas,
  };
}

/**
 * Ficha completa do painel.
 *
 * @param {object} conversa
 * @param {object} agente    { role, permissoes } — decide máscara e blocos
 * @param {object} opts      { diagnostico: boolean } — inclui conexão e chamados (lento)
 */
export async function montarFicha(conversa, agente, { diagnostico = false } = {}) {
  const avisos = [];
  const revelar = pode(agente, 'ver_dados_completos');
  const cpf = await identificar(conversa);

  const sgp = cpf
    ? await tentar('SGP', () => consultarClientes(cpf), avisos)
    : null;
  const achou = sgp && !sgp.erro;
  if (cpf && !achou) avisos.push(sgp?.mensagem || 'Cliente não encontrado no SGP.');

  const contratos = achou ? sgp.contratos : [];
  const principal = contratos[0] || null;
  const local     = await tentar('histórico local', () => historicoLocal(conversa), avisos) || {};

  // Manutenção é barata e muda a resposta inteira — entra sempre, com escopo
  // no POP/cidade do cliente para não alarmar quem não é afetado.
  const manutencao = principal
    ? await tentar('manutenção', () => consultarManutencao({ popId: principal.popId, cidade: principal.cidade }), avisos)
    : null;

  let conexao = null, chamados = [];
  if (diagnostico && principal?.id) {
    // Em paralelo: são dois endpoints independentes e o agente está esperando.
    [conexao, chamados] = await Promise.all([
      tentar('conexão', () => verificarConexao(principal.id), avisos),
      tentar('chamados', () => historicoOcorrencias(principal.id), avisos).then(r => r || []),
    ]);
  }

  const identidade = mascararPII({
    nome:     achou ? sgp.nome : (conversa.nome || null),
    cpf:      cpf || null,
    telefone: conversa.telefone || null,
    email:    achou ? sgp.email : null,
  }, { revelar });

  const ficha = {
    identidade: { ...identidade, mascarado: !revelar },
    contratos,
    contrato_principal: principal,
    financeiro: pode(agente, 'financeiro') ? {
      titulos_abertos: contratos.reduce((s, c) => s + (Number(c.titulos_abertos) || 0), 0),
      valor_aberto:    contratos.reduce((s, c) => s + (Number(c.valor_aberto) || 0), 0),
      vencimento:      principal?.venc_dia || null,
    } : null,
    diagnostico: pode(agente, 'diagnostico') ? { conexao, chamados, executado: diagnostico } : null,
    manutencao,
    ...local,
    avisos,
  };

  // Os cartões enxergam a ficha COMPLETA, inclusive blocos que o agente não
  // pode ver: o cartão diz "há débito", não quanto. Esconder o sinal junto com
  // o número faria o agente atender no escuro.
  ficha.cards = gerarCards({
    contratos, conexao, chamados, manutencao,
    conversas_anteriores: local.conversas_anteriores,
    ultimo_nps: local.ultimo_nps,
  });

  return ficha;
}

/**
 * Contratos que ESTA conversa pode tocar.
 *
 * `executarTool` dá precedência ao `input.contrato` — então, sem esta lista,
 * um agente autenticado poderia mandar `{acao:'segunda_via_boleto',
 * contrato: 999}` e puxar o boleto de OUTRO assinante pela conversa dele. A
 * regra: o contrato pedido só vale se pertencer ao cliente identificado na
 * conversa.
 *
 * @returns {Promise<{cpf: string|null, contratos: string[], principal: string|null}>}
 */
export async function contratosPermitidos(conversa) {
  const cpf = await identificar(conversa);
  if (!cpf) return { cpf: null, contratos: [], principal: conversa.contrato_id || null };

  const sgp = await consultarClientes(cpf).catch(() => null);
  const detalhes = (sgp && !sgp.erro ? sgp.contratos : []);
  const ids = detalhes.map(c => String(c.id));
  const doBanco = conversa.contrato_id ? String(conversa.contrato_id) : null;

  // O contrato gravado na conversa entra na lista mesmo que o SGP não responda:
  // integração fora do ar não pode virar bloqueio de atendimento.
  const contratos = [...new Set([...(doBanco ? [doBanco] : []), ...ids])];
  const principal = (doBanco && contratos.includes(doBanco)) ? doBanco : (contratos[0] || null);
  // `detalhes` é o que permite perguntar "quais contratos têm título em aberto?"
  // sem uma segunda ida ao SGP.
  return { cpf, contratos, principal, detalhes };
}

/** Tools de LEITURA que o "Diagnóstico completo" dispara juntas (§29). */
export const TOOLS_DIAGNOSTICO = ['verificar_conexao', 'consultar_manutencao', 'consultar_radius', 'historico_ocorrencias'];

/**
 * Ações rápidas permitidas pelo painel.
 *
 * Allowlist explícita: `executarTool` aceita qualquer nome do catálogo, e sem
 * esta lista o painel viraria um executor genérico de tools por HTTP —
 * incluindo `encerrar_atendimento` e `transferir_para_humano`, que não são
 * ações de painel.
 */
export const ACOES = {
  segunda_via_boleto:   { tool: 'segunda_via_boleto',   label: '2ª via de boleto',      capacidade: 'financeiro',  campos: [] },
  promessa_pagamento:   { tool: 'promessa_pagamento',   label: 'Promessa de pagamento', capacidade: 'financeiro',  campos: [] },
  verificar_conexao:    { tool: 'verificar_conexao',    label: 'Verificar conexão',     capacidade: 'diagnostico', campos: [] },
  consultar_radius:     { tool: 'consultar_radius',     label: 'Sessão RADIUS',         capacidade: 'diagnostico', campos: [] },
  historico_ocorrencias:{ tool: 'historico_ocorrencias',label: 'Chamados recentes',     capacidade: 'diagnostico', campos: [] },
  consultar_manutencao: { tool: 'consultar_manutencao', label: 'Manutenção na região',  capacidade: 'diagnostico', campos: [] },
  // Únicos campos livres do painel — e nenhum deles escolhe DE QUEM é o
  // contrato: isso vem da conversa, sempre.
  criar_chamado:        { tool: 'criar_chamado',        label: 'Abrir chamado',         capacidade: 'acoes', campos: ['conteudo', 'ocorrenciatipo'] },
  listar_planos_ativos: { tool: 'listar_planos_ativos', label: 'Planos disponíveis',    capacidade: 'acoes', campos: ['cidade'] },
};

/**
 * O card da FIBRA: topologia + sinal.
 *
 * Duas fontes de propósito, e cada uma cai sozinha:
 *  - topologia (OLT/slot/PON/VLAN/CTO) → API FTTH;
 *  - sinal (Rx/Tx, online, uptime, última queda) → `sgpDb`, leitura direta no
 *    banco do SGP, que é o caminho que o `consultar_onu_acs` já usava.
 *
 * Não entra na ficha do caminho crítico: são 2 idas ao SGP e o painel tem que
 * abrir rápido. Carrega quando o agente ABRE o painel completo.
 */
export async function dadosTecnicos(contrato) {
  const avisos = [];
  const [topologia, sinal] = await Promise.all([
    tentar('ONU (FTTH)', () => consultarOnuFttx(contrato), avisos),
    tentar('sinal óptico', () => diagnosticoOnu(contrato), avisos),
  ]);

  return {
    onu: (topologia || sinal) ? {
      ...(topologia || {}),
      // O serial da topologia e o do banco são o mesmo campo por caminhos
      // diferentes; o do banco ganha porque é o que a OLT respondeu por último.
      serial: sinal?.serial || topologia?.serial || null,
      modelo: sinal?.modelo || topologia?.modelo || null,
      rx_dbm: sinal?.rx_dbm ?? null,
      tx_dbm: sinal?.tx_dbm ?? null,
      olt_rx_dbm: sinal?.olt_rx_dbm ?? null,
      sinal_lido_em: sinal?.sinal_lido_em || null,
      online: sinal?.online ?? null,
      uptime_segundos: sinal?.uptime_segundos ?? null,
      ultima_queda_motivo: sinal?.ultima_queda_motivo || null,
      qualidade: classificarSinal(sinal?.rx_dbm ?? null),
    } : null,
    avisos,
  };
}

/**
 * Faturas em aberto, ESTRUTURADAS.
 *
 * É a MESMA `segundaViaBoleto` que a tool da IA usa — não é integração
 * paralela; o que muda é o formato: a tool devolve texto pronto para o cliente
 * ler, e o painel precisa dos campos separados para virar botão de copiar PIX,
 * copiar linha digitável e abrir o PDF.
 *
 * **Aceita LISTA porque o resumo do Financeiro é do CLIENTE.** Somávamos os
 * títulos de todos os contratos e pedíamos boleto de um só: o painel dizia
 * "16 títulos em aberto" e, na linha seguinte, "nenhum boleto em aberto".
 * O número e a lista têm que falar do mesmo universo.
 */
export async function faturasEmAberto(cpf, contratos) {
  const lista = (Array.isArray(contratos) ? contratos : [contratos]).filter(Boolean).map(String);
  if (!lista.length) return { boletos: [], mensagem: 'Nenhum contrato para consultar.', falhas: [] };

  const resultados = await Promise.all(lista.map(async contrato => ({
    contrato,
    // Cada contrato cai sozinho: um erro não pode esconder o boleto dos outros.
    r: await segundaViaBoleto(cpf, contrato).catch(e => ({ erro: true, mensagem: e.message })),
  })));

  return mesclarFaturas(resultados);
}
