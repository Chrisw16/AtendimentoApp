/**
 * Clientes — o histórico de quem já falou com a gente.
 *
 * Não é cadastro: o cadastro do assinante é do SGP. A pergunta que esta tela
 * responde é a que só nós sabemos — "este número já nos procurou? quantas
 * vezes? e nós já sabemos quem é?".
 *
 * O vínculo telefone↔CPF aparece aqui porque a IA o gravou na conversa em que
 * identificou o assinante (FASE 6); a view `clientes_contato` só o lê de volta.
 * A ficha do assinante continua sendo do Cliente 360, dentro da conversa —
 * daqui se chega lá por um clique, não por uma segunda consulta ao SGP.
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clientesApi } from '../lib/api';
import {
  Search, User, Phone, MapPin, MessageSquare, BadgeCheck,
  FileText, ChevronRight, Loader, Clock,
} from 'lucide-react';
import styles from './Clientes.module.css';

// ── DEBOUNCE HOOK ─────────────────────────────────────────────────
function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  // Era `useState` aqui: o callback virava inicializador lazy, rodava uma única
  // vez na montagem com o valor inicial (vazio) e o "cleanup" virava o valor do
  // state, nunca sendo chamado. Resultado: o valor debounced nunca mudava e a
  // busca de clientes não funcionava.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

const CANAIS = {
  whatsapp: 'WhatsApp', telegram: 'Telegram', widget: 'Widget',
  email: 'E-mail', voip: 'VoIP', sms: 'SMS',
};

/** "há 3 dias" — quem lê a lista quer distância, não carimbo. */
function haQuanto(iso) {
  if (!iso) return '';
  const dias = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  if (dias < 365) return `há ${Math.floor(dias / 30)} ${Math.floor(dias / 30) === 1 ? 'mês' : 'meses'}`;
  return `há ${Math.floor(dias / 365)} ano${dias >= 730 ? 's' : ''}`;
}

const dataHora = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';

/**
 * O selo diz se ESTE contato tem vínculo com o SGP — não se ele tem nome.
 * O cliente diz o nome dele no primeiro "oi"; isso não identifica ninguém, e
 * prometer ficha do assinante onde não há vínculo é prometer o que não temos.
 */
function SeloIdentificado({ identificado }) {
  return identificado
    ? <span className={[styles.statusBadge, styles.statusAtivo].join(' ')}><BadgeCheck size={10} /> Identificado</span>
    : <span className={[styles.statusBadge, styles.statusSuspenso].join(' ')}>Não identificado</span>;
}

// ── LINHA DA LISTA ────────────────────────────────────────────────
function ContatoRow({ c, onClick, selecionado }) {
  const inicial = (c.nome || '?').charAt(0).toUpperCase();
  return (
    <button
      className={[styles.row, selecionado && styles.rowSelecionado].join(' ')}
      onClick={onClick}
    >
      <div className={styles.rowAvatar}>{inicial}</div>
      <div className={styles.rowInfo}>
        <div className={styles.rowTop}>
          <span className={styles.rowNome}>{c.nome || 'Sem nome'}</span>
          <SeloIdentificado identificado={c.identificado} />
          {c.em_atendimento && <span className={styles.emAtendimento}>em atendimento</span>}
        </div>
        <div className={styles.rowBottom}>
          {c.telefone    && <span className={styles.rowMeta}><Phone size={10} /> {c.telefone}</span>}
          {c.cpf         && <span className={styles.rowMeta}><FileText size={10} /> {c.cpf}</span>}
          {c.contrato_id && <span className={styles.rowMeta}>contrato {c.contrato_id}</span>}
          {c.cidade      && <span className={styles.rowMeta}><MapPin size={10} /> {c.cidade}</span>}
          <span className={styles.rowMeta}>
            <MessageSquare size={10} /> {c.conversas} conversa{Number(c.conversas) !== 1 ? 's' : ''}
          </span>
          <span className={styles.rowMeta}><Clock size={10} /> {haQuanto(c.ultimo_contato)}</span>
        </div>
      </div>
      <ChevronRight size={14} className={styles.rowArrow} />
    </button>
  );
}

// ── PAINEL DO CONTATO ─────────────────────────────────────────────
function ContatoDetalhe({ id, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cliente-contato', id],
    queryFn:  () => clientesApi.get(id),
    enabled:  !!id,
  });

  const c = data?.cliente;

  return (
    <aside className={styles.detalhe}>
      <div className={styles.detalheHeader}>
        <div className={styles.detalheAvatar}>{(c?.nome || '?').charAt(0).toUpperCase()}</div>
        <div className={styles.detalheInfo}>
          <p className={styles.detalheNome}>{c?.nome || 'Sem nome'}</p>
          {c?.telefone && <p className={styles.detalheCpf}>{c.telefone}</p>}
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className={styles.detalheScroll}>
        {isLoading ? (
          <div className={styles.section}><div className={`skeleton ${styles.skelLine1}`} /></div>
        ) : !c ? (
          <div className={styles.empty}><p>Contato não encontrado</p></div>
        ) : (
          <>
            <div className={styles.section}>
              <p className={styles.sectionTitle}>Identificação</p>
              <div className={styles.sectionBody}>
                <InfoRow icon={BadgeCheck} label="Vínculo com o SGP">
                  <SeloIdentificado identificado={c.identificado} />
                </InfoRow>
                <InfoRow icon={FileText} label="CPF/CNPJ" value={c.cpf} />
                <InfoRow icon={FileText} label="Contrato" value={c.contrato_id} />
                <InfoRow icon={MapPin}   label="Cidade"   value={c.cidade} />
                <InfoRow icon={MessageSquare} label="Canal" value={CANAIS[c.ultimo_canal] || c.ultimo_canal} />
                {c.mascarado && (
                  <p className={styles.emptyHint}>
                    CPF e telefone estão mascarados no servidor. Ver completo exige a permissão
                    “Ver CPF e telefone SEM máscara”.
                  </p>
                )}
              </div>
            </div>

            <div className={styles.section}>
              <p className={styles.sectionTitle}>Contato</p>
              <div className={styles.sectionBody}>
                <InfoRow icon={Clock} label="Primeiro contato" value={dataHora(c.primeiro_contato)} />
                <InfoRow icon={Clock} label="Último contato"   value={dataHora(c.ultimo_contato)} />
                <InfoRow icon={MessageSquare} label="Conversas" value={String(c.conversas)} />
              </div>
            </div>

            <div className={styles.section}>
              <p className={styles.sectionTitle}>Histórico</p>
              <div className={styles.sectionBody}>
                {/* Linha estática de propósito: nem /chat nem /histórico aceitam
                    deep-link por id hoje, e conversa encerrada nem aparece na
                    lista do Chat. Um clique que não leva a lugar nenhum é pior
                    que nenhum clique. */}
                {data.conversas.map(cv => (
                  <div key={cv.id} className={styles.conversaRow}>
                    <div className={styles.conversaTop}>
                      <span className={styles.conversaProtocolo}>{cv.protocolo || '—'}</span>
                      <span className={styles.conversaData}>{dataHora(cv.criado_em)}</span>
                    </div>
                    <p className={styles.conversaPreview}>{cv.ultima_mensagem || 'sem mensagens'}</p>
                    <div className={styles.conversaBottom}>
                      <span>{CANAIS[cv.canal] || cv.canal}</span>
                      <span>·</span>
                      <span>{cv.status}</span>
                      {cv.agente && <><span>·</span><span>{cv.agente}</span></>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
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

// ── PÁGINA ────────────────────────────────────────────────────────
export default function Clientes() {
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState(null);
  const buscaDebounced = useDebounce(busca);

  const { data: contatos = [], isLoading, isFetching } = useQuery({
    queryKey: ['clientes', buscaDebounced],
    queryFn:  () => clientesApi.list({ q: buscaDebounced, limit: 50 }),
  });

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.searchWrap}>
          <Search size={13} className={styles.searchIcon} />
          <input
            type="search"
            className={styles.search}
            placeholder="Buscar por nome, telefone, CPF ou contrato"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            autoFocus
          />
          {isFetching && <Loader size={12} className={styles.searchLoading} />}
        </div>
        <span className={styles.counter}>
          {contatos.length} contato{contatos.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className={styles.content}>
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
          ) : contatos.length === 0 ? (
            <div className={styles.empty}>
              <User size={32} className={styles.emptyIcon} />
              <p>{busca ? 'Nenhum contato encontrado' : 'Ninguém entrou em contato ainda'}</p>
              <p className={styles.emptyHint}>
                Cada pessoa que fala com a gente aparece aqui, com o histórico dela.
              </p>
            </div>
          ) : (
            contatos.map(c => (
              <ContatoRow
                key={c.id}
                c={c}
                selecionado={selecionado === c.id}
                onClick={() => setSelecionado(selecionado === c.id ? null : c.id)}
              />
            ))
          )}
        </div>

        {selecionado && (
          <ContatoDetalhe id={selecionado} onClose={() => setSelecionado(null)} />
        )}
      </div>
    </div>
  );
}
