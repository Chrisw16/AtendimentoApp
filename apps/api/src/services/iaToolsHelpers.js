/**
 * iaToolsHelpers.js — funções puras de formatação das tools da IA (ia_responde).
 * Vivem aqui (e não em iaTools.js) porque iaTools.js importa getDb/integrations.js
 * (knex no topo) e não é importável em teste unitário. Teste: iaToolsHelpers.test.js.
 */

// Formata a resposta de segundaViaBoleto(integrations.js) numa mensagem pro cliente.
// A tool lia r.link/r.pix/r.valor/r.vencimento (campos inexistentes) e sempre caía no
// "não encontrei boleto". Os campos REAIS são valor_cobrado / vencimento_atual /
// link_cobranca||link_boleto / pix_copia_cola, e há o caso de múltiplos boletos.
export function formatarBoletoIA(r) {
  if (!r || r.erro) {
    return `Não consegui buscar o boleto: ${r?.mensagem || r?.erro || 'erro desconhecido'}`;
  }
  if (r.status === 'sem_boleto') {
    return r.mensagem || 'Não encontrei boletos em aberto para este contrato. Sua conta está em dia! 🎉';
  }

  if (r.status === 'multiplos_boletos') {
    const linhas = (r.lista || []).map((b, i) => {
      const venc = b.vencimento_atual ? ` — vence ${b.vencimento_atual}` : '';
      return `${b.indice || i + 1}. R$ ${b.valor_cobrado}${venc}`;
    }).join('\n');
    return `📄 Encontrei *${r.total} boletos em aberto*:\n${linhas}\n\n`
      + 'Me diga o número do que você quer que eu envio o PIX e o link.';
  }

  // Boleto único (status 'boleto_encontrado').
  const link = r.link_cobranca || r.link_boleto;
  let msg = '📄 Segunda via encontrada:\n';
  if (r.valor_cobrado != null)  msg += `💰 Valor: R$ ${r.valor_cobrado}\n`;
  if (r.vencimento_atual)       msg += `📅 Vencimento: ${r.vencimento_atual}${r.vencido ? ' (vencido)' : ''}\n`;
  if (r.pix_copia_cola)         msg += `\n🔑 PIX copia e cola:\n\`${r.pix_copia_cola}\`\n`;
  if (link)                     msg += `\n🔗 ${link}`;
  return msg;
}
