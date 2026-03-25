/**
 * reativacao.js — Sistema de reativação de usuários inativos
 * Configurável pelo painel admin
 * Funciona para todos os canais: Chatwoot, WhatsApp, Telegram, Widget
 */
import { query, kvGet, kvSet } from "./db.js";
import { logger } from "./logger.js";

// ── CONFIG PADRÃO ─────────────────────────────────────────────────────────────
const CONFIG_PADRAO = {
  ativo: false,
  intervalo_minutos: 30,        // Tempo de inatividade para disparar 1ª mensagem
  tentativas: [
    { minutos: 30,  mensagem: "Oi! 👋 Ainda estou por aqui. Posso te ajudar com mais alguma coisa?" },
    { minutos: 60,  mensagem: "Ainda precisa de ajuda? Estou disponível! 😊" },
    { minutos: 120, mensagem: "Vou encerrar nosso atendimento. Se precisar é só chamar! 👋" },
  ],
  mensagem_encerramento: "Atendimento encerrado por inatividade. Qualquer dúvida é só chamar! 😊",
  so_fora_horario: false,
  canais: ["chatwoot", "whatsapp", "telegram", "widget"],
  // ── Tempos de encerramento automático ──────────────────────────────────────
  reset_sessao_minutos: 30,     // Reseta estado da IA após N minutos sem resposta
  encerrar_conversa_horas: 24,  // Fecha conversa no chat interno após N horas parada
  encerrar_ativo: true,         // Ativa encerramento automático de conversas
};

// Cache em memória dos timers ativos
// convId → { timers: [timeout], tentativa: 0, canal, telefone, accountId }
const ativoMap = new Map();

// ── CONFIG ────────────────────────────────────────────────────────────────────
export async function getConfig() {
  try {
    const val = await kvGet("reativacao_config");
    if (val) return { ...CONFIG_PADRAO, ...JSON.parse(val) };
  } catch {}
  return { ...CONFIG_PADRAO };
}

export async function salvarConfig(cfg) {
  await kvSet("reativacao_config", JSON.stringify(cfg));
  logger.info("✅ Configuração de reativação salva");
  // Se desativou, cancela todos os timers pendentes
  if (!cfg.ativo) {
    const ids = [...ativoMap.keys()];
    ids.forEach(id => cancelarReativacao(id));
    if (ids.length) logger.info(`🔕 Reativação desativada — ${ids.length} timers cancelados`);
  }
}

// ── STATS ─────────────────────────────────────────────────────────────────────
export async function registrarEnvio(canal, tentativa, encerrou) {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const chave = `reativacao_stats_${hoje}`;
    const val = await kvGet(chave);
    const stats = val ? JSON.parse(val) : { envios: 0, encerramentos: 0, por_canal: {} };
    stats.envios++;
    if (encerrou) stats.encerramentos++;
    stats.por_canal[canal] = (stats.por_canal[canal] || 0) + 1;
    await kvSet(chave, JSON.stringify(stats));
  } catch {}
}

export async function getStats(dias = 7) {
  const result = [];
  for (let i = 0; i < dias; i++) {
    const d = new Date(Date.now() - i * 86400000);
    const hoje = d.toISOString().slice(0, 10);
    try {
      const val = await kvGet(`reativacao_stats_${hoje}`);
      result.push({ data: hoje, ...(val ? JSON.parse(val) : { envios: 0, encerramentos: 0, por_canal: {} }) });
    } catch {
      result.push({ data: hoje, envios: 0, encerramentos: 0, por_canal: {} });
    }
  }
  return result.reverse();
}

// ── GERENCIAR TIMERS ──────────────────────────────────────────────────────────
export function cancelarReativacao(convId) {
  const estado = ativoMap.get(String(convId));
  if (estado) {
    estado.timers.forEach(t => clearTimeout(t));
    ativoMap.delete(String(convId));
    logger.info(`🔕 Reativação cancelada: Conv ${convId}`);
  }
}

export async function iniciarReativacao({ convId, canal, telefone, accountId, enviarFn }) {
  cancelarReativacao(convId); // cancela timer anterior se existir

  const cfg = await getConfig();
  if (!cfg.ativo) return;
  if (!cfg.canais.includes(canal)) return;

  const tentativas = cfg.tentativas || [];
  if (!tentativas.length) return;

  const timers = [];
  const estado = { timers, tentativa: 0, canal, telefone, accountId };
  ativoMap.set(String(convId), estado);

  let acumulado = 0;

  tentativas.forEach((t, i) => {
    acumulado += (t.minutos || cfg.intervalo_minutos) * 60 * 1000;
    const isUltima = (i === tentativas.length - 1);

    const timer = setTimeout(async () => {
      // Verifica se ainda está no map (não foi cancelado por resposta)
      if (!ativoMap.has(String(convId))) return;

      try {
        const msg = isUltima ? (cfg.mensagem_encerramento || t.mensagem) : t.mensagem;
        await enviarFn(convId, canal, telefone, accountId, msg);
        await registrarEnvio(canal, i + 1, isUltima);
        logger.info(`📨 Reativação tentativa ${i+1}/${tentativas.length} | Conv ${convId} | Canal ${canal}`);

        if (isUltima) {
          ativoMap.delete(String(convId));
          // Reseta sessão → próxima mensagem do cliente recebe saudação nova
          try {
            const { salvarSessao, getSessao } = await import("./memoria.js");
            const sessAtual = await getSessao(telefone) || {};
            await salvarSessao(telefone, {
              ...sessAtual,
              _estado: "inicio",
              _cadastro: null,
              // Preserva protocolo — se cliente voltar logo, reutiliza a mesma sessão
              // _protocolo: null, ← NÃO zera — evita gerar novo protocolo desnecessário
              _contrato_ativo: null,
              _cliente: null,
              _lastActivity: null,
              _encerrado_inatividade: Date.now(), // marca quando foi encerrado
            });
          } catch(e) { /* silencioso */ }
          // Encerra no Chatwoot se tiver accountId
          if (accountId && canal === "chatwoot") {
            const { resolveConversation, addLabel } = await import("./chatwoot.js");
            await addLabel(accountId, convId, "encerrado-inatividade").catch(() => {});
            await resolveConversation(accountId, convId).catch(() => {});
          }
        }
      } catch (e) {
        logger.error(`❌ Reativação erro Conv ${convId}: ${e.message}`);
      }
    }, acumulado);

    timers.push(timer);
  });

  logger.info(`⏰ Reativação iniciada: Conv ${convId} | ${tentativas.length} tentativas | Canal ${canal}`);
}

// Status atual
export function listarAtivos() {
  const result = [];
  ativoMap.forEach((v, k) => result.push({ convId: k, canal: v.canal, tentativa: v.tentativa }));
  return result;
}
