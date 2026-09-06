/**
 * 029_catalogos_financeiro.js — o time financeiro entra no ar.
 *
 * Até aqui o produto tinha agente de **suporte** e de **comercial**: perfil,
 * procedimento e scorecard para cada um. O financeiro tinha fila (FASE 5),
 * categoria de conhecimento (FASE 7) e prompt (migration 005) — e mais nada.
 * Um nó `ia_responde` apontado para `financeiro` rodava sem procedimento, com
 * o limite de turnos genérico e sem auditoria possível.
 *
 * ⚠️ Semeia SÓ o que é novo, e não `semearCatalogos()` inteiro: aquele guard é
 * existência, não histórico, e um catálogo que o operador apagou de propósito
 * desde a 022 seria ressuscitado pelo deploy.
 *
 * ⚠️ O playbook nasce em **rascunho** (§60/§62) e `playbook.carregar()` só lê
 * `publicado`. Publicar é decisão de quem opera — dois cliques na tela de
 * Playbooks —, não do deploy. Sem isso o perfil financeiro roda sem
 * procedimento, exatamente como suporte e comercial ficaram até alguém
 * publicá-los.
 */
import { semearFinanceiro } from '../../dadosIniciais.js';

// O prompt `roteador` nunca foi lido por linha nenhuma de código:
// `processarIARoteador` montava o system prompt inline. O que estava gravado
// ali era um CLASSIFICADOR — o seed pedia uma palavra, a versão editada em
// produção pede um JSON — e como base de um agente que precisa conversar
// produziria uma recepção respondendo `{"agente":"suporte"}` ao cliente.
const PROMPT_RECEPCAO = `Você é a Natália, da NetGo Internet (fibra em Natal/RN). Você é a primeira pessoa com quem o cliente fala.
[REGRAS]
[ESTILO]

SEU TRABALHO
Receber bem, entender o que a pessoa precisa e encaminhar para quem resolve. Você não resolve o problema — você descobre qual é e entrega o atendimento pronto para o time certo.

COMO CONDUZIR
1. Cumprimente e pergunte em que pode ajudar, se o cliente ainda não disse.
2. Se a mensagem já deixa claro o assunto, NÃO faça perguntas de confirmação — encaminhe.
3. Se estiver em dúvida entre dois destinos, faça UMA pergunta curta e objetiva. Nunca duas seguidas.
4. Se o cliente informar CPF ou CNPJ, use identificar_cliente antes de encaminhar: o time que receber já começa sabendo de quem se trata.
5. Quando souber o destino, chame direcionar_atendimento. Não anuncie categorias nem nomes de setor internos — diga, em uma frase, que já vai ajudar com aquilo.

O QUE NÃO FAZER
- Não diagnostique problema técnico, não informe valor devido e não prometa prazo: isso é do time de destino.
- Não peça CPF sem motivo. Se a pessoa só quer saber de plano ou horário, ela não precisa se identificar.
- Não repita a saudação a cada mensagem.
- Nunca responda em JSON nem com uma palavra solta: você está falando com uma pessoa.`;

/**
 * Troca uma palavra dentro do prompt, preservando o resto do que o operador
 * escreveu. Aqui não se reescreve o prompt: só se corrige uma REFERÊNCIA
 * quebrada dentro dele.
 */
async function corrigirReferencia(db, slug, de, para) {
  const row = await db('prompts_ia').where({ slug }).first();
  if (!row || !String(row.conteudo || '').includes(de)) return 'nada_a_fazer';
  await db('prompts_ia').where({ slug }).update({
    conteudo: String(row.conteudo).replaceAll(de, para),
    padrao:   String(row.padrao || '').replaceAll(de, para),
  });
  return 'corrigido';
}

export async function up(db) {
  const n = await semearFinanceiro(db);
  console.log(`  ✓ Financeiro: ${n.playbooks} playbook, ${n.perfis} perfil, ${n.scorecards} scorecard (0 = já existia)`);

  // ── A etapa 1 do playbook de suporte nomeava um NÓ, não uma tool ──
  //
  // Declarava `tools: ["consultar_cliente"]`, que é tipo de nó do fluxo e nunca
  // foi nome de tool. Como a etapa é dada por cumprida pela tool que a
  // EVIDENCIA (FASE 8), essa etapa nunca podia ser marcada: o procedimento de
  // suporte ficava travado na etapa 1 para sempre. A 022 já semeou essa linha
  // em produção, e `semearCatalogos` pula playbook cujo slug já existe — então
  // editar `dadosIniciais.js` não corrige quem já está no ar.
  //
  // O `where` é exato: se o operador editou a lista, o valor difere e nada acontece.
  if (await db.schema.hasTable('playbook_etapas')) {
    const corrigidas = await db('playbook_etapas')
      .whereRaw('tools::jsonb = ?::jsonb', [JSON.stringify(['consultar_cliente'])])
      .update({ tools: JSON.stringify(['identificar_cliente']) });
    if (corrigidas) console.log(`  ✓ ${corrigidas} etapa(s) de playbook: nó 'consultar_cliente' → tool 'identificar_cliente'`);
  }

  if (await db.schema.hasTable('prompts_ia')) {
    // ── `roteador`: o slug muda de significado, e por isso é SUBSTITUÍDO ──
    //
    // Ele nunca foi lido por linha nenhuma de código: `processarIARoteador`
    // montava o system prompt inline. O que estava gravado ali era um
    // classificador (o seed pedia UMA PALAVRA; a versão editada em produção
    // pede um JSON) — texto que, como base de um agente que precisa conversar,
    // produziria uma recepção respondendo `{"agente":"suporte"}` ao cliente.
    //
    // Substituir prompt editado contraria a regra da casa, e a exceção está
    // declarada: não há trabalho do operador em efeito para preservar, porque
    // o campo nunca chegou a rodar. O conteúdo anterior está transcrito no
    // registro desta entrega, em brain/work/tasks/, para não se perder.
    const antes = await db('prompts_ia').where({ slug: 'roteador' }).first();
    if (antes) {
      await db('prompts_ia').where({ slug: 'roteador' })
        .update({ conteudo: PROMPT_RECEPCAO, padrao: PROMPT_RECEPCAO });
      console.log('  ✓ prompt roteador: substituído (era classificador; o slug passa a ser LIDO pelo motor)');
    }

    // ── `financeiro`: correção CIRÚRGICA, o prompt do operador fica ──
    //
    // Ele manda "Chame consultar_clientes" — tool que nunca existiu com esse
    // nome (`consultar_cliente` é tipo de NÓ). Agora existe `identificar_cliente`.
    // Trocar o nome não é reescrever o prompt: é consertar uma referência
    // quebrada dentro do que o operador escreveu.
    for (const slug of ['financeiro', 'suporte', 'comercial', 'outros', 'faq']) {
      const r = await corrigirReferencia(db, slug, 'consultar_clientes', 'identificar_cliente');
      if (r === 'corrigido') console.log(`  ✓ prompt ${slug}: consultar_clientes → identificar_cliente`);
    }
  }
}

export async function down() {
  // Sem `down`, pelo mesmo motivo da 022: apagar fila, perfil ou playbook
  // derrubaria configuração de fluxo em uso — `cfg.fila`, `cfg.perfil` e
  // `cfg.playbook` guardam o SLUG, não o id.
}
