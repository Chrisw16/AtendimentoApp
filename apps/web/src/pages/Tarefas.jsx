import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore } from '../store';
import {
  Plus, CheckSquare, Clock, AlertCircle,
  User, Calendar, MoreVertical, X, Pencil,
} from 'lucide-react';
import Button from '../components/ui/Button';
import Input  from '../components/ui/Input';
import styles from './Tarefas.module.css';

const COLUNAS = [
  { id: 'aberta',       label: 'Abertas',        cls: styles.colAberta },
  { id: 'em_andamento', label: 'Em andamento',   cls: styles.colAndamento },
  { id: 'concluida',    label: 'Concluídas',     cls: styles.colConcluida },
];

const PRIORIDADE_META = {
  baixa:  { cls: styles.prioridadeBaixa,  label: 'Baixa' },
  normal: { cls: styles.prioridadeNormal, label: 'Normal' },
  alta:   { cls: styles.prioridadeAlta,   label: 'Alta' },
  urgente:{ cls: styles.prioridadeUrgente,label: 'Urgente' },
};

function fmtPrazo(ts) {
  if (!ts) return null;
  const d     = new Date(ts);
  const hoje  = new Date();
  const diff  = Math.ceil((d - hoje) / 86400000);
  if (diff < 0)  return { label: `${Math.abs(diff)}d atrasado`, atrasado: true };
  if (diff === 0) return { label: 'Hoje', hoje: true };
  if (diff === 1) return { label: 'Amanhã', hoje: true };
  return { label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) };
}

// ── MODAL TAREFA ──────────────────────────────────────────────────
function TarefaModal({ tarefa, onClose, onSave, agentes = [] }) {
  const [form, setForm] = useState({
    titulo:     tarefa?.titulo     || '',
    descricao:  tarefa?.descricao  || '',
    prioridade: tarefa?.prioridade || 'normal',
    agente_id:  tarefa?.agente_id  || '',
    prazo:      tarefa?.prazo ? tarefa.prazo.slice(0, 10) : '',
    status:     tarefa?.status     || 'aberta',
  });
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
          <h2 className={styles.modalTitle}>{tarefa ? 'Editar tarefa' : 'Nova tarefa'}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} icon={X} />
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <Input
            label="Título"
            value={form.titulo}
            onChange={e => set('titulo', e.target.value)}
            required autoFocus
          />

          <div className={styles.field}>
            <label className={styles.label}>Descrição</label>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="Detalhes da tarefa..."
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label}>Prioridade</label>
              <select className={styles.select} value={form.prioridade} onChange={e => set('prioridade', e.target.value)}>
                <option value="baixa">Baixa</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Status</label>
              <select className={styles.select} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="aberta">Aberta</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
              </select>
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label}>Responsável</label>
              <select className={styles.select} value={form.agente_id} onChange={e => set('agente_id', e.target.value)}>
                <option value="">Sem responsável</option>
                {agentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Prazo</label>
              <input
                type="date"
                className={styles.inputDate}
                value={form.prazo}
                onChange={e => set('prazo', e.target.value)}
              />
            </div>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.modalActions}>
            <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={saving}>
              {tarefa ? 'Salvar' : 'Criar tarefa'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CARD DA TAREFA ────────────────────────────────────────────────
function TarefaCard({ tarefa, onEdit, onMover, onDelete, agentes }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const prio  = PRIORIDADE_META[tarefa.prioridade] || PRIORIDADE_META.normal;
  const prazo = fmtPrazo(tarefa.prazo);
  const responsavel = agentes.find(a => a.id === tarefa.agente_id);

  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <span className={[styles.prioBadge, prio.cls].join(' ')}>{prio.label}</span>
        <div className={styles.cardMenu}>
          <button
            className={styles.menuBtn}
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Opções"
          >
            <MoreVertical size={13} />
          </button>
          {menuOpen && (
            <div className={styles.dropdown}>
              <button onClick={() => { onEdit(tarefa); setMenuOpen(false); }}>
                <Pencil size={12} /> Editar
              </button>
              {tarefa.status !== 'em_andamento' && (
                <button onClick={() => { onMover(tarefa, 'em_andamento'); setMenuOpen(false); }}>
                  <Clock size={12} /> Iniciar
                </button>
              )}
              {tarefa.status !== 'concluida' && (
                <button onClick={() => { onMover(tarefa, 'concluida'); setMenuOpen(false); }}>
                  <CheckSquare size={12} /> Concluir
                </button>
              )}
              <button className={styles.dropdownDanger} onClick={() => { onDelete(tarefa); setMenuOpen(false); }}>
                <X size={12} /> Remover
              </button>
            </div>
          )}
        </div>
      </div>

      <p className={styles.cardTitulo}>{tarefa.titulo}</p>
      {tarefa.descricao && <p className={styles.cardDesc}>{tarefa.descricao}</p>}

      <div className={styles.cardMeta}>
        {responsavel && (
          <span className={styles.cardMetaItem}>
            <User size={10} />
            {responsavel.nome.split(' ')[0]}
          </span>
        )}
        {prazo && (
          <span className={[
            styles.cardMetaItem,
            prazo.atrasado && styles.metaAtrasado,
            prazo.hoje     && styles.metaHoje,
          ].filter(Boolean).join(' ')}>
            <Calendar size={10} />
            {prazo.label}
          </span>
        )}
      </div>
    </div>
  );
}

// ── TAREFAS PAGE ──────────────────────────────────────────────────
export default function Tarefas() {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();
  const [modal, setModal] = useState(null);

  const { data: tarefas = [], isLoading } = useQuery({
    queryKey: ['tarefas'],
    queryFn:  () => api.get('/tarefas'),
  });

  const { data: agentes = [] } = useQuery({
    queryKey: ['agentes'],
    queryFn:  () => api.get('/agentes'),
  });

  const createMut = useMutation({
    mutationFn: (d) => api.post('/tarefas', d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['tarefas'] }); toast('Tarefa criada', 'success'); },
    onError:    e  => toast(e.message, 'error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => api.put(`/tarefas/${id}`, d),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['tarefas'] }),
    onError:    e  => toast(e.message, 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/tarefas/${id}`),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['tarefas'] }); toast('Tarefa removida', 'info'); },
    onError:    e  => toast(e.message, 'error'),
  });

  const handleSave = (form) => {
    if (modal === 'nova') return createMut.mutateAsync(form);
    return updateMut.mutateAsync({ id: modal.id, ...form });
  };

  const handleMover = (tarefa, novoStatus) => {
    updateMut.mutate({ id: tarefa.id, status: novoStatus });
  };

  const handleDelete = (tarefa) => {
    if (confirm(`Remover "${tarefa.titulo}"?`)) deleteMut.mutate(tarefa.id);
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setModal('nova')}>
          Nova tarefa
        </Button>
      </div>

      <div className={styles.kanban}>
        {COLUNAS.map(col => {
          const items = tarefas.filter(t => t.status === col.id);
          return (
            <div key={col.id} className={[styles.coluna, col.cls].join(' ')}>
              <div className={styles.colunaHeader}>
                <span className={styles.colunaTitulo}>{col.label}</span>
                <span className={styles.colunaCount}>{items.length}</span>
              </div>

              <div className={styles.colunaBody}>
                {isLoading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className={`skeleton ${styles.skelCard}`} />
                  ))
                ) : items.length === 0 ? (
                  <div className={styles.colEmpty}>Nenhuma tarefa</div>
                ) : items.map(t => (
                  <TarefaCard
                    key={t.id}
                    tarefa={t}
                    agentes={agentes}
                    onEdit={setModal}
                    onMover={handleMover}
                    onDelete={handleDelete}
                  />
                ))}
              </div>

              <button
                className={styles.addBtn}
                onClick={() => setModal('nova')}
                aria-label={`Adicionar tarefa em ${col.label}`}
              >
                <Plus size={13} /> Adicionar
              </button>
            </div>
          );
        })}
      </div>

      {modal && (
        <TarefaModal
          tarefa={modal === 'nova' ? null : modal}
          agentes={agentes}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
