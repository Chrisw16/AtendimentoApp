import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientesApi } from '../lib/api';
import {
  Search, User, Phone, Mail, MapPin, Wifi, WifiOff,
  FileText, AlertCircle, ChevronRight, ExternalLink,
  Building, Loader,
} from 'lucide-react';
import styles from './Clientes.module.css';

// ── DEBOUNCE HOOK ─────────────────────────────────────────────────
function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useState(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  });
  return debouncedValue;
}

// ── STATUS CONEXÃO ────────────────────────────────────────────────
function StatusConexao({ status }) {
  const map = {
    ativo:     { icon: Wifi,    cls: styles.statusAtivo,    label: 'Ativo' },
    suspenso:  { icon: WifiOff, cls: styles.statusSuspenso, label: 'Suspenso' },
    cancelado: { icon: WifiOff, cls: styles.statusCancelado,label: 'Cancelado' },
    bloqueado: { icon: WifiOff, cls: styles.statusBloqueado,label: 'Bloqueado' },
  };
  const cfg  = map[status?.toLowerCase()] || map.ativo;
  const Icon = cfg.icon;
  return (
    <span className={[styles.statusBadge, cfg.cls].join(' ')}>
      <Icon size={10} /> {cfg.label}
    </span>
  );
}

// ── CLIENTE ROW ───────────────────────────────────────────────────
function ClienteRow({ cliente, onClick, selecionado }) {
  const initial = (cliente.nome || '?').charAt(0).toUpperCase();
  return (
    <button
      className={[styles.row, selecionado && styles.rowSelecionado].join(' ')}
      onClick={onClick}
    >
      <div className={styles.rowAvatar}>{initial}</div>
      <div className={styles.rowInfo}>
        <div className={styles.rowTop}>
          <span className={styles.rowNome}>{cliente.nome}</span>
          {cliente.contrato_status && <StatusConexao status={cliente.contrato_status} />}
        </div>
        <div className={styles.rowBottom}>
          {cliente.telefone && <span className={styles.rowMeta}><Phone size={10}/> {cliente.telefone}</span>}
          {cliente.cidade   && <span className={styles.rowMeta}><MapPin size={10}/> {cliente.cidade}</span>}
          {cliente.plano    && <span className={styles.rowMeta}><Wifi size={10}/> {cliente.plano}</span>}
        </div>
      </div>
      <ChevronRight size={14} className={styles.rowArrow} />
    </button>
  );
}

// ── CLIENTE DETALHE ───────────────────────────────────────────────
function ClienteDetalhe({ cliente, onClose }) {
  if (!cliente) return null;

  return (
    <aside className={styles.detalhe}>
      {/* Header */}
      <div className={styles.detalheHeader}>
        <div className={styles.detalheAvatar}>
          {(cliente.nome || '?').charAt(0).toUpperCase()}
        </div>
        <div className={styles.detalheInfo}>
          <p className={styles.detalheNome}>{cliente.nome}</p>
          {cliente.cpf_cnpj && (
            <p className={styles.detalheCpf}>
              {cliente.cpf_cnpj.length > 11 ? 'CNPJ' : 'CPF'}: {cliente.cpf_cnpj}
            </p>
          )}
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className={styles.detalheScroll}>
        {/* Contato */}
        <Section title="Contato">
          <InfoRow icon={Phone}   label="Telefone"  value={cliente.telefone} />
          <InfoRow icon={Mail}    label="E-mail"    value={cliente.email} />
          <InfoRow icon={MapPin}  label="Endereço"  value={cliente.endereco} />
          <InfoRow icon={MapPin}  label="Cidade"    value={[cliente.cidade, cliente.uf].filter(Boolean).join(' — ')} />
        </Section>

        {/* Contrato */}
        {(cliente.contrato_id || cliente.plano) && (
          <Section title="Contrato">
            <InfoRow icon={FileText} label="Contrato" value={cliente.contrato_id} />
            <InfoRow icon={Wifi}     label="Plano"    value={cliente.plano} />
            <InfoRow icon={Building} label="Status">
              {cliente.contrato_status && <StatusConexao status={cliente.contrato_status} />}
            </InfoRow>
            {cliente.vencimento && (
              <InfoRow icon={FileText} label="Vencimento" value={`Dia ${cliente.vencimento}`} />
            )}
            {cliente.contrato_id && (
              <a
                href={`${process.env.VITE_ERP_URL || '#'}/clientes/${cliente.contrato_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.erpLink}
              >
                <ExternalLink size={11} /> Abrir no ERP
              </a>
            )}
          </Section>
        )}

        {/* Financeiro resumido */}
        {cliente.financeiro && (
          <Section title="Financeiro">
            <InfoRow icon={AlertCircle} label="Vencidas"
              value={`${cliente.financeiro.vencidas || 0} faturas`} />
            <InfoRow icon={FileText} label="Última fatura"
              value={cliente.financeiro.ultima_fatura} />
          </Section>
        )}

        {/* CPE / Dispositivos */}
        {cliente.cpes?.length > 0 && (
          <Section title="Equipamentos CPE">
            {cliente.cpes.map((cpe, i) => (
              <div key={i} className={styles.cpeRow}>
                <Wifi size={12} className={styles.cpeIcon} />
                <div>
                  <p className={styles.cpeModel}>{cpe.modelo || 'CPE'}</p>
                  <p className={styles.cpeSn}>{cpe.serial}</p>
                </div>
                <span className={[styles.cpeDot, cpe.online ? styles.cpeOnline : styles.cpeOffline].join(' ')} />
              </div>
            ))}
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }) {
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>{title}</p>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, children }) {
  if (!value && !children) return null;
  return (
    <div className={styles.infoRow}>
      <Icon size={12} className={styles.infoIcon} />
      <div className={styles.infoContent}>
        <span className={styles.infoLabel}>{label}</span>
        {children || <span className={styles.infoValue}>{value}</span>}
      </div>
    </div>
  );
}

// ── CLIENTES PAGE ─────────────────────────────────────────────────
export default function Clientes() {
  const [busca,      setBusca]      = useState('');
  const [selecionado,setSelecionado]= useState(null);
  const buscaDebounced = useDebounce(busca);

  const { data: clientes = [], isLoading, isFetching } = useQuery({
    queryKey: ['clientes', buscaDebounced],
    queryFn:  () => clientesApi.list({ q: buscaDebounced, limit: 50 }),
    select:   d => d.clientes || d,
    enabled:  true,
  });

  return (
    <div className={styles.root}>
      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div className={styles.searchWrap}>
          <Search size={13} className={styles.searchIcon} />
          <input
            type="search"
            className={styles.search}
            placeholder="Buscar por nome, CPF, telefone..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            autoFocus
          />
          {isFetching && <Loader size={12} className={styles.searchLoading} />}
        </div>
        <span className={styles.counter}>{clientes.length} cliente{clientes.length !== 1 ? 's' : ''}</span>
      </div>

      <div className={styles.content}>
        {/* ── LISTA ── */}
        <div className={styles.lista}>
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={styles.skelRow}>
                <div className={`skeleton ${styles.skelAvatar}`} />
                <div className={styles.skelLines}>
                  <div className={`skeleton ${styles.skelLine1}`} />
                  <div className={`skeleton ${styles.skelLine2}`} />
                </div>
              </div>
            ))
          ) : clientes.length === 0 ? (
            <div className={styles.empty}>
              <User size={32} className={styles.emptyIcon} />
              <p>{busca ? 'Nenhum cliente encontrado' : 'Digite para buscar clientes'}</p>
              <p className={styles.emptyHint}>Busca integrada ao ERP do sistema</p>
            </div>
          ) : (
            clientes.map(c => (
              <ClienteRow
                key={c.id || c.contrato_id || c.telefone}
                cliente={c}
                selecionado={selecionado?.id === c.id}
                onClick={() => setSelecionado(c.id === selecionado?.id ? null : c)}
              />
            ))
          )}
        </div>

        {/* ── DETALHE ── */}
        {selecionado && (
          <ClienteDetalhe
            cliente={selecionado}
            onClose={() => setSelecionado(null)}
          />
        )}
      </div>
    </div>
  );
}
