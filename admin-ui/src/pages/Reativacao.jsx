import React, { useEffect, useState, useCallback } from 'react';
import { apiJson, api } from '../api';
import { useStore } from '../store';
import KpiCard from '../components/KpiCard';

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: '.68rem', color: 'var(--dim)', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 16px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: '.65rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

export default function Reativacao() {
  const [config, setConfig] = useState({});
  const [stats, setStats] = useState(null);
  const [ativos, setAtivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('config');
  const showToast = useStore(s => s.showToast);

  const load = useCallback(async () => {
    try {
      const [c, s, a] = await Promise.all([
        apiJson('/api/reativacao/config').catch(() => ({})),
        apiJson('/api/reativacao/stats').catch(() => null),
        apiJson('/api/reativacao/ativos').catch(() => []),
      ]);
      setConfig(c || {}); setStats(s); setAtivos(Array.isArray(a) ? a : []);
    } catch {} setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const salvar = async () => {
    setSaving(true);
    try {
      await api('/api/reativacao/config', { method: 'PUT', body: JSON.stringify(config) });
      showToast('Configuracoes salvas!');
    } catch (e) { showToast('Erro: ' + e.message, true); }
    setSaving(false);
  };

  const num = (v, def) => { const n = parseFloat(v); return isNaN(n) ? def : Math.max(0, n); };

  const statsTotal = Array.isArray(stats) ? stats.reduce((acc, d) => {
    acc.envios += d.envios || 0; acc.encerramentos += d.encerramentos || 0; return acc;
  }, { envios: 0, encerramentos: 0 }) : { envios: 0, encerramentos: 0 };

  const t0min = config.tentativas?.[0]?.minutos ?? 30;
  const t1min = config.tentativas?.[1]?.minutos ?? 60;
  const resetMin = config.reset_sessao_minutos ?? 30;
  const encHoras = config.encerrar_conversa_horas ?? 24;

  const linha = [
    { t: '0', label: 'Cliente para\nde responder', icon: 'silencio' },
    { t: `${t0min}min`, label: '1a mensagem\nde reativacao', icon: 'msg1', color: '#3b82f6' },
    { t: `${t1min}min`, label: '2a mensagem\nde reativacao', icon: 'msg2', color: '#f59e0b' },
    { t: `${resetMin}min`, label: 'Reset sessao\nda IA', icon: 'reset', color: 'var(--g1)' },
    { t: `${encHoras}h`, label: config.encerrar_aguardando_agente === true ? 'Encerra IA\n+ fila agente' : 'Encerra\nso IA', icon: 'close', color: 'var(--red)' },
  ];

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <div className="page-head">
        <div>
          <h1>Tempos de Atendimento</h1>
          <p>Configure reativacao de inativos e encerramento automatico de conversas</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['config', 'Configuracao'], ['stats', 'Stats'], ['ativos', 'Ativos']].map(([id, lbl]) => (
            <button key={id} className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab(id)}>{lbl}</button>
          ))}
        </div>
      </div>

      {tab === 'config' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>

          {/* Encerramento automatico */}
          <div className="card">
            <div className="card-title">Encerramento automatico de conversas</div>
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Conversas paradas por mais de N horas sao fechadas automaticamente. Roda a cada 15 minutos.
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.85rem', marginBottom: 16 }}>
              <input type="checkbox" checked={config.encerrar_ativo !== false}
                onChange={e => setConfig({ ...config, encerrar_ativo: e.target.checked })}
                style={{ accentColor: 'var(--g1)', width: 18, height: 18 }} />
              <span>Encerramento automatico <strong>ativo</strong></span>
            </label>

            <Field label="Encerrar conversa apos (horas)" hint="Conversas sem resposta em N horas sao fechadas automaticamente. Padrao: 24h.">
              <input className="input" type="number" min={1} max={168} step={1}
                value={config.encerrar_conversa_horas ?? 24}
                onChange={e => setConfig({ ...config, encerrar_conversa_horas: num(e.target.value, 24) })} />
            </Field>

            <div style={{ padding: '12px 14px', background: 'rgba(3,45,61,.5)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox"
                  checked={config.encerrar_aguardando_agente === true}
                  onChange={e => setConfig({ ...config, encerrar_aguardando_agente: e.target.checked })}
                  style={{ accentColor: 'var(--g1)', width: 17, height: 17, marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '.84rem', fontWeight: 600, marginBottom: 3 }}>
                    Encerrar conversas aguardando agente
                  </div>
                  <div style={{ fontSize: '.73rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                    {config.encerrar_aguardando_agente === true
                      ? 'Ativo — conversas na fila do agente humano TAMBEM serao encerradas. Cuidado: o cliente pode ficar sem atendimento.'
                      : 'Desativado (recomendado) — so conversas respondidas apenas pela IA serao encerradas. Clientes aguardando agente ficam protegidos.'}
                  </div>
                </div>
              </label>
            </div>

            <Divider label="Reset de sessao IA" />

            <Field label="Resetar sessao IA apos (minutos)" hint="Se o cliente ficar N minutos sem responder, o bot recomexa do inicio. Padrao: 30 min.">
              <input className="input" type="number" min={5} max={1440} step={5}
                value={config.reset_sessao_minutos ?? 30}
                onChange={e => setConfig({ ...config, reset_sessao_minutos: num(e.target.value, 30) })} />
            </Field>

            <div style={{ padding: '10px 12px', background: 'rgba(0,200,150,.07)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 8, fontSize: '.76rem', color: 'var(--muted)', lineHeight: 1.7, marginTop: 4 }}>
              <strong style={{ color: 'var(--g1)' }}>Como funciona:</strong><br />
              1. Cliente para de responder<br />
              2. Apos <strong style={{ color: '#fff' }}>{resetMin} min</strong> — IA esquece o estado (bot recomexa)<br />
              3. Apos <strong style={{ color: '#fff' }}>{encHoras}h</strong> — conversa e fechada no chat
            </div>
          </div>

          {/* Reativacao */}
          <div className="card">
            <div className="card-title">Mensagens de reativacao</div>
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Envia mensagens antes de encerrar, tentando trazer o cliente de volta.
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.85rem', marginBottom: 16 }}>
              <input type="checkbox" checked={!!config.ativo}
                onChange={e => setConfig({ ...config, ativo: e.target.checked })}
                style={{ accentColor: 'var(--g1)', width: 18, height: 18 }} />
              <span>Reativacao <strong>ativa</strong></span>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <Field label="1a mensagem apos (min)">
                <input className="input" type="number" min={5} max={1440} step={5}
                  value={config.tentativas?.[0]?.minutos ?? 30}
                  onChange={e => {
                    const t = config.tentativas ? [...config.tentativas] : [{minutos:30,mensagem:''},{minutos:60,mensagem:''},{minutos:120,mensagem:''}];
                    t[0] = { ...t[0], minutos: num(e.target.value, 30) };
                    setConfig({ ...config, tentativas: t });
                  }} />
              </Field>
              <Field label="2a mensagem apos (min)">
                <input className="input" type="number" min={5} max={1440} step={5}
                  value={config.tentativas?.[1]?.minutos ?? 60}
                  onChange={e => {
                    const t = config.tentativas ? [...config.tentativas] : [{minutos:30,mensagem:''},{minutos:60,mensagem:''},{minutos:120,mensagem:''}];
                    t[1] = { ...t[1], minutos: num(e.target.value, 60) };
                    setConfig({ ...config, tentativas: t });
                  }} />
              </Field>
            </div>

            {[
              { idx: 0, label: 'Mensagem 1a tentativa', def: 'Oi! Ainda estou por aqui. Posso te ajudar com mais alguma coisa?' },
              { idx: 1, label: 'Mensagem 2a tentativa', def: 'Ainda precisa de ajuda? Estou disponivel!' },
            ].map(({ idx, label, def }) => (
              <Field key={idx} label={label}>
                <textarea className="input" rows={2}
                  value={config.tentativas?.[idx]?.mensagem ?? def}
                  onChange={e => {
                    const t = config.tentativas ? [...config.tentativas] : [{minutos:30,mensagem:''},{minutos:60,mensagem:''},{minutos:120,mensagem:''}];
                    t[idx] = { ...t[idx], mensagem: e.target.value };
                    setConfig({ ...config, tentativas: t });
                  }}
                  style={{ resize: 'vertical' }} />
              </Field>
            ))}

            <Field label="Mensagem de encerramento" hint="Ultima mensagem antes de fechar o atendimento">
              <textarea className="input" rows={2}
                value={config.mensagem_encerramento ?? 'Atendimento encerrado por inatividade. Qualquer duvida e so chamar!'}
                onChange={e => setConfig({ ...config, mensagem_encerramento: e.target.value })}
                style={{ resize: 'vertical' }} />
            </Field>
          </div>

          {/* Linha do tempo */}
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title">Linha do tempo</div>
            <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', padding: '8px 0' }}>
              {linha.map((step, i) => (
                <React.Fragment key={i}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 90, textAlign: 'center', gap: 4 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: step.color || 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', fontWeight: 700, color: '#fff' }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: '.7rem', fontWeight: 700, color: step.color || 'var(--muted)', fontFamily: "'JetBrains Mono',monospace" }}>{step.t}</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--muted)', lineHeight: 1.4, whiteSpace: 'pre-line' }}>{step.label}</div>
                  </div>
                  {i < linha.length - 1 && (
                    <div style={{ flex: 1, minWidth: 16, height: 2, background: 'var(--border)', margin: '0 4px', marginBottom: 24, flexShrink: 0 }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'stats' && (
        <>
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', marginBottom: 20 }}>
            <KpiCard label="Enviadas (7d)" value={statsTotal.envios} loading={loading} />
            <KpiCard label="Encerramentos (7d)" value={statsTotal.encerramentos} color="var(--red)" loading={loading} />
          </div>
          {Array.isArray(stats) && stats.length > 0 && (
            <div className="card">
              <div className="card-title">Historico por dia</div>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Data', 'Enviadas', 'Encerramentos'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontSize: '.65rem', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {stats.slice().reverse().map((d, i) => (
                      <tr key={i} style={{ borderBottom: '0.5px solid rgba(255,255,255,.03)' }}>
                        <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: '.75rem', color: 'var(--muted)' }}>{d.data}</td>
                        <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono',monospace" }}>{d.envios || 0}</td>
                        <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono',monospace", color: d.encerramentos > 0 ? 'var(--red)' : 'var(--muted)' }}>{d.encerramentos || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'ativos' && (
        <div className="card">
          <div className="card-title">Timers ativos ({ativos.length})</div>
          {ativos.length === 0
            ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Nenhum timer ativo</div>
            : ativos.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(3,45,61,.4)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '.82rem', marginBottom: 6 }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '.72rem', color: 'var(--muted)' }}>{a.convId}</span>
                <span style={{ flex: 1 }}>{a.canal}</span>
                <span className="badge badge-yellow" style={{ fontSize: '.62rem' }}>etapa {a.tentativa || 1}</span>
              </div>
            ))
          }
        </div>
      )}

      {tab === 'config' && (
        <div style={{ position: 'sticky', bottom: 16, display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}
            style={{ padding: '10px 28px', fontSize: '.88rem', boxShadow: '0 4px 20px rgba(0,0,0,.4)' }}>
            {saving ? 'Salvando...' : 'Salvar configuracoes'}
          </button>
        </div>
      )}
    </div>
  );
}
