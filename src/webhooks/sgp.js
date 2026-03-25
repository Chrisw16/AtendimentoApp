/**
 * sgp.js — Webhook receiver do SGP (Gateway Genérica)
 * O SGP envia POST para /webhook/sgp quando:
 *   - cadastrar: novo contrato/serviço criado
 *   - atualizar: dados alterados
 *   - alterar_plano: mudança de plano
 *   - alterar_status: contrato ativo/suspenso/cancelado
 */
import { logger } from "../services/logger.js";
import { query }  from "../services/db.js";
import { broadcast } from "../services/chatInterno.js";

// Chave secreta opcional - configure no SGP no campo "body": {"sgp_secret": "..."}
const SGP_SECRET = process.env.SGP_WEBHOOK_SECRET || "";

export async function handleSgpWebhook(req, res) {
  try {
    const body = req.body;
    if (!body || !body.acao) {
      return res.status(400).json({ error: "acao obrigatoria" });
    }

    // Valida secret se configurado
    if (SGP_SECRET && body.sgp_secret !== SGP_SECRET) {
      logger.warn("⚠️ SGP Webhook: secret inválido");
      return res.status(403).json({ error: "Unauthorized" });
    }

    const acao     = body.acao;       // cadastrar | atualizar | alterar_plano | alterar_status
    const cliente  = body.cliente  || {};
    const contrato = body.contrato || {};
    const servico  = body.servico  || {};

    const cpf       = cliente.cpfcnpj || "";
    const nome      = cliente.nome    || "";
    const contratoId= contrato.id     || servico.id || "";
    const status    = (servico.status || "").toUpperCase(); // ATIVO | INATIVO | SUSPENSO | CANCELADO

    logger.info(`📡 SGP Webhook: acao=${acao} | status=${status} | cpf=${cpf} | contrato=${contratoId}`);

    // ── 1. ALTERAR_STATUS: contrato ativado → fecha lead automático ───────────
    if (acao === "alterar_status" && status === "ATIVO") {
      // Fecha lead local se existir
      const r = await query(
        `UPDATE leads SET status='instalado', atualizado=NOW(), obs=CONCAT(COALESCE(obs,''), ' | Ativado via SGP em ' || NOW()::date) 
         WHERE cpf=$1 AND status='aberto' RETURNING id, nome`,
        [cpf.replace(/\D/g, "")]
      );
      if (r.rows.length > 0) {
        logger.info(`✅ Lead fechado automaticamente: ${r.rows[0].nome} (cpf: ${cpf})`);
        broadcast("lead_instalado", { cpf, nome: r.rows[0].nome, contratoId });
      }
    }

    // ── 2. CADASTRAR: novo contrato → registra lead se vier como inativo ─────
    if (acao === "cadastrar" && status !== "ATIVO") {
      // Verifica se já existe lead para este CPF
      const existe = await query(`SELECT id FROM leads WHERE cpf=$1 AND status='aberto'`, [cpf.replace(/\D/g, "")]);
      if (existe.rows.length === 0 && cpf && nome) {
        const telefones = cliente.contatos?.celulares?.[0] || cliente.contatos?.telefones?.[0] || "";
        const email     = cliente.contatos?.emails?.[0] || "";
        const cidade    = contrato.endereco?.cidade || "";
        await query(
          `INSERT INTO leads(nome,cpf,telefone,email,cidade,contrato_id,canal,obs) VALUES($1,$2,$3,$4,$5,$6,'sgp',$7)`,
          [nome, cpf.replace(/\D/g,""), telefones, email, cidade, String(contratoId), `Pré-cadastro SGP - contrato ${contratoId}`]
        );
        logger.info(`📋 Lead registrado via SGP: ${nome}`);
        broadcast("novo_lead", { cpf, nome, contratoId });
      }
    }

    // ── 3. ALTERAR_STATUS: suspenso/cancelado → atualiza obs no lead ─────────
    if (acao === "alterar_status" && (status === "SUSPENSO" || status === "CANCELADO")) {
      await query(
        `UPDATE leads SET obs=CONCAT(COALESCE(obs,''), ' | Status SGP: ' || $2 || ' em ' || NOW()::date) WHERE cpf=$1 AND status='aberto'`,
        [cpf.replace(/\D/g,""), status]
      ).catch(() => {});
    }

    // Sempre retorna 200 para o SGP não ficar reenviando
    res.status(200).json({ ok: true, acao, processado: true });

  } catch (e) {
    logger.error(`❌ SGP Webhook erro: ${e.message}`);
    // Retorna 200 mesmo em erro para evitar retry loop do SGP
    res.status(200).json({ ok: false, error: e.message });
  }
}
