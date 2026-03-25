import React, { useEffect, useState, useCallback } from 'react';
import { apiJson, api } from '../api';
import { useStore } from '../store';

const EMPTY = {
  nome: '', cpf: '', datanasc: '', email: '', celular: '',
  logradouro: '', numero: '', complemento: '', bairro: '',
  cidade: '', pontoreferencia: '', plano_id: '', vencimento_id: '',
  obs: '',
};

function formatCPF(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function formatPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

export default function CadastroLead() {
  const [form, setForm] = useState({ ...EMPTY });
  const [leads, setLeads] = useState([]);
  const [cidades, setCidades] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vencimentos, setVencimentos] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [tab, setTab] = useState('form');
  const showToast = useStore(s => s.showToast);

  const loadLeads = useCallback(async () => {
    try {
      const data = await apiJson('/api/leads');
      setLeads(Array.isArray(data) ? data : []);
    } catch { setLeads([]); }
    setLoading(false);
  }, []);

  const loadVencimentos = useCallback(async () => {
    try {
      const raw = await apiJson('/api/sgp/vencimentos');
      const list = raw?.vencimentos || raw?.results || (Array.isArray(raw) ? raw : []);
      setVencimentos(list);
    } catch { setVencimentos([]); }
  }, []);

  const loadCidadesPlanos = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([apiJson('/api/cidades'), apiJson('/api/planos')]);
      setCidades(Array.isArray(c) ? c.filter(ci => ci.ativo) : []);
      setPlanos(Array.isArray(p) ? p.filter(pl => pl.ativo) : []);
    } catch {}
  }, []);

  useEffect(() => { loadLeads(); loadVencimentos(); loadCidadesPlanos(); }, [loadLeads, loadVencimentos, loadCidadesPlanos]);

  // Planos disponíveis para a cidade selecionada
  const cidadeObj = cidades.find(c => c.nome === form.cidade);
  const planosCidade = planos.filter(p => {
    const vinculos = Array.isArray(p.cidades) ? p.cidades : [];
    return vinculos.some(v => v.cidade_nome === form.cidade);
  });

  const getSgpId = (planoId) => {
    const p = planos.find(pl => pl.id === planoId);
    const vinc = (p?.cidades || []).find(v => v.cidade_nome === form.cidade);
    return vinc?.sgp_id || planoId;
  };

  const set = (k, v) => {
    const next = { ...form, [k]: v };
    // Auto-fill quando muda cidade
    if (k === 'cidade') {
      const c = cidades.find(ci => ci.nome === v);
      if (c) { next.pop_id = c.pop_id; next.portador_id = c.portador_id; }
      next.plano_id = ''; // reset plano
    }
    setForm(next);
  };

  const handleSubmit = async () => {
    if (!form.nome || !form.cpf || !form.celular || !form.cidade || !form.plano_id) {
      showToast('Preencha os campos obrigatórios', true); return;
    }
    if (form.cpf.replace(/\D/g, '').length < 11) { showToast('CPF inválido', true); return; }

    setSaving(true); setResultado(null);
    try {
      const body = {
        ...form,
        pop_id: cidadeObj?.pop_id || 1,
        portador_id: cidadeObj?.portador_id || 16,
      };
      const r = await api('/api/leads', { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
      if (r.ok) {
        setResultado({ ok: true, lead: r.lead, erp: r.erp });
        showToast('✅ Lead cadastrado com sucesso!');
        setForm({ ...EMPTY });
        loadLeads();
      } else {
        setResultado({ ok: false, error: r.error });
        showToast('Erro: ' + (r.error || 'falha'), true);
      }
    } catch (e) { showToast('Erro: ' + e.message, true); }
    setSaving(false);
  };

  const statusBadge = (s) => {
    const m = { cadastrado: 'badge-green', erro_erp: 'badge-red', aberto: 'badge-blue', convertido: 'badge-green' };
    return m[s] || '';
  };

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <div className="page-head">
        <div>
          <h1>📋 Cadastro de Leads</h1>
          <p>Pré-cadastro de novos clientes no ERP SGP</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${tab === 'form' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('form')}>➕ Novo</button>
          <button className={`btn btn-sm ${tab === 'list' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('list')}>📋 Leads ({leads.length})</button>
        </div>
      </div>

      {tab === 'form' && (
        <div className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 16, padding: '8px 12px', background: 'rgba(0,200,150,.05)', borderRadius: 8, border: '1px solid rgba(0,200,150,.1)' }}>
            💡 O cadastro será enviado automaticamente para o ERP SGP e salvo localmente. Campos com * são obrigatórios.
          </div>

          {/* Dados pessoais */}
          <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem', marginBottom: 12, color: 'var(--g1)' }}>👤 Dados Pessoais</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Nome completo *</label>
              <input className="input" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="João da Silva Santos" />
            </div>
            <div>
              <label style={lbl}>CPF *</label>
              <input className="input" value={formatCPF(form.cpf)} onChange={e => set('cpf', e.target.value.replace(/\D/g, ''))} placeholder="000.000.000-00" maxLength={14} />
            </div>
            <div>
              <label style={lbl}>Data de Nascimento</label>
              <input className="input" type="date" value={form.datanasc} onChange={e => set('datanasc', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Celular *</label>
              <input className="input" value={formatPhone(form.celular)} onChange={e => set('celular', e.target.value.replace(/\D/g, ''))} placeholder="(84) 99999-9999" maxLength={15} />
            </div>
            <div>
              <label style={lbl}>E-mail</label>
              <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
            </div>
          </div>

          {/* Endereço */}
          <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem', marginBottom: 12, color: 'var(--g1)' }}>📍 Endereço</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={lbl}>Logradouro</label>
              <input className="input" value={form.logradouro} onChange={e => set('logradouro', e.target.value)} placeholder="Rua José Coelho" />
            </div>
            <div>
              <label style={lbl}>Número</label>
              <input className="input" value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="155" />
            </div>
            <div>
              <label style={lbl}>Complemento</label>
              <input className="input" value={form.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Apt 201, Bloco A" />
            </div>
            <div>
              <label style={lbl}>Bairro</label>
              <input className="input" value={form.bairro} onChange={e => set('bairro', e.target.value)} placeholder="Centro" />
            </div>
            <div>
              <label style={lbl}>Cidade *</label>
              <select className="input" value={form.cidade} onChange={e => set('cidade', e.target.value)}>
                <option value="">Selecione...</option>
                {cidades.map(c => <option key={c.id || c.nome} value={c.nome}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Ponto de Referência</label>
              <input className="input" value={form.pontoreferencia} onChange={e => set('pontoreferencia', e.target.value)} placeholder="Próximo ao mercado" />
            </div>
          </div>

          {/* Plano */}
          <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem', marginBottom: 12, color: 'var(--g1)' }}>📡 Plano e Pagamento</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={lbl}>Plano *</label>
              {!form.cidade ? (
                <div style={{ fontSize: '.75rem', color: 'var(--dim)', padding: '10px 14px', background: 'rgba(0,0,0,.15)', borderRadius: 8 }}>Selecione a cidade primeiro</div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  {planosCidade.map(p => (
                    <button key={p.id} className={`btn btn-sm ${String(form.plano_id) === String(p.id) ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => set('plano_id', p.id)} style={{ flex: 1 }}>
                      {p.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>Dia de Vencimento</label>
              {vencimentos.length > 0 ? (
                <select className="input" value={form.vencimento_id} onChange={e => set('vencimento_id', e.target.value)}>
                  <option value="">Selecione...</option>
                  {vencimentos.map(v => <option key={v.id} value={v.id}>Dia {v.dia || v.vencimento || v.label || v.id}</option>)}
                </select>
              ) : (
                <input className="input" type="number" value={form.vencimento_id} onChange={e => set('vencimento_id', e.target.value)} placeholder="ID do vencimento" />
              )}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Observação</label>
              <textarea className="input" rows={2} value={form.obs} onChange={e => set('obs', e.target.value)} placeholder="Observações adicionais..." style={{ resize: 'vertical' }} />
            </div>
          </div>

          {/* Auto-fill info */}
          {cidadeObj && (
            <div style={{ fontSize: '.68rem', color: 'var(--dim)', marginBottom: 16, padding: '6px 10px', background: 'rgba(0,0,0,.1)', borderRadius: 6, fontFamily: "'JetBrains Mono',monospace" }}>
              POP: {cidadeObj.pop_id} · Portador: {cidadeObj.portador_id} · UF: RN
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, fontSize: '.78rem',
              background: resultado.ok ? 'rgba(0,200,150,.08)' : 'rgba(255,71,87,.08)',
              border: `1px solid ${resultado.ok ? 'rgba(0,200,150,.2)' : 'rgba(255,71,87,.2)'}` }}>
              {resultado.ok ? (
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>✅ Cadastrado com sucesso!</div>
                  {resultado.erp?.protocolo && <div>Protocolo ERP: <strong>{resultado.erp.protocolo}</strong></div>}
                  {resultado.erp?.clienteId && <div>ID Cliente: <strong>{resultado.erp.clienteId}</strong></div>}
                  <details style={{ marginTop: 8 }}><summary style={{ cursor: 'pointer', color: 'var(--dim)', fontSize: '.68rem' }}>Resposta ERP</summary>
                    <pre style={{ fontSize: '.62rem', marginTop: 4, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>{JSON.stringify(resultado.erp, null, 2)}</pre>
                  </details>
                </div>
              ) : (
                <div>❌ Erro: {resultado.error}</div>
              )}
            </div>
          )}

          {/* Submit */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-outline" onClick={() => { setForm({ ...EMPTY }); setResultado(null); }}>Limpar</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? '⏳ Cadastrando...' : '✅ Cadastrar Lead'}
            </button>
          </div>
        </div>
      )}

      {/* Lista de leads */}
      {tab === 'list' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? <div className="skeleton" style={{ height: 200 }} /> :
          leads.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Nenhum lead cadastrado</div> :
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Nome', 'CPF', 'Cidade', 'Plano', 'Status', 'Data'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--muted)', fontSize: '.68rem', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{l.nome}</td>
                  <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '.72rem' }}>{l.cpf}</td>
                  <td>{l.cidade || '—'}</td>
                  <td>{l.plano_id || '—'}</td>
                  <td><span className={`badge ${statusBadge(l.status)}`} style={{ fontSize: '.6rem' }}>{l.status}</span></td>
                  <td style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{l.criado_em ? new Date(l.criado_em).toLocaleDateString('pt-BR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>}
        </div>
      )}
    </div>
  );
}

const lbl = { fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 };
