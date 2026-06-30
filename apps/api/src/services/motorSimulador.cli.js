#!/usr/bin/env node
/**
 * CLI do simulador de conversas.
 *
 *   node src/services/motorSimulador.cli.js <fluxo.json> [cenario.json]
 *
 * fluxo.json   — export do editor ({nodes,edges}), linha de `fluxos` ({dados})
 *                ou legado ({nos,conexoes}).
 * cenario.json — { "turnos": ["oi","boleto",...],
 *                  "decisoes": { "no_id": "porta", ... },   // p/ nós de IO/IA/SGP
 *                  "contextoInicial": { ... } }
 *                Sem cenário, roda um único turno ("oi").
 *
 * Imprime o passo a passo (cliente ⇄ bot) e o veredito. Exit 1 se a conversa
 * travar, se perder o cliente, ou se o fluxo não tiver entrada.
 */
import { readFileSync } from 'node:fs';
import { simularConversa } from './motorSimulador.js';

const VEREDITO = {
  concluido:   { icone: '✅', txt: 'CONCLUÍDO — a conversa chegou ao fim normalmente', ruim: false },
  aguardando:  { icone: '⏳', txt: 'AGUARDANDO — parou esperando o cliente (sem mais turnos no cenário)', ruim: false },
  perdido:     { icone: '❌', txt: 'PERDIDO — a conversa morreu num nó sem saída; cliente largado sem atendimento', ruim: true },
  travado:     { icone: '❌', txt: 'TRAVADO — loop sem pausa: bateu no teto de 15 iterações', ruim: true },
  erro:        { icone: '❌', txt: 'ERRO — um nó lançou exceção durante a execução', ruim: true },
  sem_entrada: { icone: '❌', txt: 'SEM ENTRADA — o fluxo não tem nó inicio/gatilho_keyword', ruim: true },
};

function carregarFluxo(caminho) {
  const bruto = JSON.parse(readFileSync(caminho, 'utf8'));
  if (bruto && bruto.nodes && !bruto.dados) return { dados: bruto };
  return bruto;
}

function fmtResp(resp) {
  const corpo = resp.texto || resp.corpo || '';
  const extra = resp.botoes?.length ? ` [botões: ${resp.botoes.map(b => b.label || b.id || b).join(', ')}]`
    : resp.itens?.length ? ` [lista: ${resp.itens.map(i => i.titulo || i.id).join(', ')}]` : '';
  return `(${resp.tipo}) ${corpo}${extra}`.trim();
}

function main() {
  const [, , caminhoFluxo, caminhoCenario] = process.argv;
  if (!caminhoFluxo) {
    console.error('Uso: node src/services/motorSimulador.cli.js <fluxo.json> [cenario.json]');
    process.exit(2);
  }

  let fluxo, cenario = { turnos: ['oi'] };
  try {
    fluxo = carregarFluxo(caminhoFluxo);
    if (caminhoCenario) cenario = JSON.parse(readFileSync(caminhoCenario, 'utf8'));
  } catch (err) {
    console.error(`Erro ao ler arquivos: ${err.message}`);
    process.exit(2);
  }

  simularConversa(fluxo, cenario).then((r) => {
    console.log(`\n🎬 Simulação de conversa: ${caminhoFluxo}\n`);
    r.turnos.forEach((turno, i) => {
      console.log(`── Turno ${i + 1} ─ cliente: "${turno.mensagem}"`);
      if (!turno.respostas.length) console.log('   (bot não respondeu nada neste turno)');
      for (const resp of turno.respostas) console.log(`   bot → ${fmtResp(resp)}`);
      console.log(`   nós: ${turno.trilha.join(' → ') || '(nenhum)'}  ·  status: ${turno.status}\n`);
    });

    console.log(`Trilha completa: ${r.trilha.join(' → ')}`);
    const v = VEREDITO[r.status] || { icone: '❔', txt: r.status, ruim: true };
    console.log(`\n${v.icone} ${v.txt}`);
    if (r.perdidoEm) console.log(`   (perdeu no nó: ${r.perdidoEm})`);
    console.log('');
    process.exit(v.ruim ? 1 : 0);
  });
}

main();
