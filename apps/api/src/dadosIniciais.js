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
      { titulo: 'Identificar o cliente', obrigatoriedade: 'obrigatoria', tools: ['consultar_cliente'] },
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
