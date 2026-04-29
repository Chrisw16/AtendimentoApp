import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useStore } from '../store';
import { Save, RotateCcw, Copy, Check, AlertCircle } from 'lucide-react';
import styles from './PromptsIA.module.css';

// ── CONSTANTES ────────────────────────────────────────────────────
const SLUG_ICONS = {
  regras: '📏', estilo: '🎨', roteador: '🧭',
  financeiro: '💰', suporte: '🔧', comercial: '📡',
  faq: '❓', outros: '💬',
};

// Slugs que têm configuração de modelo/provedor/temperatura
const SLUGS_COM_MODELO = ['roteador','financeiro','suporte','comercial','faq','outros'];

const MODELOS = {
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  desc: 'Rápido e barato' },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', desc: 'Mais potente'     },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Rápido, barato'  },
    { id: 'gpt-4o',      label: 'GPT-4o',      desc: 'Mais potente'    },
  ],
};

const PLACEHOLDERS = [
  { tag: '[REGRAS]',           desc: 'Injeta as regras absolutas automaticamente'   },
  { tag: '[ESTILO]',           desc: 'Injeta o estilo de conversa automaticamente'  },
  { tag: '[TIPOS_OCORRENCIA]', desc: '200=Reparo, 5=Outros, 13=Mudança...'          },
  { tag: '[PLANOS]',           desc: 'Lista de planos cadastrados no sistema'       },
];


// ── CATÁLOGO DE TOOLS DA IA ───────────────────────────────────────
const TOOLS_CATALOG = [
  {
    name: 'verificar_conexao',
    label: 'Verificar Conexão',
    icon: '📡',
    category: 'Diagnóstico',
    endpoint: 'POST /api/ura/verificaacesso/',
    params: 'contrato',
    desc: 'Verifica se o cliente está online ou offline no SGP. Retorna status da conexão e mensagem.',
    status: 'ok',
  },
  {
    name: 'consultar_manutencao',
    label: 'Consultar Manutenção',
    icon: '🔧',
    category: 'Diagnóstico',
    endpoint: 'GET /api/ura/manutencao/list',
    params: '—',
    desc: 'Lista manutenções ativas na rede. Retorna previsão de normalização e áreas afetadas.',
    status: 'ok',
  },
  {
    name: 'status_rede',
    label: 'Status da Rede',
    icon: '🌐',
    category: 'Diagnóstico',
    endpoint: 'GET /api/ura/manutencao/list',
    params: '—',
    desc: 'Versão resumida do consultar_manutencao. Retorna "ok" ou lista de ocorrências ativas.',
    status: 'ok',
  },
  {
    name: 'consultar_radius',
    label: 'Consultar Radius',
    icon: '🔌',
    category: 'Diagnóstico',
    endpoint: 'POST /ws/radius/radacct/list/all/',
    params: 'cpfcnpj, tipoconexao=PPP',
    desc: 'Consulta sessão PPPoE ativa no Radius. Retorna IP, usuário e início da sessão.',
    status: 'ok',
  },
  {
    name: 'consultar_onu_acs',
    label: 'Consultar ONU (ACS)',
    icon: '📶',
    category: 'Diagnóstico',
    endpoint: 'ACS TR-069 interno',
    params: 'serial',
    desc: 'Lê dados da ONU: sinal Rx/Tx, uptime, firmware, IP WAN. Requer servidor ACS configurado.',
    status: 'pendente',
  },
  {
    name: 'reiniciar_onu_acs',
    label: 'Reiniciar ONU (ACS)',
    icon: '🔄',
    category: 'Diagnóstico',
    endpoint: 'ACS TR-069 interno',
    params: 'serial',
    desc: 'Reinicia ONU remotamente via ACS TR-069 (~2 min). Requer servidor ACS configurado.',
    status: 'pendente',
  },
  {
    name: 'criar_chamado',
    label: 'Criar Chamado',
    icon: '🎫',
    category: 'Atendimento',
    endpoint: 'POST /api/ura/chamado/',
    params: 'contrato¹, ocorrenciatipo, conteudo, contato_nome, contato_telefone',
    desc: 'Abre ocorrência técnica no SGP. ¹Contrato preenchido automaticamente pelo contexto. Tipos: 200=Reparo, 3=MudSenhaWifi, 14=RelocRoteador, 13=MudEndereco, 23=MudPlano, 22=ProbFatura, 5=Outros.',
    status: 'ok',
  },
  {
    name: 'historico_ocorrencias',
    label: 'Histórico de Ocorrências',
    icon: '📋',
    category: 'Atendimento',
    endpoint: 'POST /api/ura/ocorrencia/list/',
    params: 'contrato, offset=0, limit=5',
    desc: 'Lista chamados técnicos anteriores do cliente com status, tipo e data.',
    status: 'ok',
  },
  {
    name: 'transferir_para_humano',
    label: 'Transferir para Humano',
    icon: '👤',
    category: 'Atendimento',
    endpoint: 'Lógica interna',
    params: 'motivo',
    desc: 'Encaminha a conversa para fila de atendimento humano. Altera status da conversa no banco.',
    status: 'ok',
  },
  {
    name: 'encerrar_atendimento',
    label: 'Encerrar Atendimento',
    icon: '✅',
    category: 'Atendimento',
    endpoint: 'Lógica interna',
    params: '—',
    desc: 'Encerra a conversa quando o problema foi resolvido. Avança pelo fluxo porta "resolvido".',
    status: 'ok',
  },
  {
    name: 'segunda_via_boleto',
    label: '2ª Via de Boleto',
    icon: '💳',
    category: 'Financeiro',
    endpoint: 'POST /api/ura/fatura2via/',
    params: 'cpfcnpj, contrato, status=abertos',
    desc: 'Emite segunda via de fatura. Retorna valor, vencimento, link do boleto e código PIX.',
    status: 'ok',
  },
  {
    name: 'promessa_pagamento',
    label: 'Promessa de Pagamento',
    icon: '🤝',
    category: 'Financeiro',
    endpoint: 'POST /api/ura/liberacaopromessa/',
    params: 'contrato',
    desc: 'Libera acesso suspenso ou com velocidade reduzida (1x por mês). Cliente promete pagar.',
    status: 'ok',
  },
  {
    name: 'precadastrar_cliente',
    label: 'Pré-Cadastro de Cliente',
    icon: '📝',
    category: 'Comercial',
    endpoint: 'POST /api/precadastro/F',
    params: 'nome, cpf, datanasc, email, celular, endereço, plano_id, vencimento_id',
    desc: 'Cadastra novo cliente PF no SGP. Use no contexto comercial após coletar todos os dados. POP e portador são auto-detectados pela cidade. IDs de plano e vencimento devem vir das tools listar_planos_ativos e listar_vencimentos.',
    status: 'ok',
  },
  {
    name: 'listar_planos_ativos',
    label: 'Listar Planos Ativos',
    icon: '📋',
    category: 'Comercial',
    endpoint: 'GET /api/planos (local)',
    params: 'cidade (opcional)',
    desc: 'Retorna catálogo de planos cadastrados em Configurações → Planos. Filtra por cidade se informado. Necessário antes de precadastrar_cliente para a IA saber o plano_id correto.',
    status: 'ok',
  },
  {
    name: 'listar_vencimentos',
    label: 'Listar Vencimentos',
    icon: '📅',
    category: 'Comercial',
    endpoint: 'POST /api/precadastro/vencimento/list',
    params: '—',
    desc: 'Retorna dias de vencimento disponíveis no SGP. Necessário antes de precadastrar_cliente para a IA saber o vencimento_id correto.',
    status: 'ok',
  },
];

const CATEGORY_COLORS = {
  'Diagnóstico': '#3b82f6',
  'Atendimento': '#8b5cf6',
  'Financeiro':  '#10b981',
  'Comercial':   '#f59e0b',
};

const STATUS_BADGE = {
  ok:       { label: 'Ativo',    bg: 'rgba(16,185,129,.12)', color: '#10b981' },
  pendente: { label: 'Requer config', bg: 'rgba(245,158,11,.12)', color: '#f59e0b' },
};


// ── DEFINIÇÃO DOS TESTES ──────────────────────────────────────────
const TEST_TOOLS = [
  {
    id: 'consultar_cliente', label: 'Consultar Cliente', icon: '👤', category: 'SGP — Clientes',
    endpoint: 'POST /api/ura/consultacliente/',
    desc: 'Busca cliente por CPF ou CNPJ. Retorna nome, contratos, status, plano e cidade.',
    fields: [{ key: 'cpfcnpj', label: 'CPF ou CNPJ', placeholder: '13193380466', required: true }],
  },
  {
    id: 'verificar_conexao', label: 'Verificar Conexão', icon: '📡', category: 'SGP — Diagnóstico',
    endpoint: 'POST /api/ura/verificaacesso/',
    desc: 'Verifica se o contrato está online/offline no SGP.',
    fields: [{ key: 'contrato', label: 'ID do Contrato', placeholder: '30951', required: true }],
  },
  {
    id: 'consultar_radius', label: 'Consultar Radius', icon: '🔌', category: 'SGP — Diagnóstico',
    endpoint: 'POST /ws/radius/radacct/list/all/',
    desc: 'Consulta sessão PPPoE ativa. Retorna IP, usuário e início da sessão.',
    fields: [{ key: 'cpfcnpj', label: 'CPF ou CNPJ', placeholder: '13193380466', required: true }],
  },
  {
    id: 'consultar_manutencao', label: 'Consultar Manutenção', icon: '🔧', category: 'SGP — Diagnóstico',
    endpoint: 'GET /api/ura/manutencao/list',
    desc: 'Lista manutenções ativas na rede. Sem parâmetros obrigatórios.',
    fields: [],
  },
  {
    id: 'status_rede', label: 'Status da Rede', icon: '🌐', category: 'SGP — Diagnóstico',
    endpoint: 'GET /api/ura/manutencao/list',
    desc: 'Versão resumida: retorna ok ou lista de ocorrências ativas.',
    fields: [],
  },
  {
    id: 'segunda_via_boleto', label: '2ª Via de Boleto', icon: '💳', category: 'SGP — Financeiro',
    endpoint: 'POST /api/ura/fatura2via/',
    desc: 'Emite segunda via. Retorna valor, vencimento, link e código PIX.',
    fields: [
      { key: 'cpfcnpj',  label: 'CPF ou CNPJ', placeholder: '13193380466', required: true },
      { key: 'contrato', label: 'ID do Contrato', placeholder: '30951', required: true },
    ],
  },
  {
    id: 'promessa_pagamento', label: 'Promessa de Pagamento', icon: '🤝', category: 'SGP — Financeiro',
    endpoint: 'POST /api/ura/liberacaopromessa/',
    desc: '⚠️ Libera acesso suspenso (1x/mês). Só use em contrato realmente suspenso.',
    fields: [{ key: 'contrato', label: 'ID do Contrato', placeholder: '30951', required: true }],
    warn: true,
  },
  {
    id: 'historico_ocorrencias', label: 'Histórico de Ocorrências', icon: '📋', category: 'SGP — Atendimento',
    endpoint: 'POST /api/ura/ocorrencia/list/',
    desc: 'Lista chamados técnicos do contrato.',
    fields: [{ key: 'contrato', label: 'ID do Contrato', placeholder: '30951', required: true }],
  },
  {
    id: 'criar_chamado', label: 'Criar Chamado', icon: '🎫', category: 'SGP — Atendimento',
    endpoint: 'POST /api/ura/chamado/',
    desc: '⚠️ Abre ocorrência REAL no SGP. Tipos: 200=Reparo, 5=Outros, 3=MudSenhaWifi, 13=MudEndereco, 14=RelocRoteador, 22=ProbFatura, 23=MudPlano.',
    fields: [
      { key: 'contrato',       label: 'ID do Contrato',     placeholder: '30951',             required: true },
      { key: 'ocorrenciatipo', label: 'Tipo (ex: 5)',        placeholder: '5',                 required: true },
      { key: 'conteudo',       label: 'Descrição',          placeholder: 'Teste via painel',  required: true },
      { key: 'contato_nome',   label: 'Nome do contato',    placeholder: 'João Silva' },
      { key: 'contato_telefone', label: 'Telefone',         placeholder: '84999999999' },
    ],
    warn: true,
  },
  {
    id: 'precadastrar_cliente', label: 'Pré-Cadastro de Cliente', icon: '📝', category: 'SGP — Comercial',
    endpoint: 'POST /api/precadastro/F',
    desc: '⚠️ Cria cliente REAL no SGP. POP e portador são auto-detectados pela cidade quando omitidos. Use IDs de plano/vencimento das outras tools comerciais.',
    fields: [
      { key: 'nome',          label: 'Nome completo',         placeholder: 'João da Silva',           required: true },
      { key: 'cpf',           label: 'CPF',                   placeholder: '12345678900',             required: true },
      { key: 'datanasc',      label: 'Nascimento (AAAA-MM-DD)', placeholder: '1990-05-20',            required: true },
      { key: 'email',         label: 'E-mail',                placeholder: 'joao@exemplo.com',        required: true },
      { key: 'celular',       label: 'Celular',               placeholder: '84988776655',             required: true },
      { key: 'logradouro',    label: 'Logradouro',            placeholder: 'Av. Engenheiro Roberto Freire', required: true },
      { key: 'numero',        label: 'Número',                placeholder: '100',                     required: true },
      { key: 'complemento',   label: 'Complemento',           placeholder: 'Apto 201' },
      { key: 'bairro',        label: 'Bairro',                placeholder: 'Capim Macio',             required: true },
      { key: 'cidade',        label: 'Cidade',                placeholder: 'Natal',                   required: true },
      { key: 'cep',           label: 'CEP',                   placeholder: '59082000' },
      { key: 'plano_id',      label: 'ID do Plano',           placeholder: '12',                      required: true },
      { key: 'vencimento_id', label: 'ID do Vencimento',      placeholder: '1',                       required: true },
    ],
    warn: true,
  },
  {
    id: 'listar_planos_ativos', label: 'Listar Planos Ativos', icon: '📋', category: 'SGP — Comercial',
    endpoint: 'GET /api/planos (local)',
    desc: 'Retorna planos cadastrados em Configurações → Planos. Filtra por cidade se informado.',
    fields: [
      { key: 'cidade', label: 'Cidade (opcional)', placeholder: 'Natal' },
    ],
  },
  {
    id: 'listar_vencimentos', label: 'Listar Vencimentos', icon: '📅', category: 'SGP — Comercial',
    endpoint: 'POST /api/precadastro/vencimento/list',
    desc: 'Retorna dias de vencimento disponíveis no SGP. Sem parâmetros.',
    fields: [],
  },
];

const CATEGORY_ORDER = ['SGP — Clientes','SGP — Diagnóstico','SGP — Financeiro','SGP — Atendimento','SGP — Comercial'];

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────
export default function PromptsIA() {
  const toast = useStore(s => s.toast);
  const qc    = useQueryClient();

  const [activeSlug, setActiveSlug] = useState('regras');
  const [editText,   setEditText]   = useState('');
  const [editProv,   setEditProv]   = useState('anthropic');
  const [editModel,  setEditModel]  = useState('claude-haiku-4-5-20251001');
  const [editTemp,   setEditTemp]   = useState(0.3);
  const [dirty,      setDirty]      = useState(false);
  const [copied,     setCopied]     = useState('');
  const [tab,        setTab]          = useState('prompt');
  const [testTool,   setTestTool]     = useState('consultar_cliente');
  const [testParams, setTestParams]   = useState({});
  const [testResult, setTestResult]   = useState(null);
  const [testLoading,setTestLoading]  = useState(false);

  const { data: prompts = [], isLoading } = useQuery({
    queryKey: ['prompts-ia'],
    queryFn:  () => api.get('/prompts'),
  });

  // Quando os dados chegam, carrega o primeiro prompt
  useEffect(() => {
    if (prompts.length && !dirty) {
      const p = prompts.find(x => x.slug === activeSlug) || prompts[0];
      if (p) apply(p);
    }
  }, [prompts]);

  function apply(p) {
    setEditText(p.conteudo || '');
    setEditProv(p.provedor || 'anthropic');
    setEditModel(p.modelo  || 'claude-haiku-4-5-20251001');
    setEditTemp(Number(p.temperatura ?? 0.3));
  }

  function select(slug) {
    if (dirty && !window.confirm('Tem alterações não salvas. Descartar?')) return;
    const p = prompts.find(x => x.slug === slug);
    setActiveSlug(slug);
    if (p) apply(p);
    setDirty(false);
  }

  const saveMut = useMutation({
    mutationFn: body => api.put(`/prompts/${activeSlug}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompts-ia'] });
      setDirty(false);
      toast('Prompt salvo!', 'success');
    },
    onError: e => toast(e.message, 'error'),
  });

  const restoreMut = useMutation({
    mutationFn: () => api.post(`/prompts/${activeSlug}/restaurar`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['prompts-ia'] });
      const fresh = await api.get('/prompts');
      const p = fresh.find(x => x.slug === activeSlug);
      if (p) apply(p);
      setDirty(false);
      toast('Restaurado para o padrão', 'success');
    },
    onError: e => toast(e.message, 'error'),
  });

  const activePrompt  = prompts.find(p => p.slug === activeSlug);
  const isCustomized  = activePrompt && activePrompt.conteudo !== activePrompt.padrao;
  const showModelConf = SLUGS_COM_MODELO.includes(activeSlug);


  async function runTest() {
    setTestLoading(true);
    setTestResult(null);
    try {
      const r = await api.post('/sysconfig/tools/test', { tool: testTool, params: testParams });
      setTestResult(r);
    } catch(e) {
      setTestResult({ ok: false, error: e.message });
    }
    setTestLoading(false);
  }

  function copyTag(tag) {
    navigator.clipboard.writeText(tag).catch(() => {});
    setCopied(tag);
    setTimeout(() => setCopied(''), 1500);
  }

  function fmtModel(m) {
    return (m || '')
      .replace('claude-haiku-4-5-20251001', 'Haiku 4.5')
      .replace('claude-sonnet-4-6', 'Sonnet 4.6')
      .replace('gpt-4o-mini', 'GPT-4o Mini')
      .replace('gpt-4o', 'GPT-4o');
  }

  return (
    <div className={styles.root}>

      {/* HEADER */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>🧠 Prompts IA</h1>
          <p className={styles.subtitle}>Edite prompts e configure o modelo de cada agente</p>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
        {[{id:'prompt',label:'🧠 Prompts'},{id:'tools',label:'🛠 Catálogo'},{id:'test',label:'⚡ Testar Tools'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'8px 18px', border:'none', background:'transparent', cursor:'pointer',
            fontSize:13, fontWeight: tab===t.id ? 700 : 400,
            color: tab===t.id ? 'var(--brand-blue)' : 'var(--text-secondary)',
            borderBottom: tab===t.id ? '2px solid var(--brand-blue)' : '2px solid transparent',
            transition:'all .15s', marginBottom:-1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* TOOLS TAB */}
      {tab === 'tools' && (
        <div>
          <p style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:20 }}>
            Funções disponíveis para os agentes de IA. Cada tool chama uma API real do SGP ou executa lógica interna.
          </p>
          {['Diagnóstico','Atendimento','Financeiro'].map(cat => (
            <div key={cat} style={{ marginBottom:28 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <div style={{ width:3, height:18, borderRadius:2, background:CATEGORY_COLORS[cat] }}/>
                <span style={{ fontSize:12, fontWeight:700, color:CATEGORY_COLORS[cat], textTransform:'uppercase', letterSpacing:'.06em' }}>{cat}</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {TOOLS_CATALOG.filter(t => t.category === cat).map(tool => {
                  const st = STATUS_BADGE[tool.status];
                  return (
                    <div key={tool.name} style={{
                      background:'var(--bg-secondary)', border:'1px solid var(--border)',
                      borderRadius:10, padding:'12px 16px',
                      display:'grid', gridTemplateColumns:'auto 1fr auto', gap:'0 16px', alignItems:'start',
                    }}>
                      <span style={{ fontSize:22, gridRow:'1/3' }}>{tool.icon}</span>
                      <div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{tool.label}</span>
                          <code style={{ fontSize:10, color:'var(--text-tertiary)', background:'var(--bg-tertiary)', padding:'1px 6px', borderRadius:4 }}>{tool.name}</code>
                          <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, background:st.bg, color:st.color }}>{st.label}</span>
                        </div>
                        <p style={{ fontSize:12, color:'var(--text-secondary)', margin:0, lineHeight:1.6 }}>{tool.desc}</p>
                      </div>
                      <div style={{ fontSize:11, textAlign:'right', whiteSpace:'nowrap' }}>
                        <div style={{ color:'var(--text-tertiary)', marginBottom:2 }}>
                          <code style={{ background:'var(--bg-tertiary)', padding:'2px 6px', borderRadius:4, fontSize:10 }}>{tool.endpoint}</code>
                        </div>
                        <div style={{ color:'var(--text-tertiary)', fontSize:10 }}>params: {tool.params}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}


      {/* TEST TAB */}
      {tab === 'test' && (
        <div style={{ display:'grid', gridTemplateColumns:'240px 1fr', gap:16, minHeight:500 }}>

          {/* SIDEBAR — lista de tools */}
          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
            {CATEGORY_ORDER.map(cat => (
              <div key={cat} style={{ marginBottom:8 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'.06em', padding:'4px 10px', marginBottom:2 }}>{cat.replace('SGP — ','')}</div>
                {TEST_TOOLS.filter(t => t.category === cat).map(t => (
                  <button key={t.id} onClick={() => { setTestTool(t.id); setTestParams({}); setTestResult(null); }}
                    style={{
                      width:'100%', textAlign:'left', padding:'8px 10px', border:'none', borderRadius:8, cursor:'pointer',
                      background: testTool === t.id ? 'rgba(59,130,246,.12)' : 'transparent',
                      color: testTool === t.id ? 'var(--brand-blue)' : 'var(--text-secondary)',
                      fontWeight: testTool === t.id ? 600 : 400,
                      fontSize:12, display:'flex', alignItems:'center', gap:6,
                    }}>
                    <span>{t.icon}</span>{t.label}
                    {t.warn && <span style={{ fontSize:9, color:'#f59e0b', marginLeft:'auto' }}>⚠️</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* PAINEL DIREITO */}
          {(() => {
            const tool = TEST_TOOLS.find(t => t.id === testTool);
            if (!tool) return null;
            return (
              <div style={{ background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>

                {/* Header */}
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <span style={{ fontSize:24 }}>{tool.icon}</span>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)' }}>{tool.label}</div>
                    <code style={{ fontSize:10, color:'var(--text-tertiary)' }}>{tool.endpoint}</code>
                  </div>
                </div>

                <p style={{ fontSize:12, color: tool.warn ? '#f59e0b' : 'var(--text-secondary)', marginBottom:16, padding: tool.warn ? '8px 12px' : 0, background: tool.warn ? 'rgba(245,158,11,.08)' : 'transparent', borderRadius:8 }}>
                  {tool.desc}
                </p>

                {/* Campos */}
                {tool.fields.length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
                    {tool.fields.map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:4 }}>
                          {f.label}{f.required && <span style={{ color:'#ef4444' }}> *</span>}
                        </label>
                        <input
                          value={testParams[f.key] || ''}
                          onChange={e => setTestParams(p => ({ ...p, [f.key]: e.target.value }))}
                          placeholder={f.placeholder}
                          style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-primary)', color:'var(--text-primary)', fontSize:13, boxSizing:'border-box' }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={runTest} disabled={testLoading}
                  style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'var(--brand-blue)', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', opacity: testLoading ? .6 : 1 }}>
                  {testLoading ? '⏳ Executando...' : '▶ Executar'}
                </button>

                {/* Resultado */}
                {testResult && (
                  <div style={{ marginTop:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <span style={{ fontSize:13, fontWeight:700, color: testResult.ok ? '#10b981' : '#ef4444' }}>
                        {testResult.ok ? '✅ Sucesso' : '❌ Erro'}
                      </span>
                      {testResult.ms && <span style={{ fontSize:11, color:'var(--text-tertiary)' }}>{testResult.ms}ms</span>}
                    </div>
                    <pre style={{
                      background:'var(--bg-primary)', border:'1px solid var(--border)', borderRadius:8,
                      padding:14, fontSize:11, color:'var(--text-primary)', overflow:'auto',
                      maxHeight:360, margin:0, lineHeight:1.6,
                    }}>{JSON.stringify(testResult.error || testResult.result, null, 2)}</pre>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {tab === 'prompt' && isLoading ? (
        <div className={styles.loading}><span className="spinner spinner-lg"/></div>
      ) : tab === 'prompt' && (
        <div className={styles.layout}>

          {/* SIDEBAR */}
          <div className={styles.sidebar}>
            <div className={styles.promptList}>
              {prompts.map(p => (
                <button key={p.slug} onClick={() => select(p.slug)}
                  className={[styles.promptItem, p.slug === activeSlug && styles.promptItemActive].join(' ')}>
                  <span className={styles.promptIcon}>{SLUG_ICONS[p.slug] || '📄'}</span>
                  <div className={styles.promptMeta}>
                    <span className={styles.promptNome}>{p.nome}</span>
                    {SLUGS_COM_MODELO.includes(p.slug) && (
                      <span className={styles.promptModel}>
                        {p.provedor === 'anthropic' ? '🟣' : '🟢'} {fmtModel(p.modelo)}
                      </span>
                    )}
                  </div>
                  {p.conteudo !== p.padrao && <span className={styles.customDot} title="Personalizado"/>}
                </button>
              ))}
            </div>

            {/* PLACEHOLDERS */}
            <div className={styles.placeholders}>
              <p className={styles.placeholdersTitle}>Placeholders</p>
              {PLACEHOLDERS.map(ph => (
                <button key={ph.tag} className={styles.phItem} onClick={() => copyTag(ph.tag)}>
                  <code className={styles.phTag}>{ph.tag}</code>
                  <span className={styles.phDesc}>{ph.desc}</span>
                  {copied === ph.tag
                    ? <Check size={10} style={{ color:'var(--success)', flexShrink:0 }}/>
                    : <Copy size={10} style={{ color:'var(--text-tertiary)', flexShrink:0 }}/>}
                </button>
              ))}
            </div>
          </div>

          {/* EDITOR */}
          {activePrompt && (
            <div className={styles.editor}>

              {/* TÍTULO */}
              <div className={styles.editorHeader}>
                <span className={styles.editorIcon}>{SLUG_ICONS[activeSlug]}</span>
                <div>
                  <h2 className={styles.editorTitle}>{activePrompt.nome}</h2>
                  <code className={styles.editorSlug}>slug: {activeSlug}</code>
                </div>
                <div className={styles.editorBadges}>
                  {dirty && <span className={[styles.badge, styles.badgeDirty].join(' ')}>Não salvo</span>}
                  {isCustomized && !dirty && <span className={[styles.badge, styles.badgeCustom].join(' ')}>Personalizado</span>}
                </div>
              </div>

              {/* CONFIG DE MODELO */}
              {showModelConf && (
                <div className={styles.modelConf}>
                  <div className={styles.modelField}>
                    <label className={styles.modelLabel}>Provedor</label>
                    <select className={styles.select} value={editProv}
                      onChange={e => {
                        const prov = e.target.value;
                        setEditProv(prov);
                        setEditModel(MODELOS[prov][0].id);
                        setDirty(true);
                      }}>
                      <option value="anthropic">🟣 Anthropic</option>
                      <option value="openai">🟢 OpenAI</option>
                    </select>
                  </div>
                  <div className={styles.modelField} style={{ flex: 2 }}>
                    <label className={styles.modelLabel}>Modelo</label>
                    <select className={styles.select} value={editModel}
                      onChange={e => { setEditModel(e.target.value); setDirty(true); }}>
                      {(MODELOS[editProv] || []).map(m => (
                        <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.modelField}>
                    <label className={styles.modelLabel}>Temperatura ({editTemp.toFixed(1)})</label>
                    <input type="range" min="0" max="1" step="0.1" value={editTemp}
                      onChange={e => { setEditTemp(parseFloat(e.target.value)); setDirty(true); }}
                      className={styles.range}/>
                  </div>
                </div>
              )}

              {/* TEXTAREA */}
              <textarea
                className={[styles.textarea, dirty && styles.textareaDirty].join(' ')}
                value={editText}
                onChange={e => { setEditText(e.target.value); setDirty(true); }}
                spellCheck={false}
                rows={16}
              />

              {/* FOOTER */}
              <div className={styles.editorFooter}>
                <span className={styles.charCount}>
                  {editText.split('\n').length} linhas · {editText.length} chars
                </span>
                <div className={styles.footerActions}>
                  {isCustomized && (
                    <button className={styles.btnRestore}
                      onClick={() => restoreMut.mutate()}
                      disabled={restoreMut.isPending}>
                      <RotateCcw size={13}/>
                      Restaurar padrão
                    </button>
                  )}
                  <button
                    className={styles.btnSave}
                    onClick={() => saveMut.mutate({ conteudo: editText, provedor: editProv, modelo: editModel, temperatura: editTemp })}
                    disabled={saveMut.isPending || !dirty}>
                    <Save size={13}/>
                    {saveMut.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>

              {/* DICA sobre o slug */}
              <div className={styles.contextHint}>
                <AlertCircle size={12}/>
                <span>
                  No editor de fluxos, use um nó <strong>IA Responde</strong> com
                  {' '}<code>contexto = "{activeSlug}"</code> para este prompt ser ativado.
                </span>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}
