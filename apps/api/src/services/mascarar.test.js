import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mascararCpf, mascararTelefone, mascararEmail, mascararPII, redigirTexto } from './mascarar.js';

describe('mascararCpf', () => {
  test('CPF guarda o miolo e esconde as pontas', () => {
    assert.equal(mascararCpf('12345678901'), '***.456.789-**');
    assert.equal(mascararCpf('123.456.789-01'), '***.456.789-**', 'aceita já formatado');
  });

  test('CNPJ tem formato próprio', () => {
    assert.equal(mascararCpf('12345678000199'), '**.***.678/0001-**');
  });

  test('nunca devolve o documento inteiro', () => {
    for (const doc of ['12345678901', '12345678000199', '123456', '99999999999']) {
      assert.ok(!mascararCpf(doc).includes(doc), `vazou: ${doc}`);
    }
  });

  test('vazio é vazio, não "***"', () => {
    assert.equal(mascararCpf(null), '');
    assert.equal(mascararCpf(''), '');
    assert.equal(mascararCpf('abc'), '', 'sem dígito nenhum não há o que mascarar');
  });

  test('comprimento estranho não vira formato inventado', () => {
    assert.equal(mascararCpf('1234567'), '***4567');
  });
});

describe('mascararTelefone', () => {
  test('guarda DDD e os 4 últimos', () => {
    assert.equal(mascararTelefone('5584999887766'), '(84) *****-7766');
    assert.equal(mascararTelefone('84999887766'),   '(84) *****-7766');
    assert.equal(mascararTelefone('8433334444'),    '(84) ****-4444', 'fixo, 8 dígitos');
  });

  test('aceita formatado e mantém a mesma saída', () => {
    assert.equal(mascararTelefone('(84) 99988-7766'), '(84) *****-7766');
  });

  test('o número completo nunca aparece', () => {
    assert.ok(!mascararTelefone('5584999887766').includes('99988'));
  });

  test('curto demais vira só asteriscos, não estoura', () => {
    assert.equal(mascararTelefone('123'), '***');
    assert.equal(mascararTelefone(''), '');
  });
});

describe('mascararEmail', () => {
  test('mantém o domínio (é operacional) e esconde o usuário', () => {
    const m = mascararEmail('fulano.silva@provedor.com');
    assert.ok(m.endsWith('@provedor.com'), m);
    assert.ok(m.startsWith('fu'), m);
    assert.ok(!m.includes('lano.silva'), `vazou o usuário: ${m}`);
  });

  test('usuário de 1 letra não vira e-mail em claro', () => {
    const m = mascararEmail('a@x.com');
    assert.ok(m.startsWith('a****'), m);
  });

  test('string sem @ não é tratada como e-mail legível', () => {
    assert.equal(mascararEmail('nao-e-email'), '****');
    assert.equal(mascararEmail(''), '');
  });
});

describe('mascararPII', () => {
  const ficha = { nome: 'Fulano', cpf: '12345678901', telefone: '5584999887766', email: 'f@x.com', cidade: 'Natal' };

  test('mascara os campos conhecidos e não toca no resto', () => {
    const m = mascararPII(ficha);
    assert.equal(m.cpf, '***.456.789-**');
    assert.equal(m.telefone, '(84) *****-7766');
    assert.equal(m.nome, 'Fulano');
    assert.equal(m.cidade, 'Natal');
  });

  test('não muta o objeto original — o servidor ainda precisa do CPF real', () => {
    const copia = { ...ficha };
    mascararPII(ficha);
    assert.deepEqual(ficha, copia);
  });

  test('revelar:true devolve tudo (quem chama audita)', () => {
    assert.equal(mascararPII(ficha, { revelar: true }).cpf, '12345678901');
  });

  test('CRITÉRIO: nenhum dígito do CPF real sobra no payload mascarado', () => {
    const json = JSON.stringify(mascararPII(ficha));
    assert.ok(!json.includes('12345678901'));
    assert.ok(!json.includes('5584999887766'));
  });

  test('campo ausente ou vazio não vira máscara fantasma', () => {
    const m = mascararPII({ nome: 'X', cpf: null, telefone: '' });
    assert.equal(m.cpf, null);
    assert.equal(m.telefone, '');
  });

  test('não desce em aninhado — é decisão, não esquecimento', () => {
    const m = mascararPII({ contratos: [{ cpf: '12345678901' }] });
    assert.equal(m.contratos[0].cpf, '12345678901',
      'quem monta o payload precisa chamar por nível; recursivo daria falsa cobertura');
  });
});

describe('redigirTexto — a rede para o log (FASE 13)', () => {
  test('CRITÉRIO: CPF em texto livre não chega ao log', () => {
    // O incidente real: `[SGP] consultacliente` imprimia o CPF completo.
    for (const t of ['consultacliente cpf=12345678901', 'CPF 123.456.789-01 do cliente']) {
      const r = redigirTexto(t);
      assert.ok(!r.includes('12345678901'), r);
      assert.ok(!r.includes('123.456.789-01'), r);
    }
  });

  test('CRITÉRIO: credencial em query string não vaza', () => {
    // `sgpGet` põe o token na URL — logar a URL inteira vaza a credencial.
    const r = redigirTexto('GET https://sgp/api?app=netgo&token=abc123def456xyz');
    assert.ok(!r.includes('abc123def456xyz'), r);
    assert.match(r, /token=\*\*\*/);
  });

  test('Bearer é redigido', () => {
    assert.ok(!redigirTexto('Authorization: Bearer eyJhbGciOiJIUzI1').includes('eyJhbGci'));
  });

  test('telefone e e-mail somem', () => {
    const r = redigirTexto('fone 5584999887766 email fulano@provedor.com');
    assert.ok(!r.includes('5584999887766'));
    assert.ok(!r.includes('fulano@'));
  });

  test('texto sem PII passa intacto — a redação não pode estragar o log', () => {
    const t = '[Motor] Fluxo "Atendimento": 14 nós, 18 edges';
    assert.equal(redigirTexto(t), t);
  });

  test('número que NÃO é documento sobrevive', () => {
    // 4 e 6 dígitos são protocolo, porta, contrato — redigir tudo cegaria o log.
    assert.match(redigirTexto('contrato 4242 na porta 400123'), /4242/);
  });

  test('entrada vazia não estoura', () => {
    assert.equal(redigirTexto(null), '');
    assert.equal(redigirTexto(''), '');
  });
});
