import { useState, useRef, useEffect } from 'react';
import { ArrowRightLeft, Bot, X } from 'lucide-react';
import styles from './MenuAcoes.module.css';

/**
 * Transferir de fila · Devolver para IA · Finalizar — sem abrir a conversa.
 *
 * As três ações já existiam, enterradas no fim da coluna da direita (só
 * alcançáveis depois de selecionar a conversa e rolar). É o que o painel antigo
 * do operador resolve num clique direito no cartão.
 *
 * O `trigger` é render prop porque este menu é usado em dois lugares com
 * botões visualmente diferentes: o ⋮ do cartão e o ⋮ do header da conversa.
 */
export default function MenuAcoes({ conversa, filas = [], trigger, modoInicial = null,
                                    onTransferirFila, onDevolverIA, onFinalizar }) {
  const [aberto, setAberto] = useState(false);
  // `modoInicial` faz o botão "Finalizar" do header abrir direto na confirmação,
  // em vez de exigir dois cliques para a ação mais usada da tela.
  const [modo, setModo]     = useState(modoInicial);
  const [valor, setValor]   = useState('');
  const ref = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) fechar(); };
    // `capture` para fechar antes de o clique virar seleção de outra conversa.
    document.addEventListener('mousedown', fora, true);
    return () => document.removeEventListener('mousedown', fora, true);
  }, [aberto]);

  /**
   * `position: absolute` NÃO escapa do `overflow` de um ancestral: a lista de
   * conversas rola, então para qualquer cartão da metade de baixo o menu abria
   * cortado — e o formulário de "Finalizar", que é mais alto, ficava invisível.
   * `modo` entra na dependência porque o menu CRESCE ao virar formulário.
   */
  useEffect(() => {
    if (aberto) menuRef.current?.scrollIntoView({ block: 'nearest' });
  }, [aberto, modo]);

  const fechar = () => { setAberto(false); setModo(modoInicial); setValor(''); };

  const agir = async (fn, arg) => {
    fechar();
    await fn?.(conversa.id, arg);
  };

  return (
    <div className={styles.wrap} ref={ref}>
      {trigger({
        onClick: (e) => { e.stopPropagation(); setModo(modoInicial); setAberto(a => !a); },
        'aria-expanded': aberto,
        'aria-haspopup': 'menu',
      })}

      {aberto && (
        <div className={styles.menu} ref={menuRef} role="menu" onClick={e => e.stopPropagation()}>
          {modo === null && (
            <>
              <button className={styles.op} role="menuitem" onClick={() => setModo('fila')}>
                <ArrowRightLeft size={13} /> Transferir de setor
              </button>
              {conversa.status === 'ativa' && (
                <button className={styles.op} role="menuitem" onClick={() => agir(onDevolverIA)}>
                  <Bot size={13} /> Devolver para a IA
                </button>
              )}
              <button className={[styles.op, styles.opPerigo].join(' ')} role="menuitem"
                onClick={() => setModo('finalizar')}>
                <X size={13} /> Finalizar atendimento
              </button>
            </>
          )}

          {modo === 'fila' && (
            <div className={styles.form}>
              <label className={styles.rotulo}>Transferir para</label>
              <select className={styles.campo} value={valor} onChange={e => setValor(e.target.value)} autoFocus>
                <option value="">— escolha o setor —</option>
                {filas.filter(f => f.ativa !== false).map(f => (
                  <option key={f.id} value={f.id}>
                    {f.nome}{f.aguardando ? ` (${f.aguardando} na fila)` : ''}{f.aberta === false ? ' · fechada' : ''}
                  </option>
                ))}
              </select>
              <div className={styles.formBtns}>
                <button className={styles.cancelar} onClick={fechar}>Cancelar</button>
                <button className={styles.confirmar} disabled={!valor}
                  onClick={() => agir(onTransferirFila, valor)}>Transferir</button>
              </div>
            </div>
          )}

          {modo === 'finalizar' && (
            <div className={styles.form}>
              {/* Confirmação em vez de ação direta: finalizar é irreversível e o
                  botão fica a um pixel do "transferir". */}
              <label className={styles.rotulo}>Motivo (opcional)</label>
              <input className={styles.campo} value={valor} autoFocus
                placeholder="Ex.: resolvido" onChange={e => setValor(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && agir(onFinalizar, valor)} />
              <div className={styles.formBtns}>
                <button className={styles.cancelar} onClick={fechar}>Cancelar</button>
                <button className={[styles.confirmar, styles.confirmarPerigo].join(' ')}
                  onClick={() => agir(onFinalizar, valor)}>Finalizar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
