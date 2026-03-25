import React, { useEffect, useState, useCallback } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { apiJson, api } from '../api';
import { useStore } from '../store';
import KpiCard from '../components/KpiCard';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function Satisfacao() {
  const [config, setConfig] = useState({});
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('stats');
  const showToast = useStore(s => s.showToast);

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([apiJson('/api/nps/config'), apiJson('/api/nps/stats?dias=30')]);
      setConfig(c || {}); setStats(s || {});
    } catch {} setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const salvar = async () => {
    setSaving(true);
    try { await api('/api/nps/config', { method: 'PUT', body: JSON.stringify(config) }); showToast('✅ NPS salvo!'); }
    catch (e) { showToast('Erro: ' + e.message, true); }
    setSaving(false);
  };

  const nps = stats?.nps ?? 0;
  const cat = stats?.categorias || {};
  const total = (cat.promotor || 0) + (cat.neutro || 0) + (cat.detrator || 0);
  const npsColor = nps >= 50 ? 'var(--g1)' : nps >= 0 ? 'var(--yellow)' : 'var(--red)';
  const npsLabel = nps >= 50 ? 'Excelente' : nps >= 0 ? 'Bom' : 'Crítico';

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <div className="page-head">
        <div><h1>⭐ Satisfação · NPS</h1><p>Pesquisa pós-atendimento e métricas de satisfação</p></div>
        <div style={{ display: 'flex', gap: 6 }}>{[['stats', '📊 Resultados'], ['config', '⚙️ Configuração']].map(([id, lbl]) => (
          <button key={id} className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab(id)}>{lbl}</button>
        ))}</div>
      </div>

      {tab === 'stats' && <>
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', marginBottom: 20 }}>
          <KpiCard label="NPS Score" value={nps} color={npsColor} sub={npsLabel} loading={loading} />
          <KpiCard label="Promotores (9-10)" value={cat.promotor || 0} color="var(--g1)" loading={loading} />
          <KpiCard label="Neutros (7-8)" value={cat.neutro || 0} color="var(--yellow)" loading={loading} />
          <KpiCard label="Detratores (0-6)" value={cat.detrator || 0} color="var(--red)" loading={loading} />
          <KpiCard label="Total Respostas" value={total} loading={loading} />
          <KpiCard label="Taxa Resposta" value={stats?.taxa_resposta ? stats.taxa_resposta + '%' : '—'} loading={loading} />
        </div>

        <div className="chart-row">
          <div className="card">
            <div className="card-title">📊 Distribuição NPS</div>
            <div className="chart-wrap">{total > 0 ? (
              <Doughnut data={{ labels: ['Promotores', 'Neutros', 'Detratores'], datasets: [{ data: [cat.promotor || 0, cat.neutro || 0, cat.detrator || 0], backgroundColor: ['rgba(0,200,150,.7)', 'rgba(245,197,24,.7)', 'rgba(255,71,87,.7)'], borderColor: 'rgba(3,45,61,.8)', borderWidth: 2, hoverOffset: 8 }] }}
                options={{ responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right', labels: { color: 'rgba(255,255,255,.4)', font: { size: 11 }, usePointStyle: true, padding: 12 } } } }} />
            ) : <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Sem dados</div>}</div>
          </div>
          <div className="card">
            <div className="card-title">🎯 NPS Gauge</div>
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div style={{ fontSize: '4rem', fontFamily: "'Bebas Neue',sans-serif", color: npsColor, lineHeight: 1 }}>{nps}</div>
              <div style={{ fontSize: '1rem', color: npsColor, fontWeight: 700, marginTop: 8 }}>{npsLabel}</div>
              <div style={{ width: '80%', height: 10, background: 'var(--border)', borderRadius: 5, margin: '16px auto 0', overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', left: `${Math.min(100, Math.max(0, (nps + 100) / 2))}%`, top: -3, width: 16, height: 16, borderRadius: '50%', background: npsColor, transform: 'translateX(-50%)', border: '2px solid #fff', boxShadow: `0 0 8px ${npsColor}` }} />
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, var(--red), var(--yellow), var(--g1))' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.65rem', color: 'var(--dim)', width: '80%', margin: '4px auto 0' }}><span>-100</span><span>0</span><span>+100</span></div>
            </div>
          </div>
        </div>
      </>}

      {tab === 'config' && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-title">⚙️ Configuração NPS</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.85rem', marginBottom: 16 }}>
            <input type="checkbox" checked={!!config.ativo} onChange={e => setConfig({ ...config, ativo: e.target.checked })} style={{ accentColor: 'var(--g1)', width: 18, height: 18 }} />
            NPS ativo (envia pesquisa após atendimento)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Delay (horas após encerrar)</label>
              <input className="input" type="number" min={0} step={0.1} value={config.delay_horas ?? 0} onChange={e => { const v = parseFloat(e.target.value); setConfig({ ...config, delay_horas: isNaN(v) ? 0 : Math.max(0, v) }); }} /></div>
            <div><label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Cooldown (dias entre pesquisas)</label>
              <input className="input" type="number" min={1} value={config.cooldown_dias ?? 30} onChange={e => setConfig({ ...config, cooldown_dias: parseInt(e.target.value) || 30 })} /></div>
          </div>
          <div style={{ marginBottom: 12 }}><label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Pergunta NPS</label>
            <input className="input" value={config.pergunta || ''} onChange={e => setConfig({ ...config, pergunta: e.target.value })} placeholder="De 0 a 10, como você avalia nosso atendimento?" /></div>
          {['mensagem_agradecimento_promotor', 'mensagem_agradecimento_neutro', 'mensagem_agradecimento_detrator'].map(k => (
            <div key={k} style={{ marginBottom: 10 }}><label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Resposta {k.split('_').pop()}</label>
              <textarea className="input" rows={2} value={config[k] || ''} onChange={e => setConfig({ ...config, [k]: e.target.value })} style={{ resize: 'vertical' }} /></div>
          ))}
          <button className="btn btn-primary btn-sm" onClick={salvar} disabled={saving} style={{ marginTop: 8 }}>{saving ? 'Salvando...' : '💾 Salvar'}</button>
        </div>
      )}
    </div>
  );
}
