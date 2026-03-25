import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MAX_PDF_PAGES = 3;

/**
 * Baixa arquivo de uma URL e retorna como base64
 */
async function downloadToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ao baixar arquivo: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

/**
 * Analisa imagem usando Claude Vision (Haiku — barato)
 */
export async function analisarImagem(imageUrl, mimeType = "image/jpeg") {
  // Normaliza mime type
  if (imageUrl.endsWith(".png")) mimeType = "image/png";
  else if (imageUrl.endsWith(".webp")) mimeType = "image/webp";
  else if (imageUrl.endsWith(".gif")) mimeType = "image/gif";

  const base64 = await downloadToBase64(imageUrl);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mimeType, data: base64 }
        },
        {
          type: "text",
          text: `Analise esta imagem brevemente (máximo 3 frases). Foque em:
- Se for comprovante de pagamento: valor, data, destinatário, tipo (Pix/TED/boleto)
- Se for print de erro/tela: descreva o problema visível
- Se for foto de equipamento (roteador, cabo): descreva o estado
- Se for documento: tipo e informações principais
- Se não for relevante para suporte de internet: diga apenas "Imagem não relacionada ao suporte"
Responda em português, de forma direta.`
        }
      ]
    }]
  });

  return response.content[0]?.text?.trim() || "Não foi possível analisar a imagem.";
}

/**
 * Analisa PDF usando Claude (máximo MAX_PDF_PAGES páginas)
 */
export async function analisarPDF(pdfUrl) {
  const base64 = await downloadToBase64(pdfUrl);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [{
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 }
        },
        {
          type: "text",
          text: `Analise este documento brevemente (máximo 4 frases). Foque em:
- Tipo do documento (contrato, boleto, comprovante, protocolo, etc.)
- Informações principais (valores, datas, partes envolvidas)
- Se for boleto: valor e vencimento
- Se for comprovante: valor, data, destinatário
Responda em português, de forma direta e objetiva.`
        }
      ]
    }]
  });

  return response.content[0]?.text?.trim() || "Não foi possível analisar o documento.";
}
