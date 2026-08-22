/**
 * 022_catalogos_iniciais.js — põe em produção o que o `seed` nunca levou.
 *
 * O problema que esta migration resolve: **o `seed` não roda no deploy**. O
 * boot aplica migrations e mais nada. Então filas (FASE 5), categorias de
 * conhecimento (FASE 7), playbooks (FASE 8) e perfis de IA (FASE 9) foram
 * entregues e **nunca existiram em produção** — as telas abriam vazias sem que
 * nada estivesse quebrado, o que é o pior tipo de defeito: silencioso.
 *
 * Semear por migration tem precedente no próprio repositório (a 005 semeia
 * `prompts_ia`) e resolve o caso permanentemente: vale para esta instância e
 * para toda revenda futura, sem ninguém precisar lembrar de rodar comando.
 *
 * ⚠️ O que esta migration NÃO faz, de propósito: criar usuário, canal, fluxo ou
 * artigo de conhecimento. O `seed` completo insere um **fluxo legado com
 * `ativo: true`**, e o motor escolhe o fluxo com `where({ativo:true}).first()`
 * SEM `ORDER BY` — num ambiente que já atende, isso poderia sequestrar toda
 * conversa nova para um fluxo que a própria doc diz não rodar no motor atual.
 */
import { semearCatalogos } from '../../dadosIniciais.js';

export async function up(db) {
  const n = await semearCatalogos(db);
  console.log(`  ✓ Catálogos: ${n.filas} filas, ${n.categorias} categorias, ${n.playbooks} playbooks, ${n.perfis} perfis, ${n.scorecards} scorecards`);
}

export async function down() {
  // Sem `down`: apagar filas ou playbooks derrubaria configuração de fluxo em
  // uso (`cfg.fila`, `cfg.playbook` guardam o SLUG) e conversas em espera. O
  // que se remove aqui, se for o caso, é pela tela — com o operador vendo.
}
