import React, { useState, useEffect, useCallback } from 'react';

function apiFetch(path, options = {}) {
  const base = window.location.origin + '/admin';
  const token = localStorage.getItem('maxxi_token') || '';
  return fetch(base + path, {
    ...options,
    headers: { 'x-admin-token': token, 'Content-Type': 'application/json', ...(options.headers||{}) },
  }).then(r => r.json());
}

const STATUS_MAP = {
  enviado:          { label: 'Enviado',         cor: '#00c896', bg: 'rgba(0,200,150,.12)'  },
  enviado_template: { label: 'Template',        cor: '#3ecfff', bg: 'rgba(62,207,255,.12)' },
  fora_janela:      { label: 'Fora da janela',  cor: '#f5c518', bg: 'rgba(245,197,24,.12)' },
  erro:             { label: 'Erro',            cor: '#ff4757', bg: 'rgba(255,71,87,.12)'  },
  token_invalido:   { label: 'Token inválido',  cor: '#ff6b35', bg: 'rgba(255,107,53,.12)' },
};

function Badge({ status }) {
  const s = STATUS_MAP[status] || { label: status || '?', cor: 'rgba(255,255,255,.4)', bg: 'rgba(255,255,255,.07)' };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      color: s.cor, background: s.bg, border: `1px solid ${s.cor}33`, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function fmtTempo(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60)    return `${s}s atrás`;
  if (s < 3600)  return `${Math.floor(s / 60)}min atrás`;
  if (s < 86400) return `${Math.floor(s / 3600)}h atrás`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function GatewaySMS() {
  const [rows, setRows]     = useState([]);
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]     = useState(null);
  const [busca, setBusca]   = useState('');
  const [filtro, setFiltro] = useState('');
  const [total, setTotal]   = useState(0);
  const [exp, setExp]       = useState(null);

  const [config, setConfig]       = useState({ template: '', force: true });
  const [salvandoCfg, setSalvandoCfg] = useState(false);
  const [msgCfg, setMsgCfg]       = useState('');
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    apiFetch('/api/gateway/sms/config').then(d => { if (!d?.error) setConfig(d); }).catch(()=>{});
    apiFetch('/api/wa/templates').then(d => { if (Array.isArray(d)) setTemplates(d.filter(t=>t.status==='APPROVED')); }).catch(()=>{});
  }, []);

  const salvarConfig = async () => {
    setSalvandoCfg(true); setMsgCfg('');
    const r = await apiFetch('/api/gateway/sms/config', { method:'PUT', body: JSON.stringify(config) });
    setMsgCfg(r.ok ? '✅ Configuração salva!' : '❌ ' + (r.error||'Erro'));
    setSalvandoCfg(false);
    setTimeout(() => setMsgCfg(''), 3000);
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const q = new URLSearchParams({ limite: 100 });
      if (busca)  q.set('busca', busca);
      if (filtro) q.set('status', filtro);
      const [data, st] = await Promise.all([
        apiFetch('/api/gateway/sms?' + q.toString()),
        apiFetch('/api/gateway/sms/stats'),
      ]);
      if (data?.error) throw new Error(data.error);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setTotal(data?.total || 0);
      setStats(st?.error ? null : st);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [busca, filtro]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { const t = setInterval(carregar, 15000); return () => clearInterval(t); }, [carregar]);

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Gateway SMS — SGP → WhatsApp</h1>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 3 }}>Mensagens recebidas do SGP e enviadas via WhatsApp Cloud API</div>
        </div>
        <button onClick={carregar} disabled={loading} style={{ padding: '7px 14px', borderRadius: 7, background: 'rgba(62,207,255,.08)', border: '1px solid rgba(62,207,255,.2)', color: '#3ecfff', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
          {loading ? '...' : '⟳ Atualizar'}
        </button>
      </div>

      {erro && <div style={{ padding: '10px 14px', background: 'rgba(255,71,87,.08)', border: '1px solid rgba(255,71,87,.2)', borderRadius: 8, color: '#ff4757', fontSize: 12, marginBottom: 16 }}>❌ {erro}</div>}

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total',          val: stats.total,       cor: '#e2e8f0' },
            { label: 'Últimas 24h',    val: stats.ultimas_24h, cor: '#3ecfff' },
            { label: 'Enviados',       val: stats.enviados,    cor: '#00c896' },
            { label: 'Templates',      val: stats.templates,   cor: '#a78bfa' },
            { label: 'Fora da janela', val: stats.fora_janela, cor: '#f5c518' },
            { label: 'Erros', val: parseInt(stats.erros||0)+parseInt(stats.token_invalido||0), cor: '#ff4757' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(2,35,45,.8)', border: `1px solid ${s.cor}22`, borderRadius: 9, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.cor, lineHeight: 1 }}>{s.val ?? 0}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key==='Enter'&&carregar()}
          placeholder="Buscar por número ou mensagem..."
          style={{ flex: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, padding: '8px 12px', color: '#fff', fontSize: 12, outline: 'none' }} />
        <select value={filtro} onChange={e => setFiltro(e.target.value)}
          style={{ background: 'rgba(2,15,25,.95)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, padding: '8px 12px', color: '#fff', fontSize: 12, outline: 'none' }}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading && rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,.2)' }}>Carregando...</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,.2)' }}>Nenhuma mensagem registrada</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.12)', marginTop: 8 }}>
            Configure o SGP com <code style={{ color: '#3ecfff' }}>https://maxxi.citmax.com.br/gateway/sms</code>
          </div>
        </div>
      ) : (
        <div style={{ background: 'rgba(2,35,45,.6)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 110px 1fr 120px 100px', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: 10, color: 'rgba(255,255,255,.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', gap: 8 }}>
            <span>Número</span><span>Canal</span><span>Mensagem</span><span>Status</span><span style={{textAlign:'right'}}>Quando</span>
          </div>
          {rows.map(row => (
            <div key={row.id}>
              <div onClick={() => setExp(exp===row.id?null:row.id)}
                style={{ display: 'grid', gridTemplateColumns: '140px 110px 1fr 120px 100px', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,.04)', cursor: 'pointer', alignItems: 'center', gap: 8, background: exp===row.id?'rgba(62,207,255,.04)':'transparent' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#e2e8f0' }}>{row.numero?`+${row.numero}`:row.recipient||'—'}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.campaign||row.channel||'—'}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.body||'—'}</div>
                <Badge status={row.status} />
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontFamily: 'monospace', textAlign: 'right' }}>{fmtTempo(row.criado_em)}</div>
              </div>
              {exp === row.id && (
                <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,.25)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 10 }}>
                    {[
                      ['Destinatário', row.recipient||'—'],
                      ['Número', row.numero?`+${row.numero}`:'—'],
                      ['Canal', row.channel||'—'],
                      ['Campanha', row.campaign||'—'],
                      ['Janela 24h', row.na_janela===true?'✅ Dentro':row.na_janela===false?'❌ Fora':'—'],
                      ['Data/hora', row.criado_em?new Date(row.criado_em).toLocaleString('pt-BR'):'—'],
                    ].map(([l,v]) => (
                      <div key={l} style={{ background: 'rgba(255,255,255,.03)', borderRadius: 7, padding: '8px 10px' }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.25)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{l}</div>
                        <div style={{ fontSize: 12, color: '#e2e8f0', fontFamily: 'monospace', wordBreak: 'break-all' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 7, padding: '10px 12px' }}>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,.25)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Mensagem completa</div>
                    <div style={{ fontSize: 12, color: '#e2e8f0', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{row.body||'—'}</div>
                  </div>
                  {row.erro && <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(255,71,87,.08)', border: '1px solid rgba(255,71,87,.2)', borderRadius: 7, fontSize: 11, color: '#ff4757' }}>❌ {row.erro}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {total > rows.length && <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,.25)' }}>Exibindo {rows.length} de {total} registros</div>}

      {/* Configuração do Gateway */}
      <div style={{ marginTop: 20, padding: '16px 18px', background: 'rgba(2,35,45,.7)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: '#e2e8f0' }}>⚙️ Configuração do Gateway</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', display: 'block', marginBottom: 5 }}>Template para fora da janela 24h</label>
            <select value={config.template} onChange={e => setConfig(c => ({...c, template: e.target.value}))}
              style={{ width: '100%', background: 'rgba(2,15,25,.95)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 7, padding: '8px 10px', color: '#fff', fontSize: 12, outline: 'none' }}>
              <option value="">— Nenhum —</option>
              {templates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.2)', marginTop: 4 }}>
              Apenas templates aprovados pela Meta. Gerencie em <a href="/admin/wa-templates" style={{ color: '#3ecfff' }}>WA Templates</a>.
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', display: 'block', marginBottom: 8 }}>Modo de envio fora da janela</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,.7)' }}>
                <input type="radio" checked={config.force === true} onChange={() => setConfig(c=>({...c,force:true}))} />
                Enviar como texto livre (ignora janela)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,.7)' }}>
                <input type="radio" checked={config.force === false} onChange={() => setConfig(c=>({...c,force:false}))} />
                Usar template selecionado
              </label>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={salvarConfig} disabled={salvandoCfg}
            style={{ padding: '8px 18px', borderRadius: 7, background: 'rgba(0,200,150,.12)', border: '1px solid rgba(0,200,150,.3)', color: '#00c896', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>
            {salvandoCfg ? 'Salvando...' : '💾 Salvar configuração'}
          </button>
          {msgCfg && <span style={{ fontSize: 12, color: msgCfg.startsWith('✅') ? '#00c896' : '#ff4757' }}>{msgCfg}</span>}
        </div>
      </div>

      <div style={{ marginTop: 16, padding: '9px 14px', background: 'rgba(62,207,255,.03)', border: '1px solid rgba(62,207,255,.1)', borderRadius: 7, fontSize: 11, color: 'rgba(255,255,255,.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>📲</span>
        <span>Endpoint: <code style={{color:'#3ecfff'}}>POST https://maxxi.citmax.com.br/gateway/sms</code></span>
        <span style={{marginLeft:'auto'}}>Token: <code style={{color:'#a78bfa'}}>citmax2026sms</code></span>
      </div>
    </div>
  );
}

// Exportação alternativa com config panel integrado - substituída pelo componente principal
