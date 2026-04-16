import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { canaisApi } from '../lib/api';
import { useStore } from '../store';
import { Settings, CheckCircle, XCircle, ChevronDown, ChevronUp, Save } from 'lucide-react';
import Button from '../components/ui/Button';
import Input  from '../components/ui/Input';
import styles from './Canais.module.css';

const CANAL_META = {
  whatsapp: {
    nome:  'WhatsApp',
    icone: '📱',
    desc:  'Atendimento via WhatsApp Business API (Meta) ou Evolution API.',
    campos: [
      { key: 'provider',        label: 'Provider',          type: 'select', opts: ['meta', 'evolution'] },
      { key: 'phone_number_id', label: 'Phone Number ID',   type: 'text',   cond: (c) => c.provider === 'meta' },
      { key: 'access_token',    label: 'Access Token',      type: 'password', cond: (c) => c.provider === 'meta' },
      { key: 'evolution_url',   label: 'URL da Evolution',  type: 'text',   cond: (c) => c.provider === 'evolution' },
      { key: 'evolution_key',   label: 'API Key',           type: 'password', cond: (c) => c.provider === 'evolution' },
      { key: 'instance',        label: 'Instance Name',     type: 'text',   cond: (c) => c.provider === 'evolution' },
    ],
  },
  telegram: {
    nome:  'Telegram',
    icone: '✈️',
    desc:  'Bot Telegram via BotFather.',
    campos: [
      { key: 'bot_token', label: 'Bot Token', type: 'password' },
    ],
  },
  widget: {
    nome:  'Widget Web',
    icone: '💬',
    desc:  'Chat embutido em qualquer site via snippet JavaScript.',
    campos: [
      { key: 'cor_primaria', label: 'Cor primária', type: 'color' },
      { key: 'nome_bot',     label: 'Nome do bot',  type: 'text'  },
      { key: 'saudacao',     label: 'Saudação inicial', type: 'text' },
    ],
  },
  email: {
    nome:  'E-mail',
    icone: '✉️',
    desc:  'Receba e-mails como conversas via IMAP.',
    campos: [
      { key: 'imap_host', label: 'Servidor IMAP', type: 'text' },
      { key: 'imap_port', label: 'Porta',         type: 'number' },
      { key: 'imap_user', label: 'Usuário',       type: 'text' },
      { key: 'imap_pass', label: 'Senha',         type: 'password' },
      { key: 'smtp_host', label: 'Servidor SMTP', type: 'text' },
      { key: 'smtp_port', label: 'Porta SMTP',    type: 'number' },
    ],
  },
  voip: {
    nome:  'VoIP',
    icone: '📞',
    desc:  'Integração com Asterisk via ARI.',
    campos: [
      { key: 'asterisk_host', label: 'Host Asterisk', type: 'text' },
      { key: 'asterisk_port', label: 'Porta ARI',     type: 'number' },
      { key: 'asterisk_user', label: 'Usuário ARI',   type: 'text' },
      { key: 'asterisk_pass', label: 'Senha ARI',     type: 'password' },
    ],
  },
  sms: {
    nome:  'SMS',
    icone: '📨',
    desc:  'Envio e recebimento de SMS via gateway.',
    campos: [
      { key: 'gateway_url', label: 'URL do gateway', type: 'text' },
      { key: 'gateway_key', label: 'API Key',        type: 'password' },
    ],
  },
};

function CanalCard({ canal }) {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();
  const meta  = CANAL_META[canal.tipo] || { nome: canal.nome, icone: '⚙️', desc: '', campos: [] };
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig]     = useState(canal.config || {});

  const updateMut = useMutation({
    mutationFn: (d) => canaisApi.update(canal.tipo, d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['canais'] }); toast('Canal atualizado', 'success'); },
    onError:    e  => toast(e.message, 'error'),
  });

  const toggleAtivo = () => updateMut.mutate({ ativo: !canal.ativo, config });
  const salvarConfig = () => updateMut.mutate({ ativo: canal.ativo, config });
  const setConf = (k, v) => setConfig(c => ({ ...c, [k]: v }));

  const camposVisiveis = meta.campos.filter(c => !c.cond || c.cond(config));

  return (
    <div className={[styles.card, canal.ativo && styles.cardAtivo].join(' ')}>
      {/* ── HEADER ── */}
      <div className={styles.cardHeader}>
        <div className={styles.cardLeft}>
          <span className={styles.cardIcon}>{meta.icone}</span>
          <div>
            <p className={styles.cardNome}>{meta.nome}</p>
            <p className={styles.cardDesc}>{meta.desc}</p>
          </div>
        </div>
        <div className={styles.cardRight}>
          {/* Status badge */}
          <div className={[styles.statusBadge, canal.ativo ? styles.statusAtivo : styles.statusInativo].join(' ')}>
            {canal.ativo
              ? <><CheckCircle size={11} /> Ativo</>
              : <><XCircle size={11} /> Inativo</>
            }
          </div>

          {/* Toggle */}
          <label className={styles.toggle} aria-label={canal.ativo ? 'Desativar canal' : 'Ativar canal'}>
            <input
              type="checkbox"
              checked={canal.ativo}
              onChange={toggleAtivo}
              disabled={updateMut.isPending}
            />
            <span className={styles.toggleTrack}>
              <span className={styles.toggleThumb} />
            </span>
          </label>

          {/* Expandir config */}
          {camposVisiveis.length > 0 && (
            <button
              className={styles.expandBtn}
              onClick={() => setExpanded(v => !v)}
              aria-label="Configurações"
            >
              <Settings size={14} />
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* ── CONFIG EXPANDIDA ── */}
      {expanded && (
        <div className={styles.configArea}>
          <div className={styles.configGrid}>
            {camposVisiveis.map(campo => (
              <div key={campo.key} className={styles.configField}>
                {campo.type === 'select' ? (
                  <>
                    <label className={styles.configLabel}>{campo.label}</label>
                    <select
                      className={styles.configSelect}
                      value={config[campo.key] || ''}
                      onChange={e => setConf(campo.key, e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {campo.opts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </>
                ) : campo.type === 'color' ? (
                  <>
                    <label className={styles.configLabel}>{campo.label}</label>
                    <div className={styles.colorRow}>
                      <input
                        type="color"
                        value={config[campo.key] || '#00E5A0'}
                        onChange={e => setConf(campo.key, e.target.value)}
                        className={styles.colorInput}
                      />
                      <span className={styles.colorVal}>{config[campo.key] || '#00E5A0'}</span>
                    </div>
                  </>
                ) : (
                  <Input
                    label={campo.label}
                    type={campo.type}
                    size="sm"
                    value={config[campo.key] || ''}
                    onChange={e => setConf(campo.key, e.target.value)}
                    autoComplete="off"
                  />
                )}
              </div>
            ))}
          </div>
          <div className={styles.configActions}>
            <Button
              variant="accent"
              size="sm"
              icon={Save}
              loading={updateMut.isPending}
              onClick={salvarConfig}
            >
              Salvar configurações
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Canais() {
  const { data: canais = [], isLoading } = useQuery({
    queryKey: ['canais'],
    queryFn:  canaisApi.list,
  });

  const TIPOS = Object.keys(CANAL_META);
  const canaisMerge = TIPOS.map(tipo => {
    const existente = canais.find(c => c.tipo === tipo);
    return existente || { tipo, nome: CANAL_META[tipo].nome, ativo: false, config: {} };
  });

  return (
    <div className={styles.root}>
      <p className={styles.intro}>
        Configure os canais de atendimento. Ative apenas os que estão prontos para uso.
      </p>

      {isLoading ? (
        <div className={styles.skelList}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`skeleton ${styles.skelCard}`} />
          ))}
        </div>
      ) : (
        <div className={styles.lista}>
          {canaisMerge.map(c => <CanalCard key={c.tipo} canal={c} />)}
        </div>
      )}
    </div>
  );
}
