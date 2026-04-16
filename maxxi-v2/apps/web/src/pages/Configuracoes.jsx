import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore } from '../store';
import {
  Settings, MessageSquare, Clock, Bell, Shield,
  Save, RefreshCw, Eye, EyeOff, Check,
} from 'lucide-react';
import Button from '../components/ui/Button';
import Input  from '../components/ui/Input';
import styles from './Configuracoes.module.css';

// ── SECTION WRAPPER ───────────────────────────────────────────────
function ConfigSection({ icon: Icon, title, description, children }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionIcon}><Icon size={15} /></div>
        <div>
          <p className={styles.sectionTitle}>{title}</p>
          <p className={styles.sectionDesc}>{description}</p>
        </div>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}

// ── HORÁRIO DE ATENDIMENTO ────────────────────────────────────────
function HorarioConfig({ config, onChange }) {
  const DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const horario = config || {
    ativo:  false,
    dias:   [1,2,3,4,5],
    inicio: '08:00',
    fim:    '18:00',
  };

  const toggleDia = (dia) => {
    const dias = horario.dias.includes(dia)
      ? horario.dias.filter(d => d !== dia)
      : [...horario.dias, dia].sort();
    onChange({ ...horario, dias });
  };

  return (
    <div className={styles.horarioWrap}>
      <label className={styles.toggleLabel}>
        <span>Controle de horário</span>
        <input type="checkbox" checked={horario.ativo}
          onChange={e => onChange({ ...horario, ativo: e.target.checked })} />
        <span className={styles.toggleTrack}>
          <span className={styles.toggleThumb} />
        </span>
      </label>

      {horario.ativo && (
        <>
          <div className={styles.diasGrid}>
            {DIAS.map((nome, i) => (
              <button key={i}
                className={[styles.diaBtn, horario.dias.includes(i) && styles.diaBtnAtivo].join(' ')}
                onClick={() => toggleDia(i)}>
                {nome.slice(0,3)}
              </button>
            ))}
          </div>
          <div className={styles.horasRow}>
            <div className={styles.field}>
              <label className={styles.label}>Início</label>
              <input type="time" className={styles.timeInput} value={horario.inicio}
                onChange={e => onChange({ ...horario, inicio: e.target.value })} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Fim</label>
              <input type="time" className={styles.timeInput} value={horario.fim}
                onChange={e => onChange({ ...horario, fim: e.target.value })} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── CONFIGURACOES PAGE ────────────────────────────────────────────
export default function Configuracoes() {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();
  const [saved, setSaved] = useState(false);

  // Estado local de cada seção
  const [promptIA,   setPromptIA]   = useState('');
  const [horario,    setHorario]    = useState(null);
  const [msgFora,    setMsgFora]    = useState('');
  const [saudacao,   setSaudacao]   = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey,     setApiKey]     = useState('');

  // Busca configs existentes
  const { data: kv, isLoading } = useQuery({
    queryKey: ['sysconfig'],
    queryFn:  () => api.get('/sysconfig'),
    select:   d => d.config || d,
  });

  useEffect(() => {
    if (!kv) return;
    setPromptIA(kv.prompt_ia || '');
    setHorario(kv.horario   || null);
    setMsgFora(kv.mensagem_fora_hora || '');
    setSaudacao(kv.saudacao || '');
  }, [kv]);

  const saveMut = useMutation({
    mutationFn: (data) => api.put('/sysconfig', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sysconfig'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast('Configurações salvas', 'success');
    },
    onError: e => toast(e.message, 'error'),
  });

  const handleSave = () => {
    saveMut.mutate({
      prompt_ia:           promptIA,
      horario,
      mensagem_fora_hora:  msgFora,
      saudacao,
    });
  };

  return (
    <div className={styles.root}>
      <div className={styles.content}>
        {/* ── PROMPT DA IA ── */}
        <ConfigSection
          icon={MessageSquare}
          title="Prompt da IA"
          description="Instruções base para o assistente de atendimento. Define o tom, personalidade e limites do bot."
        >
          <div className={styles.field}>
            <label className={styles.label}>Prompt do sistema</label>
            <textarea
              className={styles.promptTextarea}
              rows={8}
              value={promptIA}
              onChange={e => setPromptIA(e.target.value)}
              placeholder="Você é um assistente de atendimento ao cliente da [nome da empresa]. Seja cordial, objetivo e útil..."
            />
            <p className={styles.fieldHint}>{promptIA.length} caracteres</p>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Saudação inicial</label>
            <Input
              value={saudacao}
              onChange={e => setSaudacao(e.target.value)}
              placeholder="Olá! Seja bem-vindo(a). Como posso ajudar?"
            />
          </div>
        </ConfigSection>

        {/* ── HORÁRIO ── */}
        <ConfigSection
          icon={Clock}
          title="Horário de atendimento"
          description="Fora do horário configurado, o bot responde com a mensagem de ausência."
        >
          <HorarioConfig config={horario} onChange={setHorario} />

          <div className={styles.field} style={{ marginTop: 'var(--space-4)' }}>
            <label className={styles.label}>Mensagem fora do horário</label>
            <textarea
              className={styles.textarea}
              rows={3}
              value={msgFora}
              onChange={e => setMsgFora(e.target.value)}
              placeholder="Olá! Nosso atendimento funciona de segunda a sexta, das 8h às 18h. Retornaremos em breve!"
            />
          </div>
        </ConfigSection>

        {/* ── NOTIFICAÇÕES ── */}
        <ConfigSection
          icon={Bell}
          title="Notificações"
          description="Configure alertas de fila, tempo de espera e eventos críticos."
        >
          <div className={styles.notifGrid}>
            {[
              { key: 'notif_nova_conversa',   label: 'Nova conversa',             desc: 'Quando uma nova conversa chegar' },
              { key: 'notif_fila_longa',      label: 'Fila longa (>5 min)',       desc: 'Quando houver espera prolongada' },
              { key: 'notif_equip_offline',   label: 'Equipamento offline',       desc: 'Quando um equipamento da rede cair' },
              { key: 'notif_os_agendada',     label: 'OS agendada',               desc: 'Lembretes de ordens de serviço' },
            ].map(item => (
              <label key={item.key} className={styles.notifItem}>
                <div>
                  <p className={styles.notifLabel}>{item.label}</p>
                  <p className={styles.notifDesc}>{item.desc}</p>
                </div>
                <input type="checkbox" defaultChecked className={styles.notifCheck} />
              </label>
            ))}
          </div>
        </ConfigSection>

        {/* ── API KEYS ── */}
        <ConfigSection
          icon={Shield}
          title="Chaves de API"
          description="Credenciais para integrações externas. Gerencie com cuidado."
        >
          <div className={styles.apiKeyWrap}>
            <div className={styles.apiKeyField}>
              <label className={styles.label}>Anthropic API Key</label>
              <div className={styles.apiKeyInput}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  className={styles.apiKeyText}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                />
                <button className={styles.apiKeyToggle}
                  onClick={() => setShowApiKey(v => !v)}
                  type="button" aria-label={showApiKey ? 'Ocultar' : 'Mostrar'}>
                  {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <p className={styles.fieldHint}>Armazenada como variável de ambiente no servidor</p>
            </div>
          </div>
        </ConfigSection>
      </div>

      {/* ── FOOTER FIXO ── */}
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
