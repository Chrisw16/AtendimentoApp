import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Star, TrendingUp, MessageSquare, Users } from 'lucide-react';
import styles from './Satisfacao.module.css';

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
  const { data, isLoading } = useQuery({
    queryKey: ['satisfacao'],
    queryFn:  () => api.get('/satisfacao/resumo'),
    staleTime: 60000,
  });

  const { data: avaliacoes = [] } = useQuery({
    queryKey: ['satisfacao', 'recentes'],
    queryFn:  () => api.get('/satisfacao/avaliacoes?limit=20'),
    select:   d => d.avaliacoes || d,
  });

  const resumo  = data?.resumo  || {};
  const dist    = data?.distribuicao || {};
  const total   = resumo.total || 0;
  const media   = Number(resumo.media || 0).toFixed(1);
  const nps     = resumo.nps || 0;

  return (
    <div className={styles.root}>
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
            <div className={styles.avList}>
              {avaliacoes.map(av => <AvaliacaoCard key={av.id} av={av} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
