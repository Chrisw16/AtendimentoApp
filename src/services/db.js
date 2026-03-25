/**
 * db.js — PostgreSQL pool + auto-migração
 * SEM import do logger.js para evitar circular dependency
 */
import pg from "pg";

const { Pool } = pg;
let pool = null;

export function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definida nas variáveis de ambiente");
    pool = new Pool({
      connectionString: url,
      ssl: false,          // IP direto — sem SSL
      max: 10,
      idleTimeoutMillis:    30000,
      connectionTimeoutMillis: 8000,
    });
    pool.on("error", (err) => console.error("❌ PG pool error:", err.message));
  }
  return pool;
}

export async function query(sql, params = []) {
  const client = await getPool().connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// ── KV helpers ────────────────────────────────────────────────────────────────
export async function kvGet(chave) {
  const r = await query(`SELECT valor FROM sistema_kv WHERE chave=$1`, [chave]);
  return r.rows[0]?.valor ?? null;
}

export async function kvSet(chave, valor) {
  await query(
    `INSERT INTO sistema_kv(chave,valor,atualizado) VALUES($1,$2,NOW())
     ON CONFLICT(chave) DO UPDATE SET valor=$2, atualizado=NOW()`,
    [chave, valor]
  );
}

// ── MIGRAÇÃO ──────────────────────────────────────────────────────────────────
export async function migrate() {
  console.log("🗄️  Rodando migrações...");

  await query(`
    CREATE TABLE IF NOT EXISTS canais (
      tipo       TEXT PRIMARY KEY,
      nome       TEXT NOT NULL,
      icone      TEXT,
      ativo      BOOLEAN DEFAULT false,
      config     JSONB DEFAULT '{}',
      atualizado TIMESTAMPTZ DEFAULT NOW()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS crm_config (
      chave      TEXT PRIMARY KEY,
      valor      JSONB NOT NULL,
      atualizado TIMESTAMPTZ DEFAULT NOW()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS agentes (
      id         TEXT PRIMARY KEY,
      nome       TEXT NOT NULL,
      login      TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      avatar     TEXT DEFAULT '🧑',
      ativo      BOOLEAN DEFAULT true,
      online     BOOLEAN DEFAULT false,
      criado_em  TIMESTAMPTZ DEFAULT NOW()
    )`);
  await query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'agente'`).catch(()=>{});
  await query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS whatsapp TEXT DEFAULT ''`).catch(()=>{});
  await query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT 'atendente'`).catch(()=>{});

  await query(`
    CREATE TABLE IF NOT EXISTS conversas (
      id         TEXT PRIMARY KEY,
      telefone   TEXT,
      nome       TEXT,
      canal      TEXT DEFAULT 'chatwoot',
      status     TEXT DEFAULT 'aguardando',
      agente_id  TEXT,
      account_id TEXT,
      nao_lidas  INT DEFAULT 0,
      ultima_msg BIGINT DEFAULT 0,
      sentimento TEXT DEFAULT NULL,
      mensagens  JSONB DEFAULT '[]',
      criado_em  TIMESTAMPTZ DEFAULT NOW(),
      atualizado TIMESTAMPTZ DEFAULT NOW()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_conversas_status   ON conversas(status)`);
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS sentimento TEXT DEFAULT NULL`).catch(()=>{});
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS assumido_em TIMESTAMPTZ`).catch(()=>{});
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS primeira_msg_agente_em TIMESTAMPTZ`).catch(()=>{});
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS agente_nome TEXT`).catch(()=>{});
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS ultima_msg_agente_em TIMESTAMPTZ`).catch(()=>{});
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS trp_segundos INT`).catch(()=>{});
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS taxa_devolucao_ia INT DEFAULT 0`).catch(()=>{});
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS foto_perfil TEXT DEFAULT NULL`).catch(()=>{});
  await query(`ALTER TABLE canais ADD COLUMN IF NOT EXISTS fluxo_id TEXT DEFAULT NULL`).catch(e => console.warn('migrate fluxo_id:', e.message));
  await query(`CREATE TABLE IF NOT EXISTS fluxos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    ativo BOOLEAN DEFAULT false,
    publicado BOOLEAN DEFAULT false,
    versao INT DEFAULT 1,
    dados JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado TIMESTAMPTZ DEFAULT NOW()
  )`).catch(()=>{});
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'`).catch(()=>{});
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS prioridade TEXT DEFAULT 'normal'`).catch(()=>{});
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS resposta_msg_id TEXT DEFAULT NULL`).catch(()=>{});
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS resposta_msg_preview TEXT DEFAULT NULL`).catch(()=>{});
  await query(`ALTER TABLE sistema_kv ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT NOW()`).catch(()=>{});
  await query(`CREATE INDEX IF NOT EXISTS idx_conv_agente_ativa ON conversas(agente_id) WHERE status='ativa'`).catch(()=>{});
  await query(`CREATE INDEX IF NOT EXISTS idx_conversas_telefone ON conversas(telefone)`);

  await query(`
    CREATE TABLE IF NOT EXISTS memoria_clientes (
      telefone      TEXT PRIMARY KEY,
      nome          TEXT,
      cpfcnpj       TEXT,
      dados         JSONB DEFAULT '{}',
      historico     JSONB DEFAULT '[]',
      ultima_visita TIMESTAMPTZ DEFAULT NOW()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS sessoes (
      telefone       TEXT PRIMARY KEY,
      nome           TEXT,
      cpfcnpj        TEXT,
      contrato_ativo TEXT,
      dados          JSONB DEFAULT '{}',
      criado_em      BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS sistema_kv (
      chave      TEXT PRIMARY KEY,
      valor      TEXT,
      atualizado TIMESTAMPTZ DEFAULT NOW()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS pesquisa_satisfacao (
      id        SERIAL PRIMARY KEY,
      telefone  TEXT,
      nota      INT CHECK (nota BETWEEN 1 AND 5),
      canal     TEXT,
      protocolo TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS wa_janela (
      telefone TEXT PRIMARY KEY,
      ts       BIGINT NOT NULL
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS leads (
      id           SERIAL PRIMARY KEY,
      cpf          TEXT,
      nome         TEXT NOT NULL,
      telefone     TEXT,
      email        TEXT,
      cidade       TEXT,
      plano_id     TEXT,
      contrato_id  TEXT,
      ocorrencia_id TEXT,
      status       TEXT DEFAULT 'aberto',
      agente_id    TEXT,
      agente_nome  TEXT,
      canal        TEXT,
      conv_id      TEXT,
      criado_em    TIMESTAMPTZ DEFAULT NOW(),
      atualizado   TIMESTAMPTZ DEFAULT NOW(),
      obs          TEXT
    )`);
  // Campos extras do pré-cadastro
  await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS datanasc TEXT`).catch(()=>{});
  await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS logradouro TEXT`).catch(()=>{});
  await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS numero TEXT`).catch(()=>{});
  await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS complemento TEXT`).catch(()=>{});
  await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS bairro TEXT`).catch(()=>{});
  await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS pontoreferencia TEXT`).catch(()=>{});
  await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS vencimento_id TEXT`).catch(()=>{});
  await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS pop_id TEXT`).catch(()=>{});
  await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS portador_id TEXT`).catch(()=>{});
  await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS erp_response JSONB`).catch(()=>{});;

  await query(`
    CREATE TABLE IF NOT EXISTS stats (
      id                   INT PRIMARY KEY DEFAULT 1,
      total_atendimentos   INT DEFAULT 0,
      total_tokens_input   BIGINT DEFAULT 0,
      total_tokens_output  BIGINT DEFAULT 0,
      total_cache_hits     BIGINT DEFAULT 0,
      erros                INT DEFAULT 0,
      iniciado_em          TIMESTAMPTZ DEFAULT NOW(),
      historico            JSONB DEFAULT '[]'
    )`);
  await query(`INSERT INTO stats(id) VALUES(1) ON CONFLICT(id) DO NOTHING`);

  // Seed canais padrão
  const canais = [
    { tipo:"chatwoot",  nome:"Chatwoot",           icone:"💬", ativo:true },
    { tipo:"whatsapp",  nome:"WhatsApp Oficial",   icone:"📱", ativo:false },
    { tipo:"instagram", nome:"Instagram DM",       icone:"📸", ativo:false },
    { tipo:"facebook",  nome:"Facebook Messenger", icone:"📘", ativo:false },
    { tipo:"telegram",  nome:"Telegram",           icone:"✈️", ativo:false },
    { tipo:"widget",    nome:"Widget Web",         icone:"🌐", ativo:false },
  ];
  for (const c of canais) {
    await query(
      `INSERT INTO canais(tipo,nome,icone,ativo) VALUES($1,$2,$3,$4) ON CONFLICT(tipo) DO NOTHING`,
      [c.tipo, c.nome, c.icone, c.ativo]
    );
  }

  // Seed CRM config padrão
  const crm = [
    ["respostas_rapidas", [{id:"1",atalho:"/oi",texto:"Olá! Bem-vindo à CITmax! 👋 Como posso ajudar?"},{id:"2",atalho:"/aguarda",texto:"Por favor, aguarde um momento enquanto verifico."},{id:"3",atalho:"/obrigado",texto:"Obrigado pelo contato! Qualquer coisa é só chamar. 😊"},{id:"4",atalho:"/reinicio",texto:"Para reinicializar seu roteador: desligue da tomada, aguarde 30 segundos e ligue novamente. Aguarde 2 minutos e teste a conexão. 🔄"},{id:"5",atalho:"/visita",texto:"Vou registrar uma visita técnica. Qual o melhor horário? Atendemos de segunda a sexta, das 08h às 18h. 📅"},{id:"6",atalho:"/fatura",texto:"Sua fatura pode ser consultada pelo nosso WhatsApp (opção Boleto/PIX) ou pelo site citrn.sgp.net.br. Quer que eu envie agora? 💳"},{id:"7",atalho:"/instabilidade",texto:"Estamos cientes de uma instabilidade na sua região e já estamos trabalhando na solução. Previsão de normalização em breve. 🔧"},{id:"8",atalho:"/wifi",texto:"Para melhorar o sinal Wi-Fi: evite obstáculos entre o roteador e seus dispositivos, mantenha-o em local alto e central, e longe de micro-ondas e espelhos. 📶"},{id:"9",atalho:"/horario",texto:"Nosso horário de atendimento: Segunda a Sexta 08h-18h, Sábado 08h-12h. ⏰"}]],
    ["horarios",  {ativo:false,mensagemForaHorario:"Atendemos seg-sex 8h-18h e sáb 8h-12h.",faixas:[{dia:"seg-sex",inicio:"08:00",fim:"18:00"},{dia:"sabado",inicio:"08:00",fim:"12:00"}]}],
    ["saudacoes", {whatsapp:"Olá! 👋 Sou a Maxxi da CITmax.",telegram:"Olá! Sou a Maxxi.",instagram:"Oi! 😊 Sou a Maxxi da CITmax.",facebook:"Olá! Sou a Maxxi.",widget:"Olá! 👋 Como posso ajudar?"}],
    ["sla",       {ativo:true,alertaMinutos:5,escalacaoMinutos:15}],
    ["pesquisa",  {ativa:true,pergunta:"Como avalia nosso atendimento?\n1️⃣ Péssimo  2️⃣ Ruim  3️⃣ Regular  4️⃣ Bom  5️⃣ Ótimo"}],
  ];
  for (const [chave, valor] of crm) {
    await query(
      `INSERT INTO crm_config(chave,valor) VALUES($1,$2::jsonb) ON CONFLICT(chave) DO NOTHING`,
      [chave, JSON.stringify(valor)]
    );
  }

  await query(`INSERT INTO sistema_kv(chave,valor) VALUES('modo','bot') ON CONFLICT(chave) DO NOTHING`);

  // Tipos de ocorrência (configuráveis no painel)
  await query(`
    CREATE TABLE IF NOT EXISTS ocorrencia_tipos (
      id         SERIAL PRIMARY KEY,
      sgp_id     INTEGER NOT NULL,
      nome       TEXT NOT NULL,
      descricao  TEXT,
      keywords   TEXT,
      ativo      BOOLEAN DEFAULT true,
      ordem      INTEGER DEFAULT 0,
      criado_em  TIMESTAMPTZ DEFAULT NOW()
    )`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_oc_tipos_sgp ON ocorrencia_tipos(sgp_id)`).catch(()=>{});

  // Seed defaults (só insere se tabela vazia)
  const { rows: existentes } = await query(`SELECT COUNT(*) as c FROM ocorrencia_tipos`);
  if (parseInt(existentes[0]?.c) === 0) {
    const defaults = [
      [200, 'Reparo', 'Problema na conexão, equipamento com defeito', 'internet caiu,sem internet,lento,offline,reiniciar,roteador,onu,fibra,cabo', 1],
      [23, 'Mudança de Plano', 'Upgrade, downgrade ou troca de plano', 'mudar plano,upgrade,downgrade,trocar plano,velocidade,plano maior', 2],
      [13, 'Mudança de Endereço', 'Transferência do serviço para outro endereço', 'mudar endereço,mudança,transferir,novo endereço,mudei', 3],
      [3, 'Mudança de Senha Wi-Fi', 'Alterar senha da rede Wi-Fi', 'senha wifi,senha wi-fi,trocar senha,mudar senha,rede', 4],
      [14, 'Relocação do Roteador', 'Mover roteador para outro cômodo', 'mover roteador,mudar roteador,outro cômodo,relocar', 5],
      [22, 'Problema na Fatura', 'Contestação de valor, cobrança indevida', 'fatura errada,cobrança,valor errado,contestar,cobrado errado', 6],
      [206, 'Mudança de Titular', 'Transferência de titularidade do contrato', 'mudar titular,titular,transferir contrato,nome,responsável', 7],
      [4, 'Novo Ponto', 'Instalação de novo ponto de acesso', 'novo ponto,ponto extra,outro ponto,extensão', 8],
      [40, 'Ativação de Streaming', 'Ativação de serviço de streaming', 'streaming,netflix,hbo,disney,paramount,deezer', 9],
      [5, 'Outros', 'Outros assuntos não listados', 'outro,diferente,geral', 99],
    ];
    for (const [sgpId, nome, desc, kw, ordem] of defaults) {
      await query(`INSERT INTO ocorrencia_tipos(sgp_id,nome,descricao,keywords,ordem) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [sgpId, nome, desc, kw, ordem]);
    }
  }

  // ── PROMPTS IA (editáveis no painel) ──
  await query(`
    CREATE TABLE IF NOT EXISTS prompts (
      id           SERIAL PRIMARY KEY,
      slug         TEXT NOT NULL UNIQUE,
      nome         TEXT NOT NULL,
      conteudo     TEXT NOT NULL,
      padrao       TEXT NOT NULL,
      provedor     TEXT DEFAULT 'openai',
      modelo       TEXT DEFAULT 'gpt-4o-mini',
      temperatura  NUMERIC(3,2) DEFAULT 0.3,
      ativo        BOOLEAN DEFAULT true,
      atualizado   TIMESTAMPTZ DEFAULT NOW()
    )`);
  // Migration: add columns if table already exists
  await query(`ALTER TABLE prompts ADD COLUMN IF NOT EXISTS provedor TEXT DEFAULT 'openai'`).catch(()=>{});
  await query(`ALTER TABLE prompts ADD COLUMN IF NOT EXISTS modelo TEXT DEFAULT 'gpt-4o-mini'`).catch(()=>{});
  await query(`ALTER TABLE prompts ADD COLUMN IF NOT EXISTS temperatura NUMERIC(3,2) DEFAULT 0.3`).catch(()=>{});

  // Seed prompts (só se vazio)
  const { rows: promptsExist } = await query(`SELECT COUNT(*) as c FROM prompts`);
  if (parseInt(promptsExist[0]?.c) === 0) {
    const promptsSeed = [
      ['regras', 'Regras gerais', `REGRAS ABSOLUTAS:
1. NUNCA responda sobre dados do cliente sem ANTES chamar consultar_clientes.
2. Se uma tool falhar, diga "Não consegui acessar seus dados, pode tentar de novo?"
3. NUNCA INVENTE valores, datas, nomes de planos ou protocolos.
4. Use SOMENTE dados retornados pelas tools.
5. Se não sabe, pergunte ao cliente.
6. NUNCA retorne JSON na mensagem. Responda APENAS texto normal.
7. Para enviar boleto no WhatsApp, use a tool wa_enviar_pix.
8. Para oferecer opções, use wa_enviar_botoes ou wa_enviar_lista.`],

      ['estilo', 'Estilo de conversa', `ESTILO:
- Informal e acolhedora, mas profissional
- 1-2 emojis por mensagem máximo
- Frases curtas (WhatsApp é chat)
- Chame pelo primeiro nome quando souber
- Máximo 3 linhas por resposta`],

      ['roteador', 'Classificador de intenção', `Classifique a mensagem em UMA categoria. Responda APENAS com o JSON, nada mais:
{"agente":"financeiro|suporte|comercial|faq|outros","cpf":"CPF se mencionado ou null","resumo":"5 palavras"}

REGRAS:
- "financeiro": boleto, 2ª via, pagamento, PIX, desbloqueio, fatura, cobrar
- "suporte": internet, lento, caiu, conexão, reiniciar, técnico, manutenção
- "comercial": plano, upgrade, cancelar, contratar, instalar, cobertura, preço, mudança
- "faq": horário, endereço, como funciona, fibra, canal de atendimento
- "outros": saudação (oi/olá/bom dia), despedida, reclamação, fora do escopo`],

      ['financeiro', 'Financeiro', `Você é a Maxxi, atendente financeiro da CITmax (fibra em Natal/RN).
[REGRAS]
[ESTILO]

DADOS DO CONTEXTO:
- O CPF e telefone do cliente estão nos colchetes [] no final deste prompt.
- Se [CPF do cliente: XXX] está presente, VOCÊ JÁ TEM O CPF. NÃO peça novamente.
- Se [Telefone do cliente: XXX] está presente, use esse número nas tools wa_*.

FLUXO PARA BOLETO (siga EXATAMENTE esta ordem):

PASSO 1: Verificar se já tem CPF no contexto [CPF do cliente: XXX].
- Se SIM → vá direto ao PASSO 2.
- Se NÃO → peça o CPF e espere a resposta.

PASSO 2: Chame consultar_clientes com o CPF.

PASSO 3: Verifique quantos contratos tem:
- Se 1 contrato → vá ao PASSO 4 com esse contrato.
- Se múltiplos → o sistema já enviou uma lista interativa automaticamente.
  Diga APENAS: "Escolha o contrato acima 👆"
  PARE e espere o cliente responder.

PASSO 4: Chame segunda_via_boleto com cpfcnpj e contrato.
O sistema vai enviar automaticamente o boleto pelo WhatsApp.

PASSO 5: Após segunda_via_boleto retornar, diga APENAS:
"Pronto! Boleto enviado 😊 Após o pagamento, a liberação é automática em até 10 minutos."

PARA DESBLOQUEIO:
1. Chame consultar_clientes
2. Chame promessa_pagamento com o contrato
3. Informe o resultado

IMPORTANTE:
- Se o cliente já informou o CPF antes, ele está no contexto. NÃO peça de novo.
- Se alguma tool falhar, diga "Não consegui acessar agora, tente de novo em instantes."
- NUNCA invente valores. NUNCA retorne JSON.`],

      ['suporte', 'Suporte técnico', `Você é a Maxxi, suporte técnico da CITmax (fibra em Natal/RN).
[REGRAS]
[ESTILO]

DADOS DO CONTEXTO:
- Se [CPF do cliente: XXX] está presente, VOCÊ JÁ TEM O CPF. NÃO peça novamente.
- Se [Telefone do cliente: XXX] está presente, use nas tools wa_*.
- Se [Contratos do cliente: ...] está presente, você já sabe os contratos.
- Se [Contrato ativo: XXX] está presente, use esse contrato direto.

FLUXO DE SUPORTE (siga EXATAMENTE esta ordem):

PASSO 1 — IDENTIFICAR CONTRATO:
- Se já tem contrato no contexto → PASSO 2
- Se tem CPF → chame consultar_clientes → use o contrato retornado
- Se não tem nada → peça o CPF

PASSO 2 — DIAGNÓSTICO (faça SEMPRE, não pule):
- Chame verificar_conexao com o contrato
- Chame consultar_manutencao
- Analise o resultado:
  • Se há manutenção na região → informe o prazo estimado
  • Se conexão está ONLINE → "Sua conexão aparece online no sistema! O problema pode ser no Wi-Fi."
  • Se conexão está OFFLINE → siga para o PASSO 3

PASSO 3 — ORIENTAR REINÍCIO:
- Diga: "Sua conexão está *offline*. Vamos tentar resolver:
  1️⃣ Desligue o roteador da tomada
  2️⃣ Aguarde *30 segundos*
  3️⃣ Religue e espere *2 minutos*
  Me avisa se voltou?"
- PARE e espere a resposta do cliente

PASSO 4 — AVALIAR RESULTADO:
- Se cliente diz que RESOLVEU → "Que bom! 😊 Precisando é só chamar!"
- Se cliente diz que NÃO RESOLVEU → VÁ DIRETO AO PASSO 5

PASSO 5 — ABRIR CHAMADO (obrigatório se não resolveu):
- Diga: "Vou abrir um chamado para nossa equipe técnica analisar. 🔧"
- Chame criar_chamado com:
  • contrato: ID do contrato
  • ocorrenciatipo: ID adequado da lista [TIPOS_OCORRENCIA] (geralmente 200=Reparo)
  • conteudo: descrição do problema do cliente
  • contato_nome: nome do cliente (do contexto [Nome])
  • contato_telefone: telefone do cliente (do contexto [Telefone])
- Após criar_chamado retornar, informe:
  "Chamado aberto! 📋 Protocolo: *XXXXX*. Nossa equipe vai analisar e retornar em até 24h."

IMPORTANTE:
- SEMPRE chame verificar_conexao e consultar_manutencao antes de qualquer orientação
- Se o reinício não resolver, SEMPRE abra chamado
- NUNCA diga que vai "enviar algo pro WhatsApp" — você JÁ ESTÁ no WhatsApp
- Se uma tool falhar, abra chamado direto`],

      ['comercial', 'Comercial', `Você é a Maxxi, setor comercial da CITmax (fibra em Natal/RN).
[REGRAS]
[ESTILO]

RESPONSABILIDADES: planos, upgrade, cancelamento, instalação, mudança de endereço, cobertura.

PLANOS CITMAX (dados do sistema, não invente outros):
[PLANOS]

Para cancelamento: pergunte o motivo e tente resolver antes.
Para novo cliente: peça endereço, nome, CPF, celular.
Para upgrade: chame consultar_clientes primeiro para ver o plano atual.

Quando precisar abrir chamado (mudança de plano, endereço, etc.), use criar_chamado com:
- ocorrenciatipo: escolha o ID adequado da lista [TIPOS_OCORRENCIA] baseado no assunto
- contato_nome: nome do cliente (do contexto [Nome])
- contato_telefone: telefone (do contexto [Telefone])
Após criar_chamado, OBRIGATÓRIO informar o protocolo retornado ao cliente.
NUNCA invente o protocolo.`],

      ['faq', 'FAQ', `Você é a Maxxi, atendente da CITmax (fibra em Natal/RN).
[ESTILO]

INFORMAÇÕES (responda diretamente, sem tools):
- Horário: Seg-Sex 08h-18h, Sáb 08h-12h
- Cidades: Natal, Macaíba, São Gonçalo do Amarante, São Miguel do Gostoso
- Canais: WhatsApp, Instagram @citmaxinternet, Site cit.net.br
- Fibra: Conexão por cabo de vidro, sem interferência, velocidade simétrica
- Equipamento: Roteador Wi-Fi em comodato
- Instalação: Gratuita, agendamento em até 48h
- Pagamento: Boleto, PIX ou cartão

Se perguntarem algo fora disso, diga que vai transferir pro setor correto.`],

      ['outros', 'Outros/Fallback', `Você é a Maxxi, atendente virtual da CITmax (fibra em Natal/RN).
[ESTILO]

Responda de forma simpática e direta. Se o assunto for:
- Boleto/pagamento → "Posso ajudar com boleto! Qual seu CPF?"
- Internet com problema → "Vou verificar sua conexão! Qual o número do contrato?"
- Planos/contratar → "Posso te ajudar com planos! Qual sua cidade?"
- Reclamação → "Sinto muito! Vou registrar sua reclamação."
- Fora do escopo → "Sou atendente da CITmax e posso ajudar com internet, boletos e suporte."

NUNCA invente informações. Se não sabe, transfira para humano.`],
    ];
    for (const [slug, nome, conteudo] of promptsSeed) {
      await query(`INSERT INTO prompts(slug,nome,conteudo,padrao) VALUES($1,$2,$3,$3) ON CONFLICT DO NOTHING`, [slug, nome, conteudo]);
    }
  }

  // ── CIDADES ATENDIDAS ──
  await query(`
    CREATE TABLE IF NOT EXISTS cidades (
      id           SERIAL PRIMARY KEY,
      nome         TEXT NOT NULL,
      uf           TEXT DEFAULT 'RN',
      pop_id       INTEGER,
      portador_id  INTEGER,
      lat          NUMERIC(10,7),
      lng          NUMERIC(10,7),
      ativo        BOOLEAN DEFAULT true,
      ordem        INTEGER DEFAULT 0,
      criado_em    TIMESTAMPTZ DEFAULT NOW()
    )`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cidades_nome ON cidades(nome)`).catch(()=>{});

  // ── PLANOS (sgp_id é o ID do plano no ERP) ──
  await query(`
    CREATE TABLE IF NOT EXISTS planos (
      id           SERIAL PRIMARY KEY,
      sgp_id       INTEGER,
      nome         TEXT NOT NULL,
      velocidade   TEXT NOT NULL,
      unidade      TEXT DEFAULT 'Mega',
      valor        NUMERIC(10,2) DEFAULT 0,
      beneficios   JSONB DEFAULT '[]',
      destaque     BOOLEAN DEFAULT false,
      ativo        BOOLEAN DEFAULT true,
      ordem        INTEGER DEFAULT 0,
      criado_em    TIMESTAMPTZ DEFAULT NOW()
    )`);
  // Migration: adiciona sgp_id se o banco já existia sem ela
  await query(`ALTER TABLE planos ADD COLUMN IF NOT EXISTS sgp_id INTEGER`).catch(() => {});
  await query(`ALTER TABLE planos ADD COLUMN IF NOT EXISTS destaque BOOLEAN DEFAULT false`).catch(() => {});
  await query(`ALTER TABLE planos ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true`).catch(() => {});
  await query(`ALTER TABLE planos ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0`).catch(() => {});

  // ── VÍNCULO CIDADE ↔ PLANO (N:N simples — sgp_id é do plano, não do vínculo) ──
  await query(`
    CREATE TABLE IF NOT EXISTS cidade_planos (
      id           SERIAL PRIMARY KEY,
      cidade_id    INTEGER REFERENCES cidades(id) ON DELETE CASCADE,
      plano_id     INTEGER REFERENCES planos(id) ON DELETE CASCADE,
      ativo        BOOLEAN DEFAULT true,
      UNIQUE(cidade_id, plano_id)
    )`);

  // Migration: remove sgp_id de cidade_planos se banco antigo tinha essa coluna erroneamente
  await query(`ALTER TABLE cidade_planos DROP COLUMN IF EXISTS sgp_id`).catch(() => {});

  // Seed cidades + planos (só se vazio)
  const { rows: cidadesExist } = await query(`SELECT COUNT(*) as c FROM cidades`);
  if (parseInt(cidadesExist[0]?.c) === 0) {
    const cidadesSeed = [
      ['Natal', 'RN', 1, 16, -5.7945, -35.2110, 1],
      ['Macaíba', 'RN', 1, 16, -5.8589, -35.3542, 2],
      ['São Gonçalo do Amarante', 'RN', 4, 16, -5.7905, -35.3288, 3],
      ['São Miguel do Gostoso', 'RN', 3, 18, -5.1243, -35.6368, 4],
    ];
    for (const [nome, uf, pop, port, lat, lng, ordem] of cidadesSeed) {
      await query(`INSERT INTO cidades(nome,uf,pop_id,portador_id,lat,lng,ordem) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`, [nome, uf, pop, port, lat, lng, ordem]);
    }

    // Natal & Macaíba & São Gonçalo — sgp_id: Essencial=12, Avançado=13, Premium=16
    const planosSeed = [
      [12, 'Essencial', '400', 'Mega', 79.90,
        JSON.stringify(['Wi-Fi incluso','Roteador emprestado','Com fidelidade','Sem taxa de adesão','Instalação gratuita','Pós-pago']), false, 1],
      [13, 'Avançado', '600', 'Mega', 99.90,
        JSON.stringify(['Wi-Fi incluso','Roteador emprestado','Com fidelidade','Sem taxa de adesão','Instalação gratuita','Pós-pago','1 app Standard incluso']), false, 2],
      [16, 'Premium', '700', 'Mega', 129.90,
        JSON.stringify(['Wi-Fi incluso','Roteador emprestado','Com fidelidade','Sem taxa de adesão','Instalação gratuita','Pós-pago','1 app Premium + 1 Standard','Zapping TV (+45 canais)']), true, 3],
    ];
    for (const [sgp, nome, vel, uni, valor, benef, dest, ordem] of planosSeed) {
      await query(`INSERT INTO planos(sgp_id,nome,velocidade,unidade,valor,beneficios,destaque,ordem) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT DO NOTHING`, [sgp, nome, vel, uni, valor, benef, dest, ordem]);
    }

    // São Miguel do Gostoso — sgp_id: Essencial=30, Avançado=29, Premium=28
    const planosSMG = [
      [30, 'Essencial SMG', '200', 'Mega', 69.90,
        JSON.stringify(['Wi-Fi incluso','Roteador emprestado','Com fidelidade','Sem taxa de adesão','Instalação gratuita','Pós-pago']), false, 4],
      [29, 'Avançado SMG', '350', 'Mega', 99.90,
        JSON.stringify(['Wi-Fi incluso','Roteador emprestado','Com fidelidade','Sem taxa de adesão','Instalação gratuita','Pós-pago','1 app Standard incluso']), false, 5],
      [28, 'Premium SMG', '500', 'Mega', 119.90,
        JSON.stringify(['Wi-Fi incluso','Roteador emprestado','Com fidelidade','Sem taxa de adesão','Instalação gratuita','Pós-pago','1 app Premium + 1 Standard','Zapping TV (+45 canais)']), true, 6],
    ];
    for (const [sgp, nome, vel, uni, valor, benef, dest, ordem] of planosSMG) {
      await query(`INSERT INTO planos(sgp_id,nome,velocidade,unidade,valor,beneficios,destaque,ordem) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT DO NOTHING`, [sgp, nome, vel, uni, valor, benef, dest, ordem]);
    }

    // Vínculos cidade ↔ plano (simples, sem sgp_id — ele é do plano)
    const { rows: cids } = await query(`SELECT id,nome FROM cidades ORDER BY id`);
    const { rows: pids } = await query(`SELECT id,nome FROM planos ORDER BY id`);
    const vinculos = [
      { cidade: 'Natal', planos: ['Essencial', 'Avançado', 'Premium'] },
      { cidade: 'Macaíba', planos: ['Essencial', 'Avançado', 'Premium'] },
      { cidade: 'São Gonçalo do Amarante', planos: ['Essencial', 'Avançado', 'Premium'] },
      { cidade: 'São Miguel do Gostoso', planos: ['Essencial SMG', 'Avançado SMG', 'Premium SMG'] },
    ];
    for (const v of vinculos) {
      const cid = cids.find(c => c.nome === v.cidade);
      if (!cid) continue;
      for (const pNome of v.planos) {
        const pid = pids.find(p => p.nome === pNome);
        if (pid) await query(`INSERT INTO cidade_planos(cidade_id,plano_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [cid.id, pid.id]);
      }
    }
  }


  // ── COBERTURA — zonas geográficas (GeoJSON polígonos) ──
  await query(`
    CREATE TABLE IF NOT EXISTS zonas_cobertura (
      id          SERIAL PRIMARY KEY,
      nome        TEXT NOT NULL,
      cidade_id   INTEGER REFERENCES cidades(id) ON DELETE SET NULL,
      geojson     JSONB NOT NULL DEFAULT '{"type":"FeatureCollection","features":[]}',
      cor         TEXT DEFAULT '#00c896',
      tipo        TEXT DEFAULT 'cobertura',
      descricao   TEXT DEFAULT '',
      ativo       BOOLEAN DEFAULT true,
      criado_em   TIMESTAMPTZ DEFAULT NOW(),
      atualizado  TIMESTAMPTZ DEFAULT NOW()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS zona_planos (
      zona_id   INTEGER REFERENCES zonas_cobertura(id) ON DELETE CASCADE,
      plano_id  INTEGER REFERENCES planos(id) ON DELETE CASCADE,
      PRIMARY KEY(zona_id, plano_id)
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS consultas_cobertura (
      id          SERIAL PRIMARY KEY,
      telefone    TEXT,
      lat         NUMERIC(10,7),
      lng         NUMERIC(10,7),
      endereco    TEXT,
      cep         TEXT,
      zona_id     INTEGER REFERENCES zonas_cobertura(id) ON DELETE SET NULL,
      resultado   TEXT DEFAULT 'sem_cobertura',
      criado_em   TIMESTAMPTZ DEFAULT NOW()
    )`);

  await query(`CREATE INDEX IF NOT EXISTS idx_zonas_ativo ON zonas_cobertura(ativo)`).catch(()=>{});
  await query(`CREATE INDEX IF NOT EXISTS idx_consultas_tel ON consultas_cobertura(telefone)`).catch(()=>{});
  await query(`CREATE INDEX IF NOT EXISTS idx_consultas_ts ON consultas_cobertura(criado_em DESC)`).catch(()=>{});

  // Migrations para bancos antigos
  await query(`ALTER TABLE zonas_cobertura ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'cobertura'`).catch(()=>{});
  await query(`ALTER TABLE zonas_cobertura ADD COLUMN IF NOT EXISTS descricao TEXT DEFAULT ''`).catch(()=>{});
  await query(`ALTER TABLE zonas_cobertura ADD COLUMN IF NOT EXISTS atualizado TIMESTAMPTZ DEFAULT NOW()`).catch(()=>{});


  // ── SEED: 58 zonas de cobertura CITmax (citmax.com.br/cobertura/mapa.geojson) ──
  try {
    const { rows: _zc } = await query(`SELECT COUNT(*) as n FROM zonas_cobertura`);
    if (parseInt(_zc[0]?.n) === 0) {
      const _zonas = [
    { n: "Regomoleiro — Mar Bela", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.2903964,-5.7831503],[-35.2901604,-5.7838975],[-35.2907612,-5.7842604],[-35.2916624,-5.7845806],[-35.2907827,-5.7867155],[-35.2872851,-5.7850076],[-35.2884867,-5.7821683],[-35.2903964,-5.7831503]]]},\"properties\":{\"name\":\"Regomoleiro — Mar Bela\"}}]}" },
    { n: "Regomoleiro — Novo Horizonte", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.2874996,-5.7852211],[-35.2903321,-5.7896615],[-35.2895596,-5.7902379],[-35.2896883,-5.7906436],[-35.2883579,-5.7910919],[-35.2873494,-5.7891492],[-35.2883365,-5.7887009],[-35.2863838,-5.7856694],[-35.2874996,-5.7852211]]]},\"properties\":{\"name\":\"Regomoleiro — Novo Horizonte\"}}]}" },
    { n: "Regomoleiro — Barreiros / Regomoleiro 3", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.2874233,-5.7958938],[-35.2869727,-5.7960432],[-35.2868439,-5.7952747],[-35.2869941,-5.794314],[-35.2869941,-5.7931399],[-35.286801,-5.7923927],[-35.2867795,-5.7914534],[-35.2869083,-5.7900658],[-35.2866904,-5.7904955],[-35.2863866,-5.7904287],[-35.2859239,-5.7903914],[-35.2851971,-5.7903273],[-35.2847357,-5.7902739],[-35.2845747,-5.7898722],[-35.2843549,-5.7890384],[-35.2827697,-5.785222],[-35.2821501,-5.7853338],[-35.2814258,-5.7834224],[-35.283282,-5.7835119],[-35.2838077,-5.7845005],[-35.2847625,-5.7840375],[-35.2854465,-5.7851623],[-35.2857751,-5.784804],[-35.2858784,-5.7843177],[-35.285934,-5.784692],[-35.2857858,-5.7850342],[-35.2855806,-5.7853451],[-35.2861466,-5.7866394],[-35.2871068,-5.7880484],[-35.2873857,-5.7886888],[-35.2874447,-5.7892972],[-35.287316,-5.7904927],[-35.2872731,-5.7917309],[-35.2872731,-5.7926275],[-35.2874233,-5.7934601],[-35.2873374,-5.7944208],[-35.2873374,-5.7951039],[-35.2874233,-5.7958938]]]},\"properties\":{\"name\":\"Regomoleiro — Barreiros / Regomoleiro 3\"}}]}" },
    { n: "Regomoleiro — Serv Club", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.2934236,-5.7872983],[-35.2934182,-5.7873623],[-35.2933592,-5.7874158],[-35.2934343,-5.7888674],[-35.2935764,-5.7934465],[-35.2931178,-5.7934999],[-35.2929434,-5.790175],[-35.2928241,-5.7873116],[-35.2925116,-5.7871916],[-35.2919322,-5.7870155],[-35.2924151,-5.7870155],[-35.2927021,-5.7866205],[-35.2930802,-5.7866952],[-35.2931714,-5.7872209],[-35.2934236,-5.7872983]]]},\"properties\":{\"name\":\"Regomoleiro — Serv Club\"}}]}" },
    { n: "Regomoleiro — Noemia Silva", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.2956122,-5.789177],[-35.2957302,-5.7917174],[-35.2953547,-5.7917494],[-35.2952153,-5.789177],[-35.2956122,-5.789177]]]},\"properties\":{\"name\":\"Regomoleiro — Noemia Silva\"}}]}" },
    { n: "Regomoleiro — Particular Sr. Munyr", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.29558,-5.794466],[-35.2957088,-5.795875],[-35.2940995,-5.7958536],[-35.2939922,-5.7945087],[-35.29558,-5.794466]]]},\"properties\":{\"name\":\"Regomoleiro — Particular Sr. Munyr\"}}]}" },
    { n: "Novo Santo Antonio", c: "Macaiba", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3005153,-5.7817371],[-35.3007728,-5.7888034],[-35.3005582,-5.7918348],[-35.2990562,-5.7917281],[-35.2991849,-5.7935],[-35.2982837,-5.7934573],[-35.2982837,-5.7911517],[-35.2975756,-5.7909809],[-35.297361,-5.7883978],[-35.2972752,-5.7843843],[-35.2986056,-5.7843629],[-35.2985841,-5.782527],[-35.2986056,-5.7818011],[-35.3005153,-5.7817371]]]},\"properties\":{\"name\":\"Novo Santo Antonio\"}}]}" },
    { n: "Florida Park", c: "Macaiba", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3028274,-5.7891236],[-35.3029186,-5.7899348],[-35.3026182,-5.7943752],[-35.3018671,-5.7943325],[-35.301953,-5.7924966],[-35.3012878,-5.7924326],[-35.3014165,-5.7889742],[-35.3028274,-5.7891236]]]},\"properties\":{\"name\":\"Florida Park\"}}]}" },
    { n: "Novo Santo Antonio — Por tras do Kacua", c: "Macaiba", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3049892,-5.7829006],[-35.3051581,-5.7852141],[-35.3051287,-5.787405],[-35.3052521,-5.789289],[-35.3014165,-5.7888888],[-35.3012449,-5.7825484],[-35.3024975,-5.7826844],[-35.3025109,-5.7814329],[-35.3048095,-5.7813341],[-35.3049892,-5.7829006]]]},\"properties\":{\"name\":\"Novo Santo Antonio — Por tras do Kacua\"}}]}" },
    { n: "Novo Santo Antonio — Recanto dos Passaros", c: "Macaiba", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3023285,-5.7768376],[-35.3024143,-5.7785988],[-35.3018671,-5.7786095],[-35.3018779,-5.7781558],[-35.3013522,-5.7781718],[-35.3012985,-5.7768642],[-35.3023285,-5.7768376]]]},\"properties\":{\"name\":\"Novo Santo Antonio — Recanto dos Passaros\"}}]}" },
    { n: "Novo Santo Antonio — Condominio Prosperar", c: "Macaiba", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.302189,-5.7735125],[-35.3022641,-5.7750603],[-35.3010196,-5.7750603],[-35.3009552,-5.7735339],[-35.302189,-5.7735125]]]},\"properties\":{\"name\":\"Novo Santo Antonio — Condominio Prosperar\"}}]}" },
    { n: "Novo Santo Antonio — Parque Amarante", c: "Macaiba", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.304833,-5.7717473],[-35.3049618,-5.7758677],[-35.3050261,-5.7790059],[-35.3036743,-5.7790059],[-35.3034812,-5.7722597],[-35.304833,-5.7717473]]]},\"properties\":{\"name\":\"Novo Santo Antonio — Parque Amarante\"}}]}" },
    { n: "Santo Antonio do Potengi", c: "Macaiba", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3118635,-5.7895288],[-35.3109463,-5.7907029],[-35.309809,-5.7917063],[-35.3098305,-5.79224],[-35.3092082,-5.7923681],[-35.3089722,-5.7922186],[-35.3088005,-5.7922613],[-35.309294,-5.7935422],[-35.3089722,-5.7936276],[-35.3084786,-5.7924321],[-35.307041,-5.7919411],[-35.3066977,-5.7917917],[-35.3066762,-5.7910872],[-35.3054746,-5.7909164],[-35.3054746,-5.7895288],[-35.3058393,-5.7873726],[-35.3057079,-5.7867749],[-35.3057414,-5.7861691],[-35.3055309,-5.7861264],[-35.3055135,-5.7859703],[-35.3052634,-5.7858895],[-35.3053244,-5.7856647],[-35.3055658,-5.7857768],[-35.3056033,-5.7859423],[-35.3064294,-5.7861771],[-35.3063114,-5.7866147],[-35.307395,-5.7866788],[-35.3074058,-5.7873192],[-35.3085323,-5.7872125],[-35.3091331,-5.7874366],[-35.3099485,-5.7875007],[-35.3106566,-5.7877249],[-35.3109892,-5.7890911],[-35.3110227,-5.7892299],[-35.3111313,-5.7892726],[-35.3118635,-5.7895288]]]},\"properties\":{\"name\":\"Santo Antonio do Potengi\"}}]}" },
    { n: "Cidade Jardim", c: "Macaiba", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3028397,-5.7670088],[-35.3036015,-5.766411],[-35.3056722,-5.7689835],[-35.3033225,-5.7707235],[-35.3022604,-5.7693144],[-35.3025822,-5.7690156],[-35.3019385,-5.7681509],[-35.3015845,-5.7684178],[-35.3015308,-5.7682577],[-35.3018098,-5.7680122],[-35.3016596,-5.767756],[-35.3027324,-5.7668807],[-35.3028397,-5.7670088]]]},\"properties\":{\"name\":\"Cidade Jardim\"}}]}" },
    { n: "Santo Antonio do Potengi — Bromelias", c: "Macaiba", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3084242,-5.7729712],[-35.3083598,-5.7752021],[-35.3090572,-5.7752021],[-35.309068,-5.775565],[-35.3075445,-5.7755117],[-35.3075015,-5.7729285],[-35.3084242,-5.7729712]]]},\"properties\":{\"name\":\"Santo Antonio do Potengi — Bromelias\"}}]}" },
    { n: "Santos Dumont", c: "Macaiba", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3118547,-5.7748895],[-35.313507,-5.7866739],[-35.3111252,-5.7866952],[-35.3103956,-5.7860975],[-35.3102454,-5.7852008],[-35.3101971,-5.7805095],[-35.311549,-5.7804881],[-35.3114739,-5.7802693],[-35.3112217,-5.7798744],[-35.31046,-5.778903],[-35.3101488,-5.7782306],[-35.3100952,-5.7748895],[-35.3118547,-5.7748895]]]},\"properties\":{\"name\":\"Santos Dumont\"}}]}" },
    { n: "Luiza Queiroz", c: "Macaiba", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3142161,-5.7706289],[-35.3144307,-5.7740447],[-35.3127999,-5.7742582],[-35.3123278,-5.7702659],[-35.3142161,-5.7706289]]]},\"properties\":{\"name\":\"Luiza Queiroz\"}}]}" },
    { n: "Centro Sao Goncalo", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3341866,-5.7902573],[-35.3344441,-5.7910365],[-35.334605,-5.7925629],[-35.3349161,-5.7949432],[-35.3343153,-5.7949646],[-35.3341973,-5.7953381],[-35.3336609,-5.795146],[-35.3330064,-5.794655],[-35.3321481,-5.7943988],[-35.3311932,-5.7942174],[-35.330174,-5.7943988],[-35.3299487,-5.7947191],[-35.3291011,-5.7948044],[-35.3290367,-5.7951033],[-35.3281248,-5.79505],[-35.3280926,-5.7935129],[-35.3279102,-5.7908657],[-35.3285754,-5.7908337],[-35.3285754,-5.7905882],[-35.330528,-5.7904174],[-35.3317726,-5.7907056],[-35.3322339,-5.7906843],[-35.3322983,-5.7910792],[-35.3341866,-5.7902573]]]},\"properties\":{\"name\":\"Centro Sao Goncalo\"}}]}" },
    { n: "Parque dos Ipes", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.2939159,-5.7798071],[-35.2938958,-5.7798671],[-35.2938113,-5.7798311],[-35.293755,-5.7799859],[-35.2934881,-5.7798845],[-35.2935323,-5.7797404],[-35.2931488,-5.7796056],[-35.2931904,-5.7795189],[-35.2932185,-5.7795389],[-35.293295,-5.7793214],[-35.293649,-5.7794455],[-35.2935632,-5.7796657],[-35.2939159,-5.7798071]]]},\"properties\":{\"name\":\"Parque dos Ipes\"}}]}" },
    { n: "Centro Sao Goncalo — Zona 2", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3349554,-5.795538],[-35.3346766,-5.7930683],[-35.3344567,-5.7910722],[-35.3341866,-5.7902573],[-35.3322983,-5.7910792],[-35.3322339,-5.7906843],[-35.3317726,-5.7907056],[-35.330528,-5.7904174],[-35.3285754,-5.7905882],[-35.3279602,-5.7902223],[-35.3272735,-5.7895819],[-35.3268444,-5.7875965],[-35.3262221,-5.7829639],[-35.3271448,-5.7815122],[-35.3293979,-5.7820032],[-35.3296983,-5.7800818],[-35.3329169,-5.7805515],[-35.3331315,-5.778374],[-35.3384101,-5.7790998],[-35.3385817,-5.7799538],[-35.3380668,-5.7816403],[-35.3376376,-5.783647],[-35.3371655,-5.7861662],[-35.3368222,-5.788792],[-35.3370797,-5.789347],[-35.3378093,-5.7927628],[-35.3387105,-5.7925706],[-35.3397834,-5.7926774],[-35.3400409,-5.7931257],[-35.3379809,-5.793638],[-35.3385388,-5.7963065],[-35.3375947,-5.7962211],[-35.3362858,-5.7957088],[-35.3349554,-5.795538]]]},\"properties\":{\"name\":\"Centro Sao Goncalo — Zona 2\"}}]}" },
    { n: "Ferreiro Torto Fibra — Zona 1", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.333842,-5.865654],[-35.334059,-5.865159],[-35.334912,-5.865453],[-35.335149,-5.865341],[-35.335666,-5.860543],[-35.335927,-5.860194],[-35.337739,-5.860558],[-35.338279,-5.861707],[-35.338615,-5.861662],[-35.339732,-5.864889],[-35.335126,-5.866255],[-35.333842,-5.865654]]]},\"properties\":{\"name\":\"Ferreiro Torto Fibra — Zona 1\"}}]}" },
    { n: "Ferreiro Torto Fibra — Zona 2", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.335189,-5.857233],[-35.334201,-5.859851],[-35.332793,-5.85928],[-35.333942,-5.855967],[-35.336128,-5.856974],[-35.336534,-5.857276],[-35.3364,-5.857646],[-35.335189,-5.857233]]]},\"properties\":{\"name\":\"Ferreiro Torto Fibra — Zona 2\"}}]}" },
    { n: "Vilar — Fibra", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.344529,-5.868142],[-35.346582,-5.86427],[-35.348806,-5.864539],[-35.351393,-5.864904],[-35.351333,-5.865334],[-35.353269,-5.865615],[-35.354843,-5.869361],[-35.356359,-5.870663],[-35.349778,-5.874036],[-35.346487,-5.874208],[-35.346263,-5.876355],[-35.34943,-5.87496],[-35.350828,-5.877377],[-35.348345,-5.878754],[-35.347028,-5.877068],[-35.346153,-5.87741],[-35.345286,-5.879551],[-35.343832,-5.878833],[-35.343866,-5.878366],[-35.342828,-5.877752],[-35.343064,-5.874011],[-35.34304,-5.872866],[-35.34516,-5.868381],[-35.344529,-5.868142]]]},\"properties\":{\"name\":\"Vilar — Fibra\"}}]}" },
    { n: "Vilar", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.345139,-5.868381],[-35.3444,-5.870067],[-35.344063,-5.870641],[-35.343331,-5.872277],[-35.343018,-5.872866],[-35.343042,-5.874011],[-35.341709,-5.873396],[-35.341783,-5.873192],[-35.341932,-5.87191],[-35.342105,-5.870073],[-35.343557,-5.867636],[-35.345305,-5.864655],[-35.346375,-5.864808],[-35.344529,-5.868142],[-35.345139,-5.868381]]]},\"properties\":{\"name\":\"Vilar\"}}]}" },
    { n: "Auta de Souza", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.342452,-5.858606],[-35.34245,-5.858599],[-35.342505,-5.858571],[-35.34261,-5.858573],[-35.342791,-5.858571],[-35.342981,-5.858616],[-35.34322,-5.858634],[-35.343386,-5.858585],[-35.343614,-5.8586],[-35.343858,-5.858618],[-35.344064,-5.858697],[-35.344493,-5.858821],[-35.344811,-5.858826],[-35.345205,-5.858863],[-35.345654,-5.859015],[-35.346159,-5.859131],[-35.346111,-5.859332],[-35.346258,-5.860162],[-35.346409,-5.861175],[-35.346609,-5.860954],[-35.347164,-5.86129],[-35.347823,-5.861478],[-35.346295,-5.864182],[-35.345658,-5.863992],[-35.345313,-5.86392],[-35.344341,-5.863593],[-35.343606,-5.863184],[-35.342943,-5.862641],[-35.342662,-5.862371],[-35.341338,-5.861272],[-35.340083,-5.860017],[-35.340174,-5.859583],[-35.341935,-5.859975],[-35.342406,-5.858627],[-35.342425,-5.858601],[-35.342452,-5.858606]]]},\"properties\":{\"name\":\"Auta de Souza\"}}]}" },
    { n: "Tavares de Lira", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.348739,-5.859604],[-35.349058,-5.859671],[-35.349634,-5.859739],[-35.349772,-5.860134],[-35.349804,-5.860488],[-35.349722,-5.860599],[-35.350843,-5.862307],[-35.351182,-5.863034],[-35.351393,-5.864904],[-35.346295,-5.864182],[-35.348523,-5.860133],[-35.348596,-5.859966],[-35.34864,-5.859852],[-35.348739,-5.859604]]]},\"properties\":{\"name\":\"Tavares de Lira\"}}]}" },
    { n: "Park Vilagem", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.357897,-5.839858],[-35.358337,-5.839812],[-35.358644,-5.840094],[-35.360913,-5.841144],[-35.364476,-5.843992],[-35.365141,-5.845302],[-35.365154,-5.845884],[-35.366026,-5.846894],[-35.366898,-5.847178],[-35.367812,-5.847077],[-35.370741,-5.845565],[-35.373337,-5.846171],[-35.373312,-5.84742],[-35.371743,-5.84854],[-35.371501,-5.850184],[-35.371085,-5.851589],[-35.375218,-5.851095],[-35.375928,-5.851316],[-35.376273,-5.852007],[-35.366749,-5.853404],[-35.362279,-5.854055],[-35.362586,-5.856377],[-35.361975,-5.856513],[-35.361857,-5.857055],[-35.360749,-5.857782],[-35.361976,-5.859415],[-35.361295,-5.862727],[-35.360121,-5.864437],[-35.356898,-5.862017],[-35.355823,-5.860455],[-35.354534,-5.859514],[-35.353,-5.859353],[-35.352028,-5.858386],[-35.352502,-5.857731],[-35.352163,-5.856762],[-35.352854,-5.853697],[-35.353039,-5.852919],[-35.352716,-5.852142],[-35.352336,-5.85059],[-35.351488,-5.849757],[-35.349816,-5.848059],[-35.350398,-5.846413],[-35.350241,-5.845517],[-35.350632,-5.845115],[-35.35075,-5.844618],[-35.351156,-5.842844],[-35.350821,-5.840983],[-35.351478,-5.840252],[-35.352349,-5.839644],[-35.354024,-5.839144],[-35.356381,-5.839407],[-35.357624,-5.83941],[-35.357897,-5.839858]]]},\"properties\":{\"name\":\"Park Vilagem\"}}]}" },
    { n: "Mangabeira 2 — Zona A", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.316841,-5.851854],[-35.317825,-5.852433],[-35.31729,-5.853756],[-35.316787,-5.853539],[-35.314595,-5.856862],[-35.314571,-5.856885],[-35.312327,-5.855867],[-35.313075,-5.853795],[-35.31473,-5.849426],[-35.316841,-5.851854]]]},\"properties\":{\"name\":\"Mangabeira 2 — Zona A\"}}]}" },
    { n: "Riacho do Sangue", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3792169,-5.9196223],[-35.3797149,-5.9198263],[-35.3801069,-5.9199913],[-35.3804619,-5.9202563],[-35.3805249,-5.9206993],[-35.3801979,-5.9212223],[-35.3795439,-5.9215803],[-35.3791339,-5.9212033],[-35.3792699,-5.9201313],[-35.3778969,-5.9203603],[-35.3774949,-5.9205603],[-35.3770999,-5.9207883],[-35.3766989,-5.9209573],[-35.3763729,-5.9214853],[-35.3759659,-5.9218693],[-35.3754059,-5.9218693],[-35.3749209,-5.9222983],[-35.373538,-5.9224556],[-35.3724984,-5.9232318],[-35.3708483,-5.923525],[-35.3644582,-5.9243249],[-35.3642197,-5.9229678],[-35.365109,-5.9228656],[-35.3654249,-5.9237642],[-35.3682329,-5.9232531],[-35.3681241,-5.9224747],[-35.3693679,-5.9221495],[-35.3700756,-5.9229686],[-35.3707997,-5.9227999],[-35.3706655,-5.9223751],[-35.3732939,-5.9205863],[-35.3792169,-5.9196223]]]},\"properties\":{\"name\":\"Riacho do Sangue\"}}]}" },
    { n: "Pajucara", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.32788,-5.835068],[-35.327903,-5.835223],[-35.328013,-5.835334],[-35.327151,-5.83753],[-35.327112,-5.837616],[-35.326653,-5.839065],[-35.325917,-5.841567],[-35.324766,-5.841815],[-35.323111,-5.840226],[-35.324316,-5.838575],[-35.325356,-5.83721],[-35.32656,-5.835493],[-35.326959,-5.83446],[-35.327109,-5.834527],[-35.327548,-5.83464],[-35.327696,-5.834744],[-35.32788,-5.835068]]]},\"properties\":{\"name\":\"Pajucara\"}}]}" },
    { n: "Uruacu — Zona 1", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.317718,-5.827577],[-35.317258,-5.827239],[-35.31723,-5.826507],[-35.315754,-5.826634],[-35.315739,-5.825262],[-35.317034,-5.82477],[-35.31645,-5.823379],[-35.316083,-5.8236],[-35.315649,-5.824261],[-35.314681,-5.82457],[-35.314431,-5.824446],[-35.315668,-5.821951],[-35.315317,-5.820778],[-35.313834,-5.821514],[-35.313232,-5.8187],[-35.314312,-5.819007],[-35.315586,-5.819072],[-35.318744,-5.824971],[-35.318553,-5.827549],[-35.317718,-5.827577]]]},\"properties\":{\"name\":\"Uruacu — Zona 1\"}}]}" },
    { n: "IPE", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.352303,-5.850643],[-35.352577,-5.851598],[-35.352849,-5.852555],[-35.352985,-5.852997],[-35.35272,-5.854277],[-35.352467,-5.855294],[-35.352175,-5.856423],[-35.351387,-5.857372],[-35.350415,-5.857275],[-35.349877,-5.85646],[-35.349653,-5.855857],[-35.348924,-5.853856],[-35.348443,-5.852983],[-35.349088,-5.852591],[-35.349246,-5.851448],[-35.349641,-5.851448],[-35.350109,-5.85043],[-35.350556,-5.850404],[-35.351467,-5.849736],[-35.352303,-5.850643]]]},\"properties\":{\"name\":\"IPE\"}}]}" },
    { n: "Centro — Sao Goncalo", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.352126,-5.856672],[-35.352442,-5.857636],[-35.352007,-5.858365],[-35.352978,-5.859332],[-35.354513,-5.859493],[-35.355726,-5.860413],[-35.356877,-5.861996],[-35.353902,-5.864143],[-35.354362,-5.865368],[-35.353297,-5.865679],[-35.351333,-5.865334],[-35.351173,-5.863409],[-35.349722,-5.860599],[-35.349648,-5.859634],[-35.349058,-5.859666],[-35.348339,-5.859429],[-35.347889,-5.858915],[-35.346848,-5.856636],[-35.347346,-5.856556],[-35.34773,-5.857147],[-35.348562,-5.856896],[-35.349766,-5.856773],[-35.350415,-5.85727],[-35.351381,-5.857328],[-35.352126,-5.856672]]]},\"properties\":{\"name\":\"Centro — Sao Goncalo\"}}]}" },
    { n: "Fibra Aquarela", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.344407,-5.842148],[-35.345727,-5.84281],[-35.346735,-5.84329],[-35.347449,-5.843669],[-35.348068,-5.844419],[-35.34737,-5.845264],[-35.346665,-5.846198],[-35.344868,-5.847304],[-35.343763,-5.846418],[-35.343334,-5.846738],[-35.342969,-5.846492],[-35.343989,-5.845532],[-35.342293,-5.843939],[-35.341113,-5.844779],[-35.33842,-5.842397],[-35.339547,-5.841295],[-35.341746,-5.839075],[-35.342977,-5.840558],[-35.344407,-5.842148]]]},\"properties\":{\"name\":\"Fibra Aquarela\"}}]}" },
    { n: "Fibra Sao Jose", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.349088,-5.852591],[-35.347369,-5.853969],[-35.34454,-5.853498],[-35.343811,-5.850681],[-35.342169,-5.849208],[-35.343113,-5.84845],[-35.343789,-5.847991],[-35.346665,-5.846198],[-35.347449,-5.843669],[-35.348667,-5.840351],[-35.349192,-5.83662],[-35.349758,-5.836007],[-35.351081,-5.842616],[-35.350377,-5.846392],[-35.349794,-5.848038],[-35.351357,-5.850026],[-35.350109,-5.85043],[-35.349246,-5.851448],[-35.349088,-5.852591]]]},\"properties\":{\"name\":\"Fibra Sao Jose\"}}]}" },
    { n: "Fibra Lamarao", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.344452,-5.9248453],[-35.3433571,-5.9267013],[-35.3381427,-5.9238201],[-35.3368232,-5.9220167],[-35.3353051,-5.9214565],[-35.333315,-5.920128],[-35.336019,-5.916713],[-35.3373816,-5.9143546],[-35.339345,-5.915155],[-35.342306,-5.915368],[-35.345331,-5.917482],[-35.3462592,-5.9184957],[-35.3476165,-5.9193387],[-35.345825,-5.921921],[-35.344452,-5.9248453]]]},\"properties\":{\"name\":\"Fibra Lamarao\"}}]}" },
    { n: "Fibra — Zona Norte Natal", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.31496,-5.888179],[-35.314574,-5.874305],[-35.32321,-5.871061],[-35.322644,-5.86979],[-35.323666,-5.869204],[-35.326697,-5.86803],[-35.331547,-5.86709],[-35.332813,-5.868062],[-35.334937,-5.867795],[-35.333757,-5.871445],[-35.33322,-5.872939],[-35.333113,-5.873409],[-35.33719,-5.874262],[-35.335559,-5.876952],[-35.333757,-5.878275],[-35.330136,-5.882283],[-35.32648,-5.887317],[-35.323511,-5.884924],[-35.32232,-5.880901],[-35.322556,-5.87755],[-35.322341,-5.872021],[-35.317621,-5.874262],[-35.317664,-5.887411],[-35.31496,-5.888179]]]},\"properties\":{\"name\":\"Fibra — Zona Norte Natal\"}}]}" },
    { n: "Fibra — Pajucara", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.331898,-5.837367],[-35.331426,-5.837965],[-35.328572,-5.835713],[-35.32788,-5.835068],[-35.327231,-5.834571],[-35.32648,-5.833994],[-35.325332,-5.833172],[-35.324474,-5.832415],[-35.324967,-5.83187],[-35.326587,-5.83297],[-35.328132,-5.832639],[-35.328454,-5.83425],[-35.329355,-5.835606],[-35.331898,-5.837367]]]},\"properties\":{\"name\":\"Fibra — Pajucara\"}}]}" },
    { n: "Fibra — Sao Goncalo Centro", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.343858,-5.858618],[-35.343386,-5.858585],[-35.34322,-5.858634],[-35.342791,-5.858571],[-35.342393,-5.858606],[-35.341598,-5.85895],[-35.340094,-5.858754],[-35.340028,-5.858],[-35.339488,-5.857832],[-35.33929,-5.857587],[-35.33936,-5.856742],[-35.339848,-5.855946],[-35.340352,-5.856106],[-35.340883,-5.856213],[-35.341699,-5.856357],[-35.342074,-5.856277],[-35.342605,-5.856181],[-35.343029,-5.856309],[-35.343308,-5.856571],[-35.34393,-5.856976],[-35.344912,-5.856973],[-35.345991,-5.856358],[-35.346848,-5.856636],[-35.347417,-5.857856],[-35.347889,-5.858915],[-35.348523,-5.860133],[-35.347797,-5.859338],[-35.346159,-5.859131],[-35.345654,-5.859015],[-35.344811,-5.858826],[-35.343858,-5.858618]]]},\"properties\":{\"name\":\"Fibra — Sao Goncalo Centro\"}}]}" },
    { n: "Fibra — Regomoleiro Litoral", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.285367,-5.883507],[-35.285303,-5.881714],[-35.295697,-5.878753],[-35.300254,-5.869558],[-35.302244,-5.870167],[-35.299224,-5.878032],[-35.301504,-5.876463],[-35.304958,-5.8688],[-35.305645,-5.867925],[-35.308477,-5.869206],[-35.305344,-5.875546],[-35.318241,-5.871234],[-35.319249,-5.872621],[-35.314574,-5.874305],[-35.297684,-5.879772],[-35.299787,-5.88689],[-35.2956884,-5.8880594],[-35.2949051,-5.8891413],[-35.2906885,-5.8880033],[-35.2848734,-5.88599],[-35.285367,-5.883507]]]},\"properties\":{\"name\":\"Fibra — Regomoleiro Litoral\"}}]}" },
    { n: "Fibra — Mangabeira Litoral", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.318629,-5.856458],[-35.324176,-5.857995],[-35.323371,-5.86077],[-35.317556,-5.858976],[-35.318629,-5.856458]]]},\"properties\":{\"name\":\"Fibra — Mangabeira Litoral\"}}]}" },
    { n: "Augusto Severo", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.364361,-5.874281],[-35.361829,-5.873086],[-35.360606,-5.871698],[-35.360949,-5.87014],[-35.360649,-5.868987],[-35.36022,-5.868262],[-35.359297,-5.868133],[-35.358739,-5.868197],[-35.358439,-5.867685],[-35.358246,-5.866148],[-35.361507,-5.866618],[-35.362945,-5.867066],[-35.363846,-5.867152],[-35.363288,-5.867963],[-35.363181,-5.868752],[-35.364018,-5.870012],[-35.365863,-5.872146],[-35.365284,-5.872573],[-35.364361,-5.874281]]]},\"properties\":{\"name\":\"Augusto Severo\"}}]}" },
    { n: "Tapara", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.402427,-5.848897],[-35.402105,-5.8492],[-35.401804,-5.850694],[-35.398393,-5.8511],[-35.398629,-5.84841],[-35.406826,-5.847151],[-35.407405,-5.845827],[-35.408692,-5.845945],[-35.415248,-5.8464565],[-35.4146122,-5.8494476],[-35.4135473,-5.8501761],[-35.4131769,-5.8527429],[-35.4128391,-5.8509313],[-35.4141375,-5.8488238],[-35.4142583,-5.8470108],[-35.4098944,-5.8473324],[-35.409368,-5.85269],[-35.408489,-5.85333],[-35.40807,-5.849904],[-35.404862,-5.849915],[-35.404562,-5.850683],[-35.402684,-5.850865],[-35.402427,-5.848897]]]},\"properties\":{\"name\":\"Tapara\"}}]}" },
    { n: "Liberdade", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3789726,-5.8432249],[-35.379788,-5.8432463],[-35.3798095,-5.8438226],[-35.3844658,-5.8431822],[-35.3852382,-5.8430328],[-35.3883925,-5.8437586],[-35.3896585,-5.8443563],[-35.3887788,-5.8501837],[-35.3857103,-5.8507601],[-35.3842941,-5.8518701],[-35.3824917,-5.853407],[-35.3822985,-5.8514432],[-35.3797451,-5.8519981],[-35.3793803,-5.8445271],[-35.3789726,-5.8432249]]]},\"properties\":{\"name\":\"Liberdade\"}}]}" },
    { n: "Novo Alecrim", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.311567,-5.873341],[-35.311739,-5.871228],[-35.310258,-5.870737],[-35.313155,-5.864013],[-35.315236,-5.865294],[-35.314185,-5.868218],[-35.317318,-5.868923],[-35.316567,-5.870737],[-35.315923,-5.87095],[-35.31543,-5.872188],[-35.311567,-5.873341]]]},\"properties\":{\"name\":\"Novo Alecrim\"}}]}" },
    { n: "Uruacu — Zona 2", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.314178,-5.821375],[-35.314312,-5.823296],[-35.313872,-5.823697],[-35.31237,-5.823734],[-35.312177,-5.823024],[-35.313153,-5.822784],[-35.313561,-5.821706],[-35.314178,-5.821375]]]},\"properties\":{\"name\":\"Uruacu — Zona 2\"}}]}" },
    { n: "Uruacu — Zona 3", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.323466,-5.817504],[-35.324088,-5.817669],[-35.32403,-5.818646],[-35.323595,-5.820599],[-35.322308,-5.820567],[-35.323466,-5.817504]]]},\"properties\":{\"name\":\"Uruacu — Zona 3\"}}]}" },
    { n: "Uruacu — Zona 4", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.316972,-5.813967],[-35.317069,-5.815269],[-35.317488,-5.817852],[-35.315717,-5.81925],[-35.315586,-5.819072],[-35.314312,-5.819007],[-35.313232,-5.8187],[-35.311705,-5.819464],[-35.311576,-5.818204],[-35.313099,-5.818034],[-35.315288,-5.81877],[-35.316468,-5.817873],[-35.316071,-5.81402],[-35.316972,-5.813967]]]},\"properties\":{\"name\":\"Uruacu — Zona 4\"}}]}" },
    { n: "Sao Jose 2", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.343419,-5.840858],[-35.339042,-5.835693],[-35.340844,-5.834497],[-35.341874,-5.835863],[-35.345093,-5.833772],[-35.34844,-5.837059],[-35.343419,-5.840858]]]},\"properties\":{\"name\":\"Sao Jose 2\"}}]}" },
    { n: "Pe do Galo 2", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3396,-5.868181],[-35.339943,-5.87277],[-35.33696,-5.871895],[-35.335802,-5.87403],[-35.333113,-5.873409],[-35.334364,-5.870059],[-35.337776,-5.868096],[-35.3396,-5.868181]]]},\"properties\":{\"name\":\"Pe do Galo 2\"}}]}" },
    { n: "Ferreiro Torto 2", c: "Sao Goncalo do Amarante", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.335201,-5.852727],[-35.332197,-5.860817],[-35.327884,-5.860945],[-35.327262,-5.862823],[-35.325652,-5.862396],[-35.326897,-5.857252],[-35.324601,-5.856633],[-35.324176,-5.857995],[-35.32282,-5.857615],[-35.323378,-5.855929],[-35.324064,-5.85595],[-35.325631,-5.852727],[-35.327412,-5.853282],[-35.328399,-5.851062],[-35.330008,-5.8523],[-35.329879,-5.854178],[-35.332111,-5.854477],[-35.332948,-5.852471],[-35.334064,-5.852257],[-35.335201,-5.852727]]]},\"properties\":{\"name\":\"Ferreiro Torto 2\"}}]}" },
    { n: "Mangabeira 2 — Zona B", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.321275,-5.85325],[-35.320159,-5.856793],[-35.317713,-5.856068],[-35.318657,-5.853634],[-35.317825,-5.852433],[-35.314194,-5.849536],[-35.312477,-5.848682],[-35.31076,-5.850646],[-35.310203,-5.850219],[-35.310975,-5.848212],[-35.310275,-5.847325],[-35.3081,-5.847444],[-35.304967,-5.846932],[-35.304237,-5.848255],[-35.305911,-5.849023],[-35.304774,-5.851638],[-35.302843,-5.850891],[-35.302199,-5.850443],[-35.302843,-5.848372],[-35.30089,-5.847561],[-35.302435,-5.84468],[-35.305503,-5.846152],[-35.309344,-5.84675],[-35.311404,-5.846942],[-35.31282,-5.846964],[-35.314537,-5.848522],[-35.316425,-5.850592],[-35.31812,-5.851873],[-35.320073,-5.852834],[-35.321146,-5.852791],[-35.321275,-5.85325]]]},\"properties\":{\"name\":\"Mangabeira 2 — Zona B\"}}]}" },
    { n: "Mangabeira 3", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.30927,-5.849675],[-35.307821,-5.8523],[-35.306533,-5.855224],[-35.305546,-5.857658],[-35.30443,-5.86007],[-35.302628,-5.859131],[-35.305208,-5.85358],[-35.306371,-5.8534],[-35.30822,-5.849285],[-35.30927,-5.849675]]]},\"properties\":{\"name\":\"Mangabeira 3\"}}]}" },
    { n: "Arvoredo", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3805557,-5.8420858],[-35.3797296,-5.8424487],[-35.3799871,-5.8417549],[-35.3789893,-5.8419471],[-35.3771976,-5.8357353],[-35.3806845,-5.8360982],[-35.3802768,-5.8398872],[-35.3805557,-5.8404955],[-35.3805986,-5.8410078],[-35.3803841,-5.841328],[-35.3805557,-5.8420858]]]},\"properties\":{\"name\":\"Arvoredo\"}}]}" },
    { n: "Rio da Prata", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.3890704,-5.8432463],[-35.388255,-5.8430755],[-35.3883408,-5.8418375],[-35.3864525,-5.8418375],[-35.3851221,-5.8418375],[-35.3834055,-5.8407275],[-35.3819893,-5.8422217],[-35.3808735,-5.8426059],[-35.3807877,-5.8417521],[-35.3822039,-5.8409409],[-35.3829335,-5.8398736],[-35.3819035,-5.8396175],[-35.3821181,-5.8359459],[-35.382161,-5.8345797],[-35.3842638,-5.8338966],[-35.3858088,-5.832872],[-35.3862809,-5.8318046],[-35.3878687,-5.8316339],[-35.3889845,-5.831762],[-35.390787,-5.8304385],[-35.3918598,-5.8277915],[-35.3930186,-5.8283038],[-35.3915165,-5.8307373],[-35.3904436,-5.8325731],[-35.3899287,-5.8338112],[-35.3903578,-5.8358605],[-35.3905295,-5.8374828],[-35.3894137,-5.8387636],[-35.3886412,-5.8394467],[-35.3884266,-5.8410263],[-35.3898428,-5.8414105],[-35.3890704,-5.8432463]]]},\"properties\":{\"name\":\"Rio da Prata\"}}]}" },
    { n: "Mangabeira", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.308586,-5.847347],[-35.310275,-5.847325],[-35.30927,-5.849675],[-35.30822,-5.849285],[-35.307683,-5.850626],[-35.306371,-5.8534],[-35.305208,-5.85358],[-35.308586,-5.847347]]]},\"properties\":{\"name\":\"Mangabeira\"}}]}" },
    { n: "Paraiso", c: "Natal", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.6894903,-5.2280573],[-35.6882243,-5.2295745],[-35.6868295,-5.2303438],[-35.6848339,-5.2259846],[-35.6852095,-5.2243713],[-35.6862931,-5.2237516],[-35.6876664,-5.2246384],[-35.6894903,-5.2280573]]]},\"properties\":{\"name\":\"Paraiso\"}}]}" },
    { n: "Cobertura SMG", c: "Sao Miguel do Gostoso", g: "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[-35.644,-5.119102],[-35.644829,-5.121009],[-35.642938,-5.122446],[-35.641171,-5.123449],[-35.641618,-5.12545],[-35.638946,-5.125554],[-35.639755,-5.127303],[-35.638237,-5.128131],[-35.637345,-5.128749],[-35.637387,-5.129699],[-35.636152,-5.129732],[-35.63501,-5.129808],[-35.63454,-5.13017],[-35.634499,-5.129075],[-35.634576,-5.127992],[-35.634687,-5.127207],[-35.634521,-5.126034],[-35.635706,-5.12562],[-35.635529,-5.124399],[-35.63516,-5.123318],[-35.634592,-5.12336],[-35.633885,-5.123644],[-35.632453,-5.123896],[-35.63096,-5.124159],[-35.629381,-5.124274],[-35.629422,-5.123935],[-35.631103,-5.123713],[-35.632625,-5.123472],[-35.633701,-5.123266],[-35.634176,-5.123121],[-35.633738,-5.121502],[-35.634605,-5.121381],[-35.635545,-5.121179],[-35.636497,-5.121033],[-35.637244,-5.120835],[-35.637789,-5.120895],[-35.638336,-5.120647],[-35.638952,-5.12046],[-35.639756,-5.120381],[-35.640433,-5.120466],[-35.644,-5.119102]]]},\"properties\":{\"name\":\"Cobertura SMG\"}}]}" }
      ];
      const { rows: _cids } = await query(`SELECT id,nome FROM cidades WHERE ativo=true`);
      const _cidMap = {};
      for (const r of _cids) _cidMap[r.nome.toLowerCase().replace(/[^a-z]/g,'')] = r.id;
      const _findCid = (cidade) => {
        const k = cidade.toLowerCase().replace(/[^a-z]/g,'');
        // Tenta match exato ou parcial
        return _cidMap[k] || Object.entries(_cidMap).find(([mk]) => mk.includes(k.slice(0,6)))?.[1] || null;
      };
      for (const z of _zonas) {
        await query(
          `INSERT INTO zonas_cobertura(nome,cidade_id,geojson,cor,tipo,descricao,ativo) VALUES($1,$2,$3::jsonb,$4,$5,$6,true) ON CONFLICT DO NOTHING`,
          [z.n, _findCid(z.c), z.g, '#00c896', 'cobertura', 'CITmax — citmax.com.br/cobertura/mapa.geojson']
        );
      }
      console.log(`✅ 58 zonas de cobertura CITmax inseridas`);
    }
  } catch(e) { console.warn('⚠️ Seed zonas cobertura:', e.message); }

  // ── network_hosts / network_checks ──────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS network_hosts (
    id          SERIAL PRIMARY KEY,
    nome        TEXT NOT NULL,
    host        TEXT NOT NULL,
    tipo        TEXT NOT NULL DEFAULT 'ping',
    porta       INTEGER,
    grupo       TEXT DEFAULT 'Geral',
    descricao   TEXT,
    ativo       BOOLEAN DEFAULT true,
    criado_em   TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS network_checks (
    id          SERIAL PRIMARY KEY,
    host_id     INTEGER REFERENCES network_hosts(id) ON DELETE CASCADE,
    status      TEXT NOT NULL,
    latencia_ms INTEGER,
    erro        TEXT,
    checado_em  TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE INDEX IF NOT EXISTS idx_network_checks_host_ts ON network_checks(host_id, checado_em DESC)`);

  // ── Gateway SMS log ──────────────────────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS gateway_sms_log (
    id          SERIAL PRIMARY KEY,
    recipient   TEXT,
    numero      TEXT,
    body        TEXT,
    channel     TEXT,
    campaign    TEXT,
    status      TEXT DEFAULT 'enviado',
    erro        TEXT,
    na_janela   BOOLEAN,
    criado_em   TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sms_log_ts ON gateway_sms_log(criado_em DESC)`);

  // ── TR-069 / ACS ─────────────────────────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS acs_devices (
    id              SERIAL PRIMARY KEY,
    serial          TEXT NOT NULL UNIQUE,
    manufacturer    TEXT,
    oui             TEXT,
    product_class   TEXT,
    model           TEXT,
    firmware        TEXT,
    hardware_ver    TEXT,
    ip              TEXT,
    uptime_seg      INTEGER,
    wan_status      TEXT,
    ip_wan          TEXT,
    pppoe_user      TEXT,
    wan_uptime      INTEGER,
    ssid_24         TEXT,
    wifi_pass_24    TEXT,
    channel_24      TEXT,
    wifi_status_24  TEXT,
    clients_24      INTEGER,
    ssid_5          TEXT,
    wifi_pass_5     TEXT,
    channel_5       TEXT,
    wifi_status_5   TEXT,
    sinal_rx        FLOAT,
    sinal_tx        FLOAT,
    qualidade_sinal TEXT DEFAULT 'desconhecido',
    params_json     JSONB DEFAULT '{}',
    ultimo_inform   TIMESTAMPTZ DEFAULT NOW(),
    atualizado      TIMESTAMPTZ DEFAULT NOW(),
    criado_em       TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_acs_devices_serial ON acs_devices(serial)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_acs_devices_ip     ON acs_devices(ip)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_acs_devices_inform ON acs_devices(ultimo_inform DESC)`);

  await query(`CREATE TABLE IF NOT EXISTS acs_params (
    id          SERIAL PRIMARY KEY,
    device_id   INTEGER REFERENCES acs_devices(id) ON DELETE CASCADE,
    nome        TEXT NOT NULL,
    valor       TEXT,
    atualizado  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_id, nome)
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_acs_params_device ON acs_params(device_id)`);

  await query(`CREATE TABLE IF NOT EXISTS acs_events (
    id          SERIAL PRIMARY KEY,
    device_id   INTEGER REFERENCES acs_devices(id) ON DELETE CASCADE,
    evento      TEXT NOT NULL,
    ip          TEXT,
    criado_em   TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_acs_events_device ON acs_events(device_id, criado_em DESC)`);

  await query(`CREATE TABLE IF NOT EXISTS acs_comandos (
    id           SERIAL PRIMARY KEY,
    device_id    INTEGER REFERENCES acs_devices(id) ON DELETE CASCADE,
    tipo         TEXT NOT NULL,
    parametros   JSONB DEFAULT '{}',
    status       TEXT DEFAULT 'pendente',
    solicitante  TEXT DEFAULT 'admin',
    criado_em    TIMESTAMPTZ DEFAULT NOW(),
    executado_em TIMESTAMPTZ
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_acs_cmds_device_status ON acs_comandos(device_id, status, criado_em ASC)`);

  await query(`CREATE TABLE IF NOT EXISTS acs_auditoria (
    id          SERIAL PRIMARY KEY,
    device_id   INTEGER REFERENCES acs_devices(id) ON DELETE CASCADE,
    acao        TEXT NOT NULL,
    resultado   TEXT,
    detalhes    JSONB DEFAULT '{}',
    criado_em   TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_acs_audit_device ON acs_auditoria(device_id, criado_em DESC)`);

  // ── TR-069 / Gerenciador CPE ─────────────────────────────────────────────────
  await query(`CREATE TABLE IF NOT EXISTS cpe_acoes (
    id          SERIAL PRIMARY KEY,
    id_servico  TEXT NOT NULL,
    acao        TEXT NOT NULL,
    agente_id   TEXT DEFAULT 'maxxi',
    resultado   JSONB DEFAULT '{}',
    criado_em   TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_cpe_acoes_servico ON cpe_acoes(id_servico)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_cpe_acoes_ts      ON cpe_acoes(criado_em DESC)`);

  console.log("✅ Migrações concluídas");
}
