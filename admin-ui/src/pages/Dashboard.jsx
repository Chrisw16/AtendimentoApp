import React, { useEffect, useState, useRef, useCallback } from 'react';
import { apiJson, createChatSSE } from '../api';
import { useStore } from '../store';
import { TrendingUp, TrendingDown, RefreshCw, Users, MessageSquare, Clock, Zap, AlertCircle } from 'lucide-react';

/* ── animated counter ─────────────────────────────────────── */
function useCounter(target, dur = 700) {
  const [val, setVal] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    const n = parseFloat(String(target).replace(/[^\d.]/g, '')) || 0;
    const start = performance.now();
    const step = (ts) => {
      const p = Math.min((ts - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(n * eased));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => raf.current && cancelAnimationFrame(raf.current);
  }, [target, dur]);
  return val;
}

/* ── KPI card ─────────────────────────────────────────────── */
function KpiCard({ label, value, sub, subColor, accent, icon: Icon, delay = 0 }) {
  const animated = useCounter(value || 0);
  return (
    <div className="anim-slide-up accent-top hover-lift"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 'var(--r-lg)', padding: 'var(--sp-4)', flex: 1, minWidth: 0, cursor: 'default', animationDelay: `${delay}s` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-3)' }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>{label}</div>
        {Icon && <Icon size={14} style={{ color: accent || 'var(--accent)', opacity: .7 }} />}
      </div>
      <div style={{ fontSize: '1.8rem', fontFamily: "'Bebas Neue',sans-serif", color: accent || 'var(--accent)', letterSpacing: '.5px', lineHeight: 1, marginBottom: 'var(--sp-1)' }}>
        {value === undefined ? '—' : animated.toLocaleString('pt-BR')}
      </div>
      {sub && <div style={{ fontSize: 'var(--text-xs)', color: subColor || 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ── bar chart ────────────────────────────────────────────── */
function BarChart({ data, height = 90, color = 'var(--accent)', labelKey, valueKey, highlight }) {
  const [hovered, setHovered] = useState(null);
  if (!data?.length) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 'var(--text-sm)' }}>Sem dados</div>
  );
  const max = Math.max(...data.map(d => parseInt(d[valueKey]) || 0), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: height + 18, paddingBottom: 18, position: 'relative' }}>
      {data.map((d, i) => {
        const val = parseInt(d[valueKey]) || 0;
        const pct = Math.max((val / max) * 100, val > 0 ? 3 : 0);
        const isHighlight = highlight !== undefined && d[labelKey] === highlight;
        const isHovered = hovered === i;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end', cursor: val > 0 ? 'pointer' : 'default' }}
            title={`${d[labelKey]}: ${val}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}>
            {isHovered && val > 0 && (
              <div style={{ position: 'absolute', bottom: 22 + (pct / 100 * height), left: `calc(${(i / data.length) * 100}% + ${i * 3}px)`, background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 'var(--r-sm)', padding: '2px 6px', fontSize: 'var(--text-xs)', color: 'var(--text-1)', whiteSpace: 'nowrap', zIndex: 10, pointerEvents: 'none', transform: 'translateX(-30%)' }}>
                {val}
              </div>
            )}
            <div style={{ width: '100%', background: isHighlight ? 'var(--accent)' : isHovered ? 'rgba(0,200,150,.55)' : color, borderRadius: '3px 3px 0 0', height: `${pct}%`, transition: 'height .5s cubic-bezier(.34,1.56,.64,1), background .15s', minHeight: val > 0 ? 3 : 0 }} />
            <div style={{ fontSize: '.58rem', color: isHighlight ? 'var(--accent)' : 'var(--text-4)', position: 'absolute', bottom: 0, fontWeight: isHighlight ? 700 : 400, transition: 'color .15s' }}>
              {d[labelKey]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── progress bar ─────────────────────────────────────────── */
function ProgressBar({ label, value, max, color, delay = 0 }) {
  const [width, setWidth] = useState(0);
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  useEffect(() => { const t = setTimeout(() => setWidth(pct), 100 + delay); return () => clearTimeout(t); }, [pct, delay]);
  return (
    <div style={{ marginBottom: 'var(--sp-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-1)' }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>{label}</span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', fontFamily: "'JetBrains Mono',monospace" }}>{value.toLocaleString('pt-BR')}</span>
      </div>
      <div style={{ height: 5, background: 'var(--border-3)', borderRadius: 'var(--r-full)' }}>
        <div style={{ width: `${width}%`, height: '100%', background: color || 'var(--accent)', borderRadius: 'var(--r-full)', transition: 'width .8s cubic-bezier(.34,1.2,.64,1)' }} />
      </div>
    </div>
  );
}

/* ── card wrapper ─────────────────────────────────────────── */
function Card({ title, children, extra, delay = 0 }) {
  return (
    <div className="anim-slide-up hover-glow"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--border-1)', borderRadius: 'var(--r-lg)', padding: 'var(--sp-5)', animationDelay: `${delay}s` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
        <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-2)' }}>{title}</div>
        {extra && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-4)', fontFamily: "'JetBrains Mono',monospace" }}>{extra}</div>}
      </div>
      {children}
    </div>
  );
}

/* ── agent rank item ──────────────────────────────────────── */
function AgentRow({ agent, max, index }) {
  const colors = ['var(--accent)', 'var(--info)', 'var(--warning)', '#ff6b35', '#a78bfa', '#f472b6'];
  const color = colors[index % colors.length];
  const tma = agent.tma_seg ? `${Math.floor(agent.tma_seg / 60)}m${String(agent.tma_seg % 60).padStart(2,'0')}s` : null;
  const initials = (agent.nome || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const pct = max > 0 ? Math.round((parseInt(agent.total) / max) * 100) : 0;
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setBarWidth(pct), 200 + index * 60); return () => clearTimeout(t); }, [pct, index]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)', animation: `slideInLeft var(--dur-slow) var(--ease) ${index * 0.06}s both` }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: `color-mix(in srgb, ${color} 15%, transparent)`, border: `1.5px solid color-mix(in srgb, ${color} 35%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.62rem', fontWeight: 700, color, flexShrink: 0 }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.nome}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', flexShrink: 0, marginLeft: 'var(--sp-2)', fontFamily: "'JetBrains Mono',monospace" }}>{parseInt(agent.total)}</span>
        </div>
        <div style={{ height: 4, background: 'var(--border-3)', borderRadius: 'var(--r-full)' }}>
          <div style={{ width: `${barWidth}%`, height: '100%', background: color, borderRadius: 'var(--r-full)', opacity: .75, transition: 'width .8s cubic-bezier(.34,1.2,.64,1)' }} />
        </div>
        {tma && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-4)', marginTop: 2 }}>TMA {tma}</div>}
      </div>
    </div>
  );
}

/* ═══ MAIN ═══════════════════════════════════════════════════ */
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [dias, setDias] = useState(1);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const { role } = useStore();
  const sseRef = useRef(null);

  const load = useCallback(async (d = dias, spin = false) => {
    if (spin) setSpinning(true);
    try {
      const r = await apiJson(`/api/dashboard?dias=${d}`);
      setData(r);
      setLastUpdate(new Date());
    } catch {}
    finally { setLoading(false); setSpinning(false); }
  }, [dias]);

  useEffect(() => { setLoading(true); load(dias); }, [dias]);

  useEffect(() => {
    const sse = createChatSSE();
    sseRef.current = sse;
    ['nova_mensagem', 'status_alterado', 'conversa_assumida', 'conversa_encerrada'].forEach(evt => {
      sse.addEventListener(evt, () => {
        apiJson(`/api/dashboard?dias=${dias}`).then(r => { setData(r); setLastUpdate(new Date()); }).catch(() => {});
      });
    });
    sse.onerror = () => {};
    return () => sse.close();
  }, [dias]);

  useEffect(() => {
    const t = setInterval(() => load(dias), 60000);
    return () => clearInterval(t);
  }, [dias, load]);

  const horaAtual = new Date().getHours();
  const t = data?.totais || {};
  const fila = data?.fila || {};
  const canaisTotal = (data?.por_canal || []).reduce((s, c) => s + parseInt(c.total), 0) || 1;
  const agentesMax = Math.max(...(data?.agentes || []).map(a => parseInt(a.total)), 1);

  // Horas do dia até agora
  const horasData = Array.from({ length: Math.min(horaAtual + 2, 24) }, (_, h) => {
    const found = (data?.por_hora || []).find(x => parseInt(x.hora) === h);
    return { hora: `${h}h`, total: parseInt(found?.total) || 0 };
  });

  // Últimos 7 dias com label
  const diasData = (data?.por_dia || []).map(d => ({
    hora: new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }),
    total: parseInt(d.total) || 0,
  }));

  const canaisColors = ['var(--accent)', 'var(--info)', 'var(--warning)', '#ff6b35', 'var(--purple)'];
  const canaisLabels = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', telegram: 'Telegram' };

  const periodos = [{ label: 'Hoje', v: 1 }, { label: '7 dias', v: 7 }, { label: '30 dias', v: 30 }];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 'var(--sp-3)', color: 'var(--text-3)', fontSize: 'var(--text-base)' }}>
      <span className="spinner" />
      Carregando dashboard…
    </div>
  );

  return (
    <div style={{ paddingBottom: 'var(--sp-8)' }}>

      {/* Header */}
      <div className="anim-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-5)', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
        <div>
          <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 'var(--text-display)', letterSpacing: '1px', lineHeight: 1, margin: 0 }}>
            <span className="text-gradient">Dashboard</span>
          </h1>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 3, fontFamily: "'JetBrains Mono',monospace" }}>
            Atendimento em tempo real
            {lastUpdate && <span style={{ marginLeft: 8 }}>· {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', alignItems: 'center' }}>
          {periodos.map(p => (
            <button key={p.v} onClick={() => setDias(p.v)}
              style={{ padding: '5px 12px', borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: dias === p.v ? 700 : 400,
                background: dias === p.v ? 'rgba(0,200,150,.14)' : 'rgba(255,255,255,.04)',
                color: dias === p.v ? 'var(--accent)' : 'var(--text-3)',
                transition: 'all var(--dur-fast) var(--ease)' }}>
              {p.label}
            </button>
          ))}
          <button onClick={() => load(dias, true)} title="Atualizar"
            style={{ width: 30, height: 30, borderRadius: 'var(--r-md)', border: '1px solid var(--border-1)', cursor: 'pointer', background: 'transparent', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all var(--dur-fast)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--border-2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border-1)'; }}>
            <RefreshCw size={13} style={{ transition: 'transform .5s', transform: spinning ? 'rotate(360deg)' : 'none' }} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <KpiCard label="Total" value={t.total} sub={`${t.encerradas || 0} encerradas`} icon={MessageSquare} accent="var(--accent)" delay={0} />
        <KpiCard label="Resolvidas pela IA" value={t.so_ia} sub={`${t.taxa_ia || 0}% do total`} icon={Zap} accent="var(--info)" subColor="var(--info)" delay={0.05} />
        <KpiCard label="Com agente" value={t.com_agente} sub={t.total > 0 ? `${Math.round(((t.com_agente||0)/t.total)*100)}%` : '—'} icon={Users} accent="var(--warning)" delay={0.10} />
        <KpiCard label="TMA" value={null} sub={t.tma_fmt || '—'} icon={Clock} accent="#ff6b35" delay={0.15}
          /* override value display */ />
        <KpiCard label="Na fila agora" value={fila.aguardando} icon={AlertCircle}
          accent={fila.aguardando > 3 ? 'var(--danger)' : 'var(--accent)'}
          sub={fila.aguardando > 0 ? `máx ${Math.floor((fila.max_espera_seg||0)/60)}min espera` : 'nenhum aguardando'}
          subColor={fila.aguardando > 3 ? 'var(--danger)' : 'var(--text-3)'}
          delay={0.20} />
      </div>

      {/* TMA card separado — valor já formatado */}
      {/* (já incluído acima via KpiCard com value=null e sub) */}

      {/* Linha 2: por hora + canais */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
        <Card title="Conversas por hora — hoje" extra={`agora: ${horaAtual}h`} delay={0.15}>
          <BarChart data={horasData} height={90} color="rgba(0,200,150,.35)" labelKey="hora" valueKey="total" highlight={`${horaAtual}h`} />
        </Card>
        <Card title="Por canal" delay={0.20}>
          {(data?.por_canal || []).length === 0
            ? <div style={{ color: 'var(--text-4)', fontSize: 'var(--text-sm)', paddingTop: 'var(--sp-4)', textAlign: 'center' }}>Sem dados</div>
            : (data?.por_canal || []).map((c, i) => (
              <ProgressBar key={i} label={canaisLabels[c.canal] || c.canal} value={parseInt(c.total)} max={canaisTotal} color={canaisColors[i % canaisColors.length]} delay={i * 80} />
            ))
          }
        </Card>
      </div>

      {/* Linha 3: 7 dias + ranking */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
        <Card title="Últimos 7 dias" delay={0.22}>
          <BarChart data={diasData} height={80} color="rgba(62,207,255,.35)" labelKey="hora" valueKey="total" />
        </Card>
        <Card title="Ranking de agentes" extra={dias === 1 ? 'hoje' : `${dias} dias`} delay={0.26}>
          {(data?.agentes || []).length === 0
            ? <div style={{ color: 'var(--text-4)', fontSize: 'var(--text-sm)', paddingTop: 'var(--sp-4)', textAlign: 'center' }}>Nenhum atendimento no período</div>
            : (data?.agentes || []).map((a, i) => <AgentRow key={i} agent={a} max={agentesMax} index={i} />)
          }
        </Card>
      </div>
    </div>
  );
}
