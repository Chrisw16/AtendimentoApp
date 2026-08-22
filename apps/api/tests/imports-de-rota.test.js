/**
 * A FASE 5 achou, em produção, um `auditar(...)` sendo chamado em
 * `routes/chat.js` sem que o módulo fosse importado — assumir, devolver-para-IA
 * e encerrar respondiam 500 desde a FASE 3. `node --check` não pega: em ESM o
 * identificador só estoura no RUNTIME, no momento da chamada.
 *
 * Esta é a guarda mais barata contra a repetição: para cada helper conhecido,
 * quem chama tem que importar.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join }             from 'node:path';
import { fileURLToPath }             from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** helper → o módulo de onde ele tem que vir. */
const HELPERS = {
  auditar:   'auditoria.js',
  ipDe:      'auditoria.js',
  broadcast: 'sseManager.js',
  getDb:     'db.js',
};

function arquivos(dir) {
  return readdirSync(join(SRC, dir))
    .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map(f => [`${dir}/${f}`, readFileSync(join(SRC, dir, f), 'utf8')]);
}

/**
 * Mesma família de erro, outra forma: `import * as mensagemRepo` sobre um
 * módulo que exporta `{ mensagemRepo }` compila, e só quebra no clique —
 * `mensagemRepo.criar` é `undefined`. Aconteceu na FASE 5, antes do merge.
 */
describe('repositórios são importados pelo nome, nunca como namespace', () => {
  test('nenhum `import * as` sobre um repositório', () => {
    const errados = [...arquivos('routes'), ...arquivos('services')]
      .filter(([, src]) => /import\s+\*\s+as\s+\w+\s+from\s+'[^']*repositories\//.test(src))
      .map(([caminho]) => caminho);
    assert.deepEqual(errados, [],
      `os repositórios exportam um OBJETO nomeado — o namespace não tem os métodos: ${errados.join(', ')}`);
  });
});

describe('helper chamado é helper importado', () => {
  for (const [helper, modulo] of Object.entries(HELPERS)) {
    test(`${helper}() sempre vem de ${modulo}`, () => {
      const faltando = [...arquivos('routes'), ...arquivos('services')]
        .filter(([caminho, src]) =>
          !caminho.endsWith(`/${modulo}`) &&
          new RegExp(`(^|[^.\\w])${helper}\\s*\\(`, 'm').test(src) &&
          // `import { x } from` estático OU `await import(...)` dinâmico
          !new RegExp(`(import\\s*\\{[^}]*\\b${helper}\\b[^}]*\\}|\\b${helper}\\b[^\\n]*await import)`, 'm').test(src) &&
          !new RegExp(`(function|const)\\s+${helper}\\b`).test(src))
        .map(([caminho]) => caminho);

      assert.deepEqual(faltando, [],
        `chamam ${helper}() sem importar — ReferenceError no primeiro clique: ${faltando.join(', ')}`);
    });
  }
});
