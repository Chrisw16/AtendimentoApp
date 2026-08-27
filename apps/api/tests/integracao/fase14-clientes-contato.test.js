/**
 * A aba Clientes como histórico de contato, contra Postgres.
 *
 * O que só o banco prova: a view `clientes_contato` agrupa certo, o telefone
 * NULL não funde clientes distintos, o vínculo com o SGP sobrevive à troca de
 * conversa — e as quatro tabelas do ERP foram mesmo embora.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar, criarConversa } from './_ambiente.js';

const TABELAS = ['mensagens', 'conversas', 'agentes'];

describe('Clientes = histórico de contato (migrations 027/028)', { skip: motivoSkip() }, () => {
  let db;

  before(async () => { db = await prepararBanco(); });
  after(async () => { await db?.destroy?.(); });
  beforeEach(async () => { await limpar(db, TABELAS); });

  test('as tabelas do ERP não existem mais', async () => {
    for (const t of ['ocorrencias', 'ordens_servico', 'equipamentos_rede', 'alertas_rede']) {
      assert.equal(await db.schema.hasTable(t), false, `${t} deveria ter sido dropada pela 027`);
    }
  });

  test('Cobertura e notas sobreviveram — nasceram nas mesmas migrations', async () => {
    for (const t of ['zonas_cobertura', 'consultas_cobertura', 'notas']) {
      assert.equal(await db.schema.hasTable(t), true, `${t} não deveria ter saído junto`);
    }
  });

  test('cinco conversas do mesmo telefone viram UM contato com contagem 5', async () => {
    for (let i = 0; i < 5; i++) {
      await criarConversa(db, { telefone: '5584999887766', nome: 'Maria', status: 'encerrada' });
    }
    const linhas = await db('clientes_contato');
    assert.equal(linhas.length, 1, 'o groupBy antigo devolvia uma linha por conversa');
    assert.equal(Number(linhas[0].conversas), 5);
  });

  test('⚠️ telefone NULL não funde clientes distintos', async () => {
    // A armadilha da FASE 6, repetida na window de recontato da 025: com
    // GROUP BY telefone puro, TODA conversa de widget cai num grupo só.
    await criarConversa(db, { canal: 'widget', telefone: null, nome: 'Anônimo A' });
    await criarConversa(db, { canal: 'widget', telefone: null, nome: 'Anônimo B' });
    const linhas = await db('clientes_contato');
    assert.equal(linhas.length, 2, 'duas pessoas viraram uma');
  });

  test('o vínculo com o SGP sobrevive à conversa que o descobriu', async () => {
    // A IA identificou na primeira conversa; a segunda nasceu sem cpf, como
    // `obterOuCriar` cria. O contato tem que continuar identificado.
    await criarConversa(db, {
      telefone: '5584988776655', nome: 'João', cpf: '12345678900',
      contrato_id: '4321', status: 'encerrada',
      criado_em: new Date(Date.now() - 86400000),
    });
    await criarConversa(db, { telefone: '5584988776655', status: 'ia' });

    const [c] = await db('clientes_contato').where({ chave: '5584988776655' });
    assert.equal(c.cpf, '12345678900', 'o CPF conhecido sumiu no contato seguinte');
    assert.equal(c.contrato_id, '4321');
    assert.equal(Number(c.conversas), 2);
    assert.equal(c.em_atendimento, true, 'há uma conversa não encerrada no grupo');
  });

  test('o último valor não-nulo vence — nome dito depois substitui o anterior', async () => {
    // Só UMA conversa viva por (telefone, canal) — unique parcial da 014.
    // As anteriores são encerradas, como na vida real.
    const chave = '5584911112222';
    const dia = (n) => new Date(Date.now() - n * 86400000);
    await criarConversa(db, { telefone: chave, nome: 'J',          status: 'encerrada', criado_em: dia(3) });
    await criarConversa(db, { telefone: chave, nome: 'João Silva', status: 'encerrada', criado_em: dia(2) });
    await criarConversa(db, { telefone: chave, nome: null,         status: 'encerrada', criado_em: dia(1) });

    const [c] = await db('clientes_contato').where({ chave });
    assert.equal(c.nome, 'João Silva');
  });

  test('contato sem identificação nenhuma aparece — é histórico, não cadastro', async () => {
    await criarConversa(db, { telefone: '5584900000000' });
    const [c] = await db('clientes_contato').where({ chave: '5584900000000' });
    assert.equal(c.cpf, null);
    assert.equal(Number(c.conversas), 1);
  });

  test('a busca por dígitos casa telefone e CPF gravados sem máscara', async () => {
    // Espelha o whereRaw da rota: dígitos dos dois lados. O agente cola
    // "123.456.789-00", o SGP gravou "12345678900".
    await criarConversa(db, { telefone: '5584999887766', cpf: '12345678900' });
    const so = (col) => `regexp_replace(COALESCE(${col},''), '\\D', '', 'g')`;
    const porCpf = await db('clientes_contato')
      .whereRaw(`${so('cpf')} LIKE '%' || ? || '%'`, ['12345678900']);
    assert.equal(porCpf.length, 1);
    const porFone = await db('clientes_contato')
      .whereRaw(`${so('telefone')} LIKE '%' || ? || '%'`, ['999887766']);
    assert.equal(porFone.length, 1);
  });

  test('⚠️ o preview da conversa é REDIGIDO — mascarar campo não alcança texto livre', async () => {
    // A fala crua do cliente vira `ultima_mensagem` (slice de 120 do texto).
    // Sem redigir, o CPF por extenso apareceria duas linhas abaixo do mesmo
    // CPF mascarado, na mesma tela, para agente sem `ver_dados_completos`.
    const { redigirTexto } = await import('../../src/services/mascarar.js');
    const fala = 'meu cpf é 111.444.777-35, quero a segunda via';
    const redigido = redigirTexto(fala);
    assert.ok(!redigido.includes('111.444.777-35'), `CPF vazou no preview: ${redigido}`);
    assert.ok(!redigido.includes('11144477735'));
  });

  test('conversa VIVA com status NULL ainda acende "em atendimento"', async () => {
    // bool_or ignora NULL: sem o COALESCE o grupo inteiro devolvia NULL, que
    // em JS é falsy — conversa aberta sem o selo.
    await db('conversas').insert({ canal: 'widget', telefone: '5584922223333', status: null });
    const [c] = await db('clientes_contato').where({ chave: '5584922223333' });
    assert.equal(c.em_atendimento, true);
  });

  test('ILIKE com ESCAPE: um "%" digitado não devolve a base inteira', async () => {
    await criarConversa(db, { telefone: '5584900000001', nome: 'Maria' });
    await criarConversa(db, { telefone: '5584900000002', nome: 'Desconto 50%' });
    const { termosBusca } = await import('../../src/services/clientesHelpers.js');
    const achou = await db('clientes_contato')
      .whereRaw("nome ILIKE '%' || ? || '%' ESCAPE '\\'", [termosBusca('50%').texto]);
    assert.equal(achou.length, 1, 'o % escapou e varreu a base');
    assert.equal(achou[0].nome, 'Desconto 50%');
  });
});
