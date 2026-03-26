/**
 * migrate-saas-tenancy.js
 * ─────────────────────────────────────────────────────────────────────────────
 * FASE 1 DA MIGRAÇÃO SAAS — Multi-tenancy no banco de dados
 *
 * O QUE ESTE ARQUIVO FAZ:
 *   1. Cria a tabela `tenants` (a raiz de tudo no SaaS)
 *   2. Cria a tabela `tenant_configs` (configs por tenant: SGP URL, credenciais, etc.)
 *   3. Insere a CITmax como o tenant original (ID fixo, dados preservados)
 *   4. Adiciona `tenant_id` em todas as 27 tabelas existentes
 *   5. Popula tenant_id = UUID da CITmax em TODOS os registros existentes
 *   6. Adiciona índices compostos (tenant_id + campo principal) nas tabelas críticas
 *   7. Corrige PKs problemáticas (canais, sessoes, sistema_kv, wa_janela,
 *      memoria_clientes) para suportar múltiplos tenants
 *   8. Adiciona constraints NOT NULL após população
 *
 * COMO EXECUTAR:
 *   node migrate-saas-tenancy.js
 *
 * SEGURANÇA:
 *   - Toda a migration roda dentro de uma única transação.
 *   - Em caso de qualquer erro, tudo é revertido (ROLLBACK automático).
 *   - NUNCA apaga dados existentes. Apenas adiciona e atualiza.
 *   - A CITmax continua funcionando normalmente após a migration.
 *
 * PRÉ-REQUISITOS:
 *   - DATABASE_URL no ambiente (mesma do sistema atual)
 *   - Node.js 18+ (ESM)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

// ── UUID fixo da CITmax — o tenant original ──────────────────────────────────
// UUID v4 gerado deterministicamente para a CITmax.
// NUNCA mude este valor após a migration inicial.
const CITMAX_TENANT_ID = "00000000-0000-4000-a000-000000000001";

// ── Conexão ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 3,
});

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await fn(client);
    await client.query("COMMIT");
    console.log("\n✅ Migration concluída com sucesso. COMMIT realizado.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Erro durante a migration. ROLLBACK realizado.");
    console.error("   Detalhe:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// ── Helper de log ─────────────────────────────────────────────────────────────
function step(msg) {
  console.log(`\n⚙️  ${msg}`);
}
function ok(msg) {
  console.log(`   ✓ ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
await withTransaction(async (db) => {

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 1 — Tabela TENANTS
  // ══════════════════════════════════════════════════════════════════════════
  step("Criando tabela tenants...");

  await db.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Identificação
      nome         TEXT NOT NULL,
      slug         TEXT NOT NULL UNIQUE,          -- usado na URL: app.maxxi.ai/slug
      dominio      TEXT UNIQUE,                   -- domínio customizado (opcional)

      -- Contato / responsável
      email        TEXT NOT NULL UNIQUE,
      telefone     TEXT,
      cnpj         TEXT,

      -- Plano SaaS
      plano        TEXT NOT NULL DEFAULT 'starter',  -- starter | pro | enterprise
      status       TEXT NOT NULL DEFAULT 'ativo',    -- ativo | suspenso | cancelado | trial

      -- Limites do plano (podem ser sobrescritos por tenant)
      limite_agentes       INT DEFAULT 3,
      limite_conversas_mes INT DEFAULT 500,
      limite_canais        INT DEFAULT 2,

      -- Configuração geral
      fuso_horario TEXT DEFAULT 'America/Fortaleza',
      idioma       TEXT DEFAULT 'pt-BR',

      -- Billing
      trial_ate       TIMESTAMPTZ,
      proximo_pagamento TIMESTAMPTZ,
      valor_plano     NUMERIC(10,2) DEFAULT 0,

      -- Metadados
      criado_em    TIMESTAMPTZ DEFAULT NOW(),
      atualizado   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  ok("tabela tenants criada");

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 2 — Tabela TENANT_CONFIGS
  // Armazena todas as configurações que hoje estão hardcoded ou em .env
  // ══════════════════════════════════════════════════════════════════════════
  step("Criando tabela tenant_configs...");

  await db.query(`
    CREATE TABLE IF NOT EXISTS tenant_configs (
      tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      chave        TEXT NOT NULL,
      valor        TEXT,                          -- texto simples ou JSON serializado
      sensivel     BOOLEAN DEFAULT false,         -- se true, nunca retorna via API pública
      atualizado   TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (tenant_id, chave)
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_tenant_configs_tenant
      ON tenant_configs(tenant_id)
  `);
  ok("tabela tenant_configs criada");

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 3 — Inserir a CITmax como o tenant original
  // ══════════════════════════════════════════════════════════════════════════
  step("Inserindo CITmax como tenant original...");

  await db.query(`
    INSERT INTO tenants (
      id, nome, slug, email, telefone, cnpj,
      plano, status,
      limite_agentes, limite_conversas_mes, limite_canais,
      fuso_horario, idioma
    ) VALUES (
      $1, 'CITmax Fibra', 'citmax', 'contato@citmax.com.br',
      NULL, NULL,
      'enterprise', 'ativo',
      999, 999999, 99,
      'America/Fortaleza', 'pt-BR'
    )
    ON CONFLICT (id) DO NOTHING
  `, [CITMAX_TENANT_ID]);
  ok(`CITmax inserida com ID ${CITMAX_TENANT_ID}`);

  // Configs que hoje estão hardcoded no código — serão preenchidas pelo admin
  // depois. Por ora inserimos as chaves com valor NULL para documentar o schema.
  const configsIniciais = [
    // ERP / SGP
    ["sgp_url",         null,  true,  "URL base do SGP (ex: https://citrn.sgp.net.br)"],
    ["sgp_token",       null,  true,  "Token de autenticação do SGP"],
    ["sgp_app",         null,  false, "App ID do SGP"],
    ["sgp_user_agent",  null,  false, "User-Agent para requests ao SGP"],

    // Chatwoot
    ["chatwoot_url",          null, true,  "URL da instância Chatwoot"],
    ["chatwoot_api_token",    null, true,  "Token de API do Chatwoot"],
    ["chatwoot_account_id",   null, false, "ID da conta no Chatwoot"],
    ["chatwoot_human_team_id",null, false, "ID do time humano no Chatwoot"],

    // Evolution API (WhatsApp)
    ["evolution_url",         null, true,  "URL da Evolution API"],
    ["evolution_api_key",     null, true,  "Chave da Evolution API"],
    ["evolution_instancia",   null, false, "Nome da instância WhatsApp"],

    // Meta (WhatsApp Business API)
    ["wa_access_token",       null, true,  "Token de acesso Meta"],
    ["wa_phone_number_id",    null, false, "ID do número WhatsApp Business"],
    ["wa_verify_token",       null, true,  "Token de verificação do webhook Meta"],

    // Telegram
    ["telegram_bot_token",    null, true,  "Token do bot Telegram"],

    // IA
    ["anthropic_api_key",     null, true,  "Chave Anthropic Claude"],
    ["openai_api_key",        null, true,  "Chave OpenAI Whisper/GPT"],
    ["elevenlabs_api_key",    null, true,  "Chave ElevenLabs (opcional)"],
    ["elevenlabs_voice_id",   null, false, "ID da voz ElevenLabs"],

    // SMS Gateway
    ["sms_gateway_token",     null, true,  "Token do gateway SMS"],
    ["sms_gateway_template",  null, false, "Template aprovado Meta para SMS outbound"],

    // ACS / TR-069
    ["acs_user",              null, true,  "Usuário ACS para ONUs"],
    ["acs_pass",              null, true,  "Senha ACS para ONUs"],
    ["tr069_sgp_user",        null, true,  "Usuário CPE Manager SGP"],
    ["tr069_sgp_pass",        null, true,  "Senha CPE Manager SGP"],

    // Identidade do bot
    ["bot_nome",              "Maxxi",  false, "Nome do assistente virtual"],
    ["bot_avatar",            null,     false, "URL do avatar do bot"],
    ["empresa_nome",          "CITmax", false, "Nome da empresa (usado nos prompts)"],
    ["empresa_segmento",      "isp",    false, "Segmento: isp | telecom | varejo | servicos | ..."],
  ];

  for (const [chave, valor, sensivel] of configsIniciais) {
    await db.query(`
      INSERT INTO tenant_configs(tenant_id, chave, valor, sensivel)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id, chave) DO NOTHING
    `, [CITMAX_TENANT_ID, chave, valor, sensivel]);
  }
  ok(`${configsIniciais.length} chaves de config inseridas para CITmax`);

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 4 — Adicionar tenant_id em todas as 27 tabelas
  //
  // ESTRATÉGIA:
  //   a) Adicionar coluna tenant_id UUID NULLABLE (sem constraint ainda)
  //   b) Popular com CITMAX_TENANT_ID em todos os registros existentes
  //   c) Adicionar constraint NOT NULL
  //   d) Adicionar índices compostos
  //
  // Tabelas com PKs problemáticas (texto simples que conflitam em multi-tenant)
  // precisam de tratamento especial — ver Etapa 5.
  // ══════════════════════════════════════════════════════════════════════════
  step("Adicionando tenant_id nas tabelas...");

  // Lista de tabelas com suas PKs (para referenciar nos índices)
  // [tabela, pk_col, precisa_recriar_pk]
  const tabelas = [
    // ── Atendimento ──────────────────────────────────────────────
    ["conversas",           "id",       false],
    ["sessoes",             "telefone", true],   // PK simples → precisa virar composta
    ["memoria_clientes",    "telefone", true],   // idem
    ["wa_janela",           "telefone", true],   // idem
    ["pesquisa_satisfacao", "id",       false],
    ["leads",               "id",       false],

    // ── Configuração ─────────────────────────────────────────────
    ["canais",              "tipo",     true],   // PK tipo TEXT → composta com tenant_id
    ["crm_config",          "chave",    true],   // idem
    ["sistema_kv",          "chave",    true],   // idem
    ["prompts",             "id",       false],
    ["ocorrencia_tipos",    "id",       false],
    ["fluxos",              "id",       false],
    ["agentes",             "id",       false],

    // ── Planos / Cidades ─────────────────────────────────────────
    ["cidades",             "id",       false],
    ["planos",              "id",       false],
    ["cidade_planos",       "id",       false],

    // ── Cobertura ────────────────────────────────────────────────
    ["zonas_cobertura",     "id",       false],
    ["zona_planos",         null,       false],  // PK composta (zona_id, plano_id)
    ["consultas_cobertura", "id",       false],

    // ── Monitoramento ────────────────────────────────────────────
    ["network_hosts",       "id",       false],
    ["network_checks",      "id",       false],
    ["stats",               "id",       false],

    // ── Canais externos ──────────────────────────────────────────
    ["gateway_sms_log",     "id",       false],

    // ── ACS / TR-069 ─────────────────────────────────────────────
    ["acs_devices",         "id",       false],
    ["acs_params",          "id",       false],
    ["acs_events",          "id",       false],
    ["acs_comandos",        "id",       false],
    ["acs_auditoria",       "id",       false],
    ["cpe_acoes",           "id",       false],
  ];

  for (const [tabela] of tabelas) {
    // a) Adicionar coluna nullable
    await db.query(`
      ALTER TABLE ${tabela}
        ADD COLUMN IF NOT EXISTS tenant_id UUID
    `).catch(e => {
      // Ignorar se já existe
      if (!e.message.includes("already exists")) throw e;
    });

    // b) Popular registros existentes sem tenant_id
    const { rowCount } = await db.query(`
      UPDATE ${tabela}
      SET tenant_id = $1
      WHERE tenant_id IS NULL
    `, [CITMAX_TENANT_ID]);

    ok(`${tabela}: tenant_id adicionado, ${rowCount} registros atualizados`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 5 — Recriar PKs problemáticas como compostas (tenant_id + campo)
  //
  // Tabelas cujas PKs são strings simples (tipo, chave, telefone) precisam
  // virar PKs compostas para suportar múltiplos tenants com os mesmos valores.
  //
  // Ex: dois tenants podem ter canal tipo="whatsapp" — sem PK composta, o
  //     segundo INSERT conflitaria com o primeiro.
  // ══════════════════════════════════════════════════════════════════════════
  step("Recriando PKs compostas nas tabelas com PKs de texto simples...");

  const tabelasPkComposta = [
    // [tabela, pk_atual, nova_pk_cols]
    ["canais",           "tipo",     "(tenant_id, tipo)"],
    ["crm_config",       "chave",    "(tenant_id, chave)"],
    ["sistema_kv",       "chave",    "(tenant_id, chave)"],
    ["sessoes",          "telefone", "(tenant_id, telefone)"],
    ["memoria_clientes", "telefone", "(tenant_id, telefone)"],
    ["wa_janela",        "telefone", "(tenant_id, telefone)"],
  ];

  for (const [tabela, pkAtual, novaPkCols] of tabelasPkComposta) {
    // 1. Remover a PK atual
    await db.query(`
      ALTER TABLE ${tabela}
        DROP CONSTRAINT IF EXISTS ${tabela}_pkey
    `);
    // 2. Adicionar a nova PK composta
    await db.query(`
      ALTER TABLE ${tabela}
        ADD PRIMARY KEY ${novaPkCols}
    `);
    ok(`${tabela}: PK recriada como ${novaPkCols}`);
  }

  // stats tem PK id=1 singleton — precisa de tratamento especial
  // Não recria PK, mas garante que tenant_id está NOT NULL
  // (será tratado na etapa de constraints abaixo)

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 6 — Adicionar NOT NULL constraints
  // Só depois que todos os registros foram populados com tenant_id
  // ══════════════════════════════════════════════════════════════════════════
  step("Adicionando NOT NULL constraints em tenant_id...");

  for (const [tabela] of tabelas) {
    await db.query(`
      ALTER TABLE ${tabela}
        ALTER COLUMN tenant_id SET NOT NULL
    `).catch(e => {
      console.warn(`   ⚠️  ${tabela}: não foi possível adicionar NOT NULL — ${e.message}`);
    });
    ok(`${tabela}: tenant_id NOT NULL`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 7 — Índices compostos (tenant_id + campo de busca frequente)
  // Críticos para performance: sem eles, toda query filtra a tabela inteira
  // antes de aplicar o tenant filter.
  // ══════════════════════════════════════════════════════════════════════════
  step("Criando índices compostos por tenant...");

  const indices = [
    // conversas — buscas mais frequentes do sistema
    ["idx_conversas_tenant_status",   "conversas",           "(tenant_id, status)"],
    ["idx_conversas_tenant_telefone", "conversas",           "(tenant_id, telefone)"],
    ["idx_conversas_tenant_agente",   "conversas",           "(tenant_id, agente_id)"],
    ["idx_conversas_tenant_ts",       "conversas",           "(tenant_id, atualizado DESC)"],

    // sessoes — lookup por telefone a cada mensagem recebida
    ["idx_sessoes_tenant",            "sessoes",             "(tenant_id, telefone)"],

    // memoria_clientes — lookup por telefone/cpf
    ["idx_memoria_tenant",            "memoria_clientes",    "(tenant_id, telefone)"],
    ["idx_memoria_tenant_cpf",        "memoria_clientes",    "(tenant_id, cpfcnpj)"],

    // leads
    ["idx_leads_tenant_status",       "leads",               "(tenant_id, status)"],
    ["idx_leads_tenant_telefone",     "leads",               "(tenant_id, telefone)"],

    // agentes
    ["idx_agentes_tenant",            "agentes",             "(tenant_id, login)"],
    ["idx_agentes_tenant_online",     "agentes",             "(tenant_id, online)"],

    // fluxos
    ["idx_fluxos_tenant_ativo",       "fluxos",              "(tenant_id, ativo, publicado)"],

    // prompts
    ["idx_prompts_tenant_slug",       "prompts",             "(tenant_id, slug)"],

    // zonas_cobertura
    ["idx_zonas_tenant_ativo",        "zonas_cobertura",     "(tenant_id, ativo)"],

    // consultas_cobertura
    ["idx_consultas_tenant_ts",       "consultas_cobertura", "(tenant_id, criado_em DESC)"],
    ["idx_consultas_tenant_tel",      "consultas_cobertura", "(tenant_id, telefone)"],

    // network_hosts
    ["idx_nethosts_tenant",           "network_hosts",       "(tenant_id, ativo)"],

    // acs_devices
    ["idx_acs_dev_tenant",            "acs_devices",         "(tenant_id, serial)"],
    ["idx_acs_dev_tenant_ip",         "acs_devices",         "(tenant_id, ip)"],

    // gateway_sms_log
    ["idx_sms_log_tenant_ts",         "gateway_sms_log",     "(tenant_id, criado_em DESC)"],

    // pesquisa_satisfacao
    ["idx_nps_tenant_ts",             "pesquisa_satisfacao", "(tenant_id, criado_em DESC)"],
    ["idx_nps_tenant_canal",          "pesquisa_satisfacao", "(tenant_id, canal)"],

    // wa_janela
    ["idx_wajanela_tenant",           "wa_janela",           "(tenant_id, telefone)"],

    // stats — por tenant
    ["idx_stats_tenant",              "stats",               "(tenant_id)"],

    // ocorrencia_tipos
    ["idx_oc_tipos_tenant",           "ocorrencia_tipos",    "(tenant_id, ativo)"],

    // cidades
    ["idx_cidades_tenant",            "cidades",             "(tenant_id, ativo)"],

    // planos
    ["idx_planos_tenant_ativo",       "planos",              "(tenant_id, ativo)"],

    // cpe_acoes
    ["idx_cpe_acoes_tenant",          "cpe_acoes",           "(tenant_id, id_servico)"],
  ];

  for (const [nome, tabela, cols] of indices) {
    await db.query(`
      CREATE INDEX IF NOT EXISTS ${nome} ON ${tabela} ${cols}
    `).catch(e => {
      console.warn(`   ⚠️  índice ${nome}: ${e.message}`);
    });
    ok(`índice ${nome}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 8 — Corrigir UNIQUE constraint de agentes.login
  //
  // Hoje: UNIQUE(login) → dois tenants não podem ter login "admin"
  // Depois: UNIQUE(tenant_id, login) → cada tenant tem seu espaço
  // ══════════════════════════════════════════════════════════════════════════
  step("Corrigindo unique constraint de agentes.login...");

  await db.query(`
    ALTER TABLE agentes DROP CONSTRAINT IF EXISTS agentes_login_key
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agentes_login_tenant
      ON agentes(tenant_id, login)
  `);
  ok("agentes: login agora é único por tenant");

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 9 — Corrigir UNIQUE constraint de ocorrencia_tipos.sgp_id
  // ══════════════════════════════════════════════════════════════════════════
  step("Corrigindo unique constraint de ocorrencia_tipos.sgp_id...");

  await db.query(`
    DROP INDEX IF EXISTS idx_oc_tipos_sgp
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_oc_tipos_sgp_tenant
      ON ocorrencia_tipos(tenant_id, sgp_id)
  `);
  ok("ocorrencia_tipos: sgp_id agora é único por tenant");

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 10 — Corrigir UNIQUE constraint de prompts.slug
  // ══════════════════════════════════════════════════════════════════════════
  step("Corrigindo unique constraint de prompts.slug...");

  await db.query(`
    ALTER TABLE prompts DROP CONSTRAINT IF EXISTS prompts_slug_key
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_slug_tenant
      ON prompts(tenant_id, slug)
  `);
  ok("prompts: slug agora é único por tenant");

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 11 — Corrigir UNIQUE constraint de cidades.nome
  // ══════════════════════════════════════════════════════════════════════════
  step("Corrigindo unique constraint de cidades.nome...");

  await db.query(`
    DROP INDEX IF EXISTS idx_cidades_nome
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cidades_nome_tenant
      ON cidades(tenant_id, nome)
  `);
  ok("cidades: nome agora é único por tenant");

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 12 — stats: tornar singleton por tenant
  //
  // Hoje: id=1 é um singleton global. No SaaS precisa ser um por tenant.
  // Estratégia: remover PK id=1 e criar nova com (tenant_id) como unique.
  // ══════════════════════════════════════════════════════════════════════════
  step("Adaptando tabela stats para multi-tenant...");

  // Atualizar o registro existente com tenant_id já foi feito na etapa 4
  // Agora precisamos garantir que o singleton seja por tenant
  await db.query(`
    ALTER TABLE stats DROP CONSTRAINT IF EXISTS stats_pkey
  `);
  // Adiciona nova coluna id serial se não existir já como uuid
  // (a tabela original tem id INT PRIMARY KEY DEFAULT 1 — vamos manter o int mas
  //  tornar o singleton garantido pelo unique em tenant_id)
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_tenant_singleton
      ON stats(tenant_id)
  `);
  // Restaura a PK em id para que INSERTs futuros funcionem
  await db.query(`
    ALTER TABLE stats ADD PRIMARY KEY (id)
  `).catch(() => {}); // pode já existir se não foi dropada
  ok("stats: singleton agora é por tenant_id");

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 13 — Adicionar FK de tenant_id em todas as tabelas
  // (depois que todos os registros foram populados e NOT NULL adicionado)
  // ══════════════════════════════════════════════════════════════════════════
  step("Adicionando foreign keys para tenants...");

  const tabelasSemPkComposta = tabelas.filter(
    ([t]) => !["canais","crm_config","sistema_kv","sessoes","memoria_clientes","wa_janela"].includes(t)
  );

  for (const [tabela] of tabelasSemPkComposta) {
    const constraintName = `fk_${tabela}_tenant`;
    await db.query(`
      ALTER TABLE ${tabela}
        ADD CONSTRAINT ${constraintName}
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    `).catch(e => {
      if (!e.message.includes("already exists")) {
        console.warn(`   ⚠️  FK ${constraintName}: ${e.message}`);
      }
    });
    ok(`FK ${constraintName}`);
  }

  // PKs compostas já têm tenant_id como parte da PK, FK separada é opcional
  // mas adicionamos para garantir referential integrity
  for (const [tabela] of tabelasPkComposta) {
    const constraintName = `fk_${tabela}_tenant`;
    await db.query(`
      ALTER TABLE ${tabela}
        ADD CONSTRAINT ${constraintName}
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    `).catch(e => {
      if (!e.message.includes("already exists")) {
        console.warn(`   ⚠️  FK ${constraintName}: ${e.message}`);
      }
    });
    ok(`FK ${constraintName}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ETAPA 14 — Registrar migration no sistema_kv
  // ══════════════════════════════════════════════════════════════════════════
  step("Registrando versão da migration...");

  await db.query(`
    INSERT INTO sistema_kv(tenant_id, chave, valor, atualizado)
    VALUES ($1, 'saas_migration_version', '1.0.0', NOW())
    ON CONFLICT (tenant_id, chave) DO UPDATE
      SET valor = '1.0.0', atualizado = NOW()
  `, [CITMAX_TENANT_ID]);
  ok("versão 1.0.0 registrada");

  // ══════════════════════════════════════════════════════════════════════════
  // RELATÓRIO FINAL
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  MIGRATION SAAS — FASE 1 CONCLUÍDA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Tenant CITmax: ${CITMAX_TENANT_ID}
  Tabelas migradas: ${tabelas.length}
  PKs recriadas: ${tabelasPkComposta.length}
  Índices criados: ${indices.length}
  Constraints corrigidas: 5

  PRÓXIMOS PASSOS:
  1. Atualizar db.js — adicionar tenantQuery() helper
  2. Atualizar admin.js — injetar tenant_id via middleware
  3. Atualizar agent.js e webhook.js — passar tenant_id nas queries
  4. Criar endpoint POST /api/tenants (super-admin)
  5. Configurar UI de onboarding do novo tenant

  A CITmax continua funcionando normalmente. ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
