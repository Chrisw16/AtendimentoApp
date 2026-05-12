import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { satisfacaoApi, agentesApi } from '../lib/api';
import { createSSE } from '../lib/api';
import { Star, TrendingUp, MessageSquare, Users, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import styles from './Satisfacao.module.css';

const LIMIT = 20;

function StarBar({ nota, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className={styles.starBar}>
      <div className={styles.starBarLabel}>
        {Array.from({ length: nota }).map((_, i) => (
          <Star key={i} size={11} className={styles.starFilled} />
        ))}
      </div>
      <div className={styles.starBarTrack}>
        <div className={styles.starBarFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.starBarCount}>{count}</span>
    </div>
  );
}

function AvaliacaoCard({ av }) {
  return (
    <div className={styles.avCard}>
      <div className={styles.avHeader}>
        <div className={styles.avStars}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              size={13}
              className={i < av.nota ? styles.starFilled : styles.starEmpty}
            />
          ))}
        </div>
        <span className={styles.avData}>
          {new Date(av.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
        </span>
      </div>
      {av.comentario && <p className={styles.avComentario}>"{av.comentario}"</p>}
      <div className={styles.avMeta}>
        {av.agente_nome && <span>Agente: {av.agente_nome}</span>}
        {av.protocolo   && <span>#{av.protocolo}</span>}
      </div>
    </div>
  );
}

export default function Satisfacao() {
  const queryClient = useQueryClient();

  const [filtros, setFiltros] = useState({ data_inicio: '', data_fim: '', agente_id: '' });
  const [pagina, setPagina]   = useState(0);

  // Filtros limpos de params vazios
  const filtrosAtivos = Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => v !== '')
  );

  const { data, isLoading } = useQuery({
    queryKey: ['satisfacao', 'resumo', filtrosAtivos],
    queryFn:  () => satisfacaoApi.resumo(filtrosAtivos),
    staleTime: 60000,
  });

  const { data: avData } = useQuery({
    queryKey: ['satisfacao', 'avaliacoes', filtrosAtivos, pagina],
    queryFn:  () => satisfacaoApi.avaliacoes({ ...filtrosAtivos, limit: LIMIT, offset: pagina * LIMIT }),
    staleTime: 30000,
  });

  const { data: agentes = [] } = useQuery({
    queryKey: ['agentes'],
    queryFn:  () => agentesApi.list().then(d => d.agentes || d),
    staleTime: 120000,
  });

  // SSE — atualiza em tempo real quando chega nova avaliação
  useEffect(() => {
    const fechar = createSSE('/chat/sse', {
      nova_avaliacao: () => {
        queryClient.invalidateQueries({ queryKey: ['satisfacao'] });
      },
    });
    return fechar;
  }, [queryClient]);

  const resumo  = data?.resumo       || {};
  const dist    = data?.distribuicao || {};
  const total   = resumo.total || 0;
  const media   = Number(resumo.media || 0).toFixed(1);
  const nps     = resumo.nps || 0;

  const avaliacoes   = avData?.avaliacoes || [];
  const totalAv      = avData?.total      || 0;
  const totalPaginas = Math.max(1, Math.ceil(totalAv / LIMIT));

  function setFiltro(campo, valor) {
    setFiltros(f => ({ ...f, [campo]: valor }));
    setPagina(0);
  }

  return (
    <div className={styles.root}>
      {/* ── FILTROS ── */}
      <div className={styles.filtros}>
        <Filter size={13} className={styles.filtrosIcon} />
        <input
          type="date"
          className={styles.filtroInput}
          value={filtros.data_inicio}
          onChange={e => setFiltro('data_inicio', e.target.value)}
          aria-label="Data início"
        />
        <span className={styles.filtroSep}>–</span>
        <input
          type="date"
          className={styles.filtroInput}
          value={filtros.data_fim}
          onChange={e => setFiltro('data_fim', e.target.value)}
          aria-label="Data fim"
        />
        <select
          className={styles.filtroSelect}
          value={filtros.agente_id}
          onChange={e => setFiltro('agente_id', e.target.value)}
          aria-label="Filtrar por agente"
        >
          <option value="">Todos os agentes</option>
          {agentes.map(ag => (
            <option key={ag.id} value={ag.id}>{ag.nome}</option>
          ))}
        </select>
        {Object.keys(filtrosAtivos).length > 0 && (
          <button
            className={styles.filtroClear}
            onClick={() => { setFiltros({ data_inicio: '', data_fim: '', agente_id: '' }); setPagina(0); }}
          >
            Limpar
          </button>
        )}
      </div>

      {/* ── KPIs ── */}
      <div className={styles.kpis}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}><Star size={16} /></div>
          <div>
            <p className={styles.kpiValue}>{isLoading ? '—' : media}</p>
            <p className={styles.kpiLabel}>Nota média (/ 5)</p>
          </div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}><TrendingUp size={16} /></div>
          <div>
            <p className={styles.kpiValue}>{isLoading ? '—' : `${nps}%`}</p>
            <p className={styles.kpiLabel}>NPS (promotores - detratores)</p>
          </div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}><MessageSquare size={16} /></div>
          <div>
            <p className={styles.kpiValue}>{isLoading ? '—' : total}</p>
            <p className={styles.kpiLabel}>Total de avaliações</p>
          </div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}><Users size={16} /></div>
          <div>
            <p className={styles.kpiValue}>{isLoading ? '—' : `${resumo.com_comentario || 0}`}</p>
            <p className={styles.kpiLabel}>Com comentário</p>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {/* ── DISTRIBUIÇÃO ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Distribuição de notas</h2>
          <div className={styles.distCard}>
            {[5,4,3,2,1].map(nota => (
              <StarBar
                key={nota}
                nota={nota}
                count={dist[nota] || 0}
                total={total}
              />
            ))}
          </div>

          {/* Gauge visual */}
          <div className={styles.gauge}>
            <div className={styles.gaugeFill} style={{ width: `${(media / 5) * 100}%` }} />
            <span className={styles.gaugeLabel}>{media} / 5</span>
          </div>
        </section>

        {/* ── AVALIAÇÕES RECENTES ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Avaliações recentes</h2>
          {avaliacoes.length === 0 ? (
            <div className={styles.empty}>
              <Star size={28} className={styles.emptyIcon} />
              <p>Nenhuma avaliação ainda</p>
              <p className={styles.emptyHint}>Avaliações aparecerão aqui após o encerramento das conversas</p>
            </div>
          ) : (
            <>
              <div className={styles.avList}>
                {avaliacoes.map(av => <AvaliacaoCard key={av.id} av={av} />)}
              </div>

              {/* Paginação */}
              <div className={styles.paginacao}>
                <button
                  className={styles.paginaBtn}
                  onClick={() => setPagina(p => Math.max(0, p - 1))}
                  disabled={pagina === 0}
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className={styles.paginaInfo}>
                  {pagina + 1} / {totalPaginas}
                </span>
                <button
                  className={styles.paginaBtn}
                  onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                  disabled={pagina >= totalPaginas - 1}
                  aria-label="Próxima página"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
