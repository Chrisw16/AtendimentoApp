import React, { useEffect, useState } from 'react';
import { apiJson } from '../api';

const SERVICES = [
  { key: 'anthropic', icon: '🧠', name: 'Anthropic (Claude)', desc: 'Motor IA principal', env: 'ANTHROPIC_API_KEY' },
  { key: 'openai', icon: '🤖', name: 'OpenAI (GPT)', desc: 'Fallback IA', env: 'OPENAI_API_KEY' },
  { key: 'google', icon: '🔍', name: 'Google AI', desc: 'Gemini fallback', env: 'GOOGLE_AI_KEY' },
  { key: 'elevenlabs', icon: '🔊', name: 'ElevenLabs', desc: 'Text-to-Speech', env: 'ELEVENLABS_API_KEY' },
  { key: 'chatwoot', icon: '💬', name: 'Chatwoot', desc: 'Gerenciamento de conversas', env: 'CHATWOOT_API_TOKEN' },
  { key: 'whatsapp', icon: '📱', name: 'WhatsApp Cloud API', desc: 'Envio direto (botões, listas, PIX)', env: 'WA_ACCESS_TOKEN' },
  { key: 'erp', icon: '🏢', name: 'ERP SGP', desc: 'Sistema de gestão', env: 'ERP_DB_HOST' },
  { key: 'database', icon: '🗄️', name: 'PostgreSQL', desc: 'Banco de dados local', env: 'DATABASE_URL' },
];

export default function Integracoes() {
  const [health, setHealth] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson('/api/status').then(data => {
      const h = {};
      // Backend retorna: sgp, chatwoot, anthropic, elevenlabs, whatsapp, openai, google
      Object.entries(data || {}).forEach(([k, v]) => { h[k] = v === 'ok'; });
      h.erp = h.sgp || false; // Backend chama "sgp", frontend usa "erp"
      h.database = true; // Se o endpoint respondeu, DB tá online
      setHealth(h);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <div className="page-head">
        <div><h1>🔑 Integrações</h1><p>Serviços conectados e status de APIs</p></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {SERVICES.map(s => {
          const ok = health[s.key];
          return (
            <div key={s.key} className="card" style={{ borderLeft: `3px solid ${ok === true ? 'var(--g1)' : ok === false ? 'var(--red)' : 'var(--dim)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.5rem' }}>{s.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '.88rem' }}>{s.name}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{s.desc}</div>
                </div>
                <span className={`badge ${ok === true ? 'badge-green' : ok === false ? 'badge-red' : 'badge-yellow'}`} style={{ fontSize: '.6rem' }}>
                  {loading ? '...' : ok === true ? '● Online' : ok === false ? '● Offline' : '○ N/A'}
                </span>
              </div>
              <div style={{ marginTop: 10, fontSize: '.68rem', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace" }}>
                ENV: {s.env}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title">ℹ️ Sobre as Integrações</div>
        <div style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.7 }}>
          As chaves de API são configuradas via variáveis de ambiente no Coolify. Para alterar uma chave, acesse o painel do Coolify → seu app → Environment Variables. Após alterar, faça um novo deploy para aplicar.
        </div>
      </div>
    </div>
  );
}
