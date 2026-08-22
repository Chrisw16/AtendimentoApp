/**
 * log.js — logs estruturados e correlation ID (FASE 13, §136/§137).
 *
 * O truque que evita reescrever 199 chamadas de `console.*`: em vez de trocar o
 * logger em cada arquivo, **substitui-se o `console`** uma vez no boot. Os
 * prefixos que já existem (`[Motor]`, `[SGP]`, `[Inbox]`) viram **campo**, sem
 * tocar em nenhum call site.
 *
 * Por que não `pino`: ele substituiria ~40 linhas de formatação e **não** daria
 * nem a propagação de contexto (precisaria de ALS do mesmo jeito) nem a redação
 * de PII em texto livre — e para colher qualquer benefício seria preciso
 * reescrever os 199 call sites. Dependência no caminho de boot de um sistema
 * onde o log é o que se lê no Coolify.
 *
 * O correlation ID viaja por `AsyncLocalStorage` (stdlib): o escopo aberto na
 * porta de entrada segue a cadeia de `await` sozinho, então
 * `handle* → motor → tool → SGP → outbox` herdam o contexto **sem uma única
 * edição**. É isso que torna o §137 barato aqui.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { format } from 'node:util';
import { redigirTexto } from './mascarar.js';

const contexto = new AsyncLocalStorage();

/** Abre um escopo de correlação. Tudo que rodar dentro herda os campos. */
export function comContexto(campos, fn) {
  return contexto.run({ ...campos }, fn);
}

/** Acrescenta campos ao escopo atual (mutação do objeto vivo). No-op fora dele. */
export function anotar(campos = {}) {
  const atual = contexto.getStore();
  if (atual) Object.assign(atual, campos);
}

export function contextoAtual() {
  return contexto.getStore() || null;
}

const NIVEL = { log: 'info', info: 'info', warn: 'warn', error: 'error', debug: 'debug' };
const original = {};

/**
 * Substitui `console.*`. Idempotente — chamar duas vezes não empilha wrappers.
 *
 * @param {object} opts.json  true = uma linha JSON por evento (produção)
 */
export function instalarLogEstruturado({ json = process.env.NODE_ENV === 'production' } = {}) {
  if (original.log) return;

  for (const metodo of ['log', 'info', 'warn', 'error', 'debug']) {
    original[metodo] = console[metodo].bind(console);
    console[metodo] = (...args) => {
      const bruto = format(...args);
      // PII em log foi incidente real (o `[SGP] consultacliente` imprimia o CPF
      // completo). A redação é o ÚLTIMO passo, de onde nenhum call site escapa.
      const msg = redigirTexto(bruto);

      if (!json) return original[metodo](msg);

      // O prefixo `[Origem]` que já existe vira campo — sem tocar em call site.
      const m = msg.match(/^\[([^\]]{1,24})\]\s*/);
      const evento = {
        ts: new Date().toISOString(),
        nivel: NIVEL[metodo] || 'info',
        ...(m ? { origem: m[1] } : {}),
        msg: m ? msg.slice(m[0].length) : msg,
        ...(contexto.getStore() || {}),
      };
      original[metodo](JSON.stringify(evento));
    };
  }
}

/** Volta ao console original — usado em teste. */
export function desinstalarLogEstruturado() {
  for (const [metodo, fn] of Object.entries(original)) console[metodo] = fn;
  for (const k of Object.keys(original)) delete original[k];
}
