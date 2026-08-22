import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../lib/api';
import styles from './Analytics.module.css';

/**
 * Analytics (FASE 12).
 *
 * A regra da tela: **nenhum número aparece sem contexto**. Taxa vem com a base,
 * nota de qualidade vem com a cobertura, custo vem dizendo se o preço foi
 * configurado, e o que não dá para saber mostra "—" em vez de zero. Indicador
 * sem denominador é a forma mais fácil de mentir com dado verdadeiro.
 */

const JANELAS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']];
const pct = (v) => v == null ? '—' : `${v}%`;
const seg = (v) => v == null ? '—' : v >= 60 ? `${Math.round(v / 60)} min` : `${v}s`;

function Kpi({ valor, rotulo, detalhe, cor }) {
  return (
    <div className={styles.kpi} data-cor={cor}>
      <span>{valor}</span>
      <small>{rotulo}</small>
      {detalhe && <em>{detalhe}</em>}
    </div>
  );
}

export default function Analytics() {
  const [dias, setDias] = useState(30);
  const q = (nome, fn) => useQuery({ queryKey: ['an', nome, dias], queryFn: () => fn(dias), retry: false });

  const { data: exec }  = q('executivo', analyticsApi.executivo);
  const { data: ia }    = q('ia', analyticsApi.ia);
  const { data: filas } = q('filas', analyticsApi.filas);
  const { data: kb }    = q('conhecimento', analyticsApi.conhecimento);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h1 className={styles.titulo}>Analytics</h1>
        <div className={styles.janelas}>
          {JANELAS.map(([d, l]) => (
            <button key={d} className={dias === d ? styles.janelaOn : styles.janela} onClick={() => setDias(d)}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── EXECUTIVO ── */}
      {exec && (
        <>
          <section className={styles.secao}>
            <h2 className={styles.secaoTitulo}>Visão executiva</h2>
            <div className={styles.kpis}>
              <Kpi valor={exec.atendimentos} rotulo="atendimentos" detalhe={`${exec.encerrados} encerrados`} />
              {/* Os dois juntos de propósito: só o aparente seria propaganda. */}
              <Kpi valor={pct(exec.resolucao_ia_aparente)} rotulo="resolução IA (aparente)" detalhe="encerrou sem humano" />
              <Kpi valor={pct(exec.resolucao_ia_efetiva)} rotulo="resolução IA (efetiva)" detalhe="resolvida e sem recontato"
                   cor={exec.resolucao_ia_efetiva >= 50 ? 'bom' : exec.resolucao_ia_efetiva != null ? 'medio' : undefined} />
              <Kpi valor={pct(exec.recontato)} rotulo="recontato" detalhe="voltou depois de encerrar"
                   cor={exec.recontato > 20 ? 'ruim' : undefined} />
              <Kpi valor={pct(exec.com_humano)} rotulo="com atendente" />
              <Kpi valor={exec.duracao_media_min == null ? '—' : `${exec.duracao_media_min} min`} rotulo="duração média" />
              <Kpi valor={seg(exec.espera_media_seg)} rotulo="espera na fila" />
              <Kpi valor={exec.nps?.nps ?? '—'} rotulo="NPS" detalhe={`${exec.nps?.total || 0} respostas`} />
              {/* A cobertura vai junto: sem ela a nota de 3 auditadas vira nota da operação. */}
              <Kpi valor={exec.quality?.media ?? '—'} rotulo="qualidade"
                   detalhe={`${exec.quality?.auditadas || 0} de ${exec.quality?.de || 0} auditados`} />
            </div>
          </section>

          <section className={styles.secao}>
            <h2 className={styles.secaoTitulo}>Custo evitado</h2>
            <p className={styles.nota}>
              {exec.custo_evitado.configurado
                ? <>Estimativa de <strong>R$ {exec.custo_evitado.total_estimado}</strong> em {exec.custo_evitado.atendimentos_ia} atendimentos resolvidos sem humano.</>
                : <>Estimativa indisponível: os custos unitários ainda não foram configurados. {exec.custo_evitado.atendimentos_ia} atendimentos foram resolvidos sem humano e sem abrir chamado.</>}
              {' '}<em>Sempre uma estimativa, nunca um valor apurado.</em>
            </p>
          </section>
        </>
      )}

      {/* ── IA E FERRAMENTAS ── */}
      {ia && (
        <section className={styles.secao}>
          <h2 className={styles.secaoTitulo}>IA e ferramentas</h2>
          <div className={styles.kpis}>
            {Object.entries(ia.desfechos || {}).map(([k, v]) => <Kpi key={k} valor={v} rotulo={k.replace(/_/g, ' ')} />)}
            <Kpi valor={ia.custo_total == null ? '—' : `R$ ${ia.custo_total}`} rotulo="custo de IA"
                 detalhe={ia.precos_configurados ? null : 'preço do modelo não configurado'} />
            <Kpi valor={ia.custo_por_resolvido == null ? '—' : `R$ ${ia.custo_por_resolvido}`} rotulo="por resolvido" />
          </div>

          {ia.tools?.length > 0 && (
            <table className={styles.tabela}>
              <thead><tr><th>Ferramenta</th><th>Chamadas</th><th>Sucesso</th><th>Timeouts</th><th>p95</th><th>Último erro</th></tr></thead>
              <tbody>
                {ia.tools.map(t => (
                  <tr key={t.nome}>
                    <td>{t.nome.replace(/_/g, ' ')}</td>
                    <td>{t.chamadas}</td>
                    <td className={t.taxa_sucesso < 90 ? styles.ruim : undefined}>{pct(t.taxa_sucesso)}</td>
                    <td>{t.timeouts || '—'}</td>
                    <td>{t.p95_ms ? `${t.p95_ms}ms` : '—'}</td>
                    <td>{t.ultimo_erro_em ? new Date(t.ultimo_erro_em).toLocaleString('pt-BR') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* ── FILAS ── */}
      {filas?.filas?.length > 0 && (
        <section className={styles.secao}>
          <h2 className={styles.secaoTitulo}>Filas</h2>
          <table className={styles.tabela}>
            <thead><tr><th>Fila</th><th>Atendimentos</th><th>Espera média</th><th>1ª resposta do atendente</th></tr></thead>
            <tbody>
              {filas.filas.map(f => (
                <tr key={f.fila_id || 'sem'}>
                  <td>{f.nome}</td><td>{f.atendimentos}</td>
                  <td>{seg(f.espera_media_seg)}</td><td>{seg(f.resposta_media_seg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── CONHECIMENTO ── */}
      {kb && (
        <section className={styles.secao}>
          <h2 className={styles.secaoTitulo}>Conhecimento</h2>
          <div className={styles.kpis}>
            <Kpi valor={kb.publicados_sem_uso} rotulo="publicados sem uso" detalhe="ninguém consultou" />
            <Kpi valor={kb.lacunas?.length || 0} rotulo="lacunas abertas" />
            <Kpi valor={kb.revisao_vencendo} rotulo="revisão vencendo" detalhe="próximos 30 dias" />
            <Kpi valor={kb.feedback?.incorreto || 0} rotulo="marcados incorretos" cor={kb.feedback?.incorreto ? 'ruim' : undefined} />
          </div>
          {kb.lacunas?.length > 0 && (
            <div className={styles.lacunas}>
              {kb.lacunas.slice(0, 5).map((l, i) => (
                <p key={i}><strong>{l.ocorrencias}×</strong> {l.pergunta}</p>
              ))}
            </div>
          )}
        </section>
      )}

      {!exec && <p className={styles.vazio}>Sem dados na janela escolhida.</p>}
    </div>
  );
}
