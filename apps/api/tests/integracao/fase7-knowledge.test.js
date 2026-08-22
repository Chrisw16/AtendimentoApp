/**
 * Knowledge Hub (FASE 7) contra Postgres.
 *
 * Aqui mora o que é IMPOSSÍVEL testar puro: a busca full-text em português (a
 * coluna gerada, o stemmer, a normalização de acento) e a chave de lacuna, que
 * usa o MESMO pipeline da busca — foi por isso que ela saiu do JS.
 *
 * O workflow editorial em si (quais transições existem) está na suíte pura,
 * em `knowledgeHelpers.test.js`; aqui se testa o efeito dele no banco.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar } from './_ambiente.js';

const TABELAS = ['knowledge_gaps', 'knowledge_feedback', 'knowledge_uso', 'knowledge_versoes',
  'knowledge_artigos', 'knowledge_categorias', 'conversas', 'agentes'];

describe('FASE 7 — Knowledge Hub', { skip: motivoSkip() }, () => {
  let db, kb;

  before(async () => {
    db = await prepararBanco();
    kb = await import('../../src/services/knowledge.js');
  });

  after(async () => { await db?.destroy?.(); });
  beforeEach(async () => { await limpar(db, TABELAS); });

  const criar = async (dados = {}) => {
    const [a] = await db('knowledge_artigos').insert({
      titulo: 'Como trocar a senha do Wi-Fi',
      slug: `art-${Math.random().toString(36).slice(2, 9)}`,
      conteudo: 'Acesse 192.168.0.1, entre com admin e altere o campo de senha da rede sem fio.',
      status: 'publicado',
      ...dados,
    }).returning('*');
    return a;
  };

  // ── BUSCA ───────────────────────────────────────────────────────
  describe('busca full-text em português', () => {
    test('acha pelo assunto, não só pela palavra exata', async () => {
      await criar();
      const r = await kb.buscar('trocar senha wifi');
      assert.equal(r.length, 1);
      assert.ok(r[0].score > 0);
    });

    test('CRITÉRIO: o stemmer junta as flexões — "troco" acha "trocar"', async () => {
      await criar();
      assert.equal((await kb.buscar('como eu troco a senha')).length, 1);
    });

    test('CRITÉRIO: quem digita SEM acento encontra o artigo COM acento', async () => {
      // É metade dos clientes. Sem `knowledge_norm` no índice E na consulta,
      // "conexao" e "conexão" viram radicais diferentes e não casam.
      await criar({ titulo: 'Conexão instável à noite', conteudo: 'Verifique a fiação e o roteador.' });
      assert.equal((await kb.buscar('conexao instavel')).length, 1, 'sem acento não achou');
      assert.equal((await kb.buscar('conexão instável')).length, 1, 'com acento não achou');
    });

    test('CRITÉRIO: "wifi" encontra "Wi-Fi" — e vice-versa', async () => {
      // O hífen é o segundo assassino silencioso da busca, depois do acento:
      // `Wi-Fi` vira os lexemas wi-f/wi/fi e `wifi` vira wif. Como "wifi" é a
      // palavra mais comum do suporte de um provedor, isso sozinho esvaziaria
      // a base inteira aos olhos de quem pergunta.
      await criar({ titulo: 'Configurar o Wi-Fi', conteudo: 'Rede sem fio do roteador.' });
      assert.equal((await kb.buscar('wifi')).length, 1, '"wifi" não achou "Wi-Fi"');
      assert.equal((await kb.buscar('wi-fi')).length, 1, '"wi-fi" não achou "Wi-Fi"');
      assert.equal((await kb.buscar('configurar wifi')).length, 1);
    });

    test('CRITÉRIO: só PUBLICADO chega na busca da IA (§52)', async () => {
      for (const status of ['rascunho', 'revisao', 'arquivado']) {
        await criar({ status, titulo: `Segredo ${status}`, conteudo: 'conteudo secreto sobre boleto' });
      }
      assert.deepEqual(await kb.buscar('boleto secreto'), []);
      assert.equal((await kb.buscar('boleto secreto', { incluirNaoPublicados: true })).length, 3);
    });

    test('título pesa mais que corpo — o artigo SOBRE o assunto vem primeiro', async () => {
      await criar({ titulo: 'Segunda via de boleto', conteudo: 'Passo a passo para emitir.' });
      await criar({ titulo: 'Regras de instalação', conteudo: 'O técnico não recebe boleto no local.' });
      const r = await kb.buscar('boleto');
      assert.match(r[0].titulo, /Segunda via/);
    });

    test('pergunta com pontuação que quebraria to_tsquery não derruba a busca', async () => {
      await criar();
      // `to_tsquery` lançaria sintaxe inválida aqui e a resposta da IA morreria.
      for (const q of ['???', 'senha & | !', '"aspas soltas', 'wifi -senha']) {
        assert.ok(Array.isArray(await kb.buscar(q)), `quebrou em: ${q}`);
      }
    });

    test('CRITÉRIO: pergunta longa do cliente não morre por UMA palavra fora', async () => {
      // `websearch_to_tsquery` faz E entre os termos. A IA passa a fala do
      // cliente inteira, e uma palavra que não está em artigo nenhum ("disse")
      // derrubava a busca toda — com o artigo certo bem ali. Achado com a
      // carga inicial de conhecimento (migration 024).
      await criar({ titulo: 'Objeção: está caro', conteudo: 'Não ofereça desconto imediatamente.' });

      assert.equal((await kb.buscar('caro')).length, 1, 'controle: o termo isolado acha');
      assert.equal((await kb.buscar('o cliente disse que achou muito caro')).length, 1,
        'a pergunta como o cliente escreveu tem que achar');
    });

    test('o modo preciso (E) tem precedência sobre o abrangente (OU)', async () => {
      await criar({ titulo: 'Boleto vencido', conteudo: 'Sobre boleto em atraso.' });
      await criar({ titulo: 'Instalação', conteudo: 'Prazo de instalação e boleto da adesão.' });

      // "boleto vencido" casa os dois no modo OU; no modo E só o primeiro —
      // e é o primeiro que deve vir.
      const r = await kb.buscar('boleto vencido');
      assert.equal(r.length, 1, 'o E resolveu, o OU não precisou entrar');
      assert.match(r[0].titulo, /Boleto vencido/);
    });

    test('busca vazia devolve vazio sem ir ao banco', async () => {
      assert.deepEqual(await kb.buscar(''), []);
      assert.deepEqual(await kb.buscar(null), []);
    });

    test('filtra por tipo e por categoria', async () => {
      const [cat] = await db('knowledge_categorias').insert({ nome: 'Financeiro', slug: 'financeiro' }).returning('*');
      await criar({ titulo: 'Boleto vencido', conteudo: 'texto sobre boleto', tipo: 'faq', categoria_id: cat.id });
      await criar({ titulo: 'Boleto e multa', conteudo: 'outro texto sobre boleto', tipo: 'politica' });

      assert.equal((await kb.buscar('boleto', { tipo: 'faq' })).length, 1);
      assert.equal((await kb.buscar('boleto', { categoria: cat.id })).length, 1);
      assert.equal((await kb.buscar('boleto')).length, 2);
    });

    test('artigo com revisão vencida vem MARCADO, não sumido', async () => {
      await criar({ valido_ate: '2020-01-01' });
      const [r] = await kb.buscar('senha wifi');
      assert.equal(r.desatualizado, true, 'sumir deixaria a IA sem resposta por causa de uma data esquecida');
    });

    test('editar o artigo atualiza o índice sozinho (coluna gerada)', async () => {
      const a = await criar({ titulo: 'Assunto antigo', conteudo: 'nada a ver' });
      assert.deepEqual(await kb.buscar('roteador queimado'), []);

      await db('knowledge_artigos').where({ id: a.id }).update({ conteudo: 'Procedimento para roteador queimado' });
      assert.equal((await kb.buscar('roteador queimado')).length, 1, 'sem trigger para esquecer de disparar');
    });
  });

  // ── LACUNAS ─────────────────────────────────────────────────────
  describe('lacunas de conhecimento (§56)', () => {
    test('CRITÉRIO: variações da mesma pergunta viram UMA lacuna com contador', async () => {
      // É o que transforma o registro em "lacunas recorrentes". Sem stemming
      // seriam 4 linhas de 1 ocorrência e o painel não mostraria nada.
      for (const q of ['Como troco a senha do WiFi?', 'como trocar a senha do wifi',
        'TROCAR SENHA WIFI!!!', 'wifi senha trocar']) {
        await kb.registrarGap(q);
      }
      const gaps = await db('knowledge_gaps');
      assert.equal(gaps.length, 1, JSON.stringify(gaps.map(g => g.pergunta_normalizada)));
      assert.equal(gaps[0].ocorrencias, 4);
    });

    test('acento não cria lacuna separada', async () => {
      await kb.registrarGap('conexão instável');
      await kb.registrarGap('conexao instavel');
      assert.equal((await db('knowledge_gaps')).length, 1);
    });

    test('perguntas diferentes continuam lacunas diferentes', async () => {
      await kb.registrarGap('trocar senha do wifi');
      await kb.registrarGap('cancelar meu contrato');
      assert.equal((await db('knowledge_gaps')).length, 2);
    });

    test('lacuna RESOLVIDA que volta a aparecer é reaberta', async () => {
      const g = await kb.registrarGap('prazo de instalação');
      await db('knowledge_gaps').where({ id: g.id }).update({ status: 'resolvido' });

      await kb.registrarGap('qual o prazo de instalacao?');
      const depois = await db('knowledge_gaps').where({ id: g.id }).first();
      assert.equal(depois.status, 'aberto', 'o artigo escrito não respondeu de verdade');
      assert.equal(depois.ocorrencias, 2);
    });

    test('pergunta vazia não vira lacuna', async () => {
      assert.equal(await kb.registrarGap(''), null);
      assert.equal(await kb.registrarGap(null), null);
      assert.equal((await db('knowledge_gaps')).length, 0);
    });
  });

  // ── A IA ────────────────────────────────────────────────────────
  describe('consultarParaIA', () => {
    test('achou: devolve texto com fonte e REGISTRA o uso (§55)', async () => {
      const a = await criar();
      const [conv] = await db('conversas').insert({ canal: 'whatsapp' }).returning('*');

      const r = await kb.consultarParaIA('trocar senha do wifi', { conversaId: conv.id });
      assert.ok(r.texto?.includes('Como trocar a senha do Wi-Fi'));
      assert.equal(r.artigos.length, 1);

      const uso = await db('knowledge_uso').first();
      assert.equal(uso.artigo_id, a.id);
      assert.equal(uso.versao, a.versao, 'a VERSÃO fica gravada — é o que a auditoria vai perguntar');
      assert.equal(uso.conversa_id, conv.id);
      assert.equal(uso.origem, 'ia');
    });

    test('não achou: devolve null e vira LACUNA, sem registrar uso', async () => {
      const r = await kb.consultarParaIA('qual a cor do cavalo branco de napoleão');
      assert.equal(r.texto, null);
      assert.equal((await db('knowledge_uso')).length, 0);
      assert.equal((await db('knowledge_gaps')).length, 1);
    });

    test('CRITÉRIO: no sandbox LÊ mas não ESCREVE (nem lacuna, nem uso)', async () => {
      // Uma rodada de "Testar fluxo" não pode inflar o contador de lacunas —
      // é ele que a curadoria usa para decidir o que escrever.
      await criar();
      const achou = await kb.consultarParaIA('trocar senha do wifi', { sandbox: true });
      const naoAchou = await kb.consultarParaIA('assunto que não existe na base', { sandbox: true });

      assert.ok(achou.texto, 'a leitura continua real no sandbox');
      assert.equal(naoAchou.texto, null);
      assert.equal((await db('knowledge_uso')).length, 0, 'sandbox não registra uso');
      assert.equal((await db('knowledge_gaps')).length, 0, 'sandbox não registra lacuna');
    });

    test('o texto para a IA não despeja o artigo inteiro', async () => {
      await criar({ conteudo: 'linha muito longa. '.repeat(400) });
      const r = await kb.consultarParaIA('trocar senha do wifi');
      assert.ok(r.texto.length < 1200, `foi ${r.texto.length} caracteres — isso afoga a pergunta na janela`);
    });
  });

  // ── WORKFLOW E VERSIONAMENTO ────────────────────────────────────
  describe('workflow editorial e versionamento (§52/§53)', () => {
    test('publicar CONGELA a versão — conhecimento oficial não some', async () => {
      const a = await criar({ status: 'revisao', titulo: 'Prazo de instalação', conteudo: 'Até 5 dias úteis.' });
      const r = await kb.mudarStatus(a.id, 'publicado', { agenteId: null });

      assert.equal(r.artigo.status, 'publicado');
      assert.ok(r.artigo.publicado_em);
      const [v] = await db('knowledge_versoes').where({ artigo_id: a.id });
      assert.equal(v.versao, 1);
      assert.equal(v.conteudo, 'Até 5 dias úteis.');
    });

    test('CRITÉRIO: a versão antiga sobrevive à edição do artigo', async () => {
      const a = await criar({ status: 'revisao', conteudo: 'Prazo: 5 dias.' });
      await kb.mudarStatus(a.id, 'publicado');
      await kb.mudarStatus(a.id, 'revisao');                 // volta para corrigir
      await db('knowledge_artigos').where({ id: a.id }).update({ conteudo: 'Prazo: 10 dias.' });
      await kb.mudarStatus(a.id, 'publicado');

      const versoes = await db('knowledge_versoes').where({ artigo_id: a.id }).orderBy('versao');
      assert.equal(versoes.length, 2);
      assert.equal(versoes[0].conteudo, 'Prazo: 5 dias.', 'o que estava no ar continua recuperável');
      assert.equal(versoes[1].conteudo, 'Prazo: 10 dias.');
    });

    test('sair de publicado para revisão sobe a versão', async () => {
      const a = await criar({ status: 'revisao' });
      await kb.mudarStatus(a.id, 'publicado');
      const r = await kb.mudarStatus(a.id, 'revisao');
      assert.equal(r.artigo.versao, 2);
    });

    test('rascunho → publicado é recusado com explicação', async () => {
      const a = await criar({ status: 'rascunho' });
      const r = await kb.mudarStatus(a.id, 'publicado');
      assert.equal(r.erro, 'transicao_invalida');
      assert.match(r.mensagem, /revisão/);
      assert.equal((await db('knowledge_artigos').where({ id: a.id }).first()).status, 'rascunho');
    });

    test('artigo inexistente não estoura', async () => {
      assert.equal((await kb.mudarStatus('00000000-0000-4000-8000-000000000999', 'revisao')).erro, 'nao_encontrado');
    });

    test('republicar a MESMA versão não duplica linha de versão', async () => {
      const a = await criar({ status: 'revisao' });
      await kb.mudarStatus(a.id, 'publicado');
      await kb.mudarStatus(a.id, 'arquivado');
      await kb.mudarStatus(a.id, 'rascunho');
      await kb.mudarStatus(a.id, 'revisao');
      await kb.mudarStatus(a.id, 'publicado');
      assert.equal((await db('knowledge_versoes').where({ artigo_id: a.id })).length, 1);
    });
  });
});
