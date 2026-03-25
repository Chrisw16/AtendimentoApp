import { useState, useEffect, useCallback } from 'react';
import { apiJson, api } from '../api';

const apiFetch = (path, opts) => opts ? api(path, opts).then(r => r.json()) : apiJson(path);

const FLOW_JSON_CADASTRO = {
  version: "3.1",
  screens: [
    {
      id: "TELA_CEP",
      title: "Verificar cobertura",
      layout: {
        type: "SingleColumnLayout",
        children: [
          { type: "TextHeading", text: "Contratar CITmax 🌐" },
          { type: "TextBody", text: "Digite seu CEP para verificar a cobertura na sua região e ver os planos disponíveis." },
          {
            type: "TextInput",
            label: "CEP",
            name: "cep",
            input_type: "number",
            required: true,
            helper_text: "Ex: 59064625",
          },
          {
            type: "Footer",
            label: "Verificar cobertura",
            on_click_action: {
              name: "data_exchange",
              payload: { cep: "${form.cep}", screen: "TELA_PLANOS" },
            },
          },
        ],
      },
    },
    {
      id: "TELA_DADOS",
      title: "Seus dados",
      data: {
        planos:      { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, description: { type: "string" } } } },
        vencimentos: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } } },
        cep_digitado: { type: "string", example: "59064625" },
      },
      layout: {
        type: "SingleColumnLayout",
        children: [
          { type: "TextHeading", text: "Preencha seus dados" },
          { type: "TextInput",  label: "Nome completo",    name: "nome",      input_type: "text",   required: true },
          { type: "TextInput",  label: "CPF",              name: "cpf",       input_type: "text",   required: true, helper_text: "Somente números" },
          { type: "TextInput",  label: "Data de nascimento", name: "datanasc", input_type: "text",  required: true, helper_text: "AAAA-MM-DD" },
          { type: "TextInput",  label: "E-mail",           name: "email",     input_type: "email",  required: false },
          { type: "TextInput",  label: "Celular",          name: "celular",   input_type: "phone",  required: true },
          { type: "TextInput",  label: "Logradouro",       name: "logradouro",input_type: "text",   required: true },
          { type: "TextInput",  label: "Número",           name: "numero",    input_type: "number", required: true },
          { type: "TextInput",  label: "Bairro",           name: "bairro",    input_type: "text",   required: true },
          { type: "TextInput",  label: "Cidade",           name: "cidade",    input_type: "text",   required: true },
          {
            type: "Dropdown",
            label: "Plano desejado",
            name: "plano_id",
            required: true,
            "data-source": "${data.planos}",
          },
          {
            type: "Dropdown",
            label: "Vencimento preferido",
            name: "vencimento_id",
            required: true,
            "data-source": "${data.vencimentos}",
          },
          {
            type: "Footer",
            label: "Confirmar cadastro",
            on_click_action: {
              name: "data_exchange",
              payload: {
                screen: "SUCESSO",
                nome: "${form.nome}", cpf: "${form.cpf}", datanasc: "${form.datanasc}",
                email: "${form.email}", celular: "${form.celular}",
                logradouro: "${form.logradouro}", numero: "${form.numero}",
                bairro: "${form.bairro}", cidade: "${form.cidade}",
                plano_id: "${form.plano_id}", vencimento_id: "${form.vencimento_id}",
                cep: "${data.cep_digitado}",
              },
            },
          },
        ],
      },
    },
    {
      id: "CONFIRMACAO",
      title: "Cadastro realizado!",
      terminal: true,
      data: {
        protocolo: { type: "string", example: "PRE-12345" },
        nome:      { type: "string", example: "João Silva" },
      },
      layout: {
        type: "SingleColumnLayout",
        children: [
          { type: "TextHeading", text: "✅ Cadastro enviado!" },
          { type: "TextBody", text: "Olá ${data.nome}! Seu pré-cadastro foi recebido com sucesso.\n\nProtocolo: ${data.protocolo}\n\nNossa equipe entrará em contato para confirmar a instalação." },
          { type: "Footer", label: "Fechar", on_click_action: { name: "complete" } },
        ],
      },
    },
  ],
};

export default function WaFlows() {
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try { const r = await apiFetch('/api/wa/flows'); setFlows(Array.isArray(r) ? r : []); }
    catch { setFlows([]); }
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const criarFlowCadastro = async () => {
    setCriando(true); setMsg('');
    try {
      // Cria o flow na Meta
      const r = await apiFetch('/api/wa/flows/criar', {
        method: 'POST',
        body: JSON.stringify({
          name: 'citmax_cadastro_v1',
          categories: ['SIGN_UP'],
          flow_json: JSON.stringify(FLOW_JSON_CADASTRO),
          endpoint_uri: 'https://maxxi.citmax.com.br/admin/api/wa/flows/data',
        }),
      });
      if (r.error) setMsg('❌ ' + r.error);
      else { setMsg(`✅ Flow criado! ID: ${r.id}`); carregar(); }
    } catch(e) { setMsg('❌ ' + e.message); }
    setCriando(false);
  };

  const statusColor = s => s === 'PUBLISHED' ? '#00c896' : s === 'DRAFT' ? '#f5c518' : '#ff4757';

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 4 }}>WhatsApp Flows</h1>
        <p style={{ color: 'rgba(255,255,255,.4)', fontSize: '.85rem' }}>
          Formulários interativos nativos do WhatsApp — o cliente preenche sem sair do app
        </p>
      </div>

      {/* Endpoint info */}
      <div style={{ marginBottom: 20, padding: '12px 16px', background: 'rgba(0,200,150,.05)', border: '1px solid rgba(0,200,150,.15)', borderRadius: 10 }}>
        <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#00c896', marginBottom: 6 }}>🔗 Endpoint dinâmico (configure no Meta)</div>
        <code style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.7)', background: 'rgba(0,0,0,.3)', padding: '4px 8px', borderRadius: 5, display: 'block' }}>
          POST https://maxxi.citmax.com.br/admin/api/wa/flows/data
        </code>
        <div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.3)', marginTop: 6 }}>
          Este endpoint responde às telas do Flow dinamicamente (busca planos por CEP no SGP)
        </div>
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={carregar} disabled={loading}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: 12 }}>
          {loading ? '…' : '⟳ Atualizar'}
        </button>
        <button onClick={criarFlowCadastro} disabled={criando}
          style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(0,200,150,.12)', border: '1px solid rgba(0,200,150,.3)', color: '#00c896', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          {criando ? 'Criando…' : '+ Criar Flow de Cadastro'}
        </button>
        <a href="https://business.facebook.com/wa/manage/flows/" target="_blank" rel="noreferrer"
          style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(62,207,255,.08)', border: '1px solid rgba(62,207,255,.2)', color: '#3ecfff', cursor: 'pointer', fontSize: 12, textDecoration: 'none' }}>
          🔗 Abrir Meta Business
        </a>
      </div>

      {msg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: msg.startsWith('✅') ? 'rgba(0,200,150,.08)' : 'rgba(255,71,87,.08)',
          border: `1px solid ${msg.startsWith('✅') ? 'rgba(0,200,150,.2)' : 'rgba(255,71,87,.2)'}`,
          color: msg.startsWith('✅') ? '#00c896' : '#ff4757' }}>
          {msg}
        </div>
      )}

      {/* Lista de flows */}
      {!flows.length && !loading && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,.2)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div>Nenhum Flow encontrado. Crie um ou verifique a configuração do canal WhatsApp.</div>
        </div>
      )}

      {flows.map(f => (
        <div key={f.id} style={{ marginBottom: 12, padding: '14px 16px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: '.9rem' }}>{f.name}</span>
              <span style={{ fontSize: '.65rem', fontFamily: 'monospace', color: 'rgba(255,255,255,.3)', marginLeft: 10 }}>ID: {f.id}</span>
            </div>
            <span style={{ fontSize: '.65rem', padding: '2px 8px', borderRadius: 20, fontWeight: 700,
              background: `${statusColor(f.status)}15`, color: statusColor(f.status),
              border: `1px solid ${statusColor(f.status)}30` }}>
              {f.status}
            </span>
          </div>
          <div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.3)', marginBottom: 10 }}>
            {(f.categories || []).join(', ')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { navigator.clipboard.writeText(f.id); setMsg(`✅ ID ${f.id} copiado!`); setTimeout(()=>setMsg(''),2000); }}
              style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: '.68rem' }}>
              📋 Copiar ID
            </button>
            <a href={`https://business.facebook.com/wa/manage/flows/${f.id}/`} target="_blank" rel="noreferrer"
              style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(62,207,255,.06)', border: '1px solid rgba(62,207,255,.15)', color: '#3ecfff', fontSize: '.68rem', textDecoration: 'none' }}>
              ✏️ Editar no Meta
            </a>
          </div>
        </div>
      ))}

      {/* JSON do Flow para referência */}
      <details style={{ marginTop: 24, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 10, padding: '12px 16px' }}>
        <summary style={{ cursor: 'pointer', fontSize: '.8rem', color: 'rgba(255,255,255,.5)', fontWeight: 600 }}>
          📄 Ver JSON do Flow de Cadastro (para importar manualmente no Meta)
        </summary>
        <pre style={{ marginTop: 12, fontSize: '.7rem', color: 'rgba(255,255,255,.4)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {JSON.stringify(FLOW_JSON_CADASTRO, null, 2)}
        </pre>
        <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(FLOW_JSON_CADASTRO, null, 2)); setMsg('✅ JSON copiado!'); setTimeout(()=>setMsg(''),2000); }}
          style={{ marginTop: 8, padding: '5px 12px', borderRadius: 6, background: 'rgba(0,200,150,.1)', border: '1px solid rgba(0,200,150,.2)', color: '#00c896', cursor: 'pointer', fontSize: '.72rem' }}>
          📋 Copiar JSON
        </button>
      </details>
    </div>
  );
}
