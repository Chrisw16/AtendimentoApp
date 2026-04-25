import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore } from '../store';
import {
  Bot, Clock, Bell, Shield, Save, Check,
  Eye, EyeOff, Globe, Zap, Building,
  Key, AlertCircle,
} from 'lucide-react';
import Button from '../components/ui/Button';
import styles from './Configuracoes.module.css';

// ── TABS ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'geral',      label: 'Geral',         icon: Building },
  { id: 'ia',         label: 'IA & Bot',       icon: Bot      },
  { id: 'horario',    label: 'Horário',        icon: Clock    },
  { id: 'notifs',     label: 'Notificações',   icon: Bell     },
  { id: 'integracoes',label: 'Integrações',    icon: Key      },
];

// ── CAMPO TOGGLE ──────────────────────────────────────────────────
function Toggle({ checked, onChange, label, desc }) {
  return (
    <label className={styles.toggleRow}>
      <div>
        <p className={styles.toggleLabel}>{label}</p>
        {desc && <p className={styles.toggleDesc}>{desc}</p>}
      </div>
      <span className={styles.toggleWrap}>
        <input type="checkbox" checked={checked}
          onChange={e => onChange(e.target.checked)}
          className={styles.toggleInput}/>
        <span className={styles.toggleTrack}><span className={styles.toggleThumb}/></span>
      </span>
    </label>
  );
}

// ── CAMPO API KEY ─────────────────────────────────────────────────
function ApiKeyField({ label, value, onChange, placeholder, hint, badge, mono = true }) {
  const [show, setShow] = useState(false);
  const filled = !!(value && value.length > 3);
  return (
    <div className={styles.field}>
      <div className={styles.fieldHeader}>
        <label className={styles.fieldLabel}>{label}</label>
        {badge && <span className={[styles.badge, styles[`badge-${badge}`]].join(' ')}>{badge}</span>}
        {filled && (
          <span className={styles.configuredBadge}>
            <span className={styles.configuredDot}/>Configurada
          </span>
        )}
      </div>
      <div className={[styles.secretInput, filled && styles.secretInputFilled].join(' ')}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off" spellCheck={false}
          className={styles.secretInputText}
          style={mono ? { fontFamily: 'var(--font-mono)', fontSize: 12 } : {}}
        />
        <button type="button" onClick={() => setShow(v => !v)}
          className={styles.secretInputEye}>
          {show ? <EyeOff size={14}/> : <Eye size={14}/>}
        </button>
      </div>
      {hint && <p className={styles.fieldHint}>{hint}</p>}
    </div>
  );
}

// ── CARD DE INTEGRAÇÃO ────────────────────────────────────────────
function IntegrationCard({ title, color, logo, status, children }) {
  const statusColor = { ok: '#16A34A', error: '#DC2626', pending: '#D97706', off: '#9CA3AF' };
  const statusLabel = { ok: 'Conectado', error: 'Erro', pending: 'Aguardando', off: 'Não configurado' };
  return (
    <div className={styles.integCard}>
      <div className={styles.integCardHeader}>
        <div className={styles.integLogo} style={{ background: color }}>
          {logo}
        </div>
        <div className={styles.integMeta}>
          <span className={styles.integTitle}>{title}</span>
          <span className={styles.integStatus} style={{ color: statusColor[status] }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor[status], display: 'inline-block', marginRight: 5 }}/>
            {statusLabel[status]}
          </span>
        </div>
      </div>
      <div className={styles.integCardBody}>{children}</div>
    </div>
  );
}

// ── PAGE ──────────────────────────────────────────────────────────
export default function Configuracoes() {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();
  const [tab, setTab]   = useState('geral');
  const [saved, setSaved] = useState(false);

  const [nomeEmpresa,  setNomeEmpresa]  = useState('');
  const [promptIA,     setPromptIA]     = useState('');
  const [saudacao,     setSaudacao]     = useState('');
  const [horario,      setHorario]      = useState({ ativo: false, dias: [1,2,3,4,5], inicio: '08:00', fim: '18:00' });
  const [msgFora,      setMsgFora]      = useState('');
  const [notifs,       setNotifs]       = useState({ nova_conversa: true, fila_longa: true, equip_offline: false, os_agendada: false });
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey,    setOpenaiKey]    = useState('');
  const [sgpUrl,       setSgpUrl]       = useState('');
  const [sgpApp,       setSgpApp]       = useState('');
  const [sgpToken,     setSgpToken]     = useState('');
  const [evoUrl,       setEvoUrl]       = useState('');
  const [evoKey,       setEvoKey]       = useState('');

  const { data: kv, isLoading } = useQuery({
    queryKey: ['sysconfig'],
    queryFn:  () => api.get('/sysconfig'),
    select:   d  => d.config || d,
  });

  useEffect(() => {
    if (!kv) return;
    setNomeEmpresa(kv.nome_empresa        || '');
    setPromptIA(   kv.prompt_ia           || '');
    setSaudacao(   kv.saudacao            || '');
    setHorario(    kv.horario             || { ativo: false, dias: [1,2,3,4,5], inicio: '08:00', fim: '18:00' });
    setMsgFora(    kv.mensagem_fora_hora  || '');
    setNotifs(     kv.notificacoes        || { nova_conversa: true, fila_longa: true, equip_offline: false, os_agendada: false });
    setAnthropicKey(kv.anthropic_api_key  || '');
    setOpenaiKey(   kv.openai_api_key     || '');
    setSgpUrl(      kv.sgp_url            || '');
    setSgpApp(      kv.sgp_app            || '');
    setSgpToken(    kv.sgp_token          || '');
    setEvoUrl(      kv.evolution_url      || '');
    setEvoKey(      kv.evolution_key      || '');
  }, [kv]);

  const saveMut = useMutation({
    mutationFn: data => api.put('/sysconfig', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sysconfig'] });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      toast('Configurações salvas', 'success');
    },
    onError: e => toast(e.message, 'error'),
  });

  const handleSave = () => saveMut.mutate({
    nome_empresa: nomeEmpresa, prompt_ia: promptIA, saudacao,
    horario, mensagem_fora_hora: msgFora, notificacoes: notifs,
    anthropic_api_key: anthropicKey, openai_api_key: openaiKey,
    sgp_url: sgpUrl, sgp_app: sgpApp, sgp_token: sgpToken,
    evolution_url: evoUrl, evolution_key: evoKey,
  });

  const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const toggleDia = d => setHorario(h => ({
    ...h, dias: h.dias.includes(d) ? h.dias.filter(x => x !== d) : [...h.dias, d].sort()
  }));

  // Status das integrações
  const integStatus = {
    anthropic: anthropicKey ? 'ok' : 'off',
    openai:    openaiKey    ? 'ok' : 'off',
    sgp:       sgpUrl && sgpToken && sgpApp ? 'ok' : (sgpUrl || sgpToken || sgpApp) ? 'pending' : 'off',
    evolution: evoUrl && evoKey   ? 'ok' : evoUrl || evoKey   ? 'pending' : 'off',
  };

  if (isLoading) return <div className={styles.loading}><span className="spinner spinner-lg"/></div>;

  return (
    <div className={styles.root}>

      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>Configurações</h1>
          <p className={styles.headerDesc}>Gerencie as configurações do sistema, integrações e APIs</p>
        </div>
        <Button variant="primary" size="md" loading={saveMut.isPending}
          icon={saved ? Check : Save} onClick={handleSave}>
          {saved ? 'Salvo!' : 'Salvar alterações'}
        </Button>
      </div>

      {/* ── TABS ── */}
      <div className={styles.tabs}>
        {TABS.map(t => {
          const Icon = t.icon;
          const hasAlert = t.id === 'integracoes' && Object.values(integStatus).some(s => s === 'off');
          return (
            <button key={t.id}
              className={[styles.tab, tab === t.id && styles.tabActive].join(' ')}
              onClick={() => setTab(t.id)}>
              <Icon size={14}/>
              {t.label}
              {hasAlert && <span className={styles.tabAlert}/>}
            </button>
          );
        })}
      </div>

      {/* ── CONTEÚDO ── */}
      <div className={styles.body}>

        {/* ── ABA GERAL ── */}
        {tab === 'geral' && (
          <div className={styles.panel}>
            <div className={styles.panelTitle}>Informações da empresa</div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Nome da empresa</label>
              <input className={styles.input} value={nomeEmpresa}
                onChange={e => setNomeEmpresa(e.target.value)}
                placeholder="NetGo Internet"/>
              <p className={styles.fieldHint}>
                Usado nas variáveis <code>{'{{nome_empresa}}'}</code> dos fluxos e mensagens automáticas
              </p>
            </div>
          </div>
        )}

        {/* ── ABA IA & BOT ── */}
        {tab === 'ia' && (
          <div className={styles.panel}>
            <div className={styles.panelTitle}>Comportamento do assistente</div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Prompt do sistema</label>
              <p className={styles.fieldHint} style={{ marginBottom: 6 }}>
                Define a personalidade, tom e limites do assistente de IA. Quanto mais detalhado, melhor o comportamento.
              </p>
              <textarea className={styles.mono} rows={8} value={promptIA}
                onChange={e => setPromptIA(e.target.value)}
                placeholder={'Você é um assistente de atendimento da NetGo Internet.\nSeja cordial, objetivo e útil.\nNão invente informações que não foram fornecidas.\nSempre confirme o CPF antes de fornecer dados do contrato.'}/>
              <p className={styles.fieldHint}>{promptIA.length} caracteres</p>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Saudação inicial</label>
              <input className={styles.input} value={saudacao}
                onChange={e => setSaudacao(e.target.value)}
                placeholder="Olá! Seja bem-vindo(a) à NetGo. Como posso ajudar?"/>
              <p className={styles.fieldHint}>
                Disponível como <code>{'{{saudacao}}'}</code> nos nós de fluxo
              </p>
            </div>

            {!anthropicKey && (
              <div className={styles.alertBox}>
                <AlertCircle size={14}/>
                <p>
                  <strong>Chave Anthropic não configurada.</strong>{' '}
                  Os nós de IA não funcionarão. Configure em{' '}
                  <button className={styles.alertLink} onClick={() => setTab('integracoes')}>
                    Integrações → Anthropic
                  </button>.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── ABA HORÁRIO ── */}
        {tab === 'horario' && (
          <div className={styles.panel}>
            <div className={styles.panelTitle}>Horário de atendimento</div>

            <Toggle checked={horario.ativo}
              onChange={v => setHorario(h => ({ ...h, ativo: v }))}
              label="Ativar controle de horário"
              desc="Fora do horário configurado, o bot responde com a mensagem de ausência"/>

            {horario.ativo && (
              <>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Dias de atendimento</label>
                  <div className={styles.diasGrid}>
                    {DIAS.map((nome, i) => (
                      <button key={i} type="button"
                        className={[styles.diaBtn, horario.dias?.includes(i) && styles.diaBtnAtivo].join(' ')}
                        onClick={() => toggleDia(i)}>
                        {nome}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.horasRow}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Abertura</label>
                    <input type="time" className={styles.input} value={horario.inicio || '08:00'}
                      onChange={e => setHorario(h => ({ ...h, inicio: e.target.value }))}/>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Fechamento</label>
                    <input type="time" className={styles.input} value={horario.fim || '18:00'}
                      onChange={e => setHorario(h => ({ ...h, fim: e.target.value }))}/>
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Mensagem fora do horário</label>
                  <textarea className={styles.textarea} rows={3} value={msgFora}
                    onChange={e => setMsgFora(e.target.value)}
                    placeholder="Olá! Nosso atendimento é de segunda a sexta, das 8h às 18h. Em breve retornaremos! 😊"/>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ABA NOTIFICAÇÕES ── */}
        {tab === 'notifs' && (
          <div className={styles.panel}>
            <div className={styles.panelTitle}>Alertas do sistema</div>
            <div className={styles.notifList}>
              {[
                { key: 'nova_conversa', label: 'Nova conversa',       desc: 'Sempre que uma nova conversa chegar na fila' },
                { key: 'fila_longa',    label: 'Fila longa (>5 min)', desc: 'Quando um cliente ficar mais de 5 min aguardando' },
                { key: 'equip_offline', label: 'Equipamento offline', desc: 'Quando um equipamento da rede ficar offline' },
                { key: 'os_agendada',   label: 'OS agendada',         desc: 'Lembretes de ordens de serviço próximas' },
              ].map(item => (
                <Toggle key={item.key}
                  checked={notifs[item.key] || false}
                  onChange={v => setNotifs(n => ({ ...n, [item.key]: v }))}
                  label={item.label} desc={item.desc}/>
              ))}
            </div>
          </div>
        )}

        {/* ── ABA INTEGRAÇÕES ── */}
        {tab === 'integracoes' && (
          <div className={styles.panelInteg}>

            {/* Anthropic */}
            <IntegrationCard title="Anthropic — Claude" color="#8B5CF6" status={integStatus.anthropic}
              logo={<span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>A</span>}>
              <p className={styles.integDesc}>
                Usado pelos nós <strong>IA Responde</strong> e <strong>IA Roteador</strong> nos fluxos automáticos.
                Obtenha sua chave em <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-blue)' }}>console.anthropic.com</a>
              </p>
              <ApiKeyField label="API Key" badge="Recomendado"
                value={anthropicKey} onChange={setAnthropicKey}
                placeholder="sk-ant-api03-..."
                hint="Chave secreta. Nunca compartilhe publicamente."/>
            </IntegrationCard>

            {/* OpenAI */}
            <IntegrationCard title="OpenAI — GPT" color="#10B981" status={integStatus.openai}
              logo={<span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>AI</span>}>
              <p className={styles.integDesc}>
                Opcional. Utilizado quando o modelo <strong>GPT-4o-mini</strong> for selecionado em um nó de IA.
                Obtenha em <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-blue)' }}>platform.openai.com</a>
              </p>
              <ApiKeyField label="API Key" badge="Opcional"
                value={openaiKey} onChange={setOpenaiKey}
                placeholder="sk-proj-..."
                hint="Deixe em branco para usar apenas o Claude (Anthropic)."/>
            </IntegrationCard>

            {/* SGP */}
            <IntegrationCard title="SGP / ERP — Gestão de clientes" color="#2050B8" status={integStatus.sgp}
              logo={<span style={{ color: '#fff', fontWeight: 700, fontSize: 11 }}>SGP</span>}>
              <p className={styles.integDesc}>
                Conecta os nós <strong>Consultar cliente</strong>, <strong>Consultar boleto</strong>, <strong>Verificar status</strong>,
                {' '}<strong>Abrir chamado</strong> e <strong>Promessa de pagamento</strong> ao seu sistema de gestão.
              </p>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>URL da API</label>
                <input className={styles.input} value={sgpUrl} onChange={e => setSgpUrl(e.target.value)}
                  placeholder="https://conect.sgp.net.br/api"/>
                <p className={styles.fieldHint}>URL base do SGP — ex: https://conect.sgp.net.br (sem /api ou barra no final)</p>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field} style={{ flex: 1 }}>
                  <ApiKeyField label="SGP App"
                    value={sgpApp} onChange={e => setSgpApp(e.target.value)}
                    placeholder="nome_do_app"
                    hint="Identificador da aplicação no SGP"/>
                </div>
                <div className={styles.field} style={{ flex: 1 }}>
                  <ApiKeyField label="SGP Token"
                    value={sgpToken} onChange={setSgpToken}
                    placeholder="token_gerado_no_sgp"
                    hint="Token de autenticação gerado no SGP"/>
                </div>
              </div>
              <div className={styles.infoBox}>
                <p style={{ fontSize: 12, color: 'var(--brand-blue)', margin: 0, lineHeight: 1.5 }}>
                  💡 As credenciais são enviadas como headers <code>app</code> e <code>token</code> em cada requisição ao SGP.
                </p>
              </div>
            </IntegrationCard>

            {/* Evolution API */}
            <IntegrationCard title="Evolution API — WhatsApp" color="#25D366" status={integStatus.evolution}
              logo={<span style={{ color: '#fff', fontWeight: 700, fontSize: 11 }}>WA</span>}>
              <p className={styles.integDesc}>
                Necessário para <strong>enviar mensagens de volta</strong> ao cliente no WhatsApp.
                As instâncias (números conectados) são configuradas individualmente em{' '}
                <strong>Canais</strong>. Aqui você configura apenas a conexão global.
              </p>
              <div className={styles.fieldRow}>
                <div className={styles.field} style={{ flex: 2 }}>
                  <label className={styles.fieldLabel}>URL do servidor</label>
                  <input className={styles.input} value={evoUrl} onChange={e => setEvoUrl(e.target.value)}
                    placeholder="https://evolution.netgo.com.br"/>
                  <p className={styles.fieldHint}>URL base da sua instância Evolution API</p>
                </div>
              </div>
              <ApiKeyField label="API Key global"
                value={evoKey} onChange={setEvoKey}
                placeholder="B6D711FCDE4D4FD5936544120E713976"
                hint="Chave de autenticação global. Encontrada em Settings → Authentication no painel da Evolution API."/>

              {evoUrl && evoKey && (
                <div className={styles.infoBox}>
                  <p style={{ fontSize: 12, color: 'var(--brand-blue)', margin: 0, lineHeight: 1.5 }}>
                    ✅ Webhook para receber mensagens:<br/>
                    <code style={{ fontSize: 11, background: 'rgba(32,80,184,0.08)', padding: '2px 6px', borderRadius: 4 }}>
                      {`https://gochat.netgo.net.br/api/webhooks/evolution`}
                    </code><br/>
                    Configure este URL no painel da Evolution API → Instâncias → Webhook.
                  </p>
                </div>
              )}
            </IntegrationCard>

          </div>
        )}

      </div>

      {/* ── FOOTER ── */}
      <div className={styles.footer}>
        <p className={styles.footerInfo}>As alterações entram em vigor imediatamente após salvar</p>
        <Button variant="primary" size="md" loading={saveMut.isPending}
          icon={saved ? Check : Save} onClick={handleSave}>
          {saved ? '✓ Salvo!' : 'Salvar alterações'}
        </Button>
      </div>
    </div>
  );
}
