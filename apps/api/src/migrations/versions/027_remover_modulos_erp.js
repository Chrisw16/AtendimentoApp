/**
 * 027_remover_modulos_erp.js — GoCHAT é atendimento, não ERP.
 *
 * Ocorrências, Ordens de Serviço e Monitor de Rede eram um ERP em miniatura
 * mantido ao lado do SGP: o mesmo chamado existia nas duas bases e nada as
 * conciliava. O ERP desta operação é o SGP — a IA já abre chamado lá
 * (`criar_chamado` → `/api/ura/chamado/`) e lê histórico de lá
 * (`historico_ocorrencias`). Nenhuma tool, nenhum nó do motor e nenhum
 * catálogo do editor tocava estas quatro tabelas; a remoção não muda uma
 * linha do que a IA sabe fazer.
 *
 * NENHUMA FK aponta para elas — as que existem são de saída
 * (`ocorrencias.agente_id → agentes`, `ordens_servico.conversa_id →
 * conversas`), então a ordem do drop é indiferente e nem `agentes` nem
 * `conversas` são tocadas.
 *
 * `notas` (001) NÃO sai: é a tabela das notas internas da conversa, usada por
 * `routes/chat.js`. Só a rota `POST /ocorrencias/:id/notas` a citava — e ela
 * sempre falhou, porque inseria `conversa_id: null` numa coluna notNullable.
 *
 * `zonas_cobertura`/`consultas_cobertura` também NÃO saem, apesar de nascerem
 * na mesma 002: Cobertura continua no produto.
 *
 * O `down()` recria a ESTRUTURA, não os dados — drop é irreversível quanto ao
 * conteúdo. Por isso o `up` conta as linhas antes: se houver dado, o número
 * fica no log do deploy em vez de sumir sem registro.
 */
const TABELAS = ['ocorrencias', 'ordens_servico', 'equipamentos_rede', 'alertas_rede'];

export async function up(db) {
  for (const t of TABELAS) {
    if (!(await db.schema.hasTable(t))) continue;
    const [{ count }] = await db(t).count('* as count');
    if (Number(count) > 0) {
      console.log(`  ⚠️  ${t}: ${count} linha(s) descartada(s) com a tabela`);
    }
    await db.schema.dropTableIfExists(t);
    console.log(`  ✓ drop ${t}`);
  }
}

export async function down(db) {
  // Só a ESTRUTURA volta — o conteúdo foi embora com o drop. Ela existe para
  // que um rollback de código para uma versão que ainda tenha as rotas não
  // encontre `42P01` a cada request. Cópia fiel das migrations 001/002:
  // schema divergente num rollback é pior que rollback nenhum.
  const criar = async (nome, fn) => {
    if (await db.schema.hasTable(nome)) return;
    await db.schema.createTable(nome, fn);
  };

  await criar('ocorrencias', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('titulo').notNullable();
    t.text('descricao');
    t.string('tipo');
    t.string('status').defaultTo('aberta');
    t.string('prioridade').defaultTo('normal');
    t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
    t.uuid('conversa_id').references('id').inTable('conversas').onDelete('SET NULL');
    t.string('contrato_id');
    t.timestamp('criado_em').defaultTo(db.fn.now());
    t.timestamp('atualizado').defaultTo(db.fn.now());
    t.jsonb('meta').defaultTo('{}');
    t.index(['status']);
    t.index(['tipo']);
  });

  await criar('ordens_servico', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('numero').unique();
    t.string('titulo').notNullable();
    t.text('descricao');
    t.string('tipo');
    t.string('status').defaultTo('aberta');
    t.string('prioridade').defaultTo('normal');
    t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
    t.uuid('conversa_id').references('id').inTable('conversas').onDelete('SET NULL');
    t.string('contrato_id');
    t.string('endereco');
    t.decimal('latitude',  10, 8);
    t.decimal('longitude', 11, 8);
    t.timestamp('agendado_para');
    t.timestamp('iniciado_em');
    t.timestamp('concluido_em');
    t.timestamp('criado_em').defaultTo(db.fn.now());
    t.timestamp('atualizado').defaultTo(db.fn.now());
    t.jsonb('meta').defaultTo('{}');
    t.index(['status']);
    t.index(['agendado_para']);
    t.index(['agente_id']);
  });

  await criar('equipamentos_rede', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('nome');
    t.string('ip').notNullable().unique();
    t.string('tipo').defaultTo('generico');
    t.string('localizacao');
    t.string('status').defaultTo('unknown');
    t.integer('latencia_ms');
    t.timestamp('ultima_verificacao');
    t.jsonb('meta').defaultTo('{}');
    t.index(['status']);
    t.index(['tipo']);
  });

  await criar('alertas_rede', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('equipamento');
    t.string('tipo').defaultTo('warning');
    t.text('mensagem').notNullable();
    t.boolean('resolvido').defaultTo(false);
    t.timestamp('criado_em').defaultTo(db.fn.now());
    t.index(['criado_em']);
    t.index(['resolvido']);
  });
}
