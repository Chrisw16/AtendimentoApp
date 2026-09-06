/**
 * 031_ia_provedor_global.js — provedor e modelo de IA passam a ser escolhidos
 * em Configurações; os prompts HERDAM por padrão.
 *
 * O furo que esta migration fecha: a 005 gravou `provedor='anthropic'` e
 * `modelo='claude-haiku-4-5-20251001'` em TODAS as linhas de `prompts_ia` — e
 * pôs esses valores como DEFAULT das colunas. Não porque o operador escolheu:
 * porque o seed precisava de um valor. Com a precedência prompt → global →
 * padrão, cada uma dessas linhas pareceria um override, e a configuração
 * global de Configurações nunca seria alcançada — a tela seria decorativa, a
 * família do `agentes.permissoes` que nunca decidiu nada.
 *
 * Então: o par gravado pelo seed vira NULL ("herda"), e o default das colunas
 * sai. Valor = escolha do operador; NULL = herança. Sem caso especial.
 *
 * ⚠️ O `where` é EXATO no par do seed. Uma linha em que o operador tenha
 * escolhido outro modelo (ou outro provedor) continua como ele deixou. Medido
 * em produção em 2026-09-05: as 8 linhas estavam no par do seed.
 */
import { CATALOGO, PRECOS_REFERENCIA } from '../../services/llm/llmHelpers.js';

export async function up(db) {
  await semearPrecos(db);
  if (!await db.schema.hasTable('prompts_ia')) return;

  // Evidência no log do deploy: o que havia ANTES. Se alguma linha estivesse em
  // `openai` com chave vazia, o deploy passaria a chamar a OpenAI e toda
  // conversa daquele slug cairia para humano — o log é o que permite ver isso.
  const antes = await db('prompts_ia').select('slug', 'provedor', 'modelo', 'temperatura').orderBy('slug');
  console.log('  ℹ prompts_ia antes: ' + antes.map(p => `${p.slug}=${p.provedor || '∅'}/${p.modelo || '∅'}@${p.temperatura ?? '∅'}`).join(' '));

  const anulados = await db('prompts_ia')
    .where({ provedor: 'anthropic', modelo: 'claude-haiku-4-5-20251001' })
    .update({ provedor: null, modelo: null });
  console.log(`  ✓ ${anulados} prompt(s) passaram a HERDAR provedor/modelo do global`);

  // Sem default: linha nova nasce herdando. `alter()` do knex reescreve a coluna
  // preservando o tipo; idempotente porque o resultado é o mesmo em toda rodada.
  await db.schema.alterTable('prompts_ia', t => {
    t.string('provedor').nullable().defaultTo(null).alter();
    t.string('modelo').nullable().defaultTo(null).alter();
  });

  // O `roteador` estava em 0.10 porque era um classificador de uma palavra. O
  // slug virou o agente de RECEPÇÃO (2026-09-05), que precisa conversar — 0.1 é
  // rígido demais. Só se ainda estiver no valor antigo: se o operador já mexeu,
  // fica como ele deixou.
  const temp = await db('prompts_ia').where({ slug: 'roteador' }).whereRaw('temperatura = 0.10').update({ temperatura: 0.40 });
  if (temp) console.log('  ✓ roteador: temperatura 0.10 → 0.40 (classificador virou recepção)');
}

/**
 * Preços dos modelos do catálogo em `analytics_config.precos_llm` (USD por
 * milhão de tokens). Sem preço, o Analytics devolve custo `null` — que é
 * honesto, mas no dia em que o operador trocar de modelo o `custo_por_resolvido`
 * some e parece quebrado.
 *
 * SÓ acrescenta chaves ausentes: o que o operador ajustou fica. E grava a DATA
 * de referência, porque preço de LLM tem prazo (Gemini 3.x dobra em 01/01/2027;
 * DeepSeek varia 2x por horário) — número sem data parece verdade eterna.
 */
async function semearPrecos(db) {
  if (!await db.schema.hasTable('sistema_kv')) return;
  const { lerValorKV } = await import('../../services/kvSeguro.js');
  const linha = await db('sistema_kv').where({ chave: 'analytics_config' }).first();
  let cfg = {};
  try { cfg = (linha && lerValorKV(linha.valor, 'analytics_config')) || {}; } catch { cfg = {}; }
  if (typeof cfg !== 'object' || Array.isArray(cfg)) cfg = {};

  const precos = { ...(cfg.precos_llm || {}) };
  let novos = 0;
  for (const lista of Object.values(CATALOGO)) {
    for (const m of lista) {
      if (precos[m.id]) continue;
      precos[m.id] = { in: m.preco.in, out: m.preco.out };
      novos++;
    }
  }
  const valor = { ...cfg, precos_llm: precos, precos_llm_referencia: cfg.precos_llm_referencia || PRECOS_REFERENCIA };
  await db('sistema_kv')
    .insert({ chave: 'analytics_config', valor: JSON.stringify(valor) })
    .onConflict('chave').merge(['valor', 'atualizado']);
  console.log(`  ✓ precos_llm: ${novos} modelo(s) novo(s) com preço (referência ${valor.precos_llm_referencia})`);
}

export async function down(db) {
  // Volta os defaults; não devolve valores às linhas (NULL = herança é a
  // semântica nova e é segura para o código antigo, que faz `|| padrão`).
  if (!await db.schema.hasTable('prompts_ia')) return;
  await db.schema.alterTable('prompts_ia', t => {
    t.string('provedor').defaultTo('anthropic').alter();
    t.string('modelo').defaultTo('claude-haiku-4-5-20251001').alter();
  });
}
