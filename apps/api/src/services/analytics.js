/**
 * analytics.js — a camada de LEITURA (FASE 12).
 *
 * Não há event store: 21 dos 24 eventos do §100 já viviam em tabelas tipadas
 * (`ia_execucoes`, `playbook_execucoes`, `knowledge_uso`, `copiloto_eventos`,
 * `quality_auditorias`, `satisfacao`, colunas de `conversas`). Duplicá-los num
 * `(tipo, payload jsonb)` criaria duas verdades para o mesmo fato e nasceria
 * vazio. Ver o cabeçalho da migration 025.
 *
 * Este arquivo lê as views `conversa_fatos` e `nps_unificado`; a aritmética que
 * decide indicador mora em `analyticsHelpers.js`, que é puro e testado.
 */
import { getDb } from '../config/db.js';
import { agregarNps } from './fluxoHelpers.js';
import { resumoExecutivo, custoEvitado, custoDeTokens, taxa, media } from './analyticsHelpers.js';

/** Clamp obrigatório: o valor entra interpolado no `interval`. */
const dias = (d) => Math.min(Math.max(Number(d) || 30, 1), 365);

const PADRAO = { janela_recontato_h: 24, custo_chamado: 0, custo_atendimento_humano: 0, precos_llm: {} };

/**
 * `lerValorKV` recebe o valor CRU e decifra antes de parsear — nunca a chave.
 * É a regra da FASE 3: o `try { JSON.parse } catch { cru }` antigo fazia o
 * ciphertext virar "o valor".
 */
export async function config() {
  try {
    const { lerValorKV } = await import('./kvSeguro.js');
    const linha = await getDb()('sistema_kv').where({ chave: 'analytics_config' }).first();
    const v = lerValorKV(linha?.valor, 'analytics_config');
    return v && typeof v === 'object' ? { ...PADRAO, ...v } : PADRAO;
  } catch (err) {
    console.error('[Analytics] config:', err.message);
    return PADRAO;
  }
}

async function fatos(db, d) {
  return db('conversa_fatos').whereRaw(`criado_em >= now() - interval '${dias(d)} days'`);
}

/** §101/§102/§103 — o bloco executivo. */
export async function executivo({ dias: d = 30 } = {}) {
  const db = getDb();
  const cfg = await config();
  const linhas = await fatos(db, d);

  const resumo = resumoExecutivo(linhas, { janelaHoras: cfg.janela_recontato_h });
  const nps = agregarNps(await db('nps_unificado')
    .whereRaw(`criado_em >= now() - interval '${dias(d)} days'`)
    .select('nota', 'escala'));

  // §108 — chamado evitado: suporte resolvido pela IA em que NENHUM chamado foi
  // aberto. A tool é a prova; a conversa não é.
  const comChamado = new Set((await db('telemetria')
    .where({ tipo: 'tool', nome: 'criar_chamado', ok: true })
    .whereRaw(`criado_em >= now() - interval '${dias(d)} days'`)
    .pluck('conversa_id')).filter(Boolean));

  const suporteIA = linhas.filter(f =>
    f.status === 'encerrada' && !f.teve_humano && f.desfecho_ia === 'resolvido' && !comChamado.has(f.conversa_id));

  return {
    dias: dias(d),
    ...resumo,
    nps,
    custo_evitado: custoEvitado(
      { chamadosEvitados: suporteIA.filter(f => f.dominio === 'suporte').length, atendimentosIA: suporteIA.length },
      cfg),
  };
}

/** §104/§105 — IA e tools: latência, erro, tokens e custo. */
export async function iaETools({ dias: d = 30 } = {}) {
  const db = getDb();
  const cfg = await config();
  const janela = `criado_em >= now() - interval '${dias(d)} days'`;

  const [tools, llm, desfechos] = await Promise.all([
    db('telemetria').where({ tipo: 'tool' }).whereRaw(janela)
      .groupBy('nome').select('nome')
      .count('id as chamadas')
      .select(db.raw('count(*) FILTER (WHERE ok) as sucesso'))
      .select(db.raw(`count(*) FILTER (WHERE erro = 'timeout') as timeouts`))
      .select(db.raw('percentile_cont(0.95) WITHIN GROUP (ORDER BY ms)::int as p95_ms'))
      .select(db.raw('max(criado_em) FILTER (WHERE NOT ok) as ultimo_erro_em'))
      .orderBy('chamadas', 'desc'),
    db('telemetria').where({ tipo: 'llm' }).whereRaw(janela)
      .groupBy('nome', 'origem').select('nome', 'origem')
      .count('id as chamadas')
      .select(db.raw('count(*) FILTER (WHERE NOT ok) as erros'))
      .sum({ tokens_in: 'tokens_in', tokens_out: 'tokens_out' })
      .select(db.raw('percentile_cont(0.95) WITHIN GROUP (ORDER BY ms)::int as p95_ms')),
    db('ia_execucoes').whereRaw(janela).groupBy('desfecho').select('desfecho').count('id as n'),
  ]);

  const llmComCusto = llm.map(l => ({
    ...l,
    chamadas: Number(l.chamadas), erros: Number(l.erros),
    tokens_in: Number(l.tokens_in) || 0, tokens_out: Number(l.tokens_out) || 0,
    custo: custoDeTokens(
      { modelo: l.nome, tokensIn: l.tokens_in, tokensOut: l.tokens_out }, cfg.precos_llm),
  }));

  const resolvidos = Number(desfechos.find(d2 => d2.desfecho === 'resolvido')?.n) || 0;
  const custoTotal = llmComCusto.reduce((s, l) => s + (l.custo ?? 0), 0);
  const semPreco = llmComCusto.some(l => l.custo === null);

  return {
    dias: dias(d),
    tools: tools.map(t => ({
      nome: t.nome, chamadas: Number(t.chamadas), sucesso: Number(t.sucesso),
      timeouts: Number(t.timeouts), p95_ms: t.p95_ms,
      taxa_sucesso: taxa(t.sucesso, t.chamadas), ultimo_erro_em: t.ultimo_erro_em,
    })),
    llm: llmComCusto,
    desfechos: Object.fromEntries(desfechos.map(x => [x.desfecho, Number(x.n)])),
    custo_total: semPreco ? null : Number(custoTotal.toFixed(2)),
    // Um custo por resolvido com preço faltando seria menor que o real.
    custo_por_resolvido: semPreco || !resolvidos ? null : Number((custoTotal / resolvidos).toFixed(4)),
    precos_configurados: !semPreco,
  };
}

/** §111 — filas e agentes: os três marcos que já existiam separados. */
export async function filas({ dias: d = 30 } = {}) {
  const db = getDb();
  const linhas = await db('conversa_fatos as cf')
    .leftJoin('filas as f', 'f.id', 'cf.fila_id')
    .whereRaw(`cf.criado_em >= now() - interval '${dias(d)} days'`)
    .select('cf.fila_id', 'f.nome as fila_nome', 'cf.espera_seg', 'cf.resposta_hum_seg', 'cf.duracao_seg', 'cf.teve_humano');

  const porFila = new Map();
  for (const l of linhas) {
    const chave = l.fila_id || 'sem_fila';
    if (!porFila.has(chave)) porFila.set(chave, { fila_id: l.fila_id, nome: l.fila_nome || 'Sem fila', esperas: [], respostas: [], total: 0 });
    const g = porFila.get(chave);
    g.total++;
    if (l.espera_seg) g.esperas.push(l.espera_seg);
    if (l.resposta_hum_seg) g.respostas.push(l.resposta_hum_seg);
  }

  return {
    dias: dias(d),
    filas: [...porFila.values()].map(g => ({
      fila_id: g.fila_id, nome: g.nome, atendimentos: g.total,
      espera_media_seg: media(g.esperas),
      resposta_media_seg: media(g.respostas),
    })),
  };
}

/** §110 — o que a base de conhecimento resolve (e o que falta nela). */
export async function conhecimento({ dias: d = 30 } = {}) {
  const db = getDb();
  const janela = `u.criado_em >= now() - interval '${dias(d)} days'`;

  const [maisUsados, semUso, lacunas, feedback, vencendo] = await Promise.all([
    db('knowledge_uso as u').join('knowledge_artigos as a', 'a.id', 'u.artigo_id')
      .whereRaw(janela).groupBy('a.id', 'a.titulo').select('a.id', 'a.titulo')
      .count('u.id as usos').orderBy('usos', 'desc').limit(10),
    db('knowledge_artigos as a').where('a.status', 'publicado')
      .whereNotExists(q => q.select(1).from('knowledge_uso as u').whereRaw('u.artigo_id = a.id'))
      .count('a.id as n').first(),
    db('knowledge_gaps').where({ status: 'aberto' }).orderBy('ocorrencias', 'desc').limit(10)
      .select('pergunta', 'ocorrencias', 'ultima_em'),
    db('knowledge_feedback').groupBy('tipo').select('tipo').count('id as n'),
    db('knowledge_artigos').where('status', 'publicado')
      .whereRaw(`valido_ate < now() + interval '30 days'`).count('id as n').first(),
  ]);

  return {
    dias: dias(d),
    mais_usados: maisUsados.map(a => ({ ...a, usos: Number(a.usos) })),
    publicados_sem_uso: Number(semUso?.n) || 0,
    lacunas,
    feedback: Object.fromEntries(feedback.map(f => [f.tipo, Number(f.n)])),
    revisao_vencendo: Number(vencendo?.n) || 0,
  };
}

/** §112 — NPS unificado, com corte. As FAIXAS continuam em `agregarNps`. */
export async function nps({ dias: d = 30, corte = null } = {}) {
  const db = getDb();
  const linhas = await db('nps_unificado as n')
    .leftJoin('conversa_fatos as cf', 'cf.conversa_id', 'n.conversa_id')
    .leftJoin('filas as f', 'f.id', 'cf.fila_id')
    .whereRaw(`n.criado_em >= now() - interval '${dias(d)} days'`)
    .select('n.nota', 'n.escala', 'n.origem', 'cf.teve_humano', 'cf.topico', 'f.nome as fila_nome');

  const geral = agregarNps(linhas);
  if (!corte) return { dias: dias(d), geral, total: linhas.length };

  const chaveDe = {
    resolucao: (l) => (l.teve_humano ? 'humano' : 'ia'),
    fila:      (l) => l.fila_nome || 'sem fila',
    topico:    (l) => l.topico || 'sem assunto',
    origem:    (l) => l.origem,
  }[corte];
  if (!chaveDe) return { dias: dias(d), geral, total: linhas.length };

  const grupos = new Map();
  for (const l of linhas) {
    const k = chaveDe(l);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(l);
  }

  return {
    dias: dias(d), geral, total: linhas.length, corte,
    grupos: [...grupos.entries()].map(([chave, ls]) => ({ chave, total: ls.length, ...agregarNps(ls) })),
  };
}
