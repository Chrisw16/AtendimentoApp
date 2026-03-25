/**
 * Serviço de integração com o SGP da CITmax
 * Extraído do workflow n8n: 01. Secretária v2
 * Token SGP: 05ffb2b9-8d63-406d-8467-d471b82e0c35
 */

const SGP_URL = "https://citrn.sgp.net.br";
const SGP_APP = "n8n";
const SGP_TOKEN = "05ffb2b9-8d63-406d-8467-d471b82e0c35";
const UA = "CITmax-Atendimento/1.0 (contato@citmax.com.br)";

function formBody(params = {}) {
  return new URLSearchParams({ app: SGP_APP, token: SGP_TOKEN, ...params }).toString();
}

export async function sgpPostRaw(path, params = {}) {
  const res = await fetch(`${SGP_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody(params),
  });
  if (!res.ok) throw new Error(`SGP ${res.status} em ${path}`);
  return res.json();
}

async function sgpPost(path, params = {}) {
  const res = await fetch(`${SGP_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody(params),
  });
  if (!res.ok) throw new Error(`SGP ${res.status} em ${path}`);
  return res.json();
}

async function sgpGet(path, params = {}) {
  const qs = new URLSearchParams({ app: SGP_APP, token: SGP_TOKEN, ...params }).toString();
  const res = await fetch(`${SGP_URL}${path}?${qs}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`SGP ${res.status} em ${path}`);
  return res.json();
}

// ─── SGP ──────────────────────────────────────────────────────────────────────

/**
 * Campos internos do SGP que NUNCA são relevantes para atendimento.
 * Remover estes campos reduz drasticamente o tamanho da resposta.
 * ATENÇÃO: NÃO remover campos dinâmicos como status, vencimento, saldo, etc.
 */
const CAMPOS_INTERNOS = new Set([
  // Configurações de sistema / infra (nunca mudam e não têm uso no atendimento)
  "nas_id", "nas_ip", "pop_id", "portador_id", "portador_nome",  // pop_nome mantido para match de manutenção
  "plataforma_id", "plano_id", "grupo_id", "grupo_nome",
  "concentrador_id", "concentrador_ip", "concentrador_porta",
  "interface_id", "vlan_id", "vlan_nome", "ip_fixo", "ipv6",
  "mac_address", "serial_onu", "modelo_onu", "onu_id",
  // Campos de log/auditoria internos
  "created_at", "updated_at", "deleted_at", "operador_id", "operador_nome",
  "alterado_por", "criado_por", "historico_alteracoes",
  // Dados de configuração de rede (irrelevantes para o atendente)
  "radius_usuario", "radius_senha", "pppoe_login", "pppoe_senha",
  "mikrotik_id", "script_id", "perfil_id", "perfil_nome",
  // Campos duplicados ou redundantes
  "cpfcnpj_formatado", "foto", "avatar", "observacao_interna",
  "token_acesso", "hash", "chave_api",
]);

/**
 * Filtra recursivamente o retorno do SGP, removendo apenas campos internos
 * que nunca são relevantes para o atendimento. Campos dinâmicos como
 * status, vencimento, saldo, boletos, etc. são sempre preservados.
 */
function filtrarResposta(obj, profundidade = 0) {
  if (profundidade > 8) return obj; // Proteção contra recursão infinita
  if (Array.isArray(obj)) return obj.map(i => filtrarResposta(i, profundidade + 1));
  if (obj && typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!CAMPOS_INTERNOS.has(k)) {
        result[k] = filtrarResposta(v, profundidade + 1);
      }
    }
    return result;
  }
  return obj;
}

/** Consultar cliente por CPF/CNPJ — POST /api/ura/clientes/ */
export async function consultarClientes(cpfcnpj) {
  const digits = (cpfcnpj || "").replace(/\D/g, "");
  if (digits.length < 11) {
    return { erro: true, mensagem: "CPF ou CNPJ inválido ou não informado. Solicite ao cliente o número completo antes de consultar." };
  }
  const raw = await sgpPost("/api/ura/clientes/", { cpfcnpj: cpfcnpj.replace(/\D/g, "") });
  const filtered = filtrarResposta(raw);

  // Formata resposta compacta para economizar tokens
  const clientes = filtered?.clientes || [];
  if (clientes.length === 0) return { erro: true, mensagem: "Cliente não encontrado para este CPF/CNPJ." };

  const c = clientes[0];

  // Prioridade: contratos ativos primeiro, depois suspensos, depois cancelados
  const STATUS_ORDEM = { "ativo": 0, "suspenso": 1, "reduzido": 1, "cancelado": 2 };
  const todosContratos = (c.contratos || []);
  const contratosOrdenados = [...todosContratos].sort((a, b) => {
    const sa = STATUS_ORDEM[(a.status || "").toLowerCase()] ?? 3;
    const sb = STATUS_ORDEM[(b.status || "").toLowerCase()] ?? 3;
    return sa - sb;
  });

  // Limita a 8 contratos para economizar tokens (raramente alguém tem mais)
  const contratosFiltrados = contratosOrdenados.slice(0, 8);
  const totalContratos = todosContratos.length;

  return {
    nome: c.nome,
    cpfcnpj: c.cpfcnpj,
    nascimento: c.dataNascimento,
    email: c.email,
    fone: c.celular || c.fone,
    contratos: contratosFiltrados.map(ct => ({
      id: ct.id,
      plano: ct.plano_nome || ct.plano || null,
      status: (ct.status || "").toLowerCase(),
      // SGP retorna campos flat: endereco_logradouro, endereco_cidade, popNome
      end: ct.endereco_logradouro
        ? `${ct.endereco_logradouro}, ${ct.endereco_numero} - ${ct.endereco_bairro}`
        : (ct.endereco
          ? `${ct.endereco.logradouro}, ${ct.endereco.numero} - ${ct.endereco.bairro}`
          : null),
      cidade: ct.endereco_cidade                          // "MACAÍBA"
        || ct.endereco?.cidade
        || (ct.popNome || "").split("/")[0].trim()        // "Macaíba/RN" → "Macaíba"
        || null,
      popId: ct.popId || ct.pop_id || null,               // ID do POP — match exato com manutenção
      popNome: ct.popNome || ct.pop_nome || null,         // "Macaíba/RN" 
      venc_dia: ct.vencimento ? `dia ${ct.vencimento}` : null,
      velocidade: ct.velocidade || ct.velocidade_download || null,
    })),
    ...(totalContratos > 8 ? { _aviso: `Cliente tem ${totalContratos} contratos. Mostrando os 8 mais relevantes.` } : {}),
  };
}

/** Segunda via de boleto — POST /api/ura/fatura2via/ */
export async function segundaViaBoleto(cpfcnpj, contrato) {
  // Valida CPF/CNPJ antes de chamar a API
  const digits = (cpfcnpj || "").replace(/\D/g, "");
  if (digits.length < 11) {
    return { erro: true, mensagem: "CPF/CNPJ inválido. O cpfcnpj deve vir do resultado de consultar_clientes, não da resposta do cliente." };
  }
  const raw = await sgpPost("/api/ura/fatura2via/", {
    cpfcnpj: cpfcnpj.replace(/\D/g, ""),
    contrato,
    faturas_abertas_todas: "1",
    notafiscal: "1",
  });

  // API retorna status=1 (sucesso) com array "links" contendo os boletos
  if (raw?.status !== 1 || !Array.isArray(raw?.links) || raw.links.length === 0) {
    return {
      status: "sem_boleto",
      mensagem: "Nenhum boleto em aberto para este contrato.",
    };
  }

  const links = raw.links;

  // Função helper: formata um boleto completo
  function formatarBoleto(f, raw, idx = null) {
    const vencido = f.vencimento && new Date(f.vencimento) < new Date();
    return {
      ...(idx !== null ? { indice: idx + 1 } : {}),
      status: "boleto_encontrado",
      cliente: raw.razaoSocial,
      protocolo: raw.protocolo,
      contrato: raw.contratoId,
      fatura_id: f.fatura || f.id,
      valor_original: f.valor_original,
      desconto: f.desconto_vencimento,
      multa: f.multa || 0,
      juros: f.juros || 0,
      valor_cobrado: f.valor,
      vencimento_original: f.vencimento_original,
      vencimento_atual: f.vencimento,
      vencido,
      link_boleto: f.link || raw.link,
      link_cobranca: f.link_cobranca || raw.link_cobranca,
      link_pix_html: f.link_pix_html,
      pix_copia_cola: f.codigopix,
      linha_digitavel: f.linhadigitavel,
    };
  }

  // Múltiplos boletos → lista resumida para o cliente escolher
  if (links.length > 1) {
    return {
      status: "multiplos_boletos",
      total: links.length,
      cliente: raw.razaoSocial,
      contrato: raw.contratoId,
      instrucao: "Liste os boletos e peça ao cliente escolher qual deseja pagar. Após a escolha, use os dados do boleto escolhido para enviar os detalhes completos.",
      lista: links.map((f, i) => ({
        indice: i + 1,
        fatura_id: f.fatura || f.id,
        vencimento_original: f.vencimento_original,
        vencimento_atual: f.vencimento,
        valor_original: f.valor_original,
        valor_cobrado: f.valor,
        multa: f.multa || 0,
        juros: f.juros || 0,
        vencido: f.vencimento && new Date(f.vencimento) < new Date(),
        // Dados completos já disponíveis para quando o cliente escolher
        pix_copia_cola: f.codigopix,
        linha_digitavel: f.linhadigitavel,
        link_boleto: f.link,
        link_cobranca: f.link_cobranca,
        link_pix_html: f.link_pix_html,
      })),
    };
  }

  // Um único boleto — envia detalhes completos direto
  return formatarBoleto(links[0], raw);
}

/** Promessa de pagamento — POST /api/ura/liberacaopromessa/ (1x/mês) */
export async function promessaPagamento(contrato, extras = {}) {
  // Calcula data da promessa: hoje + 3 dias
  const hoje = new Date();
  const promessa = new Date(hoje);
  promessa.setDate(promessa.getDate() + 3);
  const dataPromessa = extras.data_promessa || promessa.toISOString().split('T')[0];

  const res = await fetch(`${SGP_URL}/api/ura/liberacaopromessa/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      contrato: String(contrato),
      data_promessa: dataPromessa,
      enviar_sms: "1",
      conteudo: extras.conteudo || "Liberação por promessa de pagamento via Maxxi",
    }),
  });
  const data = await res.json().catch(() => ({}));

  return {
    httpStatus: res.status,
    status: data.status,
    liberado: data.status === 1,
    liberado_dias: data.liberado_dias || 3,
    protocolo: data.protocolo || null,
    data_promessa: dataPromessa,
    contratoId: data.contratoId || contrato,
    razaoSocial: data.razaoSocial || null,
    msg: data.msg || data.message || null,
    erro: data.status !== 1 ? (data.msg || "Falha na liberação") : null,
  };
}

/** Listar dias de vencimento disponíveis — POST /api/precadastro/vencimento/list */
export async function listarVencimentos() {
  return sgpPost("/api/precadastro/vencimento/list");
}

/**
 * Criar chamado — POST /api/ura/chamado/
 * Tipos: 13=MudEndereco, 23=MudPlano, 3=MudSenha, 206=MudTitular,
 *         4=NovoPonto, 40=AtivStreaming, 22=ProbFatura, 14=RelocRoteador,
 *       200=Reparo, 5=Outros
 */
export async function criarChamado(contrato, ocorrenciatipo, conteudo, extras = {}) {
  // API /api/ura/chamado/ espera JSON body
  const body = {
    app: SGP_APP,
    token: SGP_TOKEN,
    contrato: Number(contrato),
    ocorrenciatipo: Number(ocorrenciatipo) || 5,
    conteudo: conteudo || "Chamado aberto via Maxxi",
    notificar_cliente: 1,
    conteudolimpo: 1,
  };
  // Campos opcionais
  if (extras.contato_nome) body.contato_nome = extras.contato_nome;
  if (extras.contato_telefone) body.contato_telefone = String(extras.contato_telefone).replace(/\D/g, '');
  if (extras.usuario) body.usuario = extras.usuario;
  if (extras.responsavel) body.responsavel = extras.responsavel;
  if (extras.observacao) body.observacao = extras.observacao;
  if (extras.setor) body.setor = Number(extras.setor);
  if (extras.motivoos) body.motivoos = Number(extras.motivoos);

  const res = await fetch(`${SGP_URL}/api/ura/chamado/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`SGP ${res.status} em /api/ura/chamado/`);
  const raw = await res.json();

  return {
    ...raw,
    protocolo: raw?.protocolo || null,
    chamado_aberto: raw?.status === 1,
    contrato: raw?.contratoId || contrato,
    cliente: raw?.razaoSocial || null,
  };
}

/** Extrato de tráfego — POST /api/central/extratouso/ */
export async function extratoTrafego(cpfcnpj, senha, contrato) {
  const agora = new Date();
  return sgpPost("/api/central/extratouso/", {
    cpfcnpj: cpfcnpj.replace(/\D/g, ""),
    senha,
    contrato,
    ano: String(agora.getFullYear()),
    mes: String(agora.getMonth() + 1),
  });
}

/** Verificar conexão/acesso — POST /api/ura/verificaacesso/ */
export async function verificarConexao(contrato) {
  const raw = await sgpPost("/api/ura/verificaacesso/", { contrato });
  // API retorna: status (0=offline, 1=online), staus (status contrato), msg ("Serviço Offline"/"Serviço Online")
  const online = raw?.status === 1;
  return {
    contrato: raw?.contratoId || raw?.contrato || contrato,
    online,
    status_conexao: online ? "online" : "offline",
    msg: raw?.msg || (online ? "Serviço Online" : "Serviço Offline"),
    status_contrato: raw?.staus || raw?.status,
    razao_social: raw?.razaoSocial || null,
    cpfcnpj: raw?.cpfCnpj || null,
  };
}

/** Cancelar contrato (status=3) — POST /api/ura/contrato/status/edit/ */
export async function cancelarContrato(contrato) {
  // SGP exige status como número inteiro (3 = cancelado), enviado em JSON
  const res = await fetch(`${SGP_URL}/api/ura/contrato/status/edit/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app: SGP_APP, token: SGP_TOKEN, contrato: String(contrato), status: 3 }),
  });
  const data = await res.json().catch(() => ({}));
  return { httpStatus: res.status, ...data };
}

/** Radius PPPoE — POST /ws/radius/radacct/list/all/ */
export async function consultarRadius(cpfcnpj) {
  const res = await fetch(`${SGP_URL}/ws/radius/radacct/list/all/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({ tipoconexao: "PPP", cpfcnpj: cpfcnpj.replace(/\D/g, "") }),
  });
  const raw = await res.json();
  const lista = Array.isArray(raw) ? raw : (raw?.results || []);
  return lista.slice(0, 3).map(r => ({
    usuario: r.username,
    ip: r.framedipaddress,
    online: r.acctstoptime === null,
    inicio: r.acctstarttime,
    nas: r.nasipaddress,
  }));
}

/** Histórico de ocorrências — POST /api/ura/ocorrencia/list/ */
export async function historicoOcorrencias(contrato) {
  // API /api/ura/ocorrencia/list/ espera JSON body
  const res = await fetch(`${SGP_URL}/api/ura/ocorrencia/list/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app: SGP_APP,
      token: SGP_TOKEN,
      contrato: Number(contrato),
      offset: 0,
      limit: 50,
    }),
  });
  if (!res.ok) throw new Error(`SGP ${res.status} em /api/ura/ocorrencia/list/`);
  const raw = await res.json();
  const lista = raw?.ocorrencias || [];
  return lista.map(o => ({
    numero: o.numero,
    status: o.status,
    status_id: o.status_id,
    tipo: o.tipo,
    data_cadastro: o.data_cadastro,
    data_agendamento: o.data_agendamento,
    data_finalizacao: o.data_finalizacao,
    conteudo: (o.conteudo || "").slice(0, 200),
    responsavel: o.responsavel,
    metodo: o.metodo,
    contrato: o.contrato,
    comentarios: o.comentarios || [],
    ordens_servicos: o.ordens_servicos || [],
  }));
}

/** Manutenções ativas — GET /api/ura/manutencao/list
 * SGP retorna array de objetos: [{ titulo, descricao, previsao, data_inicio, ... }]
 * ou objeto com { manutencoes: [...] } ou { em_manutencao: bool }
 * Normaliza tudo para { ativa: bool, total: N, itens: [...], previsao }
 */
let _manutencaoCache = null;
let _manutencaoCacheTs = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export async function consultarManutencao({ forcarAtualizar = false } = {}) {
  // Cache de 5 minutos — manutenção não muda a cada segundo
  if (!forcarAtualizar && _manutencaoCache && Date.now() - _manutencaoCacheTs < CACHE_TTL) {
    return _manutencaoCache;
  }

  try {
    const raw = await sgpGet("/api/ura/manutencao/list");

    // Normaliza formato real do SGP:
    // Array de objetos: [{ id, descricao, ativa, mensagem_central, data_final, pops: [{cidade}] }]
    let itens = [];
    if (Array.isArray(raw)) {
      itens = raw;
    } else if (Array.isArray(raw?.manutencoes)) {
      itens = raw.manutencoes;
    } else if (Array.isArray(raw?.data)) {
      itens = raw.data;
    } else if (raw?.em_manutencao === true || raw?.manutencao === true) {
      itens = [{ descricao: "Manutenção ativa", ativa: true }];
    }

    // Filtra só as ativas — campo real do SGP é ativa: true
    const ativas = itens.filter(m =>
      m.ativa === true || m.status === "ativo" || m.status === "em_andamento" || m.ativo === true
    );

    // Extrai cidades afetadas de todos os pops
    const cidadesAfetadas = [...new Set(
      ativas.flatMap(m => (m.pops || []).map(p => p.cidade).filter(Boolean))
    )];

    // Usa mensagem_central ou mensagem_ura do SGP (já escrita pela equipe)
    const mensagemCentral = ativas[0]?.mensagem_central || ativas[0]?.mensagem_ura || null;
    const previsao = ativas[0]?.data_final
      ? new Date(ativas[0].data_final).toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" })
      : null;
    const titulo = ativas[0]?.descricao || "Manutenção ativa";

    const resultado = {
      ativa: ativas.length > 0,
      total: ativas.length,
      itens: ativas.map(m => ({
        id: m.id,
        descricao: m.descricao,
        mensagem: m.mensagem_central || m.mensagem_ura || "",
        data_final: m.data_final,
        pops: m.pops || [],
        cidades: (m.pops || []).map(p => p.cidade).filter(Boolean),
      })),
      cidadesAfetadas,
      mensagemCentral,
      previsao,
      titulo,
      // Compatibilidade
      em_manutencao: ativas.length > 0,
      manutencao: ativas.length > 0,
    };

    _manutencaoCache = resultado;
    _manutencaoCacheTs = Date.now();
    return resultado;
  } catch(e) {
    // Em caso de erro, retorna sem manutenção (não bloqueia atendimento)
    return { ativa: false, total: 0, itens: [], previsao: null, titulo: null, em_manutencao: false, manutencao: false };
  }
}

export function limparCacheManutencao() {
  _manutencaoCache = null;
  _manutencaoCacheTs = 0;
}

/** Verificar cobertura — POST /api/ura/viabilidadeinstalacao */
export async function verificarCobertura(lat, lon) {
  const res = await fetch(`${SGP_URL}/api/ura/viabilidadeinstalacao`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      app: SGP_APP, token: SGP_TOKEN, raio: "2", coordenada: `${lat},${lon}`,
    }).toString(),
  });
  return res.json();
}

/**
 * Cadastrar novo cliente — POST /api/precadastro/F
 *
 * IDs de plano:
 *   Macaíba / São Gonçalo / Natal: Essencial=12 (300M R$59,90), Avançado=13 (450M R$99,90), Premium=16 (600M R$119,90)
 *   São Miguel do Gostoso:         Essencial=30 (200M R$69,90), Avançado=29 (300M R$99,90), Premium=28 (500M R$119,90)
 * IDs de POP: Macaíba/Natal=1 | São Miguel do Gostoso=3 | São Gonçalo=4
 * IDs de portador: Macaíba/Natal/SGA=16 | São Miguel=18
 */
export async function cadastrarCliente(d) {
  const res = await fetch(`${SGP_URL}/api/precadastro/F`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      app: SGP_APP, token: SGP_TOKEN,
      nome: d.nome,
      cpfcnpj: d.cpf.replace(/\D/g, ""),
      datanasc: d.datanasc, // AAAA-MM-DD
      email: d.email,
      celular: d.celular.replace(/\D/g, ""),
      logradouro: d.logradouro,
      numero: d.numero,
      complemento: d.complemento || "",
      bairro: d.bairro,
      cidade: d.cidade,
      pontoreferencia: d.pontoreferencia || "",
      plano_id: String(d.plano_id),
      vencimento_id: String(d.vencimento_id),
      uf: "RN",
      pais: "BR",
      login: d.cpf.replace(/\D/g, ""),
      senha: "123456",
      pop_id: String(d.pop_id),
      portador_id: String(d.portador_id),
      nas_id: "3",
      os_instalacao: "True",
      formacobranca_id: "1",
      precadastro_ativar: "1",
      observacao: "Pré-cadastro via IA Maxxi",
      ...(d.map_ll ? { map_ll: d.map_ll } : {}),
    }).toString(),
  });
  return res.json();
}


/** Todas as ocorrências — sem filtro de contrato — POST /api/ura/ocorrencia/list/ */
export async function listarOcorrencias(filtros = {}) {
  const raw = await sgpPostRaw("/api/ura/ocorrencia/list/", filtros);
  const lista = Array.isArray(raw) ? raw : (raw?.ocorrencias || raw?.results || []);
  return lista;
}

/** Stats de atendimentos do agente — baseado nas conversas do banco */
export async function statsAgente(agenteId, dias = 7) {
  // Retorna dados do banco local, não do SGP
  return { agenteId, dias };
}

/** Fechar/atualizar ocorrência — POST /api/ura/ocorrencia/ */
export async function fecharOcorrencia(ocorrenciaId, conteudo = "Ocorrência encerrada pelo agente") {
  return sgpPostRaw("/api/ura/ocorrencia/", {
    id: String(ocorrenciaId),
    acao: "fechar",
    conteudo,
  });
}

/** Adicionar nota em ocorrência existente */
export async function adicionarNota(ocorrenciaId, conteudo) {
  return sgpPostRaw("/api/ura/ocorrencia/", {
    id: String(ocorrenciaId),
    acao: "nota",
    conteudo,
  });
}

/** Listar planos de internet disponíveis */
export async function listarPlanos() {
  return sgpPostRaw("/api/ura/planos/");
}

/** Buscar cliente por nome, contrato ou CPF */
export async function buscarCliente(filtro) {
  const params = {};
  if (filtro.cpf)      params.cpfcnpj  = filtro.cpf.replace(/\D/g, "");
  if (filtro.nome)     params.nome     = filtro.nome;
  if (filtro.contrato) params.contrato = filtro.contrato;
  if (filtro.login)    params.login    = filtro.login;
  return sgpPostRaw("/api/ura/clientes/", params);
}

/** Listar contratos inativos (leads) */
export async function listarContratosInativos() {
  return sgpPostRaw("/api/ura/clientes/", { status: "inativo" });
}

// ─── MONITORAMENTO ─────────────────────────────────────────────────────────────

/**
 * PING Macaíba/São Gonçalo — UptimeRobot
 * Status: 0=Pausado, 1=NãoChecado, 2=Online, 8=PareceOffline, 9=Offline
 */
export async function pingMacaiba() {
  const res = await fetch("https://api.uptimerobot.com/v2/getMonitors", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ api_key: "m800448552-29f61b2ae12bccf25a7cbe56", format: "json" }).toString(),
  });
  return res.json();
}

/**
 * PING São Miguel do Gostoso — UptimeRobot
 * Status: 0=Pausado, 1=NãoChecado, 2=Online, 8=PareceOffline, 9=Offline
 */
export async function pingSMG() {
  const res = await fetch("https://api.uptimerobot.com/v2/getMonitors", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ api_key: "m800448992-3cb91d59dc4ba7e8e532db4f", format: "json" }).toString(),
  });
  return res.json();
}

// ─── APIS EXTERNAS ─────────────────────────────────────────────────────────────

/**
 * Clima — Open-Meteo (gratuito, sem chave)
 * Coordenadas:
 *   Natal:       -5.874015887013088, -35.22612355180273
 *   Macaíba:     -5.8520, -35.3550
 *   São Gonçalo: -5.7936, -35.3273
 *   SMG:         -5.1230, -35.6350
 * weathercode 0–67 = bom | 80–99 = chuva/tempestade
 */
export async function consultarClima(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=precipitation`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  return res.json();
}

/** Feriados nacionais — BrasilAPI */
export async function consultarFeriados(ano) {
  const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`, {
    headers: { "User-Agent": UA },
  });
  return res.json();
}

/** Localizar endereço por coordenadas GPS — Nominatim/OpenStreetMap */
export async function localizarEndereco(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  return res.json();
}

/** Localizar CEP por UF + cidade + logradouro — ViaCEP */
export async function localizarCEP(uf, cidade, logradouro) {
  const url = `https://viacep.com.br/ws/${uf}/${encodeURIComponent(cidade)}/${encodeURIComponent(logradouro)}/json/`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  return res.json();
}

/** Consultar endereço por CEP — BrasilAPI */
export async function consultarCEP(cep) {
  const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep.replace(/\D/g, "")}`, {
    headers: { "User-Agent": UA },
  });
  return res.json();
}

/**
 * Verifica se há manutenção ativa na cidade/região do cliente
 * @param {string} cidadeCliente - cidade do contrato do cliente
 * @returns {{ temManutencao, mensagem, previsao, geral }}
 */
/**
 * Verifica manutenção pelo popId do contrato (match exato) com fallback por cidade
 * @param {{ popId, cidade }} contratoCliente
 */
export async function verificarManutencaoCliente({ popId, cidade } = {}) {
  const man = await consultarManutencao();
  if (!man.ativa) return { temManutencao: false };

  // Sem pops = manutenção geral afeta toda a rede
  const isGeral = man.itens.every(m => !m.pops?.length);
  if (isGeral) {
    return {
      temManutencao: true,
      mensagem: man.mensagemCentral,
      previsao: man.previsao,
      geral: true,
    };
  }

  // Match 1: por popId — mais preciso
  const popIdsAfetados = man.itens.flatMap(m => (m.pops || []).map(p => p.id));
  if (popId && popIdsAfetados.includes(Number(popId))) {
    return {
      temManutencao: true,
      mensagem: man.mensagemCentral,
      previsao: man.previsao,
      geral: false,
    };
  }

  // Match 2: por cidade (fallback quando popId não bate ou não veio)
  const cidadeNorm = (cidade || "").toLowerCase().trim();
  const cidadeBate = cidadeNorm && man.cidadesAfetadas.some(c => {
    const cn = c.toLowerCase().trim();
    return cn.includes(cidadeNorm) || cidadeNorm.includes(cn);
  });

  if (cidadeBate) {
    return {
      temManutencao: true,
      mensagem: man.mensagemCentral,
      previsao: man.previsao,
      geral: false,
    };
  }

  return { temManutencao: false };
}
