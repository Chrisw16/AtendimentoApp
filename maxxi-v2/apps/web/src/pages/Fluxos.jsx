import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fluxosApi } from '../lib/api';
import { useStore }  from '../store';
import { Plus, GitBranch, Zap, ZapOff, Pencil, Trash2, Play } from 'lucide-react';
import Button from '../components/ui/Button';
import Input  from '../components/ui/Input';
import styles from './Fluxos.module.css';

function fmtData(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' });
}

// ── MODAL FLUXO ───────────────────────────────────────────────────
function FluxoModal({ fluxo, onClose, onSave }) {
  const [form, setForm] = useState({
    nome:    fluxo?.nome    || '',
    gatilho: fluxo?.gatilho || 'nova_conversa',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nome) { setError('Nome é obrigatório'); return; }
    setError(''); setSaving(true);
    try { await onSave(form); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{fluxo ? 'Editar fluxo' : 'Novo fluxo'}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <Input
            label="Nome do fluxo"
            value={form.nome}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            required
          />
          <div className={styles.field}>
            <label className={styles.label}>Gatilho</label>
            <select
              className={styles.select}
              value={form.gatilho}
              onChange={e => setForm(f => ({ ...f, gatilho: e.target.value }))}
            >
              <option value="nova_conversa">Nova conversa</option>
              <option value="palavra_chave">Palavra-chave</option>
              <option value="fora_horario">Fora do horário</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.modalActions}>
            <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={saving}>
              {fluxo ? 'Salvar' : 'Criar fluxo'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── FLUXO CARD ────────────────────────────────────────────────────
function FluxoCard({ fluxo, onEdit, onAtivar, onDelete }) {
  const nosCount = Array.isArray(fluxo.nos) ? fluxo.nos.length : (fluxo.nos?.length || 0);

  return (
    <div className={[styles.card, fluxo.ativo && styles.cardAtivo].join(' ')}>
      <div className={styles.cardHeader}>
        <div className={[styles.cardIcon, fluxo.ativo && styles.cardIconAtivo].join(' ')}>
          <GitBranch size={16} />
        </div>
        <div className={styles.cardInfo}>
          <p className={styles.cardNome}>{fluxo.nome}</p>
          <p className={styles.cardMeta}>
            {nosCount} nó{nosCount !== 1 ? 's' : ''} · criado em {fmtData(fluxo.criado_em)}
          </p>
        </div>
        {fluxo.ativo && (
          <div className={styles.ativoBadge}>
            <span className={styles.ativoDot} />
            Ativo
          </div>
        )}
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardGatilho}>
          <span className={styles.cardGatilhoLabel}>Gatilho</span>
          <span className={styles.cardGatilhoVal}>{fluxo.gatilho || 'não definido'}</span>
        </div>
      </div>

      <div className={styles.cardActions}>
        <Button
          variant={fluxo.ativo ? 'ghost' : 'accent'}
          size="sm"
          icon={fluxo.ativo ? ZapOff : Zap}
          onClick={() => onAtivar(fluxo)}
        >
          {fluxo.ativo ? 'Desativar' : 'Ativar'}
        </Button>
        <div className={styles.cardActionsRight}>
          <Button variant="ghost" size="sm" icon={Pencil} onClick={() => onEdit(fluxo)} aria-label="Editar" />
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onDelete(fluxo)} aria-label="Excluir" />
        </div>
      </div>
    </div>
  );
}

// ── FLUXOS PAGE ───────────────────────────────────────────────────
export default function Fluxos() {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();
  const [modal, setModal] = useState(null);

  const { data: fluxos = [], isLoading } = useQuery({
    queryKey: ['fluxos'],
    queryFn:  fluxosApi.list,
  });

  const createMut = useMutation({
    mutationFn: fluxosApi.create,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['fluxos'] }); toast('Fluxo criado', 'success'); },
    onError:    err => toast(err.message, 'error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => fluxosApi.update(id, d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['fluxos'] }); toast('Fluxo atualizado', 'success'); },
    onError:    err => toast(err.message, 'error'),
  });

  const ativarMut = useMutation({
    mutationFn: (id) => fluxosApi.ativar(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['fluxos'] }); toast('Fluxo ativado', 'success'); },
    onError:    err => toast(err.message, 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: fluxosApi.delete,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['fluxos'] }); toast('Fluxo removido', 'info'); },
    onError:    err => toast(err.message, 'error'),
  });

  const handleSave = async (form) => {
    if (modal === 'novo') await createMut.mutateAsync(form);
    else await updateMut.mutateAsync({ id: modal.id, ...form });
  };

  const handleDelete = (fluxo) => {
    if (confirm(`Remover o fluxo "${fluxo.nome}"?`)) {
      deleteMut.mutate(fluxo.id);
    }
  };

  const ativo = fluxos.find(f => f.ativo);

  return (
    <div className={styles.root}>
      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <p className={styles.headerLabel}>Fluxo ativo</p>
          <p className={styles.headerValue}>
            {ativo ? ativo.nome : 'Nenhum fluxo ativo'}
          </p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setModal('novo')}>
          Novo fluxo
        </Button>
      </div>

      {/* ── GRID ── */}
      {isLoading ? (
        <div className={styles.grid}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={`skeleton ${styles.skelCard}`} />
          ))}
        </div>
      ) : fluxos.length === 0 ? (
        <div className={styles.empty}>
          <GitBranch size={36} className={styles.emptyIcon} />
          <p className={styles.emptyTitle}>Nenhum fluxo criado</p>
          <p className={styles.emptyHint}>Crie fluxos de atendimento automatizado com IA</p>
          <Button variant="accent" size="sm" icon={Plus} onClick={() => setModal('novo')}>
            Criar primeiro fluxo
          </Button>
        </div>
      ) : (
        <div className={styles.grid}>
          {fluxos.map(f => (
            <FluxoCard
              key={f.id}
              fluxo={f}
              onEdit={setModal}
              onAtivar={(f) => ativarMut.mutate(f.id)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {modal && (
        <FluxoModal
          fluxo={modal === 'novo' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
