import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore } from '../store';
import {
  MessageSquare, Clock, Bell, Shield, Save, Check,
  Eye, EyeOff, Globe, Zap, Building, ChevronDown,
} from 'lucide-react';
import Button from '../components/ui/Button';
import styles from './Configuracoes.module.css';

// ── TOGGLE ────────────────────────────────────────────────────────
function Toggle({ checked, onChange, label }) {
  return (
    <label className={styles.toggleRow}>
      {label && <span className={styles.toggleLabel}>{label}</span>}
      <span className={styles.toggleWrap}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className={styles.toggleInput} />
        <span className={styles.toggleTrack}>
          <span className={styles.toggleThumb} />
        </span>
      </span>
    </label>
  );
}

// ── API KEY FIELD ─────────────────────────────────────────────────
function ApiKeyField({ label, value, onChange, placeholder, hint, badge }) {
  const [show, setShow] = useState(false);
  const masked = value ? (show ? value : value.slice(0, 8) + '••••••••••••••••') : '';

  return (
    <div className={styles.apiField}>
      <div className={styles.apiFieldHeader}>
        <span className={styles.fieldLabel}>{label}</span>
        {badge && <span className={styles.apiBadge}>{badge}</span>}
      </div>
      <div className={[styles.apiInput, value && styles.apiInputFilled].join(' ')}>
        <input
          type={show ? 'text' : 'password'}
          value={show ? value : masked}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={styles.apiInputText}
        />
        <button type="button" onClick={() => setShow(v => !v)} className={styles.apiInputToggle}>
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        {value && (
          <span className={styles.apiStatus}>
            <span className={styles.apiStatusDot} /> Configurada
          </span>
        )}
      </div>
      {hint && <span className={styles.fieldHint}>{hint}</span>}
    </div>
  );
}

// ── SECTION ───────────────────────────────────────────────────────
function Section({ icon: Icon, color = 'blue', title, description, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(v => !v)}>
        <div className={[styles.sectionIcon, styles[`icon-${color}`]].join(' ')}>
          <Icon size={15} />
        </div>
        <div className={styles.sectionMeta}>
          <span className={styles.sectionTitle}>{title}</span>
          <span className={styles.sectionDesc}>{description}</span>
        </div>
        <ChevronDown size={15} className={[styles.sectionChevron, open && styles.sectionChevronOpen].join(' ')} />
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────
export default function Configuracoes() {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();
  const [saved, setSaved] = useState(false);

  // ── Estado de cada seção ──
  const [nomeEmpresa,  setNomeEmpresa]  = useState('');
  const [promptIA,     setPromptIA]     = useState('');
  const [saudacao,     setSaudacao]     = useState('');
  const [horario,      setHorario]      = useState({ ativo: false, dias: [1,2,3,4,5], inicio: '08:00', fim: '18:00' });
  const [msgFora,      setMsgFora]      = useState('');
  const [notifs,       setNotifs]       = useState({ nova_conversa: true, fila_longa: true, equip_offline: false, os_agendada: false });
  // API Keys
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey,    setOpenaiKey]    = useState('');
  const [sgpUrl,       setSgpUrl]       = useState('');
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
    setNomeEmpresa(kv.nome_empresa  || '');
    setPromptIA(   kv.prompt_ia     || '');
    setSaudacao(   kv.saudacao      || '');
    setHorario(    kv.horario       || { ativo: false, dias: [1,2,3,4,5], inicio: '08:00', fim: '18:00' });
    setMsgFora(    kv.mensagem_fora_hora || '');
    setNotifs(     kv.notificacoes  || { nova_conversa: true, fila_longa: true, equip_offline: false, os_agendada: false });
    setAnthropicKey(kv.anthropic_api_key || '');
    setOpenaiKey(   kv.openai_api_key    || '');
    setSgpUrl(      kv.sgp_url           || '');
    setSgpToken(    kv.sgp_token         || '');
    setEvoUrl(      kv.evolution_url     || '');
    setEvoKey(      kv.evolution_key     || '');
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
    nome_empresa:        nomeEmpresa,
    prompt_ia:           promptIA,
    saudacao,
    horario,
    mensagem_fora_hora:  msgFora,
    notificacoes:        notifs,
    anthropic_api_key:   anthropicKey,
    openai_api_key:      openaiKey,
    sgp_url:             sgpUrl,
    sgp_token:           sgpToken,
    evolution_url:       evoUrl,
    evolution_key:       evoKey,
  });

  const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const toggleDia = (d) => setHorario(h => ({
    ...h,
    dias: h.dias.includes(d) ? h.dias.filter(x => x !== d) : [...h.dias, d].sort(),
  }));

  if (isLoading) return <div className={styles.loading}><span className="spinner spinner-lg" /></div>;

  return (
    <div className={styles.root}>
      <div className={styles.content}>

        {/* ── EMPRESA ── */}
        <Section icon={Building} color="navy" title="Empresa" description="Identidade e nome exibido nas mensagens automáticas.">
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Nome da empresa</label>
            <input
              className={styles.input}
              value={nomeEmpresa}
              onChange={e => setNomeEmpresa(e.target.value)}
              placeholder="NetGo Internet"
            />
            <span className={styles.fieldHint}>Usado em variáveis como {'{{nome_empresa}}'} nos fluxos</span>
          </div>
        </Section>

        {/* ── PROMPT IA ── */}
        <Section icon={MessageSquare} color="purple" title="Prompt da IA" description="Instruções base que definem personalidade, tom e limites do assistente.">
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Prompt do sistema</label>
            <textarea
              className={styles.mono}
              rows={7}
              value={promptIA}
              onChange={e => setPromptIA(e.target.value)}
              placeholder={'Você é um assistente de atendimento da NetGo Internet.\nSeja cordial, objetivo e útil.\nNão invente informações que não foram fornecidas.'}
            />
            <span className={styles.fieldHint}>{promptIA.length} caracteres</span>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Saudação inicial</label>
            <input
              className={styles.input}
              value={saudacao}
              onChange={e => setSaudacao(e.target.value)}
              placeholder="Olá! Seja bem-vindo(a) à NetGo. Como posso ajudar?"
            />
            <span className={styles.fieldHint}>Variável {'{{saudacao}}'} disponível nos fluxos</span>
          </div>
        </Section>

        {/* ── HORÁRIO ── */}
        <Section icon={Clock} color="orange" title="Horário de atendimento" description="Fora do horário configurado o bot responde com a mensagem de ausência.">
          <Toggle
            checked={horario.ativo}
            onChange={v => setHorario(h => ({ ...h, ativo: v }))}
            label="Controle de horário"
          />
          {horario.ativo && (
            <>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Dias de atendimento</label>
                <div className={styles.diasGrid}>
                  {DIAS.map((nome, i) => (
                    <button key={i}
                      className={[styles.diaBtn, horario.dias?.includes(i) && styles.diaBtnAtivo].join(' ')}
                      onClick={() => toggleDia(i)} type="button">
                      {nome}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.horasRow}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Abertura</label>
                  <input type="time" className={styles.input} value={horario.inicio || '08:00'}
                    onChange={e => setHorario(h => ({ ...h, inicio: e.target.value }))} />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Fechamento</label>
                  <input type="time" className={styles.input} value={horario.fim || '18:00'}
                    onChange={e => setHorario(h => ({ ...h, fim: e.target.value }))} />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Mensagem fora do horário</label>
                <textarea className={styles.textarea} rows={3} value={msgFora}
                  onChange={e => setMsgFora(e.target.value)}
                  placeholder="Olá! Nosso atendimento é de segunda a sexta, das 8h às 18h. Retornaremos em breve!" />
              </div>
            </>
          )}
        </Section>

        {/* ── NOTIFICAÇÕES ── */}
        <Section icon={Bell} color="blue" title="Notificações" description="Configure alertas de fila, tempo de espera e eventos do sistema.">
          {[
            { key: 'nova_conversa', label: 'Nova conversa',       desc: 'Sempre que uma nova conversa chegar' },
            { key: 'fila_longa',    label: 'Fila longa (>5 min)', desc: 'Quando houver espera prolongada na fila' },
            { key: 'equip_offline', label: 'Equipamento offline', desc: 'Quando um equipamento da rede ficar offline' },
            { key: 'os_agendada',   label: 'OS agendada',         desc: 'Lembretes de ordens de serviço próximas' },
          ].map(item => (
            <label key={item.key} className={styles.notifItem}>
              <div>
                <p className={styles.notifLabel}>{item.label}</p>
                <p className={styles.notifDesc}>{item.desc}</p>
              </div>
              <span className={styles.toggleWrap}>
                <input type="checkbox" checked={notifs[item.key] || false}
                  onChange={e => setNotifs(n => ({ ...n, [item.key]: e.target.checked }))}
                  className={styles.toggleInput} />
                <span className={styles.toggleTrack}><span className={styles.toggleThumb}/></span>
              </span>
            </label>
          ))}
        </Section>

        {/* ── INTEGRAÇÕES IA ── */}
        <Section icon={Zap} color="purple" title="Integrações de IA" description="Chaves para os modelos de linguagem usados nos fluxos automáticos.">
          <div className={styles.apiGroup}>
            <div className={styles.apiGroupTitle}>
              <span className={styles.apiGroupDot} style={{ background: '#f472b6' }} />
              Anthropic (Claude)
            </div>
            <ApiKeyField
              label="API Key"
              badge="Recomendado"
              value={anthropicKey}
              onChange={setAnthropicKey}
              placeholder="sk-ant-api03-..."
              hint="Usada pelos nós IA Responde e IA Roteador nos fluxos"
            />
          </div>
          <div className={styles.apiGroup}>
            <div className={styles.apiGroupTitle}>
              <span className={styles.apiGroupDot} style={{ background: '#10b981' }} />
              OpenAI (GPT)
            </div>
            <ApiKeyField
              label="API Key"
              value={openaiKey}
              onChange={setOpenaiKey}
              placeholder="sk-proj-..."
              hint="Opcional — usado quando o modelo GPT-4o-mini for selecionado"
            />
          </div>
        </Section>

        {/* ── SGP / ERP ── */}
        <Section icon={Globe} color="green" title="SGP / ERP" description="Conexão com o sistema de gestão de clientes e contratos." defaultOpen={false}>
          <div className={styles.apiGroup}>
            <div className={styles.apiGroupTitle}>
              <span className={styles.apiGroupDot} style={{ background: '#3DB845' }} />
              SGP Internet
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>URL da API</label>
              <input className={styles.input} value={sgpUrl} onChange={e => setSgpUrl(e.target.value)}
                placeholder="https://sgp.suaempresa.com.br/api" />
            </div>
            <ApiKeyField
              label="Token de autenticação"
              value={sgpToken}
              onChange={setSgpToken}
              placeholder="Bearer eyJ..."
              hint="Token Bearer gerado nas configurações do SGP"
            />
          </div>
        </Section>

        {/* ── EVOLUTION API (WhatsApp) ── */}
        <Section icon={Shield} color="green" title="Evolution API — WhatsApp" description="Conexão com o servidor de mensagens WhatsApp." defaultOpen={false}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>URL do servidor</label>
            <input className={styles.input} value={evoUrl} onChange={e => setEvoUrl(e.target.value)}
              placeholder="https://evolution.suaempresa.com.br" />
            <span className={styles.fieldHint}>URL base sem barra no final</span>
          </div>
          <ApiKeyField
            label="API Key global"
            value={evoKey}
            onChange={setEvoKey}
            placeholder="B6D711FCDE4D4FD5936544120E713976"
            hint="Chave de autenticação global da Evolution API"
          />
          <div className={styles.infoBox}>
            <p className={styles.infoBoxTitle}>⚡ Instâncias WhatsApp</p>
            <p className={styles.infoBoxText}>
              As instâncias (números de WhatsApp conectados) são configuradas individualmente na página{' '}
              <strong>Canais</strong>. Cada canal tem seu próprio QR Code e configuração de webhook.
            </p>
          </div>
        </Section>

      </div>

      {/* ── FOOTER ── */}
      <div className={styles.footer}>
        <p className={styles.footerInfo}>Alterações afetam imediatamente o comportamento do sistema</p>
        <Button
          variant="primary"
          size="md"
          loading={saveMut.isPending}
          icon={saved ? Check : Save}
          onClick={handleSave}
        >
          {saved ? 'Salvo!' : 'Salvar configurações'}
        </Button>
      </div>
    </div>
  );
}
