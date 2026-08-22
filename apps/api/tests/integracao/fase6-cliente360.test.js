/**
 * Cliente 360 (FASE 6) contra Postgres — o que só o banco e a composição real
 * provam: identificação do assinante a partir do estado do fluxo, o histórico
 * de relacionamento, e a promessa central do painel — **SGP fora do ar não
 * derruba o atendimento**.
 *
 * Nenhum teste aqui fala com o SGP de verdade: sem credencial configurada, as
 * chamadas falham, e é exatamente esse o caminho que se quer exercitar.
 * Máscara, permissões e cartões estão nas suítes puras.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar, criarConversa } from './_ambiente.js';

const TABELAS = ['flow_executions', 'satisfacao', 'mensagens', 'conversas', 'agentes', 'audit_log', 'sistema_kv'];

const AGENTE = { id: '99999999-0000-4000-8000-000000000001', role: 'agente', permissoes: {} };
const ADMIN  = { id: '99999999-0000-4000-8000-000000000002', role: 'admin',  permissoes: {} };

describe('FASE 6 — Cliente 360', { skip: motivoSkip() }, () => {
  let db, cliente360;

  before(async () => {
    db = await prepararBanco();
    cliente360 = await import('../../src/services/cliente360.js');
  });

  after(async () => { await db?.destroy?.(); });
  beforeEach(async () => { await limpar(db, TABELAS); });

  // ── IDENTIFICAÇÃO ───────────────────────────────────────────────
  describe('identificar o assinante', () => {
    test('usa o CPF da conversa quando ele existe', async () => {
      const c = await criarConversa(db, { cpf: '12345678901' });
      assert.equal(await cliente360.identificar(c), '12345678901');
    });

    test('CRITÉRIO: cai no que a IA já coletou no estado do fluxo', async () => {
      // O `consultar_cliente` do motor guarda a ficha no contexto ANTES de a
      // conversa ganhar `cpf` — sem esta fonte o painel abriria vazio numa
      // conversa em que o cliente já se identificou.
      const c = await criarConversa(db, {});
      await db('flow_executions').insert({
        conversa_id: c.id,
        estado: JSON.stringify({ noAtual: 'x', contexto: { cliente: { cpf: '98765432100' } } }),
      });
      assert.equal(await cliente360.identificar(c), '98765432100');
    });

    test('aceita `cpfcnpj` no contexto (o SGP devolve com esse nome)', async () => {
      const c = await criarConversa(db, {});
      await db('flow_executions').insert({
        conversa_id: c.id,
        estado: JSON.stringify({ contexto: { cliente: { cpfcnpj: '11122233344' } } }),
      });
      assert.equal(await cliente360.identificar(c), '11122233344');
    });

    test('CRITÉRIO: a identificação SOBREVIVE ao fim da execução do fluxo', async () => {
      // O caso real que quebrou em produção: a IA identifica o cliente, a
      // conversa vai para a fila, o `flow_executions` é apagado — e o painel
      // abria sem contrato enquanto a 2ª via respondia "CPF/CNPJ inválido".
      // Por isso a identificação tem que estar na LINHA da conversa, não só
      // no blob do fluxo.
      const c = await criarConversa(db, { cpf: '12345678901', contrato_id: '29783' });
      await db('flow_executions').where({ conversa_id: c.id }).del();

      assert.equal(await cliente360.identificar(c), '12345678901',
        'sem a coluna, o CPF vai embora junto com a execução do fluxo');
      const r = await cliente360.contratosPermitidos(c);
      assert.deepEqual(r.contratos, ['29783']);
      assert.equal(r.principal, '29783', 'a ação rápida tem contrato para agir');
    });

    test('sem CPF em lugar nenhum devolve null, não estoura', async () => {
      assert.equal(await cliente360.identificar(await criarConversa(db, {})), null);
    });
  });

  // ── RESILIÊNCIA ─────────────────────────────────────────────────
  describe('o painel não derruba o atendimento', () => {
    test('CRITÉRIO: SGP indisponível vira AVISO, não exceção', async () => {
      const c = await criarConversa(db, { cpf: '12345678901', nome: 'Fulano', telefone: '5584999887766' });
      const ficha = await cliente360.montarFicha(c, AGENTE);

      assert.ok(ficha, 'a ficha existe mesmo sem SGP');
      assert.ok(ficha.avisos.length > 0, 'a falha aparece, não some em silêncio');
      assert.deepEqual(ficha.contratos, []);
      assert.equal(ficha.identidade.nome, 'Fulano', 'o que o banco local sabe continua na tela');
    });

    test('CRITÉRIO: conversa SEM telefone não herda o histórico de outras sem telefone', async () => {
      // `where({telefone: null})` casaria com todas elas e misturaria clientes
      // que não têm nada a ver um com o outro.
      await criarConversa(db, { telefone: null, status: 'encerrada' });
      await criarConversa(db, { telefone: null, status: 'encerrada' });
      const atual = await criarConversa(db, { telefone: null });

      const ficha = await cliente360.montarFicha(atual, AGENTE);
      assert.equal(ficha.conversas_anteriores, 0);
      assert.deepEqual(ficha.conversas_recentes, []);
    });

    test('conversa sem CPF nem tenta o SGP e ainda monta a ficha', async () => {
      const c = await criarConversa(db, { nome: 'Anônimo', telefone: '5584911112222' });
      const ficha = await cliente360.montarFicha(c, AGENTE);
      assert.equal(ficha.identidade.cpf, null);
      assert.deepEqual(ficha.cards, [], 'sem dado não se inventa cartão');
    });
  });

  // ── MÁSCARA E PERMISSÃO ─────────────────────────────────────────
  describe('PII sai mascarada do servidor', () => {
    test('CRITÉRIO: o telefone completo NÃO está no payload do agente comum', async () => {
      const c = await criarConversa(db, { cpf: '12345678901', telefone: '5584999887766' });
      const ficha = await cliente360.montarFicha(c, AGENTE);

      assert.equal(ficha.identidade.mascarado, true);
      assert.equal(ficha.identidade.telefone, '(84) *****-7766');
      assert.equal(ficha.identidade.cpf, '***.456.789-**');
      const json = JSON.stringify(ficha.identidade);
      assert.ok(!json.includes('5584999887766'), 'esconder na tela não é mascarar');
      assert.ok(!json.includes('12345678901'));
    });

    test('quem tem ver_dados_completos recebe o dado inteiro', async () => {
      const c = await criarConversa(db, { cpf: '12345678901', telefone: '5584999887766' });
      const ficha = await cliente360.montarFicha(c, { role: 'agente', permissoes: { ver_dados_completos: true } });
      assert.equal(ficha.identidade.mascarado, false);
      assert.equal(ficha.identidade.cpf, '12345678901');
    });

    test('admin vê tudo sem precisar de marcação', async () => {
      const c = await criarConversa(db, { cpf: '12345678901' });
      assert.equal((await cliente360.montarFicha(c, ADMIN)).identidade.mascarado, false);
    });

    test('sem permissão de financeiro, o bloco NÃO vem (nem vazio)', async () => {
      const c = await criarConversa(db, { cpf: '12345678901' });
      const ficha = await cliente360.montarFicha(c, { role: 'agente', permissoes: { financeiro: false } });
      assert.equal(ficha.financeiro, null);
      assert.notEqual((await cliente360.montarFicha(c, AGENTE)).financeiro, null, 'por omissão continua vindo');
    });
  });

  // ── HISTÓRICO 360 ───────────────────────────────────────────────
  describe('histórico de relacionamento', () => {
    test('conta conversas anteriores do mesmo telefone, sem contar a atual', async () => {
      const tel = '5584955554444';
      await criarConversa(db, { telefone: tel, status: 'encerrada' });
      await criarConversa(db, { telefone: tel, status: 'encerrada' });
      const atual = await criarConversa(db, { telefone: tel });

      const ficha = await cliente360.montarFicha(atual, AGENTE);
      assert.equal(ficha.conversas_anteriores, 2);
      assert.equal(ficha.conversas_recentes.length, 2);
      assert.ok(!ficha.conversas_recentes.some(c => c.id === atual.id));
    });

    test('traz o NPS mais recente do cliente, com a escala', async () => {
      const tel = '5584933332222';
      const antiga = await criarConversa(db, { telefone: tel, status: 'encerrada' });
      const atual  = await criarConversa(db, { telefone: tel });
      await db('satisfacao').insert([
        { conversa_id: antiga.id, nota: 9, escala: 10, criado_em: new Date(Date.now() - 86400000).toISOString() },
        { conversa_id: antiga.id, nota: 2, escala: 5,  criado_em: new Date().toISOString() },
      ]);

      const ficha = await cliente360.montarFicha(atual, AGENTE);
      assert.equal(Number(ficha.ultimo_nps.nota), 2);
      assert.equal(Number(ficha.ultimo_nps.escala), 5, 'sem a escala o 2 seria lido na faixa errada');
    });

    test('cliente recorrente vira cartão', async () => {
      const tel = '5584922221111';
      for (let i = 0; i < 3; i++) await criarConversa(db, { telefone: tel, status: 'encerrada' });
      const atual = await criarConversa(db, { telefone: tel });

      const ficha = await cliente360.montarFicha(atual, AGENTE);
      assert.ok(ficha.cards.some(c => c.id === 'cliente_recorrente'), JSON.stringify(ficha.cards));
    });

    test('telefone diferente não mistura histórico de outro cliente', async () => {
      await criarConversa(db, { telefone: '5584900000001', status: 'encerrada' });
      const atual = await criarConversa(db, { telefone: '5584900000002' });
      assert.equal((await cliente360.montarFicha(atual, AGENTE)).conversas_anteriores, 0);
    });
  });

  // ── CATÁLOGO DE AÇÕES ───────────────────────────────────────────
  describe('ações do painel', () => {
    test('toda ação aponta para uma tool que existe no catálogo', async () => {
      const { IA_TOOLS } = await import('../../src/services/iaTools.js');
      const nomes = new Set(IA_TOOLS.map(t => t.name));
      for (const [id, def] of Object.entries(cliente360.ACOES)) {
        assert.ok(nomes.has(def.tool), `ação "${id}" aponta para tool inexistente: ${def.tool}`);
      }
    });

    test('as tools do diagnóstico completo também existem', async () => {
      const { IA_TOOLS } = await import('../../src/services/iaTools.js');
      const nomes = new Set(IA_TOOLS.map(t => t.name));
      for (const tool of cliente360.TOOLS_DIAGNOSTICO) {
        assert.ok(nomes.has(tool), `diagnóstico chama tool inexistente: ${tool}`);
      }
    });

    test('CRITÉRIO: nenhuma ação aceita campo que escolha O CLIENTE', () => {
      // `executarTool` dá precedência a `input.contrato`/`input.cpfcnpj`. Se
      // uma ação aceitasse esses campos do corpo da requisição, um agente
      // puxaria o boleto de outro assinante pela conversa deste.
      const PROIBIDOS = ['contrato', 'cpfcnpj', 'cpf'];
      for (const [id, def] of Object.entries(cliente360.ACOES)) {
        for (const campo of def.campos || []) {
          assert.ok(!PROIBIDOS.includes(campo), `ação "${id}" deixa o cliente escolher "${campo}"`);
        }
      }
    });

    test('toda ação declara `campos` — omitir é liberar o corpo inteiro', () => {
      for (const [id, def] of Object.entries(cliente360.ACOES)) {
        assert.ok(Array.isArray(def.campos), `ação "${id}" sem allowlist de campos`);
      }
    });

    test('contratosPermitidos: sem CPF não autoriza contrato nenhum', async () => {
      const c = await criarConversa(db, {});
      const r = await cliente360.contratosPermitidos(c);
      assert.equal(r.cpf, null);
      assert.deepEqual(r.contratos, []);
    });

    test('o contrato gravado na conversa sobrevive ao SGP fora do ar', async () => {
      // Senão uma integração caída viraria "nenhuma ação disponível" para um
      // cliente cujo contrato nós já conhecemos.
      const c = await criarConversa(db, { cpf: '12345678901', contrato_id: '4242' });
      const r = await cliente360.contratosPermitidos(c);
      assert.deepEqual(r.contratos, ['4242']);
      assert.equal(r.principal, '4242');
    });

    test('o painel NÃO expõe encerrar/transferir como ação rápida', () => {
      const tools = Object.values(cliente360.ACOES).map(a => a.tool);
      assert.ok(!tools.includes('encerrar_atendimento'));
      assert.ok(!tools.includes('transferir_para_humano'));
    });
  });
});
