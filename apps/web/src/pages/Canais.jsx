import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { canaisApi, whatsappQRApi } from '../lib/api';
import { useStore } from '../store';
import { Settings, CheckCircle, XCircle, ChevronDown, ChevronUp, Save, Wifi, WifiOff, RefreshCw, AlertCircle, Smartphone, Clock } from 'lucide-react';
import Button from '../components/ui/Button';
import Input  from '../components/ui/Input';
import styles from './Canais.module.css';

const CANAL_META = {
  whatsapp_qr: {
    nome:  'WhatsApp QR Code',
    icone: '📲',
    desc:  'Canal para testes — conecte escaneando o QR Code com seu celular.',
    campos: [],
  },
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

// ── CARD ESPECIAL: WhatsApp QR Code ───────────────────────────────
const QR_TTL = 60; // segundos antes de expirar

function CanalQRCard({ canal }) {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();
  const meta  = CANAL_META['whatsapp_qr'];

  const [qrStatus, setQrStatus]   = useState({ status: 'disconnected', qrcode: null });
  const [loading, setLoading]     = useState(false);
  const [countdown, setCountdown] = useState(0);
  const pollRef                   = useRef(null);
  const cdRef                     = useRef(null);

  const [expanded, setExpanded]   = useState(false);
  const [config, setConfig]       = useState(canal.config || {});
  const setConf = (k, v) => setConfig(c => ({ ...c, [k]: v }));

  const isConfigured = !!(config.evolution_url && config.evolution_key);

  const updateMut = useMutation({
    mutationFn: (d) => canaisApi.update('whatsapp_qr', d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['canais'] }); toast('Configurações salvas', 'success'); },
    onError:    e  => toast(e.message, 'error'),
  });

  const salvarConfig = () => updateMut.mutate({ ativo: canal.ativo, config });

  const fetchStatus = useCallback(async () => {
    try {
      const data = await whatsappQRApi.status();
      setQrStatus(data);
      return data.status;
    } catch {
      return 'disconnected';
    }
  }, []);

  // Polling enquanto status for 'connecting' ou 'qr'
  useEffect(() => {
    fetchStatus();
    return () => { clearInterval(pollRef.current); clearInterval(cdRef.current); };
  }, [fetchStatus]);

  useEffect(() => {
    clearInterval(pollRef.current);
    if (qrStatus.status === 'qr' || qrStatus.status === 'connecting') {
      pollRef.current = setInterval(async () => {
        const s = await fetchStatus();
        if (s === 'connected' || s === 'disconnected') clearInterval(pollRef.current);
      }, 3000);
    }
    return () => clearInterval(pollRef.current);
  }, [qrStatus.status, fetchStatus]);

  // Countdown regressivo quando QR estiver visível
  useEffect(() => {
    clearInterval(cdRef.current);
    if (qrStatus.status === 'qr') {
      setCountdown(QR_TTL);
      cdRef.current = setInterval(() => {
        setCountdown(v => {
          if (v <= 1) { clearInterval(cdRef.current); return 0; }
          return v - 1;
        });
      }, 1000);
    } else {
      setCountdown(0);
    }
    return () => clearInterval(cdRef.current);
  }, [qrStatus.status, qrStatus.qrcode]);

  const handleConnect = async () => {
    if (!isConfigured) {
      setExpanded(true);
      toast('Configure a URL e a API Key da Evolution antes de conectar.', 'error');
      return;
    }
    setLoading(true);
    try {
      const data = await whatsappQRApi.connect();
      setQrStatus(data);
      toast('Gerando QR Code na Evolution API…', 'info');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const data = await whatsappQRApi.refresh();
      setQrStatus(data);
      setCountdown(QR_TTL);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await whatsappQRApi.disconnect();
      setQrStatus({ status: 'disconnected', qrcode: null });
      toast('WhatsApp QR desconectado', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const STATUS_LABEL = {
    disconnected: 'Desconectado',
    connecting:   'Conectando…',
    qr:           'Aguardando leitura',
    connected:    'Conectado',
  };

  const isConnected  = qrStatus.status === 'connected';
  const isQR         = qrStatus.status === 'qr';
  const isConnecting = qrStatus.status === 'connecting';
  const cdUrgent     = countdown > 0 && countdown <= 15;

  return (
    <div className={[styles.qrCard, isConnected && styles.cardAtivo].join(' ')}>
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
          <div className={[styles.statusBadge, isConnected ? styles.statusAtivo : styles.statusInativo].join(' ')}>
            {isConnected
              ? <><CheckCircle size={11} /> {STATUS_LABEL.connected}</>
              : <><XCircle size={11} /> {STATUS_LABEL[qrStatus.status] || 'Desconectado'}</>
            }
          </div>

          {!isConnected && !isQR && !isConnecting && (
            <Button
              variant="accent"
              size="sm"
              icon={Wifi}
              loading={loading}
              onClick={handleConnect}
              disabled={loading}
            >
              Conectar
            </Button>
          )}
          {isQR && (
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              loading={loading}
              onClick={handleRefresh}
            >
              Novo QR
            </Button>
          )}
          {isConnected && (
            <Button
              variant="ghost"
              size="sm"
              icon={WifiOff}
              loading={loading}
              onClick={handleDisconnect}
            >
              Desconectar
            </Button>
          )}

          <button
            className={styles.expandBtn}
            onClick={() => setExpanded(v => !v)}
            aria-label="Configurações"
          >
            <Settings size={14} />
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* ── AVISO: sem configuração ── */}
      {!isConfigured && !expanded && (
        <div className={styles.qrWarning}>
          <AlertCircle size={14} />
          <span>Configure a Evolution API antes de conectar.</span>
          <button className={styles.qrWarningLink} onClick={() => setExpanded(true)}>
            Configurar agora
          </button>
        </div>
      )}

      {/* ── CONFIG EXPANDIDA ── */}
      {expanded && (
        <div className={styles.configArea}>
          <div className={styles.configGrid}>
            <div className={styles.configField}>
              <Input
                label="URL da Evolution API"
                type="text"
                size="sm"
                value={config.evolution_url || ''}
                onChange={e => setConf('evolution_url', e.target.value)}
                placeholder="https://evolution.seuservidor.com.br"
                autoComplete="off"
              />
            </div>
            <div className={styles.configField}>
              <Input
                label="API Key"
                type="password"
                size="sm"
                value={config.evolution_key || ''}
                onChange={e => setConf('evolution_key', e.target.value)}
                placeholder="B6D711FCDE4D4FD5936544120E713976"
                autoComplete="off"
              />
            </div>
          </div>
          {config.evolution_url && config.evolution_key && (
            <div className={styles.webhookInfo}>
              Webhook para receber mensagens:&nbsp;
              <code>/api/webhooks/evolution</code>
              <br/>Configure no painel da Evolution API → Instâncias → Webhook.
            </div>
          )}
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

      {/* ── CONECTANDO ── */}
      {isConnecting && (
        <div className={styles.qrConnecting}>
          <RefreshCw size={22} className={styles.qrSpinner} />
          <p>Inicializando instância na Evolution API…</p>
          <span>Aguarde, isso pode levar alguns segundos.</span>
        </div>
      )}

      {/* ── QR CODE ── */}
      {isQR && qrStatus.qrcode && (
        <div className={styles.qrSection}>
          <div className={styles.qrInstructions}>
            <Smartphone size={15} />
            <span>
              Abra o WhatsApp → <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong>
            </span>
          </div>
          <div className={styles.qrImageWrap}>
            <img
              src={qrStatus.qrcode}
              alt="QR Code WhatsApp"
              className={styles.qrImage}
            />
            {countdown > 0 && (
              <div className={[styles.qrCountdown, cdUrgent && styles.qrCountdownUrgent].join(' ')}>
                <Clock size={11} />
                <span>{countdown}s</span>
              </div>
            )}
          </div>
          <p className={styles.qrHint}>
            {countdown === 0
              ? 'QR expirado — clique em "Novo QR" para gerar outro.'
              : 'Este QR expira em breve. Escaneie agora ou clique em "Novo QR".'}
          </p>
        </div>
      )}

      {/* ── CONECTADO ── */}
      {isConnected && (
        <div className={styles.qrConnected}>
          <CheckCircle size={18} />
          <div>
            <p>WhatsApp conectado com sucesso via Evolution API.</p>
            <span>As mensagens recebidas neste número serão tratadas como conversas neste canal.</span>
          </div>
        </div>
      )}
    </div>
  );
}

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
          {canal.tipo === 'whatsapp' && config.provider === 'evolution' && config.evolution_url && config.evolution_key && (
            <div style={{ fontSize: 12, color: 'var(--brand-blue)', background: 'rgba(32,80,184,0.06)', border: '1px solid rgba(32,80,184,0.15)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, lineHeight: 1.6 }}>
              Webhook para receber mensagens:<br/>
              <code style={{ fontSize: 11 }}>/api/webhooks/evolution</code>
              <br/>Configure este URL no painel da Evolution API → Instâncias → Webhook.
            </div>
          )}
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

  const canalQR      = canaisMerge.find(c => c.tipo === 'whatsapp_qr');
  const outrosCanais = canaisMerge.filter(c => c.tipo !== 'whatsapp_qr');

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
        <>
          {canalQR && <CanalQRCard canal={canalQR} />}
          <div className={styles.gridCanais}>
            {outrosCanais.map(c => (
              <CanalCard key={c.tipo} canal={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
