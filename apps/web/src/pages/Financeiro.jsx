import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  DollarSign, TrendingUp, TrendingDown, AlertCircle,
  CheckCircle, Clock, Filter, Download, RefreshCw,
} from 'lucide-react';
import Button from '../components/ui/Button';
import styles from './Financeiro.module.css';

function fmtMoeda(val) {
  if (val == null) return '—';
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtData(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const STATUS_FATURA = {
  pago:      { cls: styles.fPago,     label: 'Pago',     icon: CheckCircle },
  pendente:  { cls: styles.fPendente, label: 'Pendente', icon: Clock },
  vencido:   { cls: styles.fVencido,  label: 'Vencido',  icon: AlertCircle },
  cancelado: { cls: styles.fCancelado,label: 'Cancelado',icon: AlertCircle },
};

// ── KPI CARD ──────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color = 'default', sub }) {
  return (
    <div className={[styles.kpi, styles[`kpi-${color}`]].join(' ')}>
      <div className={[styles.kpiIcon, styles[`kpiIcon-${color}`]].join(' ')}>
        <Icon size={16} />
      </div>
      <div>
        <p className={styles.kpiValue}>{value}</p>
        <p className={styles.kpiLabel}>{label}</p>
        {sub && <p className={styles.kpiSub}>{sub}</p>}
      </div>
    </div>
  );
}

// ── RÉGUA DE COBRANÇA ─────────────────────────────────────────────
function ReguaCobranca({ regua }) {
  if (!regua?.length) return (
    <div className={styles.empty}>
      <Clock size={24} className={styles.emptyIcon} />
      <p>Régua de cobrança não configurada</p>
    </div>
  );

  return (
    <div className={styles.regua}>
      {regua.map((etapa, i) => (
        <div key={i} className={[styles.reguaEtapa, etapa.ativo && styles.reguaEtapaAtiva].join(' ')}>
          <div className={styles.reguaDia}>
            <span className={styles.reguaDiaNum}>{etapa.dias > 0 ? `+${etapa.dias}` : etapa.dias}</span>
            <span className={styles.reguaDiaLabel}>dias</span>
          </div>
          <div className={styles.reguaConteudo}>
            <p className={styles.reguaNome}>{etapa.nome || `Etapa ${i + 1}`}</p>
            <p className={styles.reguaAcao}>{etapa.acao} — {etapa.canal}</p>
          </div>
          <span className={[styles.reguaBadge, etapa.ativo ? styles.reguaBadgeAtivo : styles.reguaBadgeInativo].join(' ')}>
            {etapa.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── FINANCEIRO PAGE ───────────────────────────────────────────────
export default function Financeiro() {
  const [periodo, setPeriodo] = useState('mes');
  const [pagina,  setPagina]  = useState(1);
  const [filtroStatus, setFiltroStatus] = useState('');

  const { data: resumo, isLoading: loadingResumo } = useQuery({
    queryKey: ['financeiro', 'resumo', periodo],
    queryFn:  () => api.get(`/financeiro/resumo?periodo=${periodo}`),
    staleTime: 60000,
  });

  const { data: cobrancasData, isLoading: loadingCob } = useQuery({
    queryKey: ['financeiro', 'cobrancas', filtroStatus, pagina],
    queryFn:  () => api.get(`/financeiro/cobrancas?status=${filtroStatus}&page=${pagina}&limit=20`),
    staleTime: 30000,
  });

  const { data: reguaData } = useQuery({
    queryKey: ['financeiro', 'regua'],
    queryFn:  () => api.get('/financeiro/regua'),
    staleTime: 300000,
  });

  const cobrancas = cobrancasData?.cobrancas || [];
  const regua     = reguaData?.etapas        || [];
  const r         = resumo                   || {};

  return (
    <div className={styles.root}>
      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div className={styles.periodoGroup}>
          {['semana','mes','trimestre'].map(p => (
            <button key={p}
              className={[styles.periodoBtn, periodo === p && styles.periodoBtnAtivo].join(' ')}
              onClick={() => setPeriodo(p)}>
              {{semana:'7 dias', mes:'30 dias', trimestre:'90 dias'}[p]}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" icon={Download}>Exportar</Button>
      </div>

      {/* ── KPIs ── */}
      <div className={styles.kpis}>
        <KpiCard label="Receita recebida"  value={fmtMoeda(r.receita_recebida)}  icon={TrendingUp}   color="success" />
        <KpiCard label="A receber"         value={fmtMoeda(r.a_receber)}         icon={DollarSign}   color="info"    />
        <KpiCard label="Vencidos"          value={fmtMoeda(r.vencido)}           icon={AlertCircle}  color="danger"
          sub={r.qtd_vencidos ? `${r.qtd_vencidos} fatura${r.qtd_vencidos !== 1 ? 's' : ''}` : undefined} />
        <KpiCard label="Taxa de inadimplência" value={r.inadimplencia ? `${Number(r.inadimplencia).toFixed(1)}%` : '—'} icon={TrendingDown} color="warning" />
      </div>

      <div className={styles.content}>
        {/* ── COBRANÇAS ── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Cobranças</h2>
            <div className={styles.sectionFilters}>
              {['', 'pago', 'pendente', 'vencido'].map(s => (
                <button key={s}
                  className={[styles.filterBtn, filtroStatus === s && styles.filterBtnAtivo].join(' ')}
                  onClick={() => { setFiltroStatus(s); setPagina(1); }}>
                  {s === '' ? 'Todas' : STATUS_FATURA[s]?.label || s}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Cliente</th>
                  <th className={styles.th}>Valor</th>
                  <th className={styles.th}>Vencimento</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Canal</th>
                </tr>
              </thead>
              <tbody>
                {loadingCob ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className={styles.td}>
                          <div className={`skeleton ${styles.skelCell}`} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : cobrancas.length === 0 ? (
                  <tr><td colSpan={5} className={styles.emptyRow}>Nenhuma cobrança encontrada</td></tr>
                ) : cobrancas.map(c => {
                  const smeta = STATUS_FATURA[c.status] || STATUS_FATURA.pendente;
                  const Icon  = smeta.icon;
                  return (
                    <tr key={c.id} className={styles.tr}>
                      <td className={styles.td}>
                        <div className={styles.clienteCell}>
                          <div className={styles.clienteAvatar}>
                            {(c.cliente_nome || '?').charAt(0)}
                          </div>
                          <div>
                            <p className={styles.clienteNome}>{c.cliente_nome || '—'}</p>
                            {c.contrato_id && <p className={styles.clienteId}>#{c.contrato_id}</p>}
                          </div>
                        </div>
                      </td>
                      <td className={styles.td}>
                        <span className={styles.valor}>{fmtMoeda(c.valor)}</span>
                      </td>
                      <td className={styles.td}>
                        <span className={[styles.dataVenc, c.status === 'vencido' && styles.dataVencida].join(' ')}>
                          {fmtData(c.vencimento)}
                        </span>
                      </td>
                      <td className={styles.td}>
                        <span className={[styles.statusBadge, smeta.cls].join(' ')}>
                          <Icon size={10} /> {smeta.label}
                        </span>
                      </td>
                      <td className={styles.td}>
                        <span className={styles.canal}>{c.canal || '—'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação simples */}
          {cobrancasData?.total > 20 && (
            <div className={styles.paginacao}>
              <Button variant="ghost" size="sm" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>
                Anterior
              </Button>
              <span className={styles.paginaLabel}>Página {pagina}</span>
              <Button variant="ghost" size="sm"
                disabled={cobrancas.length < 20}
                onClick={() => setPagina(p => p + 1)}>
                Próxima
              </Button>
            </div>
          )}
        </section>

        {/* ── RÉGUA DE COBRANÇA ── */}
        <section className={styles.sectionSide}>
          <h2 className={styles.sectionTitle}>Régua de cobrança</h2>
          <ReguaCobranca regua={regua} />
        </section>
      </div>
    </div>
  );
}
