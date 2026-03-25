import React from 'react';

/** Single skeleton line */
export function SkeletonLine({ width = '100%', height = 14, style }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: 6, ...style }}
      aria-hidden="true"
    />
  );
}

/** Skeleton for a KPI card */
export function SkeletonKpi() {
  return (
    <div className="kpi" aria-hidden="true">
      <SkeletonLine width="55%" height={10} style={{ marginBottom: 10 }} />
      <SkeletonLine width="70%" height={28} style={{ marginBottom: 8 }} />
      <SkeletonLine width="40%" height={8} />
    </div>
  );
}

/** Skeleton for a generic card */
export function SkeletonCard({ rows = 4 }) {
  return (
    <div className="card" aria-hidden="true">
      <SkeletonLine width="45%" height={14} style={{ marginBottom: 16 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine
          key={i}
          width={`${75 + Math.sin(i) * 20}%`}
          height={12}
          style={{ marginBottom: 10 }}
        />
      ))}
    </div>
  );
}

/** Skeleton for table rows */
export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} height={10} style={{ opacity: 0.5 }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonLine key={c} width={`${60 + Math.random() * 35}%`} height={12} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton for KPI grid */
export function SkeletonKpiGrid({ count = 6 }) {
  return (
    <div className="kpi-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonKpi key={i} />
      ))}
    </div>
  );
}

/** Skeleton for a chat list item */
export function SkeletonChatItem() {
  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,.03)' }} aria-hidden="true">
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <SkeletonLine width={6} height={6} style={{ borderRadius: '50%', flexShrink: 0 }} />
        <SkeletonLine width="55%" height={11} />
      </div>
      <SkeletonLine width="75%" height={9} />
    </div>
  );
}
