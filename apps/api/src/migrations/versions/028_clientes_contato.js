/**
 * 028_clientes_contato.js — a aba Clientes vira HISTÓRICO DE CONTATO.
 *
 * Nenhuma tabela nova, e isso É a decisão. Os fatos ("quem falou com a gente,
 * quando, e qual CPF/contrato reconhecemos") já moram em `conversas` desde a
 * 001: `telefone`, `cpf`, `contrato_id`, `nome`, `email`, `cidade`, `canal`,
 * `protocolo`, `status`, `criado_em`. As colunas `cpf`/`contrato_id` passaram
 * a ser ESCRITAS na FASE 6 (`motorFluxo.js`, nó `consultar_cliente`).
 *
 * Uma tabela `clientes` seria uma segunda verdade para o mesmo fato: exigiria
 * backfill, exigiria um segundo escritor sincronizado com o motor, e no dia
 * que dessincronizasse a tela mentiria — e nasceria vazia. É o mesmo
 * argumento com que a FASE 12 recusou um event store. O que faltava era
 * LEITURA; é o que esta view é.
 *
 * ⚠️ `COALESCE(telefone, id::text)`: sem ele TODA conversa de widget
 * (telefone NULL) cai no mesmo grupo e vira "um cliente" só — juntando gente
 * que nunca se falou. É a armadilha nomeada na FASE 6 e repetida na window de
 * recontato da `conversa_fatos` (025).
 *
 * `(array_agg(x ORDER BY criado_em DESC) FILTER (WHERE x IS NOT NULL))[1]`
 * = "o último valor que conhecemos". É isso que faz o telefone que volta
 * meses depois já aparecer com o CPF que a IA identificou lá atrás: o vínculo
 * não precisa ser copiado para lugar nenhum, ele é uma agregação.
 *
 * DROP + CREATE, nunca CREATE OR REPLACE (falha quando a lista de colunas
 * muda) — mesma regra da 025.
 *
 * ponytail: agrega `conversas` inteira a cada request. Com o volume atual é
 * de graça; vira MATERIALIZED VIEW (refresh no encerramento) ou tabela real
 * quando `conversas` passar da casa das centenas de milhares.
 */
export async function up(db) {
  await db.raw('DROP VIEW IF EXISTS clientes_contato');
  await db.raw(`
    CREATE VIEW clientes_contato AS
    SELECT
      COALESCE(c.telefone, c.id::text) AS chave,
      MAX(c.telefone)                  AS telefone,
      (array_agg(c.nome        ORDER BY c.criado_em DESC) FILTER (WHERE c.nome        IS NOT NULL))[1] AS nome,
      (array_agg(c.cpf         ORDER BY c.criado_em DESC) FILTER (WHERE c.cpf         IS NOT NULL))[1] AS cpf,
      (array_agg(c.contrato_id ORDER BY c.criado_em DESC) FILTER (WHERE c.contrato_id IS NOT NULL))[1] AS contrato_id,
      (array_agg(c.email       ORDER BY c.criado_em DESC) FILTER (WHERE c.email       IS NOT NULL))[1] AS email,
      (array_agg(c.cidade      ORDER BY c.criado_em DESC) FILTER (WHERE c.cidade      IS NOT NULL))[1] AS cidade,
      (array_agg(c.canal       ORDER BY c.criado_em DESC))[1] AS ultimo_canal,
      (array_agg(c.id          ORDER BY c.criado_em DESC))[1] AS ultima_conversa_id,
      (array_agg(c.protocolo   ORDER BY c.criado_em DESC))[1] AS ultimo_protocolo,
      count(*)                         AS conversas,
      min(c.criado_em)                 AS primeiro_contato,
      max(c.criado_em)                 AS ultimo_contato,
      -- COALESCE, e nao o predicado puro: com status NULL o predicado e NULL,
      -- o bool_or o ignora e o grupo inteiro devolve NULL -- uma conversa VIVA
      -- sem o selo "em atendimento". A coluna tem default mas nao e
      -- notNullable (001), entao o buraco existe por construcao.
      bool_or(COALESCE(c.status, '') <> 'encerrada') AS em_atendimento
    FROM conversas c
    GROUP BY COALESCE(c.telefone, c.id::text)
  `);
  console.log('  ✓ view clientes_contato');
}

export async function down(db) {
  await db.raw('DROP VIEW IF EXISTS clientes_contato');
}
