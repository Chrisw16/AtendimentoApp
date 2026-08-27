import { useEffect } from 'react';
import { X } from 'lucide-react';
import styles from './Gaveta.module.css';

/**
 * Painel lateral da tela de Chat.
 *
 * ⚠️ Nasceu como overlay (copiado do `PainelSGP`) e foi corrigido no mesmo dia:
 * o atendente precisa **ler a ficha e a conversa ao mesmo tempo** — escurecer o
 * chat para mostrar o dado que ele vai usar para responder é exatamente o
 * contrário do que a tela serve. Agora é uma COLUNA: divide o espaço, não cobre.
 *
 * O `PainelSGP` continua sendo overlay de propósito — aquele é o mergulho
 * completo no assinante, não o acompanhamento lado a lado.
 *
 * O conteúdo só MONTA quando abre, e é isso que faz a ficha do assinante deixar
 * de custar uma ida ao SGP em toda troca de conversa.
 */
export default function Gaveta({ aberta, titulo, onFechar, children }) {
  useEffect(() => {
    if (!aberta) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // Há um drawer POR CIMA (o painel completo do SGP abre de dentro daqui).
      // Sem esta guarda o Esc fecharia a coluna inteira em vez do de cima — e o
      // de cima é o que o agente estava olhando.
      if (document.querySelector('[data-drawer-sobreposto]')) return;
      onFechar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aberta, onFechar]);

  if (!aberta) return null;

  return (
    <aside className={styles.painel} aria-label={titulo}>
      <header className={styles.header}>
        <span className={styles.titulo}>{titulo}</span>
        <button className={styles.fechar} onClick={onFechar} aria-label="Fechar painel">
          <X size={15} />
        </button>
      </header>
      <div className={styles.corpo}>{children}</div>
    </aside>
  );
}
