import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  MessageSquare, Users, Bot, Clock, Star,
  TrendingUp, TrendingDown, Minus, RefreshCw,
} from 'lucide-react';
import styles from './Dashboard.module.css';

const RANGES = [
  { id: '7d',  label: 'Últimos 7 dias'  },
  { id: '30d', label: 'Últimos 30 dias' },
  { id: '90d', label: 'Últimos 90 dias' },
];

// ── KPI CARD ─────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'blue', icon: Icon, trend }) {
  return (
    <div className={[styles.kpi, styles[`kpi-${color}`]].join(' ')}>
      <div className={styles.kpiTop}>
        <span className={styles.kpiLabel}>{label}</span>
        <div className={[styles.kpiIcon, styles[`kpiIcon-${color}`]].join(' ')}>
          <Icon size={14}/>
        </div>
      </div>
      <div className={styles.kpiValue}>{value ?? '—'}</div>
      {sub && <div className={styles.kpiSub}>{sub}</div>}
    </div>
  );
}

// ── MINI BARRA ────────────────────────────────────────────────────
function MiniBar({ data, campo, color }) {
  if (!data?.length) return <div className={styles.empty}>Sem dados</div>;
  const max = Math.max(...data.map(d => Number(d[campo] || 0)), 1);
  return (
    <div className={styles.barChart}>
      {data.map((d, i) => {
        const h = Math.round((Number(d[campo] || 0) / max) * 100);
        const dt = String(d.data || '').slice(5); // MM-DD
        return (
          <div key={i} className={styles.barItem}>
            <div className={styles.barWrap}>
              <div className={styles.bar} style={{ height: `${Math.max(h, 2)}%`, background: color }}/>
            </div>
            {data.length <= 15 && <span className={styles.barLabel}>{dt}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── DONUT ─────────────────────────────────────────────────────────
const CANAL_COLORS = { whatsapp: '#25D366', instagram: '#E1306C', telegram: '#229ED9', widget: '#2050B8', default: '#9CA3AF' };

function DonutChart({ canais }) {
  if (!canais?.length) return <div className={styles.empty}>Sem dados</div>;
  const total = canais.reduce((s, c) => s + c.total, 0);
  if (!total) return <div className={styles.empty}>Sem dados</div>;

  let offset = 0;
  const R = 60, CX = 80, CY = 80;
  const circ = 2 * Math.PI * R;

  const slices = canais.map(c => {
    const pct  = c.total / total;
    const dash = pct * circ;
    const slice = { canal: c.canal, total: c.total, pct, dash, offset, color: CANAL_COLORS[c.canal] || CANAL_COLORS.default };
    offset += dash;
    return slice;
  });

  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 160 160" width={140} height={140}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={26}/>
        {slices.map((s, i) => (
          <circle key={i} cx={CX} cy={CY} r={R} fill="none"
            stroke={s.color} strokeWidth={26}
            strokeDasharray={`${s.dash} ${circ - s.dash}`}
            strokeDashoffset={-s.offset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px` }}/>
        ))}
        <text x={CX} y={CY-6} textAnchor="middle" fontSize={18} fontWeight={700} fill="var(--text-primary)">{total}</text>
        <text x={CX} y={CY+12} textAnchor="middle" fontSize={10} fill="var(--text-tertiary)">total</text>
      </svg>
      <div className={styles.donutLegend}>
        {slices.map((s, i) => (
          <div key={i} className={styles.donutItem}>
            <span className={styles.donutDot} style={{ background: s.color }}/>
            <span className={styles.donutLabel}>{s.canal}</span>
            <span className={styles.donutPct}>{Math.round(s.pct * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── NPS GAUGE ─────────────────────────────────────────────────────
function NpsGauge({ score, label }) {
  const color = score >= 50 ? '#16A34A' : score >= 0 ? '#D97706' : '#DC2626';
  return (
    <div className={styles.npsGauge}>
      <div className={styles.npsScore} style={{ color }}>{score ?? '—'}</div>
      <div className={styles.npsLabel} style={{ color }}>{label || ''}</div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const [range, setRange] = useState('30d');

  const { data: kpis, isLoading: kLoading, refetch: rKpi } = useQuery({
    queryKey: ['dashboard-kpis', range],
    queryFn:  () => api.get(`/dashboard/kpis?range=${range}`),
  });
  const { data: serie, isLoading: sLoading } = useQuery({
    queryKey: ['dashboard-serie', range],
    queryFn:  () => api.get(`/dashboard/serie?range=${range}`),
  });
  const { data: agentes = [] } = useQuery({
    queryKey: ['dashboard-agentes'],
    queryFn:  () => api.get('/dashboard/agentes'),
    refetchInterval: 30000,
  });

  const loading = kLoading || sLoading;

  return (
    <div className={styles.root}>

      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Relatórios</h1>
          <p className={styles.subtitle}>Métricas de atendimento, IA, NPS e canais</p>
        </div>
        <div className={styles.controls}>
          <div className={styles.rangeGroup}>
            {RANGES.map(r => (
              <button key={r.id}
                className={[styles.rangeBtn, range === r.id && styles.rangeBtnActive].join(' ')}
                onClick={() => setRange(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          <button className={styles.refreshBtn} onClick={() => rKpi()} title="Atualizar">
            <RefreshCw size={14} className={loading ? styles.spinning : ''}/>
            Atualizar
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className={styles.kpiGrid}>
        <KpiCard label="Total atendimentos"   value={kpis?.total}      sub={`${range === '7d' ? '7' : range === '30d' ? '30' : '90'} dias`} color="blue"   icon={MessageSquare}/>
        <KpiCard label="Resolvidos pela IA"   value={kpis?.pct_ia != null ? `${kpis.pct_ia}%` : '—'} sub={`${kpis?.so_ia ?? '—'} conversas`} color="green"  icon={Bot}/>
        <KpiCard label="Com atendente humano" value={kpis?.com_humano}  sub="transferidos"          color="orange" icon={Users}/>
        <KpiCard label="Ativas agora"         value={kpis?.ativas}     sub={`${kpis?.aguardando ?? 0} aguardando`} color="blue" icon={MessageSquare}/>
        <KpiCard label="NPS Score"            value={kpis?.nps_score != null ? kpis.nps_score : '—'} sub={kpis?.nps_label || 'sem dados'} color={kpis?.nps_score >= 50 ? 'green' : kpis?.nps_score >= 0 ? 'orange' : 'red'} icon={Star}/>
        <KpiCard label="Respostas NPS"        value={kpis?.nps_total_respostas} sub={`${kpis?.nps_promotores ?? 0} promotores`} color="purple" icon={Star}/>
      </div>

      {/* ── GRÁFICOS LINHA 1 ── */}
      <div className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Atendimentos por dia</span>
            <div className={styles.legend}>
              <span className={styles.legendItem}><span style={{ background:'#2050B8' }} className={styles.legendDot}/>Total</span>
              <span className={styles.legendItem}><span style={{ background:'#E8572A' }} className={styles.legendDot}/>Com humano</span>
            </div>
          </div>
          {loading
            ? <div className={styles.skeleton} style={{ height: 120 }}/>
            : <MiniBar data={serie} campo="total" color="#2050B8"/>}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Por canal</span>
          </div>
          {loading
            ? <div className={styles.skeleton} style={{ height: 140 }}/>
            : <DonutChart canais={kpis?.canais}/>}
        </div>
      </div>

      {/* ── GRÁFICOS LINHA 2 ── */}
      <div className={styles.grid4}>

        {/* Atendimento IA */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Atendimento IA</span>
            <Bot size={14} color="var(--brand-blue)"/>
          </div>
          {loading ? <div className={styles.skeleton} style={{ height: 120 }}/> : (
            <div className={styles.statList}>
              <div className={styles.statRow}><span>Total no período</span><strong>{kpis?.total ?? '—'}</strong></div>
              <div className={styles.statRow}><span>Encerradas</span><strong>{kpis?.encerradas ?? '—'}</strong></div>
              <div className={[styles.statRow, styles.statGreen].join(' ')}>
                <span>Resolvidas só pela IA</span>
                <strong>{kpis?.so_ia ?? '—'} <small>{kpis?.pct_ia != null ? `${kpis.pct_ia}%` : ''}</small></strong>
              </div>
              <div className={[styles.statRow, styles.statOrange].join(' ')}>
                <span>Transferidas p/ humano</span>
                <strong>{kpis?.com_humano ?? '—'}</strong>
              </div>
              <div className={styles.statRow}><span>Ativas agora</span><strong>{kpis?.ativas ?? '—'}</strong></div>
              <div className={[styles.statRow, styles.statYellow].join(' ')}>
                <span>Aguardando resposta</span>
                <strong>{kpis?.aguardando ?? '—'}</strong>
              </div>
            </div>
          )}
        </div>

        {/* NPS Detalhado */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>NPS Detalhado</span>
            <Star size={14} color="#D97706"/>
          </div>
          {loading ? <div className={styles.skeleton} style={{ height: 120 }}/> : (
            <>
              <NpsGauge score={kpis?.nps_score} label={kpis?.nps_label}/>
              <div className={styles.statList}>
                <div className={styles.statRow}><span>Total respostas</span><strong>{kpis?.nps_total_respostas ?? '—'}</strong></div>
                <div className={[styles.statRow, styles.statGreen].join(' ')}><span>Promotores (9–10)</span><strong>{kpis?.nps_promotores ?? '—'}</strong></div>
                <div className={[styles.statRow, styles.statYellow].join(' ')}><span>Neutros (7–8)</span><strong>{kpis?.nps_neutros ?? '—'}</strong></div>
                <div className={[styles.statRow, styles.statRed].join(' ')}><span>Detratores (1–6)</span><strong>{kpis?.nps_detratores ?? '—'}</strong></div>
              </div>
            </>
          )}
        </div>

        {/* Canais detalhado */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Volume por canal</span>
          </div>
          {loading ? <div className={styles.skeleton} style={{ height: 120 }}/> : (
            <div className={styles.statList}>
              {kpis?.canais?.length
                ? kpis.canais.map(c => (
                    <div key={c.canal} className={styles.statRow}>
                      <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ width:8, height:8, borderRadius:'50%', background: CANAL_COLORS[c.canal] || CANAL_COLORS.default, flexShrink:0 }}/>
                        {c.canal}
                      </span>
                      <strong>{c.total}</strong>
                    </div>
                  ))
                : <p className={styles.empty}>Sem dados de canal</p>}
            </div>
          )}
        </div>

        {/* Agentes */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Agentes online</span>
            <span className={styles.onlineBadge}>
              {agentes.filter(a => a.online).length} online
            </span>
          </div>
          <div className={styles.agenteList}>
            {agentes.length === 0
              ? <p className={styles.empty}>Nenhum agente</p>
              : agentes.map(a => (
                  <div key={a.id} className={styles.agenteRow}>
                    <span className={styles.agenteAvatar}>{a.avatar || a.nome?.charAt(0) || '?'}</span>
                    <div className={styles.agenteInfo}>
                      <span className={styles.agenteNome}>{a.nome}</span>
                      <span className={styles.agenteConvs}>{a.conversas_ativas} ativas</span>
                    </div>
                    <span className={[styles.onlineDot, a.online && styles.onlineDotOn].join(' ')}/>
                  </div>
                ))}
          </div>
        </div>

      </div>
    </div>
  );
}
