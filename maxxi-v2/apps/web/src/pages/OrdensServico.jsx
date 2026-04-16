import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore } from '../store';
import {
  Plus, Wrench, MapPin, Calendar, User,
  Clock, CheckCircle, ChevronRight, X, Filter,
} from 'lucide-react';
import Button from '../components/ui/Button';
import Input  from '../components/ui/Input';
import styles from './OrdensServico.module.css';

const STATUS_META = {
  aberta:       { cls: styles.sAberta,      label: 'Aberta',        icon: Clock },
  agendada:     { cls: styles.sAgendada,    label: 'Agendada',      icon: Calendar },
  em_campo:     { cls: styles.sCampo,       label: 'Em campo',      icon: Wrench },
  concluida:    { cls: styles.sConcluida,   label: 'Concluída',     icon: CheckCircle },
  cancelada:    { cls: styles.sCancelada,   label: 'Cancelada',     icon: X },
};

const TIPO_OS = ['instalacao', 'manutencao', 'retirada', 'visita', 'outros'];

function fmtData(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function fmtHora(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ── MODAL ORDEM ───────────────────────────────────────────────────
function OrdemModal({ ordem, agentes = [], onClose, onSave }) {
  const [form, setForm] = useState({
    titulo:        ordem?.titulo        || '',
    descricao:     ordem?.descricao     || '',
    tipo:          ordem?.tipo          || 'manutencao',
    prioridade:    ordem?.prioridade    || 'normal',
    agente_id:     ordem?.agente_id     || '',
    endereco:      ordem?.endereco      || '',
    contrato_id:   ordem?.contrato_id   || '',
    agendado_para: ordem?.agendado_para ? ordem.agendado_para.slice(0, 16) : '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.titulo) { setError('Título obrigatório'); return; }
    setError(''); setSaving(true);
    try { await onSave(form); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{ordem ? 'Editar OS' : 'Nova ordem de serviço'}</h2>
          <Button variant="ghost" size="sm" icon={X} onClick={onClose} />
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <Input label="Título" value={form.titulo} onChange={e => set('titulo', e.target.value)} required autoFocus />

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label}>Tipo</label>
              <select className={styles.select} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                {TIPO_OS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Prioridade</label>
              <select className={styles.select} value={form.prioridade} onChange={e => set('prioridade', e.target.value)}>
                <option value="baixa">Baixa</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label}>Técnico responsável</label>
              <select className={styles.select} value={form.agente_id} onChange={e => set('agente_id', e.target.value)}>
                <option value="">Sem técnico</option>
                {agentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Agendamento</label>
              <input type="datetime-local" className={styles.inputDate}
                value={form.agendado_para} onChange={e => set('agendado_para', e.target.value)} />
            </div>
          </div>

          <Input label="Endereço de atendimento" value={form.endereco}
            onChange={e => set('endereco', e.target.value)} prefix={MapPin} />

          <Input label="Contrato / Cliente (ID ERP)" value={form.contrato_id}
            onChange={e => set('contrato_id', e.target.value)} />

          <div className={styles.field}>
            <label className={styles.label}>Descrição</label>
            <textarea className={styles.textarea} rows={3} value={form.descricao}
              onChange={e => set('descricao', e.target.value)} placeholder="Detalhe o serviço a ser realizado..." />
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.modalActions}>
            <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={saving}>
              {ordem ? 'Salvar alterações' : 'Criar OS'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── OS CARD ───────────────────────────────────────────────────────
function OSCard({ os, onClick, selecionada }) {
  const smeta  = STATUS_META[os.status] || STATUS_META.aberta;
  const Icon   = smeta.icon;

  return (
    <button
      className={[styles.card, selecionada && styles.cardSel].join(' ')}
      onClick={onClick}
    >
      <div className={[styles.cardIcon, smeta.cls].join(' ')}>
        <Icon size={14} />
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <span className={styles.cardNumero}>OS #{os.numero || os.id?.slice(-6)}</span>
          <span className={[styles.cardStatus, smeta.cls].join(' ')}>{smeta.label}</span>
        </div>
        <p className={styles.cardTitulo}>{os.titulo}</p>
        <div className={styles.cardMeta}>
          {os.tipo && (
            <span className={styles.cardMetaItem}>
              <Wrench size={10} /> {os.tipo}
            </span>
          )}
          {os.agendado_para && (
            <span className={styles.cardMetaItem}>
              <Calendar size={10} />
              {fmtData(os.agendado_para)} {fmtHora(os.agendado_para)}
            </span>
          )}
          {os.endereco && (
            <span className={styles.cardMetaItem}>
              <MapPin size={10} /> {os.endereco.split(',')[0]}
            </span>
          )}
          {os.agente_nome && (
            <span className={styles.cardMetaItem}>
              <User size={10} /> {os.agente_nome}
            </span>
          )}
        </div>
      </div>

      <ChevronRight size={13} className={styles.cardArrow} />
    </button>
  );
}

// ── DETALHE OS ────────────────────────────────────────────────────
function OSDetalhe({ os, agentes, onClose, onAtualizar }) {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();
  const smeta = STATUS_META[os.status] || STATUS_META.aberta;

  const atualizarMut = useMutation({
    mutationFn: (patch) => api.put(`/ordens/${os.id}`, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ordens'] }); toast('OS atualizada', 'success'); },
    onError: e => toast(e.message, 'error'),
  });

  const avancarStatus = () => {
    const fluxo = { aberta: 'agendada', agendada: 'em_campo', em_campo: 'concluida' };
    const prox  = fluxo[os.status];
    if (prox) atualizarMut.mutate({ status: prox });
  };

  const proximoLabel = {
    aberta:   'Marcar como agendada',
    agendada: 'Iniciar atendimento',
    em_campo: 'Concluir OS',
  }[os.status];

  return (
    <aside className={styles.detalhe}>
      <div className={styles.detalheHeader}>
        <div>
          <p className={styles.detalheNumero}>OS #{os.numero || os.id?.slice(-6)}</p>
          <p className={styles.detalheTitulo}>{os.titulo}</p>
          <span className={[styles.cardStatus, smeta.cls].join(' ')} style={{ marginTop: 4 }}>
            <smeta.icon size={10} /> {smeta.label}
          </span>
        </div>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div className={styles.detalheBody}>
        {os.descricao && (
          <div className={styles.detalheSection}>
            <p className={styles.detalheSectionTitle}>Descrição</p>
            <p className={styles.detalheDesc}>{os.descricao}</p>
          </div>
        )}

        <div className={styles.detalheSection}>
          <p className={styles.detalheSectionTitle}>Detalhes</p>
          <div className={styles.detalheGrid}>
            {[
              { icon: Wrench,   label: 'Tipo',        value: os.tipo },
              { icon: User,     label: 'Técnico',     value: os.agente_nome || '—' },
              { icon: MapPin,   label: 'Endereço',    value: os.endereco    || '—' },
              { icon: Calendar, label: 'Agendado',    value: os.agendado_para ? `${fmtData(os.agendado_para)} ${fmtHora(os.agendado_para)}` : '—' },
              { icon: Clock,    label: 'Aberto em',   value: fmtData(os.criado_em) },
              { icon: User,     label: 'Contrato',    value: os.contrato_id || '—' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className={styles.detalheItem}>
                <Icon size={12} className={styles.detalheItemIcon} />
                <div>
                  <p className={styles.detalheItemLabel}>{label}</p>
                  <p className={styles.detalheItemValue}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {proximoLabel && (
        <div className={styles.detalheFooter}>
          <Button
            variant="accent"
            size="sm"
            loading={atualizarMut.isPending}
            onClick={avancarStatus}
            className={styles.avancarBtn}
          >
            {proximoLabel}
          </Button>
        </div>
      )}
    </aside>
  );
}

// ── ORDENS SERVICO PAGE ───────────────────────────────────────────
export default function OrdensServico() {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTipo,   setFiltroTipo]   = useState('');
  const [modal,        setModal]        = useState(null);
  const [selecionada,  setSelecionada]  = useState(null);

  const { data: ordens = [], isLoading } = useQuery({
    queryKey: ['ordens', filtroStatus, filtroTipo],
    queryFn: () => api.get(`/ordens?status=${filtroStatus}&tipo=${filtroTipo}&limit=80`),
    select: d => d.ordens || d,
  });

  const { data: agentes = [] } = useQuery({
    queryKey: ['agentes'],
    queryFn:  () => api.get('/agentes'),
  });

  const createMut = useMutation({
    mutationFn: (d) => api.post('/ordens', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ordens'] }); toast('OS criada', 'success'); },
    onError: e => toast(e.message, 'error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => api.put(`/ordens/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ordens'] }); toast('OS atualizada', 'success'); },
    onError: e => toast(e.message, 'error'),
  });

  return (
    <div className={styles.root}>
      {/* ── TOOLBAR ── */}
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <Filter size={12} className={styles.filterIcon} />
          {['', 'aberta', 'agendada', 'em_campo', 'concluida'].map(s => (
            <button key={s}
              className={[styles.filterBtn, filtroStatus === s && styles.filterBtnAtivo].join(' ')}
              onClick={() => setFiltroStatus(s)}>
              {s === '' ? 'Todas' : STATUS_META[s]?.label || s}
              <span className={styles.filterCount}>
                {ordens.filter(o => s === '' || o.status === s).length}
              </span>
            </button>
          ))}
          <select className={styles.tipoSelect} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {TIPO_OS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setModal('nova')}>
          Nova OS
        </Button>
      </div>

      <div className={styles.content}>
        {/* ── LISTA ── */}
        <div className={styles.lista}>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.skelRow}>
                <div className={`skeleton ${styles.skelIcon}`} />
                <div className={styles.skelLines}>
                  <div className={`skeleton ${styles.skelLine1}`} />
                  <div className={`skeleton ${styles.skelLine2}`} />
                </div>
              </div>
            ))
          ) : ordens.length === 0 ? (
            <div className={styles.empty}>
              <Wrench size={32} className={styles.emptyIcon} />
              <p>Nenhuma ordem de serviço</p>
            </div>
          ) : ordens.map(os => (
            <OSCard key={os.id} os={os}
              selecionada={selecionada?.id === os.id}
              onClick={() => setSelecionada(os.id === selecionada?.id ? null : os)} />
          ))}
        </div>

        {/* ── DETALHE ── */}
        {selecionada && (
          <OSDetalhe os={selecionada} agentes={agentes}
            onClose={() => setSelecionada(null)}
            onAtualizar={(patch) => updateMut.mutate({ id: selecionada.id, ...patch })} />
        )}
      </div>

      {modal && (
        <OrdemModal
          ordem={modal === 'nova' ? null : modal}
          agentes={agentes}
          onClose={() => setModal(null)}
          onSave={createMut.mutateAsync} />
      )}
    </div>
  );
}
