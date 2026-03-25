import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, LayoutDashboard, BarChart2, FileText, MessageSquare,
  Users, Zap, Radio, Bell, RefreshCcw, Edit3, Star, Clock,
  ClipboardList, Plug, Key, Ticket, User, X,
} from 'lucide-react';
import { useStore } from '../store';

const PAGES = [
  { label: 'Dashboard', to: '/', Icon: LayoutDashboard, group: 'Páginas', admin: true },
  { label: 'BI · ERP', to: '/bi', Icon: BarChart2, group: 'Páginas', admin: true },
  { label: 'Relatórios', to: '/relatorio', Icon: FileText, group: 'Páginas', admin: true },
  { label: 'Chat Interno', to: '/chat', Icon: MessageSquare, group: 'Páginas', admin: false },
  { label: 'Agentes', to: '/agentes', Icon: Users, group: 'Páginas', admin: true },
  { label: 'Respostas Rápidas', to: '/respostas', Icon: Zap, group: 'Páginas', admin: true },
  { label: 'Canais', to: '/canais', Icon: Radio, group: 'Páginas', admin: true },
  { label: 'Alertas', to: '/alertas', Icon: Bell, group: 'Páginas', admin: true },
  { label: 'Reativação', to: '/reativacao', Icon: RefreshCcw, group: 'Páginas', admin: true },
  { label: 'Prompt IA', to: '/prompt', Icon: Edit3, group: 'Páginas', admin: true },
  { label: 'NPS / Satisfação', to: '/satisfacao', Icon: Star, group: 'Páginas', admin: true },
  { label: 'Horário & SLA', to: '/horario', Icon: Clock, group: 'Páginas', admin: true },
  { label: 'Logs ao Vivo', to: '/logs', Icon: ClipboardList, group: 'Páginas', admin: true },
  { label: 'Sessões', to: '/sessoes', Icon: Plug, group: 'Páginas', admin: true },
  { label: 'Integrações', to: '/integracoes', Icon: Key, group: 'Páginas', admin: true },
  { label: 'Tipos de Ocorrência', to: '/tipos-ocorrencia', Icon: Ticket, group: 'Páginas', admin: true },
  { label: 'Meu Painel', to: '/meu-painel', Icon: User, group: 'Páginas', admin: false },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const role = useStore(s => s.role);

  const filteredPages = PAGES.filter(p => {
    if (p.admin && role !== 'admin') return false;
    return !query || p.label.toLowerCase().includes(query.toLowerCase());
  });

  const results = filteredPages;

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setSelected(0);
  }, []);

  const go = useCallback((item) => {
    navigate(item.to);
    close();
  }, [navigate, close]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
      setSelected(0);
    }
  }, [open]);

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[selected]) go(results[selected]);
  };

  if (!open) return null;

  return (
    <div className="cmd-overlay" role="dialog" aria-modal="true" aria-label="Paleta de comandos" onClick={close}>
      <div className="cmd-box" onClick={e => e.stopPropagation()} onKeyDown={handleKey}>
        {/* Search input */}
        <div className="cmd-input-row">
          <Search size={15} aria-hidden="true" style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Buscar página ou ação..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            aria-label="Buscar no painel"
            autoComplete="off"
          />
          <kbd className="cmd-kbd" aria-label="Pressione Escape para fechar">Esc</kbd>
          <button className="cmd-close-btn" onClick={close} aria-label="Fechar">
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="cmd-results" role="listbox">
          {results.length === 0 && (
            <div className="cmd-empty">Nenhum resultado para "{query}"</div>
          )}
          {results.map((item, i) => (
            <div
              key={item.to}
              className={`cmd-item${i === selected ? ' cmd-item--active' : ''}`}
              role="option"
              aria-selected={i === selected}
              onClick={() => go(item)}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="cmd-item-icon" aria-hidden="true">
                <item.Icon size={14} strokeWidth={1.8} />
              </span>
              <span className="cmd-item-label">{item.label}</span>
              <span className="cmd-item-group">{item.group}</span>
            </div>
          ))}
        </div>

        <div className="cmd-footer">
          <span><kbd>↑↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>Ctrl+K</kbd> abrir/fechar</span>
        </div>
      </div>
    </div>
  );
}
