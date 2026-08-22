/**
 * 025_analytics.js — Conversation Events + Analytics (FASE 12).
 *
 * ⚠️ **NÃO existe event store aqui, e isso é a decisão da fase.**
 *
 * O §100 lista 24 eventos de conversa. Levantados um a um, **21 já têm casa** —
 * e casa TIPADA, com coluna real, enum normalizado e índice: `flow_executions`,
 * `ia_execucoes`, `playbook_execucoes`, `knowledge_uso`, `copiloto_eventos`,
 * `quality_auditorias`, `satisfacao`, e as próprias colunas de `conversas`.
 * Um `conversation_events (tipo, payload jsonb)` por cima disso criaria **duas
 * verdades para o mesmo fato**, nasceria vazio (todo número anterior à fase
 * seria zero) e trocaria enum indexado por `payload->>'motivo'`.
 *
 * As três lacunas reais não pedem store genérico, pedem armazenamento no lugar
 * certo — e é o que esta migration faz:
 *
 *  1. `conversas.encerrada_em` — não existia. `atualizado` é bombardeado por
 *     `incrementarNaoLidas`, e o `audit_log` só registra o encerramento HUMANO
 *     (o do nó `encerrar` do motor não passa por lá). Sem esta coluna não há
 *     tempo médio, janela de recontato nem resolução efetiva.
 *  2. `telemetria` — tool e LLM: latência, erro e TOKENS. Não cabia em
 *     `audit_log` (governança, guarda só tool de escrita e tem retenção longa)
 *     nem em `ia_execucoes` (só cobre o nó `ia_responde`; supervisora, copiloto
 *     e quality também gastam token, e o custo sairia subestimado).
 *  3. As duas VIEWS — que é onde a fase realmente mora.
 */
export async function up(db) {
  // ── 1. encerrada_em ─────────────────────────────────────────────
  if (!await db.schema.hasColumn('conversas', 'encerrada_em')) {
    await db.schema.alterTable('conversas', t => t.timestamp('encerrada_em'));
    // Backfill: a melhor estimativa disponível é a última mensagem. `atualizado`
    // puro inflaria a duração de toda conversa tocada DEPOIS de encerrada.
    // É aproximação para o histórico, e está dito na doc.
    await db.raw(`
      UPDATE conversas c SET encerrada_em = COALESCE(
        (SELECT MAX(m.criado_em) FROM mensagens m WHERE m.conversa_id = c.id),
        c.atualizado)
      WHERE c.status = 'encerrada' AND c.encerrada_em IS NULL
    `);
    console.log('  ✓ conversas.encerrada_em (com backfill)');
  }
  await db.raw(`CREATE INDEX IF NOT EXISTS idx_conv_encerrada_em
                ON conversas(encerrada_em) WHERE status = 'encerrada'`);

  // ── 2. telemetria ───────────────────────────────────────────────
  if (!await db.schema.hasTable('telemetria')) {
    await db.schema.createTable('telemetria', t => {
      t.bigIncrements('id').primary();
      t.string('tipo').notNullable();       // tool | llm
      t.string('nome').notNullable();       // nome da tool | id do modelo
      t.string('origem');                   // motor | supervisora | copiloto | cliente360 | quality
      t.uuid('conversa_id');
      t.uuid('agente_id');
      t.boolean('ok').defaultTo(true);
      t.string('erro');                     // normalizado: timeout | http_5xx | ...
      t.integer('ms');
      t.integer('tokens_in');
      t.integer('tokens_out');
      t.timestamp('criado_em').defaultTo(db.fn.now());
      t.index(['tipo', 'nome', 'criado_em']);
      t.index(['conversa_id']);
      t.index(['criado_em']);
    });
    console.log('  ✓ telemetria');
  }

  // ── 3. VIEWS ────────────────────────────────────────────────────
  // `DROP + CREATE`, não `CREATE OR REPLACE`: o segundo FALHA quando a lista de
  // colunas muda, e migration que falha no boot pula os monitores.
  await db.raw('DROP VIEW IF EXISTS conversa_fatos');
  await db.raw(`
    CREATE VIEW conversa_fatos AS
    SELECT
      c.id AS conversa_id, c.canal, c.fila_id, c.telefone, c.topico, c.agente_id,
      c.criado_em, c.encerrada_em, c.status,
      COALESCE(pb.dominio, c.topico) AS dominio,
      -- "Teve humano" é humano que FALOU. Não dá para usar 'agente_id IS NULL':
      -- 'conversaRepo.encerrar' zera esse campo, então TODA conversa encerrada
      -- pareceria 100% resolvida pela IA — que é o defeito que o dashboard tinha.
      EXISTS (SELECT 1 FROM mensagens m WHERE m.conversa_id = c.id AND m.origem = 'agente') AS teve_humano,
      EXISTS (SELECT 1 FROM ia_execucoes e WHERE e.conversa_id = c.id AND e.desfecho = 'transferido') AS foi_transferido,
      (SELECT e.desfecho FROM ia_execucoes e WHERE e.conversa_id = c.id ORDER BY e.criado_em DESC LIMIT 1) AS desfecho_ia,
      (SELECT e.motivo   FROM ia_execucoes e WHERE e.conversa_id = c.id ORDER BY e.criado_em DESC LIMIT 1) AS motivo_ia,
      EXTRACT(EPOCH FROM (c.assumido_em - c.aguardando_desde))::int AS espera_seg,
      EXTRACT(EPOCH FROM (c.primeira_msg_agente_em - c.assumido_em))::int AS resposta_hum_seg,
      EXTRACT(EPOCH FROM (c.encerrada_em - c.criado_em))::int AS duracao_seg,
      (SELECT COALESCE(q.final_score, q.ai_score) FROM quality_auditorias q WHERE q.conversa_id = c.id) AS quality_score,
      -- COALESCE no PARTITION: sem ele, TODA conversa sem telefone (widget) cai
      -- na mesma partição e vira recontato de todas as outras — a mesma
      -- armadilha do vazamento de histórico da FASE 6, agora em window function.
      LEAD(c.criado_em) OVER (PARTITION BY COALESCE(c.telefone, c.id::text) ORDER BY c.criado_em) AS proximo_contato_em
    FROM conversas c
    LEFT JOIN playbook_execucoes pe ON pe.conversa_id = c.id
    LEFT JOIN playbooks pb ON pb.id = pe.playbook_id
  `);
  console.log('  ✓ view conversa_fatos');

  await db.raw('DROP VIEW IF EXISTS nps_unificado');
  await db.raw(`
    CREATE VIEW nps_unificado AS
      SELECT 'satisfacao' AS origem, conversa_id, nota, COALESCE(escala, 10) AS escala, canal, criado_em
        FROM satisfacao
      UNION ALL
      SELECT 'avaliacoes' AS origem, conversa_id, nota, 5 AS escala, NULL AS canal, criado_em
        FROM avaliacoes
  `);
  console.log('  ✓ view nps_unificado');

  // ── 4. Config (§108) ────────────────────────────────────────────
  // Custos nascem ZERO e a API rotula `configurado: false`. Zero honesto é
  // melhor que número inventado num indicador de diretoria.
  await db('sistema_kv').insert({
    chave: 'analytics_config',
    valor: JSON.stringify({
      janela_recontato_h: 24,
      custo_visita: 0, custo_chamado: 0, custo_atendimento_humano: 0,
      precos_llm: { 'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0 } },
    }),
  }).onConflict('chave').ignore();
}

export async function down(db) {
  // ⚠️ As views referenciam conversas/mensagens/ia_execucoes/quality_auditorias.
  // Enquanto existirem, o `down()` das migrations 014/017/023 falha — mais um
  // motivo para nunca rodar down em produção.
  await db.raw('DROP VIEW IF EXISTS conversa_fatos');
  await db.raw('DROP VIEW IF EXISTS nps_unificado');
  await db.schema.dropTableIfExists('telemetria');
  await db.raw('DROP INDEX IF EXISTS idx_conv_encerrada_em');
  if (await db.schema.hasColumn('conversas', 'encerrada_em')) {
    await db.schema.alterTable('conversas', t => t.dropColumn('encerrada_em'));
  }
}
