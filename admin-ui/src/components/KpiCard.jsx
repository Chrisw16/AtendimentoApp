import React, { useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

function useAnimatedValue(target, duration = 600) {
  const [display, setDisplay] = useState('—');
  const raf = useRef(null);

  useEffect(() => {
    if (target === null || target === undefined) { setDisplay('—'); return; }
    const str = String(target);
    const num = parseFloat(str.replace(/[^\d.-]/g, ''));
    if (isNaN(num)) { setDisplay(str); return; }

    let start = 0;
    const startTs = performance.now();
    const step = (ts) => {
      const p = Math.min((ts - startTs) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = Math.round(start + (num - start) * eased);
      setDisplay(str.replace(String(Math.round(num)), cur.toLocaleString('pt-BR')));
      if (p < 1) raf.current = requestAnimationFrame(step);
      else setDisplay(str);
    };
    raf.current = requestAnimationFrame(step);
    return () => raf.current && cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return display;
}

function Sparkline({ data, color = 'var(--g1)' }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 88;
  const h = 28;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  const fill = `${pts.join(' ')} ${w},${h} 0,${h}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      <defs>
        <linearGradient id={`spk-grad-${color.replace(/[^a-z0-9]/gi,'')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fill} fill={`url(#spk-grad-${color.replace(/[^a-z0-9]/gi,'')})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* Last dot */}
      <circle
        cx={parseFloat(pts[pts.length - 1].split(',')[0])}
        cy={parseFloat(pts[pts.length - 1].split(',')[1])}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}

export default function KpiCard({ label, value, color, sub, loading, trend, sparkData }) {
  const animated = useAnimatedValue(loading ? null : value);

  const trendPositive = trend > 0;
  const trendNeutral = trend === 0 || trend == null;
  const trendColor = trendNeutral ? 'var(--muted)' : trendPositive ? 'var(--g1)' : 'var(--red)';
  const TrendIcon = trendNeutral ? Minus : trendPositive ? TrendingUp : TrendingDown;

  return (
    <div className="kpi" role="region" aria-label={label}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-val" style={color ? { color } : {}}>
        {loading ? <span className="spinner" aria-label="Carregando..." /> : animated}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}

      {/* Trend badge */}
      {!loading && trend != null && (
        <div className="kpi-trend" style={{ color: trendColor }}>
          <TrendIcon size={11} aria-hidden="true" />
          <span>{trendPositive ? '+' : ''}{trend.toFixed(1)}%</span>
        </div>
      )}

      {/* Sparkline */}
      {!loading && sparkData && sparkData.length >= 2 && (
        <div className="kpi-sparkline">
          <Sparkline data={sparkData} color={color || 'var(--g1)'} />
        </div>
      )}
    </div>
  );
}
