/**
 * cliente360.js — o painel do assinante na tela de atendimento (FASE 6).
 *
 * GET  /api/cliente360/:conversaId              — ficha (rápida, sem diagnóstico)
 * GET  /api/cliente360/:conversaId?diagnostico=1 — inclui conexão e chamados (lento)
 * POST /api/cliente360/:conversaId/acao         — executa UMA tool do catálogo
 * POST /api/cliente360/:conversaId/diagnostico  — roda as tools de leitura juntas
 * GET  /api/cliente360/:conversaId/tecnico      — fibra: ONU, topologia e sinal
 * GET  /api/cliente360/:conversaId/faturas      — boletos em aberto, estruturados
 * GET  /api/cliente360/capacidades              — o que ESTE agente pode
 *
 * Toda ação passa pelo Tool Registry (`executarTool`), com `actorType: human`
 * no audit_log — é a regra do plano: nada de integração paralela.
 */
import { Router } from 'express';
import { authMiddleware }          from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';
import { conversaRepo }   from '../repositories/conversaRepository.js';
import { auditar, ipDe }  from '../services/auditoria.js';
import { pode, capacidadesDe } from '../services/permissoes.js';
import { montarFicha, identificar, contratosPermitidos, dadosTecnicos, faturasEmAberto, ACOES, TOOLS_DIAGNOSTICO } from '../services/cliente360.js';
import { executarTool }   from '../services/iaTools.js';

export const cliente360Router = Router();
cliente360Router.use(authMiddleware);

cliente360Router.get('/capacidades', asyncHandler(async (req, res) => {
  res.json({
    capacidades: capacidadesDe(req.agente),
    acoes: Object.entries(ACOES)
      .filter(([, a]) => pode(req.agente, a.capacidade))
      .map(([id, a]) => ({ id, label: a.label })),
  });
}));

/**
 * Contexto para as rotas de AÇÃO: conversa + o contrato que ela pode tocar.
 *
 * `contratoPedido` só é aceito se pertencer ao cliente desta conversa — ver
 * `contratosPermitidos`. Sem essa checagem, o painel viraria uma porta para
 * consultar boleto e abrir chamado no contrato de qualquer assinante.
 */
async function contextoDa(req, contratoPedido = null) {
  const conversa = await conversaRepo.porId(req.params.conversaId);
  if (!conversa) throw new HttpError(404, 'Conversa não encontrada');

  const { cpf, contratos, principal, detalhes } = await contratosPermitidos(conversa);
  if (contratoPedido && !contratos.includes(String(contratoPedido))) {
    throw new HttpError(403, 'Contrato não pertence ao cliente desta conversa');
  }

  return {
    conversa,
    detalhes: detalhes || [],
    // Mesmo formato que o motor monta para as tools — `executarTool` lê daqui
    // o contrato e o CPF, então o painel e a IA falam a MESMA linguagem.
    ctx: {
      conversa,
      cliente: {
        cpf,
        contrato: contratoPedido ? String(contratoPedido) : principal,
        cidade:   conversa.cidade || null,
      },
    },
  };
}

cliente360Router.get('/:conversaId', asyncHandler(async (req, res) => {
  if (!pode(req.agente, 'cliente360')) throw new HttpError(403, 'Sem permissão para ver o painel do cliente');
  const conversa = await conversaRepo.porId(req.params.conversaId);
  if (!conversa) throw new HttpError(404, 'Conversa não encontrada');

  const diagnostico = req.query.diagnostico === '1' && pode(req.agente, 'diagnostico');
  const ficha = await montarFicha(conversa, req.agente, { diagnostico });

  // §116: ver a ficha de um assinante é acesso a PII e fica registrado. Só o
  // que foi visto, nunca o conteúdo — audit_log não pode virar cópia da ficha.
  auditar({
    actorType: 'human', actorId: req.agente.id, action: 'cliente360_consultado',
    conversaId: conversa.id, after: { diagnostico, revelado: !ficha.identidade.mascarado },
    ip: ipDe(req),
  });

  res.json(ficha);
}));

cliente360Router.post('/:conversaId/acao', asyncHandler(async (req, res) => {
  const { acao, contrato, ...resto } = req.body || {};
  const def = ACOES[acao];
  if (!def) throw new HttpError(400, `Ação desconhecida: ${acao}`);
  if (!pode(req.agente, def.capacidade)) throw new HttpError(403, `Sem permissão para "${def.label}"`);

  // Allowlist por ação: repassar `req.body` inteiro para `executarTool` deixa
  // o cliente escolher QUALQUER campo de entrada da tool — inclusive `cpfcnpj`,
  // que atravessaria o contexto da conversa.
  const entradas = {};
  for (const campo of def.campos || []) {
    if (resto[campo] !== undefined) entradas[campo] = resto[campo];
  }

  const { conversa, ctx } = await contextoDa(req, contrato || null);

  // O audit da tool de escrita sai de dentro do `executarTool` com actor `ai`
  // (é o caminho da IA). Aqui registramos o que ele não sabe: foi um HUMANO,
  // qual, e de onde. Os dois eventos juntos contam a história inteira.
  auditar({
    actorType: 'human', actorId: req.agente.id, action: 'cliente360_acao',
    resource: def.tool, conversaId: conversa.id, ip: ipDe(req),
  });

  const resultado = await executarTool(def.tool, entradas, ctx);
  res.json({ acao, tool: def.tool, resultado });
}));

cliente360Router.post('/:conversaId/diagnostico', asyncHandler(async (req, res) => {
  if (!pode(req.agente, 'diagnostico')) throw new HttpError(403, 'Sem permissão para diagnóstico');
  const { conversa, ctx } = await contextoDa(req);

  // Em paralelo e cada uma isolada: o RADIUS fora do ar não pode esconder o
  // resultado da conexão, que é o que o agente veio ver.
  const passos = await Promise.all(TOOLS_DIAGNOSTICO.map(async tool => {
    const inicio = Date.now();
    try {
      return { tool, ok: true, resultado: await executarTool(tool, {}, ctx), ms: Date.now() - inicio };
    } catch (err) {
      return { tool, ok: false, erro: err.message, ms: Date.now() - inicio };
    }
  }));

  auditar({
    actorType: 'human', actorId: req.agente.id, action: 'cliente360_diagnostico',
    conversaId: conversa.id, after: { falhas: passos.filter(p => !p.ok).map(p => p.tool) }, ip: ipDe(req),
  });

  res.json({ passos, falhas: passos.filter(p => !p.ok).length });
}));

/**
 * Fibra: topologia da ONU + sinal óptico.
 *
 * Rota SEPARADA da ficha de propósito: são 2 idas ao SGP e a lateral do chat
 * precisa abrir rápido. Quem chama é o painel completo, no clique do agente.
 */
cliente360Router.get('/:conversaId/tecnico', asyncHandler(async (req, res) => {
  if (!pode(req.agente, 'diagnostico')) throw new HttpError(403, 'Sem permissão para diagnóstico');
  const { conversa, ctx } = await contextoDa(req, req.query.contrato || null);
  if (!ctx.cliente.contrato) return res.json({ onu: null, avisos: ['Cliente sem contrato identificado nesta conversa.'] });

  auditar({
    actorType: 'human', actorId: req.agente.id, action: 'cliente360_tecnico',
    conversaId: conversa.id, ip: ipDe(req),
  });

  res.json(await dadosTecnicos(ctx.cliente.contrato));
}));

/**
 * Boletos em aberto com PIX, linha digitável e PDF separados.
 *
 * A ação `segunda_via_boleto` continua existindo e continua sendo o caminho
 * quando o agente quer MANDAR o boleto — aquela passa por `executarTool` e é
 * auditada como tool. Esta é LEITURA para a tela, sobre a mesma integração.
 */
/** Teto de contratos consultados numa tacada. Explícito: o `limitado` no corpo
 *  conta ao agente que a lista foi cortada — corte silencioso lê como "é tudo". */
const MAX_CONTRATOS_FATURA = 6;

cliente360Router.get('/:conversaId/faturas', asyncHandler(async (req, res) => {
  if (!pode(req.agente, 'financeiro')) throw new HttpError(403, 'Sem permissão para o financeiro');
  const { conversa, ctx, detalhes } = await contextoDa(req, req.query.contrato || null);
  if (!ctx.cliente.cpf) return res.json({ boletos: [], mensagem: 'Cliente não identificado nesta conversa.', falhas: [] });

  // SEM `?contrato=`, consulta TODOS os contratos com título em aberto.
  //
  // O resumo do Financeiro soma os títulos do cliente inteiro; pedir boleto só
  // do contrato selecionado produzia "16 títulos em aberto" seguido de "nenhum
  // boleto em aberto" — os 16 estavam em OUTROS contratos do mesmo CPF.
  const comDivida = detalhes.filter(c => Number(c.titulos_abertos) > 0).map(c => String(c.id));
  const universo  = req.query.contrato ? [String(req.query.contrato)]
                  : (comDivida.length ? comDivida : [ctx.cliente.contrato].filter(Boolean));
  const alvo = universo.slice(0, MAX_CONTRATOS_FATURA);

  if (!alvo.length) return res.json({ boletos: [], mensagem: 'Nenhum contrato com título em aberto.', falhas: [] });

  auditar({
    actorType: 'human', actorId: req.agente.id, action: 'cliente360_faturas',
    conversaId: conversa.id, after: { contratos: alvo.length }, ip: ipDe(req),
  });

  try {
    const r = await faturasEmAberto(ctx.cliente.cpf, alvo);
    res.json({ ...r, contratos_consultados: alvo, limitado: universo.length > alvo.length });
  } catch (err) {
    // O painel nunca derruba o atendimento: SGP fora vira aviso, não 500.
    res.json({ boletos: [], mensagem: `Não foi possível consultar as faturas: ${err.message}`, falhas: alvo });
  }
}));
