/**
 * estadoStore.js — o estado do motor de fluxo, em disco.
 *
 * Substitui o `Map` de processo que vivia em `motorFluxo.js`. Deliberadamente
 * tem a MESMA cara de um `Map` (`get`/`set`/`delete`), só que assíncrona: o
 * sandbox e os testes continuam injetando um `Map` puro por `opts.estados`, e
 * `await` sobre valor síncrono é idêntico — então o motor tem UM caminho de
 * código, não dois.
 *
 * Por isso `get` devolve o **blob cru**, nunca um envelope `{estado, revisao}`:
 * um envelope quebraria as duas rotas de teste de fluxo, que leem
 * `estados.get(SID)` direto e esperam o objeto do motor.
 *
 * ponytail: sem job de expiração. O TTL é aplicado na LEITURA (ver `TTL_HORAS`),
 * que é o único momento em que a execução importa — um reaper periódico seria
 * mais código para o mesmo efeito. A linha morta ocupa espaço até alguém voltar
 * a escrever ou a conversa ser apagada; se isso doer, aí sim vira job.
 *
 * ponytail: sem lock otimista. `filaPorChave` serializa por conversa dentro do
 * processo e a linha é única por `conversa_id`, então com um container (o deploy
 * de hoje) duas gravações concorrentes não existem. Multi-worker de verdade
 * exige lock distribuído por conversa (Redis), não uma coluna `revisao` — que
 * detectaria tarde demais, com o chamado já aberto no SGP.
 */
import { getDb }  from '../config/db.js';
import { expirou } from './politicaRetry.js';

// Os ids de sandbox são `sandbox:<uuid>` e `share:<uuid>`; a coluna é `uuid`.
// Essas rotas injetam o próprio Map e nunca chegam aqui — se um dia chegarem,
// degrada em silêncio em vez de estourar `invalid input syntax for type uuid`.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A regra de expiração mora em `politicaRetry.expirou` — função pura, testada
 * sem Postgres.
 *
 * Não é enfeite: enquanto o estado vivia em memória, **o restart era a
 * expiração** — e deploy é frequente. Sem TTL, o cliente que abre o menu, não
 * responde e some volta três semanas depois com um "bom dia" que é interpretado
 * como resposta ao menu de três semanas atrás: não casa com opção nenhuma, sai
 * pela porta `saida` e, se ela não estiver ligada, o `encontrarProximo` cai no
 * 3º fallback (primeira aresta qualquer) e o despeja num ramo arbitrário.
 * Abandono é o comportamento normal do cliente, não caso de borda.
 *
 * FASE 4: espera de timer (`aguardar_tempo`) é a categoria OPOSTA do abandono —
 * a conversa está parada de propósito e o TTL de 2h a mataria antes do job
 * `flow_resume` rodar. `estado._parkedAte` segura a linha até a hora marcada,
 * com teto duro de 72h.
 */

/** A coluna é `uuid`; ids de sandbox (`sandbox:`/`share:`) não são. */
export const ehUuid = (v) => UUID.test(String(v));

export const estadoStore = {
  async get(conversaId) {
    if (!UUID.test(String(conversaId))) return null;
    const linha = await getDb()('flow_executions').where({ conversa_id: conversaId }).first();
    if (!linha?.estado) return null;

    // Parseia ANTES de decidir: `expirou` lê `_parkedAte` de DENTRO do blob.
    // jsonb já volta objeto no pg; a guarda cobre driver/coluna text.
    const estado = typeof linha.estado === 'string' ? JSON.parse(linha.estado) : linha.estado;

    if (expirou(linha.atualizado_em, estado)) {
      const horas = Math.round((Date.now() - new Date(linha.atualizado_em).getTime()) / 3600_000);
      console.log(`[Estado] Execução de ${conversaId} expirada (${horas}h) — conversa recomeça`);
      await estadoStore.delete(conversaId);
      return null;
    }

    return estado;
  },

  async set(conversaId, estado) {
    if (!UUID.test(String(conversaId))) return;
    const db = getDb();
    await db('flow_executions')
      .insert({ conversa_id: conversaId, estado: JSON.stringify(estado), atualizado_em: db.fn.now() })
      .onConflict('conversa_id')
      .merge(['estado', 'atualizado_em']);
  },

  async delete(conversaId) {
    if (!UUID.test(String(conversaId))) return;
    await getDb()('flow_executions').where({ conversa_id: conversaId }).del();
  },
};
