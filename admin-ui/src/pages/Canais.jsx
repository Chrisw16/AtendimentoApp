import React, { useEffect, useState, useCallback } from 'react';
import { api, apiJson, fetchCanais, fetchCanal, salvarCanal, ativarCanal, registrarWebhookTelegram, statusWebhookTelegram, fetchWebhookUrls, fetchConversas } from '../api';
import { useStore } from '../store';

const CANAL_META = {
  whatsapp:  { icon: '📱', color: '#25D366', label: 'WhatsApp', fields: [
    { id: 'phoneNumberId', label: 'Phone Number ID', ph: 'Ex: 123456789012345' },
    { id: 'wabaId', label: 'WABA ID', ph: 'Business Account ID' },
    { id: 'accessToken', label: 'Access Token (permanente)', ph: 'EAAxxxxxxxx...', secret: true },
    { id: 'verifyToken', label: 'Verify Token', ph: 'Token de verificação do webhook' },
  ], guide: { titulo: 'Configurar WhatsApp Business API', passos: [
    { n: 1, icon: '🔗', titulo: 'Criar App no Meta', desc: 'Acesse developers.facebook.com → Criar App → Tipo: Business' },
    { n: 2, icon: '📱', titulo: 'Adicionar WhatsApp', desc: 'No app, adicione o produto "WhatsApp" e configure o número' },
    { n: 3, icon: '🔑', titulo: 'Gerar Token', desc: 'Em Configurações → Tokens → Gerar token permanente' },
    { n: 4, icon: '🔗', titulo: 'Configurar Webhook', desc: 'Cole a URL do webhook e o Verify Token nos campos abaixo' },
  ]}},
  telegram:  { icon: '✈️', color: '#0088cc', label: 'Telegram', fields: [
    { id: 'botToken', label: 'Bot Token', ph: 'Token do @BotFather', secret: true },
  ], guide: { titulo: 'Configurar Bot Telegram', passos: [
    { n: 1, icon: '🤖', titulo: 'Criar Bot', desc: 'Abra @BotFather no Telegram → /newbot → siga as instruções' },
    { n: 2, icon: '🔑', titulo: 'Copiar Token', desc: 'O BotFather vai te dar um token. Cole abaixo.' },
    { n: 3, icon: '🔗', titulo: 'Registrar Webhook', desc: 'Após salvar, clique em "Registrar Webhook" no card.' },
  ]}},
  instagram: { icon: '📸', color: '#E1306C', label: 'Instagram', fields: [
    { id: 'pageId', label: 'Page ID (Facebook)', ph: 'ID da página vinculada' },
    { id: 'accessToken', label: 'Access Token', ph: 'Token com permissões de Instagram', secret: true },
  ], guide: { titulo: 'Configurar Instagram Messaging', passos: [
    { n: 1, icon: '📱', titulo: 'Conta Business', desc: 'Instagram deve ser conta Business vinculada a uma Facebook Page' },
    { n: 2, icon: '🔗', titulo: 'App Meta', desc: 'No app Meta, ative o produto "Instagram" e gere o token' },
  ]}},
  facebook:  { icon: '👤', color: '#1877F2', label: 'Facebook Messenger', fields: [
    { id: 'pageId', label: 'Page ID', ph: 'ID da página' },
    { id: 'accessToken', label: 'Page Access Token', ph: 'Token da página', secret: true },
    { id: 'verifyToken', label: 'Verify Token', ph: 'Token de verificação webhook' },
  ], guide: { titulo: 'Configurar Messenger', passos: [
    { n: 1, icon: '📄', titulo: 'Página Facebook', desc: 'Tenha uma Facebook Page ativa' },
    { n: 2, icon: '🔗', titulo: 'App Meta + Messenger', desc: 'Crie app, adicione produto Messenger, vincule a página' },
    { n: 3, icon: '🔑', titulo: 'Token', desc: 'Gere o Page Access Token e configure o webhook' },
  ]}},
  widget:    { icon: '🌐', color: '#00c896', label: 'Widget Web' },
  chatwoot:  { icon: '💬', color: '#1F93FF', label: 'Chatwoot' },
};

function FluxoSelect({ canalTipo, fluxos }) {
  const [fluxoId, setFluxoId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiJson(`/api/canais/${canalTipo}/fluxo`).then(r => {
      setFluxoId(r.fluxo_id || '');
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [canalTipo]);

  const [saveError, setSaveError] = useState(null);

  const salvar = async (val) => {
    setFluxoId(val);
    setSaving(true);
    setSaveError(null);
    try {
      const res = await api(`/api/canais/${canalTipo}/fluxo`, { method: 'PUT', body: JSON.stringify({ fluxo_id: val || null }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setSaveError(data.error || `Erro HTTP ${res.status}`);
        console.error('Erro ao salvar fluxo:', data);
      }
    } catch(e) {
      setSaveError(e.message);
      console.error('Erro ao salvar fluxo:', e);
    }
    setSaving(false);
  };

  if (!loaded) return null;

  return (
    <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(0,200,150,.04)', borderRadius: 8, border: '1px solid rgba(0,200,150,.15)' }}>
      <div style={{ fontSize: '.6rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5, fontWeight: 700 }}>
        ⚡ Fluxo de atendimento
      </div>
      <select value={fluxoId || ''} onChange={e => salvar(e.target.value)}
        style={{ width: '100%', background: 'rgba(3,45,61,.6)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '5px 8px', color: '#fff', fontSize: '.78rem', outline: 'none', cursor: 'pointer' }}>
        <option value=''>— IA padrão (sem fluxo visual) —</option>
        {fluxos.map(f => (
          <option key={f.id} value={f.id}>
            {f.nome}{f.ativo ? ' ● ativo' : f.publicado ? ' (publicado)' : ''}
          </option>
        ))}
      </select>
      {saving && <div style={{ fontSize: '.62rem', color: 'var(--accent)', marginTop: 3 }}>Salvando...</div>}
      {saveError && <div style={{ fontSize: '.62rem', color: '#ff4757', marginTop: 3 }}>Erro: {saveError}</div>}
      {!saving && !saveError && fluxoId && <div style={{ fontSize: '.62rem', color: 'rgba(255,255,255,.35)', marginTop: 3 }}>Fluxo vinculado — ativo neste canal</div>}
      {!saving && !saveError && !fluxoId && <div style={{ fontSize: '.62rem', color: 'rgba(255,255,255,.25)', marginTop: 3 }}>Usando IA diretamente (comportamento atual)</div>}
    </div>
  );
}

function CanalCard({ canal, metrics, onConfig, onToggle, onTelegramWebhook, webhookUrl, fluxos }) {
  const meta = CANAL_META[canal.tipo] || { icon: '📡', color: '#666', label: canal.tipo };
  const convHoje = metrics?.hoje || 0;
  const convSemana = metrics?.semana || 0;

  return (
    <div style={{
      background: 'var(--glass)', backdropFilter: 'blur(8px)', border: `1px solid ${canal.ativo ? `${meta.color}33` : 'var(--glass-border)'}`,
      borderRadius: 14, padding: 20, transition: 'all .25s', animation: 'fadeInUp .4s ease both',
      borderTop: `3px solid ${canal.ativo ? meta.color : 'var(--dim)'}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: '1.8rem', width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${meta.color}15`, border: `1px solid ${meta.color}30`, transition: '.25s' }}>{meta.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '.92rem' }}>{meta.label}</div>
          <div style={{ fontSize: '.7rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace" }}>{canal.tipo}</div>
        </div>
        <span className={`badge ${canal.ativo ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '.62rem' }}>
          {canal.ativo ? '● Ativo' : '○ Inativo'}
        </span>
      </div>

      {/* Metrics */}
      {canal.ativo && (convHoje > 0 || convSemana > 0) && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, padding: '8px 10px', background: 'rgba(3,45,61,.4)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '.62rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Hoje</div>
            <div style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: 'var(--g1)', fontSize: '.95rem' }}>{convHoje}</div>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '.62rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Semana</div>
            <div style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", fontSize: '.95rem' }}>{convSemana}</div>
          </div>
        </div>
      )}

      {/* Webhook URL */}
      {webhookUrl && canal.tipo !== 'chatwoot' && canal.tipo !== 'widget' && (
        <div style={{ marginBottom: 12, padding: '6px 10px', background: 'rgba(3,45,61,.4)', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.6rem', color: 'var(--dim)' }}>Webhook</div>
            <div style={{ fontSize: '.65rem', color: 'var(--g1)', fontFamily: "'JetBrains Mono',monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{webhookUrl}</div>
          </div>
          <button className="btn btn-outline btn-xs" onClick={() => { navigator.clipboard?.writeText(webhookUrl); }} style={{ flexShrink: 0 }}>📋</button>
        </div>
      )}

      {/* Fluxo vinculado */}
      {canal.tipo !== 'chatwoot' && fluxos?.length > 0 && (
        <FluxoSelect canalTipo={canal.tipo} fluxos={fluxos} />
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {canal.tipo !== 'chatwoot' && canal.tipo !== 'widget' && (
          <button className="btn btn-outline btn-sm" onClick={() => onConfig(canal)}>⚙️ Configurar</button>
        )}
        {canal.tipo !== 'chatwoot' && (
          <button className={`btn ${canal.ativo ? 'btn-danger' : 'btn-primary'} btn-sm`} onClick={() => onToggle(canal.tipo, !canal.ativo)}>
            {canal.ativo ? 'Desativar' : '✅ Ativar'}
          </button>
        )}
        {canal.tipo === 'telegram' && canal.ativo && (
          <>
            <button className="btn btn-outline btn-sm" onClick={() => onTelegramWebhook('register')}>🔗 Registrar Webhook</button>
            <button className="btn btn-outline btn-sm" onClick={() => onTelegramWebhook('status')}>📡 Status</button>
          </>
        )}
        {canal.tipo === 'chatwoot' && (
          <div style={{ fontSize: '.75rem', color: 'var(--muted)', padding: '4px 0' }}>Canal principal — sempre ativo</div>
        )}
      </div>
    </div>
  );
}

const COLOR_PRESETS = [
  { cor: '#00c896', label: 'CITmax' },
  { cor: '#1877F2', label: 'Azul' },
  { cor: '#8b5cf6', label: 'Roxo' },
  { cor: '#f97316', label: 'Laranja' },
  { cor: '#ef4444', label: 'Vermelho' },
  { cor: '#0ea5e9', label: 'Céu' },
  { cor: '#10b981', label: 'Esmeralda' },
  { cor: '#ec4899', label: 'Pink' },
];

const LBL = { fontSize: '.7rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 };
const SECTION = { fontSize: '.62rem', color: 'var(--g1)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 10, fontFamily: "'JetBrains Mono',monospace" };

function WidgetCard({ canal, onToggle }) {
  const showToast = useStore(s => s.showToast);
  const cfg = canal?.config || {};
  const [cor, setCor] = useState(cfg.corPrimaria || '#00c896');
  const [titulo, setTitulo] = useState(cfg.titulo || 'CITmax');
  const [saudacao, setSaudacao] = useState(cfg.saudacao || 'Olá! Como posso ajudar?');
  const [pos, setPos] = useState(cfg.posicao || 'bottom-right');
  const [welcomeMsg, setWelcomeMsg] = useState(cfg.welcomeMsg || 'Precisa de ajuda? 😊');
  const [welcomeDelay, setWelcomeDelay] = useState(cfg.welcomeDelay ?? 5);
  const [welcomeAtivo, setWelcomeAtivo] = useState(cfg.welcomeAtivo ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const c = canal?.config || {};
    if (c.corPrimaria) setCor(c.corPrimaria);
    if (c.titulo) setTitulo(c.titulo);
    if (c.saudacao) setSaudacao(c.saudacao);
    if (c.posicao) setPos(c.posicao);
    if (c.welcomeMsg) setWelcomeMsg(c.welcomeMsg);
    if (c.welcomeDelay !== undefined) setWelcomeDelay(c.welcomeDelay);
    if (c.welcomeAtivo !== undefined) setWelcomeAtivo(c.welcomeAtivo);
  }, [canal?.config]);

  const baseUrl = window.location.origin;
  const widgetUrl = baseUrl + '/widget';
  const embedUrl = baseUrl + '/admin/widget/embed.js';
  const embedCode = `<script src="${embedUrl}"><\/script>`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(widgetUrl)}&bgcolor=030f0b&color=00c896&format=svg`;

  const salvar = async () => {
    setSaving(true);
    try {
      await salvarCanal('widget', { config: { corPrimaria: cor, titulo, saudacao, posicao: pos, welcomeMsg, welcomeDelay: parseInt(welcomeDelay) || 5, welcomeAtivo } });
      showToast('✅ Widget salvo!');
    } catch (e) { showToast('Erro: ' + e.message, true); }
    setSaving(false);
  };

  const copy = (text, label) => { navigator.clipboard?.writeText(text); showToast('📋 ' + label + ' copiado!'); };

  return (
    <div style={{ background: 'var(--glass)', backdropFilter: 'blur(8px)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: 20, borderTop: `3px solid ${canal?.ativo ? cor : 'var(--dim)'}`, animation: 'fadeInUp .4s ease both' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.6rem' }}>🌐</span>
          <div><div style={{ fontWeight: 700, fontSize: '1rem' }}>Widget Web</div><div style={{ fontSize: '.72rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace" }}>Chat para seu site — 2 modos de uso</div></div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className={`badge ${canal?.ativo ? 'badge-green' : 'badge-red'}`}>{canal?.ativo ? '● Ativo' : '○ Inativo'}</span>
          <button className={`btn ${canal?.ativo ? 'btn-danger' : 'btn-primary'} btn-xs`} onClick={() => onToggle('widget', !canal?.ativo)}>{canal?.ativo ? 'Desativar' : '✅ Ativar'}</button>
        </div>
      </div>

      {/* Main grid: Config | Modos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* ═══ LEFT: Personalização ═══ */}
        <div>
          <div style={SECTION}>🎨 Personalização</div>

          {/* Color palette */}
          <label style={LBL}>Cor primária</label>
          <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
            {COLOR_PRESETS.map(p => (
              <div key={p.cor} onClick={() => setCor(p.cor)} title={p.label} style={{
                width: 28, height: 28, borderRadius: 8, background: p.cor, cursor: 'pointer',
                border: cor === p.cor ? '2px solid #fff' : '2px solid transparent',
                boxShadow: cor === p.cor ? `0 0 0 2px ${p.cor}, 0 2px 8px ${p.cor}50` : 'none',
                transition: '.15s',
              }} />
            ))}
            <div style={{ position: 'relative' }}>
              <input type="color" value={cor} onChange={e => setCor(e.target.value)} style={{ width: 28, height: 28, border: 'none', borderRadius: 8, cursor: 'pointer', opacity: 0, position: 'absolute', inset: 0 }} />
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem', cursor: 'pointer' }}>+</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: cor, flexShrink: 0 }} />
            <input className="input" value={cor} onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setCor(e.target.value); }} style={{ padding: '4px 8px', fontSize: '.72rem', flex: 1 }} />
          </div>

          {/* Position + Title */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div><label style={LBL}>Posição do botão</label>
              <select className="input" value={pos} onChange={e => setPos(e.target.value)} style={{ padding: '6px 8px' }}>
                <option value="bottom-right">↘ Inferior Direito</option>
                <option value="bottom-left">↙ Inferior Esquerdo</option>
                <option value="top-right">↗ Superior Direito</option>
                <option value="top-left">↖ Superior Esquerdo</option>
              </select>
            </div>
            <div><label style={LBL}>Título do chat</label><input className="input" value={titulo} onChange={e => setTitulo(e.target.value)} style={{ padding: '6px 8px' }} /></div>
          </div>
          <div style={{ marginBottom: 10 }}><label style={LBL}>Saudação inicial</label><input className="input" value={saudacao} onChange={e => setSaudacao(e.target.value)} /></div>

          {/* Welcome popup */}
          <div style={{ ...SECTION, marginTop: 16 }}>💬 Mensagem de Boas-Vindas</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.82rem', marginBottom: 8 }}>
            <input type="checkbox" checked={welcomeAtivo} onChange={e => setWelcomeAtivo(e.target.checked)} style={{ accentColor: cor, width: 16, height: 16 }} />
            Popup automático
          </label>
          {welcomeAtivo && (
            <>
              <div style={{ marginBottom: 8 }}><label style={LBL}>Mensagem do popup</label><input className="input" value={welcomeMsg} onChange={e => setWelcomeMsg(e.target.value)} /></div>
              <div style={{ marginBottom: 10 }}><label style={LBL}>Aparecer após (segundos)</label>
                <input className="input" type="number" min={1} max={60} value={welcomeDelay} onChange={e => setWelcomeDelay(e.target.value)} style={{ width: 80 }} />
              </div>
              {/* Mini preview do popup */}
              <div style={{ position: 'relative', background: 'rgba(3,45,61,.3)', borderRadius: 10, padding: 14, height: 60, display: 'flex', alignItems: 'flex-end', justifyContent: pos.includes('right') ? 'flex-end' : 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexDirection: pos.includes('right') ? 'row-reverse' : 'row' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: cor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.85rem', boxShadow: `0 3px 10px ${cor}40`, flexShrink: 0 }}>💬</div>
                  <div style={{ background: '#fff', color: '#333', padding: '8px 12px', borderRadius: 10, fontSize: '.72rem', fontWeight: 500, maxWidth: 180, boxShadow: '0 2px 8px rgba(0,0,0,.15)' }}>{welcomeMsg}</div>
                </div>
              </div>
            </>
          )}

          {/* Save */}
          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            <button className="btn btn-primary btn-sm" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : '💾 Salvar Tudo'}</button>
          </div>
        </div>

        {/* ═══ RIGHT: 2 Modos ═══ */}
        <div>
          {/* ── Modo 1: Link Direto ── */}
          <div style={{ ...SECTION, display: 'flex', alignItems: 'center', gap: 6 }}>🔗 Modo 1 — Link Direto <span className="badge badge-blue" style={{ fontSize: '.55rem' }}>Tela cheia</span></div>
          <div style={{ background: 'rgba(3,45,61,.4)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
              URL que abre o chat em tela cheia responsiva. Ideal para bio do Instagram, QR code impresso, link no WhatsApp, email marketing.
            </div>
            {/* URL box */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <div style={{ flex: 1, background: 'rgba(3,45,61,.5)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <code style={{ fontSize: '.7rem', color: 'var(--g1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{widgetUrl}</code>
              </div>
              <button className="btn btn-outline btn-xs" onClick={() => copy(widgetUrl, 'Link')} style={{ flexShrink: 0 }}>📋 Copiar</button>
              <button className="btn btn-outline btn-xs" onClick={() => window.open(widgetUrl, '_blank')} style={{ flexShrink: 0 }}>↗ Abrir</button>
            </div>
            {/* QR Code */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ background: '#fff', borderRadius: 10, padding: 8, flexShrink: 0 }}>
                <img src={qrUrl} alt="QR Code" style={{ width: 120, height: 120, display: 'block' }} />
              </div>
              <div>
                <div style={{ fontSize: '.78rem', fontWeight: 600, marginBottom: 4 }}>QR Code</div>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', lineHeight: 1.5, marginBottom: 8 }}>Escaneie pra abrir o chat. Perfeito para imprimir em panfletos, cartões de visita ou display na loja.</div>
                <button className="btn btn-outline btn-xs" onClick={() => { const a = document.createElement('a'); a.href = qrUrl.replace('svg','png'); a.download = 'maxxi-widget-qrcode.png'; a.click(); showToast('📥 QR baixado!'); }}>📥 Baixar QR</button>
              </div>
            </div>
          </div>

          {/* ── Modo 2: Botão Flutuante ── */}
          <div style={{ ...SECTION, display: 'flex', alignItems: 'center', gap: 6 }}>💬 Modo 2 — Botão Flutuante <span className="badge badge-green" style={{ fontSize: '.55rem' }}>Embed</span></div>
          <div style={{ background: 'rgba(3,45,61,.4)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
              Script que adiciona um botão flutuante no canto do seu site. Quando o visitante clica, abre a caixa de chat sem sair da página.
            </div>
            {/* Embed code */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ ...LBL, marginBottom: 6 }}>Cole antes do <code style={{ color: 'var(--g1)', background: 'rgba(0,200,150,.08)', padding: '1px 5px', borderRadius: 4 }}>&lt;/body&gt;</code> do seu site:</label>
              <div style={{ background: 'rgba(3,45,61,.5)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <code style={{ fontSize: '.68rem', color: 'var(--g1)', wordBreak: 'break-all', flex: 1 }}>{embedCode}</code>
                <button className="btn btn-outline btn-xs" onClick={() => copy(embedCode, 'Script')} style={{ flexShrink: 0 }}>📋</button>
              </div>
            </div>
            {/* Mini preview do botão */}
            <div style={{ position: 'relative', background: 'rgba(3,45,61,.3)', borderRadius: 10, height: 80, overflow: 'hidden' }}>
              {/* Simula um site */}
              <div style={{ padding: 10 }}>
                <div style={{ width: '60%', height: 8, background: 'var(--border)', borderRadius: 4, marginBottom: 6 }} />
                <div style={{ width: '80%', height: 6, background: 'rgba(255,255,255,.04)', borderRadius: 3, marginBottom: 4 }} />
                <div style={{ width: '45%', height: 6, background: 'rgba(255,255,255,.04)', borderRadius: 3 }} />
              </div>
              {/* Botão flutuante */}
              <div style={{
                position: 'absolute',
                [pos.includes('bottom') ? 'bottom' : 'top']: 10,
                [pos.includes('right') ? 'right' : 'left']: 10,
                width: 36, height: 36, borderRadius: '50%', background: cor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', boxShadow: `0 3px 12px ${cor}50`,
                animation: 'pulse-glow 2s ease infinite', cursor: 'pointer',
              }}>💬</div>
            </div>
            {/* Install guide */}
            <div style={{ marginTop: 10, fontSize: '.72rem', color: 'var(--dim)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>🌐 <strong>Site</strong> — antes do &lt;/body&gt;</span>
              <span>📰 <strong>WordPress</strong> — Appearance → footer.php</span>
              <span>🔧 <strong>GTM</strong> — Tag HTML personalizado</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-outline btn-sm" onClick={() => window.open(widgetUrl, '_blank', 'width=420,height=640')}>👁 Preview Flutuante</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigModal({ canal, onClose, onSaved }) {
  const meta = CANAL_META[canal?.tipo] || {};
  const fields = meta.fields || [];
  const guide = meta.guide;
  const [values, setValues] = useState({});
  const [showGuide, setShowGuide] = useState(true);
  const [showPw, setShowPw] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const showToast = useStore(s => s.showToast);
  const webhookUrl = window.location.origin + '/webhook/' + canal?.tipo;

  useEffect(() => {
    if (canal?.tipo) {
      fetchCanal(canal.tipo).then(c => {
        const cfg = c?.config || {};
        const v = {};
        fields.forEach(f => { v[f.id] = cfg[f.id] || ''; });
        setValues(v);
      }).catch(() => {});
    }
  }, [canal?.tipo]); // eslint-disable-line

  const handleSave = async () => {
    setSaving(true);
    try {
      await salvarCanal(canal.tipo, { config: values });
      showToast('✅ ' + (meta.label || canal.tipo) + ' salvo!');
      onSaved();
      onClose();
    } catch (e) { showToast('Erro: ' + e.message, true); }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      // Test by fetching canal status — if config is valid, API won't error
      const r = await fetchCanal(canal.tipo);
      if (r?.config) {
        const hasValues = fields.every(f => !f.secret || (values[f.id] && values[f.id].length > 5));
        setTestResult(hasValues ? { ok: true, msg: '✅ Credenciais preenchidas' } : { ok: false, msg: '⚠️ Campos obrigatórios vazios' });
      }
    } catch (e) { setTestResult({ ok: false, msg: '❌ ' + e.message }); }
    setTesting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, backdropFilter: 'blur(6px)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'rgba(2,55,65,.9)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 16, padding: 24, width: 520, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', animation: 'scaleIn .2s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.15rem', letterSpacing: '.5px' }}>{meta.icon} {guide?.titulo || 'Configurar ' + meta.label}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
        </div>

        {/* Guide */}
        {guide?.passos && (
          <div style={{ background: 'rgba(3,45,61,.5)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
            <button className="btn btn-outline" onClick={() => setShowGuide(!showGuide)} style={{ width: '100%', justifyContent: 'space-between', borderRadius: '10px 10px 0 0', border: 'none', borderBottom: showGuide ? '1px solid var(--border)' : 'none' }}>
              📖 Passo a passo {showGuide ? '▲' : '▼'}
            </button>
            {showGuide && (
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {guide.passos.map(p => (
                  <div key={p.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,200,150,.15)', border: '1px solid rgba(0,200,150,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 700, color: 'var(--g1)', flexShrink: 0 }}>{p.n}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.8rem', fontWeight: 700, marginBottom: 2 }}>{p.icon} {p.titulo}</div>
                      <div style={{ fontSize: '.75rem', color: 'var(--muted)', lineHeight: 1.5 }}>{p.desc}</div>
                    </div>
                  </div>
                ))}
                {/* Webhook URL */}
                <div style={{ marginTop: 4, padding: '8px 10px', background: 'rgba(3,45,61,.5)', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '.62rem', color: 'var(--dim)' }}>URL do Webhook:</div>
                    <code style={{ fontSize: '.7rem', color: 'var(--g1)' }}>{webhookUrl}</code>
                  </div>
                  <button className="btn btn-outline btn-xs" onClick={() => { navigator.clipboard?.writeText(webhookUrl); showToast('📋 URL copiada!'); }}>📋</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Fields */}
        <div style={{ fontSize: '.7rem', color: 'var(--g1)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, marginBottom: 10, fontFamily: "'JetBrains Mono',monospace" }}>⚙️ Credenciais</div>
        {fields.map(f => (
          <div key={f.id} style={{ marginBottom: 10 }}>
            <label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>{f.label}</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={f.secret && !showPw[f.id] ? 'password' : 'text'} placeholder={f.ph || ''} value={values[f.id] || ''} onChange={e => setValues({ ...values, [f.id]: e.target.value })} autoComplete="off" />
              {f.secret && (
                <button onClick={() => setShowPw({ ...showPw, [f.id]: !showPw[f.id] })} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>👁</button>
              )}
            </div>
          </div>
        ))}

        {/* Test result */}
        {testResult && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, fontSize: '.78rem', background: testResult.ok ? 'rgba(0,200,150,.06)' : 'rgba(255,71,87,.06)', border: `1px solid ${testResult.ok ? 'rgba(0,200,150,.2)' : 'rgba(255,71,87,.2)'}`, color: testResult.ok ? 'var(--g1)' : 'var(--red)' }}>{testResult.msg}</div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-outline" onClick={handleTest} disabled={testing}>{testing ? <span className="spinner" /> : '🔍 Testar'}</button>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : '💾 Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

// ═══ MAIN PAGE ═══
export default function Canais() {
  const [canais, setCanais] = useState([]);
  const [fluxos, setFluxos] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [webhookUrls, setWebhookUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [configModal, setConfigModal] = useState(null);
  const [telegramStatus, setTelegramStatus] = useState(null);
  const showToast = useStore(s => s.showToast);

  useEffect(() => {
    apiJson('/api/fluxos').then(r => setFluxos(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const [ch, urls] = await Promise.all([
        fetchCanais(),
        fetchWebhookUrls().catch(() => ({})),
      ]);
      setCanais(Array.isArray(ch) ? ch : []);
      setWebhookUrls(urls || {});

      // Metrics: count conversations per channel
      try {
        const convs = await fetchConversas();
        const m = {};
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const weekAgo = new Date(now - 7 * 86400000);
        (Array.isArray(convs) ? convs : []).forEach(c => {
          const ch = c.canal || (c.id || '').split('_')[0] || 'chatwoot';
          if (!m[ch]) m[ch] = { hoje: 0, semana: 0 };
          const cDate = new Date(c.criado || c.atualizado || 0);
          if (cDate.toISOString().slice(0, 10) === todayStr) m[ch].hoje++;
          if (cDate > weekAgo) m[ch].semana++;
        });
        setMetrics(m);
      } catch {}
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (tipo, ativo) => {
    await ativarCanal(tipo, ativo);
    showToast(ativo ? '✅ Ativado' : 'Desativado');
    load();
  };

  const handleTelegram = async (action) => {
    if (action === 'register') {
      showToast('Registrando webhook...');
      try {
        const r = await registrarWebhookTelegram();
        if (r.ok) showToast('✅ Webhook Telegram registrado!');
        else showToast('Erro: ' + (r.description || JSON.stringify(r)), true);
      } catch (e) { showToast('Erro: ' + e.message, true); }
    } else {
      try {
        const r = await statusWebhookTelegram();
        setTelegramStatus(r.result || r);
      } catch (e) { showToast('Erro: ' + e.message, true); }
    }
  };

  const widget = canais.find(c => c.tipo === 'widget');
  const others = canais.filter(c => c.tipo !== 'widget');
  const totalConvs = Object.values(metrics).reduce((a, m) => a + (m?.hoje || 0), 0);

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <div className="page-head">
        <div>
          <h1>📡 Canais de Atendimento</h1>
          <p>{canais.length} canais · {canais.filter(c => c.ativo).length} ativos · {totalConvs} conversas hoje</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={load}>🔄 Atualizar</button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 200, borderRadius: 14 }} />)}
        </div>
      ) : (
        <>
          {/* Widget — full width */}
          {widget && <div style={{ marginBottom: 20 }}><WidgetCard canal={widget} onToggle={handleToggle} /></div>}

          {/* Other channels grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14, marginBottom: 20 }}>
            {others.map(c => (
              <CanalCard
                key={c.tipo}
                canal={c}
                metrics={metrics[c.tipo]}
                webhookUrl={webhookUrls[c.tipo]}
                onConfig={() => setConfigModal(c)}
                onToggle={handleToggle}
                onTelegramWebhook={handleTelegram}
                fluxos={fluxos}
              />
            ))}
          </div>

          {/* Telegram status modal */}
          {telegramStatus && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }} onClick={() => setTelegramStatus(null)}>
              <div style={{ background: 'rgba(2,55,65,.9)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 14, padding: 24, width: 400, maxWidth: '95vw', animation: 'scaleIn .2s ease' }} onClick={e => e.stopPropagation()}>
                <h3 style={{ fontFamily: "'Bebas Neue',sans-serif", marginBottom: 12 }}>📡 Telegram Webhook Status</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '.82rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>URL</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '.72rem', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{telegramStatus.url || '(vazio)'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Pendentes</span><span style={{ fontWeight: 700, color: (telegramStatus.pending_update_count > 0) ? 'var(--yellow)' : 'var(--g1)' }}>{telegramStatus.pending_update_count || 0}</span></div>
                  {telegramStatus.last_error_message && <div style={{ color: 'var(--red)', fontSize: '.78rem', padding: '6px 10px', background: 'rgba(255,71,87,.06)', borderRadius: 6 }}>❌ {telegramStatus.last_error_message}</div>}
                  {telegramStatus.last_error_date && <div style={{ fontSize: '.72rem', color: 'var(--dim)' }}>Último erro: {new Date(telegramStatus.last_error_date * 1000).toLocaleString('pt-BR')}</div>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-outline" onClick={() => setTelegramStatus(null)}>Fechar</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Config modal */}
      {configModal && <ConfigModal canal={configModal} onClose={() => setConfigModal(null)} onSaved={load} />}
    </div>
  );
}
