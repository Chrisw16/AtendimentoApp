const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB"; // Voz padrão (Adam)

/**
 * Converte texto em áudio usando ElevenLabs
 * Retorna buffer do arquivo de áudio em formato mp3
 */
export async function textToSpeech(text) {
  if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY não configurada");

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: 1.1, // Ligeiramente mais rápido para economizar caracteres no tempo
      },
    }),
  });

  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}
