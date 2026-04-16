import { useState } from 'react';
import {
  Phone, Mail, MapPin, Clock, User, Tag,
  ChevronDown, ExternalLink, AlertCircle, X,
} from 'lucide-react';
import Button from '../ui/Button';
import styles from './ConversaInfo.module.css';

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(v => !v)}>
        <span>{title}</span>
        <ChevronDown
          size={12}
          className={[styles.chevron, open && styles.open].filter(Boolean).join(' ')}
        />
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className={styles.infoRow}>
      <Icon size={12} className={styles.infoIcon} />
      <div className={styles.infoContent}>
        <span className={styles.infoLabel}>{label}</span>
        <span className={styles.infoValue}>{value}</span>
      </div>
    </div>
  );
}

export default function ConversaInfo({ conversa, chat }) {
  const { encerrar, transferir } = chat;
  const [showEncerrar, setShowEncerrar] = useState(false);
  const [motivo, setMotivo] = useState('');

  const confirmarEncerrar = () => {
    encerrar(conversa.id, motivo);
    setShowEncerrar(false);
    setMotivo('');
  };

  return (
    <aside className={styles.panel}>
      {/* ── CONTATO ── */}
      <div className={styles.contactHeader}>
        <div className={styles.contactAvatar}>
          {(conversa.nome || '?').charAt(0).toUpperCase()}
        </div>
        <div className={styles.contactInfo}>
          <p className={styles.contactNome}>{conversa.nome || 'Sem nome'}</p>
          <p className={styles.contactTel}>{conversa.telefone}</p>
        </div>
        <div className={styles.statusBadge} data-status={conversa.status}>
          {conversa.status === 'ia'         && 'IA'}
          {conversa.status === 'aguardando' && 'Fila'}
          {conversa.status === 'ativa'      && 'Agente'}
          {conversa.status === 'encerrada'  && 'Fechado'}
        </div>
      </div>

      <div className={styles.scroll}>
        {/* ── DADOS DO CONTATO ── */}
        <Section title="Contato">
          <InfoRow icon={Phone} label="Telefone" value={conversa.telefone} />
          <InfoRow icon={Mail}  label="E-mail"   value={conversa.email} />
          <InfoRow icon={MapPin} label="Cidade"  value={conversa.cidade} />
          <InfoRow icon={Tag}   label="Canal"    value={conversa.canal} />
          {conversa.contrato_id && (
            <a
              href={`#/clientes/${conversa.contrato_id}`}
              className={styles.link}
              aria-label="Ver contrato no ERP"
            >
              <ExternalLink size={11} />
              Ver contrato no ERP
            </a>
          )}
        </Section>

        {/* ── ATENDIMENTO ── */}
        <Section title="Atendimento">
          <InfoRow icon={Clock} label="Início"  value={conversa.criado_em && new Date(conversa.criado_em).toLocaleString('pt-BR')} />
          <InfoRow icon={User}  label="Agente"  value={conversa.agente_nome} />
          <InfoRow icon={Tag}   label="Protocolo" value={conversa.protocolo} />
          {conversa.prioridade > 0 && (
            <div className={styles.prioridade}>
              <AlertCircle size={12} />
              Prioridade alta
            </div>
          )}
        </Section>

        {/* ── AÇÕES ── */}
        {conversa.status !== 'encerrada' && (
          <Section title="Ações" defaultOpen>
            <div className={styles.acoes}>
              <Button
                variant="danger"
                size="sm"
                icon={X}
                onClick={() => setShowEncerrar(true)}
                className={styles.acaoBtn}
              >
                Encerrar conversa
              </Button>
            </div>

            {showEncerrar && (
              <div className={styles.encerrarForm}>
                <p className={styles.encerrarTitle}>Confirmar encerramento</p>
                <textarea
                  className={styles.encerrarInput}
                  placeholder="Motivo (opcional)"
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  rows={2}
                />
                <div className={styles.encerrarActions}>
                  <Button variant="ghost" size="sm" onClick={() => setShowEncerrar(false)}>
                    Cancelar
                  </Button>
                  <Button variant="danger" size="sm" onClick={confirmarEncerrar}>
                    Encerrar
                  </Button>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ── HISTÓRICO RESUMIDO ── */}
        <Section title="Histórico" defaultOpen={false}>
          <p className={styles.historicoDica}>
            Ver conversas anteriores deste contato.
          </p>
          <Button variant="ghost" size="sm" className={styles.acaoBtn}>
            Ver histórico completo
          </Button>
        </Section>
      </div>
    </aside>
  );
}
