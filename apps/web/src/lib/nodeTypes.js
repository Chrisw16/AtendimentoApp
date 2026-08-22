/**
 * nodeTypes.js — Definição de todos os tipos de nó do editor de fluxos
 * Espelho fiel do sistema original
 */

export const NODE_GROUPS = {
  gatilho:  { label: 'Gatilho',    color: '#00E5A0' },
  mensagem: { label: 'Mensagens',  color: '#3ecfff' },
  logica:   { label: 'Lógica',     color: '#f5c518' },
  sgp:      { label: 'SGP / ERP',  color: '#a78bfa' },
  ia:       { label: 'IA',         color: '#f472b6' },
  acao:     { label: 'Ações',      color: '#fb923c' },
  fim:      { label: 'Fim',        color: '#ff4757' },
};

export const NODE_TYPES = {
  // ── GATILHO ──────────────────────────────────────────────────────
  inicio: {
    label: 'Início',
    group: 'gatilho',
    color: '#00E5A0',
    portas: ['saida'],
    unico: true,        // só pode existir 1 por fluxo
    descricao: 'Ponto de entrada do fluxo',
  },
  gatilho_keyword: {
    label: 'Palavra-chave',
    group: 'gatilho',
    color: '#00E5A0',
    portas: ['saida'],
    descricao: 'Dispara quando o cliente digita uma palavra específica',
  },

  // ── MENSAGENS ─────────────────────────────────────────────────────
  enviar_texto: {
    label: 'Enviar texto',
    group: 'mensagem',
    color: '#3ecfff',
    portas: ['saida'],
    descricao: 'Envia uma mensagem de texto',
  },
  enviar_cta: {
    label: 'Botão com link',
    group: 'mensagem',
    color: '#3ecfff',
    portas: ['saida'],
    descricao: 'Mensagem com botão que abre URL',
  },
  enviar_imagem: {
    label: 'Enviar imagem',
    group: 'mensagem',
    color: '#3ecfff',
    portas: ['saida'],
    descricao: 'Envia uma imagem',
  },
  enviar_audio: {
    label: 'Enviar áudio',
    group: 'mensagem',
    color: '#3ecfff',
    portas: ['saida'],
    descricao: 'Envia um arquivo de áudio',
  },
  enviar_arquivo: {
    label: 'Enviar arquivo',
    group: 'mensagem',
    color: '#3ecfff',
    portas: ['saida'],
    descricao: 'Envia um documento ou arquivo',
  },
  enviar_localizacao: {
    label: 'Enviar localização',
    group: 'mensagem',
    color: '#3ecfff',
    portas: ['saida'],
    descricao: 'Envia uma localização no mapa',
  },
  enviar_botoes: {
    label: 'Enviar botões',
    group: 'mensagem',
    color: '#3ecfff',
    portas: [], // dinâmico — 1 porta por botão
    descricao: 'Mensagem com botões de resposta rápida',
  },
  enviar_lista: {
    label: 'Enviar lista',
    group: 'mensagem',
    color: '#3ecfff',
    portas: [], // dinâmico — 1 porta por item
    descricao: 'Mensagem com lista de opções',
  },
  solicitar_localizacao: {
    label: 'Solicitar localização',
    group: 'mensagem',
    color: '#ff9f0a',
    // Só a porta que o motor emite de verdade — `sem_localizacao`/`erro` nunca
    // existiram na execução: aresta ligada nelas nunca disparava.
    portas: ['localizacao_recebida'],
    descricao: 'Pede ao cliente que compartilhe sua localização GPS',
  },

  // ── LÓGICA ────────────────────────────────────────────────────────
  aguardar_resposta: {
    label: 'Aguardar resposta',
    group: 'logica',
    color: '#f5c518',
    // `timeout`/`max_tentativas` só aparecem quando `cfg.timeout` > 0 — ver
    // `portasDe()` abaixo e o descritor gêmeo em fluxoValidador.js.
    portas: ['saida'],
    portasSeTimeout: ['timeout', 'max_tentativas'],
    descricao: 'Aguarda a próxima mensagem do cliente e salva em variável (com timeout opcional)',
  },
  condicao: {
    label: 'Condição',
    group: 'logica',
    color: '#f5c518',
    portas: ['sim', 'nao'],
    descricao: 'Bifurca o fluxo baseado em uma condição',
  },
  condicao_multipla: {
    label: 'Condição múltipla',
    group: 'logica',
    color: '#f5c518',
    portas: [], // dinâmico — 1 porta por ramo
    descricao: 'Múltiplas condições em cascata',
  },
  definir_variavel: {
    label: 'Definir variável',
    group: 'logica',
    color: '#f5c518',
    portas: ['saida'],
    descricao: 'Define ou modifica o valor de uma variável',
  },
  divisao_ab: {
    label: 'Divisão A/B',
    group: 'logica',
    color: '#f5c518',
    portas: ['a', 'b'],
    descricao: 'Divide o tráfego em dois caminhos por percentual',
  },
  aguardar_tempo: {
    label: 'Aguardar tempo',
    group: 'logica',
    color: '#f5c518',
    portas: ['saida'],
    descricao: 'Pausa o fluxo por N segundos de verdade (agenda retomada) antes de continuar',
  },

  // ── SGP / ERP ─────────────────────────────────────────────────────
  consultar_cliente: {
    label: 'Consultar cliente',
    group: 'sgp',
    color: '#a78bfa',
    portas: ['encontrado', 'multiplos_contratos', 'max_tentativas'],
    descricao: 'Busca dados do cliente no SGP pelo CPF',
  },
  consultar_boleto: {
    label: 'Consultar boleto',
    group: 'sgp',
    color: '#a78bfa',
    portas: ['encontrado', 'nao_encontrado'],
    descricao: 'Busca boleto em aberto do contrato',
  },
  verificar_status: {
    label: 'Verificar status',
    group: 'sgp',
    color: '#f5c518',
    portas: ['ativo', 'inativo', 'cancelado', 'suspenso', 'inviabilidade', 'novo', 'reduzido'],
    descricao: 'Verifica o status do contrato do cliente',
  },
  abrir_chamado: {
    label: 'Abrir chamado',
    group: 'sgp',
    color: '#a78bfa',
    // O motor emite sucesso/erro. A paleta dizia `saida`, que só funcionava por
    // acidente (2º fallback do encontrarProximo) — e escondia o ramo de erro.
    portas: ['sucesso', 'erro'],
    descricao: 'Abre um chamado técnico no SGP',
  },
  promessa_pagamento: {
    label: 'Promessa pagamento',
    group: 'sgp',
    color: '#a78bfa',
    portas: ['sucesso', 'adimplente', 'erro'],
    descricao: 'Registra promessa de pagamento no SGP',
  },
  listar_planos: {
    label: 'Listar planos',
    group: 'sgp',
    color: '#a78bfa',
    portas: ['saida'],
    descricao: 'Lista os planos disponíveis na cidade do cliente',
  },
  consultar_historico: {
    label: 'Histórico chamados',
    group: 'sgp',
    color: '#a78bfa',
    portas: ['saida'],
    descricao: 'Busca histórico de chamados do contrato',
  },

  // ── IA ────────────────────────────────────────────────────────────
  ia_responde: {
    label: 'IA responde',
    group: 'ia',
    color: '#f472b6',
    portas: ['resolvido', 'transferir', 'max_turnos'],
    descricao: 'IA responde autonomamente até resolver ou transferir',
  },
  ia_roteador: {
    label: 'IA roteador',
    group: 'ia',
    color: '#e879f9',
    portas: [], // dinâmico — 1 porta por rota + nao_entendeu + encerrar
    descricao: 'IA identifica a intenção e roteia para o nó correto',
  },

  // ── AÇÕES ─────────────────────────────────────────────────────────
  transferir_agente: {
    label: 'Transferir para fila',
    group: 'acao',
    color: '#ff6b35',
    // `transferido` = por onde a automação RETOMA quando o agente devolve
    // (FASE 1). `sem_agente` saiu: detectar fila sem agente livre é FASE 5.
    portas: ['transferido', 'fora_horario'],
    descricao: 'Transfere para atendimento humano',
  },
  enviar_email: {
    label: 'Enviar e-mail',
    group: 'acao',
    color: '#fb923c',
    portas: ['saida'],   // é o que o motor emite (o nó ainda é stub, só loga)
    descricao: 'Envia um e-mail',
  },
  nota_interna: {
    label: 'Nota interna',
    group: 'acao',
    color: '#fb923c',
    portas: ['saida'],
    descricao: 'Adiciona uma nota interna na conversa',
  },
  chamada_http: {
    label: 'Chamada HTTP',
    group: 'acao',
    color: '#fb923c',
    portas: ['sucesso', 'erro'],
    descricao: 'Faz uma requisição HTTP para uma API externa',
  },
  nps_inline: {
    label: 'Pesquisa NPS',
    group: 'acao',
    color: '#f472b6',
    portas: ['promotor', 'neutro', 'detrator'],
    descricao: 'Coleta avaliação de satisfação do cliente',
  },

  // ── FIM ───────────────────────────────────────────────────────────
  encerrar: {
    label: 'Encerrar',
    group: 'fim',
    color: '#ff4757',
    portas: [],
    descricao: 'Encerra o atendimento',
  },
};

// Portas com cores e labels fixos
export const PORTA_META = {
  saida:               { color: '#888',     label: 'saída' },
  sim:                 { color: '#00E5A0',  label: 'sim' },
  nao:                 { color: '#ff4757',  label: 'não' },
  encontrado:          { color: '#00E5A0',  label: 'encontrado' },
  nao_encontrado:      { color: '#ff4757',  label: 'não encontrado' },
  multiplos_contratos: { color: '#3ecfff',  label: 'múltiplos' },
  max_tentativas:      { color: '#ff4757',  label: 'max tentativas' },
  timeout:             { color: '#f5c518',  label: 'timeout' },
  ativo:               { color: '#00E5A0',  label: '① Ativo' },
  inativo:             { color: '#ff4757',  label: '② Inativo' },
  cancelado:           { color: '#ff6b35',  label: '③ Cancelado' },
  suspenso:            { color: '#f5c518',  label: '④ Suspenso' },
  inviabilidade:       { color: '#888',     label: '⑤ Inviab. técnica' },
  novo:                { color: '#3ecfff',  label: '⑥ Novo' },
  reduzido:            { color: '#a78bfa',  label: '⑦ V. Reduzida' },
  sucesso:             { color: '#00E5A0',  label: 'sucesso' },
  adimplente:          { color: '#3ecfff',  label: 'adimplente' },
  erro:                { color: '#ff4757',  label: 'erro' },
  resolvido:           { color: '#00E5A0',  label: 'resolvido' },
  transferir:          { color: '#ff6b35',  label: 'transferir' },
  max_turnos:          { color: '#f5c518',  label: 'max turnos' },
  transferido:         { color: '#00E5A0',  label: 'transferido' },
  fora_horario:        { color: '#f5c518',  label: 'fora do horário' },
  sem_agente:          { color: '#ff4757',  label: 'sem agente' },
  promotor:            { color: '#00E5A0',  label: 'promotor' },
  neutro:              { color: '#f5c518',  label: 'neutro' },
  detrator:            { color: '#ff4757',  label: 'detrator' },
  nao_entendeu:        { color: '#888',     label: 'não entendeu' },
  encerrar:            { color: '#ff4757',  label: 'encerrar' },
  a:                   { color: '#3ecfff',  label: 'A' },
  b:                   { color: '#f472b6',  label: 'B' },
  localizacao_recebida:{ color: '#00E5A0',  label: 'recebida' },
  sem_localizacao:     { color: '#f5c518',  label: 'sem localização' },
  concluido:           { color: '#00E5A0',  label: 'concluído' },
};

// Lista exibida como checkbox no painel de propriedades do nó ia_responde.
//
// O default TEM de bater com o de `motorFluxo.js` (`toolsAtivas`), senão o
// checkbox mente: até 2026-08-21 a tela marcava `listar_planos_ativos` e
// `listar_vencimentos` por default e o motor as deixava desligadas.
// `tests/contrato-catalogos.test.js` trava os dois juntos.
export const IA_TOOLS_LIST = [
  { id: 'verificar_conexao',     label: '📡 Verificar conexão',       cat: 'Diagnóstico' },
  { id: 'consultar_manutencao',  label: '🔧 Consultar manutenção',    cat: 'Diagnóstico' },
  { id: 'status_rede',           label: '🌐 Status da rede',          cat: 'Diagnóstico' },
  { id: 'consultar_radius',      label: '🔌 Consultar Radius',        cat: 'Diagnóstico' },
  { id: 'consultar_onu_acs',     label: '📶 Consultar ONU (ACS)',     cat: 'Diagnóstico' },
  { id: 'reiniciar_onu_acs',     label: '🔄 Reiniciar ONU (ACS)',     cat: 'Diagnóstico' },
  { id: 'criar_chamado',         label: '🎫 Criar chamado',           cat: 'Atendimento' },
  { id: 'historico_ocorrencias', label: '📋 Histórico de ocorrências',cat: 'Atendimento' },
  { id: 'segunda_via_boleto',    label: '💳 2ª via de boleto',        cat: 'Financeiro' },
  { id: 'promessa_pagamento',    label: '🤝 Promessa de pagamento',   cat: 'Financeiro' },
  { id: 'listar_planos_ativos',  label: '📋 Listar planos ativos',    cat: 'Comercial'   },
  { id: 'listar_vencimentos',    label: '📅 Listar vencimentos',      cat: 'Comercial'   },
  { id: 'precadastrar_cliente',  label: '📝 Pré-cadastro de cliente', cat: 'Comercial'   },
  { id: 'transferir_para_humano',label: '👤 Transferir para humano',  cat: 'Controle'    },
  { id: 'encerrar_atendimento',  label: '✅ Encerrar atendimento',    cat: 'Controle'    },
];
// Default = só suporte. As comerciais (incluindo o pré-cadastro, que cria
// cliente de verdade no SGP) exigem marcação explícita no ramo comercial.
export const IA_TOOLS_DEFAULT = IA_TOOLS_LIST.filter(t => t.cat !== 'Comercial').map(t => t.id);
