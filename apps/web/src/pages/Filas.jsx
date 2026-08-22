import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { filasApi, agentesApi } from '../lib/api';
import { useStore } from '../store';
import { Plus, Pencil, Trash2, Users, Clock, AlertTriangle } from 'lucide-react';
import Button from '../components/ui/Button';
import Input  from '../components/ui/Input';
import styles from './Filas.module.css';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ── MODAL ─────────────────────────────────────────────────────────
function FilaModal({ fila, onClose, onSave }) {
  const [form, setForm] = useState({
    nome:            fila?.nome            || '',
    slug:            fila?.slug            || '',
    descricao:       fila?.descricao       || '',
    cor:             fila?.cor             || '#2050B8',
    ativa:           fila?.ativa ?? true,
    sla_atencao_min: fila?.sla_atencao_min ?? 5,
    sla_critico_min: fila?.sla_critico_min ?? 15,
    horario:         fila?.horario         || null,
  });
  const [membros, setMembros] = useState([]);   // [{agente_id, supervisor}]
  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState('');

  const { data: agentes = [] } = useQuery({ queryKey: ['agentes'], queryFn: agentesApi.list });

  useEffect(() => {
    if (!fila?.id) return;
    filasApi.agentes(fila.id)
      .then(rows => setMembros(rows.map(r => ({ agente_id: r.id, supervisor: r.supervisor }))))
      .catch(() => {});
  }, [fila?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const h   = form.horario || { ativo: false, dias: [1, 2, 3, 4, 5], inicio: '08:00', fim: '18:00' };
  const setH = (k, v) => set('horario', { ...h, [k]: v });

  const membro   = (id) => membros.find(m => m.agente_id === id);
  const toggle   = (id) => setMembros(ms => membro(id) ? ms.filter(m => m.agente_id !== id) : [...ms, { agente_id: id, supervisor: false }]);
  const superviz = (id) => setMembros(ms => ms.map(m => m.agente_id === id ? { ...m, supervisor: !m.supervisor } : m));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nome) { setError('Nome é obrigatório'); return; }
    if (Number(form.sla_critico_min) <= Number(form.sla_atencao_min)) {
      setError('O SLA crítico precisa ser maior que o de atenção — senão nada nunca fica "em atenção"');
      return;
    }
    setError(''); setSaving(true);
    try { await onSave(form, membros); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal aria-label={fila ? 'Editar fila' : 'Nova fila'}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{fila ? 'Editar fila' : 'Nova fila'}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        <form onSubmit={submit} className={styles.modalForm} noValidate>
          <div className={styles.formRow}>
            <Input label="Nome" value={form.nome} onChange={e => set('nome', e.target.value)} required />
            <Input
              label="Slug"
              value={form.slug}
              onChange={e => set('slug', e.target.value)}
              placeholder="gerado a partir do nome"
              disabled={!!fila}
            />
          </div>
          {fila && (
            <p className={styles.hint}>
              O slug é o que o nó <strong>Transferir para fila</strong> guarda no fluxo — por isso não muda depois de criado.
            </p>
          )}

          <Input label="Descrição" value={form.descricao} onChange={e => set('descricao', e.target.value)} />

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label}>Cor</label>
              <input type="color" className={styles.color} value={form.cor} onChange={e => set('cor', e.target.value)} />
            </div>
            <Input label="SLA atenção (min)" type="number" min="1" value={form.sla_atencao_min} onChange={e => set('sla_atencao_min', e.target.value)} />
            <Input label="SLA crítico (min)" type="number" min="2" value={form.sla_critico_min} onChange={e => set('sla_critico_min', e.target.value)} />
          </div>

          {/* ── HORÁRIO ── */}
          <div className={styles.bloco}>
            <label className={styles.checkLine}>
              <input type="checkbox" checked={!!form.horario?.ativo} onChange={e => setH('ativo', e.target.checked)} />
              Horário próprio desta fila
            </label>
            <p className={styles.hint}>Desmarcado, vale o horário geral de <strong>Configurações</strong>.</p>
            {form.horario?.ativo && (
              <>
                <div className={styles.dias}>
                  {DIAS.map((d, i) => (
                    <button
                      key={d} type="button"
                      className={[styles.dia, (h.dias || []).includes(i) && styles.diaOn].filter(Boolean).join(' ')}
                      onClick={() => setH('dias', (h.dias || []).includes(i) ? h.dias.filter(x => x !== i) : [...(h.dias || []), i])}
                    >{d}</button>
                  ))}
                </div>
                <div className={styles.formRow}>
                  <Input label="Abre" type="time" value={h.inicio} onChange={e => setH('inicio', e.target.value)} />
                  <Input label="Fecha" type="time" value={h.fim}   onChange={e => setH('fim',    e.target.value)} />
                </div>
              </>
            )}
          </div>

          {/* ── MEMBROS ── */}
          {fila && (
            <div className={styles.bloco}>
              <label className={styles.label}>Agentes desta fila</label>
              <p className={styles.hint}>
                Agente que não está em <em>nenhuma</em> fila continua vendo todas as conversas.
              </p>
              <div className={styles.membros}>
                {agentes.filter(a => a.ativo).map(a => (
                  <div key={a.id} className={styles.membro}>
                    <label className={styles.checkLine}>
                      <input type="checkbox" checked={!!membro(a.id)} onChange={() => toggle(a.id)} />
                      {a.avatar} {a.nome}
                    </label>
                    {membro(a.id) && (
                      <button
                        type="button"
                        className={[styles.tagSup, membro(a.id).supervisor && styles.tagSupOn].filter(Boolean).join(' ')}
                        onClick={() => superviz(a.id)}
                      >supervisor</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <label className={styles.checkLine}>
            <input type="checkbox" checked={form.ativa} onChange={e => set('ativa', e.target.checked)} />
            Fila ativa
          </label>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <div className={styles.modalActions}>
            <Button variant="ghost" onClick={onClose} type="button">Cancelar</Button>
            <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── PÁGINA ────────────────────────────────────────────────────────
export default function Filas() {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();
  const [modal, setModal] = useState(null);   // null | 'nova' | fila

  const { data: filas = [], isLoading } = useQuery({
    queryKey: ['filas'],
    queryFn:  filasApi.list,
    refetchInterval: 15000,   // os contadores de espera envelhecem rápido
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ['filas'] });

  const salvar = async (form, membros) => {
    const fila = modal === 'nova'
      ? await filasApi.criar(form)
      : await filasApi.atualizar(modal.id, form);
    if (modal !== 'nova') await filasApi.definirAgentes(fila.id, membros);
    invalidar();
    toast(modal === 'nova' ? 'Fila criada — agora defina os agentes' : 'Fila salva', 'success');
  };

  const remover = async (fila) => {
    if (!confirm(`Remover a fila "${fila.nome}"? As conversas dela voltam a ficar visíveis para todos.`)) return;
    try { await filasApi.remover(fila.id); invalidar(); toast('Fila removida', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <p className={styles.subtitulo}>
          Filas de atendimento humano — o nó <strong>Transferir para fila</strong> escolhe uma delas pelo slug.
        </p>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setModal('nova')}>Nova fila</Button>
      </div>

      <div className={styles.grid}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className={`skeleton ${styles.skel}`} />)
        ) : filas.length === 0 ? (
          <p className={styles.vazio}>Nenhuma fila criada. Sem filas, todo agente vê todas as conversas.</p>
        ) : filas.map(f => (
          <div key={f.id} className={styles.card} style={{ '--fila-cor': f.cor }}>
            <div className={styles.cardTop}>
              <span className={styles.bolinha} />
              <div>
                <h3 className={styles.cardNome}>{f.nome}</h3>
                <code className={styles.slug}>{f.slug}</code>
              </div>
              <div className={styles.cardAcoes}>
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setModal(f)} aria-label="Editar" />
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => remover(f)} aria-label="Remover" />
              </div>
            </div>

            {f.descricao && <p className={styles.desc}>{f.descricao}</p>}

            <div className={styles.metricas}>
              <span className={f.aguardando > 0 ? styles.metricaAlerta : styles.metrica}>
                <AlertTriangle size={12} /> {f.aguardando} esperando
              </span>
              <span className={styles.metrica}>💬 {f.em_atendimento} em atendimento</span>
              <span className={styles.metrica}><Users size={12} /> {f.agentes_online}/{f.agentes} online</span>
              <span className={styles.metrica}><Clock size={12} /> SLA {f.sla_atencao_min}/{f.sla_critico_min} min</span>
            </div>

            <div className={styles.tags}>
              {!f.ativa && <span className={styles.tagOff}>inativa</span>}
              {!f.aberta && <span className={styles.tagOff}>fora do horário</span>}
              {f.ativa && f.aberta && f.agentes_online === 0 && f.agentes > 0 && (
                <span className={styles.tagAviso}>ninguém online</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <FilaModal
          fila={modal === 'nova' ? null : modal}
          onClose={() => setModal(null)}
          onSave={salvar}
        />
      )}
    </div>
  );
}
