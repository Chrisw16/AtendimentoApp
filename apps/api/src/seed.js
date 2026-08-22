/**
 * seed.js — dados iniciais do banco
 * Cria admin padrão, canais e configurações base
 * Uso: node src/seed.js
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { getDb } from './config/db.js';
import { runMigrations } from './migrations/run.js';

async function seed() {
  console.log('🌱 Iniciando seed...\n');
  await runMigrations();
  const db = getDb();

  // §123 do plano: NUNCA semear senha previsível em produção. Fora dela,
  // admin123/agente123 seguem valendo (docs, testes, onboarding).
  const producao = process.env.NODE_ENV === 'production';
  const gerarSenha = () => randomBytes(9).toString('base64url');
  const senhaAdmin  = producao ? gerarSenha() : 'admin123';
  const senhaAgente = producao ? gerarSenha() : 'agente123';

  // ── ADMIN PADRÃO ──────────────────────────────────────────────
  const adminExiste = await db('agentes').where({ login: 'admin' }).first();
  if (!adminExiste) {
    const senha_hash = await bcrypt.hash(senhaAdmin, 10);
    await db('agentes').insert({
      nome:       'Administrador',
      login:      'admin',
      senha_hash,
      role:       'admin',
      avatar:     '⚡',
      permissoes: {},
    });
    console.log(`  ✓ Admin criado — login: admin / senha: ${senhaAdmin}`);
    if (producao) console.log('  ⚠️  Senha ALEATÓRIA acima — copie AGORA, ela não aparece de novo.');
    else console.log('  ⚠️  TROQUE A SENHA EM PRODUÇÃO!');
  } else {
    console.log('  · Admin já existe, pulando');
  }

  // ── AGENTE DE TESTE ───────────────────────────────────────────
  const agenteExiste = await db('agentes').where({ login: 'agente01' }).first();
  if (!agenteExiste) {
    const senha_hash = await bcrypt.hash(senhaAgente, 10);
    await db('agentes').insert({
      nome:       'Agente Teste',
      login:      'agente01',
      senha_hash,
      role:       'agente',
      avatar:     '🧑',
      permissoes: {
        chat: true, historico: true, tarefas: true,
        clientes: true, ocorrencias: true,
      },
    });
    console.log(`  ✓ Agente de teste criado — login: agente01 / senha: ${senhaAgente}`);
  }

  // ── CANAIS ────────────────────────────────────────────────────
  const canais = [
    { tipo: 'whatsapp', nome: 'WhatsApp',  icone: '📱', ativo: false, config: {} },
    { tipo: 'telegram', nome: 'Telegram',  icone: '✈️', ativo: false, config: {} },
    { tipo: 'widget',   nome: 'Widget Web',icone: '💬', ativo: true,  config: {} },
    { tipo: 'email',    nome: 'E-mail',    icone: '✉️', ativo: false, config: {} },
    { tipo: 'voip',     nome: 'VoIP',      icone: '📞', ativo: false, config: {} },
    { tipo: 'sms',      nome: 'SMS',       icone: '📨', ativo: false, config: {} },
  ];

  for (const canal of canais) {
    await db('canais')
      .insert(canal)
      .onConflict('tipo')
      .ignore();
  }
  console.log('  ✓ Canais configurados');

  // ── CONFIGURAÇÕES BASE ────────────────────────────────────────
  const kvDefaults = [
    { chave: 'modo',                valor: JSON.stringify('bot') },
    { chave: 'horario_ativo',       valor: JSON.stringify(false) },
    { chave: 'mensagem_fora_hora',  valor: JSON.stringify('Olá! Nosso atendimento funciona de segunda a sexta, das 8h às 18h. Retornaremos em breve!') },
    { chave: 'prompt_ia',           valor: JSON.stringify('Você é um assistente de atendimento ao cliente de um provedor de internet. Seja cordial, objetivo e útil.') },
  ];

  for (const kv of kvDefaults) {
    await db('sistema_kv').insert(kv).onConflict('chave').ignore();
  }
  console.log('  ✓ Configurações base inseridas');

  // ── RESPOSTAS RÁPIDAS ─────────────────────────────────────────
  const rr = [
    { titulo: 'Saudação', atalho: '/oi', texto: 'Olá! Seja bem-vindo(a) ao suporte. Como posso ajudar?' },
    { titulo: 'Aguarde', atalho: '/aguarde', texto: 'Por favor, aguarde um momento enquanto verifico sua solicitação.' },
    { titulo: 'Encerramento', atalho: '/tchau', texto: 'Fico à disposição. Tenha um ótimo dia! 😊' },
    { titulo: 'Boleto', atalho: '/boleto', texto: 'Para emitir seu boleto, acesse nossa área do cliente em citmax.com.br/cliente ou solicite aqui mesmo.' },
    { titulo: 'Técnico', atalho: '/tecnico', texto: 'Vou registrar um chamado técnico para você. Qual é o endereço completo para o atendimento?' },
  ];

  for (const r of rr) {
    await db('respostas_rapidas').insert(r).onConflict().ignore();
  }
  console.log('  ✓ Respostas rápidas inseridas');

  // ── FILAS DE ATENDIMENTO (FASE 5) ─────────────────────────────
  // O `slug` é o que o nó "Transferir para fila" grava em `cfg.fila` — mudar
  // aqui quebra fluxo já montado, então trate como identificador, não rótulo.
  for (const f of [
    { slug: 'suporte',    nome: 'Suporte Técnico', cor: '#2050B8', ordem: 1, sla_atencao_min: 5,  sla_critico_min: 15 },
    { slug: 'comercial',  nome: 'Comercial',       cor: '#E8572A', ordem: 2, sla_atencao_min: 3,  sla_critico_min: 10 },
    { slug: 'financeiro', nome: 'Financeiro',      cor: '#16a34a', ordem: 3, sla_atencao_min: 10, sla_critico_min: 30 },
  ]) {
    await db('filas').insert(f).onConflict('slug').ignore();
  }
  console.log('  ✓ Filas de atendimento inseridas');

  // ── CATEGORIAS DE CONHECIMENTO (FASE 7) ───────────────────────
  // Só a ESTRUTURA. Conteúdo não se semeia: artigo de exemplo vira informação
  // errada que um agente cita como se fosse política da casa.
  for (const c of [
    { slug: 'suporte-tecnico', nome: 'Suporte técnico', ordem: 1, descricao: 'Procedimentos de diagnóstico e configuração.' },
    { slug: 'financeiro',      nome: 'Financeiro',      ordem: 2, descricao: 'Boletos, prazos, negociação e cobrança.' },
    { slug: 'comercial',       nome: 'Comercial',       ordem: 3, descricao: 'Planos, promoções e argumentação de venda.' },
    { slug: 'politicas',       nome: 'Políticas',       ordem: 4, descricao: 'Regras da empresa, SLA e contratos.' },
    { slug: 'equipamentos',    nome: 'Equipamentos',    ordem: 5, descricao: 'Manuais de ONU, roteadores e CPEs.' },
  ]) {
    await db('knowledge_categorias').insert(c).onConflict('slug').ignore();
  }
  console.log('  ✓ Categorias de conhecimento inseridas');

  // ── PLAYBOOKS (FASE 8) ────────────────────────────────────────
  // Estes dois estão NOMEADOS no plano (§60 "Sem Conexão" e §62 "Venda
  // Residencial") — são estrutura de procedimento definida pelo próprio
  // documento, não fato sobre o provedor. Por isso são semeados, ao contrário
  // dos artigos de conhecimento. Nascem em RASCUNHO: quem opera decide quando
  // testar e publicar.
  const PLAYBOOKS = [
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

  for (const { etapas, ...pb } of PLAYBOOKS) {
    const existe = await db('playbooks').where({ slug: pb.slug }).first();
    if (existe) continue;
    const [criado] = await db('playbooks').insert({ ...pb, gatilhos: JSON.stringify([]) }).returning('*');
    await db('playbook_etapas').insert(etapas.map((e, i) => ({
      playbook_id: criado.id, ordem: i + 1,
      titulo: e.titulo, descricao: e.descricao || null,
      obrigatoriedade: e.obrigatoriedade, condicao: e.condicao || null,
      tools: JSON.stringify(e.tools || []),
    })));
  }
  console.log('  ✓ Playbooks inseridos (rascunho)');

  // ── PERFIS DE IA (FASE 9, §66) ────────────────────────────────
  // Um perfil junta prompt, tools, playbook e limites — o que hoje é
  // reconfigurado nó a nó. O `max_turnos` de cada um vem da prática: cadastro
  // comercial precisa de ~25 (a janela de histórico é 50 msgs ≈ 25 trocas),
  // suporte com diagnóstico, ~12.
  for (const p of [
    {
      slug: 'suporte', nome: 'Suporte técnico',
      descricao: 'Diagnóstico e resolução de problemas de conexão.',
      prompt_slug: 'suporte', playbook_slug: 'suporte_sem_conexao',
      goal: 'resolver_suporte', max_turnos: 12,
      regras_transferencia: 'Transfira se exigir visita técnica, se o cliente pedir humano ou se demonstrar irritação.',
      tools: JSON.stringify([]),
    },
    {
      slug: 'comercial', nome: 'Comercial',
      descricao: 'Venda residencial: da dúvida ao pré-cadastro.',
      prompt_slug: 'comercial', playbook_slug: 'comercial_venda_residencial',
      goal: 'converter_venda', max_turnos: 25,
      regras_transferencia: 'Transfira se o endereço não tiver cobertura, se pedirem condição fora da tabela ou se for cliente empresarial.',
      tools: JSON.stringify([]),
    },
  ]) {
    await db('ia_perfis').insert(p).onConflict('slug').ignore();
  }
  console.log('  ✓ Perfis de IA inseridos');

  // ── FLUXO PADRÃO ──────────────────────────────────────────────
  const fluxoExiste = await db('fluxos').where({ nome: 'Atendimento Padrão' }).first();
  if (!fluxoExiste) {
    await db('fluxos').insert({
      nome:   'Atendimento Padrão',
      ativo:  true,
      gatilho:'nova_conversa',
      nos: JSON.stringify([
        { id: 'inicio',   tipo: 'inicio',   posicao: { x: 100, y: 100 }, config: {} },
        { id: 'saudacao', tipo: 'mensagem', posicao: { x: 300, y: 100 }, config: { texto: 'Olá! 👋 Bem-vindo ao atendimento. Como posso ajudar?' } },
        { id: 'menu',     tipo: 'menu',     posicao: { x: 500, y: 100 }, config: {
          pergunta: 'Escolha uma opção:',
          opcoes: [
            { id: '1', texto: '1 - Suporte técnico' },
            { id: '2', texto: '2 - Financeiro / Boleto' },
            { id: '3', texto: '3 - Falar com atendente' },
          ],
        }},
      ]),
      conexoes: JSON.stringify([
        { origem: 'inicio',   destino: 'saudacao' },
        { origem: 'saudacao', destino: 'menu' },
      ]),
    });
    console.log('  ✓ Fluxo padrão criado');
  }

  console.log('\n✅ Seed concluído!');
  console.log('\n📋 Credenciais de acesso: ver os logs de criação acima.');
  console.log('\n🚀 Inicie o servidor com: npm run dev\n');

  await db.destroy();
}

seed().catch(err => {
  console.error('❌ Seed falhou:', err);
  process.exit(1);
});
