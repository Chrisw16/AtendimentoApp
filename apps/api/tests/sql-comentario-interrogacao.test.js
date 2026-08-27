/**
 * O knex trata `?` como PLACEHOLDER mesmo dentro de comentário SQL (`-- ...`).
 * Já custou duas vezes: um `"? IS NULL"` num comentário ("Expected 7 bindings,
 * saw 8") e, em 2026-08-27, o `GET /api/dashboard/kpis` inteiro em produção —
 * `42P18 could not determine data type of parameter $1`, porque um comentário
 * terminava em "nesta conversa?".
 *
 * Em .js, linha que COMEÇA com `--` só existe dentro de template literal de
 * SQL (comentário de JS é `//`). Então a varredura é essa, e é barata.
 */
import { test }                      from 'node:test';
import assert                        from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join }             from 'node:path';
import { fileURLToPath }             from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function arquivos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return arquivos(p);
    return e.name.endsWith('.js') && !e.name.endsWith('.test.js') ? [p] : [];
  });
}

test('nenhum comentário SQL contém `?` (o knex conta como binding)', () => {
  const culpados = arquivos(SRC).flatMap(f =>
    readFileSync(f, 'utf8').split('\n')
      .map((linha, i) => ({ linha, n: i + 1 }))
      .filter(({ linha }) => /^\s*--/.test(linha) && linha.includes('?'))
      .map(({ n, linha }) => `${f.replace(SRC, 'src')}:${n} → ${linha.trim()}`));

  assert.deepEqual(culpados, [], `\n${culpados.join('\n')}`);
});
