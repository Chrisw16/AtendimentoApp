const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Transcreve áudio usando OpenAI Whisper.
 * Baixa o arquivo de áudio da URL e envia para a API.
 */
export async function transcreverAudio(audioUrl) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada");

  // Baixa o arquivo de áudio
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`Erro ao baixar áudio: ${audioRes.status}`);

  const audioBuffer = await audioRes.arrayBuffer();
  const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });

  // Monta multipart/form-data para Whisper
  const formData = new FormData();
  formData.append("file", audioBlob, "audio.ogg");
  formData.append("model", "whisper-1");
  formData.append("language", "pt"); // Força português para maior precisão

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });

  if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return data.text?.trim() || "";
}
