import * as erp from "../services/erp.js";
import * as chatwoot from "../services/chatwoot.js";
import { salvarMemoria as dbSalvarMemoria, registrarHistorico } from "../services/memoria.js";
import { waSendButtons, waSendList, waSendPix, waSendTemplate, waSendText } from "../services/whatsapp.js";

// ─── DEFINIÇÃO DAS FERRAMENTAS (igual ao workflow n8n Secretária v2) ──────────

export const tools = [
  {
    name: "verificar_cobertura",
    description: "Verifica se um endereço, CEP ou coordenada GPS tem cobertura de internet CITmax. Use SEMPRE antes de iniciar qualquer cadastro comercial. Aceita: lat+lng (GPS), cep, ou endereco (texto livre).",
    input_schema: {
      type: "object",
      properties: {
        lat:      { type: "number", description: "Latitude (se GPS disponível)" },
        lng:      { type: "number", description: "Longitude (se GPS disponível)" },
        cep:      { type: "string", description: "CEP do cliente (8 dígitos)" },
        endereco: { type: "string", description: "Endereço completo em texto livre" },
      }
    }
  },
  // SGP — Clientes
  {
    name: "consultar_clientes",
    description: "Ponto de partida para identificar qualquer cliente. Use sempre antes de qualquer outra ação. Parâmetro: CPF ou CNPJ.",
    input_schema: {
      type: "object",
      properties: {
        cpfcnpj: { type: "string", description: "CPF ou CNPJ do cliente (com ou sem formatação)" }
      },
      required: ["cpfcnpj"]
    }
  },
  {
    name: "segunda_via_boleto",
    description: "Emitir 2ª via de boleto/fatura. Execute sempre quando o cliente solicitar boletos ou fatura.",
    input_schema: {
      type: "object",
      properties: {
        cpfcnpj: { type: "string", description: "CPF ou CNPJ do cliente" },
        contrato: { type: "string", description: "ID do contrato retornado pelo consultar_clientes" }
      },
      required: ["cpfcnpj", "contrato"]
    }
  },
  {
    name: "promessa_pagamento",
    description: "Libera o acesso de clientes com status suspenso ou reduzido. Só pode ser usado 1x por mês. Use quando o cliente informar que já pagou ou que vai pagar em breve.",
    input_schema: {
      type: "object",
      properties: {
        contrato: { type: "string", description: "ID do contrato do cliente" }
      },
      required: ["contrato"]
    }
  },
  {
    name: "listar_vencimentos",
    description: "Listar dias de vencimento disponíveis para novos cadastros ou troca de vencimento.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "criar_chamado",
    description: "Abrir chamado técnico ou de suporte. Use SEMPRE que o cliente precisar de ocorrência/ticket/protocolo. O protocolo retornado DEVE ser informado ao cliente. Tipos: 200=Reparo, 3=MudançaSenhaWifi, 14=RelocaçãoRoteador, 13=MudançaEndereço, 23=MudançaPlano, 22=ProblemaFatura, 5=Outros.",
    input_schema: {
      type: "object",
      properties: {
        contrato: { type: "string", description: "ID do contrato" },
        ocorrenciatipo: {
          type: "integer",
          description: "Tipo: 200=Reparo, 3=MudSenha, 14=RelocRoteador, 13=MudEndereco, 23=MudPlano, 22=ProbFatura, 40=AtivStreaming, 4=NovoPonto, 206=MudTitular, 5=Outros"
        },
        conteudo: { type: "string", description: "Descrição detalhada do problema/solicitação do cliente" },
        contato_nome: { type: "string", description: "Nome do cliente para contato" },
        contato_telefone: { type: "string", description: "Telefone do cliente para contato" }
      },
      required: ["contrato", "ocorrenciatipo", "conteudo"]
    }
  },
  {
    name: "extrato_trafego",
    description: "Consultar consumo/tráfego do cliente no mês atual.",
    input_schema: {
      type: "object",
      properties: {
        cpfcnpj: { type: "string", description: "CPF ou CNPJ do cliente" },
        senha: { type: "string", description: "contratoCentralSenha obtido no consultar_clientes" },
        contrato: { type: "string", description: "ID do contrato" }
      },
      required: ["cpfcnpj", "senha", "contrato"]
    }
  },
  {
    name: "verificar_conexao",
    description: "Verificar se o cliente está online/offline, status do acesso. Use sempre durante suporte técnico.",
    input_schema: {
      type: "object",
      properties: {
        contrato: { type: "string", description: "ID do contrato" }
      },
      required: ["contrato"]
    }
  },
  {
    name: "cancelar_contrato",
    description: "Registrar solicitação de cancelamento de contrato. Execute somente quando o cliente confirmar explicitamente que deseja cancelar.",
    input_schema: {
      type: "object",
      properties: {
        contrato: { type: "string", description: "ID do contrato a cancelar" }
      },
      required: ["contrato"]
    }
  },
  {
    name: "consultar_radius",
    description: "Consultar autenticação PPPoE e sessão ativa do cliente via Radius. Use durante suporte técnico para diagnosticar problemas de conexão.",
    input_schema: {
      type: "object",
      properties: {
        cpfcnpj: { type: "string", description: "CPF ou CNPJ do cliente" }
      },
      required: ["cpfcnpj"]
    }
  },
  {
    name: "historico_ocorrencias",
    description: "Consultar chamados e ocorrências anteriores do contrato. Use para evitar abrir chamados duplicados.",
    input_schema: {
      type: "object",
      properties: {
        contrato: { type: "string", description: "ID do contrato" }
      },
      required: ["contrato"]
    }
  },
  {
    name: "consultar_manutencao",
    description: "Verificar se há manutenção ou rompimento ativo na rede CITmax. Consulte sempre durante suporte técnico.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "verificar_cobertura",
    description: "Verificar se um endereço tem cobertura CITmax. Use em fluxos de venda para confirmar atendimento.",
    input_schema: {
      type: "object",
      properties: {
        lat: { type: "number", description: "Latitude do endereço" },
        lon: { type: "number", description: "Longitude do endereço" }
      },
      required: ["lat", "lon"]
    }
  },
  {
    name: "cadastrar_cliente",
    description: "Cadastrar novo cliente no ERP. Use somente após coletar TODOS os dados obrigatórios. Planos - Natal/Macaíba/SGA: Essencial=12, Avançado=13, Premium=16. SMG: Essencial=30, Avançado=29, Premium=28.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome completo" },
        cpf: { type: "string", description: "CPF do cliente" },
        datanasc: { type: "string", description: "Data de nascimento no formato AAAA-MM-DD" },
        email: { type: "string" },
        celular: { type: "string", description: "Telefone com DDD, ex: 84988776644" },
        logradouro: { type: "string" },
        numero: { type: "string" },
        complemento: { type: "string" },
        bairro: { type: "string" },
        cidade: { type: "string" },
        pontoreferencia: { type: "string" },
        plano_id: { type: "integer", description: "ID do plano escolhido" },
        vencimento_id: { type: "integer", description: "ID do vencimento obtido via listar_vencimentos" },
        pop_id: { type: "integer", description: "ID do POP: Macaíba=1, São Miguel=3, São Gonçalo=4" },
        portador_id: { type: "integer", description: "ID portador: Macaíba/SGA=16, São Miguel=18" }
      },
      required: ["nome", "cpf", "datanasc", "email", "celular", "logradouro", "numero", "bairro", "cidade", "plano_id", "vencimento_id", "pop_id", "portador_id"]
    }
  },

  // Monitoramento
  {
    name: "ping_macaiba",
    description: "Monitorar status do POP de Macaíba e São Gonçalo do Amarante. Status: 2=Online, 8=PareceOffline, 9=Offline.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "ping_smg",
    description: "Monitorar status do POP de São Miguel do Gostoso. Status: 2=Online, 8=PareceOffline, 9=Offline.",
    input_schema: { type: "object", properties: {} }
  },

  // APIs Externas
  {
    name: "consultar_clima",
    description: "Consultar clima atual da cidade do cliente. Cidades: Natal(-5.874,-35.226), Macaíba(-5.852,-35.355), SGA(-5.794,-35.327), SMG(-5.123,-35.635). weathercode 0-67=bom, 80-99=chuva.",
    input_schema: {
      type: "object",
      properties: {
        lat: { type: "number", description: "Latitude da cidade" },
        lon: { type: "number", description: "Longitude da cidade" }
      },
      required: ["lat", "lon"]
    }
  },
  {
    name: "consultar_feriados",
    description: "Consultar feriados nacionais do ano atual via BrasilAPI.",
    input_schema: {
      type: "object",
      properties: {
        ano: { type: "integer", description: "Ano para consulta (ex: 2026)" }
      },
      required: ["ano"]
    }
  },
  {
    name: "localizar_endereco",
    description: "Converter coordenadas GPS (lat/lon) em endereço completo via OpenStreetMap. Use quando o cliente enviar localização.",
    input_schema: {
      type: "object",
      properties: {
        lat: { type: "number", description: "Latitude" },
        lon: { type: "number", description: "Longitude" }
      },
      required: ["lat", "lon"]
    }
  },
  {
    name: "localizar_cep",
    description: "Buscar CEP a partir de UF, cidade e logradouro via ViaCEP. Use para completar o endereço durante cadastro.",
    input_schema: {
      type: "object",
      properties: {
        uf: { type: "string", description: "Sigla do estado (ex: RN)" },
        cidade: { type: "string", description: "Nome da cidade" },
        logradouro: { type: "string", description: "Nome da rua/avenida" }
      },
      required: ["uf", "cidade", "logradouro"]
    }
  },
  {
    name: "consultar_cep",
    description: "Buscar endereço completo a partir de um CEP informado pelo cliente.",
    input_schema: {
      type: "object",
      properties: {
        cep: { type: "string", description: "CEP com ou sem formatação" }
      },
      required: ["cep"]
    }
  },

  // Controle
  {
    name: "enviar_mensagem",
    description: "Envia uma mensagem adicional na conversa. Use para enviar múltiplas mensagens separadas — por exemplo, PIX em uma mensagem e linha digitável em outra, facilitando a cópia pelo cliente.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Texto da mensagem a enviar" }
      },
      required: ["texto"]
    }
  },
  {
    name: "reagir_mensagem",
    description: "Reage a uma mensagem do cliente com um emoji. Use para demonstrar empatia, confirmar recebimento ou reagir ao humor da conversa. NUNCA use múltiplas vezes seguidas.",
    input_schema: {
      type: "object",
      properties: {
        emoji: { type: "string", description: "O emoji da reação. Ex: 👍 ❤️ 😊 😂 🙏 ✅" }
      },
      required: ["emoji"]
    }
  },
  {
    name: "salvar_memoria",
    description: "Salva informações do cliente na memória persistente para uso em atendimentos futuros. Use após identificar o cliente (CPF/CNPJ), confirmar contrato, ou perceber preferências.",
    input_schema: {
      type: "object",
      properties: {
        nome:         { type: "string", description: "Nome do cliente" },
        cpfcnpj:      { type: "string", description: "CPF ou CNPJ confirmado" },
        contrato_id:  { type: "string", description: "ID do contrato mais usado pelo cliente" },
        contrato_end: { type: "string", description: "Endereço do contrato principal" },
        datanasc:     { type: "string", description: "Data de nascimento do cliente (formato AAAA-MM-DD) — salvar após identificação para validação futura" },
        anotacao:     { type: "string", description: "Observação importante sobre o cliente (ex: cliente VIP, problema recorrente, etc)" }
      }
    }
  },
  {
    name: "encerrar_atendimento",
    description: "Encerra a conversa quando o cliente confirmou que foi atendido e não precisa de mais ajuda. Use APENAS quando o cliente despedir explicitamente (tchau, obrigado, era só isso, pode fechar, etc.) E o problema já foi resolvido. NUNCA encerre no meio de um atendimento.",
    input_schema: {
      type: "object",
      properties: {
        mensagem_final: {
          type: "string",
          description: "Mensagem de despedida curta e simpática para o cliente"
        }
      },
      required: ["mensagem_final"]
    }
  },
  {
    name: "transferir_para_humano",
    description: "Transferir o atendimento para um agente humano. Use quando: cliente pedir, problema complexo, cancelamento, negociação de débitos ou reclamação grave.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Motivo da transferência" }
      },
      required: ["motivo"]
    }
  },


  // ── Status da rede CITmax ──────────────────────────────────────────────────
  {
    name: "status_rede",
    description: "Consulta o status atual da rede CITmax: POPs, OLTs, servidores e links upstream. Use quando o cliente reportar problemas de conexão para verificar se há instabilidade na infraestrutura antes de abrir chamado.",
    input_schema: {
      type: "object",
      properties: {
        grupo: { type: "string", description: "Filtrar por grupo específico (ex: 'POPs', 'OLTs'). Deixe vazio para todos." }
      }
    }
  },


  // ── WhatsApp Cloud API — mensagens interativas ─────────────────────────────
  {
    name: "wa_enviar_botoes",
    description: "Envia mensagem com botões clicáveis no WhatsApp Oficial (até 3). Use para oferecer opções rápidas ao cliente.",
    input_schema: {
      type: "object",
      properties: {
        telefone:  { type: "string", description: "Número do cliente com DDI ex: 5584999999999" },
        corpo:     { type: "string", description: "Texto principal da mensagem" },
        botoes:    { type: "array",  description: "Até 3 botões", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string", description: "Texto (máx 20 chars)" } }, required: ["id","title"] } },
        cabecalho: { type: "string", description: "Título acima (opcional)" },
        rodape:    { type: "string", description: "Texto rodapé (opcional)" },
      },
      required: ["telefone","corpo","botoes"],
    },
  },
  {
    name: "wa_enviar_lista",
    description: "Envia menu de lista no WhatsApp Oficial. Use para muitas opções (planos, serviços, etc).",
    input_schema: {
      type: "object",
      properties: {
        telefone:    { type: "string" },
        corpo:       { type: "string", description: "Texto explicativo" },
        label_botao: { type: "string", description: "Label do botão que abre lista ex: 'Ver planos'" },
        secoes:      { type: "array",  items: { type: "object", properties: { title: { type: "string" }, rows: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, description: { type: "string" } }, required: ["id","title"] } } }, required: ["rows"] } },
        cabecalho:   { type: "string" },
        rodape:      { type: "string" },
      },
      required: ["telefone","corpo","label_botao","secoes"],
    },
  },
  {
    name: "wa_enviar_pix",
    description: "Envia boleto/PIX formatado no WhatsApp com código copia e cola. Use SEMPRE que for enviar PIX pelo canal WhatsApp Oficial.",
    input_schema: {
      type: "object",
      properties: {
        telefone:        { type: "string" },
        codigo_pix:      { type: "string", description: "Código PIX copia e cola" },
        linha_digitavel: { type: "string", description: "Linha digitável do boleto" },
        valor:           { type: "string", description: "Valor ex: 99,90" },
        vencimento:      { type: "string", description: "Data de vencimento" },
        descricao:       { type: "string", description: "Descrição do boleto" },
        link_cobranca:   { type: "string", description: "URL da página de cobrança do SGP (link_cobranca) — USE SEMPRE que disponível" },
      },
      required: ["telefone"],
    },
  },
  {
    name: "wa_enviar_template",
    description: "Envia template aprovado pela Meta. Use quando cliente está fora da janela de 24h.",
    input_schema: {
      type: "object",
      properties: {
        telefone:   { type: "string" },
        template:   { type: "string", description: "Nome do template aprovado" },
        idioma:     { type: "string", description: "Código do idioma ex: pt_BR" },
        parametros: { type: "array",  description: "Variáveis do template", items: { type: "string" } },
      },
      required: ["telefone","template"],
    },
  },
  // ── ACS TR-069 (servidor próprio) ────────────────────────────────────────
  {
    name: "consultar_onu_acs",
    description: "Consulta dados da ONU/CPE direto do servidor ACS TR-069 do Maxxi: modelo, serial, firmware, IP WAN, uptime, sinal óptico Rx/Tx, Wi-Fi SSID. Use quando o cliente relatar problema de conexão. Buscar pelo número serial da ONU ou pelo CPF/contrato (que retorna o serial via consultar_clientes).",
    input_schema: {
      type: "object",
      properties: {
        serial: { type: "string", description: "Número serial da ONU (retornado por consultar_clientes no campo serial_onu ou mac_address)" },
      },
      required: ["serial"],
    },
  },
  {
    name: "reiniciar_onu_acs",
    description: "Enfileira um reboot remoto da ONU via ACS TR-069. O comando é enviado no próximo check-in do CPE (geralmente em até 1 minuto). Use após diagnosticar que a ONU está com problema e o cliente confirmou. Avise que o serviço ficará indisponível por ~2 minutos.",
    input_schema: {
      type: "object",
      properties: {
        serial: { type: "string", description: "Número serial da ONU" },
      },
      required: ["serial"],
    },
  },
];

// ─── EXECUTOR ─────────────────────────────────────────────────────────────────

export async function executeTool(name, input) {
  const toolMap = {
    consultar_clientes:     () => erp.consultarClientes(input.cpfcnpj),
    segunda_via_boleto:     () => erp.segundaViaBoleto(input.cpfcnpj, input.contrato),
    promessa_pagamento:     () => erp.promessaPagamento(input.contrato),
    listar_vencimentos:     () => erp.listarVencimentos(),
    criar_chamado:          () => erp.criarChamado(input.contrato, input.ocorrenciatipo, input.conteudo, { contato_nome: input.contato_nome, contato_telefone: input.contato_telefone, usuario: "maxxi" }),
    extrato_trafego:        () => erp.extratoTrafego(input.cpfcnpj, input.senha, input.contrato),
    verificar_conexao:      () => erp.verificarConexao(input.contrato),
    cancelar_contrato:      () => erp.cancelarContrato(input.contrato),
    consultar_radius:       () => erp.consultarRadius(input.cpfcnpj),
    historico_ocorrencias:  () => erp.historicoOcorrencias(input.contrato),
    consultar_manutencao:   () => erp.consultarManutencao(),
    verificar_cobertura:    async () => {
      const { consultarPorLocalizacao, consultarPorCEP, consultarPorEndereco } = await import("../services/cobertura.js");
      if (input.lat && input.lng) return consultarPorLocalizacao(input.lat, input.lng);
      if (input.lat && input.lon) return consultarPorLocalizacao(input.lat, input.lon);
      if (input.cep) return consultarPorCEP(input.cep);
      if (input.endereco) return consultarPorEndereco(input.endereco);
      return { erro: "Informe lat+lng, cep ou endereco" };
    },
    cadastrar_cliente:      () => erp.cadastrarCliente(input),
    ping_macaiba:           () => erp.pingMacaiba(),
    ping_smg:               () => erp.pingSMG(),
    consultar_clima:        () => erp.consultarClima(input.lat, input.lon),
    consultar_feriados:     () => erp.consultarFeriados(input.ano),
    localizar_endereco:     () => erp.localizarEndereco(input.lat, input.lon),
    localizar_cep:          () => erp.localizarCEP(input.uf, input.cidade, input.logradouro),
    consultar_cep:          () => erp.consultarCEP(input.cep),
    status_rede: async () => {
      const { getStatusRede } = await import("../services/monitor-rede.js");
      const todos = await getStatusRede();
      const filtrados = input.grupo
        ? todos.filter(h => h.grupo?.toLowerCase().includes(input.grupo.toLowerCase()))
        : todos;
      const offline  = filtrados.filter(h => h.status === "offline");
      const lentos   = filtrados.filter(h => h.status === "lento" || h.status === "instavel");
      const online   = filtrados.filter(h => h.status === "online");
      return {
        resumo: offline.length === 0 && lentos.length === 0
          ? "Toda a rede está operando normalmente."
          : `${offline.length} host(s) offline, ${lentos.length} lento(s).`,
        offline:  offline.map(h => ({ nome: h.nome, grupo: h.grupo, erro: h.erro })),
        lentos:   lentos.map(h => ({ nome: h.nome, grupo: h.grupo, latencia_ms: h.latencia_ms })),
        online:   online.map(h => ({ nome: h.nome, grupo: h.grupo, latencia_ms: h.latencia_ms })),
        total: filtrados.length,
        ts: new Date().toISOString(),
      };
    },
    enviar_mensagem:        () => chatwoot.sendMessage(input.accountId, input.conversationId, input.texto),
    reagir_mensagem:        () => chatwoot.reagirMensagem(input.accountId, input.conversationId, input.messageId, input.emoji).then(() => ({ ok: true })).catch(() => ({ ok: false })),
    salvar_memoria:         async() => { const chave = input.telefone || String(input.conversationId); await dbSalvarMemoria(chave, input); return { ok: true }; },
    encerrar_atendimento:   () => ({ resolve: true, mensagem_final: input.mensagem_final }),

    // ── WhatsApp interativo (só funciona no canal WA Oficial) ──────────────
    wa_enviar_botoes: () => {
      if (!input.telefone) return { erro: "telefone obrigatório" };
      return waSendButtons(input.telefone, input.corpo, input.botoes || [], input.rodape || "", input.cabecalho || "")
        .then(() => ({ ok: true })).catch(e => ({ erro: e.message }));
    },
    wa_enviar_lista: () => {
      if (!input.telefone) return { erro: "telefone obrigatório" };
      return waSendList(input.telefone, input.corpo, input.label_botao || "Ver opções", input.secoes || [], input.cabecalho || "", input.rodape || "")
        .then(() => ({ ok: true })).catch(e => ({ erro: e.message }));
    },
    wa_enviar_pix: () => {
      if (!input.telefone) return { erro: "telefone obrigatório" };
      return waSendPix(input.telefone, {
        codigoPix: input.codigo_pix, linhaDigitavel: input.linha_digitavel,
        valor: input.valor, vencimento: input.vencimento, descricao: input.descricao,
        linkCobranca: input.link_cobranca,
      }).then(() => ({ ok: true })).catch(e => ({ erro: e.message }));
    },
    wa_enviar_template: () => {
      if (!input.telefone || !input.template) return { erro: "telefone e template obrigatórios" };
      return waSendTemplate(input.telefone, input.template, input.idioma || "pt_BR", input.parametros || [])
        .then(() => ({ ok: true })).catch(e => ({ erro: e.message }));
    },

    // ── ACS TR-069 (servidor próprio) ─────────────────────────────────────────
    consultar_onu_acs: async () => {
      const { listarDevices } = await import("../services/acs-db.js");
      const devs = await listarDevices({ serial: input.serial, limite: 1 });
      if (!devs.length) return { erro: true, mensagem: `ONU com serial '${input.serial}' não encontrada no ACS. Verifique se a ONU está conectada.` };
      const d = devs[0];
      return {
        id: d.id, serial: d.serial, modelo: d.model, firmware: d.firmware,
        ip_wan: d.ip_wan, wan_status: d.wan_status, pppoe_user: d.pppoe_user,
        uptime_seg: d.uptime_seg,
        uptime_fmt: d.uptime_seg ? (() => { const s=d.uptime_seg, di=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60); return di>0?`${di}d ${h}h`:h>0?`${h}h ${m}min`:`${m}min`; })() : null,
        sinal_rx: d.sinal_rx, sinal_tx: d.sinal_tx, qualidade_sinal: d.qualidade_sinal,
        alerta_sinal: d.qualidade_sinal === 'critico' || d.qualidade_sinal === 'fraco',
        ssid_24: d.ssid_24, ssid_5: d.ssid_5, clients_24: d.clients_24,
        ultimo_inform: d.ultimo_inform,
        mensagem: d.sinal_rx !== null
          ? `ONU ${d.model || d.serial}: sinal Rx ${d.sinal_rx} dBm (${d.qualidade_sinal}), WAN ${d.wan_status || 'desconhecido'}, uptime ${d.uptime_seg ? Math.floor(d.uptime_seg/3600)+'h' : '?'}`
          : `ONU ${d.model || d.serial} encontrada. WAN: ${d.wan_status || '?'}.`,
      };
    },
    reiniciar_onu_acs: async () => {
      const { listarDevices } = await import("../services/acs-db.js");
      const { enfileirarReboot } = await import("../services/acs.js");
      const devs = await listarDevices({ serial: input.serial, limite: 1 });
      if (!devs.length) return { ok: false, mensagem: `ONU '${input.serial}' não encontrada no ACS.` };
      const cmdId = await enfileirarReboot(devs[0].id, "maxxi-ia");
      return {
        ok: true, cmdId, deviceId: devs[0].id, serial: input.serial,
        mensagem: "Reboot enfileirado com sucesso. A ONU reiniciará no próximo check-in (geralmente em até 1 minuto). O serviço ficará indisponível por aproximadamente 2 minutos.",
      };
    },
    consultar_dispositivo: async () => {
      const { consultarDispositivoCPE } = await import("../services/tr069.js");
      return consultarDispositivoCPE(input.id_servico);
    },
    reiniciar_onu: async () => {
      const { reiniciarDispositivoCPE } = await import("../services/tr069.js");
      // Registra o agente que fez o reboot (vem do contexto da chamada)
      return reiniciarDispositivoCPE(input.id_servico, input._agente_id || "maxxi");
    },
    consultar_sinal_optico: async () => {
      const { consultarSinalOptico } = await import("../services/tr069.js");
      return consultarSinalOptico(input.id_servico);
    },
    diagnostico_ping_cpe: async () => {
      const { diagnosticoPing } = await import("../services/tr069.js");
      return diagnosticoPing(input.id_servico, input.host || "8.8.8.8");
    },
    listar_wifi_cpe: async () => {
      const { listarWifi } = await import("../services/tr069.js");
      return listarWifi(input.id_servico);
    },
    configurar_wifi_cpe: async () => {
      const { configurarWifi } = await import("../services/tr069.js");
      return configurarWifi(input.id_servico, {
        ssid:  input.ssid,
        senha: input.senha,
        banda: input.banda || "2.4GHz",
        agenteId: input._agente_id || "maxxi",
      });
    },
  };

  const fn = toolMap[name];
  if (!fn) return { erro: `Ferramenta '${name}' não encontrada` };

  try {
    return await fn();
  } catch (err) {
    return { erro: `Erro ao executar ${name}: ${err.message}` };
  }
}
