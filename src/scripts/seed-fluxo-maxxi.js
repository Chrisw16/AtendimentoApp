/**
 * seed-fluxo-maxxi.js
 * Fluxo padrão CITmax — v2 com nós unificados
 * - Botões roteiam direto (sem nó Condição para cada botão)
 * - consultar_cliente com pergunta embutida (sem Aguardar resposta antes)
 * - enviar_lista roteia direto por item (sem cadeia de condições)
 */
import { query, initDB } from "../services/db.js";

const FLUXO_ID = "fluxo_citmax_principal";

const FLUXO = {
  nodes: [

    // ── GATILHO ──────────────────────────────────────────────────────────────
    {
      id: "inicio", tipo: "inicio",
      posX: 60, posY: 300,
    },

    // ── SAUDAÇÃO com botões — roteia direto por id do botão ──────────────────
    {
      id: "saudacao", tipo: "enviar_botoes",
      config: {
        corpo: "{{saudacao}}\nSou a Maxxi, atendente virtual da CITmax! 😊\n\n📋 Protocolo: *{{protocolo}}*\n\nVocê já é cliente CITmax?",
        botoes: [
          { id: "sou_cliente", label: "✅ Sou cliente" },
          { id: "quero_ser",   label: "🆕 Quero contratar" },
        ],
      },
      posX: 260, posY: 220,
    },

    // ── CONSULTAR CLIENTE — pergunta CPF embutida, sem Aguardar antes ─────────
    {
      id: "consultar_sgp", tipo: "consultar_cliente",
      config: {
        pergunta: "Perfeito! Qual o seu *CPF* ou *CNPJ*? 📝",
        cpf: "{{cliente.cpf}}",
      },
      posX: 520, posY: 120,
    },

    // CPF não encontrado — volta p/ consultar (que vai perguntar de novo)
    {
      id: "cpf_nao_encontrado", tipo: "enviar_texto",
      config: { texto: "Não encontrei esse CPF/CNPJ no sistema. 😔\nVerifique e tente novamente." },
      posX: 760, posY: 0,
    },

    // ── MENU PRINCIPAL — cada item já roteia direto pelo seu id ──────────────
    {
      id: "menu_cliente", tipo: "enviar_lista",
      config: {
        corpo: "Encontrei! 👋 Olá, *{{cliente.nome}}*!\n\nContrato *#{{cliente.contrato}}* — {{cliente.status}}\n\nComo posso te ajudar?",
        label_botao: "Ver opções",
        titulo_secao: "O que precisa?",
        itens: "boleto|2ª via de boleto\npagamento|Informar pagamento\nmeus_dados|Meus dados\ncomercial|Mudar de plano\nsuporte_tec|Suporte técnico\natendente|Falar com atendente\nencerrar|Encerrar atendimento",
      },
      posX: 760, posY: 140,
    },

    // ── BOLETO ────────────────────────────────────────────────────────────────
    {
      id: "gerar_boleto", tipo: "consultar_boleto",
      config: { contrato: "{{cliente.contrato}}" },
      posX: 1040, posY: 40,
    },
    {
      id: "enviar_boleto", tipo: "enviar_texto",
      config: { texto: "📄 *Boleto CITmax*\n\n👤 *{{cliente.nome}}*\n💰 Valor: *R$ {{boleto.valor}}*\n📅 Vencimento: {{boleto.vencimento}}\n\n🔗 {{boleto.link}}\n\n💠 PIX copia e cola:\n{{boleto.pix}}" },
      posX: 1300, posY: 40,
    },

    // ── SUPORTE TÉCNICO ───────────────────────────────────────────────────────
    {
      id: "verificar_conexao", tipo: "verificar_conexao",
      config: { contrato: "{{cliente.contrato}}" },
      posX: 1040, posY: 160,
    },
    {
      id: "verificar_manutencao", tipo: "verificar_manutencao",
      config: { cpf: "{{cliente.cpf}}" },
      posX: 1300, posY: 160,
    },
    {
      id: "ia_suporte", tipo: "ia_responde",
      config: {
        contexto: "suporte",
        prompt: "Cliente reportou problema de internet. Já verificamos a conexão e manutenção. Ajude com suporte técnico ou abra um chamado se necessário.",
        max_turns: 6,
      },
      posX: 1560, posY: 160,
    },

    // ── MEUS DADOS ────────────────────────────────────────────────────────────
    {
      id: "mostrar_dados", tipo: "enviar_texto",
      config: { texto: "📋 *Seus dados CITmax*\n\n👤 *{{cliente.nome}}*\nCPF: {{cliente.cpf}}\n📄 Contrato: *#{{cliente.contrato}}*\n📡 Plano: *{{cliente.plano}}*\n🔌 Status: {{cliente.status}}" },
      posX: 1040, posY: 280,
    },

    // ── TRANSFERIR PARA ATENDENTE ─────────────────────────────────────────────
    {
      id: "transferir", tipo: "transferir_agente",
      config: { motivo: "Cliente solicitou atendimento humano\nCliente: {{cliente.nome}}\nCPF: {{cliente.cpf}}\nContrato: #{{cliente.contrato}}\nProtocolo: {{protocolo}}" },
      posX: 1040, posY: 380,
    },

    // ── IA GERAL (pagamento, comercial, outros) ───────────────────────────────
    {
      id: "ia_geral", tipo: "ia_responde",
      config: {
        contexto: "geral",
        prompt: "Atenda o cliente com base no contexto disponível. Para pagamentos use promessa_pagamento. Para mudança de plano, oriente sobre os planos disponíveis.",
        max_turns: 8,
      },
      posX: 1040, posY: 480,
    },

    // ── ENCERRAR CLIENTE ─────────────────────────────────────────────────────
    {
      id: "encerrar_cliente", tipo: "encerrar",
      config: { mensagem: "Fico feliz em ter ajudado! 😊\nQualquer coisa é só chamar.\n\n📋 Protocolo: *{{protocolo}}*" },
      posX: 1560, posY: 480,
    },

    // ── FLUXO COMERCIAL (novo cliente) ───────────────────────────────────────
    {
      id: "pedir_cep", tipo: "aguardar_resposta",
      config: {
        mensagem: "Que legal que quer contratar CITmax! 😊\n\nPara verificar cobertura na sua região:\n\n📍 Envie sua *localização* pelo WhatsApp\nou\n✍️ Digite seu *CEP* (ex: 59064-625)",
        variavel: "cliente.cep",
      },
      posX: 520, posY: 420,
    },
    {
      id: "ia_comercial", tipo: "ia_responde",
      config: {
        contexto: "comercial",
        prompt: "Novo cliente interessado em contratar CITmax. Verifique cobertura pelo CEP/localização informado, mostre os planos disponíveis e colete os dados para cadastro: nome, CPF, data de nascimento, celular, email, endereço completo, vencimento desejado.",
        max_turns: 20,
      },
      posX: 760, posY: 420,
    },
    {
      id: "encerrar_comercial", tipo: "encerrar",
      config: { mensagem: "Cadastro realizado! 🎉\nEm breve nossa equipe técnica entrará em contato para agendar a instalação.\n\n📱 Baixe nosso app: https://cit.net.br/app\n\n📋 Protocolo: *{{protocolo}}*" },
      posX: 1040, posY: 580,
    },
  ],

  edges: [
    // Início → Saudação
    { from: "inicio", to: "saudacao" },

    // Saudação roteia direto pelo id do botão clicado
    { from: "saudacao", port: "sou_cliente", to: "consultar_sgp" },
    { from: "saudacao", port: "quero_ser",   to: "pedir_cep" },

    // Consultar cliente → encontrado ou não
    { from: "consultar_sgp", port: "encontrado",     to: "menu_cliente" },
    { from: "consultar_sgp", port: "nao_encontrado", to: "cpf_nao_encontrado" },

    // Não encontrado → volta p/ consultar (perguntará de novo automaticamente)
    { from: "cpf_nao_encontrado", to: "consultar_sgp" },

    // Menu roteia direto pelo id do item da lista
    { from: "menu_cliente", port: "boleto",      to: "gerar_boleto" },
    { from: "menu_cliente", port: "suporte_tec", to: "verificar_conexao" },
    { from: "menu_cliente", port: "atendente",   to: "transferir" },
    { from: "menu_cliente", port: "meus_dados",  to: "mostrar_dados" },
    { from: "menu_cliente", port: "pagamento",   to: "ia_geral" },
    { from: "menu_cliente", port: "comercial",   to: "ia_geral" },
    { from: "menu_cliente", port: "encerrar",    to: "encerrar_cliente" },

    // Boleto
    { from: "gerar_boleto", port: "encontrado",     to: "enviar_boleto" },
    { from: "gerar_boleto", port: "nao_encontrado", to: "ia_geral" },
    { from: "enviar_boleto", to: "encerrar_cliente" },

    // Suporte
    { from: "verificar_conexao",    port: "online",  to: "verificar_manutencao" },
    { from: "verificar_conexao",    port: "offline", to: "verificar_manutencao" },
    { from: "verificar_manutencao", port: "sim",     to: "ia_suporte" },
    { from: "verificar_manutencao", port: "nao",     to: "ia_suporte" },
    { from: "ia_suporte", port: "resolvido",  to: "encerrar_cliente" },
    { from: "ia_suporte", port: "transferir", to: "transferir" },

    // Meus dados
    { from: "mostrar_dados", to: "encerrar_cliente" },

    // IA geral
    { from: "ia_geral", port: "resolvido",  to: "encerrar_cliente" },
    { from: "ia_geral", port: "transferir", to: "transferir" },

    // Comercial
    { from: "pedir_cep",    to: "ia_comercial" },
    { from: "ia_comercial", port: "resolvido",  to: "encerrar_comercial" },
    { from: "ia_comercial", port: "transferir", to: "transferir" },
  ],
};

async function main() {
  console.log("🚀 Atualizando fluxo padrão CITmax (nós unificados)...");

  await initDB();

  const existe = await query(`SELECT id FROM fluxos WHERE id = $1`, [FLUXO_ID]);

  if (existe.rows.length > 0) {
    await query(
      `UPDATE fluxos SET nome=$2, descricao=$3, dados=$4, versao=versao+1, atualizado=NOW() WHERE id=$1`,
      [FLUXO_ID, "Atendimento CITmax — Principal", "Fluxo completo de atendimento WhatsApp", JSON.stringify(FLUXO)]
    );
    console.log("✅ Fluxo atualizado com nós unificados!");
  } else {
    await query(
      `INSERT INTO fluxos(id, nome, descricao, dados, ativo, publicado, versao)
       VALUES($1, $2, $3, $4, true, true, 1)`,
      [FLUXO_ID, "Atendimento CITmax — Principal", "Fluxo completo de atendimento WhatsApp", JSON.stringify(FLUXO)]
    );
    console.log("✅ Fluxo inserido e publicado!");
  }

  process.exit(0);
}

main().catch(e => { console.error("❌ Erro:", e.message); process.exit(1); });
