/**
 * knowledge.js — recuperação e curadoria da base de conhecimento (FASE 7).
 *
 * A RECUPERAÇÃO INTEIRA mora em `buscar()`. É de propósito: o plano pedia
 * pgvector (§54), a inspeção mostrou que ele não existe neste Postgres e que
 * não há de onde tirar embedding (ver o cabeçalho da migration 018), e o dia
 * em que houver os dois, o ranqueamento vira híbrido **aqui dentro** sem que
 * nenhum chamador mude — nem a tool da IA, nem a tela.
 *
 * O ranqueamento hoje soma dois sinais:
 *  - `ts_rank_cd` sobre a coluna gerada, com peso maior para título (A) que
 *    para corpo (C) — é o que faz "boleto" achar o artigo *sobre* boleto, e
 *    não o artigo que menciona boleto de passagem;
 *  - similaridade de trigrama no título, que salva o erro de digitação e o
 *    termo que o stemmer não junta ("roteador"/"rotea").
 */
import { getDb } from '../config/db.js';
import { podeTransicionar, erroTransicao, versionaAoEntrar, estaVencido, trechoParaIA } from './knowledgeHelpers.js';

/** A mesma normalização do índice (`knowledge_norm`) + o stemmer português. */
const CHAVE_GAP = `array_to_string(tsvector_to_array(to_tsvector('portuguese', knowledge_norm(?))), ' ')`;

/**
 * Busca semântica-por-palavra sobre o que está PUBLICADO (§52/§54).
 *
 * @param {string} pergunta
 * @param {object} opts  {categoria, tipo, limite, incluirNaoPublicados}
 * @returns {Promise<Array>} artigos com `score` e `desatualizado`
 */
export async function buscar(pergunta, opts = {}) {
  const { categoria = null, tipo = null, limite = 5, incluirNaoPublicados = false } = opts;
  const termo = String(pergunta || '').trim();
  if (!termo) return [];

  const db = getDb();
  // `websearch_to_tsquery` aceita a pergunta do jeito que o cliente escreveu —
  // aspas, OR, sinal de menos — sem NUNCA lançar por sintaxe, que é o que
  // `to_tsquery` faz com um simples "?" e derrubaria a resposta da IA.
  const { rows } = await db.raw(
    `WITH q AS (
       SELECT websearch_to_tsquery('portuguese', knowledge_norm(?)) AS tsq,
              knowledge_norm(?) AS txt
     )
     SELECT a.id, a.titulo, a.slug, a.tipo, a.resumo, a.conteudo, a.status, a.versao,
            a.metadados, a.valido_ate, a.categoria_id, c.nome AS categoria_nome,
            ts_rank_cd(a.busca, q.tsq) AS rank_texto,
            similarity(knowledge_norm(a.titulo), q.txt) AS sim_titulo
       FROM knowledge_artigos a
       CROSS JOIN q
       LEFT JOIN knowledge_categorias c ON c.id = a.categoria_id
      WHERE (${incluirNaoPublicados ? 'TRUE' : `a.status = 'publicado'`})
        -- Os casts são obrigatórios: sem eles o Postgres não infere o tipo de
        -- um parâmetro que aparece apenas num teste de nulidade, e recusa a
        -- query inteira com 42P18.
        -- (E cuidado ao comentar aqui: o knex conta placeholders no texto CRU,
        -- inclusive dentro de comentário SQL.)
        AND (?::uuid IS NULL OR a.categoria_id = ?::uuid)
        AND (?::text IS NULL OR a.tipo = ?::text)
        AND (a.busca @@ q.tsq OR similarity(knowledge_norm(a.titulo), q.txt) > 0.3)
      ORDER BY (ts_rank_cd(a.busca, q.tsq) * 3 + similarity(knowledge_norm(a.titulo), q.txt)) DESC
      LIMIT ?::int`,
    [termo, termo, categoria, categoria, tipo, tipo, Math.min(Number(limite) || 5, 20)],
  );

  return rows.map(r => ({
    ...r,
    score: Number(r.rank_texto) * 3 + Number(r.sim_titulo),
    // Vencido não sai do ar (ver knowledgeHelpers): sai MARCADO, para a IA e o
    // agente saberem que a informação pode ter validade estourada.
    desatualizado: estaVencido(r.valido_ate),
  }));
}

/**
 * O que a IA recebe: título + trecho + a identificação da fonte.
 *
 * A fonte vai junto porque §54 pede rastreabilidade — e porque resposta de IA
 * sem procedência é o que faz um provedor prometer prazo que não existe.
 */
export function formatarParaIA(artigos) {
  if (!artigos.length) return null;
  return artigos.map((a, i) =>
    `[${i + 1}] ${a.titulo}${a.desatualizado ? ' ⚠️ (revisão vencida)' : ''}\n${trechoParaIA(a)}`
  ).join('\n\n---\n\n');
}

/** §55 — qual artigo, em qual VERSÃO, sustentou aquela resposta. */
export async function registrarUso(artigos, { conversaId = null, origem = 'ia', consulta = null } = {}) {
  if (!artigos?.length) return;
  await getDb()('knowledge_uso').insert(artigos.map(a => ({
    artigo_id: a.id, versao: a.versao, conversa_id: conversaId, origem, consulta,
  }))).catch(err => console.error('[Knowledge] registrarUso:', err.message));
}

/**
 * §56 — pergunta que a base não soube responder.
 *
 * `ON CONFLICT ... DO UPDATE` incrementa: a mesma lacuna vira CONTADOR, e é o
 * contador que transforma isto em "visão de lacunas recorrentes" em vez de um
 * log infinito onde ninguém acha nada.
 */
export async function registrarGap(pergunta, { conversaId = null } = {}) {
  const texto = String(pergunta || '').trim();
  if (!texto) return null;
  const db = getDb();
  try {
    const { rows } = await db.raw(
      `INSERT INTO knowledge_gaps (pergunta, pergunta_normalizada)
       VALUES (?, ${CHAVE_GAP})
       ON CONFLICT (pergunta_normalizada) DO UPDATE
         SET ocorrencias = knowledge_gaps.ocorrencias + 1,
             ultima_em   = now(),
             -- reabre: lacuna marcada como resolvida que volta a aparecer é
             -- sinal de que o artigo escrito não respondeu de verdade.
             status = CASE WHEN knowledge_gaps.status = 'resolvido' THEN 'aberto'
                           ELSE knowledge_gaps.status END
       RETURNING *`,
      [texto.slice(0, 500), texto],
    );
    return rows[0];
  } catch (err) {
    // Registrar lacuna é telemetria editorial: nunca pode derrubar a resposta
    // ao cliente, que é o que o usuário está esperando do outro lado.
    console.error('[Knowledge] registrarGap:', err.message);
    return null;
  }
}

/**
 * Busca + rastreio + lacuna, numa chamada. É o que a tool da IA usa.
 * @returns {Promise<{texto: string|null, artigos: Array}>}
 */
export async function consultarParaIA(pergunta, { conversaId = null, limite = 3, sandbox = false } = {}) {
  const artigos = await buscar(pergunta, { limite });

  // A LEITURA é real no sandbox (é o que faz "Testar fluxo" valer alguma
  // coisa), mas a escrita não: uma rodada de teste não pode inflar o contador
  // de lacunas nem sujar o rastreamento de uso, que é o que a curadoria usa
  // para decidir o que escrever.
  if (sandbox) {
    return { texto: artigos.length ? formatarParaIA(artigos) : null, artigos };
  }

  if (!artigos.length) {
    await registrarGap(pergunta, { conversaId });
    return { texto: null, artigos: [] };
  }
  await registrarUso(artigos, { conversaId, origem: 'ia', consulta: String(pergunta).slice(0, 500) });
  return { texto: formatarParaIA(artigos), artigos };
}

// ── CURADORIA ─────────────────────────────────────────────────────

/**
 * Muda o status respeitando o workflow (§52) e congelando versão ao publicar
 * (§53) — nunca sobrescrever conhecimento oficial em silêncio.
 */
export async function mudarStatus(artigoId, novoStatus, { agenteId = null } = {}) {
  const db = getDb();
  const artigo = await db('knowledge_artigos').where({ id: artigoId }).first();
  if (!artigo) return { erro: 'nao_encontrado' };
  if (!podeTransicionar(artigo.status, novoStatus)) {
    return { erro: 'transicao_invalida', mensagem: erroTransicao(artigo.status, novoStatus) };
  }

  return db.transaction(async trx => {
    const patch = { status: novoStatus, atualizado: trx.fn.now() };

    if (versionaAoEntrar(novoStatus)) {
      // A versão publicada é congelada ANTES de o número subir, para que
      // `knowledge_uso.versao` sempre aponte para uma linha que existe.
      await trx('knowledge_versoes').insert({
        artigo_id: artigo.id, versao: artigo.versao,
        titulo: artigo.titulo, conteudo: artigo.conteudo, resumo: artigo.resumo,
        metadados: artigo.metadados, criado_por: agenteId,
      }).onConflict(['artigo_id', 'versao']).ignore();

      patch.publicado_em = trx.fn.now();
      patch.publicado_por = agenteId;
    }

    // Sair de publicado para revisão abre uma versão NOVA: o que for editado
    // agora não pode se confundir com o que estava no ar.
    if (artigo.status === 'publicado' && novoStatus === 'revisao') {
      patch.versao = artigo.versao + 1;
    }

    const [atualizado] = await trx('knowledge_artigos').where({ id: artigo.id }).update(patch).returning('*');
    return { artigo: atualizado };
  });
}
