/**
 * identificacaoHelpers.js — as decisões de identificar um assinante, puras.
 *
 * Esta lógica vivia só dentro do `case 'consultar_cliente'` do motor. Ela sai
 * para cá porque agora há DOIS caminhos que identificam: o nó do fluxo e a
 * tool `identificar_cliente` que a IA chama. Duplicar significaria que um dos
 * dois esqueceria de PERSISTIR o vínculo — e "identificar sem persistir" é
 * exatamente o defeito que a FASE 6 fechou em 22/08: a IA identificava, a
 * conversa ia para a fila, o blob do fluxo era apagado e o Cliente 360 abria
 * sem contrato enquanto a 2ª via respondia "CPF/CNPJ inválido".
 */

/**
 * O que o cliente (ou a IA) digitou vira documento, ou nada.
 *
 * Aceita 11+ dígitos, e não `11 || 14`, para ser FIEL ao nó: hoje um número de
 * 12 dígitos vai ao SGP e volta "não encontrado", que dá ao cliente a mesma
 * resposta. Apertar aqui mudaria o caminho quente do fluxo ativo numa extração,
 * que é a hora errada de mudar comportamento.
 */
export function extrairDocumento(texto) {
  const digitos = String(texto ?? '').replace(/\D/g, '');
  return digitos.length >= 11 ? digitos : null;
}

/**
 * A resposta do SGP vira o `estado.contexto.cliente` do fluxo.
 * O primeiro contrato é o escolhido — `mapearRespostaCliente` já ordena
 * pondo o ATIVO na frente, que é o que quem atende quer.
 */
export function mapearIdentificacao(data) {
  const ct = data?.contratos?.[0];
  if (!ct) return null;
  return {
    nome:            data.nome,
    cpf:             data.cpfcnpj,
    contrato:        String(ct.id),
    plano:           ct.plano,
    status:          ct.status,
    cidade:          ct.cidade || '',
    email:           data.email || '',
    fone:            data.fone  || '',
    popId:           ct.popId,
    titulos_abertos: ct.titulos_abertos,
    valor_aberto:    ct.valor_aberto,
  };
}

/**
 * O que é gravado na LINHA da conversa (`conversas`), que sobrevive ao fim da
 * execução do fluxo. `nome` e `cidade` só são preenchidos quando a conversa
 * ainda não tem — o que o agente humano corrigiu na tela não é desfeito por
 * uma reconsulta ao SGP.
 */
export function patchConversa(conversa, data, cliente) {
  return {
    cpf:         data.cpfcnpj,
    contrato_id: cliente.contrato,
    nome:        conversa?.nome   || data.nome,
    cidade:      conversa?.cidade || cliente.cidade || null,
  };
}

/**
 * O texto que volta para o MODELO.
 *
 * É um resumo curado, nunca a ficha: `contratos[].servico.senha` (PPPoE),
 * `wifi.senha` e `central.senha` moram no mesmo objeto, e despejar a ficha no
 * `tool_result` põe as três no histórico da conversa — que é o mesmo erro que
 * vazou a ficha do assinante pelo link público de teste em 27/08, um nível
 * acima. O que o modelo precisa para atender é quem é, qual contrato, qual
 * plano, qual situação e se há título em aberto.
 */
export function resumoParaIA(cliente, contratos = []) {
  if (!cliente) return 'Não encontrei nenhum contrato para este CPF/CNPJ.';
  const linhas = [
    `Cliente identificado: ${cliente.nome || 'sem nome no cadastro'}`,
    `Contrato: ${cliente.contrato}${cliente.plano ? ` — ${cliente.plano}` : ''}`,
    `Situação: ${cliente.status || 'desconhecida'}`,
  ];
  if (cliente.cidade) linhas.push(`Cidade: ${cliente.cidade}`);
  if (cliente.titulos_abertos) {
    const valor = Number(cliente.valor_aberto || 0).toFixed(2).replace('.', ',');
    linhas.push(`Títulos em aberto: ${cliente.titulos_abertos} (R$ ${valor})`);
  } else {
    linhas.push('Títulos em aberto: nenhum');
  }
  if (contratos.length > 1) {
    // Sem esta linha o modelo trata o primeiro contrato como o único e responde
    // sobre a conta errada de um cliente multi-contrato.
    const outros = contratos.slice(0, 8)
      .map(c => {
        const det = [c.plano, c.status].filter(Boolean).join(', ');
        return det ? `${c.id} (${det})` : String(c.id);
      })
      .join('; ');
    linhas.push(`⚠️ Este CPF tem ${contratos.length} contratos: ${outros}.`
      + ' Confirme com o cliente de qual contrato ele está falando antes de agir.');
  }
  return linhas.join('\n');
}

/**
 * Junta o que o SGP acabou de dizer com o que já se sabia do cliente.
 *
 * Campo vazio NÃO sobrescreve campo preenchido. O nó tinha dois ramos com
 * comportamentos diferentes — o principal SUBSTITUÍA o objeto inteiro, o de
 * "já tem CPF no contexto" mesclava só 5 campos — e a diferença importa:
 * `popId` é o que dá escopo ao `consultar_manutencao`. Reconstruir o objeto
 * inteiro a partir de uma resposta que veio sem `popId` faz a IA passar a
 * checar manutenção sem região, em silêncio.
 */
export function mesclarCliente(anterior, novo) {
  const util = Object.fromEntries(
    Object.entries(novo || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );
  // ⚠️ Só mescla quando é o MESMO documento. Identificado o CPF A e depois o
  // CPF B, os campos que B não trouxer ficariam com os de A: `popId` errado
  // manda o `consultar_manutencao` para o POP de outra pessoa, e
  // `titulos_abertos` de A faz a IA falar do débito de quem não está ali.
  // Cliente diferente é ficha nova, não remendo da anterior.
  const mesmo = anterior?.cpf && novo?.cpf && anterior.cpf === novo.cpf;
  return mesmo ? { ...anterior, ...util } : { ...(anterior?.cpf ? {} : (anterior || {})), ...util };
}
