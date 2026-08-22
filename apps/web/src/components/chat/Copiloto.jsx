import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { copilotoApi, cliente360Api } from '../../lib/api';
import { useStore } from '../../store';
import { Sparkles, Send, Pencil, X, ThumbsUp, ThumbsDown, Play, ListChecks } from 'lucide-react';
import styles from './Copiloto.module.css';

/**
 * Copiloto do atendente (FASE 10).
 *
 * A regra do §77 que este componente respeita: **o copiloto ajuda, não age**.
 * Nada daqui sai para o cliente sem uma pessoa clicar — "Enviar" manda como
 * mensagem DO ATENDENTE, e o metadado de origem fica no evento, não na fala.
 */
export default function Copiloto({ conversa, onInserir, onEnviar }) {
  const toast = useStore(s => s.toast);
  const [sugestao, setSugestao] = useState(null);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto]       = useState('');
  const [gerando, setGerando]   = useState(false);
  const [avaliado, setAvaliado] = useState(false);

  const { data: painel } = useQuery({
    queryKey: ['copiloto', conversa.id],
    queryFn:  () => copilotoApi.painel(conversa.id),
    // O painel é determinístico e barato (não chama o modelo), mas bate no SGP:
    // 30 s evita refazer a ficha a cada renderização do chat.
    staleTime: 30_000,
    retry: false,
  });

  const evento = (evento, extra = {}) => copilotoApi.evento(conversa.id, { evento, ...extra }).catch(() => {});

  const gerar = async () => {
    setGerando(true); setAvaliado(false);
    try {
      const r = await copilotoApi.sugestao(conversa.id);
      setSugestao(r); setTexto(r.texto); setEditando(false);
    } catch (err) {
      toast(err.message, 'error');
    } finally { setGerando(false); }
  };

  const executar = async (tool) => {
    try {
      // Reusa a rota do Cliente 360: allowlist, permissão e auditoria já moram
      // lá. Um segundo caminho para o mesmo poder ficaria sem alguma delas.
      const r = await cliente360Api.acao(conversa.id, { acao: tool });
      evento('acao_executada', { acao: tool });
      toast(String(r.resultado).slice(0, 160), 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const inserir = () => { onInserir?.(texto); evento(editando ? 'editada' : 'inserida', { texto: editando ? texto : null }); setSugestao(null); };
  const enviar  = () => { onEnviar?.(texto);  evento(editando ? 'editada' : 'enviada',  { texto: editando ? texto : null }); setSugestao(null); };
  const descartar = () => { evento('ignorada'); setSugestao(null); };

  const avaliar = async (feedback) => {
    await copilotoApi.feedback(conversa.id, { feedback }).catch(() => {});
    setAvaliado(true);
  };

  const prox = painel?.proxima;

  return (
    <div className={styles.root}>
      {/* ── PRÓXIMA AÇÃO (§79) ── */}
      {prox && (
        <div className={styles.proxima} data-destaque={prox.destaque ? '1' : undefined}>
          <Sparkles size={12} />
          <span className={styles.proximaMotivo}>{prox.motivo}</span>
          {prox.tools?.length > 0 && (
            <div className={styles.tools}>
              {prox.tools.map(t => (
                <button key={t} className={styles.toolBtn} onClick={() => executar(t)}>
                  <Play size={9} /> {t.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PROCEDIMENTO EM TEMPO REAL (§81) ── */}
      {painel?.playbook?.etapas?.length > 0 && (
        <details className={styles.playbook}>
          <summary>
            <ListChecks size={11} />
            {painel.playbook.playbook?.nome} — {painel.playbook.etapas.filter(e => e.feita).length}/{painel.playbook.etapas.length}
          </summary>
          <ul>
            {painel.playbook.etapas.map(e => (
              <li key={e.id} className={e.feita ? styles.feita : undefined}>
                {e.feita ? '✓' : '○'} {e.titulo}
                {e.obrigatoriedade !== 'obrigatoria' && <em> ({e.obrigatoriedade})</em>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* ── SUGESTÃO (§78) ── */}
      {sugestao ? (
        <div className={styles.sugestao}>
          {editando ? (
            <textarea className={styles.editor} value={texto} rows={4}
              onChange={e => setTexto(e.target.value)} autoFocus />
          ) : (
            <p className={styles.sugestaoTexto}>{texto}</p>
          )}

          {sugestao.fontes?.length > 0 && (
            <p className={styles.fontes}>Base: {sugestao.fontes.map(f => f.titulo).join(', ')}</p>
          )}

          <div className={styles.acoes}>
            <button className={styles.btnPrimario} onClick={enviar}><Send size={11} /> Enviar</button>
            <button className={styles.btn} onClick={inserir}>Inserir no campo</button>
            <button className={styles.btn} onClick={() => setEditando(v => !v)}><Pencil size={11} /> {editando ? 'Pronto' : 'Editar'}</button>
            <button className={styles.btnGhost} onClick={descartar}><X size={11} /></button>
            {!avaliado && (
              <span className={styles.feedback}>
                <button onClick={() => avaliar('positivo')} aria-label="Útil"><ThumbsUp size={11} /></button>
                <button onClick={() => avaliar('negativo')} aria-label="Não ajudou"><ThumbsDown size={11} /></button>
              </span>
            )}
          </div>
        </div>
      ) : (
        <button className={styles.gerar} onClick={gerar} disabled={gerando}>
          <Sparkles size={12} />
          {gerando ? 'Pensando…' : 'Sugerir resposta'}
        </button>
      )}
    </div>
  );
}
