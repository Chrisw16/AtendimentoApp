/**
 * SupervisoraIA.jsx
 * Painel lateral que mostra alertas e sugestões da Supervisora IA
 * Recebe eventos SSE: supervisora_alerta, supervisora_sugestao
 */
import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import styles from './SupervisoraIA.module.css';

const NIVEL_CONFIG = {
  demora_atencao:   { emoji: '⏱️', cor: '#D97706', label: 'Demora' },
  demora_critica:   { emoji: '🚨', cor: '#DC2626', label: 'Demora crítica' },
  cliente_frustrado:{ emoji: '🟠', cor: '#EA580C', label: 'Cliente frustrado' },
  cliente_critico:  { emoji: '🔴', cor: '#DC2626', label: 'Estado crítico' },
};

export default function SupervisoraIA({ convId }) {
  const [alertas,   setAlertas]   = useState([]);
  const [sugestao,  setSugestao]  = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const toast = useStore(s => s.toast);

  // Limpa ao trocar de conversa
  useEffect(() => {
    setAlertas([]);
    setSugestao(null);
  }, [convId]);

  // Ouve eventos SSE via useStore/window
  useEffect(() => {
    function onAlerta(e) {
      const data = e.detail;
      if (data.convId !== convId) return;

      setAlertas(prev => {
        // Evita duplicatas do mesmo tipo
        const filtered = prev.filter(a => a.tipo !== data.tipo);
        return [{ ...data, ts: Date.now() }, ...filtered].slice(0, 5);
      });
    }

    function onSugestao(e) {
      const data = e.detail;
      if (data.convId !== convId) return;
      setSugestao(data);
    }

    window.addEventListener('supervisora_alerta', onAlerta);
    window.addEventListener('supervisora_sugestao', onSugestao);
    return () => {
      window.removeEventListener('supervisora_alerta', onAlerta);
      window.removeEventListener('supervisora_sugestao', onSugestao);
    };
  }, [convId]);

  function copiarSugestao() {
    if (!sugestao?.sugestao) return;
    navigator.clipboard.writeText(sugestao.sugestao).catch(() => {});
    toast('Sugestão copiada!', 'success', 2000);
  }

  if (!alertas.length && !sugestao) return null;

  return (
    <div className={styles.root}>
      <button className={styles.header} onClick={() => setCollapsed(v => !v)}>
        <span className={styles.headerIcon}>🤖</span>
        <span className={styles.headerLabel}>Supervisora IA</span>
        {alertas.length > 0 && (
          <span className={styles.badge}>{alertas.length}</span>
        )}
        <span className={styles.chevron}>{collapsed ? '▲' : '▼'}</span>
      </button>

      {!collapsed && (
        <div className={styles.body}>
          {/* ALERTAS */}
          {alertas.map((a, i) => {
            const cfg = NIVEL_CONFIG[a.tipo] || { emoji: '⚠️', cor: '#D97706', label: 'Alerta' };
            return (
              <div key={i} className={styles.alerta} style={{ borderLeftColor: cfg.cor }}>
                <div className={styles.alertaHeader}>
                  <span>{cfg.emoji}</span>
                  <span className={styles.alertaTipo} style={{ color: cfg.cor }}>{cfg.label}</span>
                  {a.minutos && <span className={styles.alertaMin}>{a.minutos} min</span>}
                  <button className={styles.dismiss} onClick={() => setAlertas(p => p.filter((_, j) => j !== i))}>×</button>
                </div>
                {a.mensagem && <p className={styles.alertaMsg}>{a.mensagem}</p>}
                {a.gatilhos?.length > 0 && (
                  <div className={styles.gatilhos}>
                    {a.gatilhos.map((g, gi) => (
                      <span key={gi} className={styles.gatilho}>{g}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* SUGESTÃO DE RESPOSTA */}
          {sugestao && (
            <div className={styles.sugestao}>
              <div className={styles.sugestaoHeader}>
                <span>💡</span>
                <span className={styles.sugestaoLabel}>Sugestão de resposta</span>
                <button className={styles.dismiss} onClick={() => setSugestao(null)}>×</button>
              </div>
              <p className={styles.sugestaoTexto}>{sugestao.sugestao}</p>
              <button className={styles.copiarBtn} onClick={copiarSugestao}>
                Copiar sugestão
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
