import React, { useEffect, useState } from 'react';
import { apiJson } from '../api';

const HORAS = Array.from({ length: 24 }, (_, i) => i);
const DIAS_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function corCelula(valor, maximo) {
  if (!valor || !maximo) return 'rgba(255,255,255,.04)';
  const pct = valor / maximo;
  if (pct >= 0.8) return 'rgba(0,200,150,.85)';
  if (pct >= 0.6) return 'rgba(0,200,150,.6)';
  if (pct >= 0.4) return 'rgba(0,200,150,.4)';
  if (pct >= 0.2) return 'rgba(0,200,150,.2)';
  return 'rgba(0,200,150,.08)';
}

export default function HeatmapAgente({ agenteId, nome }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!agenteId) return;
    setLoading(true);
    apiJson(`/api/agentes/${agenteId}/heatmap`)
      .then(d => { setDados(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [agenteId]);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 20 }}>
      <span className="spinner" aria-label="Carregando heatmap..." />
    </div>
  );

  if (!dados?.grid) return (
    <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: '.78rem' }}>
      Sem dados de atividade ainda
    </div>
  );

  const { grid, maximo } = dados;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{
        fontSize: '.6rem', color: 'var(--muted)', marginBottom: 8,
        fontFamily: "'JetBrains Mono',monospace", textAlign: 'center',
      }}>
        Atividade de mensagens por hora — últimos 7 dias
      </div>

      {/* Hora labels */}
      <div style={{ display: 'flex', gap: 2, paddingLeft: 32, marginBottom: 3 }}>
        {HORAS.filter(h => h % 3 === 0).map(h => (
          <div key={h} style={{
            width: h % 3 === 0 ? 'auto' : 0,
            minWidth: 18 * 3 + 2 * 3,
            fontSize: '.58rem',
            color: 'var(--dim)',
            fontFamily: "'JetBrains Mono',monospace",
            textAlign: 'left',
          }}>{String(h).padStart(2, '0')}h</div>
        ))}
      </div>

      {/* Grid */}
      {DIAS_LABEL.map((dia, diaSemana) => (
        <div key={dia} style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2 }}>
          <div style={{
            width: 28, fontSize: '.6rem', color: 'var(--muted)',
            fontFamily: "'JetBrains Mono',monospace", flexShrink: 0,
            textAlign: 'right', paddingRight: 4,
          }}>{dia}</div>
          {HORAS.map(hora => {
            const valor = grid[diaSemana]?.[hora] || 0;
            const isHover = hover?.dia === diaSemana && hover?.hora === hora;
            return (
              <div
                key={hora}
                style={{
                  width: 18, height: 18,
                  borderRadius: 3,
                  background: corCelula(valor, maximo),
                  cursor: valor > 0 ? 'pointer' : 'default',
                  transition: 'transform .1s',
                  transform: isHover ? 'scale(1.3)' : 'scale(1)',
                  position: 'relative',
                  flexShrink: 0,
                }}
                onMouseEnter={() => setHover({ dia: diaSemana, hora, valor })}
                onMouseLeave={() => setHover(null)}
                title={valor > 0 ? `${dia} ${hora}h: ${valor} msg${valor !== 1 ? 's' : ''}` : ''}
              />
            );
          })}
        </div>
      ))}

      {/* Tooltip */}
      {hover && hover.valor > 0 && (
        <div style={{
          marginTop: 8, fontSize: '.7rem', color: 'var(--muted)',
          fontFamily: "'JetBrains Mono',monospace", textAlign: 'center',
        }}>
          {DIAS_LABEL[hover.dia]} às {String(hover.hora).padStart(2,'0')}h —
          <span style={{ color: 'var(--g1)', fontWeight: 700, marginLeft: 4 }}>
            {hover.valor} mensagem{hover.valor !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '.6rem', color: 'var(--dim)' }}>Menos</span>
        {[0, 0.25, 0.5, 0.75, 1].map(pct => (
          <div key={pct} style={{ width: 12, height: 12, borderRadius: 2, background: corCelula(pct * maximo, maximo) }} />
        ))}
        <span style={{ fontSize: '.6rem', color: 'var(--dim)' }}>Mais</span>
      </div>
    </div>
  );
}
