/**
 * analyticsHelpers.js — as contas PURAS do Analytics (FASE 12).
 *
 * Indicador errado não estoura: vira decisão errada tomada com confiança. E o
 * pior tipo é o indicador que **parece bom por construção** — foi o caso do
 * "resolução IA" do dashboard, que dava ~100% porque `encerrar` zera o
 * `agente_id` e a conta usava justamente isso.
 *
 * Daí a regra desta fase: toda taxa diz de quantos, todo custo diz se foi
 * configurado, e nada vira zero quando a resposta honesta é "não sei".
 */

/** Taxa em %, ou `null` quando não há base. Zero diria "0%", e não é isso. */
export function taxa(parte, total) {
  const t = Number(total);
  if (!Number.isFinite(t) || t <= 0) return null;
  return Math.round((Number(parte) || 0) / t * 100);
}

/**
 * Média inteira, `null` quando não há amostra.
 *
 * `null`/`undefined`/`''` são DESCARTADOS, não lidos como zero — `Number(null)`
 * é 0 e é finito, então o filtro ingênuo puxaria a média para baixo. Numa média
 * de duração, ausente significa "não sei", nunca "durou zero".
 */
export function media(valores = []) {
  const nums = (valores || [])
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(Number)
    .filter(Number.isFinite);
  if (!nums.length) return null;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

/**
 * Custo de uma chamada de LLM, em reais.
 *
 * `precos` é por MILHÃO de tokens (é como os provedores publicam). Modelo sem
 * preço configurado devolve `null`, não zero: um custo zerado somado no
 * relatório vira "a IA é de graça", que é a mentira mais cara possível.
 */
export function custoDeTokens({ modelo, tokensIn = 0, tokensOut = 0 }, precos = {}) {
  const p = precos?.[modelo];
  if (!p) return null;
  const entrada = (Number(tokensIn)  || 0) / 1_000_000 * (Number(p.in)  || 0);
  const saida   = (Number(tokensOut) || 0) / 1_000_000 * (Number(p.out) || 0);
  return Number((entrada + saida).toFixed(4));
}

/**
 * §102 — resolução APARENTE vs EFETIVA.
 *
 * Aparente é "encerrou sem humano". Efetiva exige que a IA tenha declarado
 * `resolvido` **e** que o cliente não tenha voltado na janela. A distinção é o
 * ponto da fase: contar como sucesso um atendimento que virou recontato em duas
 * horas é medir o próprio fracasso como vitória.
 */
export function classificarResolucao(fato, { janelaHoras = 24 } = {}) {
  if (!fato || fato.status !== 'encerrada') return 'em_aberto';
  if (fato.teve_humano) return 'humano';
  if (fato.desfecho_ia !== 'resolvido') return 'ia_sem_resolucao';
  if (houveRecontato(fato, janelaHoras)) return 'ia_com_recontato';
  return 'ia_efetiva';
}

/** O cliente voltou dentro da janela depois de encerrar? */
export function houveRecontato(fato, janelaHoras = 24) {
  if (!fato?.proximo_contato_em || !fato?.encerrada_em) return false;
  const fim = new Date(fato.encerrada_em).getTime();
  const volta = new Date(fato.proximo_contato_em).getTime();
  if (!Number.isFinite(fim) || !Number.isFinite(volta)) return false;
  return volta > fim && (volta - fim) <= janelaHoras * 3_600_000;
}

/**
 * §101/§102/§103 — o bloco executivo, calculado sobre as linhas de
 * `conversa_fatos`. Puro para poder ser conferido.
 */
export function resumoExecutivo(fatos = [], { janelaHoras = 24 } = {}) {
  const encerradas = fatos.filter(f => f.status === 'encerrada');
  const classes = encerradas.map(f => classificarResolucao(f, { janelaHoras }));
  const conta = (c) => classes.filter(x => x === c).length;

  const efetivas = conta('ia_efetiva');
  const aparentes = efetivas + conta('ia_com_recontato') + conta('ia_sem_resolucao');
  const auditadas = fatos.filter(f => Number.isFinite(Number(f.quality_score)));

  return {
    atendimentos: fatos.length,
    encerrados: encerradas.length,
    // Aparente é o número bonito; efetiva é o verdadeiro. Os dois aparecem
    // juntos de propósito — só o primeiro seria propaganda.
    resolucao_ia_aparente: taxa(aparentes, encerradas.length),
    resolucao_ia_efetiva:  taxa(efetivas, encerradas.length),
    com_humano:            taxa(conta('humano'), encerradas.length),
    transferidos:          taxa(fatos.filter(f => f.foi_transferido).length, fatos.length),
    recontato:             taxa(conta('ia_com_recontato'), encerradas.length),
    duracao_media_min:     media(encerradas.map(f => f.duracao_seg).filter(Boolean).map(s => s / 60)),
    espera_media_seg:      media(fatos.map(f => f.espera_seg).filter(Boolean)),
    resposta_humana_media_seg: media(fatos.map(f => f.resposta_hum_seg).filter(Boolean)),
    quality: {
      media: media(auditadas.map(f => f.quality_score)),
      // A cobertura vai JUNTO: sem ela, a nota de 3 conversas auditadas é lida
      // como nota da operação inteira.
      auditadas: auditadas.length,
      de: fatos.length,
    },
  };
}

/**
 * §108 — custo evitado. Sempre acompanhado de `estimativa` e `configurado`.
 *
 * Um número de economia sem dizer que é estimativa vira meta de diretoria; e
 * com custo unitário zerado vira "economizamos R$ 0", que faz o indicador
 * inteiro parecer quebrado quando na verdade só falta configurar.
 */
export function custoEvitado({ chamadosEvitados = 0, atendimentosIA = 0 }, config = {}) {
  const custoChamado = Number(config.custo_chamado) || 0;
  const custoHumano  = Number(config.custo_atendimento_humano) || 0;
  const configurado  = custoChamado > 0 || custoHumano > 0;
  return {
    chamados_evitados: chamadosEvitados,
    atendimentos_ia: atendimentosIA,
    total_estimado: configurado
      ? Number((chamadosEvitados * custoChamado + atendimentosIA * custoHumano).toFixed(2))
      : null,
    estimativa: true,
    configurado,
  };
}
