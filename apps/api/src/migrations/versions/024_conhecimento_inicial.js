/**
 * 024_conhecimento_inicial.js — a carga inicial da base de conhecimento.
 *
 * Por que por migration e não pela tela: são 55 artigos e 15 categorias, e o
 * `seed` não roda no deploy (ver 022). Cadastrar um a um é trabalho manual que
 * ninguém terminaria.
 *
 * ⚠️ Diferente das outras migrations de dados, esta insere CONTEÚDO editorial —
 * e conteúdo editorial escrito por quem faz o código é perigoso, porque o
 * agente cita como se fosse política da casa. Ela só existe porque **o
 * operador do provedor forneceu o texto** e pediu a carga: a autoria é dele,
 * não do repositório.
 *
 * A distinção que sobrevive: os 11 itens que são ESQUELETO ("preencher com as
 * regras oficiais": fidelidade, cancelamento, instalação, manuais de
 * equipamento) entram como **rascunho**, com um aviso no topo do texto. Só
 * `publicado` chega na IA (§52) — publicar um esqueleto faria a IA responder
 * ao cliente com *"Existe fidelidade? Qual o período?"* como se fosse a regra.
 */
import { semearConhecimento } from '../../conhecimentoInicial.js';

export async function up(db) {
  const n = await semearConhecimento(db);
  console.log(`  ✓ Conhecimento: ${n.categorias} categorias, ${n.artigos} artigos (${n.rascunhos} em rascunho, a preencher)`);
}

export async function down() {
  // Sem `down`: apagar artigo publicado tiraria da IA conhecimento que o
  // operador pode ter editado depois. Remoção é pela tela, com quem escreveu
  // vendo o que está removendo.
}
