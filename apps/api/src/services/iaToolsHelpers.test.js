import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatarBoletoIA, formatarPromessaIA, formatarChamadoIA, diasAte } from './iaToolsHelpers.js';

// Forma REAL retornada por segundaViaBoleto (boleto único = saída de formatarBoleto).
const boletoUnico = {
  status:          'boleto_encontrado',
  cliente:         'Fulano de Tal',
  contrato:        123,
  fatura_id:       999,
  valor_cobrado:   '89,90',
  vencimento_atual:'2026-07-10',
  vencido:         false,
  link_boleto:     'https://sgp/boleto/999',
  link_cobranca:   'https://sgp/cob/999',
  pix_copia_cola:  '00020126PIXCOPIACOLA',
  linha_digitavel: '00190500954014481606906809350314337370000000100',
};

test('formatarBoletoIA (boleto único) mostra valor, vencimento, PIX e link', () => {
  const msg = formatarBoletoIA(boletoUnico);
  assert.match(msg, /89,90/);
  assert.match(msg, /2026-07-10/);
  assert.match(msg, /00020126PIXCOPIACOLA/);
  assert.match(msg, /https:\/\/sgp\/cob\/999/);
});

// Regressão direta do bug: a tool lia r.link/r.pix (inexistentes) e sempre caía no "não encontrei".
test('formatarBoletoIA (boleto único) NÃO diz que não encontrou boleto', () => {
  const msg = formatarBoletoIA(boletoUnico);
  assert.doesNotMatch(msg, /não encontrei|nao encontrei/i);
});

test('formatarBoletoIA cai em link_boleto quando não há link_cobranca', () => {
  const msg = formatarBoletoIA({ ...boletoUnico, link_cobranca: null });
  assert.match(msg, /https:\/\/sgp\/boleto\/999/);
});

test('formatarBoletoIA (sem_boleto) devolve a mensagem de conta em dia', () => {
  const msg = formatarBoletoIA({ status: 'sem_boleto', mensagem: 'Nenhum boleto em aberto para este contrato.' });
  assert.match(msg, /Nenhum boleto em aberto/);
});

test('formatarBoletoIA (multiplos_boletos) lista cada boleto com valor e vencimento', () => {
  const r = {
    status: 'multiplos_boletos', total: 2, cliente: 'Fulano', contrato: 123,
    lista: [
      { indice: 1, valor_cobrado: '89,90',  vencimento_atual: '2026-06-10', pix_copia_cola: 'PIX1', link_cobranca: 'L1' },
      { indice: 2, valor_cobrado: '120,00', vencimento_atual: '2026-07-10', pix_copia_cola: 'PIX2', link_cobranca: 'L2' },
    ],
  };
  const msg = formatarBoletoIA(r);
  assert.match(msg, /2 boletos/);
  assert.match(msg, /89,90/);
  assert.match(msg, /120,00/);
  assert.match(msg, /2026-06-10/);
  assert.match(msg, /2026-07-10/);
});

test('formatarBoletoIA (erro) devolve a mensagem de erro', () => {
  const msg = formatarBoletoIA({ erro: true, mensagem: 'CPF/CNPJ inválido.' });
  assert.match(msg, /CPF\/CNPJ inválido/);
});

// ── PROMESSA DE PAGAMENTO E CHAMADO ───────────────────────────────
// Buraco no retorno da tool vira invenção: foi assim que a IA anunciou o
// protocolo `25438-LOS-001` em 27/08 (o número do contrato com um sufixo
// fabricado). Estes testes travam a diferença entre "aqui está o número",
// "não houve número" e "não deu certo".

describe('formatarPromessaIA', () => {
  test('liberado: diz os dias, a data e o protocolo REAL', () => {
    const t = formatarPromessaIA({ liberado: true, liberado_dias: 3, protocolo: 'P-99887', data_promessa: '2026-09-08' });
    assert.match(t, /liberado/i);
    assert.match(t, /3 dias/);
    assert.match(t, /08\/09/);
    assert.match(t, /P-99887/);
  });

  test('liberado sem protocolo: PROÍBE citar número, em vez de deixar o buraco', () => {
    const t = formatarPromessaIA({ liberado: true, liberado_dias: 3, protocolo: null });
    assert.match(t, /liberado/i);
    assert.ok(!t.includes('null') && !t.includes('undefined'));
    assert.match(t, /não informe .*protocolo/i);
  });

  test('recusado pelo SGP não é "erro do sistema" — é regra de negócio', () => {
    // `promessaPagamento` põe `erro` sempre que status !== 1, inclusive quando
    // a recusa é legítima (a promessa é 1x/mês). Dizer "Erro:" ao modelo faz
    // ele repassar ao cliente que o sistema quebrou.
    const t = formatarPromessaIA({ liberado: false, erro: 'Cliente já possui promessa no mês' });
    assert.ok(!/^erro/i.test(t));
    assert.match(t, /não foi possível liberar/i);
    assert.match(t, /Cliente já possui promessa no mês/);
    assert.match(t, /não prometa/i);
  });

  test('recusa sem mensagem do SGP ainda diz que não liberou', () => {
    const t = formatarPromessaIA({ liberado: false });
    assert.match(t, /não foi possível liberar/i);
    assert.ok(!t.includes('undefined'));
  });

  test('nunca afirma liberação sem `liberado: true`', () => {
    for (const r of [{}, null, { erro: 'timeout' }, { status: 0 }]) {
      assert.ok(!/acesso liberado/i.test(formatarPromessaIA(r)), JSON.stringify(r));
    }
  });
});

describe('formatarChamadoIA', () => {
  test('chamado aberto com protocolo: entrega o número', () => {
    const t = formatarChamadoIA({ chamado_aberto: true, protocolo: '2026-55512' });
    assert.match(t, /2026-55512/);
    assert.match(t, /aberto/i);
  });

  test('nunca crava prazo — SLA mora na base de conhecimento, não num `return`', () => {
    // "em até 24h úteis" estava no código e a IA repetia, inclusive no
    // comercial, onde não vale.
    const t = formatarChamadoIA({ chamado_aberto: true, protocolo: 'X' });
    assert.ok(!/24h|24 h|úteis|horas/i.test(t));
  });

  test('aberto SEM protocolo: diz que não veio número e proíbe inventar', () => {
    const t = formatarChamadoIA({ chamado_aberto: true, protocolo: null });
    assert.match(t, /não .*(devolveu|informou).*protocolo/i);
    assert.match(t, /não informe .*protocolo/i);
  });

  test('não abriu: não anuncia sucesso', () => {
    const t = formatarChamadoIA({ chamado_aberto: false });
    assert.ok(!/✅/.test(t));
    assert.match(t, /não consegui abrir/i);
  });

  test('formato inesperado do SGP não vira dump de JSON na cara do cliente', () => {
    // O `|| JSON.stringify(r)` punha o corpo inteiro da resposta no lugar do
    // protocolo do cliente.
    const t = formatarChamadoIA({ chamado_aberto: true, protocolo: null, razaoSocial: 'MARIA', foo: { bar: 1 } });
    assert.ok(!t.includes('{'));
    assert.ok(!t.includes('MARIA'));
  });

  test('erro de transporte é falha honesta', () => {
    const t = formatarChamadoIA({ erro: 'ETIMEDOUT' });
    assert.match(t, /não consegui abrir/i);
    assert.match(t, /ETIMEDOUT/);
  });
});

describe('formatarPromessaIA — números que o SGP não mandou', () => {
  test('sem `liberado_dias` do SGP, não inventa "3 dias"', () => {
    const t = formatarPromessaIA({ liberado: true, liberado_dias: null, data_promessa: '2026-09-08', protocolo: 'P1' });
    assert.ok(!/\bdias\b/.test(t), t);
    assert.match(t, /até 08\/09/);
  });

  test('sem dias e sem data, ainda confirma a liberação sem prazo fabricado', () => {
    const t = formatarPromessaIA({ liberado: true, protocolo: 'P1' });
    assert.match(t, /Acesso liberado\./);
    assert.ok(!/undefined|null|NaN/.test(t));
  });
});

describe('diasAte — o off-by-one que só aparece em fuso', () => {
  const em = (iso, agora) => diasAte(iso, new Date(agora));

  test('conta os dias do jeito que a promessa é montada', () => {
    assert.equal(em('2026-09-09', '2026-09-06T12:00:00Z'), 3);
    assert.equal(em('2026-09-07', '2026-09-06T12:00:00Z'), 1);
  });

  test('perto da meia-noite local em UTC-3, "hoje" em UTC já é amanhã', () => {
    // 21h de 05/09 em Natal = 00h de 06/09 em UTC. A data da promessa nasce de
    // um `toISOString()`, então os dois lados têm de ser UTC — comparar com a
    // data local devolveria 4 aqui.
    assert.equal(em('2026-09-09', '2026-09-06T00:30:00Z'), 3);
  });

  test('data no passado ou hoje não vira prazo', () => {
    assert.equal(em('2026-09-06', '2026-09-06T12:00:00Z'), null);
    assert.equal(em('2020-01-01', '2026-09-06T12:00:00Z'), null);
  });

  test('o que não der para ler é null, nunca um chute', () => {
    for (const v of ['', 'x', '09/09/2026', '2026-9-9', null, undefined]) {
      assert.equal(diasAte(v), null, String(v));
    }
  });
});
