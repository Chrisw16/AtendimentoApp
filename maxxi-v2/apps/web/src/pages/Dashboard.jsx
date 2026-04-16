import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../lib/api';
import {
  MessageSquare, Users, CheckCircle, Clock,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import styles from './Dashboard.module.css';

// ── KPI CARD ─────────────────────────────────────────────────────
function KpiCard({ label, value, unit = '', icon: Icon, trend, trendLabel, color = 'default' }) {
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendCls  = trend > 0 ? styles.trendUp : trend < 0 ? styles.trendDown : styles.trendFlat;

  return (
    <div className={[styles.kpiCard, styles[`kpiCard-${color}`]].join(' ')}>
      <div className={styles.kpiHeader}>
        <span className={styles.kpiLabel}>{label}</span>
        <div className={[styles.kpiIcon, styles[`kpiIcon-${color}`]].join(' ')}>
          <Icon size={14} />
        </div>
      </div>
      <div className={styles.kpiValue}>
        <span className={styles.kpiNumber}>{value}</span>
        {unit && <span className={styles.kpiUnit}>{unit}</span>}
      </div>
      {trendLabel && (
        <div className={[styles.kpiTrend, trendCls].join(' ')}>
          <TrendIcon size={11} />
          <span>{trendLabel}</span>
        </div>
      )}
    </div>
  );
}

// ── AGENTE ROW ────────────────────────────────────────────────────
function AgenteRow({ agente }) {
  return (
    <div className={styles.agenteRow}>
      <div className={styles.agenteAvatar}>
        {agente.avatar?.length <= 2 ? agente.avatar : agente.nome.charAt(0)}
      </div>
      <div className={styles.agenteInfo}>
        <span className={styles.agenteNome}>{agente.nome}</span>
        <span className={styles.agenteConvs}>{agente.conversas_ativas} conversa(s)</span>
      </div>
      <div className={[styles.onlineDot, agente.online && styles.online].join(' ')} />
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: kpis, isLoading: loadingKpis } = useQuery({
    queryKey: ['dashboard', 'kpis'],
    queryFn:  dashboardApi.kpis,
    refetchInterval: 30000,
  });

  const { data: agentes = [] } = useQuery({
    queryKey: ['dashboard', 'agentes'],
    queryFn:  dashboardApi.agentes,
    refetchInterval: 15000,
  });

  const { data: atendimentos = [] } = useQuery({
    queryKey: ['dashboard', 'atendimentos', '7d'],
    queryFn:  () => dashboardApi.atendimentos('7d'),
  });

  if (loadingKpis) {
    return (
      <div className={styles.loading}>
        <span className="spinner spinner-lg" aria-label="Carregando dashboard" />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* ── KPIs ── */}
      <section aria-label="Indicadores principais" className={styles.kpisGrid}>
        <KpiCard
          label="Total de conversas"
          value={kpis?.total_conversas ?? '—'}
          icon={MessageSquare}
          color="default"
        />
        <KpiCard
          label="Aguardando atendimento"
          value={kpis?.abertas ?? '—'}
          icon={Clock}
          color="warning"
          trendLabel="na fila agora"
          trend={0}
        />
        <KpiCard
          label="Em atendimento"
          value={kpis?.em_atendimento ?? '—'}
          icon={Users}
          color="info"
        />
        <KpiCard
          label="Encerradas hoje"
          value={kpis?.encerradas_hoje ?? '—'}
          icon={CheckCircle}
          color="success"
        />
        <KpiCard
          label="NPS médio"
          value={kpis?.nps_medio ?? '—'}
          unit="/ 5"
          icon={TrendingUp}
          color="accent"
        />
        <KpiCard
          label="Tempo médio de resposta"
          value={kpis?.tmo_minutos ?? '—'}
          unit="min"
          icon={Clock}
          color="default"
        />
      </section>

      <div className={styles.bottom}>
        {/* ── GRÁFICO SIMPLES (barras inline) ── */}
        <section className={styles.chartCard} aria-label="Atendimentos nos últimos 7 dias">
          <h2 className={styles.sectionTitle}>Atendimentos (7 dias)</h2>
          <div className={styles.barChart}>
            {atendimentos.length === 0 ? (
              <p className={styles.empty}>Sem dados suficientes</p>
            ) : (() => {
              const max = Math.max(...atendimentos.map(r => Number(r.total)));
              return atendimentos.map(row => (
                <div key={row.data} className={styles.barItem}>
                  <div className={styles.barWrap}>
                    <div
                      className={styles.bar}
                      style={{ height: `${max > 0 ? (Number(row.total) / max) * 100 : 0}%` }}
                      aria-label={`${row.data}: ${row.total}`}
                    />
                  </div>
                  <span className={styles.barLabel}>
                    {new Date(row.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </span>
                  <span className={styles.barValue}>{row.total}</span>
                </div>
              ));
            })()}
          </div>
        </section>

        {/* ── AGENTES ONLINE ── */}
        <section className={styles.agentesCard} aria-label="Status dos agentes">
          <h2 className={styles.sectionTitle}>
            Agentes
            <span className={styles.onlineCount}>
              {agentes.filter(a => a.online).length} online
            </span>
          </h2>
          <div className={styles.agentesList}>
            {agentes.length === 0 ? (
              <p className={styles.empty}>Nenhum agente cadastrado</p>
            ) : (
              agentes.map(a => <AgenteRow key={a.id} agente={a} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
