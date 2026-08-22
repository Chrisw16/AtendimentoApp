#!/usr/bin/env node
/**
 * carga.js — teste de carga caseiro (FASE 13, §147).
 *
 * Zero dependências: `fetch` e `Promise` bastam. `autocannon`/`k6` não pagam o
 * próprio peso aqui — o que se quer medir não é HTTP cru, é a **taxa de
 * drenagem do inbox**, e isso nenhum deles sabe ler.
 *
 * ⚠️ NUNCA contra produção: o webhook cria conversa de verdade, o motor chama o
 * SGP de verdade e o outbox manda WhatsApp de verdade. O alvo é a máquina local
 * com Postgres nativo e SEM credencial de SGP/Anthropic — o que se mede assim é
 * a capacidade do APP (ingestão → motor → outbox), que é a pergunta de sizing.
 * O que NÃO se mede: a latência real de SGP e LLM, que domina o turno de
 * verdade.
 *
 * Uso:  node scripts/carga.js --url http://localhost:4000 --msgs 200 --taxa 20
 */
const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : padrao;
};

const URL_BASE = arg('url', 'http://localhost:4000');
const TOTAL    = Number(arg('msgs', 100));
const TAXA     = Number(arg('taxa', 10));   // mensagens por segundo

const corpo = (i) => ({
  event: 'messages.upsert',
  instance: 'carga',
  data: {
    key: { remoteJid: `55849${String(900000000 + i).slice(-9)}@s.whatsapp.net`, fromMe: false, id: `carga-${i}-${Date.now()}` },
    message: { conversation: 'oi, minha internet está lenta' },
    pushName: `Carga ${i}`,
  },
});

const pct = (arr, p) => {
  if (!arr.length) return null;
  const o = [...arr].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor(o.length * p))];
};

(async () => {
  console.log(`Alvo: ${URL_BASE} · ${TOTAL} mensagens a ${TAXA}/s\n`);
  const latencias = [];
  let erros = 0;
  const inicio = Date.now();

  for (let i = 0; i < TOTAL; i++) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${URL_BASE}/api/webhooks/evolution`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo(i)),
      });
      if (!r.ok) erros++;
    } catch { erros++; }
    latencias.push(Date.now() - t0);
    if (TAXA > 0) await new Promise(r => setTimeout(r, Math.max(0, 1000 / TAXA - (Date.now() - t0))));
  }

  const seg = (Date.now() - inicio) / 1000;
  console.log(`Envio:      ${TOTAL} em ${seg.toFixed(1)}s (${(TOTAL / seg).toFixed(1)}/s)`);
  console.log(`Erros HTTP: ${erros}`);
  console.log(`Webhook:    p50 ${pct(latencias, 0.5)}ms · p95 ${pct(latencias, 0.95)}ms · max ${Math.max(...latencias)}ms`);
  console.log(`\nO webhook deve ficar em MILISSEGUNDOS — ele só persiste no inbox.`);
  console.log(`A drenagem é o número que importa: acompanhe em GET /api/filas`);
  console.log(`ou "SELECT status, count(*) FROM inbox GROUP BY 1".`);
})();
