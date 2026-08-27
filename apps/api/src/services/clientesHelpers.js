/**
 * clientesHelpers.js — a lógica NÃO-SQL da aba Clientes (histórico de contato).
 *
 * A aba tem um campo de busca só, e o agente digita nele o que tiver na mão:
 * nome, telefone com máscara, CPF pontuado ou número de contrato. Quem decide
 * o que aquilo é, é isto aqui — puro, para ser testável sem banco.
 */

/**
 * Escapa os metacaracteres de LIKE/ILIKE.
 *
 * Sem isso, um `%` digitado no campo casa com a base inteira e um `_` casa com
 * qualquer caractere: a busca passa a devolver gente que não tem nada a ver
 * com o que foi pedido, silenciosamente. A rota usa `ESCAPE '\'`, então a
 * barra também precisa ser escapada aqui.
 */
function escaparLike(s) {
  return s.replace(/[\\%_]/g, m => '\\' + m);
}

/**
 * Quebra o termo digitado nas duas buscas possíveis.
 *
 * `digitos` só nasce com 4+ dígitos: com 1 a 3 ele casaria com metade dos
 * telefones da base e afogaria o resultado por nome. Um termo com menos de 2
 * caracteres não é busca — é o agente ainda digitando; devolve os dois nulos e
 * a rota cai na listagem normal.
 *
 * @returns {{texto: string|null, digitos: string|null}}
 */
export function termosBusca(q) {
  const bruto = String(q ?? '').trim();
  if (bruto.length < 2) return { texto: null, digitos: null };
  const d = bruto.replace(/\D/g, '');
  return { texto: escaparLike(bruto), digitos: d.length >= 4 ? d : null };
}

/**
 * Rótulo de identificação do contato.
 *
 * "Identificado" quer dizer UMA coisa: a IA achou este contato no SGP e o
 * vínculo ficou gravado. Nome preenchido não basta — o cliente diz o nome dele
 * no primeiro "oi" e isso não identifica ninguém. Confundir os dois faria a
 * tela prometer uma ficha do assinante que não existe.
 */
export function estaIdentificado(linha) {
  return Boolean(linha?.cpf || linha?.contrato_id);
}
