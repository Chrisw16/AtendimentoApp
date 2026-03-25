import React, { useState, useEffect, useCallback, useRef } from 'react';

const api = (path, opts = {}) =>
  fetch('/admin' + path, {
    headers: { 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('maxxi_token') || '', ...(opts.headers || {}) },
    ...opts,
  }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`); return d; });

const QUALIDADE_COR   = { otimo: '#00c896', bom: '#3ecfff', fraco: '#f5c518', critico: '#ff4757', desconhecido: 'rgba(255,255,255,.18)' };
const QUALIDADE_LABEL = { otimo: 'Ótimo', bom: 'Bom', fraco: 'Fraco', critico: 'Crítico', desconhecido: '—' };

function tempoDesde(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function formatUptime(seg) {
  if (!seg) return '—';
  const d = Math.floor(seg / 86400), h = Math.floor((seg % 86400) / 3600), m = Math.floor((seg % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function SinalBadge({ qualidade, rx }) {
  const cor = QUALIDADE_COR[qualidade] || QUALIDADE_COR.desconhecido;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, background: `${cor}16`, border: `1px solid ${cor}44`, fontSize: 11, fontWeight: 700, color: cor }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cor, flexShrink: 0 }} />
      {rx !== null && rx !== undefined ? `${rx} dBm` : QUALIDADE_LABEL[qualidade] || '—'}
    </span>
  );
}

function StatusWAN({ status }) {
  const online = status === 'Connected';
  const cor = online ? '#00c896' : status ? '#ff4757' : 'rgba(255,255,255,.2)';
  return (
    <span style={{ color: cor, fontSize: 11, fontWeight: 700 }}>
      {status || '—'}
    </span>
  );
}

// ── Modal detalhe do dispositivo ─────────────────────────────────────────────
function ModalDevice({ device, onClose }) {
  const [aba, setAba] = useState('info');
  const [params, setParams] = useState([]);
  const [events, setEvents] = useState([]);
  const [comandos, setComandos] = useState([]);
  const [auditoria, setAuditoria] = useState([]);
  const [wifiForm, setWifiForm] = useState({ ssid: device.ssid_24 || '', senha: '', banda: '2.4' });
  const [loadingCmd, setLoadingCmd] = useState(null);
  const [msgCmd, setMsgCmd] = useState(null);

  useEffect(() => {
    api(`/api/acs/devices/${device.id}/params`).then(setParams).catch(() => {});
    api(`/api/acs/devices/${device.id}/events`).then(setEvents).catch(() => {});
    api(`/api/acs/devices/${device.id}/comandos`).then(setComandos).catch(() => {});
    api(`/api/acs/devices/${device.id}/auditoria`).then(setAuditoria).catch(() => {});
  }, [device.id]);

  const executarCmd = async (endpoint, body = {}, label) => {
    if (!confirm(`Confirmar: ${label}?`)) return;
    setLoadingCmd(label); setMsgCmd(null);
    try {
      const r = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });
      setMsgCmd({ ok: true, text: r.mensagem });
      api(`/api/acs/devices/${device.id}/comandos`).then(setComandos).catch(() => {});
    } catch (e) { setMsgCmd({ ok: false, text: e.message }); }
    setLoadingCmd(null);
  };

  const cor = QUALIDADE_COR[device.qualidade_sinal] || QUALIDADE_COR.desconhecido;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#071820', border: '1px solid rgba(62,207,255,.15)', borderRadius: 14, width: '100%', maxWidth: 780, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{device.model || device.product_class || 'Dispositivo'}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 2, fontFamily: 'monospace' }}>
              S/N: {device.serial} · {device.ip || '—'} · último inform: {tempoDesde(device.ultimo_inform)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SinalBadge qualidade={device.qualidade_sinal} rx={device.sinal_rx} />
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '10px 16px 0', borderBottom: '1px solid rgba(255,255,255,.06)', flexShrink: 0 }}>
          {[['info', 'Info'], ['wifi', 'Wi-Fi'], ['comandos', 'Comandos'], ['params', 'Parâmetros'], ['eventos', 'Eventos']].map(([id, label]) => (
            <button key={id} onClick={() => setAba(id)} style={{
              padding: '6px 14px', borderRadius: '6px 6px 0 0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              border: '1px solid', borderBottom: 'none',
              background: aba === id ? 'rgba(62,207,255,.1)' : 'transparent',
              borderColor: aba === id ? 'rgba(62,207,255,.25)' : 'transparent',
              color: aba === id ? '#3ecfff' : 'rgba(255,255,255,.3)',
            }}>{label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>

          {msgCmd && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 7, background: msgCmd.ok ? 'rgba(0,200,150,.08)' : 'rgba(255,71,87,.08)', border: `1px solid ${msgCmd.ok ? 'rgba(0,200,150,.2)' : 'rgba(255,71,87,.2)'}`, color: msgCmd.ok ? '#00c896' : '#ff4757', fontSize: 12 }}>
              {msgCmd.ok ? '✅ ' : '❌ '}{msgCmd.text}
            </div>
          )}

          {/* ── ABA INFO ── */}
          {aba === 'info' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 9, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', marginBottom: 10 }}>Dispositivo</div>
                {[
                  ['Fabricante', device.manufacturer || '—'],
                  ['Modelo', device.model || '—'],
                  ['Serial', device.serial],
                  ['Firmware', device.firmware || '—'],
                  ['Hardware', device.hardware_ver || '—'],
                  ['Uptime', formatUptime(device.uptime_seg)],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.04)', fontSize: 12 }}>
                    <span style={{ color: 'rgba(255,255,255,.35)' }}>{l}</span>
                    <span style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: 11 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 9, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', marginBottom: 10 }}>WAN / Conexão</div>
                {[
                  ['Status WAN', <StatusWAN status={device.wan_status} />],
                  ['IP WAN', device.ip_wan || '—'],
                  ['PPPoE', device.pppoe_user || '—'],
                  ['Uptime WAN', formatUptime(device.wan_uptime)],
                  ['IP (ACS)', device.ip || '—'],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.04)', fontSize: 12 }}>
                    <span style={{ color: 'rgba(255,255,255,.35)' }}>{l}</span>
                    <span style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: 11 }}>{v}</span>
                  </div>
                ))}
              </div>
              {/* Sinal óptico */}
              <div style={{ gridColumn: '1/-1', background: 'rgba(255,255,255,.03)', borderRadius: 9, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', marginBottom: 10 }}>Sinal Óptico GPON</div>
                {device.sinal_rx !== null && device.sinal_rx !== undefined ? (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>Rx:</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cor, fontFamily: 'monospace' }}>{device.sinal_rx} dBm</span>
                      {device.sinal_tx && <><span style={{ color: 'rgba(255,255,255,.2)' }}>·</span><span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>Tx:</span><span style={{ fontSize: 13, fontWeight: 700, color: '#3ecfff', fontFamily: 'monospace' }}>{device.sinal_tx} dBm</span></>}
                    </div>
                    <div style={{ height: 8, background: 'rgba(255,255,255,.07)', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
                      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, ((device.sinal_rx + 30) / 14) * 100))}%`, background: cor, borderRadius: 4 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,.2)' }}>
                      <span>-30 dBm (crítico)</span><span>-16 dBm (ótimo)</span>
                    </div>
                    {(device.qualidade_sinal === 'critico' || device.qualidade_sinal === 'fraco') && (
                      <div style={{ marginTop: 10, padding: '7px 10px', background: 'rgba(255,71,87,.08)', border: '1px solid rgba(255,71,87,.2)', borderRadius: 6, fontSize: 11, color: '#ff4757' }}>
                        ⚠️ Sinal abaixo do limite — verificar caixa de distribuição óptica.
                      </div>
                    )}
                  </>
                ) : <div style={{ color: 'rgba(255,255,255,.2)', fontSize: 12 }}>Sinal óptico não reportado por este dispositivo.</div>}
              </div>
              {/* Ações rápidas */}
              <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
                <button disabled={!!loadingCmd} onClick={() => executarCmd(`/api/acs/devices/${device.id}/reboot`, {}, 'Reiniciar ONU remotamente')}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: 'rgba(255,71,87,.1)', border: '1px solid rgba(255,71,87,.25)', color: '#ff4757', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {loadingCmd === 'Reiniciar ONU remotamente' ? '⟳ Enfileirando...' : '🔄 Reboot ONU'}
                </button>
                <button disabled={!!loadingCmd} onClick={() => executarCmd(`/api/acs/devices/${device.id}/refresh`, {}, 'Atualizar parâmetros')}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: 'rgba(62,207,255,.08)', border: '1px solid rgba(62,207,255,.2)', color: '#3ecfff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {loadingCmd === 'Atualizar parâmetros' ? '⟳ Enfileirando...' : '🔃 Atualizar params'}
                </button>
              </div>
            </div>
          )}

          {/* ── ABA Wi-Fi ── */}
          {aba === 'wifi' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[{ banda: '2.4', ssid: device.ssid_24, pass: device.wifi_pass_24, canal: device.channel_24, status: device.wifi_status_24, clientes: device.clients_24 },
                { banda: '5', ssid: device.ssid_5, pass: device.wifi_pass_5, canal: device.channel_5, status: device.wifi_status_5 }].map(w => (
                <div key={w.banda} style={{ background: 'rgba(255,255,255,.03)', borderRadius: 9, padding: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', marginBottom: 10 }}>{w.banda} GHz</div>
                  {[['SSID', w.ssid || '—'], ['Senha', w.pass || '—'], ['Canal', w.canal || '—'], ['Status', w.status || '—'], ...(w.clientes != null ? [['Clientes', w.clientes]] : [])].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.04)', fontSize: 12 }}>
                      <span style={{ color: 'rgba(255,255,255,.35)' }}>{l}</span>
                      <span style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: 11 }}>{v}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ gridColumn: '1/-1', background: 'rgba(255,255,255,.03)', borderRadius: 9, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', marginBottom: 12 }}>Alterar Wi-Fi via ACS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input placeholder="SSID" value={wifiForm.ssid} onChange={e => setWifiForm(f => ({ ...f, ssid: e.target.value }))}
                    style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, padding: '8px 10px', color: '#fff', fontSize: 12, outline: 'none' }} />
                  <input type="password" placeholder="Senha (mín. 8 chars)" value={wifiForm.senha} onChange={e => setWifiForm(f => ({ ...f, senha: e.target.value }))}
                    style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, padding: '8px 10px', color: '#fff', fontSize: 12, outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={wifiForm.banda} onChange={e => setWifiForm(f => ({ ...f, banda: e.target.value }))}
                    style={{ background: 'rgba(2,15,25,.9)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, padding: '8px 10px', color: '#fff', fontSize: 12, outline: 'none' }}>
                    <option value="2.4">2.4 GHz</option>
                    <option value="5">5 GHz</option>
                  </select>
                  <button disabled={!!loadingCmd} onClick={() => executarCmd(`/api/acs/devices/${device.id}/setwifi`, wifiForm, 'Configurar Wi-Fi')}
                    style={{ flex: 1, padding: '8px', borderRadius: 7, background: 'rgba(167,139,250,.12)', border: '1px solid rgba(167,139,250,.25)', color: '#a78bfa', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {loadingCmd === 'Configurar Wi-Fi' ? '⟳ Enfileirando...' : '💾 Aplicar (enfileirar)'}
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,.2)' }}>
                  O comando será enviado no próximo Inform do CPE (~intervalo periódico configurado na ONU).
                </div>
              </div>
            </div>
          )}

          {/* ── ABA COMANDOS ── */}
          {aba === 'comandos' && (
            <div>
              {comandos.length === 0 ? <div style={{ color: 'rgba(255,255,255,.2)', fontSize: 12 }}>Nenhum comando registrado.</div> : (
                comandos.map((c, i) => {
                  const statusCor = c.status === 'concluido' ? '#00c896' : c.status === 'enviado' ? '#f5c518' : c.status === 'pendente' ? '#3ecfff' : '#ff4757';
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', background: 'rgba(255,255,255,.03)', borderRadius: 7, marginBottom: 6, fontSize: 11 }}>
                      <span style={{ color: statusCor, flexShrink: 0, fontFamily: 'monospace', fontSize: 10, minWidth: 70 }}>{c.status}</span>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{c.tipo}</span>
                        <span style={{ color: 'rgba(255,255,255,.25)', marginLeft: 8 }}>por {c.solicitante}</span>
                      </div>
                      <span style={{ color: 'rgba(255,255,255,.2)', fontFamily: 'monospace', fontSize: 10 }}>{new Date(c.criado_em).toLocaleString('pt-BR')}</span>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── ABA PARAMS ── */}
          {aba === 'params' && (
            <div style={{ fontSize: 11, fontFamily: 'monospace' }}>
              {params.length === 0 ? <div style={{ color: 'rgba(255,255,255,.2)' }}>Nenhum parâmetro registrado ainda.</div> : (
                params.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                    <span style={{ color: '#3ecfff', flex: '0 0 55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                    <span style={{ color: 'rgba(255,255,255,.6)', flex: 1 }}>{p.valor || '—'}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── ABA EVENTOS ── */}
          {aba === 'eventos' && (
            <div>
              {events.length === 0 ? <div style={{ color: 'rgba(255,255,255,.2)', fontSize: 12 }}>Nenhum evento registrado.</div> : (
                events.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 10px', background: 'rgba(255,255,255,.03)', borderRadius: 6, marginBottom: 5, fontSize: 11 }}>
                    <span style={{ fontWeight: 700, color: e.evento === '0 BOOTSTRAP' ? '#f5c518' : e.evento === '1 BOOT' ? '#3ecfff' : '#00c896' }}>{e.evento}</span>
                    <span style={{ color: 'rgba(255,255,255,.25)', fontFamily: 'monospace' }}>{e.ip}</span>
                    <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,.2)', fontFamily: 'monospace', fontSize: 10 }}>{new Date(e.criado_em).toLocaleString('pt-BR')}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function DispositivosCPE() {
  const [devices, setDevices] = useState([]);
  const [stats, setStats] = useState(null);
  const [acsInfo, setAcsInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState({ serial: '', modelo: '', qualidade: '' });
  const [selecionado, setSelecionado] = useState(null);
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const timerRef = useRef(null);

  const carregar = useCallback(async () => {
    const q = new URLSearchParams();
    if (filtro.serial) q.set('serial', filtro.serial);
    if (filtro.modelo) q.set('modelo', filtro.modelo);
    if (filtro.qualidade) q.set('qualidade', filtro.qualidade);
    try {
      const [devs, st] = await Promise.all([
        api('/api/acs/devices?' + q.toString()),
        api('/api/acs/stats'),
      ]);
      setDevices(Array.isArray(devs) ? devs : []);
      setStats(st);
    } catch {}
    setLoading(false);
  }, [filtro]);

  useEffect(() => {
    carregar();
    api('/api/acs/info').then(setAcsInfo).catch(() => {});
  }, [carregar]);

  useEffect(() => {
    timerRef.current = setInterval(carregar, 30000);
    return () => clearInterval(timerRef.current);
  }, [carregar]);

  // Monta a URL do ACS baseada na URL atual do admin
  const acsUrl = acsInfo?.url_cwmp || `${window.location.protocol}//${window.location.hostname}/cwmp`;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Servidor ACS — TR-069</h1>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 3 }}>
            ONUs conectam em <code style={{ color: '#3ecfff' }}>{acsUrl}</code> · protocolo CWMP
          </div>
        </div>
        <button onClick={carregar} style={{ padding: '7px 13px', borderRadius: 7, background: 'rgba(62,207,255,.08)', border: '1px solid rgba(62,207,255,.2)', color: '#3ecfff', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>⟳ Atualizar</button>
      </div>

      {/* Card configuração ACS */}
      {acsInfo && (
        <div style={{ background: 'rgba(2,35,45,.9)', border: '1px solid rgba(62,207,255,.18)', borderRadius: 10, padding: '14px 18px', marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: acsInfo.url_direct ? 12 : 0 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>ACS URL (recomendada)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <code style={{ fontSize: 11, color: '#3ecfff', background: 'rgba(62,207,255,.08)', padding: '4px 8px', borderRadius: 5, wordBreak: 'break-all' }}>{acsUrl}</code>
                <button onClick={() => navigator.clipboard.writeText(acsUrl)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', cursor: 'pointer', fontSize: 13, padding: 2 }} title="Copiar">⎘</button>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Usuário</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <code style={{ fontSize: 13, color: '#00c896', background: 'rgba(0,200,150,.08)', padding: '4px 10px', borderRadius: 5, fontWeight: 700 }}>{acsInfo.user || '—'}</code>
                <button onClick={() => navigator.clipboard.writeText(acsInfo.user)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', cursor: 'pointer', fontSize: 13, padding: 2 }} title="Copiar">⎘</button>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Senha</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <code style={{ fontSize: 13, color: '#a78bfa', background: 'rgba(167,139,250,.08)', padding: '4px 10px', borderRadius: 5, fontWeight: 700 }}>
                  {senhaVisivel ? acsInfo.pass : '••••••••'}
                </code>
                <button onClick={() => setSenhaVisivel(v => !v)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', cursor: 'pointer', fontSize: 12, padding: 2 }}>{senhaVisivel ? '🙈' : '👁'}</button>
                <button onClick={() => navigator.clipboard.writeText(acsInfo.pass)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', cursor: 'pointer', fontSize: 13, padding: 2 }} title="Copiar">⎘</button>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.2)', borderTop: '1px solid rgba(255,255,255,.05)', paddingTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#f5c518' }}>⚡</span>
            <span>Use <code style={{ color: '#3ecfff' }}>{acsUrl}</code> nas ONUs — funciona via HTTPS pela porta 443, sem bloqueio de CGNAT.</span>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total', valor: stats.total, cor: '#e2e8f0' },
            { label: 'Online (5min)', valor: stats.online_5min, cor: '#00c896' },
            { label: 'Online (1h)', valor: stats.online_1h, cor: '#3ecfff' },
            { label: 'Sinal crítico', valor: stats.sinal_critico, cor: '#ff4757' },
            { label: 'Sinal fraco', valor: stats.sinal_fraco, cor: '#f5c518' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(2,35,45,.8)', border: `1px solid ${s.cor}22`, borderRadius: 9, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.cor, lineHeight: 1 }}>{s.valor ?? '—'}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input placeholder="Filtrar por serial..." value={filtro.serial} onChange={e => setFiltro(f => ({ ...f, serial: e.target.value }))}
          style={{ flex: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, padding: '8px 12px', color: '#fff', fontSize: 12, outline: 'none' }} />
        <input placeholder="Modelo..." value={filtro.modelo} onChange={e => setFiltro(f => ({ ...f, modelo: e.target.value }))}
          style={{ flex: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, padding: '8px 12px', color: '#fff', fontSize: 12, outline: 'none' }} />
        <select value={filtro.qualidade} onChange={e => setFiltro(f => ({ ...f, qualidade: e.target.value }))}
          style={{ background: 'rgba(2,15,25,.9)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, padding: '8px 12px', color: '#fff', fontSize: 12, outline: 'none' }}>
          <option value="">Todos os sinais</option>
          <option value="otimo">Ótimo</option>
          <option value="bom">Bom</option>
          <option value="fraco">Fraco</option>
          <option value="critico">Crítico</option>
          <option value="desconhecido">Desconhecido</option>
        </select>
      </div>

      {/* Tabela */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,.2)' }}>⟳ Carregando...</div>
      ) : devices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,.15)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,.25)' }}>Nenhuma ONU conectada ainda</div>
          <div style={{ fontSize: 11, marginTop: 10, color: 'rgba(255,255,255,.2)', lineHeight: 2 }}>
            Configure nas ONUs:<br />
            <code style={{ color: '#3ecfff' }}>ACS URL: {acsUrl}</code><br />
            <code style={{ color: '#00c896' }}>User: {acsInfo?.user || '{ACS_USER}'}</code>
            {' · '}
            <code style={{ color: '#a78bfa' }}>Pass: {acsInfo?.pass || '{ACS_PASS}'}</code>
          </div>
        </div>
      ) : (
        <div style={{ background: 'rgba(2,35,45,.6)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                {['Dispositivo', 'Serial / IP', 'Sinal óptico', 'WAN', 'Wi-Fi 2.4GHz', 'Último inform', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', color: 'rgba(255,255,255,.35)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', textAlign: 'left', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,.04)', cursor: 'pointer' }} onClick={() => setSelecionado(d)}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 700, color: '#e2e8f0' }}>{d.model || d.product_class || '—'}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 1 }}>{d.manufacturer || '—'} · fw {d.firmware || '—'}</div>
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.6)' }}>
                    <div>{d.serial}</div>
                    <div style={{ color: 'rgba(255,255,255,.25)', fontSize: 10 }}>{d.ip || '—'}</div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <SinalBadge qualidade={d.qualidade_sinal} rx={d.sinal_rx} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <StatusWAN status={d.wan_status} />
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.25)', marginTop: 1, fontFamily: 'monospace' }}>{d.ip_wan || ''}</div>
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                    {d.ssid_24 || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,.3)', fontSize: 11, fontFamily: 'monospace' }}>
                    {tempoDesde(d.ultimo_inform)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={e => { e.stopPropagation(); setSelecionado(d); }}
                      style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(62,207,255,.08)', border: '1px solid rgba(62,207,255,.18)', color: '#3ecfff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                      Ver →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 16, padding: '9px 13px', background: 'rgba(62,207,255,.03)', border: '1px solid rgba(62,207,255,.1)', borderRadius: 7, fontSize: 11, color: 'rgba(255,255,255,.3)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: '#3ecfff' }}>🤖</span>
        Agente Maxxi consulta o ACS automaticamente via ferramentas <code style={{ color: '#3ecfff' }}>consultar_onu</code>, <code style={{ color: '#3ecfff' }}>reiniciar_onu_acs</code> durante atendimentos técnicos.
      </div>

      {selecionado && <ModalDevice device={selecionado} onClose={() => setSelecionado(null)} />}
    </div>
  );
}
