import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatarBoletoIA } from './iaToolsHelpers.js';

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
