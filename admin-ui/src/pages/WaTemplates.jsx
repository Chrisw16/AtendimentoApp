import React, { useState, useEffect, useCallback } from 'react';

function apiFetch(path, opts = {}) {
  const base = window.location.origin + '/admin';
  const token = localStorage.getItem('maxxi_token') || '';
  return fetch(base + path, {
    headers: { 'x-admin-token': token, 'Content-Type': 'application/json' },
    ...opts,
  }).then(r => r.json());
}

const STATUS_COR = {
  APPROVED: { label: 'Aprovado',    cor: '#00c896', bg: 'rgba(0,200,150,.1)' },
  PENDING:  { label: 'Pendente',    cor: '#f5c518', bg: 'rgba(245,197,24,.1)' },
  REJECTED: { label: 'Rejeitado',   cor: '#ff4757', bg: 'rgba(255,71,87,.1)'  },
  PAUSED:   { label: 'Pausado',     cor: '#ff6b35', bg: 'rgba(255,107,53,.1)' },
  DISABLED: { label: 'Desativado',  cor: '#888',    bg: 'rgba(128,128,128,.1)'},
};

const CAT = ['UTILITY','MARKETING','AUTHENTICATION'];

function Badge({ status }) {
  const s = STATUS_COR[status] || { label: status, cor: '#aaa', bg: 'rgba(255,255,255,.07)' };
  return <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, color:s.cor, background:s.bg, border:`1px solid ${s.cor}33`, whiteSpace:'nowrap' }}>{s.label}</span>;
}

const TEMPLATE_VAZIO = {
  name: '', category: 'UTILITY', language: 'pt_BR',
  components: [
    { type: 'HEADER', format: 'TEXT', text: '' },
    { type: 'BODY', text: '' },
    { type: 'FOOTER', text: '' },
    { type: 'BUTTONS', buttons: [] },
  ],
};

export default function WaTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [erro, setErro]           = useState(null);
  const [modal, setModal]         = useState(null); // null | 'criar' | template
  const [form, setForm]           = useState(TEMPLATE_VAZIO);
  const [salvando, setSalvando]   = useState(false);
  const [msgSalvo, setMsgSalvo]   = useState('');
  const [wabaConfig, setWabaConfig] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      const data = await apiFetch('/api/wa/templates');
      if (data?.error) { setErro(data.error); setWabaConfig(data.error.includes('wabaId')); }
      else { setTemplates(Array.isArray(data) ? data : []); }
    } catch(e) { setErro(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirCriar = () => { setForm(JSON.parse(JSON.stringify(TEMPLATE_VAZIO))); setModal('criar'); setMsgSalvo(''); };

  const salvarTemplate = async () => {
    if (!form.name || !form.components.find(c=>c.type==='BODY')?.text) {
      setMsgSalvo('❌ Nome e corpo são obrigatórios'); return;
    }
    setSalvando(true); setMsgSalvo('');
    try {
      const components = [];

      // Header
      const header = form.components.find(c=>c.type==='HEADER');
      if (header?.text?.trim()) {
        const headerComp = { type:'HEADER', format:'TEXT', text: header.text };
        // Se tiver variável no header, adiciona exemplo
        if (header.text.includes('{{')) {
          headerComp.example = { header_text: ['CITmax'] };
        }
        components.push(headerComp);
      }

      // Body — detecta variáveis e adiciona exemplos
      const body = form.components.find(c=>c.type==='BODY');
      if (body?.text?.trim()) {
        const varCount = (body.text.match(/\{\{\d+\}\}/g) || []).length;
        const bodyComp = { type:'BODY', text: body.text };
        if (varCount > 0) {
          // Exemplos contextualmente adequados por posição
          const exemplos = [
            'Fatura de R$ 49,90 venceu em 20/03/2026',
            '49,90', '20/03/2026', '206', 'aviso'
          ];
          bodyComp.example = { body_text: [exemplos.slice(0, varCount)] };
        }
        components.push(bodyComp);
      }

      // Footer
      const footer = form.components.find(c=>c.type==='FOOTER');
      if (footer?.text?.trim()) {
        components.push({ type:'FOOTER', text: footer.text });
      }

      // Buttons
      const btns = form.components.find(c=>c.type==='BUTTONS');
      if (btns?.buttons?.length > 0) {
        components.push({
          type: 'BUTTONS',
          buttons: btns.buttons.filter(b=>b.text?.trim()).map(b => ({
            type: 'QUICK_REPLY',
            text: b.text.slice(0, 25),
          }))
        });
      }

      const payload = {
        name: form.name.toLowerCase().replace(/\s+/g,'_'),
        category: form.category,
        language: form.language,
        components,
      };

      const r = await apiFetch('/api/wa/templates', { method:'POST', body: JSON.stringify(payload) });
      if (r.error) {
        const subcode = r.details?.error_subcode || '';
        const fullMsg = r.details?.message || r.details?.error_data || r.error;
        setMsgSalvo(`❌ ${fullMsg}${subcode ? ` (subcode: ${subcode})` : ''}\n\nPayload enviado: ${JSON.stringify(payload, null, 2)}`);
      }
      else { setMsgSalvo('✅ Template enviado para aprovação da Meta!'); carregar(); setTimeout(()=>setModal(null),2000); }
    } catch(e) { setMsgSalvo('❌ ' + e.message); }
    setSalvando(false);
  };

  const excluir = async (name) => {
    if (!window.confirm(`Excluir o template "${name}"?`)) return;
    const r = await apiFetch(`/api/wa/templates/${name}`, { method:'DELETE' });
    if (r.ok) { setTemplates(t => t.filter(x => x.name !== name)); }
    else alert(r.error || 'Erro ao excluir');
  };

  const setComp = (tipo, campo, valor) => {
    setForm(f => ({ ...f, components: f.components.map(c => c.type===tipo ? {...c,[campo]:valor} : c) }));
  };

  const getComp = (tipo) => form.components.find(c=>c.type===tipo) || {};

  return (
    <div style={{ padding:'20px 24px', maxWidth:1100, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:18, fontWeight:700, color:'#fff', margin:0 }}>Templates WhatsApp</h1>
          <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginTop:3 }}>Gerencie templates aprovados pela Meta para envios fora da janela 24h</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={carregar} style={{ padding:'7px 12px', borderRadius:7, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.5)', fontSize:12, cursor:'pointer' }}>⟳</button>
          <button onClick={abrirCriar} style={{ padding:'7px 14px', borderRadius:7, background:'rgba(0,200,150,.12)', border:'1px solid rgba(0,200,150,.3)', color:'#00c896', fontSize:12, cursor:'pointer', fontWeight:700 }}>+ Novo Template</button>
        </div>
      </div>

      {wabaConfig && (
        <div style={{ padding:'12px 16px', background:'rgba(245,197,24,.08)', border:'1px solid rgba(245,197,24,.2)', borderRadius:9, marginBottom:16, fontSize:12, color:'#f5c518' }}>
          ⚠️ Configure o <strong>WABA ID</strong> no canal WhatsApp. Vá em <strong>Canais → WhatsApp → Config → wabaId</strong> e preencha com o ID da conta do WhatsApp Business Manager.
        </div>
      )}

      {erro && !wabaConfig && (
        <div style={{ padding:'10px 14px', background:'rgba(255,71,87,.08)', border:'1px solid rgba(255,71,87,.2)', borderRadius:8, color:'#ff4757', fontSize:12, marginBottom:16 }}>❌ {erro}</div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'rgba(255,255,255,.2)' }}>Carregando...</div>
      ) : templates.length === 0 && !erro ? (
        <div style={{ textAlign:'center', padding:'60px 0' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
          <div style={{ fontSize:14, fontWeight:700, color:'rgba(255,255,255,.2)' }}>Nenhum template cadastrado</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,.12)', marginTop:8 }}>Crie um template e aguarde aprovação da Meta (24-48h)</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {templates.map(t => (
            <div key={t.id||t.name} style={{ background:'rgba(2,35,45,.7)', border:'1px solid rgba(255,255,255,.07)', borderRadius:10, padding:'14px 16px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: t.rejected_reason ? 4 : 8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontFamily:'monospace', fontWeight:700, color:'#e2e8f0', fontSize:13 }}>{t.name}</span>
                  <Badge status={t.status} />
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.3)', background:'rgba(255,255,255,.05)', padding:'2px 7px', borderRadius:4 }}>{t.category}</span>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.3)' }}>{t.language}</span>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {t.status === 'APPROVED' && (
                    <button onClick={() => { navigator.clipboard.writeText(t.name); }}
                      style={{ padding:'4px 10px', borderRadius:6, background:'rgba(0,200,150,.08)', border:'1px solid rgba(0,200,150,.2)', color:'#00c896', fontSize:11, cursor:'pointer' }}>
                      📋 Copiar nome
                    </button>
                  )}
                  <button onClick={() => excluir(t.name)}
                    style={{ padding:'4px 10px', borderRadius:6, background:'rgba(255,71,87,.08)', border:'1px solid rgba(255,71,87,.2)', color:'#ff4757', fontSize:11, cursor:'pointer' }}>
                    🗑 Excluir
                  </button>
                </div>
              </div>
              {t.rejected_reason && t.rejected_reason !== 'NONE' && (
                <div style={{ marginBottom:8, padding:'6px 10px', background:'rgba(255,71,87,.07)', border:'1px solid rgba(255,71,87,.15)', borderRadius:6, fontSize:11, color:'#ff6b6b' }}>
                  ❌ Motivo da rejeição: <strong>{t.rejected_reason}</strong>
                </div>
              )}
              {(t.components||[]).map(c => (
                <div key={c.type} style={{ marginTop:6, padding:'7px 10px', background:'rgba(255,255,255,.03)', borderRadius:6 }}>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,.25)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{c.type}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,.6)', whiteSpace:'pre-wrap' }}>
                    {c.text || (c.buttons||[]).map(b=>b.text).join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Modal criar template */}
      {modal === 'criar' && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => e.target===e.currentTarget && setModal(null)}>
          <div style={{ background:'rgba(2,22,32,.98)', border:'1px solid rgba(255,255,255,.1)', borderRadius:12, padding:24, width:'100%', maxWidth:560, maxHeight:'90vh', overflow:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:18 }}>
              <h2 style={{ margin:0, fontSize:16, fontWeight:700 }}>Novo Template</h2>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'none', color:'rgba(255,255,255,.4)', cursor:'pointer', fontSize:18 }}>×</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <label style={{ fontSize:11, color:'rgba(255,255,255,.4)', display:'block', marginBottom:4 }}>Nome (sem espaços)</label>
                <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value.toLowerCase().replace(/\s+/g,'_')}))}
                  placeholder="cobranca_citmax"
                  style={{ width:'100%', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.12)', borderRadius:7, padding:'8px 10px', color:'#fff', fontSize:12, outline:'none', boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize:11, color:'rgba(255,255,255,.4)', display:'block', marginBottom:4 }}>Categoria</label>
                <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
                  style={{ width:'100%', background:'rgba(2,15,25,.95)', border:'1px solid rgba(255,255,255,.12)', borderRadius:7, padding:'8px 10px', color:'#fff', fontSize:12, outline:'none' }}>
                  {CAT.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, color:'rgba(255,255,255,.4)', display:'block', marginBottom:4 }}>Cabeçalho <span style={{opacity:.5}}>(opcional — deixe vazio se não quiser)</span></label>
              <input value={getComp('HEADER').text||''} onChange={e=>setComp('HEADER','text',e.target.value)}
                placeholder="(vazio)"
                style={{ width:'100%', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.12)', borderRadius:7, padding:'8px 10px', color:getComp('HEADER').text?'#fff':'rgba(255,255,255,.25)', fontSize:12, outline:'none', boxSizing:'border-box' }} />
            </div>

            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, color:'rgba(255,255,255,.4)', display:'block', marginBottom:4 }}>
                Corpo <span style={{color:'#ff4757'}}>*</span>
                <span style={{opacity:.5, marginLeft:6}}>Use {'{{1}}'} {'{{2}}'} para variáveis</span>
              </label>
              <textarea value={getComp('BODY').text||''} onChange={e=>setComp('BODY','text',e.target.value)}
                rows={6} placeholder={'Olá, {{1}}! 👋\n\nSeu boleto CITmax vence em *{{2}}*.\n\n💰 Valor: R$ {{3}}\n\nPague: {{4}}'}
                style={{ width:'100%', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.12)', borderRadius:7, padding:'8px 10px', color:'#fff', fontSize:12, outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }} />
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, color:'rgba(255,255,255,.4)', display:'block', marginBottom:4 }}>Rodapé <span style={{opacity:.5}}>(opcional — deixe vazio se não quiser)</span></label>
              <input value={getComp('FOOTER').text||''} onChange={e=>setComp('FOOTER','text',e.target.value)}
                placeholder="(vazio)"
                style={{ width:'100%', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.12)', borderRadius:7, padding:'8px 10px', color:getComp('FOOTER').text?'#fff':'rgba(255,255,255,.25)', fontSize:12, outline:'none', boxSizing:'border-box' }} />
            </div>

            {msgSalvo && <div style={{ padding:'8px 12px', borderRadius:7, marginBottom:12, fontSize:12, background: msgSalvo.startsWith('✅')?'rgba(0,200,150,.1)':'rgba(255,71,87,.1)', color: msgSalvo.startsWith('✅')?'#00c896':'#ff4757', border:`1px solid ${msgSalvo.startsWith('✅')?'rgba(0,200,150,.2)':'rgba(255,71,87,.2)'}` }}>{msgSalvo}</div>}

            {/* Botões de resposta rápida */}
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <label style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>
                  Botões de resposta rápida <span style={{opacity:.5}}>(máx 3)</span>
                </label>
                {(form.components.find(c=>c.type==='BUTTONS')?.buttons||[]).length < 3 && (
                  <button onClick={() => setForm(f => ({
                    ...f,
                    components: f.components.map(c => c.type==='BUTTONS'
                      ? {...c, buttons: [...(c.buttons||[]), { type:'QUICK_REPLY', text:'' }]}
                      : c)
                  }))} style={{ fontSize:11, padding:'2px 8px', borderRadius:5, background:'rgba(0,200,150,.08)', border:'1px solid rgba(0,200,150,.2)', color:'#00c896', cursor:'pointer' }}>
                    + Adicionar botão
                  </button>
                )}
              </div>
              {(form.components.find(c=>c.type==='BUTTONS')?.buttons||[]).map((btn, i) => (
                <div key={i} style={{ display:'flex', gap:6, marginBottom:6 }}>
                  <input value={btn.text} onChange={e => setForm(f => ({
                    ...f,
                    components: f.components.map(c => c.type==='BUTTONS'
                      ? {...c, buttons: c.buttons.map((b,j) => j===i ? {...b, text:e.target.value} : b)}
                      : c)
                  }))} placeholder={`Texto do botão ${i+1} (ex: Ver meu boleto)`}
                    style={{ flex:1, background:'rgba(255,255,255,.05)', border:'1px solid rgba(0,200,150,.2)', borderRadius:7, padding:'7px 10px', color:'#fff', fontSize:12, outline:'none' }} />
                  <button onClick={() => setForm(f => ({
                    ...f,
                    components: f.components.map(c => c.type==='BUTTONS'
                      ? {...c, buttons: c.buttons.filter((_,j) => j!==i)}
                      : c)
                  }))} style={{ padding:'0 10px', borderRadius:6, background:'rgba(255,71,87,.08)', border:'1px solid rgba(255,71,87,.2)', color:'#ff4757', cursor:'pointer', fontSize:13 }}>×</button>
                </div>
              ))}
              <div style={{ fontSize:10, color:'rgba(255,255,255,.2)', marginTop:4 }}>
                Botão tipo QUICK_REPLY — quando o cliente clicar, o Maxxi reconhece e dispara o fluxo correspondente.
              </div>
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setModal(null)} style={{ flex:1, padding:'9px', borderRadius:8, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.5)', cursor:'pointer', fontSize:13 }}>Cancelar</button>
              <button onClick={salvarTemplate} disabled={salvando} style={{ flex:2, padding:'9px', borderRadius:8, background:'rgba(0,200,150,.12)', border:'1px solid rgba(0,200,150,.3)', color:'#00c896', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                {salvando ? 'Enviando...' : '🚀 Enviar para Meta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
