import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qualityApi } from '../lib/api';
import { useStore } from '../store';
import { ClipboardCheck, AlertTriangle, Sliders, TrendingUp } from 'lucide-react';
import Button from '../components/ui/Button';
import styles from './Qualidade.module.css';

/**
 * Quality AI (FASE 11).
 *
 * A tela respeita duas regras do plano que são fáceis de violar sem perceber:
 * **toda penalização mostra a evidência** (§97) — nota sem justificativa não
 * sustenta conversa de feedback — e **a lista por agente vem com a contagem de
 * auditorias junto** (§99), porque média de duas auditorias não é média, e o
 * plano pede explicitamente para evitar ranking simplista.
 */

const cor = (n) => n == null ? 'vazio' : n >= 80 ? 'bom' : n >= 60 ? 'medio' : 'ruim';

function Revisao({ auditoria, onPronto }) {
  const toast = useStore(s => s.toast);
  const [score, setScore] = useState(auditoria.final_score ?? '');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!obs.trim()) { toast('Justifique a revisão — nota sem justificativa não sustenta feedback.', 'error'); return; }
    setSalvando(true);
    try { await qualityApi.revisar(auditoria.id, { score: Number(score), observacao: obs }); onPronto(); toast('Revisão registrada', 'success'); }
    catch (err) { toast(err.message, 'error'); }
    finally { setSalvando(false); }
  };

  return (
    <div className={styles.revisao}>
      <label className={styles.label}>Discordo da IA — minha nota</label>
      <div className={styles.revisaoLinha}>
        <input type="number" min="0" max="100" className={styles.input} value={score} onChange={e => setScore(e.target.value)} />
        <input className={styles.input} style={{ flex: 1 }} placeholder="Por quê? (obrigatório)" value={obs} onChange={e => setObs(e.target.value)} />
        <Button variant="primary" size="sm" onClick={salvar} disabled={salvando}>Salvar</Button>
      </div>
    </div>
  );
}

function Detalhe({ id, onFechar }) {
  const qc = useQueryClient();
  const { data: a } = useQuery({ queryKey: ['quality-aud', id], queryFn: () => qualityApi.auditoria(id) });
  if (!a) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Auditoria</h2>
          <Button variant="ghost" size="sm" onClick={onFechar}>✕</Button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.notas}>
            <span className={styles.nota} data-cor={cor(a.ai_score)}>IA {a.ai_score ?? '—'}</span>
            {a.human_score != null && <span className={styles.nota} data-cor={cor(a.human_score)}>Humano {a.human_score}</span>}
            <span className={styles.notaFinal} data-cor={cor(a.final_score)}>Final {a.final_score ?? '—'}</span>
          </div>

          {a.resumo && <p className={styles.resumo}>{a.resumo}</p>}

          {a.violacoes?.length > 0 && (
            <div className={styles.violacoes}>
              <strong><AlertTriangle size={12} /> Violações críticas</strong>
              {a.violacoes.map((v, i) => (
                <p key={i}><strong>{v.tipo}</strong>: {v.descricao} {v.evidencia && <em>— "{v.evidencia}"</em>}</p>
              ))}
            </div>
          )}

          {a.aderencia && (
            <p className={styles.aderencia}>
              Procedimento: <strong>{a.aderencia.percentual}%</strong> ({a.aderencia.cumpridas}/{a.aderencia.total} etapas obrigatórias)
              {a.aderencia.justificadas?.length > 0 && ` · ${a.aderencia.justificadas.length} exceção(ões) aceita(s)`}
              {a.aderencia.puladas?.length > 0 && ` · pulou: ${a.aderencia.puladas.map(e => e.titulo).join(', ')}`}
            </p>
          )}

          <div className={styles.criterios}>
            {(a.avaliacoes || []).map((av, i) => (
              <div key={i} className={styles.criterio}>
                <span className={styles.criterioNota} data-cor={cor(av.nota * 10)}>{av.nota}</span>
                <div>
                  <strong>{av.nome || av.criterio_id}</strong>
                  {/* §97: penalização SEM evidência não deveria existir — se aparecer, aparece explícita. */}
                  <p>{av.justificativa || <em>sem justificativa registrada</em>}</p>
                  {av.evidencias?.length > 0 && <p className={styles.evidencia}>“{av.evidencias.join('” · “')}”</p>}
                </div>
              </div>
            ))}
          </div>

          {a.oportunidades?.length > 0 && (
            <div className={styles.oportunidades}>
              <strong>Oportunidades perdidas</strong>
              {a.oportunidades.map((o, i) => (
                <p key={i}>{o.tipo} ({o.confianca}) — {o.evidencia}</p>
              ))}
            </div>
          )}

          {a.coaching && <p className={styles.coaching}><TrendingUp size={12} /> {a.coaching}</p>}

          {a.observacao_humana && <p className={styles.obs}>Revisão: {a.observacao_humana}</p>}

          <Revisao auditoria={a} onPronto={() => { qc.invalidateQueries({ queryKey: ['quality-aud', id] }); qc.invalidateQueries({ queryKey: ['quality'] }); }} />
        </div>
      </div>
    </div>
  );
}

function Scorecards() {
  const qc = useQueryClient();
  const toast = useStore(s => s.toast);
  const { data: lista = [] } = useQuery({ queryKey: ['quality-sc'], queryFn: qualityApi.scorecards });

  const alternar = async (sc) => {
    try { await qualityApi.salvarScorecard(sc.id, { ativo: !sc.ativo }); qc.invalidateQueries({ queryKey: ['quality-sc'] }); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className={styles.lista}>
      <p className={styles.hint}>
        Scorecard <strong>ativo</strong> faz toda conversa encerrada ser auditada automaticamente — e cada
        auditoria custa uma chamada de IA. Por isso eles nascem desligados.
      </p>
      {lista.length === 0 && <p className={styles.vazio}>Nenhum scorecard. O deploy cria dois (suporte e comercial).</p>}
      {lista.map(sc => (
        <div key={sc.id} className={styles.item}>
          <div className={styles.itemTop}>
            <strong>{sc.nome}</strong>
            <span className={styles.tag}>{sc.perfil}</span>
            <span className={styles.tag}>v{sc.versao}</span>
            <span className={styles.tag}>{(sc.criterios || []).length} critérios</span>
            <label className={styles.switch}>
              <input type="checkbox" checked={!!sc.ativo} onChange={() => alternar(sc)} />
              {sc.ativo ? 'auditando' : 'desligado'}
            </label>
          </div>
          <div className={styles.criteriosResumo}>
            {(sc.criterios || []).map(c => (
              <span key={c.id} className={c.critico ? styles.chipCritico : styles.chip}>
                {c.nome} · peso {c.peso}{c.critico ? ' · crítico' : ''}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Qualidade() {
  const [aba, setAba] = useState('auditorias');
  const [detalhe, setDetalhe] = useState(null);
  const [filtro, setFiltro] = useState({});

  const { data: painel } = useQuery({ queryKey: ['quality-painel'], queryFn: () => qualityApi.painel(30) });
  const { data: auditorias = [], isLoading } = useQuery({
    queryKey: ['quality', filtro],
    queryFn: () => qualityApi.auditorias(filtro),
  });

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.abas} role="tablist">
          <button role="tab" aria-selected={aba === 'auditorias'} className={[styles.aba, aba === 'auditorias' && styles.abaAtiva].filter(Boolean).join(' ')} onClick={() => setAba('auditorias')}>
            <ClipboardCheck size={13} /> Auditorias
          </button>
          <button role="tab" aria-selected={aba === 'scorecards'} className={[styles.aba, aba === 'scorecards' && styles.abaAtiva].filter(Boolean).join(' ')} onClick={() => setAba('scorecards')}>
            <Sliders size={13} /> Scorecards
          </button>
        </div>
      </div>

      {aba === 'scorecards' ? <Scorecards /> : (
        <>
          {painel && (
            <div className={styles.painel}>
              <div className={styles.kpi}><span>{painel.total ?? 0}</span><small>auditorias (30d)</small></div>
              <div className={styles.kpi} data-cor={cor(painel.media)}><span>{painel.media ?? '—'}</span><small>nota média</small></div>
              <div className={styles.kpi}><span>{painel.com_violacao ?? 0}</span><small>com violação</small></div>
              <div className={styles.kpi}><span>{painel.revisadas ?? 0}</span><small>revisadas por humano</small></div>
              {painel.divergencia_media != null && (
                <div className={styles.kpi}><span>{painel.divergencia_media > 0 ? '+' : ''}{painel.divergencia_media}</span><small>divergência humano−IA</small></div>
              )}
            </div>
          )}

          {painel?.agentes?.length > 0 && (
            <div className={styles.agentes}>
              {/* O plano pede para EVITAR ranking simplista (§99): a contagem vem
                  junto porque média de 2 auditorias não é média. */}
              {painel.agentes.map(a => (
                <span key={a.agente_id} className={styles.agente} data-cor={cor(a.media)}>
                  {a.nome || 'sem nome'} · <strong>{a.media}</strong> <small>({a.auditorias} auditoria{a.auditorias > 1 ? 's' : ''})</small>
                </span>
              ))}
            </div>
          )}

          <div className={styles.filtros}>
            <button className={!filtro.criticas && !filtro.revisadas ? styles.filtroOn : styles.filtro} onClick={() => setFiltro({})}>Todas</button>
            <button className={filtro.criticas ? styles.filtroOn : styles.filtro} onClick={() => setFiltro({ criticas: '1' })}>Com violação</button>
            <button className={filtro.revisadas === '0' ? styles.filtroOn : styles.filtro} onClick={() => setFiltro({ revisadas: '0' })}>Não revisadas</button>
          </div>

          <div className={styles.lista}>
            {isLoading ? <div className={`skeleton ${styles.skel}`} />
              : auditorias.length === 0 ? <p className={styles.vazio}>Nenhuma auditoria ainda. Ative um scorecard para auditar as conversas encerradas.</p>
              : auditorias.map(a => (
                <button key={a.id} className={styles.item} onClick={() => setDetalhe(a.id)}>
                  <div className={styles.itemTop}>
                    <span className={styles.nota} data-cor={cor(a.final_score)}>{a.final_score ?? '—'}</span>
                    <strong>{a.agente_nome || 'sem agente'}</strong>
                    <span className={styles.tag}>{a.perfil}</span>
                    {Number(a.violacoes) > 0 && <span className={styles.tagCritico}><AlertTriangle size={10} /> {a.violacoes}</span>}
                    {a.revisado_em && <span className={styles.tag}>revisada</span>}
                    <span className={styles.data}>{new Date(a.criado_em).toLocaleDateString('pt-BR')}</span>
                  </div>
                  {a.resumo && <p className={styles.resumo}>{a.resumo}</p>}
                </button>
              ))}
          </div>
        </>
      )}

      {detalhe && <Detalhe id={detalhe} onFechar={() => setDetalhe(null)} />}
    </div>
  );
}
