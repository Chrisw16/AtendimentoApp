import React, { useEffect, useState, useCallback } from 'react';
import { api, apiJson } from '../api';

// ── Helpers ──────────────────────────────────────────────────────────────────
const PLACEHOLDER_SENSIVEL = '••••••';

function Badge({ ok, loading }) {
  if (loading) return <span className="badge badge-yellow">Testando...</span>;
  if (ok === true)  return <span className="badge badge-green">● Conectado</span>;
  if (ok === false) return <span className="badge badge-red">● Erro</span>;
  return <span className="badge" style={{ color: 'var(--dim)' }}>○ Não testado</span>;
}

function Field({ label, name, value, onChange, type = 'text', placeholder, hint, sensivel }) {
  const [mostrar, setMostrar] = useState(false);
  const ehSensivel = sensivel || (value === PLACEHOLDER_SENSIVEL);
  const inputType = (type === 'password' || ehSensivel) ? (mostrar ? 'text' : 'password') : type;
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: '.78rem', color: 'var(--text-2)', marginBottom: 5, fontWeight: 600 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          className="input"
          type={inputType}
          value={value || ''}
          placeholder={placeholder || ''}
          onChange={e => onChange(name, e.target.value)}
          style={{ paddingRight: (type === 'password' || ehSensivel) ? 36 : 12 }}
        />
        {(type === 'password' || ehSensivel) && (
          <button
            type="button"
            onClick={() => setMostrar(m => !m)}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontSize: 14 }}
          >{mostrar ? '🙈' : '👁'}</button>
        )}
      </div>
      {hint && <div style={{ fontSize: '.68rem', color: 'var(--dim)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '.08em',
        textTransform: 'uppercase', marginBottom: 12, borderBottom: '1px solid var(--border-1)', paddingBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Abas ─────────────────────────────────────────────────────────────────────
const ABAS = [
  { id: 'identidade',  label: '🏢 Identidade'   },
  { id: 'integracoes', label: '🔌 Integrações'   },
  { id: 'ia',          label: '🧠 Chaves de IA'  },
  { id: 'plano',       label: '📊 Meu Plano'     },
];

// ── Componente principal ──────────────────────────────────────────────────────
export default function Configuracoes() {
  const [aba, setAba]             = useState('identidade');
  const [configs, setConfigs]     = useState({});
  const [tenant, setTenant]       = useState({});
  const [status, setStatus]       = useState(null);
  const [form, setForm]           = useState({});
  const [salvando, setSalvando]   = useState(false);
  const [testando, setTestando]   = useState(false);
  const [testes, setTestes]       = useState({});
  const [msg, setMsg]             = useState(null); // { tipo: 'ok'|'erro', texto }
  const [carregando, setCarregando] = useState(true);

  // ── Carrega configs e status ────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      apiJson('/api/tenant/config'),
      apiJson('/api/tenant/status'),
    ]).then(([configData, statusData]) => {
      if (configData?.ok) {
        setConfigs(configData.configs || {});
        setTenant(configData.tenant || {});
        // Inicializa o form com os valores atuais (sensíveis mostram placeholder)
        const f = {};
        for (const [k, v] of Object.entries(configData.configs || {})) {
          f[k] = v.preenchido && v.valor === PLACEHOLDER_SENSIVEL ? PLACEHOLDER_SENSIVEL : (v.valor || '');
        }
        // Campos do tenant
        const t = configData.tenant || {};
        f['_empresa_nome']  = t.nome        || '';
        f['_empresa_email'] = t.email       || '';
        f['_empresa_tel']   = t.telefone    || '';
        f['_empresa_cnpj']  = t.cnpj        || '';
        f['_fuso']          = t.fuso_horario || 'America/Fortaleza';
        setForm(f);
      }
      if (statusData?.ok) setStatus(statusData);
    }).catch(console.error)
      .finally(() => setCarregando(false));
  }, []);

  const set = useCallback((campo, valor) => {
    setForm(f => ({ ...f, [campo]: valor }));
  }, []);

  // ── Salvar configs ──────────────────────────────────────────────────────────
  const salvar = async () => {
    setSalvando(true);
    setMsg(null);
    try {
      // Separa campos de identidade dos de config
      const identidade = {};
      const configPayload = {};

      for (const [k, v] of Object.entries(form)) {
        if (k.startsWith('_')) {
          // campos do tenant
          const map = { '_empresa_nome': 'nome', '_empresa_email': 'email',
            '_empresa_tel': 'telefone', '_empresa_cnpj': 'cnpj', '_fuso': 'fuso_horario' };
          if (map[k]) identidade[map[k]] = v;
        } else {
          // Não envia placeholder — campo sensível não alterado
          if (v !== PLACEHOLDER_SENSIVEL) configPayload[k] = v;
        }
      }

      const [r1, r2] = await Promise.all([
        Object.keys(configPayload).length > 0
          ? api('/api/tenant/config', { method: 'PUT', body: JSON.stringify(configPayload) })
          : Promise.resolve({ ok: true }),
        Object.keys(identidade).length > 0
          ? api('/api/tenant/identidade', { method: 'PUT', body: JSON.stringify(identidade) })
          : Promise.resolve({ ok: true }),
      ]);

      if (r1.ok && r2.ok) {
        setMsg({ tipo: 'ok', texto: 'Configurações salvas com sucesso!' });
      } else {
        setMsg({ tipo: 'erro', texto: 'Erro ao salvar. Verifique os dados.' });
      }
    } catch(e) {
      setMsg({ tipo: 'erro', texto: e.message });
    } finally {
      setSalvando(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  // ── Testar conexões ─────────────────────────────────────────────────────────
  const testar = async () => {
    setTestando(true);
    setTestes({});
    try {
      const data = await apiJson('/api/tenant/config/test', { method: 'POST' });
      setTestes(data.resultados || {});
    } catch(e) {
      setMsg({ tipo: 'erro', texto: 'Erro ao testar conexões: ' + e.message });
    } finally {
      setTestando(false);
    }
  };

  if (carregando) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)' }}>Carregando configurações...</div>
  );

  return (
    <div style={{ animation: 'fadeIn .35s ease', maxWidth: 860, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <h1>⚙️ Configurações</h1>
          <p>Configure as integrações e dados do seu tenant</p>
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
          <button className="btn btn-outline btn-sm" onClick={testar} disabled={testando}>
            {testando ? 'Testando...' : '🔌 Testar conexões'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : '💾 Salvar'}
          </button>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border-1)', paddingBottom: 0 }}>
        {ABAS.map(a => (
          <button key={a.id} onClick={() => setAba(a.id)}
            style={{ padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              color: aba === a.id ? 'var(--accent)' : 'var(--text-2)',
              borderBottom: aba === a.id ? '2px solid var(--accent)' : '2px solid transparent',
              fontSize: '.85rem', fontWeight: aba === a.id ? 700 : 400,
              transition: 'all .15s', marginBottom: -1 }}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ── ABA: IDENTIDADE ─────────────────────────────────────────────────── */}
      {aba === 'identidade' && (
        <div className="card">
          <Section title="Dados da empresa">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <Field label="Nome da empresa" name="_empresa_nome" value={form._empresa_nome}
                onChange={set} placeholder="Ex: Fibra Norte Internet" />
              <Field label="E-mail de contato" name="_empresa_email" value={form._empresa_email}
                onChange={set} placeholder="admin@fibranorte.com.br" />
              <Field label="Telefone" name="_empresa_tel" value={form._empresa_tel}
                onChange={set} placeholder="(84) 99999-9999" />
              <Field label="CNPJ" name="_empresa_cnpj" value={form._empresa_cnpj}
                onChange={set} placeholder="00.000.000/0001-00" />
            </div>
          </Section>

          <Section title="Identidade do assistente virtual">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <Field label="Nome do bot" name="bot_nome" value={form.bot_nome}
                onChange={set} placeholder="Ex: Maxxi, Fibra, Nina..." hint="Como o assistente se apresenta aos clientes" />
              <Field label="Segmento da empresa" name="empresa_segmento" value={form.empresa_segmento}
                onChange={set} placeholder="isp" hint="isp | telecom | varejo | servicos" />
            </div>
          </Section>

          <Section title="Regional">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '.78rem', color: 'var(--text-2)', marginBottom: 5, fontWeight: 600 }}>
                  Fuso horário
                </label>
                <select className="input" value={form._fuso || 'America/Fortaleza'}
                  onChange={e => set('_fuso', e.target.value)}>
                  <option value="America/Fortaleza">America/Fortaleza (UTC-3)</option>
                  <option value="America/Sao_Paulo">America/Sao_Paulo (UTC-3/-2)</option>
                  <option value="America/Recife">America/Recife (UTC-3)</option>
                  <option value="America/Belem">America/Belem (UTC-3)</option>
                  <option value="America/Manaus">America/Manaus (UTC-4)</option>
                  <option value="America/Rio_Branco">America/Rio_Branco (UTC-5)</option>
                  <option value="America/Noronha">America/Noronha (UTC-2)</option>
                </select>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ── ABA: INTEGRAÇÕES ────────────────────────────────────────────────── */}
      {aba === 'integracoes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* SGP / ERP */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.3rem' }}>🏢</span>
                <div>
                  <div style={{ fontWeight: 700 }}>ERP / SGP</div>
                  <div style={{ fontSize: '.73rem', color: 'var(--dim)' }}>Sistema de gestão de clientes e contratos</div>
                </div>
              </div>
              <Badge ok={testes.sgp?.ok} loading={testando && testes.sgp === undefined} />
            </div>
            {testes.sgp?.erro && <div style={{ fontSize: '.72rem', color: 'var(--danger)', marginBottom: 10 }}>Erro: {testes.sgp.erro}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <Field label="URL base do SGP" name="sgp_url" value={form.sgp_url}
                onChange={set} placeholder="https://seugp.sgp.net.br" hint="Sem barra no final" />
              <Field label="App ID" name="sgp_app" value={form.sgp_app}
                onChange={set} placeholder="n8n" hint="Valor 'app' usado nas requisições" />
            </div>
            <Field label="Token de autenticação" name="sgp_token" value={form.sgp_token}
              onChange={set} type="password" sensivel placeholder="Token SGP" hint="Encontre em: Sistema → Integrações → Token API" />
          </div>

          {/* Chatwoot */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.3rem' }}>💬</span>
                <div>
                  <div style={{ fontWeight: 700 }}>Chatwoot</div>
                  <div style={{ fontSize: '.73rem', color: 'var(--dim)' }}>Plataforma de gerenciamento de conversas</div>
                </div>
              </div>
              <Badge ok={testes.chatwoot?.ok} loading={testando && testes.chatwoot === undefined} />
            </div>
            {testes.chatwoot?.erro && <div style={{ fontSize: '.72rem', color: 'var(--danger)', marginBottom: 10 }}>Erro: {testes.chatwoot.erro}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <Field label="URL do Chatwoot" name="chatwoot_url" value={form.chatwoot_url}
                onChange={set} placeholder="https://chat.suaempresa.com.br" />
              <Field label="Account ID" name="chatwoot_account_id" value={form.chatwoot_account_id}
                onChange={set} placeholder="1" hint="Configurações → Conta → ID" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <Field label="API Token" name="chatwoot_api_token" value={form.chatwoot_api_token}
                onChange={set} type="password" sensivel placeholder="Token da API" hint="Perfil → Tokens de acesso" />
              <Field label="ID do time humano" name="chatwoot_human_team_id" value={form.chatwoot_human_team_id}
                onChange={set} placeholder="1" hint="Configurações → Times" />
            </div>
          </div>

          {/* Evolution API */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.3rem' }}>📱</span>
                <div>
                  <div style={{ fontWeight: 700 }}>WhatsApp — Evolution API</div>
                  <div style={{ fontSize: '.73rem', color: 'var(--dim)' }}>Envio de botões, listas, PIX e templates</div>
                </div>
              </div>
              <Badge ok={testes.evolution?.ok} loading={testando && testes.evolution === undefined} />
            </div>
            {testes.evolution?.erro && <div style={{ fontSize: '.72rem', color: 'var(--danger)', marginBottom: 10 }}>Erro: {testes.evolution.erro}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <Field label="URL da Evolution API" name="evolution_url" value={form.evolution_url}
                onChange={set} placeholder="https://evo.suaempresa.com.br" />
              <Field label="Nome da instância" name="evolution_instancia" value={form.evolution_instancia}
                onChange={set} placeholder="nome-da-instancia" />
            </div>
            <Field label="API Key" name="evolution_api_key" value={form.evolution_api_key}
              onChange={set} type="password" sensivel placeholder="API Key da Evolution" />
          </div>

          {/* WhatsApp Business (Meta) */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.3rem' }}>✅</span>
                <div>
                  <div style={{ fontWeight: 700 }}>WhatsApp Business API (Meta)</div>
                  <div style={{ fontSize: '.73rem', color: 'var(--dim)' }}>Número oficial verificado pelo Meta</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <Field label="Phone Number ID" name="wa_phone_number_id" value={form.wa_phone_number_id}
                onChange={set} placeholder="123456789012345" />
              <Field label="Verify Token (webhook)" name="wa_verify_token" value={form.wa_verify_token}
                onChange={set} type="password" sensivel placeholder="Token de verificação do webhook" />
            </div>
            <Field label="Access Token" name="wa_access_token" value={form.wa_access_token}
              onChange={set} type="password" sensivel placeholder="EAAxxxxxxx..." hint="Meta Business → Ferramentas de desenvolvedor" />
          </div>

          {/* Telegram */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: '1.3rem' }}>✈️</span>
              <div>
                <div style={{ fontWeight: 700 }}>Telegram</div>
                <div style={{ fontSize: '.73rem', color: 'var(--dim)' }}>Bot do Telegram (opcional)</div>
              </div>
            </div>
            <Field label="Bot Token" name="telegram_bot_token" value={form.telegram_bot_token}
              onChange={set} type="password" sensivel placeholder="123456:AABBCC..." hint="Obtido via @BotFather" />
          </div>
        </div>
      )}

      {/* ── ABA: CHAVES DE IA ───────────────────────────────────────────────── */}
      {aba === 'ia' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.3rem' }}>🧠</span>
                <div>
                  <div style={{ fontWeight: 700 }}>Anthropic (Claude)</div>
                  <div style={{ fontSize: '.73rem', color: 'var(--dim)' }}>Motor IA principal do assistente</div>
                </div>
              </div>
              <Badge ok={testes.anthropic?.ok} loading={testando && testes.anthropic === undefined} />
            </div>
            {testes.anthropic?.erro && <div style={{ fontSize: '.72rem', color: 'var(--danger)', marginBottom: 10 }}>Erro: {testes.anthropic.erro}</div>}
            <Field label="API Key" name="anthropic_api_key" value={form.anthropic_api_key}
              onChange={set} type="password" sensivel placeholder="sk-ant-..." hint="console.anthropic.com → API Keys" />
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.3rem' }}>🤖</span>
                <div>
                  <div style={{ fontWeight: 700 }}>OpenAI</div>
                  <div style={{ fontSize: '.73rem', color: 'var(--dim)' }}>Transcrição de áudio (Whisper) e fallback GPT</div>
                </div>
              </div>
              <Badge ok={testes.openai?.ok} loading={testando && testes.openai === undefined} />
            </div>
            {testes.openai?.erro && <div style={{ fontSize: '.72rem', color: 'var(--danger)', marginBottom: 10 }}>Erro: {testes.openai.erro}</div>}
            <Field label="API Key" name="openai_api_key" value={form.openai_api_key}
              onChange={set} type="password" sensivel placeholder="sk-proj-..." hint="platform.openai.com → API Keys" />
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: '1.3rem' }}>🔊</span>
              <div>
                <div style={{ fontWeight: 700 }}>ElevenLabs</div>
                <div style={{ fontSize: '.73rem', color: 'var(--dim)' }}>Síntese de voz para respostas em áudio (opcional)</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <Field label="API Key" name="elevenlabs_api_key" value={form.elevenlabs_api_key}
                onChange={set} type="password" sensivel placeholder="API Key ElevenLabs" />
              <Field label="Voice ID" name="elevenlabs_voice_id" value={form.elevenlabs_voice_id}
                onChange={set} placeholder="pNInz6obpgDQGcFmaJgB" hint="ID da voz no ElevenLabs" />
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: '1.3rem' }}>📱</span>
              <div>
                <div style={{ fontWeight: 700 }}>Gateway SMS</div>
                <div style={{ fontSize: '.73rem', color: 'var(--dim)' }}>Envio de SMS para clientes via SGP</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              <Field label="Token do gateway" name="sms_gateway_token" value={form.sms_gateway_token}
                onChange={set} type="password" sensivel placeholder="Token configurado no SGP" />
              <Field label="Template aprovado (Meta)" name="sms_gateway_template" value={form.sms_gateway_template}
                onChange={set} placeholder="nome_do_template" hint="Opcional — para envios fora da janela 24h" />
            </div>
          </div>
        </div>
      )}

      {/* ── ABA: MEU PLANO ──────────────────────────────────────────────────── */}
      {aba === 'plano' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {status ? (
            <>
              {/* Card do plano */}
              <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '.72rem', color: 'var(--dim)', textTransform: 'uppercase',
                      letterSpacing: '.08em', marginBottom: 4 }}>Plano atual</div>
                    <div style={{ fontSize: '1.6rem', fontFamily: "'Bebas Neue',sans-serif",
                      color: 'var(--accent)', letterSpacing: 1 }}>
                      {status.plano?.toUpperCase()}
                    </div>
                  </div>
                  <span className={`badge ${status.status === 'ativo' ? 'badge-green' : 'badge-yellow'}`}>
                    {status.status === 'ativo' ? '● Ativo' : status.status}
                  </span>
                </div>
                {status.trial_ate && (
                  <div style={{ marginTop: 10, fontSize: '.78rem', color: 'var(--warning)' }}>
                    ⏱ Trial ativo até: {new Date(status.trial_ate).toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>

              {/* Uso e limites */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  { label: 'Agentes ativos', icon: '👥', uso: status.limites?.agentes?.usado, limite: status.limites?.agentes?.limite },
                  { label: 'Conversas este mês', icon: '💬', uso: status.limites?.conversas_mes?.usado, limite: status.limites?.conversas_mes?.limite },
                ].map(item => {
                  const pct = item.limite > 0 ? Math.min(100, Math.round((item.uso / item.limite) * 100)) : 0;
                  const cor = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--accent)';
                  return (
                    <div key={item.label} className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: '.82rem', fontWeight: 600 }}>{item.icon} {item.label}</span>
                        <span style={{ fontSize: '.82rem', fontFamily: "'JetBrains Mono',monospace" }}>
                          {item.uso} / {item.limite}
                        </span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--border-1)' }}>
                        <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`,
                          background: cor, transition: 'width .4s ease' }} />
                      </div>
                      <div style={{ fontSize: '.68rem', color: 'var(--dim)', marginTop: 4, textAlign: 'right' }}>
                        {pct}% utilizado
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Uso de IA */}
              <div className="card">
                <div style={{ fontSize: '.72rem', color: 'var(--accent)', textTransform: 'uppercase',
                  letterSpacing: '.08em', marginBottom: 12, fontWeight: 700 }}>Uso de IA</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { label: 'Atendimentos', valor: status.uso_ia?.atendimentos?.toLocaleString('pt-BR') },
                    { label: 'Tokens entrada', valor: status.uso_ia?.tokens_input?.toLocaleString('pt-BR') },
                    { label: 'Tokens saída', valor: status.uso_ia?.tokens_output?.toLocaleString('pt-BR') },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: 'center', padding: '14px 0' }}>
                      <div style={{ fontSize: '1.4rem', fontFamily: "'Bebas Neue',sans-serif", color: 'var(--text-1)' }}>
                        {m.valor || '0'}
                      </div>
                      <div style={{ fontSize: '.68rem', color: 'var(--dim)', marginTop: 4 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card" style={{ textAlign: 'center', padding: '24px 20px' }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Precisa de mais recursos?</div>
                <div style={{ fontSize: '.82rem', color: 'var(--dim)', marginBottom: 16 }}>
                  Entre em contato para fazer upgrade do seu plano.
                </div>
                <a href="mailto:suporte@maxxi.ai" className="btn btn-primary btn-sm">
                  📧 Falar com o suporte
                </a>
              </div>
            </>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--dim)' }}>
              Não foi possível carregar o status do plano.
            </div>
          )}
        </div>
      )}

      {/* Botão salvar fixo no fundo */}
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn btn-outline" onClick={testar} disabled={testando}>
          {testando ? 'Testando...' : '🔌 Testar todas as conexões'}
        </button>
        <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando...' : '💾 Salvar configurações'}
        </button>
      </div>
    </div>
  );
}
