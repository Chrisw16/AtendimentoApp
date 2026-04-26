/**
 * iaTools.js — Ferramentas disponíveis para o nó ia_responde
 * Formato Anthropic tool_use (input_schema)
 */
import {
  consultarClientes, segundaViaBoleto, promessaPagamento,
  criarChamado, verificarConexao, consultarManutencao,
  historicoOcorrencias, consultarBoleto,
  statusRede, consultarOnuAcs, reiniciarOnuAcs, consultarRadius,
} from './integrations.js';

// ── DEFINIÇÃO DAS FERRAMENTAS ──────────────────────────────────────────────
export const IA_TOOLS = [
  {
    name: 'verificar_conexao',
    description: 'Verifica se o cliente está online/offline. Use SEMPRE no início do suporte técnico.',
    input_schema: {
      type: 'object',
      properties: {
        contrato: { type: 'string', description: 'ID do contrato do cliente' },
      },
      required: ['contrato'],
    },
  },
  {
    name: 'consultar_manutencao',
    description: 'Verifica se há manutenção ativa na área do cliente. Use quando cliente estiver offline.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'criar_chamado',
    description: 'Abre chamado técnico. Use SEMPRE que não resolver o problema. Informe o protocolo ao cliente. Tipos: 200=Reparo, 3=MudSenhaWifi, 14=RelocRoteador, 13=MudEndereco, 23=MudPlano, 22=ProbFatura, 5=Outros.',
    input_schema: {
      type: 'object',
      properties: {
        contrato:         { type: 'string',  description: 'ID do contrato' },
        ocorrenciatipo:   { type: 'integer', description: 'Tipo: 200=Reparo, 3=MudSenha, 14=RelocRoteador, 13=MudEndereco, 23=MudPlano, 22=ProbFatura, 5=Outros' },
        conteudo:         { type: 'string',  description: 'Descrição detalhada do problema' },
        contato_nome:     { type: 'string',  description: 'Nome do cliente' },
        contato_telefone: { type: 'string',  description: 'Telefone para contato' },
      },
      required: ['contrato', 'ocorrenciatipo', 'conteudo'],
    },
  },
  {
    name: 'segunda_via_boleto',
    description: 'Emite 2ª via de boleto/fatura. Use quando cliente solicitar fatura ou boleto.',
    input_schema: {
      type: 'object',
      properties: {
        cpfcnpj:  { type: 'string', description: 'CPF ou CNPJ do cliente' },
        contrato: { type: 'string', description: 'ID do contrato' },
      },
      required: ['cpfcnpj', 'contrato'],
    },
  },
  {
    name: 'promessa_pagamento',
    description: 'Libera acesso suspenso/reduzido (1x/mês). Use quando cliente informar que já pagou ou vai pagar.',
    input_schema: {
      type: 'object',
      properties: {
        contrato: { type: 'string', description: 'ID do contrato' },
      },
      required: ['contrato'],
    },
  },
  {
    name: 'historico_ocorrencias',
    description: 'Consulta chamados anteriores do cliente.',
    input_schema: {
      type: 'object',
      properties: {
        contrato: { type: 'string', description: 'ID do contrato' },
      },
      required: ['contrato'],
    },
  },
  {
    name: 'status_rede',
    description: 'Verifica o status geral da rede CITmax. Use para checar se há problemas generalizados antes de diagnosticar o cliente.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'consultar_onu_acs',
    description: 'Lê dados da ONU do cliente via ACS: sinal óptico Rx/Tx, uptime, firmware, IP WAN. Use quando suspeitar de falha óptica ou problema no equipamento.',
    input_schema: {
      type: 'object',
      properties: {
        contrato: { type: 'string', description: 'ID do contrato do cliente' },
      },
      required: ['contrato'],
    },
  },
  {
    name: 'reiniciar_onu_acs',
    description: 'Reinicia a ONU remotamente via ACS (leva ~2 min). Use após diagnosticar problema no equipamento e com confirmação do cliente. Avise que ficará sem internet por ~2 minutos.',
    input_schema: {
      type: 'object',
      properties: {
        contrato: { type: 'string', description: 'ID do contrato do cliente' },
      },
      required: ['contrato'],
    },
  },
  {
    name: 'consultar_radius',
    description: 'Consulta sessão PPPoE ativa no Radius. Use quando verificar_conexao for inconclusivo. Parâmetro: CPF do cliente.',
    input_schema: {
      type: 'object',
      properties: {
        cpfcnpj: { type: 'string', description: 'CPF ou CNPJ do cliente (com ou sem formatação)' },
      },
      required: ['cpfcnpj'],
    },
  },
  {
    name: 'transferir_para_humano',
    description: 'Transfere para atendente humano. Use APENAS quando o cliente pedir explicitamente.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Motivo da transferência' },
      },
    },
  },
  {
    name: 'encerrar_atendimento',
    description: 'Encerra o atendimento quando o problema foi resolvido com sucesso.',
    input_schema: {
      type: 'object',
      properties: {
        mensagem_final: { type: 'string', description: 'Mensagem de despedida ao cliente' },
      },
    },
  },
];

// ── EXECUTOR DE FERRAMENTAS ────────────────────────────────────────────────
export async function executarTool(name, input, ctx) {
  const contrato = input.contrato || ctx?.cliente?.contrato;
  const cpfcnpj  = input.cpfcnpj  || ctx?.cliente?.cpf || ctx?.cliente?.cpfcnpj;

  switch (name) {
    case 'verificar_conexao': {
      const r = await verificarConexao(contrato).catch(e => ({ erro: e.message }));
      if (r?.erro) return `Não consegui verificar a conexão: ${r.erro}`;
      const status = r?.online ? '🟢 Online' : '🔴 Offline';
      return `Status da conexão: ${status}. ${r?.mensagem || ''}`;
    }

    case 'consultar_manutencao': {
      const r = await consultarManutencao().catch(() => null);
      if (!r?.ativa) return 'Não há manutenção ativa na sua área no momento.';
      return `⚠️ Há manutenção ativa na sua área. Previsão de normalização: ${r.previsao || 'em breve'}. Protocolo: ${r.protocolo || 'N/A'}.`;
    }

    case 'criar_chamado': {
      const r = await criarChamado(
        contrato,
        input.ocorrenciatipo || 200,
        input.conteudo || 'Suporte técnico solicitado via chat',
        { contato_nome: input.contato_nome || ctx?.cliente?.nome, contato_telefone: input.contato_telefone, usuario: 'ia_maxxi' }
      ).catch(e => ({ erro: e.message }));
      if (r?.erro) return `Erro ao abrir chamado: ${r.erro}`;
      const protocolo = r?.protocolo || r?.id || r?.ocorrencia_id || JSON.stringify(r);
      return `✅ Chamado aberto com sucesso! Protocolo: *${protocolo}*. O técnico entrará em contato em até 24h úteis.`;
    }

    case 'segunda_via_boleto': {
      const r = await segundaViaBoleto(cpfcnpj, contrato).catch(e => ({ erro: e.message }));
      if (r?.erro) return `Erro ao buscar boleto: ${r.erro}`;
      if (!r?.link && !r?.pix) return 'Não encontrei boletos em aberto para este contrato.';
      let msg = '📄 Segunda via encontrada:\n';
      if (r.valor)     msg += `💰 Valor: R$ ${r.valor}\n`;
      if (r.vencimento) msg += `📅 Vencimento: ${r.vencimento}\n`;
      if (r.pix)       msg += `\n🔑 *PIX:*\n\`${r.pix}\`\n`;
      if (r.link)      msg += `\n🔗 [Link do boleto](${r.link})`;
      return msg;
    }

    case 'promessa_pagamento': {
      const r = await promessaPagamento(contrato).catch(e => ({ erro: e.message }));
      if (r?.erro) return `Erro: ${r.erro}`;
      return '✅ Acesso liberado! Sua conexão deve ser restabelecida em alguns minutos.';
    }

    case 'historico_ocorrencias': {
      const r = await historicoOcorrencias(contrato).catch(() => null);
      if (!r?.length) return 'Não encontrei chamados anteriores para este contrato.';
      const lista = r.slice(0, 5).map(o => `• #${o.id} — ${o.tipo || o.descricao?.slice(0,40)} (${o.status || o.situacao})`).join('\n');
      return `📋 Últimos chamados:\n${lista}`;
    }


    case 'status_rede': {
      const r = await statusRede().catch(() => ({ status: 'ok', mensagem: 'Rede operando normalmente.' }));
      return r.status === 'ok'
        ? '🟢 Rede operando normalmente. Nenhuma manutenção ativa.'
        : `⚠️ ${r.mensagem}`;
    }

    case 'consultar_onu_acs': {
      const r = await consultarOnuAcs(input.serial || '').catch(e => ({ encontrado: false, mensagem: e.message }));
      if (!r.encontrado) return r.mensagem;
      let msg = `📡 Dados da ONU:\n`;
      if (r.sinal_rx) msg += `• Sinal Rx: ${r.sinal_rx} dBm\n`;
      if (r.sinal_tx) msg += `• Sinal Tx: ${r.sinal_tx} dBm\n`;
      if (r.uptime)   msg += `• Uptime: ${r.uptime}\n`;
      if (r.ip_wan)   msg += `• IP WAN: ${r.ip_wan}\n`;
      if (r.status)   msg += `• Status: ${r.status}`;
      return msg;
    }

    case 'reiniciar_onu_acs': {
      const r = await reiniciarOnuAcs(input.serial || '').catch(e => ({ sucesso: false, mensagem: e.message }));
      return r.mensagem;
    }

    case 'consultar_radius': {
      const cpf = input.cpfcnpj || cpfcnpj;
      if (!cpf) return 'CPF não disponível para consultar Radius.';
      const r = await consultarRadius(cpf).catch(e => ({ sessao_ativa: false, mensagem: e.message }));
      return r.mensagem;
    }

    case 'transferir_para_humano':
      return '__TRANSFERIR__:' + (input.motivo || 'Solicitado pelo cliente');

    case 'encerrar_atendimento':
      return '__ENCERRAR__:' + (input.mensagem_final || 'Atendimento encerrado.');

    default:
      return `Ferramenta "${name}" não disponível neste contexto.`;
  }
}
