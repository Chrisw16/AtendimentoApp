import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ocorrenciasApi } from '../lib/api';
import { useStore } from '../store';
import {
  Plus, AlertCircle, Clock, CheckCircle, Filter,
  MessageSquare, X, ChevronRight, Tag,
} from 'lucide-react';
import Button from '../components/ui/Button';
import Input  from '../components/ui/Input';
import styles from './Ocorrencias.module.css';

const STATUS_META = {
  aberta:        { cls: styles.sAberta,    label: 'Aberta',     icon: AlertCircle },
  em_andamento:  { cls: styles.sAndamento, label: 'Andamento',  icon: Clock },
  fechada:       { cls: styles.sFechada,   label: 'Fechada',    icon: CheckCircle },
  pendente:      { cls: styles.sPendente,  label: 'Pendente',   icon: Clock },
};

const PRIORIDADE_META = {
  baixa:  { cls: styles.pBaixa,   label: 'Baixa' },
  normal: { cls: styles.pNormal,  label: 'Normal' },
  alta:   { cls: styles.pAlta,    label: 'Alta' },
  critica:{ cls: styles.pCritica, label: 'Crítica' },
};

function fmtData(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ── MODAL NOVA OCORRÊNCIA ─────────────────────────────────────────
function OcorrenciaModal({ onClose, onSave }) {
  const [form, setForm] = useState({ titulo: '', descricao: '', tipo: '', prioridade: 'normal' });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.titulo) { setError('Título é obrigatório'); return; }
    setError(''); setSaving(true);
    try { await onSave(form); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Nova ocorrência</h2>
          <Button variant="ghost" size="sm" icon={X} onClick={onClose} />
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <Input label="Título" value={form.titulo} onChange={e => set('titulo', e.target.value)} required autoFocus />
          <div className={styles.field}>
            <label className={styles.label}>Descrição</label>
            <textarea className={styles.textarea} rows={3} value={form.descricao}
              onChange={e => set('descricao', e.target.value)} placeholder="Descreva a ocorrência..." />
          </div>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label}>Tipo</label>
              <select className={styles.select} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                <option value="">Sem tipo</option>
                <option value="tecnico">Técnico</option>
                <option value="financeiro">Financeiro</option>
                <option value="comercial">Comercial</option>
                <option value="outros">Outros</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Prioridade</label>
              <select className={styles.select} value={form.prioridade} onChange={e => set('prioridade', e.target.value)}>
                <option value="baixa">Baixa</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </div>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.modalActions}>
            <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={saving}>Criar ocorrência</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── TIMELINE DO TICKET ────────────────────────────────────────────
function OcorrenciaTimeline({ oc, onFechar, onClose }) {
  const [nota, setNota] = useState('');
  const [addingNota, setAddingNota] = useState(false);
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();

  const notaMut = useMutation({
    mutationFn: () => ocorrenciasApi.nota(oc.id, { texto: nota }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ocorrencias'] });
      setNota('');
      setAddingNota(false);
      toast('Nota adicionada', 'success');
    },
    onError: e => toast(e.message, 'error'),
  });

  const smeta  = STATUS_META[oc.status]     || STATUS_META.aberta;
  const pmeta  = PRIORIDADE_META[oc.prioridade] || PRIORIDADE_META.normal;
  const StatusIcon = smeta.icon;

  return (
    <aside className={styles.timeline}>
      <div className={styles.tlHeader}>
        <div>
          <p className={styles.tlTitulo}>{oc.titulo}</p>
          <div className={styles.tlBadges}>
            <span className={[styles.statusBadge, smeta.cls].join(' ')}>
              <StatusIcon size={10} /> {smeta.label}
            </span>
            <span className={[styles.prioBadge, pmeta.cls].join(' ')}>{pmeta.label}</span>
            {oc.tipo && <span className={styles.tipoBadge}><Tag size={9} /> {oc.tipo}</span>}
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* Detalhes */}
      <div className={styles.tlBody}>
        {oc.descricao && <p className={styles.tlDesc}>{oc.descricao}</p>}

        <div className={styles.tlMeta}>
          <span>Criado em {fmtDateTime(oc.criado_em)}</span>
          {oc.agente_nome && <span>por {oc.agente_nome}</span>}
          {oc.contrato_id && <span>Contrato: {oc.contrato_id}</span>}
        </div>

        {/* Linha do tempo (eventos) */}
        <div className={styles.tlEventos}>
          <div className={styles.tlEvento}>
            <div className={[styles.tlDot, styles.tlDotCriado].join(' ')} />
            <div className={styles.tlEventoBody}>
              <p className={styles.tlEventoTitulo}>Ocorrência aberta</p>
              <p className={styles.tlEventoData}>{fmtDateTime(oc.criado_em)}</p>
            </div>
          </div>

          {oc.status !== 'aberta' && (
            <div className={styles.tlEvento}>
              <div className={[styles.tlDot, styles.tlDotUpdate].join(' ')} />
              <div className={styles.tlEventoBody}>
                <p className={styles.tlEventoTitulo}>Status alterado para {smeta.label}</p>
                <p className={styles.tlEventoData}>{fmtDateTime(oc.atualizado)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Adicionar nota */}
        <div className={styles.notaArea}>
          {addingNota ? (
            <>
              <textarea
                className={styles.notaInput}
                rows={3}
                placeholder="Escreva uma nota interna..."
                value={nota}
                onChange={e => setNota(e.target.value)}
                autoFocus
              />
              <div className={styles.notaActions}>
                <Button variant="ghost" size="sm" onClick={() => { setAddingNota(false); setNota(''); }}>
                  Cancelar
                </Button>
                <Button
                  variant="accent" size="sm"
                  loading={notaMut.isPending}
                  onClick={() => nota.trim() && notaMut.mutate()}
                >
                  Adicionar nota
                </Button>
              </div>
            </>
          ) : (
            <button className={styles.addNotaBtn} onClick={() => setAddingNota(true)}>
              <MessageSquare size={12} /> Adicionar nota interna
            </button>
          )}
        </div>
      </div>

      {/* Ações */}
      {oc.status !== 'fechada' && (
        <div className={styles.tlFooter}>
          <Button
            variant="danger" size="sm" icon={CheckCircle}
            onClick={() => onFechar(oc.id)}
            className={styles.fecharBtn}
          >
            Fechar ocorrência
          </Button>
        </div>
      )}
    </aside>
  );
}

// ── OCORRENCIAS PAGE ──────────────────────────────────────────────
export default function Ocorrencias() {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();
  const [filtroStatus,  setFiltroStatus]  = useState('aberta');
  const [filtroTipo,    setFiltroTipo]    = useState('');
  const [modal,         setModal]         = useState(false);
  const [selecionada,   setSelecionada]   = useState(null);

  const { data: ocorrencias = [], isLoading } = useQuery({
    queryKey: ['ocorrencias', filtroStatus, filtroTipo],
    queryFn:  () => ocorrenciasApi.list({
      status: filtroStatus || undefined,
      tipo:   filtroTipo   || undefined,
      limit: 60,
    }),
  });

  const createMut = useMutation({
    mutationFn: ocorrenciasApi.create,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['ocorrencias'] }); toast('Ocorrência criada', 'success'); },
    onError:    e  => toast(e.message, 'error'),
  });

  const fecharMut = useMutation({
    mutationFn: (id) => ocorrenciasApi.fechar(id, {}),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['ocorrencias'] }); toast('Ocorrência fechada', 'success'); setSelecionada(null); },
    onError:    e  => toast(e.message, 'error'),
  });

  return (
    <div className={styles.root}>
      {/* ── TOOLBAR ── */}
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <Filter size={12} className={styles.filterIcon} />
          {['', 'aberta', 'em_andamento', 'pendente', 'fechada'].map(s => (
            <button
              key={s}
              className={[styles.filterBtn, filtroStatus === s && styles.filterBtnAtivo].join(' ')}
              onClick={() => setFiltroStatus(s)}
            >
              {s === '' ? 'Todas' : STATUS_META[s]?.label || s}
              <span className={styles.filterCount}>
                {ocorrencias.filter(o => s === '' || o.status === s).length}
              </span>
            </button>
          ))}
          <select className={styles.tipoSelect} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            <option value="tecnico">Técnico</option>
            <option value="financeiro">Financeiro</option>
            <option value="comercial">Comercial</option>
          </select>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setModal(true)}>
          Nova ocorrência
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
          ) : ocorrencias.length === 0 ? (
            <div className={styles.empty}>
              <AlertCircle size={32} className={styles.emptyIcon} />
              <p>Nenhuma ocorrência {filtroStatus ? `com status "${STATUS_META[filtroStatus]?.label}"` : ''}</p>
            </div>
          ) : (
            ocorrencias.map(oc => {
              const smeta  = STATUS_META[oc.status] || STATUS_META.aberta;
              const pmeta  = PRIORIDADE_META[oc.prioridade] || PRIORIDADE_META.normal;
              const StatusIcon = smeta.icon;
              return (
                <button
                  key={oc.id}
                  className={[styles.ocRow, selecionada?.id === oc.id && styles.ocRowSel].join(' ')}
                  onClick={() => setSelecionada(oc.id === selecionada?.id ? null : oc)}
                >
                  <div className={[styles.ocIconWrap, smeta.cls].join(' ')}>
                    <StatusIcon size={14} />
                  </div>
                  <div className={styles.ocInfo}>
                    <div className={styles.ocTop}>
                      <span className={styles.ocTitulo}>{oc.titulo}</span>
                      <span className={styles.ocData}>{fmtData(oc.criado_em)}</span>
                    </div>
                    <div className={styles.ocBottom}>
                      <span className={[styles.prioBadge, pmeta.cls].join(' ')}>{pmeta.label}</span>
                      {oc.tipo && <span className={styles.tipoBadge}>{oc.tipo}</span>}
                      {oc.agente_nome && <span className={styles.ocAgente}>{oc.agente_nome}</span>}
                    </div>
                  </div>
                  <ChevronRight size={13} className={styles.ocArrow} />
                </button>
              );
            })
          )}
        </div>

        {/* ── TIMELINE ── */}
        {selecionada && (
          <OcorrenciaTimeline
            oc={selecionada}
            onFechar={(id) => fecharMut.mutate(id)}
            onClose={() => setSelecionada(null)}
          />
        )}
      </div>

      {modal && (
        <OcorrenciaModal
          onClose={() => setModal(false)}
          onSave={createMut.mutateAsync}
        />
      )}
    </div>
  );
}
