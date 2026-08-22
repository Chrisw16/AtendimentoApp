import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { filasApi, cliente360Api, api } from '../../lib/api';
import { useStore } from '../../store';
import {
  Phone, Mail, MapPin, Clock, User, Tag, Wifi, WifiOff, Activity, Bot,
  ChevronDown, ExternalLink, AlertCircle, AlertTriangle, X, Stethoscope, FileText,
  LayoutPanelLeft,
} from 'lucide-react';
import Button from '../ui/Button';
import PainelSGP from './PainelSGP';
import styles from './ConversaInfo.module.css';

/**
 * Cliente 360 (FASE 6) — a lateral virou a central operacional do assinante.
 *
 * O que este componente NÃO faz, de propósito: mascarar. A máscara vem pronta
 * do servidor (`identidade.mascarado`), porque esconder no front deixa o CPF
 * inteiro viajar até o navegador. Aqui só se exibe o que chegou.
 */

function Section({ title, children, defaultOpen = true, badge = null }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(v => !v)}>
        <span>{title}{badge != null && <span className={styles.badge}>{badge}</span>}</span>
        <ChevronDown size={12} className={[styles.chevron, open && styles.open].filter(Boolean).join(' ')} />
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  if (value === null || value === undefined || value === '') return null;
  // Um campo que vem do SGP como objeto derrubava o painel INTEIRO (React #31)
  // — e com ele o chat. O painel nunca pode derrubar o atendimento: mostra o
  // que der para ler e segue.
  if (typeof value === 'object') value = value.contato ?? value.valor ?? JSON.stringify(value);
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

/** Cartão de contexto — cada um traz a AÇÃO sugerida, senão é ruído. */
function ContextCard({ card }) {
  return (
    <div className={styles.card} data-sev={card.severidade}>
      <div className={styles.cardTop}>
        <AlertTriangle size={12} />
        <strong>{card.titulo}</strong>
      </div>
      {card.detalhe && <p className={styles.cardDetalhe}>{card.detalhe}</p>}
      {card.acao && <p className={styles.cardAcao}>→ {card.acao}</p>}
    </div>
  );
}

const brl = (v) => `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;

export default function ConversaInfo({ conversa, chat }) {
  const { encerrar, transferirFila } = chat;
  const toast = useStore(s => s.toast);
  const [showEncerrar, setShowEncerrar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [filas, setFilas]   = useState([]);
  const [saida, setSaida]   = useState(null);   // resultado da última ação/diagnóstico
  const [painelAberto, setPainelAberto] = useState(false);
  // Qual contrato o painel está olhando. `null` = o principal da ficha. Zera ao
  // trocar de conversa, senão o contrato do cliente anterior atravessa.
  const [contratoId, setContratoId] = useState(null);

  useEffect(() => { setContratoId(null); setPainelAberto(false); setSaida(null); }, [conversa.id]);

  useEffect(() => {
    if (conversa.status === 'encerrada') return;
    filasApi.list().then(setFilas).catch(() => setFilas([]));
  }, [conversa.status]);

  const { data: caps } = useQuery({
    queryKey: ['cliente360-caps'],
    queryFn:  cliente360Api.capacidades,
    staleTime: 5 * 60_000,
  });

  // FASE 9 (§74): por que esta conversa caiu na mão de um humano, e o que a IA
  // já tinha feito. Sem isto o agente lê 40 mensagens para descobrir.
  const { data: handoff } = useQuery({
    queryKey: ['handoff', conversa.id],
    queryFn:  () => api.get(`/ia/handoff/${conversa.id}`),
    enabled:  conversa.status !== 'ia',
    retry: false,
  });

  const { data: ficha, isLoading, refetch } = useQuery({
    queryKey: ['cliente360', conversa.id],
    queryFn:  () => cliente360Api.ficha(conversa.id),
    // A ficha é do assinante, não da conversa: 60 s evita bater no SGP a cada
    // clique entre conversas do mesmo cliente sem deixar o dado velho na tela.
    staleTime: 60_000,
    retry: false,
  });

  const acaoMut = useMutation({
    mutationFn: (acao) => cliente360Api.acao(conversa.id, { acao, contrato: contratoId || undefined }),
    onSuccess:  (r) => { setSaida({ titulo: r.acao, texto: r.resultado }); refetch(); },
    onError:    (e) => toast(e.message, 'error'),
  });

  const diagMut = useMutation({
    mutationFn: () => cliente360Api.diagnostico(conversa.id),
    onSuccess:  (r) => setSaida({
      titulo: 'Diagnóstico completo',
      texto: r.passos.map(p => `• ${p.tool}: ${p.ok ? p.resultado : `falhou (${p.erro})`}`).join('\n\n'),
    }),
    onError:    (e) => toast(e.message, 'error'),
  });

  const confirmarEncerrar = () => {
    encerrar(conversa.id, motivo);
    setShowEncerrar(false);
    setMotivo('');
  };

  const id  = ficha?.identidade || {};
  // O seletor não custa request: a ficha já traz os contratos inteiros (com
  // endereço e serviço), então trocar é só re-renderizar.
  const ctr = (contratoId && ficha?.contratos?.find(c => String(c.id) === String(contratoId)))
           || ficha?.contrato_principal;

  return (
    <aside className={styles.panel}>
      {/* ── CONTATO ── */}
      <div className={styles.contactHeader}>
        <div className={styles.contactAvatar}>{(id.nome || conversa.nome || '?').charAt(0).toUpperCase()}</div>
        <div className={styles.contactInfo}>
          <p className={styles.contactNome}>{id.nome || conversa.nome || 'Sem nome'}</p>
          <p className={styles.contactTel}>{id.telefone || conversa.telefone}</p>
        </div>
        <div className={styles.statusBadge} data-status={conversa.status}>
          {conversa.status === 'ia'         && 'IA'}
          {conversa.status === 'aguardando' && 'Fila'}
          {conversa.status === 'ativa'      && 'Agente'}
          {conversa.status === 'encerrada'  && 'Fechado'}
        </div>
      </div>

      <div className={styles.scroll}>
        {/* ── HANDOFF DA IA (§74) ── */}
        {handoff && (
          <div className={styles.handoff} data-prio={handoff.prioridade}>
            <div className={styles.handoffTop}>
              <Bot size={12} />
              <strong>A IA transferiu: {handoff.motivo_label}</strong>
            </div>
            <p className={styles.handoffResumo}>{handoff.resumo}</p>
            {handoff.tools_executadas?.length > 0 && (
              <p className={styles.handoffTools}>
                Já consultado: {handoff.tools_executadas.join(', ')} — não repita.
              </p>
            )}
            {handoff.playbook && (
              <p className={styles.handoffTools}>
                Procedimento “{handoff.playbook.nome}”: {handoff.playbook.feitas} de {handoff.playbook.total} etapas.
              </p>
            )}
          </div>
        )}

        {/* ── CONTEXT CARDS ── */}
        {isLoading && <div className={`skeleton ${styles.skelCard}`} />}
        {ficha?.cards?.length > 0 && (
          <div className={styles.cards}>
            {ficha.cards.map(c => <ContextCard key={c.id} card={c} />)}
          </div>
        )}

        {/* Falha de integração é informação operacional, não detalhe técnico:
            sem isto o agente lê "sem débito" quando na verdade é "não sei". */}
        {ficha?.avisos?.length > 0 && (
          <div className={styles.avisos}>
            <AlertCircle size={11} />
            <div>
              <strong>Dados incompletos</strong>
              {ficha.avisos.map((a, i) => <p key={i}>{a}</p>)}
            </div>
          </div>
        )}

        {/* ── VISÃO GERAL ── */}
        <Section title="Visão geral">
          <InfoRow icon={User}   label="CPF/CNPJ" value={id.cpf} />
          <InfoRow icon={Phone}  label="Telefone" value={id.telefone || conversa.telefone} />
          <InfoRow icon={Mail}   label="E-mail"   value={id.email || conversa.email} />
          <InfoRow icon={MapPin} label="Cidade"   value={ctr?.cidade || conversa.cidade} />
          <InfoRow icon={Tag}    label="Canal"    value={conversa.canal} />
          {id.mascarado && <p className={styles.nota}>Dados mascarados. Requer permissão para ver completo.</p>}

          {ctr && (
            <>
              <InfoRow icon={FileText} label="Contrato" value={`#${ctr.id} — ${ctr.status}`} />
              <InfoRow icon={Activity} label="Plano"    value={ctr.plano} />
              <InfoRow icon={MapPin}   label="POP"      value={ctr.popNome} />
            </>
          )}
          {ficha?.contratos?.length > 1 && (
            <>
              <label className={styles.filaLabel} htmlFor="contrato-sel">Contrato</label>
              <select
                id="contrato-sel"
                className={styles.filaSelect}
                value={ctr?.id ?? ''}
                onChange={e => setContratoId(e.target.value)}
              >
                {ficha.contratos.map(c => (
                  <option key={c.id} value={c.id}>#{c.id} — {c.status} — {c.plano || 'sem plano'}</option>
                ))}
              </select>
            </>
          )}

          {ficha && (
            <Button
              variant="ghost" size="sm" icon={LayoutPanelLeft}
              className={styles.acaoBtn}
              onClick={() => setPainelAberto(true)}
            >
              Painel completo
            </Button>
          )}
        </Section>

        {/* ── FINANCEIRO ── */}
        {ficha?.financeiro && (
          <Section title="Financeiro" badge={ficha.financeiro.titulos_abertos || null}>
            <InfoRow icon={FileText} label="Títulos em aberto" value={String(ficha.financeiro.titulos_abertos)} />
            <InfoRow icon={Tag}      label="Total em aberto"   value={brl(ficha.financeiro.valor_aberto)} />
            <InfoRow icon={Clock}    label="Vencimento"        value={ficha.financeiro.vencimento} />
          </Section>
        )}

        {/* ── DIAGNÓSTICO ── */}
        {ficha?.diagnostico && (
          <Section title="Diagnóstico" defaultOpen={false}>
            {ficha.diagnostico.conexao ? (
              <InfoRow
                icon={ficha.diagnostico.conexao.online ? Wifi : WifiOff}
                label="Conexão"
                value={ficha.diagnostico.conexao.msg || (ficha.diagnostico.conexao.online ? 'Online' : 'Offline')}
              />
            ) : (
              <p className={styles.nota}>Não consultado — rode o diagnóstico completo.</p>
            )}
            {ficha.diagnostico.chamados?.slice(0, 3).map(ch => (
              <div key={ch.numero} className={styles.chamado}>
                <strong>#{ch.numero}</strong> {ch.tipo} — {ch.status}
              </div>
            ))}
            <Button
              variant="ghost" size="sm" icon={Stethoscope}
              className={styles.acaoBtn}
              disabled={diagMut.isPending}
              onClick={() => diagMut.mutate()}
            >
              {diagMut.isPending ? 'Diagnosticando…' : 'Diagnóstico completo'}
            </Button>
          </Section>
        )}

        {/* ── AÇÕES RÁPIDAS ── */}
        {caps?.acoes?.length > 0 && conversa.status !== 'encerrada' && (
          <Section title="Ações rápidas">
            <div className={styles.acoesGrid}>
              {caps.acoes.map(a => (
                <button
                  key={a.id}
                  className={styles.acaoChip}
                  disabled={acaoMut.isPending}
                  onClick={() => acaoMut.mutate(a.id)}
                >{a.label}</button>
              ))}
            </div>
            {acaoMut.isPending && <p className={styles.nota}>Executando…</p>}
          </Section>
        )}

        {/* Resultado da tool: texto cru, do mesmo jeito que a IA recebe. É
            proposital — o agente vê exatamente o que o sistema respondeu. */}
        {saida && (
          <div className={styles.saida}>
            <div className={styles.saidaTop}>
              <strong>{saida.titulo}</strong>
              <button onClick={() => setSaida(null)} aria-label="Fechar">✕</button>
            </div>
            <pre className={styles.saidaTexto}>{saida.texto}</pre>
          </div>
        )}

        {/* ── HISTÓRICO 360 ── */}
        <Section title="Histórico" defaultOpen={false} badge={ficha?.conversas_anteriores || null}>
          <InfoRow icon={Clock} label="Início desta conversa" value={conversa.criado_em && new Date(conversa.criado_em).toLocaleString('pt-BR')} />
          <InfoRow icon={User}  label="Agente"    value={conversa.agente_nome} />
          <InfoRow icon={Tag}   label="Protocolo" value={conversa.protocolo} />
          {ficha?.ultimo_nps && (
            <InfoRow icon={Activity} label="Última avaliação" value={`${ficha.ultimo_nps.nota}/${ficha.ultimo_nps.escala || 10}`} />
          )}
          {ficha?.conversas_recentes?.map(c => (
            <div key={c.id} className={styles.histLinha}>
              <span>{new Date(c.criado_em).toLocaleDateString('pt-BR')}</span>
              <span className={styles.histTexto}>{c.ultima_mensagem?.slice(0, 40) || c.protocolo || c.status}</span>
            </div>
          ))}
          {ficha && !ficha.conversas_anteriores && <p className={styles.nota}>Primeiro contato deste número.</p>}
        </Section>

        {/* ── AÇÕES DA CONVERSA ── */}
        {conversa.status !== 'encerrada' && (
          <Section title="Conversa" defaultOpen>
            <div className={styles.acoes}>
              <Button variant="danger" size="sm" icon={X} onClick={() => setShowEncerrar(true)} className={styles.acaoBtn}>
                Encerrar conversa
              </Button>
            </div>

            {filas.length > 0 && (
              <div className={styles.filaWrap}>
                <label className={styles.filaLabel} htmlFor="fila-destino">Transferir para fila</label>
                <select
                  id="fila-destino"
                  className={styles.filaSelect}
                  value=""
                  onChange={e => e.target.value && transferirFila(conversa.id, e.target.value)}
                >
                  <option value="">Escolher fila…</option>
                  {filas.filter(f => f.ativa && f.id !== conversa.fila_id).map(f => (
                    <option key={f.id} value={f.id}>
                      {f.nome}{f.aguardando ? ` (${f.aguardando} na fila)` : ''}
                    </option>
                  ))}
                </select>
                {conversa.fila_nome && <p className={styles.filaAtual}>Fila atual: {conversa.fila_nome}</p>}
              </div>
            )}

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
                  <Button variant="ghost" size="sm" onClick={() => setShowEncerrar(false)}>Cancelar</Button>
                  <Button variant="danger" size="sm" onClick={confirmarEncerrar}>Encerrar</Button>
                </div>
              </div>
            )}
          </Section>
        )}
      </div>

      {painelAberto && (
        <PainelSGP
          conversa={conversa}
          ficha={ficha}
          contrato={ctr}
          contratos={ficha?.contratos || []}
          onTrocarContrato={c => setContratoId(c?.id ?? null)}
          onFechar={() => setPainelAberto(false)}
          caps={caps}
          onAcao={(acao) => { acaoMut.mutate(acao); setPainelAberto(false); }}
        />
      )}
    </aside>
  );
}
