/**
 * 016 — `inbox`, `outbox` e `jobs` (FASE 4, §125–133).
 *
 * Três tetos que a FASE 1 assumiu por escrito viram tabela aqui:
 *
 * 1. **Gatilho perdido.** O webhook persistia a mensagem e disparava o motor
 *    fire-and-forget. Processo morto no meio do turno = mensagem deduplicada
 *    por `external_id` e motor que nunca rodou para ela. O `inbox` guarda o
 *    PAYLOAD antes de qualquer processamento, e o worker retoma.
 * 2. **Estado durável, envio não.** O motor grava o estado num `finally` e só
 *    então envia. Morte entre as duas coisas deixa o banco dizendo "aguardando
 *    o menu" com o cliente sem ter visto o menu. O `outbox` é write-ahead:
 *    linha `pendente` → envio inline (mesma latência de hoje) → `enviada`.
 * 3. **`aguardar_tempo` mentia** (avançava na hora, logando "simulado").
 *    Agora para de verdade e agenda um `flow_resume` em `jobs`.
 *
 * ── Por que Postgres e não BullMQ (§127 permite "salvo justificativa melhor") ──
 * O Redis é OPCIONAL neste deploy — sem `REDIS_URL` o `sseManager` degrada em
 * silêncio. Um `flow_resume` é estado de conversa (§7.2: "Redis não deve ser a
 * única fonte da verdade para o estado de uma conversa"), e job que vive só no
 * Redis some sem ninguém ver. Inbox e outbox precisam do Postgres de qualquer
 * jeito.
 *
 * ── Por que `dedup_hash` e não `UNIQUE (canal, external_id)` ──
 * Não modela os canais: a Meta entrega N mensagens num único POST
 * (`value.messages[]`), `messages.update` da Evolution é um array sem id único
 * e `connection.update` não tem id nenhum — os dois violariam `NOT NULL`.
 * `sha256(canal:corpo_cru)` funciona para lote e para evento sem id, e a rota
 * não precisa conhecer o formato do canal. A dedup por `external_id` do
 * `mensagemRepository` CONTINUA: o hash impede reprocessar o *payload*, a outra
 * impede gravar a *mensagem*.
 *
 * `reivindicado_em` é lease, não enfeite: `FOR UPDATE SKIP LOCKED` protege
 * contra ticks sobrepostos, não contra SIGKILL — linha `processando` de worker
 * morto ficaria presa para sempre, que é o sintoma nº 1 de volta com outro nome.
 */

/** `createTableIfNotExists` é deprecado no knex e dispara índice/constraint
 *  incondicionalmente (ver a nota da 001/002). Este helper é replay-safe. */
async function criarTabela(db, nome, def) {
  if (await db.schema.hasTable(nome)) {
    console.log(`  ✓ Tabela ${nome} já existe`);
    return false;
  }
  await db.schema.createTable(nome, def);
  console.log(`  ✓ Tabela ${nome} criada`);
  return true;
}

export async function up(db) {
  await criarTabela(db, 'inbox', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('canal').notNullable();
    t.string('dedup_hash').notNullable().unique();  // sha256(canal:corpo_cru)
    t.jsonb('payload').notNullable();
    t.string('status').notNullable().defaultTo('pendente'); // pendente|processando|ok|falha
    t.integer('tentativas').notNullable().defaultTo(0);
    t.timestamp('reivindicado_em');                 // lease; NULL = livre
    t.timestamp('recebido_em').defaultTo(db.fn.now());
    t.timestamp('processado_em');
    t.text('ultimo_erro');
    t.index(['status', 'recebido_em']);
  });

  await criarTabela(db, 'outbox', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.uuid('conversa_id').references('id').inTable('conversas').onDelete('CASCADE');
    t.string('canal').notNullable();
    t.jsonb('payload').notNullable();               // { resp, destino }
    // pendente|enviada|falha|expirada|nao_suportada
    t.string('status').notNullable().defaultTo('pendente');
    t.integer('tentativas').notNullable().defaultTo(0);
    t.timestamp('proxima_tentativa_em').notNullable().defaultTo(db.fn.now());
    t.timestamp('expira_em').notNullable();
    t.string('external_id');                        // id devolvido pelo provedor (§126)
    t.timestamp('reivindicado_em');
    t.text('ultimo_erro');
    t.timestamp('criado_em').defaultTo(db.fn.now());
    t.index(['status', 'proxima_tentativa_em']);
    t.index(['conversa_id', 'criado_em']);          // ordem por conversa
  });

  await criarTabela(db, 'jobs', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('tipo').notNullable();                 // flow_resume | wait_timeout
    // `chave` = 'conversa:no'. Unique impede o segundo job quando o mesmo nó é
    // reentrado — sem ela, cliente que fala durante a espera agendaria outro.
    t.string('chave').unique();
    t.jsonb('payload').notNullable();
    t.timestamp('executar_em').notNullable();
    t.string('status').notNullable().defaultTo('pendente');
    t.integer('tentativas').notNullable().defaultTo(0);
    t.timestamp('reivindicado_em');
    t.text('ultimo_erro');
    t.timestamp('criado_em').defaultTo(db.fn.now());
    t.index(['status', 'executar_em']);
  });
}

export async function down(db) {
  // Seguro, ao contrário das 008/014: nada em produção depende destas tabelas
  // para INGERIR — o motor volta a enviar direto se elas sumirem. O que se
  // perde é o que ainda não foi entregue.
  await db.schema.dropTableIfExists('jobs');
  await db.schema.dropTableIfExists('outbox');
  await db.schema.dropTableIfExists('inbox');
}
