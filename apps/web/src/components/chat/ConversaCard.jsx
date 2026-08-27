import { MoreVertical, User } from 'lucide-react';
import MenuAcoes from './MenuAcoes';
import styles from './ConversaCard.module.css';

/**
 * O cartão da lateral. Antes mostrava nome, hora e prévia; agora diz também
 * SETOR, QUEM ATENDE e HÁ QUANTO TEMPO espera — três campos que o backend
 * mandava em toda listagem (`fila_nome`, `fila_cor`, `agente_nome`) e a tela
 * descartava.
 *
 * Mostrar quem atende não é enfeite: é o que evita dois agentes abrirem a mesma
 * conversa antes de o `assumir` condicional ter de recusar um deles.
 */

const STATUS_META = {
  ia:         { cls: styles.dotIa,      label: 'Com a IA' },
  aguardando: { cls: styles.dotWaiting, label: 'Aguardando' },
  ativa:      { cls: styles.dotActive,  label: 'Em atendimento' },
  encerrada:  { cls: styles.dotClosed,  label: 'Encerrada' },
};

const CANAL_EMOJI = {
  whatsapp: '📱', telegram: '✈️', widget: '💬',
  email: '✉️', voip: '📞', sms: '📨',
};

function fmtHora(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/**
 * Tempo de espera derivado de `aguardando_desde`, NUNCA de `conv.urgencia`.
 * Eventos SSE parciais reemitem `urgencia` zerada e o merge raso do store faz o
 * cronômetro voltar ao início sem a conversa ter saído da fila.
 */
function espera(conv) {
  if (!conv.aguardando_desde) return null;
  const t = new Date(conv.aguardando_desde).getTime();
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.floor((Date.now() - t) / 60000));
  const critico = Number(conv.critico_min) || 15;
  const atencao = Number(conv.atencao_min) || 5;
  const nivel = (conv.prioridade >= 2 || min >= critico) ? 'critico'
              : (conv.prioridade >= 1 || min >= atencao) ? 'atencao'
              : 'ok';
  return { min, nivel };
}

export default function ConversaCard({ conv, ativa, agenteId, filas, onSelect, onAssumir, acoes }) {
  const meta    = STATUS_META[conv.status] || STATUS_META.ia;
  const inicial = (conv.nome || conv.telefone || '?').charAt(0).toUpperCase();
  const esp     = espera(conv);
  const souEu   = conv.agente_id && conv.agente_id === agenteId;
  const podeAtender = conv.status === 'aguardando';
  const temAcoes    = conv.status !== 'encerrada';

  return (
    <div className={[styles.item, ativa && styles.itemAtivo, temAcoes && styles.comAcoes]
      .filter(Boolean).join(' ')}>
      {/* `.item` é um <div>, não um <button>: as ações precisam ficar FORA da
          área clicável, senão vira botão dentro de botão (HTML inválido, e o
          clique interno vaza para o de fora). Os filhos do `.content` são
          <span> pelo mesmo motivo — <div> dentro de <button> também é inválido. */}
      <button className={styles.avatar} onClick={onSelect} aria-current={ativa ? 'true' : undefined}
        aria-label={`Abrir conversa com ${conv.nome || conv.telefone || 'desconhecido'}`}>
        {conv.foto_perfil ? <img src={conv.foto_perfil} alt="" /> : <span>{inicial}</span>}
        <span className={[styles.dot, meta.cls].join(' ')} title={meta.label} />
      </button>

      <button className={styles.content} onClick={onSelect} tabIndex={-1}>
        <span className={styles.row}>
          <span className={styles.nome}>
            {CANAL_EMOJI[conv.canal] || '💬'} {conv.nome || conv.telefone || 'Desconhecido'}
          </span>
          <span className={styles.hora}>{fmtHora(conv.atualizado)}</span>
        </span>

        <span className={styles.row}>
          {conv.fila_nome && (
            <span className={styles.setor} title={`Setor: ${conv.fila_nome}`}>
              <span className={styles.setorBolinha}
                style={conv.fila_cor ? { background: conv.fila_cor } : undefined} />
              {conv.fila_nome}
            </span>
          )}
          {esp && (
            <span className={[styles.espera,
              esp.nivel === 'critico' && styles.esperaCritico,
              esp.nivel === 'atencao' && styles.esperaAtencao].filter(Boolean).join(' ')}
              title="Tempo de espera">
              {esp.min}min
            </span>
          )}
          {conv.agente_nome && (
            <span className={[styles.dono, souEu && styles.donoEu].filter(Boolean).join(' ')}
              title={`Atendido por ${conv.agente_nome}`}>
              <User size={10} />{souEu ? 'você' : conv.agente_nome.split(' ')[0]}
            </span>
          )}
          {conv.nao_lidas > 0 && (
            <span className={styles.badge}>{conv.nao_lidas > 9 ? '9+' : conv.nao_lidas}</span>
          )}
        </span>

        <span className={styles.row}>
          <span className={styles.preview}>{conv.ultima_mensagem || '—'}</span>
        </span>
      </button>

      {temAcoes && (
        <div className={styles.acoes}>
          {podeAtender && (
            <button className={styles.atender} onClick={() => onAssumir(conv.id)}>Atender</button>
          )}
          <MenuAcoes conversa={conv} filas={filas} {...acoes}
            trigger={(props) => (
              <button className={styles.menuBtn} {...props} aria-label="Ações da conversa">
                <MoreVertical size={14} />
              </button>
            )} />
        </div>
      )}
    </div>
  );
}
