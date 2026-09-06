import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extrairDocumento, mapearIdentificacao, patchConversa, resumoParaIA, mesclarCliente, falaEhDocumento } from './identificacaoHelpers.js';

/** Espelha a saída de `sgpHelpers.mapearRespostaCliente` — com os segredos dentro. */
const DATA = {
  nome: 'MARIA DA SILVA', cpfcnpj: '11144477735', email: 'maria@ex.com', fone: '84999998888',
  contratos: [{
    id: 25438, plano: 'Avançado 500MB', status: 'ativo', cidade: 'Natal', popId: 1,
    titulos_abertos: 2, valor_aberto: 199.8,
    servico: { login: 'maria@netgo', senha: 'pppoe-secreta' },
    wifi:    { ssid: 'NETGO_MARIA', senha: 'wifi-secreta' },
    central: { login: '11144477735', senha: 'central-secreta' },
    endereco: { logradouro: 'Rua X', ll: [-5.79, -35.2] },
  }],
};

describe('extrairDocumento', () => {
  test('tira a formatação que o cliente digita', () => {
    assert.equal(extrairDocumento('111.444.777-35'), '11144477735');
    assert.equal(extrairDocumento('meu cpf é 111 444 777 35'), '11144477735');
  });

  test('aceita CNPJ', () => {
    assert.equal(extrairDocumento('11.222.333/0001-81'), '11222333000181');
  });

  test('texto sem documento não vira documento', () => {
    assert.equal(extrairDocumento('minha internet caiu'), null);
    assert.equal(extrairDocumento('12345'), null);
    assert.equal(extrairDocumento(''), null);
    assert.equal(extrairDocumento(null), null);
    assert.equal(extrairDocumento(undefined), null);
  });

  test('12 dígitos passam — fiel ao nó, que deixa o SGP responder "não encontrado"', () => {
    assert.equal(extrairDocumento('123456789012'), '123456789012');
  });
});

describe('mapearIdentificacao', () => {
  test('monta o contexto.cliente do primeiro contrato', () => {
    const c = mapearIdentificacao(DATA);
    assert.equal(c.nome, 'MARIA DA SILVA');
    assert.equal(c.cpf, '11144477735');
    assert.equal(c.contrato, '25438');       // string: o motor e as tools comparam como string
    assert.equal(c.plano, 'Avançado 500MB');
    assert.equal(c.status, 'ativo');
    assert.equal(c.popId, 1);
    assert.equal(c.titulos_abertos, 2);
  });

  test('resposta sem contrato não vira cliente', () => {
    assert.equal(mapearIdentificacao({ nome: 'X', contratos: [] }), null);
    assert.equal(mapearIdentificacao({ erro: true }), null);
    assert.equal(mapearIdentificacao(null), null);
  });

  test('campos ausentes viram vazio, não `undefined` no blob do estado', () => {
    const c = mapearIdentificacao({ cpfcnpj: '1', contratos: [{ id: 9 }] });
    assert.equal(c.cidade, '');
    assert.equal(c.email, '');
    assert.equal(c.fone, '');
  });
});

describe('patchConversa — o vínculo que sobrevive ao fim do fluxo', () => {
  test('grava CPF e contrato na linha da conversa', () => {
    const p = patchConversa({ id: 'x' }, DATA, mapearIdentificacao(DATA));
    assert.equal(p.cpf, '11144477735');
    assert.equal(p.contrato_id, '25438');
  });

  test('não sobrescreve o nome nem a cidade que a conversa já tem', () => {
    const p = patchConversa({ nome: 'Maria (apelido)', cidade: 'Macaíba' }, DATA, mapearIdentificacao(DATA));
    assert.equal(p.nome, 'Maria (apelido)');
    assert.equal(p.cidade, 'Macaíba');
  });

  test('preenche o que falta na conversa', () => {
    const p = patchConversa({ nome: null, cidade: null }, DATA, mapearIdentificacao(DATA));
    assert.equal(p.nome, 'MARIA DA SILVA');
    assert.equal(p.cidade, 'Natal');
  });
});

describe('resumoParaIA — o que o modelo pode ver', () => {
  const resumo = resumoParaIA(mapearIdentificacao(DATA), DATA.contratos);

  test('nenhum segredo do contrato entra no histórico da conversa', () => {
    for (const segredo of ['pppoe-secreta', 'wifi-secreta', 'central-secreta', 'maria@netgo', 'NETGO_MARIA']) {
      assert.ok(!resumo.includes(segredo), `vazou: ${segredo}`);
    }
  });

  test('nem endereço nem coordenada', () => {
    assert.ok(!resumo.includes('Rua X'));
    assert.ok(!resumo.includes('-5.79'));
  });

  test('diz o que o atendimento precisa', () => {
    assert.match(resumo, /MARIA DA SILVA/);
    assert.match(resumo, /Contrato: 25438 — Avançado 500MB/);
    assert.match(resumo, /Situação: ativo/);
    assert.match(resumo, /Títulos em aberto: 2 \(R\$ 199,80\)/);
  });

  test('cliente sem débito recebe "nenhum", não silêncio', () => {
    // Omitir a linha faria o modelo não saber a diferença entre "não tem" e
    // "não perguntei" — a distinção que esta casa persegue.
    const r = resumoParaIA({ contrato: '1', titulos_abertos: 0 });
    assert.match(r, /Títulos em aberto: nenhum/);
  });

  test('multi-contrato é avisado — senão o modelo responde sobre a conta errada', () => {
    const contratos = [
      { id: 1, plano: 'A', status: 'ativo' },
      { id: 2, plano: 'B', status: 'suspenso' },
    ];
    const r = resumoParaIA(mapearIdentificacao({ cpfcnpj: '1', contratos }), contratos);
    assert.match(r, /2 contratos/);
    assert.match(r, /Confirme com o cliente/);
  });

  test('contrato único não gera aviso de multi-contrato', () => {
    assert.ok(!resumo.includes('contratos:'));
  });

  test('sem cliente, diz que não achou — não devolve string vazia', () => {
    assert.match(resumoParaIA(null), /Não encontrei/);
  });
});

describe('mesclarCliente', () => {
  test('o que o SGP devolveu vence o que estava lá', () => {
    const r = mesclarCliente({ status: 'suspenso' }, { status: 'ativo' });
    assert.equal(r.status, 'ativo');
  });

  test('campo vazio NÃO apaga campo preenchido', () => {
    // `popId` é o que dá escopo ao `consultar_manutencao`: perdê-lo faz a IA
    // checar manutenção sem região, sem nada acusar.
    const r = mesclarCliente({ popId: 1, email: 'a@b.c' }, { popId: null, email: '', status: 'ativo' });
    assert.equal(r.popId, 1);
    assert.equal(r.email, 'a@b.c');
    assert.equal(r.status, 'ativo');
  });

  test('sem estado anterior devolve só o novo, sem os vazios', () => {
    assert.deepEqual(mesclarCliente(null, { cpf: '1', cidade: '' }), { cpf: '1' });
    assert.deepEqual(mesclarCliente(undefined, {}), {});
  });
});

describe('mesclarCliente — trocar de cliente é ficha nova, não remendo', () => {
  test('CPF diferente NÃO herda campos do cliente anterior', () => {
    // `popId` errado manda o `consultar_manutencao` para o POP de outra pessoa,
    // e `titulos_abertos` do anterior faz a IA falar do débito de quem não está
    // ali. É o caso do cliente que digita o CPF errado e corrige.
    const antes  = { cpf: '111', popId: 1, titulos_abertos: 9, email: 'a@a.com', nome: 'ANA' };
    const depois = { cpf: '222', nome: 'BRUNO', contrato: '77' };
    const r = mesclarCliente(antes, depois);
    assert.equal(r.cpf, '222');
    assert.equal(r.nome, 'BRUNO');
    assert.equal(r.popId, undefined, 'herdou o POP do cliente anterior');
    assert.equal(r.titulos_abertos, undefined, 'herdou o débito do cliente anterior');
    assert.equal(r.email, undefined);
  });

  test('mesmo CPF continua mesclando — é reconsulta, não troca', () => {
    const r = mesclarCliente({ cpf: '111', popId: 1, email: 'a@a.com' }, { cpf: '111', status: 'ativo' });
    assert.equal(r.popId, 1);
    assert.equal(r.email, 'a@a.com');
    assert.equal(r.status, 'ativo');
  });

  test('contexto sem CPF ainda é aproveitado (o fluxo pode ter salvo dados antes)', () => {
    const r = mesclarCliente({ cidade_informada: 'Natal' }, { cpf: '111', nome: 'ANA' });
    assert.equal(r.cidade_informada, 'Natal');
    assert.equal(r.cpf, '111');
  });
});

describe('resumoParaIA — multi-contrato legível', () => {
  const lista = (contratos) => resumoParaIA(mapearIdentificacao({ cpfcnpj: '1', contratos }), contratos);

  test('contrato sem plano não deixa parêntese solto', () => {
    const r = lista([{ id: 1, status: 'ativo' }, { id: 2, status: 'suspenso' }]);
    assert.match(r, /1 \(ativo\); 2 \(suspenso\)/);
    assert.ok(!/\(\)|, \)/.test(r), r);
  });

  test('contrato sem plano e sem status sai só com o número', () => {
    const r = lista([{ id: 1 }, { id: 2 }]);
    assert.match(r, /1; 2/);
  });

  test('plano e status juntos ficam num parêntese só', () => {
    const r = lista([{ id: 1, plano: 'A', status: 'ativo' }, { id: 2 }]);
    assert.match(r, /1 \(A, ativo\)/);
  });
});

describe('falaEhDocumento', () => {
  test('a fala que é só o documento do cliente identificado, com ou sem pontuação, é reconhecida', () => {
    assert.equal(falaEhDocumento('111.444.777-35', '11144477735'), true);
    assert.equal(falaEhDocumento(' 11144477735 ', '111.444.777-35'), true);
  });
  test('documento de OUTRA pessoa, ou frase que contém o documento, não é marcador', () => {
    assert.equal(falaEhDocumento('11144477735', '07070310447'), false);
    assert.equal(falaEhDocumento('meu cpf é 111.444.777-35', '11144477735'), false);
  });
  test('sem fala ou sem cliente identificado devolve false', () => {
    assert.equal(falaEhDocumento('', '11144477735'), false);
    assert.equal(falaEhDocumento('11144477735', undefined), false);
    assert.equal(falaEhDocumento(undefined, undefined), false);
  });
});
