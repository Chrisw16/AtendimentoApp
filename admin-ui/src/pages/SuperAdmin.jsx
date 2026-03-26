import React, { useEffect, useState, useCallback } from 'react';
import { api, apiJson } from '../api';

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtData(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtNum(n) {
  return parseInt(n || 0).toLocaleString('pt-BR');
}
function fmtMoeda(n) {
  return parseFloat(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function timeAgo(dt) {
  if (!dt) return '—';
  const d = Math.floor((Date.now() - new Date(dt).getTime()) / 86400000);
  return d === 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
}

const PLANOS = ['starter', 'basic', 'pro', 'enterprise'];
const STATUS_LIST = ['ativo', 'trial', 'suspenso', 'cancelado'];

const PLANO_COR = {
  starter:    'var(--dim)',
  basic:      'var(--blue)',
  pro:        'var(--accent)',
  enterprise: 'var(--yellow)',
};
const STATUS_BADGE = {
  ativo:     'badge-green',
  trial:     'badge-blue',
  suspenso:  'badge-yellow',
  cancelado: 'badge-red',
};

// ── Modal de criar/editar tenant ──────────────────────────────────────────────
function TenantModal({ tenant, onClose, onSave }) {
  const isEdit = !!tenant?.id;
  const [form, setForm] = useState({
    nome:          tenant?.nome        || '',
    slug:          tenant?.slug        || '',
    email:         tenant?.email       || '',
    telefone:      tenant?.telefone    || '',
    cnpj:          tenant?.cnpj        || '',
    plano:         tenant?.plano       || 'starter',
    status:        tenant?.status      || 'ativo',
    limite_agentes:       tenant?.limite_agentes       || 3,
    limite_conversas_mes: tenant?.limite_conversas_mes || 500,
    limite_canais:        tenant?.limite_canais        || 2,
    valor_plano:          tenant?.valor_plano          || 0,
    trial_ate:     tenant?.trial_ate   ? tenant.trial_ate.slice(0, 10) : '',
    senha_admin:   '',
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro]     = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Ao mudar plano, aplica limites padrão
  const LIMITES_PLANO = {
    starter:    { limite_agentes: 3,   limite_conversas_mes: 500,   limite_canais: 2,  valor_plano: 0 },
    basic:      { limite_agentes: 5,   limite_conversas_mes: 2000,  limite_canais: 3,  valor_plano: 197 },
    pro:        { limite_agentes: 15,  limite_conversas_mes: 10000, limite_canais: 5,  valor_plano: 497 },
    enterprise: { limite_agentes: 999, limite_conversas_mes: 999999, limite_canais: 99, valor_plano: 0 },
  };
  const mudarPlano = (plano) => {
    const l = LIMITES_PLANO[plano] || {};
    setForm(f => ({ ...f, plano, ...l }));
  };

  const handleSave = async () => {
    setErro('');
    if (!form.nome || !form.slug || !form.email) {
      setErro('Nome, slug e e-mail são obrigatórios.');
      return;
    }
    if (!isEdit && (!form.senha_admin || form.senha_admin.length < 8)) {
      setErro('Senha do admin deve ter no mínimo 8 caracteres.');
      return;
    }
    setSaving(true);
    try {
      const body = { ...form };
      if (!body.trial_ate) delete body.trial_ate;
      if (isEdit) delete body.senha_admin;

      const res = await api(
        isEdit ? `/api/super-admin/tenants/${tenant.id}` : '/api/super-admin/tenants',
        { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(body) }
      );
      const data = await res.json();
      if (!res.ok) { setErro(data.error || 'Erro ao salvar.'); return; }
      onSave(data);
    } catch(e) {
      setErro(e.message);
    } finally {
      setSaving(false);
    }
  };

  const labelStyle = { display: 'block', fontSize: '.78rem', color: 'var(--text-2)', marginBottom: 4, fontWeight: 600 };
  const rowStyle   = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 600, maxHeight: '90vh',
        overflowY: 'auto', animation: 'fadeIn .2s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
            {isEdit ? '✏️ Editar tenant' : '➕ Novo tenant'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--dim)', fontSize: 18 }}>✕</button>
        </div>

        {erro && (
          <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(255,71,87,.1)',
            color: 'var(--danger)', border: '1px solid rgba(255,71,87,.2)', marginBottom: 16, fontSize: '.82rem' }}>
            {erro}
          </div>
        )}

        {/* Identidade */}
        <div style={{ fontSize: '.72rem', color: 'var(--accent)', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Identificação</div>
        <div style={rowStyle}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nome da empresa *</label>
            <input className="input" value={form.nome}
              onChange={e => set('nome', e.target.value)} placeholder="Fibra Norte Internet" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Slug (URL) *</label>
            <input className="input" value={form.slug} disabled={isEdit}
              onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="fibra-norte" style={{ opacity: isEdit ? .5 : 1 }} />
          </div>
        </div>
        <div style={rowStyle}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>E-mail *</label>
            <input className="input" type="email" value={form.email}
              onChange={e => set('email', e.target.value)} placeholder="admin@fibranorte.com.br" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Telefone</label>
            <input className="input" value={form.telefone}
              onChange={e => set('telefone', e.target.value)} placeholder="(84) 99999-9999" />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>CNPJ</label>
          <input className="input" value={form.cnpj}
            onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />
        </div>

        {/* Plano */}
        <div style={{ fontSize: '.72rem', color: 'var(--accent)', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10, marginTop: 8 }}>Plano e limites</div>
        <div style={rowStyle}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Plano</label>
            <select className="input" value={form.plano} onChange={e => mudarPlano(e.target.value)}>
              {PLANOS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Status</label>
            <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUS_LIST.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          {[
            { label: 'Limite agentes', key: 'limite_agentes' },
            { label: 'Conversas/mês', key: 'limite_conversas_mes' },
            { label: 'Canais', key: 'limite_canais' },
          ].map(({ label, key }) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{label}</label>
              <input className="input" type="number" min="1" value={form[key]}
                onChange={e => set(key, parseInt(e.target.value) || 0)} />
            </div>
          ))}
        </div>
        <div style={rowStyle}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Valor do plano (R$)</label>
            <input className="input" type="number" min="0" step="0.01" value={form.valor_plano}
              onChange={e => set('valor_plano', parseFloat(e.target.value) || 0)} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Trial até</label>
            <input className="input" type="date" value={form.trial_ate}
              onChange={e => set('trial_ate', e.target.value)} />
          </div>
        </div>

        {/* Senha admin (só na criação) */}
        {!isEdit && (
          <>
            <div style={{ fontSize: '.72rem', color: 'var(--accent)', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10, marginTop: 8 }}>Admin inicial</div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Senha do admin (login: "admin") *</label>
              <input className="input" type="password" value={form.senha_admin}
                onChange={e => set('senha_admin', e.target.value)}
                placeholder="Mínimo 8 caracteres" />
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar tenant'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de detalhes de um tenant ────────────────────────────────────────────
function TenantDetailModal({ tenantId, onClose, onEdit }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson(`/api/super-admin/tenants/${tenantId}`)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tenantId]);

  const handleCancelar = async () => {
    if (!confirm('Cancelar este tenant? Os dados serão preservados.')) return;
    const res = await api(`/api/super-admin/tenants/${tenantId}`, { method: 'DELETE' });
    if (res.ok) { alert('Tenant cancelado.'); onClose(true); }
  };

  const statBox = (label, valor) => (
    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: '1.4rem', fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)' }}>{valor}</div>
      <div style={{ fontSize: '.68rem', color: 'var(--dim)', marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '90vh',
        overflowY: 'auto', animation: 'fadeIn .2s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>🔍 Detalhes do tenant</h2>
          <button onClick={() => onClose(false)} style={{ background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--dim)', fontSize: 18 }}>✕</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--dim)' }}>Carregando...</div>
        ) : !data?.tenant ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--danger)' }}>Tenant não encontrado.</div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20,
              padding: '16px', background: 'var(--bg3)', borderRadius: 10 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent-glow)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem', fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)' }}>
                {data.tenant.nome[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{data.tenant.nome}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--dim)' }}>{data.tenant.email}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--dim)', fontFamily: "'JetBrains Mono'" }}>
                  slug: {data.tenant.slug}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span className={`badge ${STATUS_BADGE[data.tenant.status] || 'badge-yellow'}`}>
                  {data.tenant.status}
                </span>
                <span style={{ fontSize: '.78rem', fontWeight: 700, color: PLANO_COR[data.tenant.plano] }}>
                  {data.tenant.plano?.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
              {statBox('Agentes', fmtNum(data.stats?.agentes))}
              {statBox('Conversas/mês', fmtNum(data.stats?.conversas_mes))}
              {statBox('Tokens entrada', fmtNum(data.stats?.tokens_input))}
              {statBox('Tokens saída', fmtNum(data.stats?.tokens_output))}
            </div>

            {/* Limites */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '.72rem', color: 'var(--accent)', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Limites do plano</div>
              {[
                { label: 'Agentes', usado: data.stats?.agentes, limite: data.tenant.limite_agentes },
                { label: 'Conversas/mês', usado: data.stats?.conversas_mes, limite: data.tenant.limite_conversas_mes },
              ].map(({ label, usado, limite }) => {
                const pct = limite > 0 ? Math.min(100, Math.round((usado / limite) * 100)) : 0;
                const cor = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--accent)';
                return (
                  <div key={label} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      fontSize: '.78rem', marginBottom: 4 }}>
                      <span>{label}</span>
                      <span style={{ fontFamily: "'JetBrains Mono'" }}>
                        {fmtNum(usado)} / {fmtNum(limite)}
                      </span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--border-1)' }}>
                      <div style={{ height: '100%', borderRadius: 3,
                        width: `${pct}%`, background: cor, transition: 'width .4s' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px',
              fontSize: '.78rem', color: 'var(--text-2)', marginBottom: 20 }}>
              {[
                ['Criado', fmtData(data.tenant.criado_em)],
                ['Atualizado', timeAgo(data.tenant.atualizado)],
                ['Telefone', data.tenant.telefone || '—'],
                ['CNPJ', data.tenant.cnpj || '—'],
                ['Valor plano', fmtMoeda(data.tenant.valor_plano)],
                ['Trial até', fmtData(data.tenant.trial_ate)],
              ].map(([k, v]) => (
                <div key={k} style={{ padding: '4px 0', borderBottom: '1px solid var(--border-1)' }}>
                  <span style={{ color: 'var(--dim)' }}>{k}: </span>{v}
                </div>
              ))}
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {data.tenant.status !== 'cancelado' && (
                <button className="btn btn-danger btn-sm" onClick={handleCancelar}>
                  ✕ Cancelar tenant
                </button>
              )}
              <button className="btn btn-outline btn-sm" onClick={() => onEdit(data.tenant)}>
                ✏️ Editar
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => onClose(false)}>
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function SuperAdmin() {
  const [tenants, setTenants]         = useState([]);
  const [stats, setStats]             = useState(null);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [busca, setBusca]             = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState(null); // null | 'novo' | 'editar' | 'detalhe'
  const [tenantSel, setTenantSel]     = useState(null);
  const [msg, setMsg]                 = useState(null);

  const LIMIT = 15;

  const [health, setHealth] = useState(null);

  const load = useCallback(async (pg = page) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: pg, limit: LIMIT });
      if (busca)        qs.set('busca', busca);
      if (filtroStatus) qs.set('status', filtroStatus);
      const [d, s, h] = await Promise.all([
        apiJson(`/api/super-admin/tenants?${qs}`),
        apiJson('/api/super-admin/stats'),
        apiJson('/api/super-admin/health'),
      ]);
      if (d.ok)  { setTenants(d.tenants); setTotal(d.total); }
      if (s.ok)  setStats(s.stats);
      if (h.ok)  setHealth(h);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, busca, filtroStatus]);

  useEffect(() => { load(1); setPage(1); }, [busca, filtroStatus]);
  useEffect(() => { load(page); }, [page]);

  const showMsg = (texto, tipo = 'ok') => {
    setMsg({ texto, tipo });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleSave = (data) => {
    showMsg(data.mensagem || 'Salvo com sucesso!');
    setModal(null);
    setTenantSel(null);
    load(page);
  };

  const totalPages = Math.ceil(total / LIMIT);

  // ── KPI cards ──────────────────────────────────────────────────────────────
  const kpis = stats ? [
    { label: 'Tenants ativos',    valor: fmtNum(stats.tenants_ativos),   cor: 'var(--accent)' },
    { label: 'Em trial',          valor: fmtNum(stats.tenants_trial),    cor: 'var(--blue)' },
    { label: 'Conversas este mês',valor: fmtNum(stats.conversas_mes),    cor: 'var(--text-1)' },
    { label: 'MRR',               valor: fmtMoeda(stats.mrr),            cor: 'var(--yellow)' },
  ] : [];

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      {/* Header */}
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <h1>🏢 Super Admin</h1>
          <p>Gerenciamento de todos os tenants da plataforma</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {msg && (
            <span style={{ fontSize: '.8rem', padding: '6px 12px', borderRadius: 6,
              background: msg.tipo === 'ok' ? 'rgba(0,200,150,.12)' : 'rgba(255,71,87,.12)',
              color: msg.tipo === 'ok' ? 'var(--accent)' : 'var(--danger)',
              border: `1px solid ${msg.tipo === 'ok' ? 'rgba(0,200,150,.25)' : 'rgba(255,71,87,.25)'}` }}>
              {msg.tipo === 'ok' ? '✓' : '✕'} {msg.texto}
            </span>
          )}
          <button className="btn btn-primary btn-sm"
            onClick={() => { setTenantSel(null); setModal('novo'); }}>
            ➕ Novo tenant
          </button>
        </div>
      </div>

      {/* Status do sistema */}
      {health && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, padding: '10px 16px',
          borderRadius: 10, background: health.status === 'ok' ? 'rgba(0,200,150,.06)'
            : health.status === 'degraded' ? 'rgba(255,71,87,.06)' : 'rgba(245,197,24,.06)',
          border: `1px solid ${health.status === 'ok' ? 'rgba(0,200,150,.2)'
            : health.status === 'degraded' ? 'rgba(255,71,87,.2)' : 'rgba(245,197,24,.2)'}`,
          alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1rem', marginRight: 6 }}>
            {health.status === 'ok' ? '🟢' : health.status === 'degraded' ? '🔴' : '🟡'}
          </span>
          <span style={{ fontWeight: 700, fontSize: '.85rem', marginRight: 16,
            color: health.status === 'ok' ? 'var(--accent)' : health.status === 'degraded' ? 'var(--danger)' : 'var(--warning)' }}>
            Sistema {health.status === 'ok' ? 'operacional' : health.status === 'degraded' ? 'degradado' : 'com alertas'}
          </span>
          {[
            ['DB', health.checks?.db?.status, health.checks?.db?.latencia_ms ? `${health.checks.db.latencia_ms}ms` : null],
            ['RAM', health.checks?.memoria?.status, `${health.checks?.memoria?.rss_mb}MB`],
            ['Uptime', 'ok', `${Math.floor((health.checks?.processo?.uptime_seg||0)/3600)}h`],
          ].map(([label, status, val]) => (
            <span key={label} style={{ fontSize: '.72rem', color: 'var(--dim)',
              marginRight: 14, fontFamily: "'JetBrains Mono'" }}>
              {label}: <span style={{ color: status === 'ok' ? 'var(--accent)' : 'var(--danger)' }}>
                {status}
              </span>{val ? ` (${val})` : ''}
            </span>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
          {kpis.map(k => (
            <div key={k.label} className="card" style={{ textAlign: 'center', padding: '16px' }}>
              <div style={{ fontSize: '1.6rem', fontFamily: "'Bebas Neue',sans-serif", color: k.cor }}>
                {k.valor}
              </div>
              <div style={{ fontSize: '.72rem', color: 'var(--dim)', marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 260 }}
          placeholder="🔍 Buscar por nome, email ou slug..."
          value={busca} onChange={e => setBusca(e.target.value)} />
        <select className="input" style={{ maxWidth: 160 }}
          value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_LIST.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <span style={{ fontSize: '.78rem', color: 'var(--dim)', alignSelf: 'center' }}>
          {fmtNum(total)} tenant{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)' }}>Carregando...</div>
        ) : tenants.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)' }}>
            Nenhum tenant encontrado.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-1)' }}>
                {['Tenant', 'Plano', 'Status', 'Agentes', 'Conv./mês', 'MRR', 'Criado', 'Ações']
                  .map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left',
                      fontWeight: 600, color: 'var(--dim)', fontSize: '.72rem',
                      textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id}
                  style={{ borderBottom: '1px solid var(--border-1)', transition: 'background .15s',
                    cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => { setTenantSel(t); setModal('detalhe'); }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 700 }}>{t.nome}</div>
                    <div style={{ fontSize: '.68rem', color: 'var(--dim)',
                      fontFamily: "'JetBrains Mono'" }}>
                      {t.slug} · {t.email}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontWeight: 700, color: PLANO_COR[t.plano], fontSize: '.78rem' }}>
                      {t.plano?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span className={`badge ${STATUS_BADGE[t.status] || 'badge-yellow'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono'" }}>
                    {fmtNum(t.agentes_ativos)} / {fmtNum(t.limite_agentes)}
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono'" }}>
                    {fmtNum(t.conversas_mes)} / {fmtNum(t.limite_conversas_mes)}
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono'",
                    color: t.valor_plano > 0 ? 'var(--accent)' : 'var(--dim)' }}>
                    {t.valor_plano > 0 ? fmtMoeda(t.valor_plano) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--dim)' }}>
                    {fmtData(t.criado_em)}
                  </td>
                  <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-outline btn-xs"
                      onClick={() => { setTenantSel(t); setModal('editar'); }}>
                      ✏️ Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16 }}>
          <button className="btn btn-outline btn-sm" disabled={page === 1}
            onClick={() => setPage(p => p - 1)}>← Anterior</button>
          <span style={{ alignSelf: 'center', fontSize: '.82rem', color: 'var(--dim)' }}>
            {page} / {totalPages}
          </span>
          <button className="btn btn-outline btn-sm" disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}>Próximo →</button>
        </div>
      )}

      {/* Modals */}
      {(modal === 'novo' || modal === 'editar') && (
        <TenantModal
          tenant={modal === 'editar' ? tenantSel : null}
          onClose={() => { setModal(null); setTenantSel(null); }}
          onSave={handleSave}
        />
      )}
      {modal === 'detalhe' && tenantSel && (
        <TenantDetailModal
          tenantId={tenantSel.id}
          onClose={(recarregar) => {
            setModal(null);
            setTenantSel(null);
            if (recarregar) load(page);
          }}
          onEdit={(t) => { setTenantSel(t); setModal('editar'); }}
        />
      )}
    </div>
  );
}
