import React, { useEffect, useState, useCallback } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { apiJson } from '../api';
import { useStore } from '../store';
import KpiCard from '../components/KpiCard';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const FMT_SEG = s => {
  if (!s || s <= 0) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
  return `${(s/3600).toFixed(1)}h`;
};

const CHART_OPTS = (stacked = false) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: 'rgba(255,255,255,.45)', font: { size: 10 }, usePointStyle: true, padding: 10 } },
    tooltip: { backgroundColor: 'rgba(2,55,65,.95)', titleColor: '#fff', bodyColor: 'rgba(255,255,255,.8)', cornerRadius: 8, padding: 10 },
  },
  scales: {
    x: { stacked, grid: { display: false }, ticks: { color: 'rgba(255,255,255,.4)', font: { size: 10 } } },
    y: { stacked, beginAtZero: true, grid: { color: 'rgba(0,139,135,.15)' }, ticks: { color: 'rgba(255,255,255,.4)', font: { size: 10 } } },
  },
});

const DOUGHNUT_OPTS = {
  responsive: true, maintainAspectRatio: false, cutout: '62%',
  plugins: {
    legend: { position: 'right', labels: { color: 'rgba(255,255,255,.45)', font: { size: 11 }, usePointStyle: true, padding: 12 } },
    tooltip: { backgroundColor: 'rgba(2,55,65,.95)', cornerRadius: 8, padding: 10 },
  },
};

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function StatRow({ label, value, sub, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,.04)' }}>
      <span style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: '.88rem', fontWeight: 600, color: color || 'var(--text)', fontFamily: "'JetBrains Mono',monospace" }}>
        {value} {sub && <span style={{ fontSize: '.72rem', fontWeight: 400, color: 'var(--dim)' }}>{sub}</span>}
      </span>
    </div>
  );
}

export default function Relatorio() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const showToast = useStore(s => s.showToast);

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const r = await apiJson(`/api/relatorio?dias=${d || dias}`);
      setData(r);
    } catch(e) { showToast('Erro ao carregar relatório: ' + e.message, true); }
    setLoading(false);
  }, [dias]);

  useEffect(() => { load(dias); }, [dias]);

  const exportCSV = () => {
    if (!data) { showToast('Sem dados', true); return; }
    const bom = '\uFEFF';
    const lines = [
      '# RELATÓRIO MAXXI — CITmax',
      `# Período: ${data.periodo_dias} dias | Gerado: ${new Date(data.gerado_em).toLocaleString('pt-BR')}`,
      '',
      '## ATENDIMENTO',
      `Total;${data.atendimento.total}`,
      `Encerradas;${data.atendimento.encerradas}`,
      `Resolvidas pela IA;${data.atendimento.so_ia} (${data.atendimento.taxa_resolucao_ia}%)`,
      `Com humano;${data.atendimento.com_humano}`,
      `Frustrações;${data.atendimento.frustrados} (${data.atendimento.taxa_frustracao}%)`,
      '',
      '## TEMPO DE RESPOSTA',
      `Média;${FMT_SEG(data.tempo_resposta.media_seg)}`,
      `Mediana;${FMT_SEG(data.tempo_resposta.mediana_seg)}`,
      '',
      '## NPS',
      `Score;${data.nps.score !== null ? data.nps.score : '—'}`,
      `Média;${data.nps.media}`,
      `Total respostas;${data.nps.total}`,
      `Promotores;${data.nps.promotores}`,
      `Neutros;${data.nps.neutros}`,
      `Detratores;${data.nps.detratores}`,
      '',
      '## LEADS',
      `Total histórico;${data.leads.total_historico}`,
      `Cadastrados;${data.leads.cadastrados}`,
      `No período;${data.leads.periodo}`,
      '',
      '## COBERTURA',
      `Consultas;${data.cobertura.total}`,
      `Com cobertura;${data.cobertura.com_cobertura} (${data.cobertura.taxa_cobertura}%)`,
      `Sem cobertura;${data.cobertura.sem_cobertura}`,
      `Lista de espera;${data.cobertura.lista_espera}`,
      '',
      '## POR DIA',
      'Data;Total;Com humano;Frustrações',
      ...(data.por_dia || []).map(d => `${d.dia};${d.total};${d.com_humano};${d.frustrados}`),
    ].join('\n');

    const blob = new Blob([bom + lines], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `maxxi-relatorio-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    showToast('📥 CSV exportado!');
  };

  const at = data?.atendimento || {};
  const tr = data?.tempo_resposta || {};
  const nps = data?.nps || {};
  const lds = data?.leads || {};
  const cob = data?.cobertura || {};
  const ia = data?.ia || {};

  // Chart: atendimentos por dia
  const diasLabels = (data?.por_dia || []).map(d => {
    const dt = new Date(d.dia);
    return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
  });

  // Chart: por canal
  const canais = data?.por_canal || [];
  const canalColors = {
    whatsapp: 'rgba(37,211,102,.7)', telegram: 'rgba(0,136,204,.7)',
    instagram: 'rgba(225,48,108,.7)', facebook: 'rgba(24,119,242,.7)',
    widget: 'rgba(0,200,150,.7)', chatwoot: 'rgba(31,147,255,.7)',
  };

  // NPS score color
  const npsColor = nps.score === null ? 'var(--dim)'
    : nps.score >= 50 ? 'var(--g1)' : nps.score >= 0 ? '#f59e0b' : 'var(--red)';
  const npsLabel = nps.score === null ? 'Sem dados'
    : nps.score >= 75 ? 'Excelente' : nps.score >= 50 ? 'Muito bom' : nps.score >= 0 ? 'Bom' : 'Crítico';

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>

      {/* Cabeçalho */}
      <div className="page-head">
        <div>
          <h1>📈 Relatórios</h1>
          <p>Métricas completas de atendimento, IA, NPS e cobertura</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="input" style={{ width: 130, fontSize: '.82rem', padding: '6px 10px' }}
            value={dias} onChange={e => setDias(Number(e.target.value))}>
            {[7, 15, 30, 60, 90].map(d => <option key={d} value={d}>Últimos {d} dias</option>)}
          </select>
          <button className="btn btn-outline btn-sm" onClick={() => load(dias)}>🔄 Atualizar</button>
          <button className="btn btn-outline btn-sm" onClick={exportCSV}>⬇️ Exportar CSV</button>
        </div>
      </div>

      {/* KPIs principais */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', marginBottom: 20 }}>
        <KpiCard label="Total Atendimentos" value={at.total ?? 0} loading={loading} />
        <KpiCard label="Resolvidos pela IA" value={`${at.taxa_resolucao_ia ?? 0}%`} color="var(--g1)" sub={`${at.so_ia ?? 0} conv`} loading={loading} />
        <KpiCard label="Com Humano" value={at.com_humano ?? 0} color="var(--blue)" loading={loading} />
        <KpiCard label="TMA" value={FMT_SEG(tr.media_seg)} color="var(--yellow)" sub="resp. média" loading={loading} />
        <KpiCard label="NPS Score" value={nps.score !== null && nps.score !== undefined ? nps.score : '—'} color={npsColor} sub={npsLabel} loading={loading} />
        <KpiCard label="Leads Captados" value={lds.periodo ?? 0} sub={`${lds.cadastrados ?? 0} cadastrados`} loading={loading} />
        <KpiCard label="Cobertura" value={`${cob.taxa_cobertura ?? 0}%`} color="var(--g1)" sub={`${cob.total ?? 0} consultas`} loading={loading} />
        <KpiCard label="Frustrações" value={`${at.taxa_frustracao ?? 0}%`} color={at.taxa_frustracao > 10 ? 'var(--red)' : 'var(--muted)'} sub={`${at.frustrados ?? 0} conv`} loading={loading} />
      </div>

      {/* Gráficos principais */}
      <div className="chart-row" style={{ marginBottom: 16 }}>

        {/* Atendimentos por dia */}
        <div className="card" style={{ flex: '2 1 400px' }}>
          <div className="card-title">📅 Atendimentos por dia</div>
          <div className="chart-wrap" style={{ height: 200 }}>
            {diasLabels.length > 0 ? (
              <Bar data={{
                labels: diasLabels,
                datasets: [
                  { label: 'Total', data: (data?.por_dia||[]).map(d=>d.total), backgroundColor: 'rgba(0,200,150,.5)', borderRadius: 3 },
                  { label: 'Com humano', data: (data?.por_dia||[]).map(d=>d.com_humano), backgroundColor: 'rgba(59,130,246,.5)', borderRadius: 3 },
                  { label: 'Frustrações', data: (data?.por_dia||[]).map(d=>d.frustrados), backgroundColor: 'rgba(239,68,68,.45)', borderRadius: 3 },
                ],
              }} options={CHART_OPTS(false)} />
            ) : <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Sem dados no período</div>}
          </div>
        </div>

        {/* Por canal */}
        <div className="card" style={{ flex: '1 1 200px' }}>
          <div className="card-title">📡 Por canal</div>
          <div className="chart-wrap" style={{ height: 200 }}>
            {canais.length > 0 ? (
              <Doughnut data={{
                labels: canais.map(c => c.canal),
                datasets: [{ data: canais.map(c => c.total), backgroundColor: canais.map(c => canalColors[c.canal] || 'rgba(100,100,100,.5)'), borderColor: 'rgba(3,45,61,.8)', borderWidth: 2, hoverOffset: 6 }],
              }} options={DOUGHNUT_OPTS} />
            ) : <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Sem dados</div>}
          </div>
        </div>
      </div>

      {/* Linha 2: Atendimento + Tempo resposta + NPS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12, marginBottom: 16 }}>

        {/* Atendimento detalhado */}
        <div className="card">
          <div className="card-title">🤖 Atendimento IA</div>
          <StatRow label="Total no período" value={at.total ?? 0} />
          <StatRow label="Encerradas" value={at.encerradas ?? 0} />
          <StatRow label="Resolvidas só pela IA" value={at.so_ia ?? 0} color="var(--g1)" sub={`${at.taxa_resolucao_ia ?? 0}%`} />
          <StatRow label="Transferidas p/ humano" value={at.com_humano ?? 0} color="var(--blue)" />
          <StatRow label="Ativas agora" value={at.ativas ?? 0} color="var(--yellow)" />
          <StatRow label="Aguardando resposta" value={at.aguardando ?? 0} />
          <StatRow label="Clientes frustrados" value={at.frustrados ?? 0} color={at.frustrados > 5 ? 'var(--red)' : 'var(--muted)'} sub={`${at.taxa_frustracao ?? 0}%`} />
        </div>

        {/* Tempo de resposta */}
        <div className="card">
          <div className="card-title">⏱️ Tempo de resposta</div>
          <StatRow label="Média" value={FMT_SEG(tr.media_seg)} color="var(--yellow)" />
          <StatRow label="Mediana" value={FMT_SEG(tr.mediana_seg)} />
          <StatRow label="Mais rápido" value={FMT_SEG(tr.min_seg)} color="var(--g1)" />
          <StatRow label="Mais lento" value={FMT_SEG(tr.max_seg)} color="var(--red)" />
          <div style={{ marginTop: 12, padding: '8px 0', borderTop: '0.5px solid rgba(255,255,255,.06)' }}>
            <div style={{ fontSize: '.72rem', color: 'var(--dim)', marginBottom: 4 }}>TMA em minutos</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--yellow)', fontFamily: "'JetBrains Mono',monospace" }}>
              {tr.media_min || '—'}<span style={{ fontSize: '.9rem' }}>min</span>
            </div>
          </div>
        </div>

        {/* NPS detalhado */}
        <div className="card">
          <div className="card-title">⭐ NPS detalhado</div>
          <div style={{ textAlign: 'center', padding: '12px 0', borderBottom: '0.5px solid rgba(255,255,255,.06)', marginBottom: 8 }}>
            <div style={{ fontSize: '2.2rem', fontWeight: 700, color: npsColor, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>
              {nps.score !== null && nps.score !== undefined ? nps.score : '—'}
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--dim)', marginTop: 3 }}>{npsLabel}</div>
          </div>
          <StatRow label="Total respostas" value={nps.total ?? 0} />
          <StatRow label="Promotores (9-10)" value={nps.promotores ?? 0} color="var(--g1)" />
          <StatRow label="Neutros (7-8)" value={nps.neutros ?? 0} color="var(--yellow)" />
          <StatRow label="Detratores (0-6)" value={nps.detratores ?? 0} color="var(--red)" />
          <StatRow label="Nota média" value={nps.media ? nps.media.toFixed(1) : '—'} />
          <StatRow label="Taxa de resposta" value={`${nps.taxa_resposta ?? 0}%`} />
        </div>

        {/* Leads */}
        <div className="card">
          <div className="card-title">🆕 Leads e conversões</div>
          <StatRow label="Leads no período" value={lds.periodo ?? 0} color="var(--g1)" />
          <StatRow label="Total histórico" value={lds.total_historico ?? 0} />
          <StatRow label="Cadastros no ERP" value={lds.cadastrados ?? 0} color="var(--g1)" />
          <StatRow label="Taxa conversão" value={lds.total_historico > 0 ? `${Math.round((lds.cadastrados/lds.total_historico)*100)}%` : '—'} />
        </div>

        {/* Cobertura */}
        <div className="card">
          <div className="card-title">🗺️ Consultas de cobertura</div>
          <StatRow label="Total consultas" value={cob.total ?? 0} />
          <StatRow label="Com cobertura" value={cob.com_cobertura ?? 0} color="var(--g1)" sub={`${cob.taxa_cobertura ?? 0}%`} />
          <StatRow label="Sem cobertura" value={cob.sem_cobertura ?? 0} color="var(--red)" />
          <StatRow label="Lista de espera" value={cob.lista_espera ?? 0} color="var(--yellow)" />
        </div>

        {/* IA tokens/custo */}
        <div className="card">
          <div className="card-title">💡 Consumo IA (acumulado)</div>
          <StatRow label="Atendimentos totais" value={(ia.totalAtendimentos||0).toLocaleString()} />
          <StatRow label="Tokens entrada" value={(ia.totalTokensInput||0).toLocaleString()} />
          <StatRow label="Tokens saída" value={(ia.totalTokensOutput||0).toLocaleString()} />
          <StatRow label="Cache hits" value={(ia.totalCacheHits||0).toLocaleString()} color="var(--g1)" />
          <StatRow label="Custo USD" value={`$${ia.custoUSD||'0.0000'}`} />
          <StatRow label="Custo BRL" value={`R$ ${ia.custoBRL||'0.00'}`} color="var(--yellow)" />
          <StatRow label="Erros IA" value={`${ia.erros||0} (${ia.errosPorcentagem||0}%)`} color={ia.erros > 0 ? 'var(--red)' : 'var(--muted)'} />
        </div>
      </div>

      {/* Agentes */}
      {(data?.agentes||[]).length > 0 && (
        <Section title="👤 Desempenho por agente">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Agente', 'Atendimentos', 'TMA'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--muted)', fontSize: '.68rem', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {(data?.agentes||[]).map((ag, i) => (
                  <tr key={i} style={{ borderBottom: '0.5px solid rgba(255,255,255,.03)' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 500 }}>{ag.agente_id}</td>
                    <td style={{ padding: '9px 14px', fontFamily: "'JetBrains Mono',monospace" }}>{ag.total}</td>
                    <td style={{ padding: '9px 14px', color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace" }}>{FMT_SEG(ag.tma_seg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Sentimento */}
      {(data?.sentimento||[]).length > 0 && (
        <Section title="💬 Sentimento dos clientes">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(data?.sentimento||[]).map((s, i) => {
              const isPos = /pos|feliz|satisf/i.test(s.sentimento);
              const isNeg = /neg|frust|raiva|brav/i.test(s.sentimento);
              return (
                <div key={i} style={{ background: 'var(--card-bg)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '10px 14px', minWidth: 120, textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: isPos ? 'var(--g1)' : isNeg ? 'var(--red)' : 'var(--yellow)', fontFamily: "'JetBrains Mono',monospace" }}>{s.total}</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2, textTransform: 'capitalize' }}>{s.sentimento}</div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
