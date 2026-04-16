import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  Wifi, WifiOff, Server, AlertTriangle, CheckCircle,
  RefreshCw, Activity, Clock, MapPin,
} from 'lucide-react';
import styles from './MonitorRede.module.css';

const STATUS_CONFIG = {
  online:    { icon: CheckCircle, cls: styles.online,  label: 'Online' },
  offline:   { icon: WifiOff,     cls: styles.offline, label: 'Offline' },
  degradado: { icon: AlertTriangle,cls:styles.degradado,label: 'Degradado' },
  unknown:   { icon: Activity,    cls: styles.unknown, label: 'Desconhecido' },
};

function StatusBadge({ status }) {
  const cfg   = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  const Icon  = cfg.icon;
  return (
    <span className={[styles.badge, cfg.cls].join(' ')}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

function EquipCard({ equip }) {
  const cfg  = STATUS_CONFIG[equip.status] || STATUS_CONFIG.unknown;

  return (
    <div className={[styles.equipCard, styles[`equipCard-${equip.status || 'unknown'}`]].join(' ')}>
      <div className={styles.equipHeader}>
        <div className={[styles.equipIcon, styles[`equipIcon-${equip.status}`]].join(' ')}>
          <Server size={14} />
        </div>
        <div className={styles.equipInfo}>
          <p className={styles.equipNome}>{equip.nome || equip.ip}</p>
          <p className={styles.equipIp}>{equip.ip}</p>
        </div>
        <StatusBadge status={equip.status} />
      </div>

      <div className={styles.equipMeta}>
        {equip.localizacao && (
          <span className={styles.equipMetaItem}>
            <MapPin size={10} /> {equip.localizacao}
          </span>
        )}
        {equip.ultima_verificacao && (
          <span className={styles.equipMetaItem}>
            <Clock size={10} />
            {new Date(equip.ultima_verificacao).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}
          </span>
        )}
        {equip.latencia_ms != null && (
          <span className={styles.equipMetaItem}>
            <Activity size={10} /> {equip.latencia_ms}ms
          </span>
        )}
      </div>
    </div>
  );
}

function KpiRedeCard({ label, value, icon: Icon, cls }) {
  return (
    <div className={[styles.kpiCard, cls].join(' ')}>
      <Icon size={18} className={styles.kpiIcon} />
      <div>
        <p className={styles.kpiValue}>{value}</p>
        <p className={styles.kpiLabel}>{label}</p>
      </div>
    </div>
  );
}

export default function MonitorRede() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['monitor-rede'],
    queryFn:  () => api.get('/monitor/status'),
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const equipamentos = data?.equipamentos || [];
  const alertas      = data?.alertas      || [];

  const total   = equipamentos.length;
  const online  = equipamentos.filter(e => e.status === 'online').length;
  const offline = equipamentos.filter(e => e.status === 'offline').length;
  const degradado = equipamentos.filter(e => e.status === 'degradado').length;

  return (
    <div className={styles.root}>
      {/* ── TOPBAR ── */}
      <div className={styles.topbar}>
        <div className={styles.lastUpdate}>
          {dataUpdatedAt ? (
            <>
              <span>Última atualização:</span>
              <span className={styles.lastUpdateTime}>
                {new Date(dataUpdatedAt).toLocaleTimeString('pt-BR')}
              </span>
            </>
          ) : <span>—</span>}
        </div>
        <div className={styles.topbarActions}>
          <label className={styles.autoRefreshToggle}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (30s)
          </label>
          <button
            className={styles.refreshBtn}
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Atualizar agora"
          >
            <RefreshCw size={13} className={isFetching ? styles.spinning : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className={styles.kpis}>
        <KpiRedeCard label="Total" value={total} icon={Server} cls={styles.kpiDefault} />
        <KpiRedeCard label="Online" value={online} icon={Wifi} cls={styles.kpiOnline} />
        <KpiRedeCard label="Offline" value={offline} icon={WifiOff} cls={styles.kpiOffline} />
        <KpiRedeCard label="Degradado" value={degradado} icon={AlertTriangle} cls={styles.kpiDegradado} />
      </div>

      <div className={styles.content}>
        {/* ── EQUIPAMENTOS ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Equipamentos</h2>
          {isLoading ? (
            <div className={styles.grid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`skeleton ${styles.skelCard}`} />
              ))}
            </div>
          ) : equipamentos.length === 0 ? (
            <div className={styles.empty}>
              <Server size={28} className={styles.emptyIcon} />
              <p>Nenhum equipamento monitorado</p>
              <p className={styles.emptyHint}>Configure o monitor de rede nas integrações</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {equipamentos.map((e, i) => <EquipCard key={e.id || i} equip={e} />)}
            </div>
          )}
        </section>

        {/* ── ALERTAS ── */}
        {alertas.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Alertas recentes
              <span className={styles.alertCount}>{alertas.length}</span>
            </h2>
            <div className={styles.alertas}>
              {alertas.map((a, i) => (
                <div key={i} className={[styles.alerta, styles[`alerta-${a.tipo || 'warning'}`]].join(' ')}>
                  <AlertTriangle size={13} className={styles.alertaIcon} />
                  <div className={styles.alertaBody}>
                    <p className={styles.alertaMsg}>{a.mensagem}</p>
                    <p className={styles.alertaTime}>
                      {a.equipamento} · {a.ts ? new Date(a.ts).toLocaleString('pt-BR') : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
