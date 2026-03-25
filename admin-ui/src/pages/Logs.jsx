import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../store';

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const endRef = useRef(null);
  const sseRef = useRef(null);
  const showToast = useStore(s => s.showToast);
  const BASE = window.location.origin + '/admin';
  const token = localStorage.getItem('maxxi_token') || '';

  useEffect(() => {
    const sse = new EventSource(`${BASE}/logs/stream?token=${token}`);
    sseRef.current = sse;
    sse.onmessage = (e) => { if (!paused) setLogs(prev => [...prev.slice(-500), { ts: new Date().toISOString(), msg: e.data }]); };
    sse.onerror = () => { setTimeout(() => { sse.close(); }, 3000); };
    return () => sse.close();
  }, [paused]); // eslint-disable-line

  useEffect(() => { if (!paused) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs, paused]);

  const filtered = logs.filter(l => {
    if (filter) { const m = l.msg.toLowerCase(); if (filter === 'error' && !m.includes('❌') && !m.includes('erro')) return false; if (filter === 'ia' && !m.includes('🤖') && !m.includes('ia')) return false; if (filter === 'msg' && !m.includes('📤') && !m.includes('📥') && !m.includes('msg')) return false; }
    if (search && !l.msg.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const exportLogs = () => {
    const txt = filtered.map(l => `[${new Date(l.ts).toLocaleTimeString('pt-BR')}] ${l.msg}`).join('\n');
    const blob = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `maxxi-logs-${new Date().toISOString().slice(0, 10)}.txt`; a.click();
    showToast('📥 Logs exportados!');
  };

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <div className="page-head">
        <div><h1>📋 Logs ao Vivo</h1><p>{logs.length} eventos · {paused ? '⏸ Pausado' : '▶️ Ao vivo'}</p></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`btn btn-sm ${paused ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPaused(!paused)}>{paused ? '▶️ Retomar' : '⏸ Pausar'}</button>
          <button className="btn btn-outline btn-sm" onClick={() => setLogs([])}>🗑 Limpar</button>
          <button className="btn btn-outline btn-sm" onClick={exportLogs}>⬇️ Exportar</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['', 'Todos'], ['error', '❌ Erros'], ['ia', '🤖 IA'], ['msg', '📤 Mensagens']].map(([id, lbl]) => (
          <button key={id} className={`btn btn-xs ${filter === id ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(id)}>{lbl}</button>
        ))}
        <input className="input" style={{ width: 200, padding: '4px 10px', fontSize: '.78rem' }} placeholder="🔍 Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div style={{ background: 'rgba(3,45,61,.5)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: 14, fontFamily: "'JetBrains Mono',monospace", fontSize: '.72rem', height: 'calc(100dvh - 280px)', maxHeight: '60dvh', overflowY: 'auto', lineHeight: 1.8 }}>
        {filtered.length === 0 ? <div style={{ color: 'var(--dim)', textAlign: 'center', padding: 40 }}>Aguardando logs...</div> :
          filtered.map((l, i) => (
            <div key={i} style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,.02)', color: l.msg.includes('❌') ? 'var(--red)' : l.msg.includes('✅') ? 'var(--g1)' : l.msg.includes('⚠️') ? 'var(--yellow)' : 'rgba(255,255,255,.6)' }}>
              <span style={{ color: 'var(--dim)', marginRight: 8 }}>[{new Date(l.ts).toLocaleTimeString('pt-BR')}]</span>{l.msg}
            </div>
          ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
