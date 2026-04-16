/**
 * seed.js — dados iniciais do banco
 * Cria admin padrão, canais e configurações base
 * Uso: node src/seed.js
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { getDb } from './config/db.js';
import { runMigrations } from './migrations/run.js';

async function seed() {
  console.log('🌱 Iniciando seed...\n');
  await runMigrations();
  const db = getDb();

  // ── ADMIN PADRÃO ──────────────────────────────────────────────
  const adminExiste = await db('agentes').where({ login: 'admin' }).first();
  if (!adminExiste) {
    const senha_hash = await bcrypt.hash('admin123', 10);
    await db('agentes').insert({
      nome:       'Administrador',
      login:      'admin',
      senha_hash,
      role:       'admin',
      avatar:     '⚡',
      permissoes: {},
    });
    console.log('  ✓ Admin criado — login: admin / senha: admin123');
    console.log('  ⚠️  TROQUE A SENHA EM PRODUÇÃO!');
  } else {
    console.log('  · Admin já existe, pulando');
  }

  // ── AGENTE DE TESTE ───────────────────────────────────────────
  const agenteExiste = await db('agentes').where({ login: 'agente01' }).first();
  if (!agenteExiste) {
    const senha_hash = await bcrypt.hash('agente123', 10);
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
    console.log('  ✓ Agente de teste criado — login: agente01 / senha: agente123');
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
  console.log('\n📋 Credenciais de acesso:');
  console.log('   Admin:  admin / admin123');
  console.log('   Agente: agente01 / agente123');
  console.log('\n🚀 Inicie o servidor com: npm run dev\n');

  await db.destroy();
}

seed().catch(err => {
  console.error('❌ Seed falhou:', err);
  process.exit(1);
});
