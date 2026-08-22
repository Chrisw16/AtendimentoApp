import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  podeTransicionar, erroTransicao, etapasDaTool, proximaEtapa,
  pendentesObrigatorias, concluido, formatarParaPrompt, STATUS,
} from './playbookHelpers.js';

const etapa = (id, ordem, extra = {}) => ({
  id, ordem, titulo: `Etapa ${ordem}`, obrigatoriedade: 'obrigatoria', tools: [], ...extra,
});

const ETAPAS = [
  etapa('e1', 1, { tools: ['consultar_cliente'] }),
  etapa('e2', 2, { tools: ['verificar_conexao'] }),
  etapa('e3', 3, { obrigatoriedade: 'condicional', condicao: 'o sinal estiver degradado' }),
  etapa('e4', 4, { obrigatoriedade: 'opcional' }),
  etapa('e5', 5, { tools: ['criar_chamado'] }),
];

describe('workflow (§64)', () => {
  test('o caminho é rascunho → teste → publicado', () => {
    assert.ok(podeTransicionar('rascunho', 'teste'));
    assert.ok(podeTransicionar('teste', 'publicado'));
    assert.ok(podeTransicionar('publicado', 'arquivado'));
  });

  test('CRITÉRIO: rascunho NÃO vai direto para publicado — procedimento se valida rodando', () => {
    assert.equal(podeTransicionar('rascunho', 'publicado'), false);
    assert.match(erroTransicao('rascunho', 'publicado'), /teste/);
  });

  test('o estado do meio é "teste", não "revisao" (é o Knowledge que usa revisão)', () => {
    assert.ok(STATUS.includes('teste'));
    assert.equal(STATUS.includes('revisao'), false);
    assert.equal(podeTransicionar('rascunho', 'revisao'), false);
  });

  test('publicado volta para teste, e arquivado só para rascunho', () => {
    assert.ok(podeTransicionar('publicado', 'teste'));
    assert.ok(podeTransicionar('arquivado', 'rascunho'));
    assert.equal(podeTransicionar('arquivado', 'publicado'), false);
  });

  test('mesmo status não é transição', () => {
    for (const s of STATUS) assert.equal(podeTransicionar(s, s), false, s);
  });
});

describe('etapasDaTool — a etapa é provada pela tool, não pela IA', () => {
  test('acha a etapa que a tool evidencia', () => {
    assert.deepEqual(etapasDaTool(ETAPAS, 'verificar_conexao').map(e => e.id), ['e2']);
  });

  test('tool que não pertence a etapa nenhuma não cumpre nada', () => {
    assert.deepEqual(etapasDaTool(ETAPAS, 'listar_planos_ativos'), []);
  });

  test('a mesma tool pode cumprir mais de uma etapa', () => {
    const etapas = [etapa('a', 1, { tools: ['x'] }), etapa('b', 2, { tools: ['x', 'y'] })];
    assert.deepEqual(etapasDaTool(etapas, 'x').map(e => e.id), ['a', 'b']);
  });

  test('entradas vazias não estouram', () => {
    assert.deepEqual(etapasDaTool(null, 'x'), []);
    assert.deepEqual(etapasDaTool(ETAPAS, null), []);
    assert.deepEqual(etapasDaTool(ETAPAS, ''), []);
  });
});

describe('progresso', () => {
  test('a próxima é a de menor ordem ainda pendente', () => {
    assert.equal(proximaEtapa(ETAPAS, []).id, 'e1');
    assert.equal(proximaEtapa(ETAPAS, ['e1']).id, 'e2');
  });

  test('CRITÉRIO: opcional NÃO vira a próxima — se bloqueasse, não seria opcional', () => {
    assert.equal(proximaEtapa(ETAPAS, ['e1', 'e2', 'e3']).id, 'e5', 'pulou a e4 (opcional)');
  });

  test('condicional entra na fila (pode ser a próxima), mas não impede concluir', () => {
    assert.equal(proximaEtapa(ETAPAS, ['e1', 'e2']).id, 'e3');
    assert.equal(concluido(ETAPAS, ['e1', 'e2', 'e5']), true, 'condicional pendente não bloqueia');
  });

  test('tudo cumprido devolve null', () => {
    assert.equal(proximaEtapa(ETAPAS, ['e1', 'e2', 'e3', 'e4', 'e5']), null);
  });

  test('pendentes lista só as obrigatórias', () => {
    assert.deepEqual(pendentesObrigatorias(ETAPAS, ['e1']).map(e => e.id), ['e2', 'e5']);
    assert.equal(concluido(ETAPAS, ['e1']), false);
  });

  test('aceita o formato rico de "feitas" ({etapa_id, via, em})', () => {
    const feitas = [{ etapa_id: 'e1', via: 'tool', em: 'x' }, { etapa_id: 'e2', via: 'manual' }];
    assert.equal(proximaEtapa(ETAPAS, feitas).id, 'e3');
  });

  test('lixo em "feitas" não derruba nem conta como cumprido', () => {
    assert.equal(proximaEtapa(ETAPAS, [null, {}, 42, 'e1']).id, 'e2');
    assert.equal(proximaEtapa(ETAPAS, 'não é array').id, 'e1');
  });
});

describe('formatarParaPrompt', () => {
  const pb = {
    nome: 'Sem conexão', objetivo: 'Restabelecer o acesso',
    criterios_transferencia: 'o cliente pedir cancelamento',
    excecoes: 'cabo rompido relatado com clareza dispensa testes remotos',
  };

  test('CRITÉRIO: etapa cumprida continua VISÍVEL e marcada', () => {
    // Removê-la faz a IA repetir a pergunta que já fez.
    const txt = formatarParaPrompt(pb, ETAPAS, ['e1']);
    assert.match(txt, /\[x\] 1\./);
    assert.match(txt, /\[ \] 2\./);
  });

  test('aponta explicitamente onde a IA está', () => {
    const txt = formatarParaPrompt(pb, ETAPAS, ['e1']);
    assert.match(txt, /2\. Etapa 2.*VOCÊ ESTÁ AQUI/);
    assert.equal((txt.match(/VOCÊ ESTÁ AQUI/g) || []).length, 1, 'só um foco por vez');
  });

  test('CRITÉRIO: as exceções entram — senão vira checklist burro (§61)', () => {
    assert.match(formatarParaPrompt(pb, ETAPAS, []), /cabo rompido/);
  });

  test('leva o critério de transferência junto', () => {
    assert.match(formatarParaPrompt(pb, ETAPAS, []), /cancelamento/);
  });

  test('marca condicional e opcional com o motivo', () => {
    const txt = formatarParaPrompt(pb, ETAPAS, []);
    assert.match(txt, /\(condicional\) — só se o sinal estiver degradado/);
    assert.match(txt, /\(opcional\)/);
  });

  test('quando tudo obrigatório terminou, diz isso em vez de apontar etapa', () => {
    const txt = formatarParaPrompt(pb, ETAPAS, ['e1', 'e2', 'e3', 'e4', 'e5']);
    assert.match(txt, /Todas as etapas obrigatórias/);
    assert.ok(!txt.includes('VOCÊ ESTÁ AQUI'));
  });

  test('proíbe a IA de recitar o procedimento para o cliente', () => {
    assert.match(formatarParaPrompt(pb, ETAPAS, []), /NÃO anuncie as etapas ao cliente/);
  });

  test('playbook sem etapas não produz bloco vazio no prompt', () => {
    assert.equal(formatarParaPrompt(pb, []), '');
    assert.equal(formatarParaPrompt(null, ETAPAS), '');
  });
});
