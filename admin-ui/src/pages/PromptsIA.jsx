import React, { useEffect, useState, useCallback } from 'react';
import { apiJson, api } from '../api';
import { useStore } from '../store';

const PLACEHOLDERS = [
  { tag: '[REGRAS]', desc: 'Injeta "Regras gerais" automaticamente' },
  { tag: '[ESTILO]', desc: 'Injeta "Estilo de conversa" automaticamente' },
  { tag: '[TIPOS_OCORRENCIA]', desc: '"200=Reparo, 13=Mudança..."' },
  { tag: '[PLANOS]', desc: 'Planos por cidade do banco' },
];

const SLUG_ICONS = {
  regras: '📏', estilo: '🎨', roteador: '🧭', financeiro: '💰',
  suporte: '🔧', comercial: '📡', faq: '❓', outros: '💬',
};

const SLUGS_COM_MODELO = ['roteador', 'financeiro', 'suporte', 'comercial', 'faq', 'outros'];

const MODELOS = {
  openai: [
    { id: 'gpt-5-mini', label: 'GPT-5 Mini', desc: 'Rápido, barato' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', desc: 'Intermediário' },
    { id: 'gpt-4.1', label: 'GPT-4.1', desc: 'Potente' },
    { id: 'gpt-4o', label: 'GPT-4o', desc: 'Multimodal' },
  ],
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', desc: 'Rápido, barato' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', desc: 'Potente' },
  ],
};

export default function PromptsIA() {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSlug, setActiveSlug] = useState('');
  const [editText, setEditText] = useState('');
  const [editProvedor, setEditProvedor] = useState('openai');
  const [editModelo, setEditModelo] = useState('gpt-5-mini');
  const [editTemp, setEditTemp] = useState(0.3);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const showToast = useStore(s => s.showToast);

  const load = useCallback(async () => {
    try {
      const data = await apiJson('/api/prompts');
      const arr = Array.isArray(data) ? data : [];
      setPrompts(arr);
      if (!activeSlug && arr.length > 0) {
        setActiveSlug(arr[0].slug);
        applyPrompt(arr[0]);
      }
    } catch {}
    setLoading(false);
  }, [activeSlug]);

  useEffect(() => { load(); }, [load]);

  const applyPrompt = (p) => {
    setEditText(p?.conteudo || '');
    setEditProvedor(p?.provedor || 'openai');
    setEditModelo(p?.modelo || 'gpt-5-mini');
    setEditTemp(parseFloat(p?.temperatura) || 0.3);
  };

  const activePrompt = prompts.find(p => p.slug === activeSlug);
  const isModified = activePrompt && activePrompt.conteudo !== activePrompt.padrao;
  const showModelConfig = SLUGS_COM_MODELO.includes(activeSlug);

  const selectPrompt = (slug) => {
    if (dirty && !confirm('Tem alterações não salvas. Descartar?')) return;
    const p = prompts.find(pr => pr.slug === slug);
    setActiveSlug(slug);
    applyPrompt(p);
    setDirty(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { conteudo: editText, provedor: editProvedor, modelo: editModelo, temperatura: editTemp };
      const r = await api(`/api/prompts/${activeSlug}`, { method: 'PUT', body: JSON.stringify(body) }).then(r => r.json());
      if (r.ok) { showToast('✅ Prompt salvo!'); setDirty(false); load(); }
      else showToast('Erro: ' + (r.error || 'falha'), true);
    } catch (e) { showToast('Erro: ' + e.message, true); }
    setSaving(false);
  };

  const handleRestore = async () => {
    if (!confirm(`Restaurar "${activePrompt?.nome}" ao texto padrão?`)) return;
    try {
      await api(`/api/prompts/${activeSlug}/restaurar`, { method: 'POST' });
      showToast('✅ Restaurado'); setDirty(false); load();
      const data = await apiJson('/api/prompts');
      const p = (Array.isArray(data) ? data : []).find(pr => pr.slug === activeSlug);
      if (p) applyPrompt(p);
    } catch (e) { showToast('Erro: ' + e.message, true); }
  };

  const fmtModelo = (m) => (m || '').replace('claude-haiku-4-5-20251001', 'Haiku 4.5').replace('claude-sonnet-4-6', 'Sonnet 4.6').replace('gpt-5-mini', 'GPT-5 Mini').replace('gpt-4.1-mini', 'GPT-4.1 Mini').replace('gpt-4.1', 'GPT-4.1').replace('gpt-4o', 'GPT-4o');

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <div className="page-head">
        <div><h1>🧠 Prompts IA</h1><p>Edite prompts e configure modelo de cada agente</p></div>
      </div>

      {loading ? <div className="skeleton" style={{ height: 400 }} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, minHeight: 500 }}>
          {/* Sidebar */}
          <div>
            {prompts.map(p => (
              <button key={p.slug} onClick={() => selectPrompt(p.slug)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  padding: '10px 14px', marginBottom: 3, borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: p.slug === activeSlug ? 'rgba(0,200,150,.12)' : 'transparent',
                  color: p.slug === activeSlug ? 'var(--g1)' : 'var(--text)',
                  fontWeight: p.slug === activeSlug ? 700 : 400, fontSize: '.82rem', transition: 'all .15s',
                }}>
                <span>{SLUG_ICONS[p.slug] || '📄'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                  {SLUGS_COM_MODELO.includes(p.slug) && (
                    <div style={{ fontSize: '.58rem', color: 'var(--dim)', marginTop: 1 }}>
                      {p.provedor === 'anthropic' ? '🟣' : '🟢'} {fmtModelo(p.modelo)}
                    </div>
                  )}
                </div>
                {p.conteudo !== p.padrao && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--g1)', flexShrink: 0 }} />}
              </button>
            ))}

            <div style={{ marginTop: 16, padding: 10, background: 'rgba(0,0,0,.15)', borderRadius: 10 }}>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Placeholders</div>
              {PLACEHOLDERS.map(ph => (
                <div key={ph.tag} style={{ marginBottom: 5, cursor: 'pointer' }}
                  onClick={() => { navigator.clipboard.writeText(ph.tag); showToast(`📋 ${ph.tag} copiado`); }}>
                  <code style={{ fontSize: '.68rem', background: 'rgba(0,200,150,.1)', color: 'var(--g1)', padding: '1px 5px', borderRadius: 4 }}>{ph.tag}</code>
                  <span style={{ fontSize: '.58rem', color: 'var(--dim)', marginLeft: 4 }}>{ph.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Editor */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            {activePrompt && <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: '1.2rem' }}>{SLUG_ICONS[activeSlug]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700 }}>{activePrompt.nome}</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace" }}>slug: {activeSlug}</div>
                </div>
                {dirty && <span className="badge badge-yellow" style={{ fontSize: '.6rem' }}>Não salvo</span>}
                {isModified && !dirty && <span className="badge badge-blue" style={{ fontSize: '.6rem' }}>Personalizado</span>}
              </div>

              {/* Seletor de modelo */}
              {showModelConfig && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 12, padding: '10px 14px', background: 'rgba(0,0,0,.15)', borderRadius: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={lbl}>Provedor</label>
                    <select className="input" value={editProvedor} onChange={e => { setEditProvedor(e.target.value); setEditModelo(MODELOS[e.target.value][0].id); setDirty(true); }}
                      style={{ padding: '6px 10px', fontSize: '.78rem', width: 135 }}>
                      <option value="openai">🟢 OpenAI</option>
                      <option value="anthropic">🟣 Anthropic</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Modelo</label>
                    <select className="input" value={editModelo} onChange={e => { setEditModelo(e.target.value); setDirty(true); }}
                      style={{ padding: '6px 10px', fontSize: '.78rem', width: 220 }}>
                      {(MODELOS[editProvedor] || []).map(m => (
                        <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Temperatura ({editTemp})</label>
                    <input type="range" min="0" max="1" step="0.1" value={editTemp}
                      onChange={e => { setEditTemp(parseFloat(e.target.value)); setDirty(true); }}
                      style={{ width: 100, accentColor: 'var(--g1)' }} />
                  </div>
                </div>
              )}

              <textarea value={editText}
                onChange={e => { setEditText(e.target.value); setDirty(true); }}
                style={{
                  flex: 1, minHeight: 300, padding: 16, background: 'rgba(0,0,0,.25)',
                  border: `1px solid ${dirty ? 'var(--g1)' : 'var(--border)'}`, borderRadius: 10,
                  color: 'var(--text)', fontSize: '.8rem', fontFamily: "'JetBrains Mono',monospace",
                  lineHeight: 1.6, resize: 'vertical', transition: 'border .2s',
                }} spellCheck={false} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <span style={{ fontSize: '.65rem', color: 'var(--dim)' }}>{editText.split('\n').length} linhas · {editText.length} chars</span>
                <div style={{ flex: 1 }} />
                {isModified && <button className="btn btn-outline btn-sm" onClick={handleRestore}>🔄 Restaurar</button>}
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !dirty}>
                  {saving ? '⏳...' : '💾 Salvar'}
                </button>
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}

const lbl = { fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 3 };
