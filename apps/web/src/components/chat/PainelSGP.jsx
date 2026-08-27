import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cliente360Api } from '../../lib/api';
import s from './PainelSGP.module.css';
import { useStore } from '../../store';
import {
  X, MapPin, Router as RouterIcon, Wifi, FileText, Copy, Check, ExternalLink,
  User, KeyRound, Eye, EyeOff, Activity, Signal, Landmark, StickyNote, Zap, Barcode,
} from 'lucide-react';

/**
 * PainelSGP — o painel completo do assinante (drawer).
 *
 * A lateral do chat (`ConversaInfo`) é o resumo que o agente lê sem clicar;
 * aqui mora o operacional pesado. A separação não é estética: as duas
 * consultas caras (fibra e faturas) só saem no clique que abre isto, senão
 * cada troca de conversa pagaria 2 idas ao SGP para dado que ninguém olhou.
 *
 * Nada aqui mascara nem decide permissão — as duas coisas moram no servidor.
 * Se um bloco não veio, é porque este agente não podia vê-lo.
 */

function Copiavel({ texto, children, titulo = 'Copiar' }) {
  const [ok, setOk] = useState(false);
  if (!texto) return children;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(String(texto));
      setOk(true);
      setTimeout(() => setOk(false), 1400);
    } catch { /* clipboard bloqueado (http, permissão) — o valor segue na tela */ }
  };
  return (
    <span className={s.pgSgpCopyWrap}>
      {children}
      <button type="button" className={s.pgSgpCopyBtn} onClick={copiar} title={titulo} aria-label={titulo}>
        {ok ? <Check size={11} /> : <Copy size={11} />}
      </button>
    </span>
  );
}

/** Campo do painel. Valor ausente NÃO renderiza — linha vazia é ruído. */
function Campo({ icon: Icon, label, valor, copiar = false, secreto = false, mono = false }) {
  const [visivel, setVisivel] = useState(false);
  if (valor === null || valor === undefined || valor === '') return null;
  const texto = String(valor);
  const exibido = secreto && !visivel ? '•'.repeat(Math.min(8, texto.length)) : texto;
  return (
    <div className={s.pgSgpField}>
      <span className={s.pgSgpFieldLabel}>{Icon && <Icon size={11} />}{label}</span>
      <span className={mono ? `${s.pgSgpFieldValue} ${s.pgSgpMono}` : s.pgSgpFieldValue}>
        {copiar ? <Copiavel texto={texto}>{exibido}</Copiavel> : exibido}
        {secreto && (
          <button type="button" className={s.pgSgpEye} onClick={() => setVisivel(v => !v)}
                  title={visivel ? 'Ocultar' : 'Mostrar'} aria-label={visivel ? 'Ocultar' : 'Mostrar'}>
            {visivel ? <EyeOff size={11} /> : <Eye size={11} />}
          </button>
        )}
      </span>
    </div>
  );
}

function Bloco({ icon: Icon, titulo, children, acao = null }) {
  return (
    <section className={s.pgSgpBloco}>
      <header className={s.pgSgpBlocoTop}>
        <span className={s.pgSgpBlocoIcon}>{Icon && <Icon size={14} />}</span>
        <h3>{titulo}</h3>
        {acao}
      </header>
      <div className={s.pgSgpBlocoBody}>{children}</div>
    </section>
  );
}

/** Status/qualidade → cor da pílula. Fora do JSX para não virar ternário aninhado. */
const TOM_STATUS = {
  ativo: 'ok', novo: 'ok', 'ativo vel. reduzida': 'alerta',
  suspenso: 'alerta', inativo: 'ruim', cancelado: 'ruim', 'inviabilidade técnica': 'ruim',
};
const TOM_SINAL = { bom: 'ok', atencao: 'alerta', ruim: 'ruim', critico: 'ruim' };

const brl = (v) => `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;
const dataBR = (s) => {
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s);
  return isNaN(d) ? s : d.toLocaleDateString('pt-BR');
};

function enderecoLinha(e) {
  if (!e) return null;
  const rua = [e.logradouro, e.numero].filter(Boolean).join(', ');
  return [rua, e.bairro, e.cidade && e.uf ? `${e.cidade}/${e.uf}` : e.cidade].filter(Boolean).join(' — ') || null;
}

/** Uptime em segundos → "3d4h" / "5h20min" / "12min". */
function uptimeHumano(seg) {
  const s = Number(seg);
  if (!Number.isFinite(s) || s <= 0) return null;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d${h % 24}h`;
  if (h >= 1)  return `${h}h${m ? `${m}min` : ''}`;
  return `${m}min`;
}

export default function PainelSGP({ conversa, ficha, contrato, contratos, onTrocarContrato, onFechar, caps, onAcao }) {
  const toast = useStore(s => s.toast);
  const ctr = contrato || null;

  // As duas consultas caras — cada uma isolada: a fibra fora do ar não pode
  // esconder o boleto, que é o que 80% dos atendimentos vem buscar.
  const { data: tecnico, isLoading: carregandoTecnico } = useQuery({
    queryKey: ['c360-tecnico', conversa.id, ctr?.id],
    queryFn:  () => cliente360Api.tecnico(conversa.id, ctr?.id),
    enabled:  !!ctr?.id && !!caps?.capacidades?.diagnostico,
    staleTime: 60_000, retry: false,
  });

  // Sem contrato: o financeiro é do CLIENTE. Mesma queryKey da lateral.
  const { data: faturas, isLoading: carregandoFaturas } = useQuery({
    queryKey: ['c360-faturas', conversa.id],
    queryFn:  () => cliente360Api.faturas(conversa.id),
    enabled:  !!ctr?.id && !!caps?.capacidades?.financeiro,
    staleTime: 60_000, retry: false,
  });

  const onu = tecnico?.onu;
  const id  = ficha?.identidade || {};

  return (
    // `stopPropagation`: desde que o Cliente 360 virou conteúdo de gaveta, este
    // drawer é DESCENDENTE de outro overlay. Sem parar aqui, fechar o painel do
    // SGP borbulhava e fechava a gaveta do assinante junto.
    <div className={s.pgSgpOverlay} onClick={e => { e.stopPropagation(); onFechar(); }}>
      <aside className={s.pgSgpDrawer} onClick={e => e.stopPropagation()} role="dialog" aria-label="Painel do assinante">
        <header className={s.pgSgpHeader}>
          <div className={s.pgSgpHeaderTxt}>
            <h2>{id.nome || conversa.nome || 'Painel do assinante'}</h2>
            <p className={s.pgSgpHeaderSub}>
              {ctr ? `Contrato #${ctr.id} · ${ctr.plano || 'sem plano'}` : 'Cliente não identificado nesta conversa'}
            </p>
          </div>
          <button className={s.pgSgpClose} onClick={onFechar} aria-label="Fechar"><X size={18} /></button>
        </header>

        {/* Faixa de resumo: o que decide a conversa, antes de qualquer rolagem. */}
        {ctr && (
          <div className={s.pgSgpResumo}>
            <span className={s.pgSgpPill} data-tom={TOM_STATUS[ctr.status] || 'info'}>
              <Activity size={11} />{ctr.status}
            </span>
            {ficha?.financeiro?.titulos_abertos > 0 && (
              <span className={s.pgSgpPill} data-tom="ruim">
                <Landmark size={11} />{ficha.financeiro.titulos_abertos} em aberto · {brl(ficha.financeiro.valor_aberto)}
              </span>
            )}
            {ficha?.financeiro && !ficha.financeiro.titulos_abertos && (
              <span className={s.pgSgpPill} data-tom="ok"><Check size={11} />sem débito</span>
            )}
            {onu?.online != null && (
              <span className={s.pgSgpPill} data-tom={onu.online ? 'ok' : 'ruim'}>
                <Signal size={11} />{onu.online ? 'ONU online' : 'ONU offline'}
              </span>
            )}
            {onu?.rx_dbm != null && (
              <span className={s.pgSgpPill} data-tom={TOM_SINAL[onu.qualidade?.nivel] || 'info'}>
                Rx {onu.rx_dbm} dBm
              </span>
            )}
          </div>
        )}

        <div className={s.pgSgpScroll}>
          {/* ── ATENDIMENTO ── */}
          <Bloco icon={User} titulo="Dados do atendimento">
            <div className={s.pgSgpIdent}>
              <div className={s.pgSgpAvatar}>{(id.nome || conversa.nome || '?').charAt(0).toUpperCase()}</div>
              <div className={s.pgSgpIdentTxt}>
                <p className={s.pgSgpNome}>{id.nome || conversa.nome || 'Sem nome'}</p>
                <p className={s.pgSgpSub}>
                  <Copiavel texto={id.telefone || conversa.telefone}>{id.telefone || conversa.telefone}</Copiavel>
                  {' · '}{conversa.canal}
                </p>
              </div>
            </div>
            <Campo icon={User}     label="CPF/CNPJ"  valor={id.cpf} copiar />
            <Campo icon={FileText} label="Protocolo" valor={conversa.protocolo} copiar mono />
            {id.mascarado && <p className={s.pgSgpNota}>Dados mascarados. Requer permissão para ver completo.</p>}
          </Bloco>

          {/* ── CONTRATOS ── */}
          {contratos?.length > 0 && (
            <Bloco icon={FileText} titulo="Contratos localizados">
              <div className={s.pgSgpContratoSel}>
                <span className={s.pgSgpFieldLabel}>Contrato selecionado</span>
                <p className={s.pgSgpContratoAtual}>#{ctr?.id} · {ctr?.plano || 'sem plano'}</p>
                <p className={s.pgSgpSub}>
                  Status: <strong data-status={ctr?.status}>{ctr?.status}</strong>
                  {ctr?.motivo_status ? ` — ${ctr.motivo_status}` : ''}
                </p>
              </div>
              {contratos.length > 1 && (
                <select
                  className={s.pgSgpSelect}
                  value={ctr?.id ?? ''}
                  onChange={e => onTrocarContrato(contratos.find(c => String(c.id) === e.target.value))}
                >
                  {contratos.map(c => (
                    <option key={c.id} value={c.id}>#{c.id} — {c.status} — {c.plano || 'sem plano'}</option>
                  ))}
                </select>
              )}
              <p className={s.pgSgpNota}>
                {contratos.length} contrato(s).{contratos.length > 1 && ' Trocar recarrega fibra e faturas.'}
              </p>
              {ctr?.tags?.length > 0 && (
                <div className={s.pgSgpTags}>{ctr.tags.map(t => <span key={t} className={s.pgSgpTag}>{t}</span>)}</div>
              )}
            </Bloco>
          )}

          {/* ── ENDEREÇO ── */}
          {ctr?.endereco && enderecoLinha(ctr.endereco) && (
            <Bloco
              icon={MapPin} titulo="Endereço"
              acao={ctr.endereco.ll && (
                <a className={s.pgSgpLink} target="_blank" rel="noreferrer"
                   href={`https://www.google.com/maps/search/?api=1&query=${ctr.endereco.ll.lat},${ctr.endereco.ll.lng}`}>
                  <ExternalLink size={11} /> Mapa
                </a>
              )}
            >
              <Campo label="Logradouro"  valor={ctr.endereco.logradouro} copiar />
              <Campo label="Número"      valor={ctr.endereco.numero} />
              <Campo label="Complemento" valor={ctr.endereco.complemento} />
              <Campo label="Bairro"      valor={ctr.endereco.bairro} />
              <Campo label="Cidade"      valor={ctr.endereco.cidade} />
              <Campo label="Estado"      valor={ctr.endereco.uf} />
              <Campo label="CEP"         valor={ctr.endereco.cep} copiar />
              <Campo label="Referência"  valor={ctr.endereco.referencia} />
            </Bloco>
          )}

          {/* ── SERVIÇO ── */}
          {ctr?.servico && (
            <Bloco icon={RouterIcon} titulo="Serviço">
              <Campo icon={Activity}  label="Status"     valor={ctr.status} />
              <Campo icon={Zap}       label="Plano"      valor={ctr.plano || ctr.servico.plano} />
              <Campo icon={User}      label="Login"      valor={ctr.servico.login} copiar mono />
              <Campo icon={KeyRound}  label="Senha"      valor={ctr.servico.senha} copiar secreto mono />
              <Campo               label="Conexão"    valor={ctr.servico.tipo_conexao} />
              <Campo               label="MAC"        valor={ctr.servico.mac} copiar mono />
              <Campo               label="VLAN"       valor={ctr.servico.vlan} mono />
              <Campo               label="Grupo"      valor={ctr.servico.grupo} />
              <Campo               label="Vencimento" valor={ctr.venc_dia} />
              <Campo               label="Cliente desde" valor={ctr.cadastrado_em} />
            </Bloco>
          )}

          {/* ── WIFI (só quando o SGP tem o que mostrar) ── */}
          {(ctr?.wifi?.ssid || ctr?.wifi?.ssid_5) && (
            <Bloco icon={Wifi} titulo="Wi-Fi">
              <Campo label="SSID 2.4G"  valor={ctr.wifi.ssid}    copiar />
              <Campo label="Senha 2.4G" valor={ctr.wifi.senha}   copiar secreto mono />
              <Campo label="Canal 2.4G" valor={ctr.wifi.canal} />
              <Campo label="SSID 5G"    valor={ctr.wifi.ssid_5}  copiar />
              <Campo label="Senha 5G"   valor={ctr.wifi.senha_5} copiar secreto mono />
              <Campo label="Canal 5G"   valor={ctr.wifi.canal_5} />
            </Bloco>
          )}

          {/* ── CENTRAL DO ASSINANTE ── */}
          {(ctr?.central?.login || ctr?.central?.senha) && (
            <Bloco icon={Landmark} titulo="Central do assinante">
              <Campo label="Login" valor={ctr.central.login} copiar mono />
              <Campo label="Senha" valor={ctr.central.senha} copiar secreto mono />
            </Bloco>
          )}

          {/* ── FIBRA / ONU ── */}
          {caps?.capacidades?.diagnostico && (
            <Bloco icon={Signal} titulo="Fibra (ONU)">
              {carregandoTecnico && <div className={`skeleton ${s.pgSgpSkel}`} />}
              {!carregandoTecnico && !onu && <p className={s.pgSgpNota}>Sem ONU vinculada a este contrato, ou o SGP não respondeu.</p>}
              {onu && (
                <>
                  <div className={s.pgSgpSinal} data-nivel={onu.qualidade?.nivel}>
                    <div>
                      <span className={s.pgSgpFieldLabel}>Sinal (Rx)</span>
                      <strong>{onu.rx_dbm != null ? `${onu.rx_dbm} dBm` : '—'}</strong>
                      <span className={s.pgSgpSinalLabel}>{onu.qualidade?.label}</span>
                    </div>
                    <div>
                      <span className={s.pgSgpFieldLabel}>Tx</span>
                      <strong>{onu.tx_dbm != null ? `${onu.tx_dbm} dBm` : '—'}</strong>
                    </div>
                    <div>
                      <span className={s.pgSgpFieldLabel}>Equipamento</span>
                      <strong>{onu.online === null ? '—' : onu.online ? 'Online' : 'Offline'}</strong>
                      {onu.online && uptimeHumano(onu.uptime_segundos) && (
                        <span className={s.pgSgpSinalLabel}>há {uptimeHumano(onu.uptime_segundos)}</span>
                      )}
                    </div>
                  </div>
                  <Campo label="Serial"  valor={onu.serial} copiar mono />
                  <Campo label="Modelo"  valor={onu.modelo} />
                  <Campo label="OLT"     valor={onu.olt} />
                  <Campo label="Slot"    valor={onu.slot} />
                  <Campo label="PON"     valor={onu.pon} />
                  <Campo label="VLAN"    valor={onu.vlan} mono />
                  <Campo label="Modo"    valor={onu.modo} />
                  <Campo label="CTO"     valor={onu.cto} />
                  <Campo label="Medido em" valor={onu.sinal_lido_em} />
                  {onu.online === false && onu.ultima_queda_motivo && (
                    <Campo label="Última queda" valor={onu.ultima_queda_motivo} />
                  )}
                </>
              )}
              {tecnico?.avisos?.length > 0 && (
                <p className={s.pgSgpAviso}>{tecnico.avisos.join(' · ')}</p>
              )}
            </Bloco>
          )}

          {/* ── FINANCEIRO ── */}
          {caps?.capacidades?.financeiro && (
            <Bloco icon={Landmark} titulo="Financeiro — todos os contratos">
              {carregandoFaturas && <div className={`skeleton ${s.pgSgpSkel}`} />}
              {!carregandoFaturas && faturas?.mensagem && <p className={s.pgSgpNota}>{faturas.mensagem}</p>}
              {faturas?.falhas?.length > 0 && (
                <p className={s.pgSgpAviso}>O SGP não respondeu por {faturas.falhas.length} contrato(s) — lista incompleta.</p>
              )}
              {faturas?.boletos?.map((b, i) => (
                <div key={b.fatura_id || i} className={s.pgSgpBoleto} data-vencido={b.vencido ? '1' : '0'}>
                  <div className={s.pgSgpBoletoTop}>
                    <span>Venc: {dataBR(b.vencimento_atual || b.vencimento_original)}</span>
                    <strong>{brl(b.valor_cobrado ?? b.valor_original)}</strong>
                  </div>
                  <div className={s.pgSgpBoletoMeta}>
                    {b.contrato && <span className={s.pgSgpBoletoContrato}>contrato #{b.contrato}</span>}
                    {b.vencido && <span className={s.pgSgpBoletoTag}>vencido</span>}
                  </div>
                  <div className={s.pgSgpBoletoAcoes}>
                    {b.pix_copia_cola && (
                      <button className={s.pgSgpBoletoBtn} onClick={async () => {
                        try { await navigator.clipboard.writeText(b.pix_copia_cola); toast('PIX copiado', 'success'); }
                        catch { toast('Não consegui copiar — o navegador bloqueou', 'error'); }
                      }}><Zap size={12} /> PIX</button>
                    )}
                    {b.linha_digitavel && (
                      <button className={s.pgSgpBoletoBtn} onClick={async () => {
                        try { await navigator.clipboard.writeText(b.linha_digitavel); toast('Linha digitável copiada', 'success'); }
                        catch { toast('Não consegui copiar — o navegador bloqueou', 'error'); }
                      }}><Barcode size={12} /> Código de barras</button>
                    )}
                    {(b.link_boleto || b.link_cobranca) && (
                      <a className={s.pgSgpBoletoBtn} href={b.link_boleto || b.link_cobranca} target="_blank" rel="noreferrer">
                        <FileText size={12} /> Boleto
                      </a>
                    )}
                  </div>
                </div>
              ))}
              {ctr?.link_quitacao && (
                <a className={s.pgSgpLink} href={ctr.link_quitacao} target="_blank" rel="noreferrer">
                  <ExternalLink size={11} /> Declaração de quitação
                </a>
              )}
            </Bloco>
          )}

          {/* ── OBSERVAÇÕES DO CADASTRO ── */}
          {(ctr?.observacao_cliente || ctr?.observacao_servico) && (
            <Bloco icon={StickyNote} titulo="Observações do cadastro">
              {ctr.observacao_cliente && <p className={s.pgSgpObs}>{ctr.observacao_cliente}</p>}
              {ctr.observacao_servico && <p className={s.pgSgpObs}>{ctr.observacao_servico}</p>}
            </Bloco>
          )}

          {/* ── AÇÕES ── */}
          {caps?.acoes?.length > 0 && conversa.status !== 'encerrada' && (
            <Bloco icon={Zap} titulo="Ações rápidas">
              <div className={s.pgSgpAcoes}>
                {caps.acoes.map(a => (
                  <button key={a.id} className={s.pgSgpAcaoChip} onClick={() => onAcao(a.id)}>{a.label}</button>
                ))}
              </div>
            </Bloco>
          )}
        </div>
      </aside>
    </div>
  );
}
