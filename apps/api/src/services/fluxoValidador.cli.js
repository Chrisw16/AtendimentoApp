#!/usr/bin/env node
/**
 * CLI do validador de fluxos.
 *
 *   node src/services/fluxoValidador.cli.js <caminho-do-fluxo.json>
 *
 * Aceita o JSON exportado pelo editor ({nodes,edges}), a linha de `fluxos`
 * ({dados:{...}}) ou o formato legado ({nos,conexoes}). Sai com código 1 se
 * houver erro (cliente travado/perdido), 0 se passar — pronto pra usar em CI.
 */
import { readFileSync } from 'node:fs';
import { parseFluxo, validarFluxo } from './fluxoValidador.js';

const NIVEL = {
  erro:  { icone: '❌', titulo: 'ERROS' },
  aviso: { icone: '⚠️ ', titulo: 'AVISOS' },
};

function carregar(caminho) {
  const bruto = JSON.parse(readFileSync(caminho, 'utf8'));
  // Normaliza export cru {nodes,edges} → {dados:{...}} que o parseFluxo entende.
  if (bruto && bruto.nodes && !bruto.dados) return { dados: bruto };
  return bruto;
}

function imprimir(caminho, fluxo, res) {
  const { nodes, edges } = parseFluxo(fluxo);
  console.log(`\n🔎 Validação de fluxo: ${caminho}`);
  console.log(`   Nós: ${nodes.length} · Arestas: ${edges.length}\n`);

  const erros  = res.problemas.filter(p => p.nivel === 'erro');
  const avisos = res.problemas.filter(p => p.nivel === 'aviso');

  for (const [nivel, lista] of [['erro', erros], ['aviso', avisos]]) {
    if (!lista.length) continue;
    const { icone, titulo } = NIVEL[nivel];
    console.log(`${icone} ${titulo} (${lista.length})`);
    for (const p of lista) {
      const alvo = p.no ? ` [nó ${p.no}${p.porta ? `, porta ${p.porta}` : ''}]` : '';
      console.log(`   • (${p.codigo})${alvo} ${p.msg}`);
    }
    console.log('');
  }

  if (res.ok && !avisos.length) console.log('✅ Nenhum problema encontrado.\n');
  const veredito = res.ok ? 'PASSOU' : 'FALHOU';
  console.log(`Resultado: ${veredito} — ${erros.length} erro(s), ${avisos.length} aviso(s).\n`);
}

function main() {
  const caminho = process.argv[2];
  if (!caminho) {
    console.error('Uso: node src/services/fluxoValidador.cli.js <fluxo.json>');
    process.exit(2);
  }
  let fluxo;
  try {
    fluxo = carregar(caminho);
  } catch (err) {
    console.error(`Erro ao ler "${caminho}": ${err.message}`);
    process.exit(2);
  }
  const res = validarFluxo(fluxo);
  imprimir(caminho, fluxo, res);
  process.exit(res.ok ? 0 : 1);
}

main();
