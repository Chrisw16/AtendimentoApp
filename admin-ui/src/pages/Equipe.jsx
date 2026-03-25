import React, { useEffect, useState, useCallback, useRef } from 'react';
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

function StatusBadge({ state }) {
  const map = {
    open: { color: 'var(--g1)', label: '🟢 Conectado' },
    close: { color: 'var(--red)', label: '🔴 Desconectado' },
    connecting: { color: 'var(--yellow)', label: '🟡 Conectando' },
    unknown: { color: 'var(--muted)', label: '⚪ Desconhecido' },
  };
  const s = map[state] || map.unknown;
  return <span style={{ fontSize: '.78rem', color: s.color, fontWeight: 600 }}>{s.label}</span>;
}

const CATS = { atendente: '👤 Atendente', tecnico: '🔧 Técnico', supervisor: '👁️ Supervisor', admin: '👑 Admin' };

function AgentesWhatsApp() {
  const [agentes, setAgentes] = React.useState([]);
  React.useEffect(() => {
    fetch(window.location.origin + '/admin/api/agentes', {
      headers: { 'x-admin-token': localStorage.getItem('maxxi_token') || '' }
    }).then(r => r.json()).then(d => setAgentes(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const comWA = agentes.filter(a => a.whatsapp);
  const semWA = agentes.filter(a => !a.whatsapp && a.ativo);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
        📱 Agentes com WhatsApp cadastrado
      </div>
      {comWA.length === 0 ? (
        <div style={{ fontSize: '.75rem', color: 'var(--dim)', padding: '8px 0' }}>Nenhum agente com WhatsApp ainda.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {comWA.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(3,45,61,.5)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <span style={{ fontSize: '1rem' }}>{a.avatar || '🧑'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.82rem', fontWeight: 600 }}>{a.nome}</div>
                <div style={{ fontSize: '.68rem', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace" }}>{a.whatsapp}</div>
              </div>
              <span style={{ fontSize: '.65rem', padding: '2px 8px', borderRadius: 4, background: 'rgba(0,200,150,.1)', color: 'var(--g1)', fontWeight: 600 }}>
                {CATS[a.categoria] || '👤 Atendente'}
              </span>
            </div>
          ))}
        </div>
      )}
      {semWA.length > 0 && (
        <div style={{ fontSize: '.72rem', color: 'var(--dim)', marginTop: 4 }}>
          ⚠️ Sem WhatsApp: {semWA.map(a => a.nome).join(', ')} — <a href="/admin/agentes" style={{ color: 'var(--g1)' }}>cadastrar agora</a>
        </div>
      )}
    </div>
  );
}

export default function Equipe() {
  const [tab, setTab] = useState('instancia');
  const [instancias, setInstancias] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [novoNome, setNovoNome] = useState('maxxi-equipe');
  const [qrData, setQrData] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [statusMap, setStatusMap] = useState({});
  const showToast = useStore(s => s.showToast);
  const sseRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inst, cfg] = await Promise.all([
        apiJson('/api/equipe/instancias').catch(() => []),
        apiJson('/api/equipe/config').catch(() => ({})),
      ]);
      setInstancias(Array.isArray(inst) ? inst : []);
      setConfig(cfg || {});
      // Busca status de cada instância (estrutura normalizada)
      for (const i of (Array.isArray(inst) ? inst : [])) {
        const nome = i.instanceName || i.name;
        if (nome) {
          apiJson(`/api/equipe/status/${nome}`).then(s => {
            setStatusMap(prev => ({ ...prev, [nome]: s?.state || 'unknown' }));
          }).catch(() => {});
        }
      }
    } catch(e) { showToast('Erro: ' + e.message, true); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // SSE para receber QR em tempo real
  useEffect(() => {
    const token = localStorage.getItem('maxxi_token');
    const es = new EventSource(`/admin/api/sse?token=${token}`);
    sseRef.current = es;
    es.addEventListener('evolution_status', e => {
      try {
        const d = JSON.parse(e.data);
        if (d.qr) setQrData(d.qr);
        if (d.status) setStatusMap(prev => ({ ...prev, [d.instancia]: d.status }));
        if (d.status === 'open') { setQrData(null); showToast('✅ WhatsApp conectado!'); load(); }
      } catch {}
    });
    es.addEventListener('evolution_grupo', e => {
      try {
        const d = JSON.parse(e.data);
        showToast(`📱 Novo grupo detectado: ${d.nome}`);
        load();
      } catch {}
    });
    return () => es.close();
  }, []);

  const criarInstancia = async () => {
    if (!novoNome.trim()) return;
    setSaving(true);
    try {
      const resp = await fetch(window.location.origin + '/admin/api/equipe/instancia', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': localStorage.getItem('maxxi_token') || '',
        },
        body: JSON.stringify({ nome: novoNome.trim() }),
      });
      const d = await resp.json();
      if (!resp.ok || d.error) {
        showToast('Erro Evolution: ' + (d.error || JSON.stringify(d).slice(0, 150)), true);
        console.error('Evolution criar:', d);
      } else {
        showToast('✅ Instância criada! Clique em Conectar (QR) para escanear.');
        await load();
      }
    } catch(e) {
      showToast('Erro de conexão: ' + e.message, true);
    }
    setSaving(false);
  };

  const conectar = async (nome) => {
    setQrLoading(true); setQrData(null);
    try {
      const r = await apiJson(`/api/equipe/qr/${nome}`);
      if (r.base64 || r.qrcode?.base64) {
        setQrData(r.base64 || r.qrcode?.base64);
      } else {
        showToast('QR gerado — aguardando leitura...');
      }
    } catch(e) { showToast('Erro ao gerar QR: ' + e.message, true); }
    setQrLoading(false);
  };

  const deletar = async (nome) => {
    if (!window.confirm(`Deletar instância "${nome}"? Esta ação é irreversível.`)) return;
    try {
      await api(`/api/equipe/instancia/${nome}`, { method: 'DELETE' });
      showToast('✅ Instância removida');
      load();
    } catch(e) { showToast('Erro: ' + e.message, true); }
  };

  const desconectar = async (nome) => {
    if (!window.confirm('Desconectar o WhatsApp desta instância?')) return;
    try {
      await api(`/api/equipe/desconectar/${nome}`, { method: 'POST' });
      showToast('✅ Desconectado');
      setQrData(null);
      load();
    } catch(e) { showToast('Erro: ' + e.message, true); }
  };

  const salvarConfig = async () => {
    setSaving(true);
    try {
      await api('/api/equipe/config', { method: 'PUT', body: JSON.stringify(config) });
      showToast('✅ Configurações salvas!');
    } catch(e) { showToast('Erro: ' + e.message, true); }
    setSaving(false);
  };

  const toggleGrupo = (id, campo, valor) => {
    const grupos = (config.grupos || []).map(g => g.id === id ? { ...g, [campo]: valor } : g);
    setConfig({ ...config, grupos });
  };

  const num = (v, def) => { const n = parseFloat(v); return isNaN(n) ? def : n; };

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <div className="page-head">
        <div>
          <h1>📱 Maxxi Equipe</h1>
          <p>WhatsApp interno para alertas, IA da equipe e comunicação</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['instancia','📱 Instância'], ['alertas','🔔 Alertas'], ['grupos','👥 Grupos'], ['ia','🤖 IA Equipe']].map(([id, lbl]) => (
            <button key={id} className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab(id)}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* ── INSTÂNCIA ──────────────────────────────────────────────────────── */}
      {tab === 'instancia' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 14 }}>

          {/* Criar nova */}
          <div className="card">
            <div className="card-title">➕ Criar instância</div>
            <Field label="Nome da instância" hint="Ex: maxxi-equipe, citmax-interno">
              <input className="input" value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="maxxi-equipe" />
            </Field>
            <button className="btn btn-primary btn-sm" onClick={criarInstancia} disabled={saving}>
              {saving ? 'Criando...' : '🚀 Criar e configurar'}
            </button>
          </div>

          {/* Instâncias existentes */}
          {instancias.map((inst, i) => {
            const nome = inst.instanceName || inst.name || `inst-${i}`;
            const estado = statusMap[nome] || inst.state || 'unknown';
            return (
              <div key={i} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div className="card-title" style={{ margin: 0 }}>📱 {nome}</div>
                  <StatusBadge state={estado} />
                </div>

                {/* QR Code */}
                {qrData && config.instancia === nome && (
                  <div style={{ textAlign: 'center', marginBottom: 14 }}>
                    <img src={`data:image/png;base64,${qrData.replace(/^data:image\/\w+;base64,/, '')}`}
                      alt="QR Code" style={{ width: 200, height: 200, borderRadius: 8, border: '2px solid var(--g1)' }} />
                    <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 6 }}>
                      Escaneie com o WhatsApp do número interno
                    </div>
                  </div>
                )}

                {/* Botões de teste */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10, padding:'8px 10px', background:'rgba(245,197,24,.05)', border:'1px solid rgba(245,197,24,.1)', borderRadius:8 }}>
                  <div style={{ width:'100%', fontSize:'.65rem', color:'var(--yellow)', fontWeight:700, marginBottom:4 }}>🧪 TESTES</div>
                  <button className="btn btn-outline btn-sm" onClick={async () => {
                    try {
                      const r = await fetch(window.location.origin + '/admin/api/equipe/testar-envio', {
                        method: 'POST', headers: { 'x-admin-token': localStorage.getItem('maxxi_token') || '' }
                      }).then(r => r.json());
                      if (r.ok) showToast('✅ Mensagem enviada! Verifique o WhatsApp.');
                      else showToast('Erro: ' + (r.erro || r.error), true);
                      console.log('Teste envio:', r);
                    } catch(e) { showToast('Erro: ' + e.message, true); }
                  }}>📤 Testar envio</button>
                  <button className="btn btn-outline btn-sm" onClick={async () => {
                    const texto = prompt('Mensagem para simular (ou /stats, /fila):', '/stats');
                    if (!texto) return;
                    try {
                      const r = await fetch(window.location.origin + '/admin/api/equipe/testar-webhook', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('maxxi_token') || '' },
                        body: JSON.stringify({ texto })
                      }).then(r => r.json());
                      if (r.ok) showToast('✅ Webhook simulado! Verifique os logs e o WhatsApp do grupo.');
                      else showToast('Erro: ' + (r.erro || r.error), true);
                      console.log('Teste webhook:', r);
                    } catch(e) { showToast('Erro: ' + e.message, true); }
                  }}>🔄 Simular mensagem</button>
                  <button className="btn btn-outline btn-sm" onClick={async () => {
                    try {
                      const r = await fetch(window.location.origin + '/admin/api/equipe/polling', {
                        method: 'POST', headers: { 'x-admin-token': localStorage.getItem('maxxi_token') || '' }
                      }).then(r => r.json());
                      alert('Polling result:\n' + JSON.stringify(r, null, 2).slice(0, 800));
                    } catch(e) { showToast('Erro: ' + e.message, true); }
                  }}>📥 Polling manual</button>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {estado !== 'open' ? (
                    <button className="btn btn-primary btn-sm" onClick={() => { setConfig(p => ({...p, instancia: nome})); conectar(nome); }} disabled={qrLoading}>
                      {qrLoading ? '⏳ Gerando QR...' : '📷 Conectar (QR)'}
                    </button>
                  ) : (
                    <button className="btn btn-outline btn-sm" onClick={() => desconectar(nome)}>
                      🔌 Desconectar
                    </button>
                  )}
                  <button className="btn btn-outline btn-sm" title="Verificar e reconfigurar webhook" onClick={async () => {
                    const token = localStorage.getItem('maxxi_token') || '';
                    try {
                      // Primeiro verifica webhook atual
                      const rv = await fetch(window.location.origin + `/admin/api/equipe/webhook/${nome}`, {
                        headers: { 'x-admin-token': token },
                      }).then(r => r.json()).catch(() => ({}));
                      const urlAtual = rv?.webhook?.url || rv?.webhook?.webhook?.url || '(não configurado)';

                      // Reconfigura
                      const r = await fetch(window.location.origin + `/admin/api/equipe/webhook/${nome}`, {
                        method: 'POST',
                        headers: { 'x-admin-token': token },
                      });
                      const d = await r.json();
                      if (d.ok) {
                        alert(`✅ Webhook reconfigurado!

URL anterior: ${urlAtual}
URL nova: ${d.webhookUrl}

Status Evolution: ${JSON.stringify(d.configurado).slice(0,200)}`);
                      } else {
                        alert('Erro ao reconfigurar: ' + JSON.stringify(d).slice(0,300));
                      }
                    } catch(e) { showToast('Erro: ' + e.message, true); }
                  }}>🔗 Webhook</button>
                  <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--red)' }}
                    onClick={() => deletar(nome)}>🗑</button>
                </div>

                {estado === 'open' && (
                  <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(0,200,150,.08)', borderRadius: 6, fontSize: '.75rem', color: 'var(--g1)' }}>
                    ✅ Pronto! Configure os grupos e alertas nas abas acima.
                  </div>
                )}
              </div>
            );
          })}

          {instancias.length === 0 && !loading && (
            <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              <div style={{ marginBottom: 12 }}>Nenhuma instância encontrada.</div>
              <button className="btn btn-outline btn-sm" onClick={async () => {
                try {
                  const r = await apiJson('/api/equipe/debug');
                  alert('Resposta Evolution API:\n' + JSON.stringify(r, null, 2).slice(0, 1000));
                } catch(e) { alert('Erro: ' + e.message); }
              }}>🔍 Diagnóstico Evolution</button>
            </div>
          )}
        </div>
      )}

      {/* ── GRUPOS ─────────────────────────────────────────────────────────── */}
      {tab === 'grupos' && (
        <div className="card">
          <div className="card-title">👥 Grupos detectados</div>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
            Adicione o número WhatsApp interno em um grupo → qualquer mensagem enviada no grupo será detectada automaticamente aqui. Ative <strong>Alertas</strong> para receber notificações de fila e <strong>IA</strong> para a Maxxi responder dúvidas no grupo.
          </div>

          <div style={{ padding: '10px 14px', background: 'rgba(0,200,150,.06)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 8, marginBottom: 16, fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            💡 Os números são gerenciados em <strong>Agentes → Editar → WhatsApp</strong>. Alertas enviados automaticamente por categoria.
          </div>
          <AgentesWhatsApp />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              👥 Grupos detectados
            </div>
            <button className="btn btn-outline btn-sm" onClick={async () => {
              if (!config.instancia) { showToast('Configure a instância primeiro', true); return; }
              try {
                showToast('🔍 Buscando grupos...');
                const r = await apiJson(`/api/equipe/grupos/${config.instancia}`);
                const lista = Array.isArray(r) ? r : [];
                if (lista.length === 0) { showToast('Nenhum grupo encontrado na API', true); return; }
                // Adiciona grupos não cadastrados ainda
                const existentes = new Set((config.grupos || []).map(g => g.id));
                const novos = lista
                  .filter(g => {
                    const id = g.id || g.remoteJid || '';
                    return id.endsWith('@g.us') && !existentes.has(id);
                  })
                  .map(g => ({
                    id: g.id || g.remoteJid,
                    nome: g.subject || g.name || g.id,
                    alertas: false, ia: false,
                    detectado_em: new Date().toISOString()
                  }));
                if (novos.length === 0) { showToast('Todos os grupos já estão cadastrados'); return; }
                setConfig({ ...config, grupos: [...(config.grupos || []), ...novos] });
                showToast(`✅ ${novos.length} grupo(s) importado(s)! Salve para confirmar.`);
              } catch(e) { showToast('Erro: ' + e.message, true); }
            }}>🔄 Buscar grupos da API</button>
          </div>

          {(config.grupos || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              Nenhum grupo detectado ainda.<br />
              <span style={{ fontSize: '.75rem' }}>Adicione o número interno em um grupo e mande qualquer mensagem.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(config.grupos || []).map((g, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'rgba(3,45,61,.5)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{g.nome}</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", marginTop: 2 }}>{g.id}</div>
                    {g.detectado_em && <div style={{ fontSize: '.62rem', color: 'var(--dim)', marginTop: 2 }}>Detectado: {new Date(g.detectado_em).toLocaleDateString('pt-BR')}</div>}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.78rem' }}>
                    <input type="checkbox" checked={!!g.alertas} onChange={e => toggleGrupo(g.id, 'alertas', e.target.checked)}
                      style={{ accentColor: 'var(--yellow)', width: 16, height: 16 }} />
                    🔔 Alertas
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.78rem' }}>
                    <input type="checkbox" checked={!!g.ia} onChange={e => toggleGrupo(g.id, 'ia', e.target.checked)}
                      style={{ accentColor: 'var(--g1)', width: 16, height: 16 }} />
                    🤖 IA responde
                  </label>
                  <button onClick={() => setConfig({ ...config, grupos: config.grupos.filter((_, j) => j !== i) })}
                    style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: '.75rem', padding: '4px 6px' }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <button className="btn btn-primary btn-sm" onClick={salvarConfig} disabled={saving} style={{ marginTop: 16 }}>
            {saving ? 'Salvando...' : '💾 Salvar'}
          </button>
        </div>
      )}

      {/* ── ALERTAS ─────────────────────────────────────────────────────────── */}
      {tab === 'alertas' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14 }}>
          <div className="card">
            <div className="card-title">🔔 Configuração de alertas de fila</div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.85rem', marginBottom: 16 }}>
              <input type="checkbox" checked={!!config.ativo} onChange={e => setConfig({ ...config, ativo: e.target.checked })}
                style={{ accentColor: 'var(--g1)', width: 18, height: 18 }} />
              <span>Alertas <strong>ativos</strong></span>
            </label>

            <div style={{ padding: '10px 12px', background: 'rgba(245,197,24,.06)', border: '1px solid rgba(245,197,24,.15)', borderRadius: 8, fontSize: '.75rem', color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
              ⚠️ Alertas só disparam <strong>dentro do horário de atendimento</strong> configurado em Horário & SLA. Fora do expediente, silêncio total.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="🟡 Alerta amarelo (min)" hint="1ª notificação no grupo">
                <input className="input" type="number" min={1} value={config.alerta_amarelo ?? 2}
                  onChange={e => setConfig({ ...config, alerta_amarelo: num(e.target.value, 2) })} />
              </Field>
              <Field label="🔴 Alerta vermelho (min)" hint="Urgente + push individual">
                <input className="input" type="number" min={1} value={config.alerta_vermelho ?? 5}
                  onChange={e => setConfig({ ...config, alerta_vermelho: num(e.target.value, 5) })} />
              </Field>
              <Field label="🚨 Escalar admin (min)" hint="Avisa todos + admin">
                <input className="input" type="number" min={1} value={config.alerta_admin ?? 10}
                  onChange={e => setConfig({ ...config, alerta_admin: num(e.target.value, 10) })} />
              </Field>
            </div>

            {/* Linha do tempo */}
            <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0', overflow: 'hidden' }}>
              {[
                { t: '0', icon: '🤐', label: 'Fila', color: 'var(--border)' },
                { t: `${config.alerta_amarelo ?? 2}min`, icon: '🟡', label: 'Grupo', color: '#f59e0b' },
                { t: `${config.alerta_vermelho ?? 5}min`, icon: '🔴', label: 'Urgente', color: 'var(--red)' },
                { t: `${config.alerta_admin ?? 10}min`, icon: '🚨', label: 'Admin', color: '#ef4444' },
              ].map((s, i, arr) => (
                <React.Fragment key={i}>
                  <div style={{ textAlign: 'center', minWidth: 60 }}>
                    <div style={{ fontSize: '1.2rem' }}>{s.icon}</div>
                    <div style={{ fontSize: '.65rem', color: s.color, fontWeight: 700 }}>{s.t}</div>
                    <div style={{ fontSize: '.6rem', color: 'var(--dim)' }}>{s.label}</div>
                  </div>
                  {i < arr.length - 1 && <div style={{ flex: 1, height: 2, background: 'var(--border)', margin: '0 2px', marginBottom: 12 }} />}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title">💬 Mensagem automática ao cliente</div>
            <Field label="Enviar mensagem para o cliente enquanto espera">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.84rem', marginBottom: 10 }}>
                <input type="checkbox" checked={config.enviar_msg_cliente !== false}
                  onChange={e => setConfig({ ...config, enviar_msg_cliente: e.target.checked })}
                  style={{ accentColor: 'var(--g1)', width: 16, height: 16 }} />
                Ativo
              </label>
            </Field>
            <Field label="Texto da mensagem" hint="Enviado quando atinge o alerta amarelo">
              <textarea className="input" rows={3}
                value={config.msg_cliente_espera ?? '⏳ Aguarde! Em breve um de nossos atendentes irá te ajudar.'}
                onChange={e => setConfig({ ...config, msg_cliente_espera: e.target.value })}
                style={{ resize: 'vertical' }} />
            </Field>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>📊 Resumo diário</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.84rem', marginBottom: 10 }}>
                <input type="checkbox" checked={!!config.resumo_diario}
                  onChange={e => setConfig({ ...config, resumo_diario: e.target.checked })}
                  style={{ accentColor: 'var(--g1)', width: 16, height: 16 }} />
                Enviar resumo diário
              </label>
              <Field label="Horário de envio" hint="Formato HH:MM — enviado todo dia nos grupos com alertas">
                <input className="input" type="time" value={config.resumo_horario ?? '08:00'}
                  onChange={e => setConfig({ ...config, resumo_horario: e.target.value })} />
              </Field>
            </div>
          </div>

          {/* Notificações de agentes */}
          <div className="card" style={{ gridColumn: '1/-1' }}>
            <div className="card-title">👥 Notificações de agentes</div>

            {/* Agente atrasado */}
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: '.85rem', fontWeight: 600 }}>⏰ Alerta de agente atrasado</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>Notifica quando agente não logou após o início do horário</div>
                </div>
                <label style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!config.notif_atraso}
                    onChange={e => setConfig({ ...config, notif_atraso: e.target.checked })}
                    style={{ accentColor: 'var(--g1)', width: 18, height: 18 }} />
                </label>
              </div>
              {config.notif_atraso && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10, paddingLeft: 8 }}>
                  <div>
                    <label style={{ fontSize: '.7rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Delay para alertar (min)</label>
                    <input className="input" type="number" min={5} max={60}
                      value={config.notif_atraso_delay ?? 15}
                      onChange={e => setConfig({ ...config, notif_atraso_delay: parseInt(e.target.value)||15 })} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={config.notif_atraso_agente !== false}
                        onChange={e => setConfig({ ...config, notif_atraso_agente: e.target.checked })}
                        style={{ accentColor: 'var(--g1)', width: 15, height: 15 }} />
                      Notificar o próprio agente
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={config.notif_atraso_supervisor !== false}
                        onChange={e => setConfig({ ...config, notif_atraso_supervisor: e.target.checked })}
                        style={{ accentColor: 'var(--g1)', width: 15, height: 15 }} />
                      Notificar supervisor/admin
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Transferência para agente offline */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: '.85rem', fontWeight: 600 }}>💬 Nova conversa transferida (só offline)</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>Avisa agentes offline quando IA transfere para humano — online não recebe para não poluir</div>
                </div>
                <label style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!config.notif_transferencia}
                    onChange={e => setConfig({ ...config, notif_transferencia: e.target.checked })}
                    style={{ accentColor: 'var(--g1)', width: 18, height: 18 }} />
                </label>
              </div>
              {config.notif_transferencia && (
                <div style={{ paddingLeft: 8 }}>
                  <label style={{ fontSize: '.7rem', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                    Mensagem enviada ao agente
                    <span style={{ color: 'var(--dim)', marginLeft: 6 }}>Use {'{'}cliente{'}'}, {'{'}url{'}'}, {'{'}canal{'}'}</span>
                  </label>
                  <textarea className="input" rows={3} style={{ resize: 'vertical', fontSize: '.78rem' }}
                    value={config.notif_transferencia_msg ?? '💬 *Nova conversa aguardando!*\n\nO cliente *{cliente}* está aguardando atendimento.\n\n👉 {url}/admin/chat'}
                    onChange={e => setConfig({ ...config, notif_transferencia_msg: e.target.value })} />
                </div>
              )}
            </div>
          </div>

          {/* Notificações avançadas */}
          <div className="card" style={{ gridColumn: '1/-1' }}>
            <div className="card-title">🔔 Notificações avançadas</div>

            {[
              { key:'notif_nps_negativo', icon:'⭐', label:'Alerta NPS negativo (nota ≤ 6)', desc:'Supervisores/admins recebem alerta quando cliente dá nota baixa' },
              { key:'notif_chamado_tecnico', icon:'🔧', label:'Alerta de novo chamado técnico', desc:'Técnicos recebem quando a IA abre uma ocorrência técnica no SGP' },
              { key:'notif_cancelamento', icon:'❌', label:'Alerta de cancelamento', desc:'Técnicos e supervisores recebem para priorizar retirada do equipamento' },
              { key:'notif_atraso', icon:'⏰', label:'Alerta de agente atrasado', desc:'Avisa o próprio agente e supervisor quando não logou no horário' },
              { key:'notif_transferencia', icon:'💬', label:'Nova conversa transferida (só offline)', desc:'Avisa agentes offline quando IA transfere para humano' },
            ].map(({ key, icon, label, desc }) => (
              <div key={key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,.04)' }}>
                <div>
                  <div style={{ fontSize:'.84rem', fontWeight:600 }}>{icon} {label}</div>
                  <div style={{ fontSize:'.72rem', color:'var(--muted)', marginTop:2 }}>{desc}</div>
                </div>
                <input type="checkbox" checked={!!config[key]}
                  onChange={e => setConfig({...config, [key]: e.target.checked})}
                  style={{ accentColor:'var(--g1)', width:18, height:18, cursor:'pointer', flexShrink:0 }} />
              </div>
            ))}

            {/* Problema em área — com configuração de threshold */}
            <div style={{ padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,.04)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: config.notif_problema_area ? 10 : 0 }}>
                <div>
                  <div style={{ fontSize:'.84rem', fontWeight:600 }}>📡 Detectar problema em área (via SGP)</div>
                  <div style={{ fontSize:'.72rem', color:'var(--muted)', marginTop:2 }}>Agrupa por bairro/cidade — alerta quando atingir o threshold</div>
                </div>
                <input type="checkbox" checked={!!config.notif_problema_area}
                  onChange={e => setConfig({...config, notif_problema_area: e.target.checked})}
                  style={{ accentColor:'var(--g1)', width:18, height:18, cursor:'pointer', flexShrink:0 }} />
              </div>
              {config.notif_problema_area && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, paddingLeft:8 }}>
                  <div>
                    <label style={{ fontSize:'.7rem', color:'var(--muted)', display:'block', marginBottom:4 }}>Mínimo de clientes por área</label>
                    <input className="input" type="number" min={2} max={20}
                      value={config.area_threshold || 3}
                      onChange={e => setConfig({...config, area_threshold: parseInt(e.target.value)||3})} />
                  </div>
                  <div>
                    <label style={{ fontSize:'.7rem', color:'var(--muted)', display:'block', marginBottom:4 }}>Janela de tempo (minutos)</label>
                    <input className="input" type="number" min={10} max={60}
                      value={config.area_janela || 30}
                      onChange={e => setConfig({...config, area_janela: parseInt(e.target.value)||30})} />
                  </div>
                </div>
              )}
            </div>

            {/* Resumo individual */}
            <div style={{ padding:'10px 0' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: config.resumo_individual ? 8 : 0 }}>
                <div>
                  <div style={{ fontSize:'.84rem', fontWeight:600 }}>📊 Resumo individual por agente</div>
                  <div style={{ fontSize:'.72rem', color:'var(--muted)', marginTop:2 }}>Cada agente recebe seu desempenho do dia no privado</div>
                </div>
                <input type="checkbox" checked={!!config.resumo_individual}
                  onChange={e => setConfig({...config, resumo_individual: e.target.checked})}
                  style={{ accentColor:'var(--g1)', width:18, height:18, cursor:'pointer', flexShrink:0 }} />
              </div>
              {config.resumo_individual && (
                <div style={{ paddingLeft:8 }}>
                  <label style={{ fontSize:'.7rem', color:'var(--muted)', display:'block', marginBottom:4 }}>Horário de envio</label>
                  <input className="input" type="time" style={{ width:120 }}
                    value={config.resumo_individual_horario || '18:00'}
                    onChange={e => setConfig({...config, resumo_individual_horario: e.target.value})} />
                </div>
              )}
            </div>
          </div>

          <button className="btn btn-primary" onClick={salvarConfig} disabled={saving}
            style={{ gridColumn: '1/-1', maxWidth: 200, marginLeft: 'auto', padding: '10px 24px' }}>
            {saving ? 'Salvando...' : '💾 Salvar configurações'}
          </button>
        </div>
      )}

      {/* ── IA EQUIPE ───────────────────────────────────────────────────────── */}
      {tab === 'ia' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14 }}>
          <div className="card">
            <div className="card-title">🤖 IA para a equipe</div>
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.7, marginBottom: 16 }}>
              A Maxxi Interna responde dúvidas da equipe diretamente no WhatsApp. Ative <strong>IA responde</strong> nos grupos desejados na aba Grupos.<br /><br />
              <strong>Comandos disponíveis:</strong>
            </div>
            {[
              ['/fila', 'Mostra clientes aguardando agente agora'],
              ['/stats', 'Métricas do dia (total, TMA, NPS)'],
              ['/ajuda', 'Lista todos os comandos'],
            ].map(([cmd, desc]) => (
              <div key={cmd} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,.04)' }}>
                <code style={{ fontSize: '.8rem', color: 'var(--g1)', fontFamily: "'JetBrains Mono',monospace", minWidth: 80 }}>{cmd}</code>
                <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{desc}</span>
              </div>
            ))}
            <div style={{ marginTop: 16, padding: '10px 12px', background: 'rgba(0,200,150,.07)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 8, fontSize: '.75rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              Além dos comandos, qualquer pergunta em texto livre é respondida pela IA com base nos processos e planos da CITmax.
            </div>
          </div>

          <div className="card">
            <div className="card-title">📋 Exemplo de interação</div>
            {[
              { from: 'Joelma', msg: 'Qual o plano mais vendido em Natal?' },
              { from: 'Maxxi', msg: 'O mais vendido em Natal é o Avançado — 600 Mega por R$ 99,90/mês, sem taxa de adesão e com fidelidade. Inclui 1 app Standard! 📡' },
              { from: 'Joelma', msg: '/fila' },
              { from: 'Maxxi', msg: '📋 Fila atual (2):\n🔴 Gabrielly — 8min aguardando\n🟡 João Silva — 3min aguardando' },
            ].map((m, i) => (
              <div key={i} style={{ padding: '8px 10px', marginBottom: 6, borderRadius: 8, fontSize: '.78rem', lineHeight: 1.5,
                background: m.from === 'Maxxi' ? 'rgba(0,200,150,.1)' : 'rgba(3,45,61,.6)',
                alignSelf: m.from === 'Maxxi' ? 'flex-start' : 'flex-end',
                border: `1px solid ${m.from === 'Maxxi' ? 'rgba(0,200,150,.2)' : 'rgba(255,255,255,.06)'}`,
                whiteSpace: 'pre-wrap' }}>
                <div style={{ fontSize: '.62rem', color: 'var(--dim)', marginBottom: 3 }}>{m.from}</div>
                {m.msg}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
