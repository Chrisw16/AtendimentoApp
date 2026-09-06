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

// ── PROMESSA DE PAGAMENTO E CHAMADO ───────────────────────────────
//
// As duas tools que devolvem PROTOCOLO ao cliente. Elas moram aqui, e não
// inline no `iaTools.js`, porque foi um buraco no retorno de uma delas que fez
// a IA anunciar o protocolo `25438-LOS-001` em 27/08 — o número do contrato
// com um sufixo fabricado. §68 já listava *protocolo* nominalmente e não
// bastou: proibir inventar não fecha um buraco, só o nomeia. O que fecha é a
// tool dizer, com todas as letras, que não há número — e proibir ali mesmo.

/** `2026-09-08` → `08/09`. Devolve null para qualquer outra coisa. */
function diaMes(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}` : null;
}

const SEM_PROTOCOLO = 'O sistema não devolveu número de protocolo. NÃO informe nenhum protocolo ao cliente '
  + 'e não invente um número; diga que o registro foi feito e que o protocolo será informado pelo atendimento.';

/**
 * O retorno de `promessaPagamento` vira texto para o modelo.
 *
 * Duas coisas que o código anterior jogava fora: o **protocolo** (enquanto o
 * prompt financeiro manda "informe o resultado com o protocolo" — é o convite
 * à invenção) e os **dias liberados**, que é a informação que o cliente de
 * fato quer.
 *
 * E uma que ele dizia errado: `promessaPagamento` marca `erro` sempre que
 * `status !== 1`, inclusive quando a recusa é legítima — a promessa é 1x/mês.
 * Devolver `"Erro: ..."` faz o modelo repassar ao cliente que o SISTEMA
 * quebrou, quando o que houve foi uma regra de negócio sendo aplicada.
 */
export function formatarPromessaIA(r) {
  if (!r?.liberado) {
    const motivo = r?.erro || r?.msg;
    return 'Não foi possível liberar o acesso por promessa de pagamento.'
      + (motivo ? ` Motivo informado pelo sistema: ${motivo}.` : '')
      + ' NÃO prometa liberação ao cliente. Ofereça a 2ª via do boleto ou encaminhe ao time Financeiro.';
  }
  // Só imprime o número de dias quando ele VEIO do SGP. `promessaPagamento`
  // fabricava um `|| 3` quando o campo faltava, e uma correção que existe para
  // acabar com número inventado não pode imprimir um.
  const dias  = Number(r.liberado_dias) > 0 ? `${Number(r.liberado_dias)} dias` : null;
  const ate   = diaMes(r.data_promessa);
  const prazo = [dias && `por ${dias}`, ate && `até ${ate}`].filter(Boolean).join(', ');
  const linha = `✅ Promessa de pagamento registrada. Acesso liberado${prazo ? ` ${prazo}` : ''}.`
    + ' A conexão volta em alguns minutos.';
  return r.protocolo ? `${linha} Protocolo: *${r.protocolo}*.` : `${linha}\n${SEM_PROTOCOLO}`;
}

/**
 * O retorno de `criarChamado` vira texto para o modelo.
 *
 * `criarChamado` já resolve o protocolo entre os formatos do SGP e já calcula
 * `chamado_aberto` — o código anterior ignorava os dois e refazia a conta com
 * um `|| JSON.stringify(r)` no fim, que punha o corpo cru da resposta (com o
 * nome do assinante dentro) no lugar do protocolo.
 *
 * E não crava prazo: o `"em até 24h úteis"` que estava aqui não era alucinação
 * da IA, era ela repetindo a tool — inclusive generalizando para o comercial,
 * onde não vale. SLA de operação mora na base de conhecimento.
 */
export function formatarChamadoIA(r) {
  if (!r?.chamado_aberto) {
    const motivo = r?.erro || r?.msg;
    return `Não consegui abrir o chamado${motivo ? `: ${motivo}` : ' agora'}.`
      + ' NÃO diga ao cliente que o chamado foi aberto. Tente novamente ou encaminhe para um atendente.';
  }
  const base = '✅ Chamado aberto com sucesso!';
  return r.protocolo
    ? `${base} Protocolo: *${r.protocolo}*. Informe o protocolo ao cliente.`
    : `${base}\n${SEM_PROTOCOLO}`;
}

/**
 * Dias inteiros entre hoje e uma data `AAAA-MM-DD`; `null` se não der para ler
 * ou se já passou.
 *
 * ⚠️ Referencial **UTC dos dois lados**. A data da promessa nasce de um
 * `.toISOString()`, e comparar contra a data LOCAL dá off-by-one em toda
 * máquina a oeste de Greenwich — inclusive a nossa (UTC-3): perto da
 * meia-noite local, "hoje" em UTC já é amanhã, e 3 dias viram 4. Mora aqui, e
 * não em `integrations.js`, porque `integrations` não é importável em teste e
 * este off-by-one só aparece em fuso e em virada de dia.
 */
export function diasAte(iso, agora = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  const alvo = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const base = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  const d = Math.round((alvo - base) / 86_400_000);
  return d > 0 ? d : null;
}
