import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentesApi } from '../lib/api';
import { useStore }   from '../store';
import { Plus, Pencil, UserX, UserCheck, Search, Shield, User } from 'lucide-react';
import Button from '../components/ui/Button';
import Input  from '../components/ui/Input';
import styles from './Agentes.module.css';

const PERMISSOES_LABELS = {
  chat:       'Chat',
  historico:  'Histórico',
  tarefas:    'Tarefas',
  financeiro: 'Financeiro',
  clientes:   'Clientes',
  frota:      'Frota',
  ocorrencias:'Ocorrências',
};

// ── MODAL AGENTE ─────────────────────────────────────────────────
function AgenteModal({ agente, onClose, onSave }) {
  const [form, setForm] = useState({
    nome:       agente?.nome       || '',
    login:      agente?.login      || '',
    senha:      '',
    role:       agente?.role       || 'agente',
    avatar:     agente?.avatar     || '🧑',
    permissoes: agente?.permissoes || {},
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const togglePerm = (perm) =>
    setForm(f => ({
      ...f,
      permissoes: { ...f.permissoes, [perm]: !f.permissoes[perm] },
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nome || !form.login) { setError('Nome e login são obrigatórios'); return; }
    if (!agente && !form.senha)    { setError('Senha obrigatória para novo agente'); return; }
    setError(''); setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal aria-label={agente ? 'Editar agente' : 'Novo agente'}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{agente ? 'Editar agente' : 'Novo agente'}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm} noValidate>
          <div className={styles.formRow}>
            <Input label="Nome completo" value={form.nome}  onChange={e => set('nome',  e.target.value)} required />
            <Input label="Login"         value={form.login} onChange={e => set('login', e.target.value)} required disabled={!!agente} />
          </div>

          <div className={styles.formRow}>
            <Input
              label={agente ? 'Nova senha (deixe vazio para manter)' : 'Senha'}
              type="password"
              value={form.senha}
              onChange={e => set('senha', e.target.value)}
              required={!agente}
            />
            <div className={styles.field}>
              <label className={styles.label}>Função</label>
              <select
                className={styles.select}
                value={form.role}
                onChange={e => set('role', e.target.value)}
              >
                <option value="agente">Agente</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>

          {/* Permissões (só para agentes) */}
          {form.role === 'agente' && (
            <div className={styles.permsSection}>
              <span className={styles.label}>Permissões de acesso</span>
              <div className={styles.permsGrid}>
                {Object.entries(PERMISSOES_LABELS).map(([key, label]) => (
                  <label key={key} className={styles.permItem}>
                    <input
                      type="checkbox"
                      checked={!!form.permissoes[key]}
                      onChange={() => togglePerm(key)}
                      className={styles.permCheck}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.modalActions}>
            <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" type="submit" loading={saving}>
              {agente ? 'Salvar alterações' : 'Criar agente'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── AGENTES PAGE ──────────────────────────────────────────────────
export default function Agentes() {
  const toast   = useStore(s => s.toast);
  const qc      = useQueryClient();
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(null);  // null | 'novo' | agente-obj

  const { data: agentes = [], isLoading } = useQuery({
    queryKey: ['agentes'],
    queryFn:  agentesApi.list,
  });

  const createMut = useMutation({
    mutationFn: agentesApi.create,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['agentes'] }); toast('Agente criado', 'success'); },
    onError:    (err) => toast(err.message, 'error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => agentesApi.update(id, data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['agentes'] }); toast('Agente atualizado', 'success'); },
    onError:    (err) => toast(err.message, 'error'),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, ativo }) => agentesApi.update(id, { ativo }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['agentes'] }),
    onError:    (err) => toast(err.message, 'error'),
  });

  const filtrados = agentes.filter(a =>
    !busca || a.nome.toLowerCase().includes(busca.toLowerCase()) || a.login.includes(busca)
  );

  const handleSave = async (form) => {
    if (modal === 'novo') {
      await createMut.mutateAsync(form);
    } else {
      await updateMut.mutateAsync({ id: modal.id, ...form });
    }
  };

  return (
    <div className={styles.root}>
      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div className={styles.searchWrap}>
          <Search size={13} className={styles.searchIcon} />
          <input
            type="search"
            className={styles.search}
            placeholder="Buscar agente..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            aria-label="Buscar agente"
          />
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setModal('novo')}>
          Novo agente
        </Button>
      </div>

      {/* ── TABELA ── */}
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label="Lista de agentes">
          <thead>
            <tr>
              <th className={styles.th}>Agente</th>
              <th className={styles.th}>Login</th>
              <th className={styles.th}>Função</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th} aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className={styles.td}>
                      <div className={`skeleton ${styles.skelRow}`} />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.emptyRow}>
                  Nenhum agente encontrado
                </td>
              </tr>
            ) : filtrados.map(a => (
              <tr key={a.id} className={styles.tr}>
                <td className={styles.td}>
                  <div className={styles.agenteCell}>
                    <div className={styles.avatar}>
                      {a.avatar?.length <= 2 ? a.avatar : a.nome.charAt(0)}
                    </div>
                    <div>
                      <p className={styles.agenteName}>{a.nome}</p>
                      <p className={styles.onlineLabel}>
                        {a.online ? '🟢 Online' : '⚫ Offline'}
                      </p>
                    </div>
                  </div>
                </td>
                <td className={styles.td}>
                  <span className={styles.mono}>{a.login}</span>
                </td>
                <td className={styles.td}>
                  <div className={[styles.roleBadge, a.role === 'admin' && styles.roleBadgeAdmin].join(' ')}>
                    {a.role === 'admin' ? <Shield size={10} /> : <User size={10} />}
                    {a.role === 'admin' ? 'Admin' : 'Agente'}
                  </div>
                </td>
                <td className={styles.td}>
                  <span className={[styles.statusBadge, !a.ativo && styles.statusInativo].join(' ')}>
                    {a.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className={styles.td}>
                  <div className={styles.actions}>
                    <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setModal(a)} aria-label="Editar" />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={a.ativo ? UserX : UserCheck}
                      onClick={() => toggleMut.mutate({ id: a.id, ativo: !a.ativo })}
                      aria-label={a.ativo ? 'Desativar' : 'Ativar'}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── MODAL ── */}
      {modal && (
        <AgenteModal
          agente={modal === 'novo' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
