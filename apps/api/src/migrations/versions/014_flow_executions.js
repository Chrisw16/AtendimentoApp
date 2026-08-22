/**
 * 014 — `flow_executions`: o estado do motor sai da memória e vai para o banco.
 *
 * Até aqui o motor guardava a posição da conversa num `Map` de processo
 * (`estadosExecucao`, motorFluxo.js). Qualquer restart/deploy jogava toda
 * conversa em andamento de volta ao nó de início, em silêncio.
 *
 * Uma linha por conversa VIVA — a linha é apagada quando a execução termina.
 * Por isso o grafo do fluxo cabe dentro do próprio blob (`estado._grafo`): N é
 * o número de conversas em andamento (dezenas), não o histórico inteiro.
 *
 * Não há coluna `status`, `revisao` nem `no_atual`: a linha some ao concluir
 * (status seriam campos que nunca existem em disco), `filaPorChave` já serializa
 * por conversa dentro do processo, e `estado->>'noAtual'` inspeciona o nó atual
 * sem DDL nenhuma.
 *
 * ── Segunda parte: a unique parcial em conversas(telefone, canal) ──
 *
 * Os 3 webhooks (Evolution/Telegram/Meta) fazem check-then-act: `porTelefoneCanal`
 * e, se não achar, `criar`. Duas mensagens simultâneas de um número novo passam
 * as duas pela checagem → nascem DUAS conversas para o mesmo cliente, cada uma
 * com sua execução de fluxo. O banco passa a ser a autoridade.
 *
 * Parcial (`WHERE status <> 'encerrada'`) de propósito: o histórico precisa
 * guardar N conversas encerradas do mesmo número.
 *
 * ── Terceira parte: `protocolo_seq` ──
 *
 * O protocolo era `COUNT(*) do dia + 1` com unique em `conversas.protocolo`:
 * inserts simultâneos calculam o MESMO número e o segundo estoura. Retry na
 * aplicação não resolve — com 8 chamadas concorrentes todas recontam ao mesmo
 * tempo e continuam colidindo (medido: falha na 5ª tentativa).
 *
 * O contador vira uma linha por dia, incrementada por UM statement atômico:
 * `INSERT ... ON CONFLICT (dia) DO UPDATE SET n = n + 1 RETURNING n` pega lock
 * de linha, então N chamadas concorrentes recebem N números distintos. Sem
 * retry, sem laço, sem corrida.
 */
export async function up(db) {
  const jaTem = await db.schema.hasTable('flow_executions');
  if (jaTem) {
    console.log('  ✓ Tabela flow_executions já existe');
  } else {
    await db.schema.createTable('flow_executions', t => {
      t.uuid('conversa_id').primary().references('id').inTable('conversas').onDelete('CASCADE');
      t.jsonb('estado').notNullable();
      t.timestamp('atualizado_em').defaultTo(db.fn.now());
    });
    console.log('  ✓ Tabela flow_executions criada');
  }

  // Duplicatas vivas do mesmo (telefone, canal) impediriam a unique de subir.
  // Mantém a mais recente — é a que tem o contexto atual do cliente.
  const dup = await db.raw(`
    SELECT COUNT(*)::int AS n FROM (
      SELECT telefone, canal FROM conversas
      WHERE status <> 'encerrada' AND telefone IS NOT NULL
      GROUP BY telefone, canal HAVING COUNT(*) > 1
    ) g
  `);
  const grupos = dup?.rows?.[0]?.n ?? 0;
  if (grupos > 0) {
    console.log(`  ⚠️  ${grupos} par(es) (telefone, canal) com conversa viva duplicada — encerrando as mais antigas`);
    const upd = await db.raw(`
      UPDATE conversas c SET status = 'encerrada'
      FROM conversas mais_nova
      WHERE c.status <> 'encerrada' AND mais_nova.status <> 'encerrada'
        AND c.telefone IS NOT NULL
        AND c.telefone = mais_nova.telefone AND c.canal = mais_nova.canal
        AND (c.criado_em < mais_nova.criado_em
             OR (c.criado_em = mais_nova.criado_em AND c.id < mais_nova.id))
    `);
    console.log(`  ✓ ${upd?.rowCount ?? 0} conversa(s) duplicada(s) encerrada(s)`);
  } else {
    console.log('  ✓ Nenhuma conversa viva duplicada');
  }

  const temSeq = await db.schema.hasTable('protocolo_seq');
  if (temSeq) {
    console.log('  ✓ Tabela protocolo_seq já existe');
  } else {
    await db.schema.createTable('protocolo_seq', t => {
      t.date('dia').primary();
      t.integer('n').notNullable().defaultTo(0);
    });
    // Semeia o dia de hoje com o MAIOR sufixo já gravado — não com `COUNT(*)`.
    // Uma conversa apagada, uma criada sem protocolo, ou o skew entre a data
    // local do Node (que gerava o prefixo) e o `CURRENT_DATE` do Postgres (que
    // fazia a contagem) já bastam para o contador nascer ATRÁS do que existe.
    // O primeiro `criar()` pós-deploy bateria na unique de `conversas.protocolo`
    // e a primeira mensagem do cliente se perderia num 500.
    const dia = `to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYYMMDD')`;
    await db.raw(`
      INSERT INTO protocolo_seq (dia, n)
      SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
             COALESCE(MAX(NULLIF(split_part(protocolo, '-', 2), '')::int), 0)
      FROM conversas
      WHERE protocolo LIKE ${dia} || '-%'
        AND split_part(protocolo, '-', 2) ~ '^[0-9]+$'
      ON CONFLICT (dia) DO NOTHING
    `);
    console.log('  ✓ Tabela protocolo_seq criada e semeada com o dia corrente');
  }

  await db.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS conversas_viva_telefone_canal_unique
    ON conversas (telefone, canal)
    WHERE status <> 'encerrada' AND telefone IS NOT NULL
  `);
  console.log('  ✓ Unique parcial em conversas(telefone, canal) para conversas vivas');
}

export async function down(db) {
  // ⚠️ Igual à 008: `conversaRepo.obterOuCriar` usa `onConflict` sobre esta
  // unique. Sem ela, o Postgres recusa o insert INTEIRO, não só o duplicado —
  // derrubar este índice em produção para a criação de conversas.
  // ⚠️ `protocolo_seq` é igualmente fatal: sem ela `_gerarProtocolo` estoura
  // 42P01 em TODA conversa nova. As duas linhas abaixo param a ingestão.
  await db.raw('DROP INDEX IF EXISTS conversas_viva_telefone_canal_unique');
  await db.schema.dropTableIfExists('protocolo_seq');
  await db.schema.dropTableIfExists('flow_executions');
}
