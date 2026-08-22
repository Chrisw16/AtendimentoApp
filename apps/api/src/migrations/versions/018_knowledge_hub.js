/**
 * 018_knowledge_hub.js — Knowledge Hub (FASE 7).
 *
 * ⚠️ DESVIO DELIBERADO DO PLANO, com a licença que ele mesmo deu ("PostgreSQL
 * + pgvector, salvo melhor justificativa técnica após inspeção", §54).
 *
 * A inspeção derrubou o pgvector:
 *  1. **A extensão não existe** neste Postgres (`pg_available_extensions` não
 *     lista `vector`). Instalá-la significa TROCAR A IMAGEM do Postgres de
 *     produção — mudança de infra num banco que já atende, e que não dá para
 *     verificar daqui;
 *  2. **Não há de onde tirar embedding.** A Anthropic não oferece embeddings, e
 *     `openai_api_key` é uma chave de configuração que **nenhuma linha do
 *     código lê** — seria uma integração nova inteira, com custo por chamada e
 *     latência no caminho da resposta;
 *  3. **O corpus não pede.** Base de conhecimento de um provedor tem dezenas a
 *     poucas centenas de artigos. Full-text nativo em português com
 *     `websearch_to_tsquery` + trigrama resolve isso sem dependência externa,
 *     sem custo e sem chave.
 *
 * O caminho para embeddings continua aberto e barato: a recuperação inteira
 * mora atrás de `knowledge.buscar()`. Quando houver pgvector, acrescenta-se a
 * coluna e o ranqueamento passa a ser híbrido — nenhum chamador muda.
 *
 * A coluna `busca` é GERADA (`GENERATED ALWAYS AS ... STORED`): não há trigger
 * para esquecer de disparar, e artigo editado nunca fica com índice velho.
 *
 * Acento: o dicionário português NÃO os remove — `conexão` vira `conexã` e
 * `conexao` vira `conexa`, então quem digita sem acento (metade dos clientes)
 * não acharia nada. A saída é `knowledge_norm()`, uma função **IMMUTABLE**
 * criada aqui: coluna gerada só aceita função imutável, e `unaccent` não é.
 * A MESMA função normaliza a consulta em `knowledge.buscar()` — a simetria
 * entre índice e query passa a ser por construção, não por disciplina.
 *
 * Se a extensão `unaccent` não existir, a função degrada para `lower()`: a
 * busca fica sensível a acento, mas o boot não quebra. Marcar o corpo como
 * IMMUTABLE é legítimo enquanto o dicionário não muda — trocá-lo exige
 * reconstruir a coluna gerada.
 */
export async function up(db) {
  await db.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm').catch(e =>
    console.warn('  ⚠ pg_trgm indisponível — a similaridade de título fica desligada:', e.message));

  const temUnaccent = await db.raw('CREATE EXTENSION IF NOT EXISTS unaccent')
    .then(() => true)
    .catch(e => { console.warn('  ⚠ unaccent indisponível — busca sensível a acento:', e.message); return false; });

  // O hífen é o segundo problema, depois do acento: `Wi-Fi` vira os lexemas
  // `wi-f`/`wi`/`fi` e `wifi` vira `wif` — nunca casam. Como "wifi" é a
  // palavra mais comum do suporte de um provedor, isso sozinho esvaziaria a
  // busca. A saída é indexar as DUAS formas: o texto original e o mesmo texto
  // sem hífen, concatenados. Assim `wi-fi` e `wifi` encontram um ao outro sem
  // que nenhum dos dois deixe de existir no índice.
  await db.raw(`
    CREATE OR REPLACE FUNCTION knowledge_norm(t text) RETURNS text AS $$
      SELECT lower(${temUnaccent ? "unaccent('unaccent', coalesce(t, ''))" : "coalesce(t, '')"})
          || CASE WHEN coalesce(t, '') LIKE '%-%'
                  THEN ' ' || lower(${temUnaccent ? "unaccent('unaccent', replace(coalesce(t, ''), '-', ''))" : "replace(coalesce(t, ''), '-', '')"})
                  ELSE '' END
    $$ LANGUAGE sql IMMUTABLE
  `);
  console.log(`  ✓ knowledge_norm() ${temUnaccent ? 'com unaccent' : 'SEM unaccent (degradado)'}`);

  if (!await db.schema.hasTable('knowledge_categorias')) {
    await db.schema.createTable('knowledge_categorias', t => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.string('nome').notNullable();
      t.string('slug').notNullable().unique();
      t.text('descricao');
      t.integer('ordem').defaultTo(0);
      t.timestamp('criado_em').defaultTo(db.fn.now());
    });
    console.log('  ✓ knowledge_categorias');
  }

  if (!await db.schema.hasTable('knowledge_artigos')) {
    await db.schema.createTable('knowledge_artigos', t => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.string('titulo').notNullable();
      t.string('slug').notNullable().unique();
      t.string('tipo').defaultTo('artigo');       // artigo|faq|manual|politica|argumentacao|documento|procedimento
      t.uuid('categoria_id').references('id').inTable('knowledge_categorias').onDelete('SET NULL');
      t.text('resumo');
      t.text('conteudo').notNullable();
      t.string('status').defaultTo('rascunho');   // rascunho|revisao|publicado|arquivado
      t.integer('versao').defaultTo(1);
      // assunto, equipamento, produto, equipe, fonte, responsavel (§51) — jsonb
      // porque cada instância revendida terá metadados próprios e criar coluna
      // por campo obrigaria migration a cada provedor novo.
      t.jsonb('metadados').defaultTo('{}');
      t.date('valido_ate');                       // §51 validade/revisão
      t.uuid('criado_por').references('id').inTable('agentes').onDelete('SET NULL');
      t.uuid('publicado_por').references('id').inTable('agentes').onDelete('SET NULL');
      t.timestamp('publicado_em');
      t.timestamp('criado_em').defaultTo(db.fn.now());
      t.timestamp('atualizado').defaultTo(db.fn.now());
      t.index(['status']);
      t.index(['tipo']);
    });
    console.log('  ✓ knowledge_artigos');
  }

  // Coluna gerada + índice GIN: é o motor da busca.
  if (!await db.schema.hasColumn('knowledge_artigos', 'busca')) {
    await db.raw(`
      ALTER TABLE knowledge_artigos ADD COLUMN busca tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('portuguese', knowledge_norm(titulo)),   'A') ||
        setweight(to_tsvector('portuguese', knowledge_norm(resumo)),   'B') ||
        setweight(to_tsvector('portuguese', knowledge_norm(conteudo)), 'C')
      ) STORED
    `);
    console.log('  ✓ knowledge_artigos.busca (tsvector gerado)');
  }
  await db.raw('CREATE INDEX IF NOT EXISTS idx_knowledge_busca ON knowledge_artigos USING GIN(busca)');
  await db.raw(`CREATE INDEX IF NOT EXISTS idx_knowledge_titulo_trgm
                ON knowledge_artigos USING GIN(titulo gin_trgm_ops)`).catch(() => {});

  // §53: nunca sobrescrever conhecimento oficial em silêncio. Cada publicação
  // congela uma linha aqui, e a auditoria consegue dizer QUAL versão estava no
  // ar quando a IA respondeu.
  if (!await db.schema.hasTable('knowledge_versoes')) {
    await db.schema.createTable('knowledge_versoes', t => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.uuid('artigo_id').notNullable().references('id').inTable('knowledge_artigos').onDelete('CASCADE');
      t.integer('versao').notNullable();
      t.string('titulo').notNullable();
      t.text('conteudo').notNullable();
      t.text('resumo');
      t.jsonb('metadados').defaultTo('{}');
      t.uuid('criado_por').references('id').inTable('agentes').onDelete('SET NULL');
      t.timestamp('criado_em').defaultTo(db.fn.now());
      t.unique(['artigo_id', 'versao']);
    });
    console.log('  ✓ knowledge_versoes');
  }

  // §55: qual artigo (e qual VERSÃO) sustentou aquela resposta.
  if (!await db.schema.hasTable('knowledge_uso')) {
    await db.schema.createTable('knowledge_uso', t => {
      t.bigIncrements('id').primary();
      t.uuid('artigo_id').references('id').inTable('knowledge_artigos').onDelete('SET NULL');
      t.integer('versao');
      t.uuid('conversa_id');
      t.string('origem').defaultTo('ia');        // ia | agente
      t.text('consulta');
      t.timestamp('criado_em').defaultTo(db.fn.now());
      t.index(['artigo_id']);
      t.index(['criado_em']);
    });
    console.log('  ✓ knowledge_uso');
  }

  // §57
  if (!await db.schema.hasTable('knowledge_feedback')) {
    await db.schema.createTable('knowledge_feedback', t => {
      t.bigIncrements('id').primary();
      t.uuid('artigo_id').notNullable().references('id').inTable('knowledge_artigos').onDelete('CASCADE');
      t.uuid('agente_id').references('id').inTable('agentes').onDelete('SET NULL');
      t.string('tipo').notNullable();            // util | incorreto | desatualizado
      t.text('comentario');
      t.timestamp('criado_em').defaultTo(db.fn.now());
      t.index(['artigo_id']);
    });
    console.log('  ✓ knowledge_feedback');
  }

  // §56: pergunta que a base não soube responder. `pergunta_normalizada` é
  // UNIQUE para que a mesma lacuna vire CONTADOR, não 300 linhas iguais — é o
  // que transforma o registro em "visão de lacunas recorrentes".
  if (!await db.schema.hasTable('knowledge_gaps')) {
    await db.schema.createTable('knowledge_gaps', t => {
      t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      t.text('pergunta').notNullable();
      // Chave calculada pelo MESMO pipeline da busca (`knowledge_norm` +
      // stemmer português): "Como troco a senha do WiFi?", "trocar senha wifi"
      // e "WIFI SENHA TROCAR" viram a mesma linha. Normalizar em JS não faria
      // stemming — "troco" e "trocar" virariam duas lacunas de 1 ocorrência, e
      // o painel de lacunas RECORRENTES nunca mostraria nada.
      t.text('pergunta_normalizada').notNullable().unique();
      t.integer('ocorrencias').defaultTo(1);
      t.string('status').defaultTo('aberto');    // aberto | resolvido | ignorado
      t.uuid('artigo_id').references('id').inTable('knowledge_artigos').onDelete('SET NULL');
      t.timestamp('primeira_em').defaultTo(db.fn.now());
      t.timestamp('ultima_em').defaultTo(db.fn.now());
      t.index(['status', 'ocorrencias']);
    });
    console.log('  ✓ knowledge_gaps');
  }
}

export async function down(db) {
  await db.schema.dropTableIfExists('knowledge_gaps');
  await db.schema.dropTableIfExists('knowledge_feedback');
  await db.schema.dropTableIfExists('knowledge_uso');
  await db.schema.dropTableIfExists('knowledge_versoes');
  await db.schema.dropTableIfExists('knowledge_artigos');
  await db.schema.dropTableIfExists('knowledge_categorias');
  await db.raw('DROP FUNCTION IF EXISTS knowledge_norm(text)');
}
