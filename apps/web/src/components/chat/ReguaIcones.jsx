import { UserCircle2, Sparkles, StickyNote } from 'lucide-react';
import styles from './ReguaIcones.module.css';

/**
 * A régua que substituiu a terceira coluna fixa.
 *
 * Antes, ficha do assinante e Copiloto montavam junto com a conversa — e cada
 * um faz um `montarFicha` inteiro, que são até 3 POSTs ao SGP mais consultas de
 * manutenção. Duas idas completas ao ERP por troca de conversa, para um painel
 * que ninguém tinha pedido para ver. Agora é uma por clique, e só a pedida.
 */
export const PAINEIS = [
  { key: 'assinante', titulo: 'Assinante',  icone: UserCircle2, dica: 'Ficha do assinante (consulta o SGP)' },
  { key: 'copiloto',  titulo: 'Copiloto',   icone: Sparkles,    dica: 'Sugestões para o atendente' },
  { key: 'notas',     titulo: 'Notas',      icone: StickyNote,  dica: 'Notas internas desta conversa' },
];

export default function ReguaIcones({ ativo, onAbrir, status }) {
  return (
    <nav className={styles.regua} aria-label="Painéis da conversa">
      {PAINEIS.map(p => {
        const Icone = p.icone;
        // O Copiloto é do atendente humano: com a conversa ainda na IA ou já
        // encerrada ele não tem o que sugerir (o backend recusaria de todo jeito).
        const inativo = p.key === 'copiloto' && status !== 'ativa';
        return (
          <button key={p.key}
            className={[styles.botao, ativo === p.key && styles.botaoAtivo].filter(Boolean).join(' ')}
            onClick={() => onAbrir(ativo === p.key ? null : p.key)}
            disabled={inativo}
            aria-pressed={ativo === p.key}
            data-tooltip={inativo ? 'Disponível quando você assumir a conversa' : p.dica}>
            <Icone size={17} />
          </button>
        );
      })}
    </nav>
  );
}
