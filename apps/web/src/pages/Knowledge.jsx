import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { knowledgeApi } from '../lib/api';
import { useStore } from '../store';
import { Plus, Search, BookOpen, AlertCircle, Trash2, ArrowRight } from 'lucide-react';
import Button from '../components/ui/Button';
import Input  from '../components/ui/Input';
import styles from './Knowledge.module.css';

const TIPOS = [
  ['artigo', 'Artigo'], ['faq', 'FAQ'], ['manual', 'Manual de equipamento'],
  ['politica', 'Política'], ['argumentacao', 'Argumentação comercial'],
  ['documento', 'Documento importado'], ['procedimento', 'Procedimento'],
];

/** §52 — o caminho é fixo; a tela só oferece o que o backend aceita. */
const PROXIMOS = {
  rascunho:  [['revisao', 'Enviar para revisão'], ['arquivado', 'Arquivar']],
  revisao:   [['publicado', 'Publicar'], ['rascunho', 'Devolver para rascunho'], ['arquivado', 'Arquivar']],
  publicado: [['revisao', 'Editar (volta para revisão)'], ['arquivado', 'Arquivar']],
  arquivado: [['rascunho', 'Desarquivar']],
};

function ArtigoModal({ artigo, categorias, onClose, onSave }) {
  const [form, setForm] = useState({
    titulo:     artigo?.titulo     || '',
    tipo:       artigo?.tipo       || 'artigo',
    categoria_id: artigo?.categoria_id || '',
    resumo:     artigo?.resumo     || '',
    conteudo:   artigo?.conteudo   || '',
    valido_ate: artigo?.valido_ate?.slice(0, 10) || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const bloqueado = artigo?.status === 'publicado';

  const submit = async (e) => {
    e.preventDefault();
    if (!form.titulo || !form.conteudo) { setError('Título e conteúdo são obrigatórios'); return; }
    setError(''); setSaving(true);
    try {
      await onSave({ ...form, categoria_id: form.categoria_id || null, valido_ate: form.valido_ate || null });
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal aria-label={artigo ? 'Editar artigo' : 'Novo artigo'}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{artigo ? 'Editar artigo' : 'Novo artigo'}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        <form onSubmit={submit} className={styles.modalForm} noValidate>
          {bloqueado && (
            <p className={styles.aviso}>
              Este artigo está <strong>publicado</strong>. Mova para "revisão" antes de editar — conhecimento
              oficial não é sobrescrito em silêncio (§53).
            </p>
          )}
          <Input label="Título" value={form.titulo} onChange={e => set('titulo', e.target.value)} disabled={bloqueado} required />

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label className={styles.label}>Tipo</label>
              <select className={styles.select} value={form.tipo} onChange={e => set('tipo', e.target.value)} disabled={bloqueado}>
                {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Categoria</label>
              <select className={styles.select} value={form.categoria_id} onChange={e => set('categoria_id', e.target.value)} disabled={bloqueado}>
                <option value="">— sem categoria —</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <Input
              label="Revisar até" type="date" value={form.valido_ate}
              onChange={e => set('valido_ate', e.target.value)} disabled={bloqueado}
              hint="Vencida, aparece marcada — não sai do ar"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Resumo</label>
            <textarea
              className={styles.textarea} rows={2} value={form.resumo} disabled={bloqueado}
              onChange={e => set('resumo', e.target.value)}
              placeholder="Uma ou duas frases — é o que a IA lê primeiro."
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Conteúdo</label>
            <textarea
              className={styles.textarea} rows={12} value={form.conteudo} disabled={bloqueado}
              onChange={e => set('conteudo', e.target.value)}
              placeholder="Procedimento, política, argumentação…"
            />
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.modalActions}>
            <Button variant="ghost" type="button" onClick={onClose}>Fechar</Button>
            {!bloqueado && <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>}
          </div>
        </form>
      </div>
    </div>
  );
}

function Gaps() {
  const qc = useQueryClient();
  const toast = useStore(s => s.toast);
  const { data: gaps = [] } = useQuery({ queryKey: ['knowledge-gaps'], queryFn: () => knowledgeApi.gaps() });

  const marcar = async (gap, status) => {
    try {
      await knowledgeApi.atualizarGap(gap.id, { status });
      qc.invalidateQueries({ queryKey: ['knowledge-gaps'] });
    } catch (err) { toast(err.message, 'error'); }
  };

  if (!gaps.length) return <p className={styles.vazio}>Nenhuma lacuna registrada. A base respondeu tudo até agora.</p>;

  return (
    <div className={styles.gaps}>
      <p className={styles.hint}>
        Perguntas que a base <strong>não</strong> soube responder, agrupadas por assunto. O número é quantas vezes
        alguém perguntou — comece pelas de cima.
      </p>
      {gaps.map(g => (
        <div key={g.id} className={styles.gap}>
          <span className={styles.gapContador}>{g.ocorrencias}×</span>
          <div className={styles.gapTexto}>
            <p>{g.pergunta}</p>
            <span className={styles.gapData}>última vez {new Date(g.ultima_em).toLocaleDateString('pt-BR')}</span>
          </div>
          <button className={styles.gapAcao} onClick={() => marcar(g, 'ignorado')}>ignorar</button>
        </div>
      ))}
    </div>
  );
}

export default function Knowledge() {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();
  const [aba, setAba]     = useState('artigos');
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(null);

  const { data: categorias = [] } = useQuery({ queryKey: ['knowledge-cats'], queryFn: knowledgeApi.categorias });
  const { data: artigos = [], isLoading } = useQuery({
    queryKey: ['knowledge', busca],
    queryFn:  () => busca ? knowledgeApi.buscar(busca) : knowledgeApi.list(),
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ['knowledge'] });

  const salvar = async (form) => {
    if (modal === 'novo') await knowledgeApi.criar(form);
    else                  await knowledgeApi.atualizar(modal.id, form);
    invalidar();
    toast(modal === 'novo' ? 'Artigo criado como rascunho' : 'Artigo salvo', 'success');
  };

  const mover = async (artigo, status) => {
    try {
      await knowledgeApi.status(artigo.id, status);
      invalidar();
      toast(`Movido para ${status}`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const remover = async (artigo) => {
    if (!confirm(`Remover "${artigo.titulo}"? As versões publicadas vão junto.`)) return;
    try { await knowledgeApi.remover(artigo.id); invalidar(); toast('Removido', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  };

  const abrir = async (artigo) => {
    try { setModal(await knowledgeApi.artigo(artigo.id)); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.abas} role="tablist">
          <button role="tab" aria-selected={aba === 'artigos'} className={[styles.aba, aba === 'artigos' && styles.abaAtiva].filter(Boolean).join(' ')} onClick={() => setAba('artigos')}>
            <BookOpen size={13} /> Artigos
          </button>
          <button role="tab" aria-selected={aba === 'gaps'} className={[styles.aba, aba === 'gaps' && styles.abaAtiva].filter(Boolean).join(' ')} onClick={() => setAba('gaps')}>
            <AlertCircle size={13} /> Lacunas
          </button>
        </div>
        {aba === 'artigos' && (
          <>
            <div className={styles.searchWrap}>
              <Search size={13} className={styles.searchIcon} />
              <input
                type="search" className={styles.search} placeholder="Buscar na base…"
                value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar na base"
              />
            </div>
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setModal('novo')}>Novo artigo</Button>
          </>
        )}
      </div>

      {aba === 'gaps' ? <Gaps /> : (
        <div className={styles.lista}>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className={`skeleton ${styles.skel}`} />)
          ) : artigos.length === 0 ? (
            <p className={styles.vazio}>
              {busca ? 'Nada encontrado — talvez seja um artigo a escrever.' : 'Base vazia. Comece pelo que mais perguntam.'}
            </p>
          ) : artigos.map(a => (
            <div key={a.id} className={styles.item}>
              <div className={styles.itemTop}>
                <button className={styles.itemTitulo} onClick={() => abrir(a)}>{a.titulo}</button>
                <span className={styles.status} data-status={a.status}>{a.status}</span>
                {a.desatualizado && <span className={styles.vencido}>revisão vencida</span>}
              </div>
              <div className={styles.itemMeta}>
                <span>{TIPOS.find(([v]) => v === a.tipo)?.[1] || a.tipo}</span>
                {a.categoria_nome && <span>· {a.categoria_nome}</span>}
                <span>· v{a.versao}</span>
                {a.score != null && <span>· relevância {a.score.toFixed(2)}</span>}
              </div>
              {a.resumo && <p className={styles.itemResumo}>{a.resumo}</p>}
              <div className={styles.itemAcoes}>
                {(PROXIMOS[a.status] || []).map(([st, label]) => (
                  <button key={st} className={styles.acao} onClick={() => mover(a, st)}>
                    <ArrowRight size={10} /> {label}
                  </button>
                ))}
                <button className={styles.acaoPerigo} onClick={() => remover(a)}><Trash2 size={10} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ArtigoModal
          artigo={modal === 'novo' ? null : modal}
          categorias={categorias}
          onClose={() => setModal(null)}
          onSave={salvar}
        />
      )}
    </div>
  );
}
