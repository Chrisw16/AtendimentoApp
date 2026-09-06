/**
 * dadosIniciais.js — os catálogos das FASES 5 a 9, num lugar só.
 *
 * Por que este arquivo existe: **o `seed` não roda no deploy** — o boot aplica
 * as migrations e mais nada. Então tudo que nasceu no `seed.js` das fases
 * recentes (filas, categorias de conhecimento, playbooks, perfis de IA)
 * simplesmente NÃO EXISTIA em produção, e a tela abria vazia sem que nada
 * estivesse quebrado.
 *
 * A saída é semear pela migration 022, que roda no deploy. Há precedente no
 * próprio repositório: a 005 semeia `prompts_ia`.
 *
 * A regra do que entra aqui: **estrutura, não fato**. Fila, procedimento e
 * perfil são esqueleto operacional — o provedor ajusta. Artigo de conhecimento
 * **não** entra: seria informação inventada que um agente citaria como se fosse
 * política da casa. Por isso só as CATEGORIAS de conhecimento estão aqui.
 *
 * Tudo é idempotente por `onConflict(...).ignore()`: rodar duas vezes não
 * duplica, e editar o registro no banco não é desfeito pelo próximo deploy.
 */

export const FILAS = [
  { slug: 'suporte',    nome: 'Suporte Técnico', cor: '#2050B8', ordem: 1, sla_atencao_min: 5,  sla_critico_min: 15 },
  { slug: 'comercial',  nome: 'Comercial',       cor: '#E8572A', ordem: 2, sla_atencao_min: 3,  sla_critico_min: 10 },
  { slug: 'financeiro', nome: 'Financeiro',      cor: '#16a34a', ordem: 3, sla_atencao_min: 10, sla_critico_min: 30 },
];

export const CATEGORIAS_KB = [
  { slug: 'suporte-tecnico', nome: 'Suporte técnico', ordem: 1, descricao: 'Procedimentos de diagnóstico e configuração.' },
  { slug: 'financeiro',      nome: 'Financeiro',      ordem: 2, descricao: 'Boletos, prazos, negociação e cobrança.' },
  { slug: 'comercial',       nome: 'Comercial',       ordem: 3, descricao: 'Planos, promoções e argumentação de venda.' },
  { slug: 'politicas',       nome: 'Políticas',       ordem: 4, descricao: 'Regras da empresa, SLA e contratos.' },
  { slug: 'equipamentos',    nome: 'Equipamentos',    ordem: 5, descricao: 'Manuais de ONU, roteadores e CPEs.' },
];

/** §60 e §62 do plano — nascem em RASCUNHO: quem opera decide quando publicar. */
export const PLAYBOOKS = [
  {
    slug: 'suporte_sem_conexao', nome: 'Suporte — Sem conexão', dominio: 'suporte',
    objetivo: 'Restabelecer o acesso do cliente ou abrir chamado com diagnóstico pronto.',
    criterios_sucesso: 'Cliente confirma que voltou a navegar, ou chamado aberto com evidências.',
    criterios_transferencia: 'o cliente pedir cancelamento, ameaçar órgão de defesa, ou o problema exigir visita agendada.',
    excecoes: 'cabo visivelmente rompido ou queda de energia relatada com clareza dispensam os testes remotos — vá direto ao chamado.',
    etapas: [
      { titulo: 'Identificar o cliente', obrigatoriedade: 'obrigatoria', tools: ['identificar_cliente'],
        descricao: 'Declarava `consultar_cliente`, que é TIPO DE NÓ e não tool — a etapa nunca podia ser marcada por ferramenta.' },
      { titulo: 'Verificar situação do contrato', obrigatoriedade: 'obrigatoria', tools: ['verificar_conexao'] },
      { titulo: 'Verificar manutenção na região', obrigatoriedade: 'obrigatoria', tools: ['consultar_manutencao'],
        descricao: 'Se houver manutenção que afete o cliente, informe a previsão e NÃO abra chamado individual.' },
      { titulo: 'Consultar sessão RADIUS', obrigatoriedade: 'obrigatoria', tools: ['consultar_radius'] },
      { titulo: 'Consultar a ONU', obrigatoriedade: 'obrigatoria', tools: ['consultar_onu_acs'] },
      { titulo: 'Avaliar o sinal óptico', obrigatoriedade: 'condicional', condicao: 'a ONU respondeu com leitura de sinal', tools: [] },
      { titulo: 'Executar o procedimento aplicável', obrigatoriedade: 'obrigatoria', tools: ['reiniciar_onu_acs'],
        descricao: 'Reinício remoto, orientação de religar equipamento, ou o que o diagnóstico indicar.' },
      { titulo: 'Retestar com o cliente', obrigatoriedade: 'obrigatoria', tools: [] },
      { titulo: 'Abrir chamado', obrigatoriedade: 'condicional', condicao: 'o problema persistir após o reteste', tools: ['criar_chamado'] },
    ],
  },
  {
    slug: 'comercial_venda_residencial', nome: 'Comercial — Venda residencial', dominio: 'comercial',
    objetivo: 'Levar o interessado do primeiro contato ao pré-cadastro, com o plano certo.',
    criterios_sucesso: 'Pré-cadastro criado no SGP com plano escolhido e endereço confirmado.',
    criterios_transferencia: 'endereço sem cobertura, pedido de condição fora da tabela, ou cliente empresarial.',
    excecoes: 'cliente que já chega decidido pode pular a qualificação e a argumentação — não empurre etapas para quem já quer comprar.',
    etapas: [
      { titulo: 'Entender a necessidade', obrigatoriedade: 'obrigatoria', tools: [] },
      { titulo: 'Coletar o endereço', obrigatoriedade: 'obrigatoria', tools: ['salvar_dado'] },
      { titulo: 'Verificar cobertura', obrigatoriedade: 'obrigatoria', tools: [] },
      { titulo: 'Qualificar o perfil de uso', obrigatoriedade: 'opcional', tools: [] },
      { titulo: 'Recomendar o plano', obrigatoriedade: 'obrigatoria', tools: ['listar_planos_ativos'] },
      { titulo: 'Apresentar benefícios', obrigatoriedade: 'opcional', tools: [] },
      { titulo: 'Tratar objeções', obrigatoriedade: 'condicional', condicao: 'o cliente demonstrar dúvida ou comparar preço', tools: [] },
      { titulo: 'Pedir o fechamento', obrigatoriedade: 'obrigatoria', tools: [] },
      { titulo: 'Coletar os dados do cadastro', obrigatoriedade: 'obrigatoria', tools: ['salvar_dado'] },
      { titulo: 'Pré-cadastrar no sistema', obrigatoriedade: 'obrigatoria', tools: ['precadastrar_cliente'] },
      { titulo: 'Informar o próximo passo', obrigatoriedade: 'obrigatoria', tools: [] },
    ],
  },
  {
    slug: 'financeiro_2via_e_desbloqueio', nome: 'Financeiro — 2ª via e desbloqueio', dominio: 'financeiro',
    objetivo: 'Resolver a pendência financeira do cliente: entregar o boleto certo, ou liberar o acesso quando cabe.',
    criterios_sucesso: 'Cliente recebeu boleto e PIX do título correto, ou teve o acesso liberado com o protocolo da promessa, ou soube exatamente o que deve e até quando.',
    criterios_transferencia: 'o cliente pedir negociação, parcelamento, desconto, troca do dia de vencimento ou cancelamento; contestar um valor que a 2ª via não explica; ou for cliente empresarial.',
    excecoes: 'quem já tem o boleto em mãos e só quer o PIX não precisa da consulta inteira — mande o copia-e-cola; quem só quer saber quanto deve não precisa receber boleto.',
    etapas: [
      { titulo: 'Identificar o cliente', obrigatoriedade: 'obrigatoria', tools: ['identificar_cliente'],
        descricao: 'Sem CPF e contrato não se fala de valor nenhum — nem para dizer que está em dia.' },
      { titulo: 'Entender o que o cliente precisa', obrigatoriedade: 'obrigatoria', tools: [],
        descricao: '2ª via, já pagou e segue bloqueado, dúvida no valor, ou quer saber o vencimento. São conversas diferentes.' },
      { titulo: 'Consultar os títulos em aberto', obrigatoriedade: 'obrigatoria', tools: ['segunda_via_boleto'],
        descricao: 'O valor devido vem da ferramenta. Nunca do que o cliente disse, nunca de memória.' },
      { titulo: 'Entregar boleto e PIX', obrigatoriedade: 'obrigatoria', tools: [],
        descricao: 'O código PIX vai numa mensagem SÓ dele: no WhatsApp copiar seleciona a mensagem inteira, e código junto com texto é código que não cola.' },
      { titulo: 'Liberar acesso por promessa', obrigatoriedade: 'condicional', condicao: 'o contrato está suspenso ou reduzido e o cliente diz que já pagou ou vai pagar', tools: ['promessa_pagamento'],
        descricao: 'A liberação é 1x por mês. Se o sistema recusar, NÃO prometa liberação — diga o que houve.' },
      { titulo: 'Informar o prazo de normalização', obrigatoriedade: 'condicional', condicao: 'houve liberação', tools: [],
        descricao: 'Diga por quantos dias o acesso foi liberado e o protocolo que a ferramenta devolveu — se ela não devolveu protocolo, diga isso, não invente um.' },
      { titulo: 'Registrar problema na fatura', obrigatoriedade: 'condicional', condicao: 'o cliente já pagou e o título continua em aberto, ou contesta o valor cobrado', tools: ['criar_chamado'],
        descricao: 'Ocorrência tipo 22 (Problema na fatura). Registrar é o que a IA pode fazer; decidir sobre o valor, não.' },
      { titulo: 'Confirmar com o cliente', obrigatoriedade: 'obrigatoria', tools: [],
        descricao: 'Perguntar se recebeu, se conseguiu copiar o PIX, se a conexão voltou. Encerrar sem confirmar é o defeito mais comum.' },
    ],
  },
];

/** §66 — `max_turnos` vem da prática: cadastro comercial ~25, suporte ~12. */
export const PERFIS_IA = [
  {
    slug: 'suporte', nome: 'Suporte técnico',
    descricao: 'Diagnóstico e resolução de problemas de conexão.',
    prompt_slug: 'suporte', playbook_slug: 'suporte_sem_conexao',
    goal: 'resolver_suporte', max_turnos: 12,
    regras_transferencia: 'Transfira se exigir visita técnica, se o cliente pedir humano ou se demonstrar irritação.',
  },
  {
    slug: 'comercial', nome: 'Comercial',
    descricao: 'Venda residencial: da dúvida ao pré-cadastro.',
    prompt_slug: 'comercial', playbook_slug: 'comercial_venda_residencial',
    goal: 'converter_venda', max_turnos: 25,
    regras_transferencia: 'Transfira se o endereço não tiver cobertura, se pedirem condição fora da tabela ou se for cliente empresarial.',
  },
  {
    slug: 'financeiro', nome: 'Financeiro',
    descricao: '2ª via, PIX e desbloqueio por promessa de pagamento.',
    prompt_slug: 'financeiro', playbook_slug: 'financeiro_2via_e_desbloqueio',
    goal: 'resolver_financeiro', max_turnos: 10,
    regras_transferencia: 'Transfira quando pedirem negociação, parcelamento, desconto, troca do dia de vencimento ou cancelamento; quando o cliente contestar um valor que a 2ª via não explica; ou quando for cliente empresarial.',
  },
];

/**
 * §92 e §94 — os dois scorecards que o plano nomeia. Nascem **inativos**:
 * auditar custa uma chamada de IA por conversa encerrada, e ligar isso sozinho
 * num deploy seria gastar dinheiro do provedor sem ele pedir.
 */
export const SCORECARDS = [
  {
    slug: 'suporte', nome: 'Supervisora Suporte', perfil: 'suporte', ativo: false,
    descricao: 'Auditoria de atendimento técnico.',
    criterios: [
      { id: 'identificacao', nome: 'Identificação do cliente', peso: 2, critico: false,
        descricao: 'O atendimento identificou o cliente e o contrato antes de opinar?',
        instrucao: 'Nota alta quando houve identificação por ferramenta antes de qualquer conclusão. Nota baixa quando se respondeu sobre a conta sem saber de quem era.' },
      { id: 'manutencao', nome: 'Checagem de manutenção', peso: 2, critico: false,
        descricao: 'Verificou se havia manutenção afetando a região?',
        instrucao: 'Se havia manutenção e o atendimento abriu chamado individual, nota baixa. Se não havia, avalie se ao menos checou.' },
      { id: 'diagnostico', nome: 'Diagnóstico técnico', peso: 3, critico: false,
        descricao: 'RADIUS, ONU e sinal foram consultados quando cabiam?',
        instrucao: 'Baseie-se nas ferramentas EXECUTADAS, não no que foi dito ao cliente.' },
      { id: 'reteste', nome: 'Reteste com o cliente', peso: 2, critico: false,
        descricao: 'Confirmou com o cliente se voltou a funcionar?',
        instrucao: 'Encerrar sem confirmar é o defeito mais comum do suporte.' },
      { id: 'chamado', nome: 'Abertura correta de chamado', peso: 2, critico: false,
        descricao: 'Abriu chamado quando precisava — e só quando precisava?',
        instrucao: 'Chamado aberto sem diagnóstico e problema deixado sem chamado são erros opostos e igualmente graves.' },
      { id: 'repeticao', nome: 'Não repetiu perguntas', peso: 1, critico: false,
        descricao: 'Pediu dado que já tinha?',
        instrucao: 'Pedir CPF de novo depois de identificar o cliente é falha de atendimento.' },
      { id: 'clareza', nome: 'Clareza e tom', peso: 2, critico: false,
        descricao: 'Foi claro, cordial e sem jargão desnecessário?',
        instrucao: 'Avalie a linguagem, não o tamanho da resposta.' },
      { id: 'seguranca', nome: 'Segurança', peso: 3, critico: true,
        descricao: 'Orientou algo perigoso?',
        instrucao: 'CRÍTICO. Orientar abrir ONU, mexer em fibra, olhar conector, subir em poste ou tocar rede elétrica é violação, mesmo que o cliente peça.' },
    ],
  },
  {
    slug: 'comercial', nome: 'Supervisora Comercial', perfil: 'comercial', ativo: false,
    descricao: 'Auditoria de atendimento comercial.',
    criterios: [
      { id: 'necessidade', nome: 'Investigação da necessidade', peso: 3, critico: false,
        descricao: 'Entendeu o perfil de uso antes de ofertar?',
        instrucao: 'Ofertar plano sem entender a necessidade é o erro comercial mais caro.' },
      { id: 'cobertura', nome: 'Consulta de cobertura', peso: 2, critico: false,
        descricao: 'Verificou cobertura no endereço?',
        instrucao: 'Conduzir para fechamento sem cobertura confirmada gera frustração e retrabalho.' },
      { id: 'oferta', nome: 'Oferta adequada', peso: 3, critico: false,
        descricao: 'O plano recomendado combina com a necessidade levantada?',
        instrucao: 'Avalie a coerência entre o que o cliente disse precisar e o que foi ofertado.' },
      { id: 'objecoes', nome: 'Tratamento de objeções', peso: 2, critico: false,
        descricao: 'Tratou objeção sem inventar desconto?',
        instrucao: 'Se não houve objeção, não avalie este critério.' },
      { id: 'fechamento', nome: 'Pedido de fechamento', peso: 3, critico: false,
        descricao: 'Propôs um próximo passo concreto?',
        instrucao: 'Encerrar conversa com intenção de compra sem propor próximo passo é oportunidade perdida.' },
      { id: 'precadastro', nome: 'Pré-cadastro', peso: 2, critico: false,
        descricao: 'Quando havia decisão, o cadastro foi feito?',
        instrucao: 'Baseie-se na ferramenta executada.' },
      { id: 'tom', nome: 'Tom e clareza', peso: 1, critico: false,
        descricao: 'Cordial, objetivo, sem pressionar demais?',
        instrucao: 'Pressão excessiva conta contra.' },
      { id: 'promessa', nome: 'Informação correta', peso: 3, critico: true,
        descricao: 'Prometeu prazo, preço ou condição que não veio de fonte oficial?',
        instrucao: 'CRÍTICO. Preço divergente da fonte oficial ou promessa de visita/prazo inexistente é violação.' },
    ],
  },
  {
    slug: 'financeiro', nome: 'Supervisora Financeiro', perfil: 'financeiro', ativo: false,
    descricao: 'Auditoria de atendimento financeiro.',
    criterios: [
      { id: 'identificacao', nome: 'Identificação do cliente', peso: 2, critico: false,
        descricao: 'Identificou o cliente e o contrato antes de falar de dinheiro?',
        instrucao: 'Falar de valor, débito ou vencimento sem identificação por ferramenta é nota mínima — inclusive para dizer que está em dia.' },
      { id: 'necessidade', nome: 'Entendeu o que o cliente precisava', peso: 2, critico: false,
        descricao: '2ª via, já pagou e segue bloqueado, dúvida no valor e vencimento são conversas diferentes.',
        instrucao: 'Mandar boleto para quem só perguntou o vencimento conta contra.' },
      { id: 'consulta', nome: 'Consultou os títulos por ferramenta', peso: 3, critico: false,
        descricao: 'O valor devido veio do sistema?',
        instrucao: 'Baseie-se nas ferramentas EXECUTADAS. Repetir o valor que o cliente disse não é consulta.' },
      { id: 'entrega', nome: 'Entrega do boleto e do PIX', peso: 3, critico: false,
        descricao: 'Entregou o boleto do título certo, com PIX utilizável?',
        instrucao: 'Código PIX colado junto com texto explicativo é código que não cola — avalie se foi entregue de forma usável.' },
      { id: 'promessa', nome: 'Uso correto da promessa de pagamento', peso: 2, critico: false,
        descricao: 'Liberou quando cabia, e não prometeu quando o sistema recusou?',
        instrucao: 'Prometer liberação que o SGP negou é o pior erro desta fila: o cliente desliga achando que voltou. Se não houve caso de promessa, não avalie este critério.' },
      { id: 'repeticao', nome: 'Não repetiu perguntas', peso: 1, critico: false,
        descricao: 'Pediu CPF ou contrato que já tinha?',
        instrucao: 'Pedir o CPF de novo depois de identificar o cliente é falha de atendimento.' },
      { id: 'clareza', nome: 'Clareza e tom', peso: 2, critico: false,
        descricao: 'Foi claro sobre o que é devido, até quando e o que acontece depois?',
        instrucao: 'Cobrança mal explicada gera recontato. Avalie a clareza, não o tamanho.' },
      { id: 'sem_fonte', nome: 'Informação sem fonte', peso: 3, critico: true,
        descricao: 'Informou valor, prazo, protocolo ou condição que não veio de ferramenta nesta conversa?',
        instrucao: 'CRÍTICO. Valor devido, data de liberação, número de protocolo e promessa de desconto ou parcelamento só existem se uma ferramenta os devolveu. Número de protocolo citado sem tool que o tenha devolvido é violação, mesmo que o número pareça plausível.' },
    ],
  },
];

/**
 * Semeia os quatro catálogos. Idempotente e sem transação própria — o runner de
 * migrations já roda cada arquivo dentro de uma.
 *
 * Cada bloco é protegido individualmente: numa instância que ainda não tenha
 * alguma dessas tabelas (ordem de migration diferente numa revenda antiga), o
 * que dá para semear é semeado, em vez de a migration inteira falhar e derrubar
 * o boot — migration que falha pula os monitores de SLA e da supervisora.
 */
export async function semearCatalogos(db) {
  const conta = { filas: 0, categorias: 0, playbooks: 0, perfis: 0, scorecards: 0 };

  if (await db.schema.hasTable('filas')) {
    for (const f of FILAS) await db('filas').insert(f).onConflict('slug').ignore();
    conta.filas = FILAS.length;
  }

  if (await db.schema.hasTable('knowledge_categorias')) {
    for (const c of CATEGORIAS_KB) await db('knowledge_categorias').insert(c).onConflict('slug').ignore();
    conta.categorias = CATEGORIAS_KB.length;
  }

  if (await db.schema.hasTable('playbooks')) {
    for (const { etapas, ...pb } of PLAYBOOKS) {
      if (await db('playbooks').where({ slug: pb.slug }).first()) continue;
      const [criado] = await db('playbooks').insert({ ...pb, gatilhos: JSON.stringify([]) }).returning('*');
      await db('playbook_etapas').insert(etapas.map((e, i) => ({
        playbook_id: criado.id, ordem: i + 1,
        titulo: e.titulo, descricao: e.descricao || null,
        obrigatoriedade: e.obrigatoriedade, condicao: e.condicao || null,
        tools: JSON.stringify(e.tools || []),
      })));
      conta.playbooks++;
    }
  }

  if (await db.schema.hasTable('quality_scorecards')) {
    for (const sc of SCORECARDS) {
      await db('quality_scorecards')
        .insert({ ...sc, criterios: JSON.stringify(sc.criterios) })
        .onConflict('slug').ignore();
    }
    conta.scorecards = SCORECARDS.length;
  }

  if (await db.schema.hasTable('ia_perfis')) {
    for (const p of PERFIS_IA) {
      await db('ia_perfis').insert({ ...p, tools: JSON.stringify([]) }).onConflict('slug').ignore();
    }
    conta.perfis = PERFIS_IA.length;
  }

  return conta;
}

/**
 * Semeia SÓ o time financeiro (playbook, perfil e scorecard).
 *
 * Por que não chamar `semearCatalogos` de novo numa migration nova: ela insere
 * TUDO, e o guard é existência, não histórico. Um catálogo que o operador
 * apagou de propósito entre um deploy e outro seria ressuscitado — e o
 * CLAUDE.md já registra que a saída certa é arquivar, não apagar. Semear só o
 * que é novo evita dar a essa regra uma segunda chance de surpreender.
 *
 * A contagem é de INSERÇÕES DE VERDADE. `semearCatalogos` devolve
 * `FILAS.length` mesmo tendo inserido zero, e o operador lê o log do deploy
 * como confirmação de que semeou.
 */
export async function semearFinanceiro(db) {
  const conta = { playbooks: 0, perfis: 0, scorecards: 0 };

  const pb = PLAYBOOKS.find(p => p.slug === 'financeiro_2via_e_desbloqueio');
  if (pb && await db.schema.hasTable('playbooks') && !await db('playbooks').where({ slug: pb.slug }).first()) {
    const { etapas, ...cab } = pb;
    const [criado] = await db('playbooks').insert({ ...cab, gatilhos: JSON.stringify([]) }).returning('*');
    await db('playbook_etapas').insert(etapas.map((e, i) => ({
      playbook_id: criado.id, ordem: i + 1,
      titulo: e.titulo, descricao: e.descricao || null,
      obrigatoriedade: e.obrigatoriedade, condicao: e.condicao || null,
      tools: JSON.stringify(e.tools || []),
    })));
    conta.playbooks = 1;
  }

  const perfil = PERFIS_IA.find(p => p.slug === 'financeiro');
  if (perfil && await db.schema.hasTable('ia_perfis')) {
    const r = await db('ia_perfis').insert({ ...perfil, tools: JSON.stringify([]) })
      .onConflict('slug').ignore().returning('slug');
    conta.perfis = r.length;
  }

  const sc = SCORECARDS.find(s => s.slug === 'financeiro');
  if (sc && await db.schema.hasTable('quality_scorecards')) {
    const r = await db('quality_scorecards').insert({ ...sc, criterios: JSON.stringify(sc.criterios) })
      .onConflict('slug').ignore().returning('slug');
    conta.scorecards = r.length;
  }

  return conta;
}
