/**
 * Contrato entre os catálogos que precisam concordar (FASE 2, §19).
 *
 * O sistema descreve o mesmo nó em três lugares:
 *   1. `apps/web/src/lib/nodeTypes.js`      — a paleta e as portas do editor
 *   2. `apps/api/.../fluxoValidador.js`     — `NOS`, as portas que o motor EMITE
 *   3. `apps/api/.../motorFluxo.js`         — o `switch` que executa
 *
 * O plano pede um registry compartilhado. Um registry de verdade esbarra no
 * empacotamento: o Dockerfile raiz builda o frontend num estágio que só copia
 * `apps/web/`, e o `docker-compose` builda cada app com `context: ./apps/*` —
 * uma pasta na raiz ficaria fora dos dois.
 *
 * Só que `nodeTypes.js` é **JS puro** (sem JSX, sem React), então este teste
 * importa os dois lados direto e falha quando eles divergem. Mesmo efeito do
 * registry para o que importa (a divergência não passa despercebida), sem tocar
 * em build nenhum. É por isso que `IA_TOOLS_LIST` mora em `nodeTypes.js` e não
 * dentro do `FluxoEditor.jsx`: JSX não é importável aqui.
 *
 * O `switch` do motor não é importável (puxa Knex no topo), então é lido como
 * texto — feio, mas é a diferença entre ter e não ter esta rede.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NODE_TYPES, PORTA_META, IA_TOOLS_LIST, IA_TOOLS_DEFAULT } from '../../web/src/lib/nodeTypes.js';
import { NOS } from '../src/services/fluxoValidador.js';
import { TOOLS_PADRAO } from '../src/services/fluxoHelpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Os `case` do `switch` de `processarNo` — o que o motor sabe executar. */
function tiposDoMotor() {
  const src = readFileSync(resolve(__dirname, '../src/services/motorFluxo.js'), 'utf8').split('\n');
  const ini = src.findIndex(l => l.includes('async function processarNo'));
  const fim = src.findIndex((l, i) => i > ini && l.trim() === 'default:');
  assert.ok(ini > 0 && fim > ini, 'não achei o switch de processarNo — o teste precisa ser reapontado');
  return new Set([...src.slice(ini, fim).join('\n').matchAll(/case '([a-z_]+)'/g)].map(m => m[1]));
}

describe('contrato entre os catálogos de nó', () => {
  test('todo tipo da paleta é executável pelo motor', () => {
    const motor = tiposDoMotor();
    const orfaos = Object.keys(NODE_TYPES).filter(t => !motor.has(t));
    assert.deepEqual(orfaos, [],
      `tipos arrastáveis no editor que o motor não executa (caem no default): ${orfaos.join(', ')}`);
  });

  test('todo tipo da paleta é conhecido pelo validador', () => {
    const faltando = Object.keys(NODE_TYPES).filter(t => !NOS[t]);
    assert.deepEqual(faltando, [],
      `tipos na paleta sem entrada em NOS — o validador não sabe validá-los: ${faltando.join(', ')}`);
  });

  test('toda porta declarada na paleta tem cor/label em PORTA_META', () => {
    const semMeta = [...new Set(Object.values(NODE_TYPES).flatMap(n => n.portas || []))]
      .filter(p => !PORTA_META[p]);
    assert.deepEqual(semMeta, [], `portas sem meta (saem cinza e sem rótulo): ${semMeta.join(', ')}`);
  });

  test('portas condicionais da paleta (portasSeTimeout) são emitidas quando configuradas', () => {
    // FASE 4: `aguardar_resposta` só ganha `timeout`/`max_tentativas` quando
    // `cfg.timeout > 0`. Se a paleta desenhar e o motor não emitir, a aresta
    // ligada ali nunca dispara — que é o bug que este arquivo inteiro existe
    // para pegar, só que na variante condicional.
    const cfg = { timeout: 30, max_tentativas: 3 };
    for (const [tipo, def] of Object.entries(NODE_TYPES)) {
      for (const porta of def.portasSeTimeout || []) {
        assert.ok(PORTA_META[porta], `porta ${porta} sem meta`);
        const emitidas = new Set([
          ...(NOS[tipo]?.estaticas || []),
          ...(NOS[tipo]?.dinamicas?.(cfg) || []),
        ]);
        assert.ok(emitidas.has(porta),
          `${tipo}: a paleta desenha "${porta}" com timeout configurado, o validador/motor não emite`);
      }
    }
  });

  test('as portas ESTÁTICAS da paleta são realmente emitidas pelo motor', () => {
    // Só compara os nós de portas fixas: onde `NOS` tem `dinamicas`, as portas
    // vêm da config do nó (botões, ramos, rotas) e não cabem num catálogo.
    const divergencias = [];
    for (const [tipo, def] of Object.entries(NODE_TYPES)) {
      const n = NOS[tipo];
      if (!n || n.dinamicas) continue;
      const emitidas = new Set([...(n.estaticas || []), ...(n.fallback || [])]);
      const mortas = (def.portas || []).filter(p => !emitidas.has(p));
      if (mortas.length) divergencias.push(`${tipo}: ${mortas.join(', ')}`);
    }
    assert.deepEqual(divergencias, [],
      'portas desenhadas no editor que o motor NUNCA emite — aresta ligada nelas ' +
      'nunca dispara e o cliente morre no nó:\n  ' + divergencias.join('\n  '));
  });
});

describe('contrato entre os catálogos de tool', () => {
  test('o default do editor é exatamente o default do motor', () => {
    // O bug que isto trava: até 2026-08-21 a tela marcava `listar_planos_ativos`
    // e `listar_vencimentos` por default e o motor as deixava desligadas — o
    // operador via o checkbox marcado e a tool não rodava.
    assert.deepEqual([...IA_TOOLS_DEFAULT].sort(), [...TOOLS_PADRAO].sort(),
      'o checkbox da tela e as tools que o motor liga divergiram');
  });

  test('toda tool oferecida na tela existe de verdade no backend', async () => {
    const { IA_TOOLS } = await import('../src/services/iaTools.js');
    const reais = new Set(IA_TOOLS.map(t => t.name));
    const fantasmas = IA_TOOLS_LIST.map(t => t.id).filter(id => !reais.has(id));
    assert.deepEqual(fantasmas, [],
      `tools oferecidas no editor que não existem no backend: ${fantasmas.join(', ')}`);
  });

  test('o default do motor só cita tools que existem', async () => {
    const { IA_TOOLS } = await import('../src/services/iaTools.js');
    const reais = new Set(IA_TOOLS.map(t => t.name));
    const fantasmas = TOOLS_PADRAO.filter(n => !reais.has(n));
    assert.deepEqual(fantasmas, [], `tools no default do motor que não existem: ${fantasmas.join(', ')}`);
  });
});

/**
 * FASE 6 — a tela de Agentes e o `permissoes.js` do backend precisam falar da
 * MESMA lista. A lista antiga (chat/tarefas/frota/ocorrências) existiu por
 * fases inteiras sem nenhum leitor: o admin marcava caixas e o sistema seguia
 * deixando todo mundo fazer tudo. Este teste é para que isso não se repita —
 * permissão desenhada na tela que o backend não conhece é controle de mentira.
 */
describe('contrato entre a tela de permissões e o backend', () => {
  test('as chaves da tela existem em CAPACIDADES, e vice-versa', async () => {
    const { readFileSync } = await import('node:fs');
    const { CAPACIDADES }  = await import('../src/services/permissoes.js');

    const src = readFileSync(new URL('../../web/src/pages/Agentes.jsx', import.meta.url), 'utf8');
    const bloco = src.match(/const PERMISSOES_LABELS = \{([\s\S]*?)\};/);
    assert.ok(bloco, 'PERMISSOES_LABELS sumiu de Agentes.jsx');
    const daTela = [...bloco[1].matchAll(/^\s*([a-z_0-9]+)\s*:/gm)].map(m => m[1]);

    const doBackend = Object.keys(CAPACIDADES);
    assert.deepEqual([...daTela].sort(), [...doBackend].sort(),
      'a tela oferece permissões que o backend ignora (ou esconde as que ele exige)');
  });

  test('o conjunto de "negada por omissão" da tela bate com o padrão do backend', async () => {
    const { readFileSync } = await import('node:fs');
    const { CAPACIDADES }  = await import('../src/services/permissoes.js');

    const src = readFileSync(new URL('../../web/src/pages/Agentes.jsx', import.meta.url), 'utf8');
    const bloco = src.match(/NEGADA_POR_OMISSAO = new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(bloco, 'NEGADA_POR_OMISSAO sumiu de Agentes.jsx');
    const daTela = [...bloco[1].matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]).sort();

    const doBackend = Object.entries(CAPACIDADES).filter(([, d]) => !d.padrao).map(([k]) => k).sort();
    assert.deepEqual(daTela, doBackend,
      'a caixa apareceria desmarcada para uma permissão que o agente TEM (ou o contrário)');
  });
});
