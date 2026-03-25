import React, { useEffect, useState, useCallback } from 'react';
import { apiJson, api } from '../api';
import { useStore } from '../store';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function Horario() {
  const [horarios, setHorarios] = useState({});
  const [sla, setSla] = useState({ alertaMinutos: 5, maxMinutos: 15 });
  const [slaAlertas, setSlaAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [foraConfig, setForaConfig] = useState({});
  const showToast = useStore(s => s.showToast);

  const load = useCallback(async () => {
    try {
      const [h, s, a] = await Promise.all([
        apiJson('/api/horarios').catch(() => ({})),
        apiJson('/api/sla').catch(() => ({ alertaMinutos: 5, maxMinutos: 15 })),
        apiJson('/api/sla/alertas').catch(() => []),
        apiJson('/api/horarios/fora').catch(() => ({})),
      ]);
      setHorarios(h || {}); setSla(s || {}); setSlaAlertas(Array.isArray(a) ? a : []);
      setForaConfig(f || {});
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const salvarHorarios = async () => {
    setSaving(true);
    try {
      await api('/api/horarios', { method: 'PUT', body: JSON.stringify(horarios) });
      showToast('✅ Horários salvos!');
    } catch (e) { showToast('Erro: ' + e.message, true); }
    setSaving(false);
  };
  const salvarForaConfig = async () => {
    setSaving(true);
    try {
      await api('/api/horarios/fora', { method: 'PUT', body: JSON.stringify(foraConfig) });
      showToast('✅ Configuração salva!');
    } catch (e) { showToast('Erro: ' + e.message, true); }
    setSaving(false);
  };

  const salvarSla = async () => {
    try {
      await api('/api/sla', { method: 'PUT', body: JSON.stringify(sla) });
      showToast('✅ SLA salvo!'); load();
    } catch (e) { showToast('Erro: ' + e.message, true); }
  };

  const now = new Date();
  const diaAtual = now.toLocaleDateString('en', { timeZone:'America/Fortaleza', weekday:'short' });
  const diaIdx = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(diaAtual);
  const horaAtual = parseInt(now.toLocaleTimeString('en', { timeZone:'America/Fortaleza', hour:'2-digit', minute:'2-digit', hour12:false }).replace(':',''));
  const cfgHoje = horarios[diaAtual] || {};
  const aberto = cfgHoje.ativo && cfgHoje.inicio && cfgHoje.fim && (() => {
    const [hi, mi] = (cfgHoje.inicio || '08:00').split(':').map(Number);
    const [hf, mf] = (cfgHoje.fim || '18:00').split(':').map(Number);
    return horaAtual >= hi * 60 + mi && horaAtual <= hf * 60 + mf;
  })();

  return (
    <div style={{ animation: 'fadeIn .35s ease' }}>
      <div className="page-head">
        <div><h1>🕐 Horário & SLA</h1><p>Configure horários de atendimento e tempo máximo de resposta</p></div>
        <span className={`badge ${aberto ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '.8rem', padding: '4px 12px' }}>{aberto ? '🟢 Aberto agora' : '🔴 Fechado'}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Horários */}
        <div className="card">
          <div className="card-title">📅 Horário de Funcionamento</div>
          {loading ? <span className="spinner spinner-lg" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DIAS.map((dia, i) => {
                const cfg = horarios[i] || { ativo: i >= 1 && i <= 5, inicio: '08:00', fim: '18:00' };
                const isHoje = i === diaAtual;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: isHoje ? 'rgba(0,200,150,.04)' : 'transparent', borderRadius: 8, border: isHoje ? '1px solid rgba(0,200,150,.15)' : '1px solid transparent' }}>
                    <input type="checkbox" checked={cfg.ativo !== false} onChange={e => setHorarios({ ...horarios, [i]: { ...cfg, ativo: e.target.checked } })} style={{ accentColor: 'var(--g1)', width: 16, height: 16 }} />
                    <span style={{ width: 70, fontWeight: isHoje ? 700 : 400, fontSize: '.82rem', color: cfg.ativo !== false ? 'var(--text)' : 'var(--dim)' }}>{dia}</span>
                    <input className="input" type="time" value={cfg.inicio || '08:00'} onChange={e => setHorarios({ ...horarios, [i]: { ...cfg, inicio: e.target.value } })} disabled={cfg.ativo === false} style={{ width: 100, padding: '4px 8px', fontSize: '.78rem', opacity: cfg.ativo === false ? .3 : 1 }} />
                    <span style={{ color: 'var(--dim)', fontSize: '.78rem' }}>até</span>
                    <input className="input" type="time" value={cfg.fim || '18:00'} onChange={e => setHorarios({ ...horarios, [i]: { ...cfg, fim: e.target.value } })} disabled={cfg.ativo === false} style={{ width: 100, padding: '4px 8px', fontSize: '.78rem', opacity: cfg.ativo === false ? .3 : 1 }} />
                    {isHoje && <span style={{ fontSize: '.65rem', color: 'var(--g1)', fontWeight: 700, marginLeft: 'auto' }}>← HOJE</span>}
                  </div>
                );
              })}
              <button className="btn btn-primary btn-sm" onClick={salvarHorarios} disabled={saving} style={{ marginTop: 8, alignSelf: 'flex-start' }}>{saving ? 'Salvando...' : '💾 Salvar Horários'}</button>
            </div>
          )}
        </div>

        {/* SLA */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">⏱️ SLA — Tempo de Resposta</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Alerta após (min)</label>
                <input className="input" type="number" min={1} value={sla.alertaMinutos || 5} onChange={e => setSla({ ...sla, alertaMinutos: parseInt(e.target.value) || 5 })} />
              </div>
              <div><label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Máximo (min)</label>
                <input className="input" type="number" min={1} value={sla.maxMinutos || 15} onChange={e => setSla({ ...sla, maxMinutos: parseInt(e.target.value) || 15 })} />
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={salvarSla}>💾 Salvar SLA</button>
          </div>

          <div className="card">
            <div className="card-title">🚨 Conversas Fora do SLA ({slaAlertas.length})</div>
            {slaAlertas.length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--g1)' }}>✅ Todas dentro do SLA</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{slaAlertas.slice(0, 10).map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(255,71,87,.04)', border: '1px solid rgba(255,71,87,.12)', borderRadius: 6, fontSize: '.78rem' }}>
                  <span>{c.nome || c.telefone || c.id}</span>
                  <span style={{ color: 'var(--red)', fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{c.minutos_aguardando || '?'}min</span>
                </div>
              ))}</div>
            )}
          </div>
        </div>
      </div>
      {/* Fora do horário */}
      <div className="card" style={{ marginTop: 0 }}>
        <div className="card-title">🌙 Comportamento fora do horário</div>
        <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
          Quando o cliente pedir para falar com humano fora do horário, a IA pergunta o assunto e tenta resolver.
          Se não conseguir, abre um chamado automaticamente.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Mensagem inicial fora do horário
            </label>
            <textarea className="input" rows={3} style={{ resize: 'vertical', fontSize: '.78rem' }}
              value={foraConfig.msg_fora || 'Nosso atendimento humano funciona de Seg-Sex, das 08h às 18h. Mas posso te ajudar agora! 😊 Qual é o seu assunto?'}
              onChange={e => setForaConfig({ ...foraConfig, msg_fora: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Mensagem ao abrir chamado fora do horário
            </label>
            <textarea className="input" rows={3} style={{ resize: 'vertical', fontSize: '.78rem' }}
              value={foraConfig.msg_chamado || 'Registrei sua solicitação! 📋 Nossa equipe irá te atender assim que o expediente começar. Protocolo: *{protocolo}*'}
              onChange={e => setForaConfig({ ...foraConfig, msg_chamado: e.target.value })} />
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={foraConfig.ia_continua !== false}
              onChange={e => setForaConfig({ ...foraConfig, ia_continua: e.target.checked })}
              style={{ accentColor: 'var(--g1)', width: 16, height: 16 }} />
            IA continua atendendo fora do horário (self-service)
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!foraConfig.abrir_chamado}
              onChange={e => setForaConfig({ ...foraConfig, abrir_chamado: e.target.checked })}
              style={{ accentColor: 'var(--g1)', width: 16, height: 16 }} />
            Abrir chamado automaticamente se não conseguir resolver
          </label>
        </div>

        <button className="btn btn-primary btn-sm" onClick={salvarForaConfig} disabled={saving} style={{ marginTop: 14 }}>
          💾 Salvar configuração
        </button>
      </div>
    </div>
  );
}
