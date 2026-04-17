import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore } from '../store';
import { Save, RotateCcw, Copy, Check, AlertCircle } from 'lucide-react';
import styles from './PromptsIA.module.css';

// ── CONSTANTES ────────────────────────────────────────────────────
const SLUG_ICONS = {
  regras: '📏', estilo: '🎨', roteador: '🧭',
  financeiro: '💰', suporte: '🔧', comercial: '📡',
  faq: '❓', outros: '💬',
};

// Slugs que têm configuração de modelo/provedor/temperatura
const SLUGS_COM_MODELO = ['roteador','financeiro','suporte','comercial','faq','outros'];

const MODELOS = {
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  desc: 'Rápido e barato' },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', desc: 'Mais potente'     },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Rápido, barato'  },
    { id: 'gpt-4o',      label: 'GPT-4o',      desc: 'Mais potente'    },
  ],
};

const PLACEHOLDERS = [
  { tag: '[REGRAS]',           desc: 'Injeta as regras absolutas automaticamente'   },
  { tag: '[ESTILO]',           desc: 'Injeta o estilo de conversa automaticamente'  },
  { tag: '[TIPOS_OCORRENCIA]', desc: '200=Reparo, 5=Outros, 13=Mudança...'          },
  { tag: '[PLANOS]',           desc: 'Lista de planos cadastrados no sistema'       },
];

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────
export default function PromptsIA() {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();

  const [activeSlug, setActiveSlug] = useState('regras');
  const [editText,   setEditText]   = useState('');
  const [editProv,   setEditProv]   = useState('anthropic');
  const [editModel,  setEditModel]  = useState('claude-haiku-4-5-20251001');
  const [editTemp,   setEditTemp]   = useState(0.3);
  const [dirty,      setDirty]      = useState(false);
  const [copied,     setCopied]     = useState('');

  const { data: prompts = [], isLoading } = useQuery({
    queryKey: ['prompts-ia'],
    queryFn:  () => api.get('/prompts'),
  });

  // Quando os dados chegam, carrega o primeiro prompt
  useEffect(() => {
    if (prompts.length && !dirty) {
      const p = prompts.find(x => x.slug === activeSlug) || prompts[0];
      if (p) apply(p);
    }
  }, [prompts]);

  function apply(p) {
    setEditText(p.conteudo || '');
    setEditProv(p.provedor || 'anthropic');
    setEditModel(p.modelo  || 'claude-haiku-4-5-20251001');
    setEditTemp(Number(p.temperatura ?? 0.3));
  }

  function select(slug) {
    if (dirty && !window.confirm('Tem alterações não salvas. Descartar?')) return;
    const p = prompts.find(x => x.slug === slug);
    setActiveSlug(slug);
    if (p) apply(p);
    setDirty(false);
  }

  const saveMut = useMutation({
    mutationFn: body => api.put(`/prompts/${activeSlug}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompts-ia'] });
      setDirty(false);
      toast('Prompt salvo!', 'success');
    },
    onError: e => toast(e.message, 'error'),
  });

  const restoreMut = useMutation({
    mutationFn: () => api.post(`/prompts/${activeSlug}/restaurar`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['prompts-ia'] });
      const fresh = await api.get('/prompts');
      const p = fresh.find(x => x.slug === activeSlug);
      if (p) apply(p);
      setDirty(false);
      toast('Restaurado para o padrão', 'success');
    },
    onError: e => toast(e.message, 'error'),
  });

  const activePrompt  = prompts.find(p => p.slug === activeSlug);
  const isCustomized  = activePrompt && activePrompt.conteudo !== activePrompt.padrao;
  const showModelConf = SLUGS_COM_MODELO.includes(activeSlug);

  function copyTag(tag) {
    navigator.clipboard.writeText(tag).catch(() => {});
    setCopied(tag);
    setTimeout(() => setCopied(''), 1500);
  }

  function fmtModel(m) {
    return (m || '')
      .replace('claude-haiku-4-5-20251001', 'Haiku 4.5')
      .replace('claude-sonnet-4-6', 'Sonnet 4.6')
      .replace('gpt-4o-mini', 'GPT-4o Mini')
      .replace('gpt-4o', 'GPT-4o');
  }

  return (
    <div className={styles.root}>

      {/* HEADER */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>🧠 Prompts IA</h1>
          <p className={styles.subtitle}>Edite prompts e configure o modelo de cada agente</p>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.loading}><span className="spinner spinner-lg"/></div>
      ) : (
        <div className={styles.layout}>

          {/* SIDEBAR */}
          <div className={styles.sidebar}>
            <div className={styles.promptList}>
              {prompts.map(p => (
                <button key={p.slug} onClick={() => select(p.slug)}
                  className={[styles.promptItem, p.slug === activeSlug && styles.promptItemActive].join(' ')}>
                  <span className={styles.promptIcon}>{SLUG_ICONS[p.slug] || '📄'}</span>
                  <div className={styles.promptMeta}>
                    <span className={styles.promptNome}>{p.nome}</span>
                    {SLUGS_COM_MODELO.includes(p.slug) && (
                      <span className={styles.promptModel}>
                        {p.provedor === 'anthropic' ? '🟣' : '🟢'} {fmtModel(p.modelo)}
                      </span>
                    )}
                  </div>
                  {p.conteudo !== p.padrao && <span className={styles.customDot} title="Personalizado"/>}
                </button>
              ))}
            </div>

            {/* PLACEHOLDERS */}
            <div className={styles.placeholders}>
              <p className={styles.placeholdersTitle}>Placeholders</p>
              {PLACEHOLDERS.map(ph => (
                <button key={ph.tag} className={styles.phItem} onClick={() => copyTag(ph.tag)}>
                  <code className={styles.phTag}>{ph.tag}</code>
                  <span className={styles.phDesc}>{ph.desc}</span>
                  {copied === ph.tag
                    ? <Check size={10} style={{ color:'var(--success)', flexShrink:0 }}/>
                    : <Copy size={10} style={{ color:'var(--text-tertiary)', flexShrink:0 }}/>}
                </button>
              ))}
            </div>
          </div>

          {/* EDITOR */}
          {activePrompt && (
            <div className={styles.editor}>

              {/* TÍTULO */}
              <div className={styles.editorHeader}>
                <span className={styles.editorIcon}>{SLUG_ICONS[activeSlug]}</span>
                <div>
                  <h2 className={styles.editorTitle}>{activePrompt.nome}</h2>
                  <code className={styles.editorSlug}>slug: {activeSlug}</code>
                </div>
                <div className={styles.editorBadges}>
                  {dirty && <span className={[styles.badge, styles.badgeDirty].join(' ')}>Não salvo</span>}
                  {isCustomized && !dirty && <span className={[styles.badge, styles.badgeCustom].join(' ')}>Personalizado</span>}
                </div>
              </div>

              {/* CONFIG DE MODELO */}
              {showModelConf && (
                <div className={styles.modelConf}>
                  <div className={styles.modelField}>
                    <label className={styles.modelLabel}>Provedor</label>
                    <select className={styles.select} value={editProv}
                      onChange={e => {
                        const prov = e.target.value;
                        setEditProv(prov);
                        setEditModel(MODELOS[prov][0].id);
                        setDirty(true);
                      }}>
                      <option value="anthropic">🟣 Anthropic</option>
                      <option value="openai">🟢 OpenAI</option>
                    </select>
                  </div>
                  <div className={styles.modelField} style={{ flex: 2 }}>
                    <label className={styles.modelLabel}>Modelo</label>
                    <select className={styles.select} value={editModel}
                      onChange={e => { setEditModel(e.target.value); setDirty(true); }}>
                      {(MODELOS[editProv] || []).map(m => (
                        <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.modelField}>
                    <label className={styles.modelLabel}>Temperatura ({editTemp.toFixed(1)})</label>
                    <input type="range" min="0" max="1" step="0.1" value={editTemp}
                      onChange={e => { setEditTemp(parseFloat(e.target.value)); setDirty(true); }}
                      className={styles.range}/>
                  </div>
                </div>
              )}

              {/* TEXTAREA */}
              <textarea
                className={[styles.textarea, dirty && styles.textareaDirty].join(' ')}
                value={editText}
                onChange={e => { setEditText(e.target.value); setDirty(true); }}
                spellCheck={false}
                rows={16}
              />

              {/* FOOTER */}
              <div className={styles.editorFooter}>
                <span className={styles.charCount}>
                  {editText.split('\n').length} linhas · {editText.length} chars
                </span>
                <div className={styles.footerActions}>
                  {isCustomized && (
                    <button className={styles.btnRestore}
                      onClick={() => restoreMut.mutate()}
                      disabled={restoreMut.isPending}>
                      <RotateCcw size={13}/>
                      Restaurar padrão
                    </button>
                  )}
                  <button
                    className={styles.btnSave}
                    onClick={() => saveMut.mutate({ conteudo: editText, provedor: editProv, modelo: editModel, temperatura: editTemp })}
                    disabled={saveMut.isPending || !dirty}>
                    <Save size={13}/>
                    {saveMut.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>

              {/* DICA sobre o slug */}
              <div className={styles.contextHint}>
                <AlertCircle size={12}/>
                <span>
                  No editor de fluxos, use um nó <strong>IA Responde</strong> com
                  {' '}<code>contexto = "{activeSlug}"</code> para este prompt ser ativado.
                </span>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}
