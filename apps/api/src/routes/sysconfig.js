import { Router } from 'express';
import { invalidateConfigCache } from '../services/integrations.js';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const sysconfigRouter = Router();
sysconfigRouter.use(authMiddleware, adminMiddleware);

const CHAVES_PUBLICAS = [
  'prompt_ia', 'saudacao', 'horario', 'mensagem_fora_hora',
  'modo', 'horario_ativo', 'notificacoes',
  'anthropic_api_key', 'openai_api_key', 'sgp_url', 'sgp_token', 'sgp_app',
  'evolution_url', 'evolution_key', 'telegram_bot_token', 'nome_empresa',
];

sysconfigRouter.get('/', asyncHandler(async (req, res) => {
  const db   = getDb();
  const rows = await db('sistema_kv').whereIn('chave', CHAVES_PUBLICAS);
  const config = {};
  rows.forEach(r => {
    try { config[r.chave] = typeof r.valor === 'string' ? JSON.parse(r.valor) : r.valor; }
    catch { config[r.chave] = r.valor; }
  });
  res.json({ config });
}));

sysconfigRouter.put('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const updates = Object.entries(req.body).filter(([k]) => CHAVES_PUBLICAS.includes(k));
  for (const [chave, valor] of updates) {
    await db('sistema_kv')
      .insert({ chave, valor: JSON.stringify(valor) })
      .onConflict('chave').merge(['valor', 'atualizado']);
  }
  invalidateConfigCache();
  res.json({ ok: true });
}));

sysconfigRouter.get('/:chave', asyncHandler(async (req, res) => {
  const db  = getDb();
  const row = await db('sistema_kv').where({ chave: req.params.chave }).first();
  if (!row) return res.json({ valor: null });
  try { res.json({ valor: typeof row.valor === 'string' ? JSON.parse(row.valor) : row.valor }); }
  catch { res.json({ valor: row.valor }); }
}));

// ── ROTA DE TESTE DE TOOLS SGP ────────────────────────────────────────────
import { consultarClientes, segundaViaBoleto, promessaPagamento, criarChamado,
  verificarConexao, consultarManutencao, historicoOcorrencias, consultarRadius,
  statusRede } from '../services/integrations.js';

sysconfigRouter.post('/tools/test', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { tool, params = {} } = req.body;
  let result;
  const t0 = Date.now();
  try {
    switch (tool) {
      case 'consultar_cliente':
        result = await consultarClientes(params.cpfcnpj); break;
      case 'verificar_conexao':
        result = await verificarConexao(params.contrato); break;
      case 'consultar_manutencao':
        result = await consultarManutencao(); break;
      case 'status_rede':
        result = await statusRede(); break;
      case 'consultar_radius':
        result = await consultarRadius(params.cpfcnpj); break;
      case 'segunda_via_boleto':
        result = await segundaViaBoleto(params.cpfcnpj, params.contrato); break;
      case 'promessa_pagamento':
        result = await promessaPagamento(params.contrato); break;
      case 'historico_ocorrencias':
        result = await historicoOcorrencias(params.contrato); break;
      case 'criar_chamado':
        result = await criarChamado(
          params.contrato, params.ocorrenciatipo || 5,
          params.conteudo || 'Teste via painel',
          { contato_nome: params.contato_nome, contato_telefone: params.contato_telefone }
        ); break;
      default:
        return res.status(400).json({ error: `Tool desconhecida: ${tool}` });
    }
    res.json({ ok: true, ms: Date.now() - t0, result });
  } catch (e) {
    res.json({ ok: false, ms: Date.now() - t0, error: e.message });
  }
}));
