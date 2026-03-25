import React, { useEffect, useState, useRef, useCallback } from 'react';
import { apiJson, api } from '../api';
import { useStore } from '../store';
import { Save, RotateCcw, FileText, AlertCircle } from 'lucide-react';

function LineNumberEditor({ value, onChange }) {
  const textareaRef = useRef(null);
  const lineNumRef = useRef(null);

  const syncScroll = () => {
    if (lineNumRef.current && textareaRef.current) {
      lineNumRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const lines = value.split('\n');
  const lineCount = lines.length;

  return (
    <div className="prompt-editor-wrap" aria-label="Editor de prompt">
      <div
        ref={lineNumRef}
        className="prompt-line-nums"
        aria-hidden="true"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className="prompt-line-num">{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="prompt-textarea"
        value={value}
        onChange={e => onChange(e.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        aria-label="Conteúdo do prompt da IA"
        aria-multiline="true"
        id="prompt-editor"
      />
    </div>
  );
}

export default function Prompt() {
  const [prompt, setPrompt] = useState('');
  const [original, setOriginal] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const showToast = useStore(s => s.showToast);

  useEffect(() => {
    apiJson('/api/prompt')
      .then(d => {
        setPrompt(d.prompt || '');
        setOriginal(d.prompt || '');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const salvar = useCallback(async () => {
    setSaving(true);
    try {
      const r = await api('/api/prompt', { method: 'POST', body: JSON.stringify({ prompt }) });
      const d = await r.json();
      if (d.ok) { showToast('Prompt salvo com sucesso!'); setOriginal(prompt); }
      else showToast('Erro: ' + (d.error || 'falha'), true);
    } catch (e) {
      showToast('Erro: ' + e.message, true);
    }
    setSaving(false);
  }, [prompt, showToast]);

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (changed && !saving) salvar();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [salvar, saving]);

  const changed = prompt !== original;
  const chars = prompt.length;
  const tokens = Math.round(chars / 4);
  const lineCount = prompt.split('\n').length;

  return (
    <div style={{ animation: 'fadeIn .35s ease', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-head">
        <div>
          <h1>Editor de Prompt</h1>
          <p>Instruções que definem o comportamento da Maxxi IA</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {changed && (
            <span className="badge badge-yellow" style={{ fontSize: '.7rem' }} role="status" aria-live="polite">
              <AlertCircle size={10} aria-hidden="true" />
              Não salvo
            </span>
          )}
          <button
            className="btn btn-outline btn-sm"
            onClick={() => { setPrompt(original); showToast('Revertido para versão salva'); }}
            disabled={!changed || saving}
            aria-label="Reverter alterações"
          >
            <RotateCcw size={13} aria-hidden="true" />
            Reverter
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={salvar}
            disabled={saving || !changed}
            aria-label="Salvar prompt (Ctrl+S)"
            title="Salvar (Ctrl+S)"
          >
            <Save size={13} aria-hidden="true" />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <span className="spinner spinner-lg" aria-label="Carregando prompt..." />
          </div>
        ) : (
          <>
            <LineNumberEditor value={prompt} onChange={setPrompt} />
            <div className="prompt-statusbar" aria-label="Estatísticas do prompt">
              <span>
                <FileText size={11} aria-hidden="true" />
                {lineCount.toLocaleString()} linhas
              </span>
              <span>{chars.toLocaleString()} caracteres</span>
              <span>~{tokens.toLocaleString()} tokens</span>
              <span style={{ marginLeft: 'auto', color: changed ? 'var(--yellow)' : 'var(--muted)' }}>
                {changed ? 'Alterações pendentes' : 'Salvo'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
