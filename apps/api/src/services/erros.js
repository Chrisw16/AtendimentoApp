/**
 * erros.js — error tracking local (FASE 13, §139).
 *
 * A regra que faz isto ser barato: **dedup por assinatura**. Sem ela, um
 * defeito que dispara a cada turno vira dezenas de milhares de linhas e a
 * tabela deixa de ser lida — que é o mesmo que não existir.
 *
 * E a regra que faz isto ser seguro: **tudo passa pelo `redigirTexto`**. A
 * mensagem de erro do SGP carrega ficha do assinante (o `sgpPost` embute 400
 * caracteres do corpo cru), e stack trace carrega caminho de arquivo.
 */
import { createHash } from 'node:crypto';
import { getDb } from '../config/db.js';
import { redigirTexto } from './mascarar.js';
import { contextoAtual } from './log.js';

/** Números, UUIDs e ids viram `#` — senão cada ocorrência tem mensagem única. */
export function normalizarMensagem(msg) {
  return String(msg || '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '#')
    // Sem `\b` à direita: "falhou 3x" e "falhou 5x" são o MESMO defeito, e
    // a borda de palavra não casa entre dígito e letra.
    .replace(/\d+/g, '#')
    .slice(0, 300);
}

/** Só os frames do NOSSO código: frame de node_modules muda a cada versão. */
export function primeiroFrameNosso(stack) {
  const linhas = String(stack || '').split('\n');
  const nosso = linhas.find(l => /\/(src|apps)\//.test(l) && !l.includes('node_modules'));
  return (nosso || '').trim().slice(0, 200);
}

export function assinatura(err) {
  const base = [err?.name || 'Error', normalizarMensagem(err?.message), primeiroFrameNosso(err?.stack)].join('|');
  return createHash('sha256').update(base).digest('hex').slice(0, 32);
}

/**
 * Registra um erro. **Nunca lança e nunca espera** — error tracking que derruba
 * a operação é pior que error tracking ausente.
 */
export function registrar(err, { origem = null, rota = null, nivel = 'error' } = {}) {
  try {
    const ctx = contextoAtual() || {};
    const fingerprint = assinatura(err);
    const stackNosso = String(err?.stack || '').split('\n')
      .filter(l => !l.includes('node_modules')).slice(0, 6).join('\n');

    getDb().raw(
      `INSERT INTO erros_app
         (fingerprint, nivel, origem, rota, mensagem, stack, correlation_id, conversa_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (fingerprint) DO UPDATE SET
         ocorrencias = erros_app.ocorrencias + 1,
         ultimo_em   = now(),
         correlation_id = EXCLUDED.correlation_id,
         conversa_id    = EXCLUDED.conversa_id,
         -- Erro que volta depois de "visto" é erro que não foi resolvido.
         status = CASE WHEN erros_app.status = 'visto' THEN 'novo' ELSE erros_app.status END`,
      [
        fingerprint, nivel, origem, rota,
        redigirTexto(err?.message || String(err)).slice(0, 500),
        redigirTexto(stackNosso).slice(0, 2000),
        ctx.correlation_id || null,
        ctx.conversa_id || null,
      ],
    ).catch(e => console.error('[Erros] não registrou:', e.message));
  } catch (e) {
    console.error('[Erros] não registrou:', e.message);
  }
}
