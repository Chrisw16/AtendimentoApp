import React, { useState, useEffect, useCallback } from 'react';

const BASE = window.location.origin + '/admin';

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  return res;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

// ── Componente de plano ───────────────────────────────────────────────────────
function PlanCard({ plano, selected, onSelect }) {
  return (
    <div
      onClick={() => onSelect(plano.id)}
      style={{
        border: `2px solid ${selected ? '#00c896' : 'rgba(255,255,255,.08)'}`,
        borderRadius: 14,
        padding: '20px 18px',
        cursor: 'pointer',
        background: selected ? 'rgba(0,200,150,.06)' : 'rgba(255,255,255,.02)',
        transition: 'all .2s',
        position: 'relative',
        flex: 1,
      }}
    >
      {plano.destaque && (
        <div style={{
          position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
          background: '#00c896', color: '#032d3d', fontSize: '.65rem', fontWeight: 800,
          padding: '3px 12px', borderRadius: 20, letterSpacing: '.08em', whiteSpace: 'nowrap',
        }}>MAIS POPULAR</div>
      )}
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.3rem',
        color: selected ? '#00c896' : '#e2e8f0', letterSpacing: 1 }}>
        {plano.nome}
      </div>
      <div style={{ fontSize: '.75rem', color: '#8ba4a0', marginBottom: 12 }}>
        {plano.descricao}
      </div>
      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#e2e8f0', lineHeight: 1 }}>
        {plano.valor === 0
          ? <span style={{ color: '#00c896' }}>Grátis</span>
          : <>R$ {plano.valor}<span style={{ fontSize: '.9rem', fontWeight: 400, color: '#8ba4a0' }}>/mês</span></>
        }
      </div>
      {plano.trial_dias > 0 && (
        <div style={{ fontSize: '.7rem', color: '#3ecfff', marginTop: 4 }}>
          {plano.trial_dias} dias grátis
        </div>
      )}
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {plano.features.map(f => (
          <div key={f} style={{ fontSize: '.75rem', color: '#8ba4a0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#00c896', fontSize: '.8rem' }}>✓</span> {f}
          </div>
        ))}
      </div>
      {selected && (
        <div style={{ marginTop: 14, textAlign: 'center', fontSize: '.72rem',
          color: '#00c896', fontWeight: 700 }}>✓ Selecionado</div>
      )}
    </div>
  );
}

// ── Wizard ────────────────────────────────────────────────────────────────────
export default function Onboarding() {
  const [step, setStep]       = useState(1); // 1 = plano, 2 = dados, 3 = sucesso
  const [planos, setPlanos]   = useState([]);
  const [form, setForm]       = useState({
    plano:       'pro',
    nome:        '',
    slug:        '',
    email:       '',
    telefone:    '',
    senha_admin: '',
    confirmar:   '',
  });
  const [slugStatus, setSlugStatus] = useState(null); // null | 'verificando' | 'disponivel' | 'indisponivel'
  const [erros, setErros]           = useState({});
  const [enviando, setEnviando]     = useState(false);
  const [resultado, setResultado]   = useState(null);
  const [senhaVisivel, setSenhaVisivel] = useState(false);

  // Carrega planos disponíveis
  useEffect(() => {
    apiFetch('/api/onboarding/planos')
      .then(r => r.json())
      .then(d => { if (d.ok) setPlanos(d.planos); })
      .catch(() => {});
  }, []);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErros(e => ({ ...e, [k]: null }));
  };

  // Gera slug automaticamente a partir do nome
  const handleNome = (nome) => {
    const novoSlug = slugify(nome);
    setForm(f => ({ ...f, nome, slug: novoSlug }));
    setErros(e => ({ ...e, nome: null, slug: null }));
    if (novoSlug.length >= 3) verificarSlug(novoSlug);
  };

  // Verifica disponibilidade do slug com debounce
  const verificarSlug = useCallback(async (s) => {
    if (!s || s.length < 3) { setSlugStatus(null); return; }
    setSlugStatus('verificando');
    try {
      const r = await apiFetch(`/api/onboarding/verificar-slug/${s}`);
      const d = await r.json();
      setSlugStatus(d.disponivel ? 'disponivel' : 'indisponivel');
    } catch { setSlugStatus(null); }
  }, []);

  let slugTimer = null;
  const handleSlug = (v) => {
    const slug = slugify(v);
    set('slug', slug);
    if (slugTimer) clearTimeout(slugTimer);
    slugTimer = setTimeout(() => verificarSlug(slug), 600);
  };

  // Validação dos campos
  const validarDados = () => {
    const e = {};
    if (!form.nome.trim())   e.nome = 'Nome da empresa é obrigatório.';
    if (!form.slug.trim())   e.slug = 'Slug é obrigatório.';
    if (slugStatus === 'indisponivel') e.slug = 'Este slug já está em uso.';
    if (!form.email.trim())  e.email = 'E-mail é obrigatório.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'E-mail inválido.';
    if (!form.senha_admin || form.senha_admin.length < 8) e.senha_admin = 'Mínimo 8 caracteres.';
    if (form.senha_admin !== form.confirmar) e.confirmar = 'As senhas não coincidem.';
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validarDados()) return;
    setEnviando(true);
    try {
      const { confirmar, ...body } = form;
      const res = await apiFetch('/api/onboarding/cadastrar', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErros({ geral: data.error || 'Erro ao criar conta.' });
        return;
      }
      setResultado(data);
      setStep(3);
    } catch(e) {
      setErros({ geral: 'Erro de conexão. Tente novamente.' });
    } finally {
      setEnviando(false);
    }
  };

  // ── Estilos base ────────────────────────────────────────────────────────────
  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: '.88rem',
    border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)',
    color: '#e2e8f0', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
    transition: 'border-color .15s',
  };
  const labelStyle = {
    display: 'block', fontSize: '.75rem', color: '#8ba4a0', marginBottom: 5, fontWeight: 600,
  };
  const erroStyle = { fontSize: '.72rem', color: '#ff4757', marginTop: 4 };

  const planoSelecionado = planos.find(p => p.id === form.plano);

  return (
    <div style={{
      minHeight: '100vh', background: '#0a1628',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: step === 1 ? 860 : 520 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: '1.6rem', fontFamily: "'Bebas Neue',sans-serif",
            letterSpacing: 2, color: '#00c896' }}>MAXXI</div>
          <div style={{ fontSize: '.78rem', color: '#8ba4a0', marginTop: 2 }}>
            Plataforma de atendimento com IA
          </div>
        </div>

        {/* Indicador de passo */}
        {step < 3 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, marginBottom: 28 }}>
            {[
              { n: 1, label: 'Escolha o plano' },
              { n: 2, label: 'Seus dados' },
            ].map(({ n, label }) => (
              <React.Fragment key={n}>
                {n > 1 && <div style={{ width: 32, height: 1, background: step >= n ? '#00c896' : 'rgba(255,255,255,.1)' }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', fontSize: '.72rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: step >= n ? '#00c896' : 'rgba(255,255,255,.08)',
                    color: step >= n ? '#032d3d' : '#8ba4a0',
                  }}>{step > n ? '✓' : n}</div>
                  <span style={{ fontSize: '.75rem', color: step >= n ? '#e2e8f0' : '#8ba4a0' }}>
                    {label}
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* ── PASSO 1: Plano ─────────────────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <h1 style={{ textAlign: 'center', fontSize: '1.3rem', fontWeight: 700,
              color: '#e2e8f0', marginBottom: 6 }}>
              Escolha o plano ideal
            </h1>
            <p style={{ textAlign: 'center', color: '#8ba4a0', fontSize: '.82rem', marginBottom: 28 }}>
              Todos os planos incluem o editor visual de fluxos, suporte multi-canal e IA integrada.
            </p>

            <div style={{ display: 'flex', gap: 14, marginBottom: 28 }}>
              {planos.map(p => (
                <PlanCard
                  key={p.id}
                  plano={p}
                  selected={form.plano === p.id}
                  onSelect={(id) => set('plano', id)}
                />
              ))}
            </div>

            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  padding: '12px 40px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#00c896,#00e6aa)',
                  color: '#032d3d', fontWeight: 800, fontSize: '.95rem',
                  transition: 'opacity .15s',
                }}
                onMouseEnter={e => e.target.style.opacity = '.88'}
                onMouseLeave={e => e.target.style.opacity = '1'}
              >
                Continuar com {planoSelecionado?.nome} →
              </button>
              <div style={{ fontSize: '.72rem', color: '#5a7370', marginTop: 10 }}>
                Sem cartão de crédito para planos gratuitos • Cancele quando quiser
              </div>
            </div>
          </div>
        )}

        {/* ── PASSO 2: Dados ─────────────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{
            background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)',
            borderRadius: 16, padding: '32px 28px',
          }}>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
              Crie sua conta
            </h1>
            <p style={{ color: '#8ba4a0', fontSize: '.78rem', marginBottom: 24 }}>
              Plano <strong style={{ color: '#00c896' }}>{planoSelecionado?.nome}</strong>
              {planoSelecionado?.trial_dias > 0 && ` · ${planoSelecionado.trial_dias} dias grátis`}
              <span style={{ float: 'right', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => setStep(1)}>← Mudar plano</span>
            </p>

            {erros.geral && (
              <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                background: 'rgba(255,71,87,.1)', color: '#ff4757',
                border: '1px solid rgba(255,71,87,.2)', fontSize: '.82rem' }}>
                {erros.geral}
              </div>
            )}

            {/* Nome */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Nome da empresa *</label>
              <input
                style={{ ...inputStyle, borderColor: erros.nome ? '#ff4757' : 'rgba(255,255,255,.1)' }}
                value={form.nome} placeholder="Ex: Fibra Norte Internet"
                onChange={e => handleNome(e.target.value)}
              />
              {erros.nome && <div style={erroStyle}>{erros.nome}</div>}
            </div>

            {/* Slug */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                Slug (identificador único) *
                <span style={{ color: '#5a7370', fontWeight: 400, marginLeft: 6 }}>
                  app.maxxi.ai/{form.slug || 'seu-slug'}
                </span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...inputStyle,
                    borderColor: erros.slug ? '#ff4757'
                      : slugStatus === 'disponivel' ? '#00c896'
                      : slugStatus === 'indisponivel' ? '#ff4757'
                      : 'rgba(255,255,255,.1)',
                    paddingRight: 36,
                  }}
                  value={form.slug}
                  placeholder="fibra-norte"
                  onChange={e => handleSlug(e.target.value)}
                />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  fontSize: '.8rem' }}>
                  {slugStatus === 'verificando' && '⏳'}
                  {slugStatus === 'disponivel'  && '✅'}
                  {slugStatus === 'indisponivel' && '❌'}
                </span>
              </div>
              {erros.slug && <div style={erroStyle}>{erros.slug}</div>}
              {slugStatus === 'disponivel' && !erros.slug && (
                <div style={{ fontSize: '.72rem', color: '#00c896', marginTop: 4 }}>
                  ✓ Disponível
                </div>
              )}
              {slugStatus === 'indisponivel' && (
                <div style={erroStyle}>Este slug já está em uso. Escolha outro.</div>
              )}
            </div>

            {/* E-mail */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>E-mail corporativo *</label>
              <input
                style={{ ...inputStyle, borderColor: erros.email ? '#ff4757' : 'rgba(255,255,255,.1)' }}
                type="email" value={form.email}
                placeholder="admin@suaempresa.com.br"
                onChange={e => set('email', e.target.value)}
              />
              {erros.email && <div style={erroStyle}>{erros.email}</div>}
            </div>

            {/* Telefone */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Telefone (WhatsApp)</label>
              <input
                style={inputStyle}
                value={form.telefone}
                placeholder="(84) 99999-9999"
                onChange={e => set('telefone', e.target.value)}
              />
            </div>

            {/* Senha */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Senha do painel (admin) *</label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...inputStyle,
                    borderColor: erros.senha_admin ? '#ff4757' : 'rgba(255,255,255,.1)',
                    paddingRight: 36 }}
                  type={senhaVisivel ? 'text' : 'password'}
                  value={form.senha_admin}
                  placeholder="Mínimo 8 caracteres"
                  onChange={e => set('senha_admin', e.target.value)}
                />
                <button type="button"
                  onClick={() => setSenhaVisivel(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#8ba4a0', fontSize: 14 }}>
                  {senhaVisivel ? '🙈' : '👁'}
                </button>
              </div>
              {erros.senha_admin && <div style={erroStyle}>{erros.senha_admin}</div>}
            </div>

            {/* Confirmar senha */}
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Confirmar senha *</label>
              <input
                style={{ ...inputStyle,
                  borderColor: erros.confirmar ? '#ff4757' : 'rgba(255,255,255,.1)' }}
                type="password"
                value={form.confirmar}
                placeholder="Digite a senha novamente"
                onChange={e => set('confirmar', e.target.value)}
              />
              {erros.confirmar && <div style={erroStyle}>{erros.confirmar}</div>}
            </div>

            <button
              onClick={handleSubmit}
              disabled={enviando}
              style={{
                width: '100%', padding: '13px', borderRadius: 8, border: 'none',
                cursor: enviando ? 'not-allowed' : 'pointer',
                background: enviando ? 'rgba(0,200,150,.4)' : 'linear-gradient(135deg,#00c896,#00e6aa)',
                color: '#032d3d', fontWeight: 800, fontSize: '.95rem',
                transition: 'opacity .15s',
              }}
            >
              {enviando ? 'Criando sua conta...' : 'Criar conta gratuitamente →'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 14, fontSize: '.72rem', color: '#5a7370' }}>
              Ao criar sua conta você concorda com os{' '}
              <a href="#" style={{ color: '#8ba4a0' }}>Termos de Uso</a> e{' '}
              <a href="#" style={{ color: '#8ba4a0' }}>Política de Privacidade</a>.
            </div>
          </div>
        )}

        {/* ── PASSO 3: Sucesso ───────────────────────────────────────────────── */}
        {step === 3 && resultado && (
          <div style={{
            background: 'rgba(0,200,150,.04)', border: '1px solid rgba(0,200,150,.2)',
            borderRadius: 16, padding: '40px 32px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎉</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#e2e8f0', marginBottom: 8 }}>
              Conta criada com sucesso!
            </h1>
            <p style={{ color: '#8ba4a0', fontSize: '.85rem', marginBottom: 28, lineHeight: 1.7 }}>
              Sua conta <strong style={{ color: '#e2e8f0' }}>{form.nome}</strong> está pronta.<br />
              {resultado.trial_ate
                ? `Você tem 14 dias de trial gratuito.`
                : `Plano ${planoSelecionado?.nome} ativado.`}
            </p>

            {/* Instruções de acesso */}
            <div style={{
              background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 10, padding: '20px', marginBottom: 24, textAlign: 'left',
            }}>
              <div style={{ fontSize: '.75rem', color: '#00c896', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
                Seus dados de acesso
              </div>
              {[
                ['URL do painel', `${window.location.origin}/admin`],
                ['Login', 'admin'],
                ['Senha', '(a senha que você cadastrou)'],
                ['Slug', resultado.slug],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                  padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.05)',
                  fontSize: '.82rem' }}>
                  <span style={{ color: '#8ba4a0' }}>{k}</span>
                  <span style={{ color: '#e2e8f0', fontFamily: "'JetBrains Mono'" }}>{v}</span>
                </div>
              ))}
            </div>

            <a
              href="/admin"
              style={{
                display: 'inline-block', padding: '13px 36px', borderRadius: 8,
                background: 'linear-gradient(135deg,#00c896,#00e6aa)',
                color: '#032d3d', fontWeight: 800, fontSize: '.95rem',
                textDecoration: 'none',
              }}
            >
              Acessar o painel →
            </a>

            <div style={{ marginTop: 16, fontSize: '.72rem', color: '#5a7370' }}>
              Salve suas credenciais antes de fechar esta página.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
