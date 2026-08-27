import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '../../lib/api';
import Button from '../ui/Button';
import styles from './PainelNotas.module.css';

/**
 * Notas internas da conversa.
 *
 * `POST /chat/conversas/:id/notas` e o `GET` existem no backend desde a
 * migration 001, `chatApi.nota` estava em `lib/api.js` — e nada no frontend
 * chamava nenhum dos dois. A tabela `notas` foi, aliás, o motivo de ela NÃO ter
 * saído na remoção do ERP: é das notas da conversa, não do módulo removido.
 *
 * Nota é do agente para o agente: ela nunca vai para o cliente.
 */
export default function PainelNotas({ conversa }) {
  const [texto, setTexto] = useState('');
  const qc = useQueryClient();

  const { data: notas = [], isLoading } = useQuery({
    queryKey: ['notas', conversa.id],
    queryFn:  () => chatApi.notas(conversa.id),
  });

  const criar = useMutation({
    mutationFn: () => chatApi.nota(conversa.id, { texto: texto.trim() }),
    onSuccess: () => { setTexto(''); qc.invalidateQueries({ queryKey: ['notas', conversa.id] }); },
  });

  const salvar = () => { if (texto.trim()) criar.mutate(); };

  return (
    <div className={styles.wrap}>
      <div className={styles.lista}>
        {isLoading && <p className={styles.vazio}>Carregando…</p>}
        {!isLoading && notas.length === 0 && (
          <p className={styles.vazio}>Nenhuma nota nesta conversa.</p>
        )}
        {notas.map(n => (
          <article key={n.id} className={styles.nota}>
            <p className={styles.notaTexto}>{n.texto}</p>
            <p className={styles.notaMeta}>
              {n.agente_nome || 'Agente'} · {new Date(n.criado_em).toLocaleString('pt-BR')}
            </p>
          </article>
        ))}
      </div>

      <div className={styles.form}>
        <textarea className={styles.campo} rows={3} value={texto}
          placeholder="Anotação para a equipe…"
          onChange={e => setTexto(e.target.value)}
          // Ctrl+Enter salva; Enter sozinho quebra linha, porque nota é texto
          // corrido e não mensagem.
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) salvar(); }} />
        <p className={styles.aviso}>Só a equipe vê. O cliente nunca recebe.</p>
        <Button variant="primary" size="sm" onClick={salvar}
          disabled={!texto.trim() || criar.isPending}>
          {criar.isPending ? 'Salvando…' : 'Salvar nota'}
        </Button>
      </div>
    </div>
  );
}
