import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarManutencoes, manutencoesAtivas, manutencaoParaCliente, parseDataSgp, montarBodyChamado, classificarSinal, formatarDiagnosticoOnu,
  mapearRespostaCliente, mapearOnuFttx,
} from './sgpHelpers.js';

const AGORA = new Date(2026, 6, 2, 12, 0, 0); // 2026-07-02 12:00 (local)

const ativaNoPop1 = {
  descricao: 'Rompimento de fibra', ativa: 1, status: 1,
  data_inicial: '2026-07-02 10:00:00', data_final: '2026-07-02 14:00:00',
  pops: [{ id: 1, cidade: 'Macaíba' }], mensagem_central: 'Rompimento na região',
};

// ── normalizarManutencoes: sem fabricação de positivo ──────────────
test('normalizarManutencoes aceita array direto', () => {
  assert.deepEqual(normalizarManutencoes([ativaNoPop1]), [ativaNoPop1]);
});
test('normalizarManutencoes lê {manutencoes}, {data}, {results}', () => {
  assert.equal(normalizarManutencoes({ manutencoes: [ativaNoPop1] }).length, 1);
  assert.equal(normalizarManutencoes({ data: [ativaNoPop1] }).length, 1);
  assert.equal(normalizarManutencoes({ results: [ativaNoPop1] }).length, 1);
});
test('normalizarManutencoes NÃO fabrica positivo de campo truthy (bug antigo)', () => {
  // {manutencao: []} tinha [] truthy → o código antigo inventava {ativa:true}
  assert.deepEqual(normalizarManutencoes({ manutencao: [] }), []);
  assert.deepEqual(normalizarManutencoes({ em_manutencao: {} }), []);
  assert.deepEqual(normalizarManutencoes(null), []);
});

// ── manutencoesAtivas: ativa + status + janela ─────────────────────
test('manutencoesAtivas inclui manutenção ativa dentro da janela (ativa=1 inteiro)', () => {
  assert.equal(manutencoesAtivas({ manutencoes: [ativaNoPop1] }, AGORA).length, 1);
});
test('manutencoesAtivas exclui status Resolvido (4)', () => {
  const m = { ...ativaNoPop1, status: 4 };
  assert.equal(manutencoesAtivas([m], AGORA).length, 0);
});
test('manutencoesAtivas exclui ativa=0', () => {
  const m = { ...ativaNoPop1, ativa: 0 };
  assert.equal(manutencoesAtivas([m], AGORA).length, 0);
});
test('manutencoesAtivas exclui manutenção já terminada (data_final no passado)', () => {
  const m = { ...ativaNoPop1, data_inicial: '2026-07-01 08:00:00', data_final: '2026-07-01 12:00:00' };
  assert.equal(manutencoesAtivas([m], AGORA).length, 0);
});
test('manutencoesAtivas exclui manutenção agendada p/ o futuro (data_inicial > agora)', () => {
  const m = { ...ativaNoPop1, data_inicial: '2026-07-03 10:00:00', data_final: '2026-07-03 14:00:00' };
  assert.equal(manutencoesAtivas([m], AGORA).length, 0);
});
test('manutencoesAtivas sem datas conta pela flag ativa+status', () => {
  const m = { descricao: 'x', ativa: 1, status: 1, pops: [{ id: 1 }] };
  assert.equal(manutencoesAtivas([m], AGORA).length, 1);
});

// ── manutencaoParaCliente: escopo por POP + fail-safe ──────────────
test('manutencaoParaCliente: ativa no POP do cliente → ativa:true', () => {
  const r = manutencaoParaCliente({ manutencoes: [ativaNoPop1] }, { popId: 1, cidade: 'Macaíba' }, AGORA);
  assert.equal(r.ativa, true);
  assert.equal(r.itens.length, 1);
});
test('manutencaoParaCliente: ativa em OUTRO POP → ativa:false (escopo)', () => {
  const m = { ...ativaNoPop1, pops: [{ id: 9, cidade: 'Natal' }] };
  const r = manutencaoParaCliente([m], { popId: 1, cidade: 'Macaíba' }, AGORA);
  assert.equal(r.ativa, false);
});
test('manutencaoParaCliente: registro sem pops → ativa:false (fail-safe)', () => {
  const m = { ...ativaNoPop1, pops: [] };
  const r = manutencaoParaCliente([m], { popId: 1, cidade: 'Macaíba' }, AGORA);
  assert.equal(r.ativa, false);
});
test('manutencaoParaCliente: cliente sem popId nem cidade → ativa:false (fail-safe)', () => {
  const r = manutencaoParaCliente({ manutencoes: [ativaNoPop1] }, {}, AGORA);
  assert.equal(r.ativa, false);
});
test('manutencaoParaCliente: casa por cidade quando não tem popId', () => {
  const r = manutencaoParaCliente({ manutencoes: [ativaNoPop1] }, { cidade: 'macaíba' }, AGORA);
  assert.equal(r.ativa, true);
});
test('manutencaoParaCliente: resposta em formato inesperado → ativa:false', () => {
  const r = manutencaoParaCliente({ manutencao: [] }, { popId: 1 }, AGORA);
  assert.equal(r.ativa, false);
});

// ── parseDataSgp ───────────────────────────────────────────────────
test('parseDataSgp lê "AAAA-MM-DD HH:MM:SS"', () => {
  assert.deepEqual(parseDataSgp('2026-07-02 14:30:00'), new Date(2026, 6, 2, 14, 30, 0));
});
test('parseDataSgp lê "AAAA-MM-DD" (sem hora)', () => {
  assert.deepEqual(parseDataSgp('2026-07-02'), new Date(2026, 6, 2, 0, 0, 0));
});
test('parseDataSgp devolve null p/ lixo/vazio', () => {
  assert.equal(parseDataSgp(''), null);
  assert.equal(parseDataSgp('amanhã'), null);
  assert.equal(parseDataSgp(null), null);
});

// ── montarBodyChamado: repassa extras suportados pela doc SGP ───────
test('montarBodyChamado inclui contato_nome/telefone/observacao/usuario quando presentes', () => {
  const body = montarBodyChamado(30987, 200, 'internet caiu', {
    contato_nome: 'Fulano', contato_telefone: '84999999999', observacao: 'obs', usuario: 'ia_natalia',
  });
  assert.equal(body.contrato, 30987);
  assert.equal(body.ocorrenciatipo, 200);
  assert.equal(body.conteudo, 'internet caiu');
  assert.equal(body.contato_nome, 'Fulano');
  assert.equal(body.contato_telefone, '84999999999');
  assert.equal(body.observacao, 'obs');
  assert.equal(body.usuario, 'ia_natalia');
});
test('montarBodyChamado omite extras vazios e aplica defaults (tipo 5, conteúdo padrão)', () => {
  const body = montarBodyChamado(30987, null, '', {});
  assert.equal(body.ocorrenciatipo, 5);
  assert.equal(typeof body.conteudo, 'string');
  assert.ok(body.conteudo.length > 0);
  assert.ok(!('contato_nome' in body));
  assert.ok(!('usuario' in body));
});

// ── classificarSinal ───────────────────────────────────────────────
test('classificarSinal: -20 e -25 (fronteira) são bom', () => {
  assert.equal(classificarSinal(-20).nivel, 'bom');
  assert.equal(classificarSinal(-25).nivel, 'bom');
});
test('classificarSinal: -26 e -27 (fronteira) são atenção', () => {
  assert.equal(classificarSinal(-26).nivel, 'atencao');
  assert.equal(classificarSinal(-27).nivel, 'atencao');
});
test('classificarSinal: -27.5 e -28 (fronteira) são ruim', () => {
  assert.equal(classificarSinal(-27.5).nivel, 'ruim');
  assert.equal(classificarSinal(-28).nivel, 'ruim');
});
test('classificarSinal: -28.5 é crítico', () => {
  assert.equal(classificarSinal(-28.5).nivel, 'critico');
});
test('classificarSinal: valor nulo/inválido é desconhecido', () => {
  assert.equal(classificarSinal(null).nivel, 'desconhecido');
  assert.equal(classificarSinal('x').nivel, 'desconhecido');
});

// ── formatarDiagnosticoOnu ─────────────────────────────────────────
const AGORA_ONU = new Date(2026, 6, 2, 12, 0, 0); // 2026-07-02 12:00

test('formatarDiagnosticoOnu: row nulo → fail-safe, sem "Rx"', () => {
  const msg = formatarDiagnosticoOnu(null, AGORA_ONU);
  assert.match(msg, /não consegui ler/i);
  assert.doesNotMatch(msg, /Rx/);
});
test('formatarDiagnosticoOnu: leitura fresca + online mostra rx, "bom", ONLINE e uptime', () => {
  const row = { rx_dbm: -20.97, tx_dbm: 2.06, sinal_lido_em: '2026-07-02 07:25:37',
    online: true, uptime_segundos: 10800, ultima_queda_motivo: null };
  const msg = formatarDiagnosticoOnu(row, AGORA_ONU);
  assert.match(msg, /-20\.97/);
  assert.match(msg, /bom/);
  assert.match(msg, /ONLINE/);
  assert.match(msg, /3h/);
  assert.match(msg, /hoje/);
});
test('formatarDiagnosticoOnu: leitura antiga (>7 dias) avisa desatualizada', () => {
  const row = { rx_dbm: -21, tx_dbm: 2, sinal_lido_em: '2026-06-01 10:00:00', online: true, uptime_segundos: 600 };
  const msg = formatarDiagnosticoOnu(row, AGORA_ONU);
  assert.match(msg, /dias/);
  assert.match(msg, /desatualizad/i);
});
test('formatarDiagnosticoOnu: offline mostra OFFLINE e o motivo da queda', () => {
  const row = { rx_dbm: -35, tx_dbm: 2, sinal_lido_em: '2026-07-02 07:00:00',
    online: false, uptime_segundos: null, ultima_queda_motivo: 'Lost-Carrier' };
  const msg = formatarDiagnosticoOnu(row, AGORA_ONU);
  assert.match(msg, /OFFLINE/);
  assert.match(msg, /Lost-Carrier/);
  assert.match(msg, /crítico/);
});

// ── mapearRespostaCliente (Cliente 360 v2): o payload do SGP inteiro ──
// Fixture REAL da coleção oficial (raw/sources/docs/2026-07-01_sgp-api-postman.json).
const RAW_SGP = {
  msg: 'Contrato(s) Localizado(s)',
  contratos: [{
    telefones_cargos: [{ cargo: null, contato: '(99) 9999-9999', nome: null }],
    servico_tipo_conexao: 'PPPoE', contratoCentralSenha: 'SENHA',
    observacao_servico: 'OBS_SERV', popNome: 'POP_NOME', link_quitacao: 'LINK',
    contratoStatus: 1, servico_wifi_channel: 'auto', dataCadastro: '20/03/2024 11:43:25',
    endereco_uf: 'PR', servico_plano: 'PLANO', endereco_pontoreferencia: null,
    servico_vlan: 'None', cpfCnpj: '999.999.999-99', servico_mac2: '',
    endereco_logradouro: 'RUA X', dataNascimento: '1986-03-12',
    telefones: ['(99) 99999-9999'], contratoStatusDisplay: ' Ativo ',
    contratoCentralLogin: 'CENTRAL_LOGIN', tags: [], contratoTitulosAReceber: 0,
    servico_grupo: 'fibra', endereco_numero: 1, contratoValorAberto: 0.0,
    planointernet: 'Plano Empresarial 150 Mega', clienteId: 2827,
    observacao_cliente: 'OBS_CLI', endereco_complemento: '08 VERDE',
    endereco_bairro: 'VILA SAO JOSE', emails: ['EMAIL@EMAIL.COM'],
    razaoSocial: 'RAZAO_SOCIAL', servico_mac: '', popId: 2,
    endereco_cep: '84300-000', promessasPagamentoMes: 0, servico_wifi_password: '',
    endereco_cidade: 'TIBAGI', servico_senha: 'SERVICO_SENHA',
    servico_login: 'SERVICO_LOGIN', servico_wifi_ssid: '', contratoId: 10269,
    endereco_ll: '-24.5146688,-50.4112277',
  }],
};

test('mapearRespostaCliente extrai a ficha do payload real da coleção', () => {
  const r = mapearRespostaCliente(RAW_SGP, '99999999999');
  assert.equal(r.erro, undefined);
  assert.equal(r.nome, 'RAZAO_SOCIAL');
  assert.equal(r.email, 'EMAIL@EMAIL.COM');
  assert.equal(r.fone, '(99) 99999-9999');
  assert.equal(r.contratos.length, 1);
  const c = r.contratos[0];
  assert.equal(c.id, 10269);
  assert.equal(c.status, 'ativo');                    // display vem com espaços e maiúscula
  assert.equal(c.plano, 'Plano Empresarial 150 Mega');
  assert.equal(c.endereco.logradouro, 'RUA X');
  assert.equal(c.endereco.numero, '1');               // número vem inteiro no SGP
  assert.equal(c.endereco.cep, '84300-000');
  assert.equal(c.endereco.uf, 'PR');
  assert.deepEqual(c.endereco.ll, { lat: -24.5146688, lng: -50.4112277 });
  assert.equal(c.servico.login, 'SERVICO_LOGIN');
  assert.equal(c.servico.senha, 'SERVICO_SENHA');
  assert.equal(c.servico.tipo_conexao, 'PPPoE');
  assert.equal(c.servico.grupo, 'fibra');
  assert.equal(c.central.login, 'CENTRAL_LOGIN');
  assert.equal(c.cadastrado_em, '20/03/2024 11:43:25');
});

test('mapearRespostaCliente: "None" do Python NÃO vira texto na tela', () => {
  // servico_vlan chega como a string "None" — renderizar isso é pior que vazio
  const c = mapearRespostaCliente(RAW_SGP, '1').contratos[0];
  assert.equal(c.servico.vlan, null);
  assert.equal(c.servico.mac, null);              // '' também é ausência
  assert.equal(c.wifi.ssid, null);
  assert.equal(c.endereco.referencia, null);      // null puro
});

test('mapearRespostaCliente aceita contato como OBJETO (o que a produção manda)', () => {
  // Bug de 2026-08-22: emails:[{contato,tipoContato,inscricoes}] chegava ao JSX
  // e matava o painel com React #31. Aqui ele vira texto na origem.
  const raw = { contratos: [{ ...RAW_SGP.contratos[0],
    emails:   [{ contato: 'obj@mail.com', tipoContato: 'email', inscricoes: [] }],
    telefones:[{ contato: '(84) 98888-7777', tipoContato: 'celular', inscricoes: [] }],
  }] };
  const r = mapearRespostaCliente(raw, '1');
  assert.equal(r.email, 'obj@mail.com');
  assert.equal(r.fone,  '(84) 98888-7777');
});

test('mapearRespostaCliente ordena por status: ativo antes de cancelado', () => {
  const raw = { contratos: [
    { ...RAW_SGP.contratos[0], contratoId: 1, contratoStatusDisplay: 'Cancelado' },
    { ...RAW_SGP.contratos[0], contratoId: 2, contratoStatusDisplay: 'Ativo' },
  ] };
  assert.deepEqual(mapearRespostaCliente(raw, '1').contratos.map(c => c.id), [2, 1]);
});

test('mapearRespostaCliente sem contrato devolve erro legível, não exceção', () => {
  assert.equal(mapearRespostaCliente({ contratos: [] }, '1').erro, true);
  assert.equal(mapearRespostaCliente(null, '1').erro, true);
});

test('mapearRespostaCliente cai no STATUS_MAP quando não há display', () => {
  const raw = { contratos: [{ ...RAW_SGP.contratos[0], contratoStatusDisplay: '', contratoStatus: 4 }] };
  assert.equal(mapearRespostaCliente(raw, '1').contratos[0].status, 'suspenso');
});

// ── mapearOnuFttx: a topologia da fibra (card ONU) ────────────────
const RAW_ONU = [{
  pon: 15, olt_id: 32, id: 3, onu: 1, slot: 16, olt_name: 'OLT-CONECT-Macaíba',
  type: 'AN5506-02-B', phy_addr: '4441434DED490B9E', vlan: 1003, mode: 'PPPoE',
  cto: 'NETGO-LMR 03', ctoport: 5, service_contrato: 29329, service_login: '29329',
  wifi_ssid: null, description: ' ',
}];

test('mapearOnuFttx monta o card da fibra a partir da lista do FTTH', () => {
  const o = mapearOnuFttx(RAW_ONU);
  assert.equal(o.serial, '4441434DED490B9E');
  assert.equal(o.olt, 'OLT-CONECT-Macaíba');
  assert.equal(o.slot, 16);
  assert.equal(o.pon, 15);
  assert.equal(o.vlan, 1003);
  assert.equal(o.modelo, 'AN5506-02-B');
  assert.equal(o.modo, 'PPPoE');
  assert.equal(o.cto, 'NETGO-LMR 03 (Porta 5)');   // é como o técnico fala
});

test('mapearOnuFttx: lista vazia ou formato inesperado → null (nunca inventa)', () => {
  assert.equal(mapearOnuFttx([]), null);
  assert.equal(mapearOnuFttx(null), null);
  assert.equal(mapearOnuFttx({ erro: 'x' }), null);
});

test('mapearOnuFttx omite CTO sem porta em vez de escrever "(Porta null)"', () => {
  const o = mapearOnuFttx([{ ...RAW_ONU[0], ctoport: null }]);
  assert.equal(o.cto, 'NETGO-LMR 03');
  assert.equal(mapearOnuFttx([{ ...RAW_ONU[0], cto: null }]).cto, null);
});
