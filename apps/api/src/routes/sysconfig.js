import { Router } from 'express';
import { invalidateConfigCache } from '../services/integrations.js';
import { invalidateSgpDbPool, diagnosticoOnu } from '../services/sgpDb.js';
import { formatarDiagnosticoOnu } from '../services/sgpHelpers.js';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { auditar, ipDe } from '../services/auditoria.js';
import { lerValorKV, mascararConfig, mascarar, ehSecreta, valorParaGravar } from '../services/kvSeguro.js';
import { getDb } from '../config/db.js';

export const sysconfigRouter = Router();
sysconfigRouter.use(authMiddleware, adminMiddleware);

const CHAVES_PUBLICAS = [
  'prompt_ia', 'saudacao', 'horario', 'mensagem_fora_hora',
  'modo', 'horario_ativo', 'notificacoes',
  'anthropic_api_key', 'openai_api_key', 'sgp_url', 'sgp_token', 'sgp_app',
  // Provedor e modelo GLOBAIS de IA + as chaves dos provedores novos.
  'ia_provedor', 'ia_modelo',
  'deepseek_api_key', 'gemini_api_key', 'groq_api_key', 'openrouter_api_key',
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

  // Escolher um provedor cuja chave não existe derrubaria 100% do atendimento
  // com um clique: todo turno de IA lançaria "chave não configurada", o cliente
  // leria "ocorreu um erro" e cairia na fila humana. "Falha honesta" é para
  // provedor fora do ar, não para uma tela de configuração. A chave pode vir no
  // MESMO corpo (valor real, não máscara) ou já estar no banco.
  const provedorNovo = String(req.body.ia_provedor || '').trim();
  if (provedorNovo) {
    const { PROVEDORES } = await import('../services/llm/index.js');
    const def = PROVEDORES[provedorNovo];
    if (!def) throw new HttpError(400, `Provedor de IA desconhecido: "${provedorNovo}".`);
    const noCorpo = String(req.body[def.chave] || '');
    const temNoCorpo = noCorpo && !noCorpo.includes('•');
    const noBanco = temNoCorpo ? null : await db('sistema_kv').where({ chave: def.chave }).first();
    if (!temNoCorpo && !noBanco?.valor) {
      throw new HttpError(400, `Para usar ${def.nome} é preciso salvar a chave de API dele junto ou antes.`);
    }
    if (!String(req.body.ia_modelo || '').trim()) {
      throw new HttpError(400, `Escolha também o modelo de ${def.nome}.`);
    }
  }
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

// ── CATÁLOGO DE PROVEDORES E MODELOS ──────────────────────────────────────
// Uma fonte só: a tela lê daqui em vez de ter a própria lista (a de Prompts IA
// tinha `gpt-4o-mini` hardcoded — modelo que já saiu de linha). Junto vai o
// que está valendo hoje (global resolvido), para a tela mostrar "herdando de".
sysconfigRouter.get('/ia/catalogo', asyncHandler(async (req, res) => {
  const { PROVEDORES, CATALOGO, PRECOS_REFERENCIA, resolver } = await import('../services/llm/index.js');
  const provedores = Object.entries(PROVEDORES).map(([id, p]) => ({ id, nome: p.nome, chave: p.chave }));
  res.json({ provedores, catalogo: CATALOGO, precos_referencia: PRECOS_REFERENCIA, global: await resolver({}) });
}));

// ── TESTE DE PROVEDOR DE IA ───────────────────────────────────────────────
//
// Uma chamada mínima ao provedor/modelo escolhidos, com a chave que está NO
// BANCO (não a do formulário — o que se testa é o que vai rodar). Sem isto o
// operador só descobre chave errada ou modelo inexistente quando um cliente
// escreve e a IA responde "ocorreu um erro". O erro volta normalizado pelo
// `llm/index.js`, então a tela diz "credencial inválida" e não um stack do SDK.
sysconfigRouter.post('/ia/testar', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { provedor = null, modelo = null } = req.body || {};
  const { gerar, resolver } = await import('../services/llm/index.js');
  const escolha = await resolver({ provedor, modelo });
  const t0 = Date.now();
  // Só os NOMES no audit: nunca a chave, nunca a resposta.
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'ia_provedor_testado',
            after: { provedor: escolha.provedor, modelo: escolha.modelo }, ip: ipDe(req) });
  try {
    const r = await gerar(
      { system: 'Responda apenas: ok', messages: [{ role: 'user', content: 'teste' }],
        provedor: escolha.provedor, modelo: escolha.modelo, temperatura: 0, maxTokens: 8 },
      { origem: 'teste_config', sandbox: true },   // teste não é custo de atendimento
    );
    const texto = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('').slice(0, 60);
    res.json({ ok: true, ...escolha, ms: Date.now() - t0, resposta: texto, tokens: r.usage || null });
  } catch (err) {
    res.status(200).json({ ok: false, ...escolha, ms: Date.now() - t0, erro: err.message, status: err.status ?? null });
  }
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
