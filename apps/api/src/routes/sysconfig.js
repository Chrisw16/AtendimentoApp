import { Router } from 'express';
import { invalidateConfigCache } from '../services/integrations.js';
import { invalidateSgpDbPool, diagnosticoOnu } from '../services/sgpDb.js';
import { formatarDiagnosticoOnu } from '../services/sgpHelpers.js';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { auditar, ipDe } from '../services/auditoria.js';
import { lerValorKV, mascararConfig, mascarar, ehSecreta, valorParaGravar } from '../services/kvSeguro.js';
import { getDb } from '../config/db.js';

export const sysconfigRouter = Router();
sysconfigRouter.use(authMiddleware, adminMiddleware);

const CHAVES_PUBLICAS = [
  'prompt_ia', 'saudacao', 'horario', 'mensagem_fora_hora',
  'modo', 'horario_ativo', 'notificacoes',
  'anthropic_api_key', 'openai_api_key', 'sgp_url', 'sgp_token', 'sgp_app',
  'evolution_url', 'evolution_key', 'telegram_bot_token', 'nome_empresa',
  'sgpdb_host', 'sgpdb_port', 'sgpdb_name', 'sgpdb_user', 'sgpdb_password',
];

sysconfigRouter.get('/', asyncHandler(async (req, res) => {
  const db   = getDb();
  const rows = await db('sistema_kv').whereIn('chave', CHAVES_PUBLICAS);
  const config = {};
  rows.forEach(r => {
    // Uma credencial ilegível (KV_SECRET ausente/trocada) não pode derrubar a
    // tela inteira de Configurações: vira null, o log diz qual, o operador
    // re-salva. Falhar tudo deixaria o admin sem como consertar pela interface.
    try { config[r.chave] = lerValorKV(r.valor, r.chave); }
    catch (err) { console.error('[sysconfig]', err.message); config[r.chave] = null; }
  });
  // §117: o frontend nunca recebe o segredo de volta — só a máscara.
  res.json({ config: mascararConfig(config) });
}));

sysconfigRouter.put('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const updates = Object.entries(req.body).filter(([k]) => CHAVES_PUBLICAS.includes(k));
  const gravadas = [];
  let semSegredo = false;
  for (const [chave, valor] of updates) {
    // A tela devolve a máscara nos campos que o operador não tocou. Gravá-la
    // trocaria a credencial real por `••••1234` — e a tela continuaria
    // mostrando uma máscara depois, então o estrago passaria despercebido até
    // o SGP começar a dar 403.
    const decisao = valorParaGravar(chave, valor);
    if (!decisao.gravar) continue;
    if (ehSecreta(chave) && !process.env.KV_SECRET) semSegredo = true;
    await db('sistema_kv')
      .insert({ chave, valor: decisao.valor })
      .onConflict('chave').merge(['valor', 'atualizado']);
    gravadas.push(chave);
  }
  if (semSegredo) {
    console.warn('[sysconfig] KV_SECRET ausente — credenciais gravadas em texto plano. Defina a env e re-salve para cifrar em repouso.');
  }
  invalidateConfigCache();
  invalidateSgpDbPool();
  // Audita os NOMES das chaves alteradas — nunca os valores (são credenciais).
  if (gravadas.length) {
    auditar({ actorType: 'human', actorId: req.agente.id, action: 'sysconfig_alterado', after: { chaves: gravadas }, ip: ipDe(req) });
  }
  res.json({ ok: true });
}));

sysconfigRouter.get('/:chave', asyncHandler(async (req, res) => {
  // Sem esta checagem a rota lia QUALQUER chave do sistema_kv — a allowlist
  // CHAVES_PUBLICAS governava só o PUT e o GET agregado, então bastava pedir
  // pelo nome para ler qualquer segredo gravado fora dela.
  if (!CHAVES_PUBLICAS.includes(req.params.chave)) {
    return res.status(404).json({ valor: null });
  }
  const db  = getDb();
  const row = await db('sistema_kv').where({ chave: req.params.chave }).first();
  if (!row) return res.json({ valor: null });
  let valor;
  try { valor = lerValorKV(row.valor, req.params.chave); }
  catch (err) { console.error('[sysconfig]', err.message); return res.json({ valor: null }); }
  // Mesma regra do GET agregado: credencial sai mascarada por esta rota também,
  // senão bastaria pedir pelo nome para contornar o mascaramento.
  res.json({ valor: ehSecreta(req.params.chave) && valor ? mascarar(valor) : valor });
}));

// ── ROTA DE TESTE DE TOOLS SGP ────────────────────────────────────────────
import { consultarClientes, segundaViaBoleto, promessaPagamento, criarChamado,
  verificarConexao, consultarManutencao, historicoOcorrencias, consultarRadius,
  statusRede, precadastrarCliente, listarVencimentos, listarPlanos } from '../services/integrations.js';

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
      case 'precadastrar_cliente':
        result = await precadastrarCliente(params); break;
      case 'listar_vencimentos':
        result = await listarVencimentos(); break;
      case 'listar_planos_ativos': {
        // Lê do banco local — mesmo que o executor da IA usa
        const db = getDb();
        let q = db('planos').where({ ativo: true });
        if (params.cidade) q = q.whereRaw('LOWER(cidade) LIKE ?', [`%${String(params.cidade).toLowerCase()}%`]);
        result = await q.orderBy([{ column: 'ordem', order: 'asc' }, { column: 'valor', order: 'asc' }]);
        break;
      }
      case 'listar_planos_sgp':
        // Lê direto do SGP (/api/ura/planos/) — traz os IDs REAIS p/ mapear em Configurações → Planos
        result = await listarPlanos(params.cidade || ''); break;
      case 'consultar_onu_acs': {
        // Lê sinal óptico + status direto do banco read-only do SGP (sgpDb.js).
        const row = await diagnosticoOnu(params.contrato);
        result = { row, mensagem_ia: formatarDiagnosticoOnu(row, new Date()) };
        break;
      }
      default:
        return res.status(400).json({ error: `Tool desconhecida: ${tool}` });
    }
    res.json({ ok: true, ms: Date.now() - t0, result });
  } catch (e) {
    res.json({ ok: false, ms: Date.now() - t0, error: e.message });
  }
}));
