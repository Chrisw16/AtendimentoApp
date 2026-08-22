import { useQuery, useQueryClient } from '@tanstack/react-query';
import { saudeApi } from '../lib/api';
import { useStore } from '../store';
import { Activity, AlertTriangle, CheckCircle2, XCircle, Inbox, Cpu, Server, Database } from 'lucide-react';
import styles from './Saude.module.css';

/**
 * Saúde do Sistema (FASE 13, §140).
 *
 * O público é o operador **não-técnico**. Por isso: nada de stack trace,
 * connection string ou payload; cada cartão diz o estado, **o que significa** e
 * **o que fazer**; e cor nunca é o único sinal — o rótulo textual vem junto.
 */

const ICONE = { ok: CheckCircle2, atencao: AlertTriangle, ruim: XCircle, degradado: AlertTriangle, sem_dados: Activity };

function Cartao({ icone: Icone, titulo, estado, significa, faca }) {
  const Marca = ICONE[estado] || Activity;
  return (
    <div className={styles.cartao} data-estado={estado}>
      <div className={styles.cartaoTopo}>
        <Icone size={14} />
        <strong>{titulo}</strong>
        <span className={styles.selo}><Marca size={11} /> {estado.replace('_', ' ')}</span>
      </div>
      {significa && <p className={styles.significa}>{significa}</p>}
      {faca && <p className={styles.faca}>→ {faca}</p>}
    </div>
  );
}

export default function Saude() {
  const qc = useQueryClient();
  const toast = useStore(s => s.toast);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['saude'],
    queryFn: saudeApi.saude,
    refetchInterval: 30_000,   // casa com o cache de 20 s do backend
    retry: false,
  });

  const marcar = async (erro, status) => {
    try { await saudeApi.marcarErro(erro.id, status); qc.invalidateQueries({ queryKey: ['saude'] }); }
    catch (err) { toast(err.message, 'error'); }
  };

  if (isLoading) return <div className={styles.root}><div className={`skeleton ${styles.skel}`} /></div>;
  if (!data) return <div className={styles.root}><p className={styles.vazio}>Não foi possível verificar o sistema agora.</p></div>;

  const f = data.filas || {};
  return (
    <div className={styles.root}>
      <div className={styles.veredito} data-estado={data.veredito?.estado}>
        <Activity size={18} />
        <div>
          <strong>{data.veredito?.frase}</strong>
          <small>verificado {new Date(data.ts).toLocaleTimeString('pt-BR')}</small>
        </div>
        <button className={styles.atualizar} onClick={() => refetch()}>Atualizar</button>
      </div>

      <div className={styles.cartoes}>
        <Cartao
          icone={Database} titulo="Sistema" estado={data.banco.estado}
          significa={data.banco.estado === 'ok' ? 'Banco de dados respondendo normalmente.' : 'O banco não está respondendo.'}
          faca={data.banco.estado === 'ok' ? null : 'Avise o suporte técnico — o atendimento está parado.'}
        />

        <Cartao
          icone={Inbox} titulo="Mensagens" estado={f.estado}
          significa={
            f.dlq > 0 ? `${f.dlq} mensagem(ns) não entregue(s). ${f.pendentes} na fila.`
            : f.mais_antiga_seg > 120 ? `${f.pendentes} na fila, a mais antiga há ${Math.round(f.mais_antiga_seg / 60)} min.`
            : `${f.pendentes} na fila — fluxo normal.`}
          faca={f.dlq > 0 ? 'Veja em Filas: são mensagens que falharam e precisam de decisão.' : null}
        />

        <Cartao
          icone={Server} titulo="Sistema do provedor (SGP)" estado={data.sgp.disjuntor === 'aberto' ? 'ruim' : data.sgp.estado}
          significa={data.sgp.disjuntor === 'aberto'
            ? 'As consultas foram pausadas automaticamente porque o SGP parou de responder.'
            : data.sgp.detalhe}
          faca={data.sgp.disjuntor === 'aberto'
            ? 'O sistema volta a tentar sozinho em cerca de 1 minuto. A IA segue atendendo sem os dados do ERP.'
            : null}
        />

        <Cartao
          icone={Cpu} titulo="Inteligência artificial" estado={data.ia.estado}
          significa={data.ia.detalhe}
          faca={data.ia.estado === 'ruim' ? 'As conversas vão ser transferidas para atendente. Confira a credencial em Configurações.' : null}
        />

        <Cartao
          icone={Activity} titulo="Tempo real (SSE)" estado={data.redis.estado}
          significa={data.redis.detalhe || 'Entrega em tempo real funcionando.'}
        />
      </div>

      {data.erros_recentes?.length > 0 && (
        <section className={styles.atencao}>
          <h2 className={styles.atencaoTitulo}><AlertTriangle size={13} /> Precisa de atenção</h2>
          {data.erros_recentes.map(e => (
            <div key={e.id} className={styles.erro}>
              <span className={styles.contador}>{e.ocorrencias}×</span>
              <div>
                <p>{e.mensagem}</p>
                <small>{e.origem} · última vez {new Date(e.ultimo_em).toLocaleString('pt-BR')}</small>
              </div>
              <div className={styles.erroAcoes}>
                <button onClick={() => marcar(e, 'visto')}>já vi</button>
                <button onClick={() => marcar(e, 'ignorado')}>ignorar</button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
