import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { playbooksApi } from '../lib/api';
import { useStore } from '../store';
import { IA_TOOLS_LIST } from '../lib/nodeTypes';
import { Plus, ArrowRight, Trash2, GripVertical, ListChecks } from 'lucide-react';
import Button from '../components/ui/Button';
import Input  from '../components/ui/Input';
import styles from './Playbooks.module.css';

const DOMINIOS = [['suporte', 'Suporte'], ['comercial', 'Comercial'], ['financeiro', 'Financeiro'], ['retencao', 'Retenção']];
const OBRIGS   = [['obrigatoria', 'Obrigatória'], ['opcional', 'Opcional'], ['condicional', 'Condicional']];

/** §64 — o estado do meio é "teste": procedimento se valida rodando. */
const PROXIMOS = {
  rascunho:  [['teste', 'Enviar para teste'], ['arquivado', 'Arquivar']],
  teste:     [['publicado', 'Publicar'], ['rascunho', 'Voltar para rascunho'], ['arquivado', 'Arquivar']],
  publicado: [['teste', 'Editar (volta para teste)'], ['arquivado', 'Arquivar']],
  arquivado: [['rascunho', 'Desarquivar']],
};

function Editor({ pb, onClose, onSaved }) {
  const toast = useStore(s => s.toast);
  const [cab, setCab] = useState({
    nome: pb.nome || '', dominio: pb.dominio || 'suporte', objetivo: pb.objetivo || '',
    criterios_sucesso: pb.criterios_sucesso || '', criterios_transferencia: pb.criterios_transferencia || '',
    excecoes: pb.excecoes || '',
  });
  const [etapas, setEtapas] = useState(pb.etapas || []);
  const [saving, setSaving] = useState(false);
  const bloqueado = pb.status === 'publicado';

  const setE = (i, k, v) => setEtapas(es => es.map((e, j) => j === i ? { ...e, [k]: v } : e));
  const mover = (i, d) => setEtapas(es => {
    const j = i + d;
    if (j < 0 || j >= es.length) return es;
    const n = [...es]; [n[i], n[j]] = [n[j], n[i]];
    return n.map((e, k) => ({ ...e, ordem: k + 1 }));
  });
  const toggleTool = (i, id) => {
    const atuais = etapas[i].tools || [];
    setE(i, 'tools', atuais.includes(id) ? atuais.filter(t => t !== id) : [...atuais, id]);
  };

  const salvar = async () => {
    setSaving(true);
    try {
      await playbooksApi.atualizar(pb.id, cab);
      await playbooksApi.etapas(pb.id, etapas.map((e, i) => ({ ...e, ordem: i + 1 })));
      toast('Procedimento salvo', 'success');
      onSaved();
      onClose();
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal aria-label="Editar procedimento">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{pb.nome}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        <div className={styles.modalForm}>
          {bloqueado && (
            <p className={styles.aviso}>
              Este procedimento está <strong>publicado</strong> e já orienta atendimentos. Mova para "teste"
              antes de editar — reescrever por baixo de execuções em andamento é o que o §64 impede.
            </p>
          )}

          <Input label="Nome" value={cab.nome} onChange={e => setCab(c => ({ ...c, nome: e.target.value }))} disabled={bloqueado} />
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label}>Domínio</label>
              <select className={styles.select} value={cab.dominio} disabled={bloqueado}
                onChange={e => setCab(c => ({ ...c, dominio: e.target.value }))}>
                {DOMINIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <Input label="Objetivo" value={cab.objetivo} disabled={bloqueado}
              onChange={e => setCab(c => ({ ...c, objetivo: e.target.value }))} />
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label}>Critério de sucesso</label>
              <textarea className={styles.textarea} rows={2} value={cab.criterios_sucesso} disabled={bloqueado}
                onChange={e => setCab(c => ({ ...c, criterios_sucesso: e.target.value }))} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Transferir para humano se…</label>
              <textarea className={styles.textarea} rows={2} value={cab.criterios_transferencia} disabled={bloqueado}
                onChange={e => setCab(c => ({ ...c, criterios_transferencia: e.target.value }))} />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Exceções</label>
            <textarea className={styles.textarea} rows={2} value={cab.excecoes} disabled={bloqueado}
              placeholder="Quando pular etapas — sem isto o procedimento vira checklist burro (§61)."
              onChange={e => setCab(c => ({ ...c, excecoes: e.target.value }))} />
          </div>

          {/* ── ETAPAS ── */}
          <div className={styles.etapasHead}>
            <span className={styles.label}>Etapas</span>
            {!bloqueado && (
              <button className={styles.addEtapa} onClick={() => setEtapas(es => [...es, { titulo: '', obrigatoriedade: 'obrigatoria', tools: [], ordem: es.length + 1 }])}>
                <Plus size={11} /> Adicionar etapa
              </button>
            )}
          </div>

          {etapas.map((e, i) => (
            <div key={i} className={styles.etapa}>
              <div className={styles.etapaTop}>
                <span className={styles.etapaNum}><GripVertical size={11} />{i + 1}</span>
                <input className={styles.etapaTitulo} value={e.titulo} disabled={bloqueado}
                  placeholder="O que se faz nesta etapa" onChange={ev => setE(i, 'titulo', ev.target.value)} />
                <select className={styles.etapaObrig} value={e.obrigatoriedade || 'obrigatoria'} disabled={bloqueado}
                  onChange={ev => setE(i, 'obrigatoriedade', ev.target.value)}>
                  {OBRIGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {!bloqueado && (
                  <>
                    <button className={styles.miniBtn} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
                    <button className={styles.miniBtn} onClick={() => mover(i, 1)} aria-label="Descer">↓</button>
                    <button className={styles.miniBtnPerigo} onClick={() => setEtapas(es => es.filter((_, j) => j !== i))} aria-label="Remover">
                      <Trash2 size={11} />
                    </button>
                  </>
                )}
              </div>

              {e.obrigatoriedade === 'condicional' && (
                <input className={styles.etapaCond} value={e.condicao || ''} disabled={bloqueado}
                  placeholder="só se… (a condição que ativa esta etapa)"
                  onChange={ev => setE(i, 'condicao', ev.target.value)} />
              )}

              <div className={styles.tools}>
                <span className={styles.toolsLabel}>
                  Ferramentas que provam esta etapa — chamou, cumpriu. Sem nenhuma, a IA marca a etapa por conta.
                </span>
                <div className={styles.toolsGrid}>
                  {IA_TOOLS_LIST.map(t => (
                    <button key={t.id} disabled={bloqueado}
                      className={[styles.toolChip, (e.tools || []).includes(t.id) && styles.toolChipOn].filter(Boolean).join(' ')}
                      onClick={() => toggleTool(i, t.id)}>{t.label}</button>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {!etapas.length && <p className={styles.nota}>Nenhuma etapa. Procedimento sem etapas não pode ser publicado.</p>}

          <div className={styles.modalActions}>
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            {!bloqueado && <Button variant="primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Playbooks() {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();
  const [editando, setEditando] = useState(null);
  const [novo, setNovo] = useState('');

  const { data: lista = [], isLoading } = useQuery({ queryKey: ['playbooks'], queryFn: () => playbooksApi.list() });
  const invalidar = () => qc.invalidateQueries({ queryKey: ['playbooks'] });

  const abrir = async (pb) => {
    try { setEditando(await playbooksApi.get(pb.id)); }
    catch (err) { toast(err.message, 'error'); }
  };

  const criar = async () => {
    if (!novo.trim()) return;
    try {
      const pb = await playbooksApi.criar({ nome: novo.trim() });
      setNovo(''); invalidar();
      setEditando(await playbooksApi.get(pb.id));
    } catch (err) { toast(err.message, 'error'); }
  };

  const mover = async (pb, status) => {
    try { await playbooksApi.status(pb.id, status); invalidar(); toast(`Movido para ${status}`, 'success'); }
    catch (err) { toast(err.message, 'error'); }
  };

  const remover = async (pb) => {
    if (!confirm(`Remover "${pb.nome}"? As execuções e versões vão junto.`)) return;
    try { await playbooksApi.remover(pb.id); invalidar(); toast('Removido', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <p className={styles.subtitulo}>
          Procedimentos oficiais. O nó <strong>IA Responde</strong> injeta o roteiro no prompt a cada turno,
          e a etapa é dada por cumprida pela ferramenta que a evidencia.
        </p>
        <div className={styles.novoWrap}>
          <input className={styles.novoInput} placeholder="Nome do novo procedimento" value={novo}
            onChange={e => setNovo(e.target.value)} onKeyDown={e => e.key === 'Enter' && criar()} />
          <Button variant="primary" size="sm" icon={Plus} onClick={criar}>Criar</Button>
        </div>
      </div>

      <div className={styles.lista}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className={`skeleton ${styles.skel}`} />)
        ) : lista.length === 0 ? (
          <p className={styles.vazio}>Nenhum procedimento. O `npm run seed` cria dois — suporte e comercial — em rascunho.</p>
        ) : lista.map(pb => (
          <div key={pb.id} className={styles.item}>
            <div className={styles.itemTop}>
              <button className={styles.itemTitulo} onClick={() => abrir(pb)}>{pb.nome}</button>
              <span className={styles.dominio}>{DOMINIOS.find(([v]) => v === pb.dominio)?.[1] || pb.dominio}</span>
              <span className={styles.status} data-status={pb.status}>{pb.status}</span>
              <span className={styles.etapasCount}><ListChecks size={11} /> {pb.etapas} etapas · v{pb.versao}</span>
            </div>
            {pb.objetivo && <p className={styles.itemObjetivo}>{pb.objetivo}</p>}
            <div className={styles.itemAcoes}>
              {(PROXIMOS[pb.status] || []).map(([st, label]) => (
                <button key={st} className={styles.acao} onClick={() => mover(pb, st)}>
                  <ArrowRight size={10} /> {label}
                </button>
              ))}
              <button className={styles.acaoPerigo} onClick={() => remover(pb)}><Trash2 size={10} /></button>
            </div>
          </div>
        ))}
      </div>

      {editando && <Editor pb={editando} onClose={() => setEditando(null)} onSaved={invalidar} />}
    </div>
  );
}
