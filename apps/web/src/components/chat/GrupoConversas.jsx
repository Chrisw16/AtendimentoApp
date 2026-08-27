import { ChevronDown } from 'lucide-react';
import styles from './GrupoConversas.module.css';

/**
 * Cabeçalho colapsável de um grupo da lateral.
 *
 * A anatomia (cabeçalho <button> em maiúsculas + chevron que gira) é a mesma do
 * `.section` do painel do assinante, de propósito: a casa já tinha esse padrão
 * e inventar um segundo faria a mesma tela ter dois idiomas de "abrir e fechar".
 *
 * Os filhos só são renderizados quando aberto — com cinco grupos e até cem
 * conversas, montar tudo para esconder por CSS custa a cada evento SSE.
 */
export default function GrupoConversas({ grupo, aberto, onToggle, children }) {
  const vazio = grupo.total === 0;

  return (
    <section className={styles.grupo}>
      <button
        className={[styles.cabecalho, aberto && styles.cabecalhoAberto].filter(Boolean).join(' ')}
        onClick={onToggle}
        aria-expanded={aberto}
        // Grupo vazio continua na lista para os outros não pularem de posição a
        // cada tecla da busca — mas não convida ao clique.
        disabled={vazio}
      >
        <ChevronDown size={13}
          className={[styles.chevron, aberto && styles.chevronAberto].filter(Boolean).join(' ')} />
        <span className={styles.rotulo}>{grupo.label}</span>
        <span className={[styles.contador, vazio && styles.contadorVazio].filter(Boolean).join(' ')}>
          {grupo.total}
        </span>
      </button>

      {aberto && !vazio && <div className={styles.itens}>{children}</div>}
    </section>
  );
}
