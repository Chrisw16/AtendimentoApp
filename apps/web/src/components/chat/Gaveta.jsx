import { useEffect } from 'react';
import { X } from 'lucide-react';
import styles from './Gaveta.module.css';

/**
 * Gaveta lateral da tela de Chat.
 *
 * A anatomia (overlay em `flex-end` + painel que desliza) é a mesma do
 * `PainelSGP`, que já era o único drawer do app. Copiar em vez de inventar
 * mantém o gesto igual nas duas telas.
 *
 * O ganho não é só espaço: o conteúdo só MONTA quando abre, e é isso que faz a
 * ficha do assinante deixar de custar uma ida ao SGP em toda troca de conversa.
 */
export default function Gaveta({ aberta, titulo, onFechar, children }) {
  useEffect(() => {
    if (!aberta) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // Há um drawer POR CIMA (o painel completo do SGP abre de dentro daqui).
      // Sem esta guarda, o Esc fecharia a gaveta inteira em vez do de cima —
      // e o de cima é o que o agente estava olhando.
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      // O `<input type="search">` da busca limpa o campo no Esc por
      // comportamento nativo. Parar a propagação aqui evita que fechar a gaveta
      // também apague o que a atendente digitou na busca.
      e.stopPropagation();
      onFechar();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [aberta, onFechar]);

  if (!aberta) return null;

  return (
    <div className={styles.overlay} onClick={onFechar} role="presentation">
      <aside className={styles.gaveta} onClick={e => e.stopPropagation()}
        role="dialog" aria-label={titulo}>
        <header className={styles.header}>
          <span className={styles.titulo}>{titulo}</span>
          <button className={styles.fechar} onClick={onFechar} aria-label="Fechar">
            <X size={15} />
          </button>
        </header>
        <div className={styles.corpo}>{children}</div>
      </aside>
    </div>
  );
}
