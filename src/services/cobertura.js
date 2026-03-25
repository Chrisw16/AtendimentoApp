/**
 * cobertura.js — Serviço de cobertura geográfica
 * - Point-in-polygon (ray-casting, sem PostGIS)
 * - Geocodificação via Nominatim OSM (gratuito, sem chave)
 * - CEP via ViaCEP + BrasilAPI (fallback)
 * - Reverse geocoding (GPS → endereço)
 */
import { query } from "./db.js";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const UA = "CITmax-Maxxi/1.0 (contato@citmax.com.br)";

// ── Cache simples em memória (evita hammering no Nominatim) ──────────────────
const geoCache = new Map();
function cacheGet(k) { const v = geoCache.get(k); if (v && Date.now() - v.ts < 86400000) return v.data; return null; }
function cacheSet(k, d) { geoCache.set(k, { data: d, ts: Date.now() }); if (geoCache.size > 500) geoCache.delete(geoCache.keys().next().value); }

// ── Rate limiter Nominatim (máx 1 req/s conforme ToS) ────────────────────────
let _lastNominatim = 0;
async function nominatimFetch(url) {
  const wait = 1100 - (Date.now() - _lastNominatim);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastNominatim = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOUNDING BOX das cidades atendidas pela CITmax
// Usado para filtrar resultados do Nominatim e evitar falsos negativos
// ═══════════════════════════════════════════════════════════════════════════════

// Bounding box ampla cobrindo Natal, Macaíba, São Gonçalo, SMG e arredores
// minLng, minLat, maxLng, maxLat
const BBOX_CITMAX = {
  minLat: -6.2,  maxLat: -4.8,   // Sul → Norte (cobre SMG até norte de Natal)
  minLng: -35.8, maxLng: -35.0,  // Oeste → Leste
};

// Cidades principais atendidas (para sufixo automático)
const CIDADES_CITMAX = ["Natal", "Macaíba", "São Gonçalo do Amarante", "São Miguel do Gostoso"];

// Viewbox para o Nominatim no formato: min_lon,max_lat,max_lon,min_lat
const NOMINATIM_VIEWBOX = `${BBOX_CITMAX.minLng},${BBOX_CITMAX.maxLat},${BBOX_CITMAX.maxLng},${BBOX_CITMAX.minLat}`;

/** Verifica se um ponto lat/lng está dentro da área de cobertura potencial da CITmax */
function dentroDaAreaRN(lat, lng) {
  return lat >= BBOX_CITMAX.minLat && lat <= BBOX_CITMAX.maxLat &&
         lng >= BBOX_CITMAX.minLng && lng <= BBOX_CITMAX.maxLng;
}

/** Enriquece a query com contexto geográfico de Natal/RN se não tiver cidade/UF */
function enriquecerQuery(endereco) {
  const e = endereco.trim();
  // Já tem cidade conhecida ou UF → não mexe
  if (/(natal|macaíba|macaiba|são gonçalo|gostoso|parnamirim|mossoró|fortaleza|recife|são paulo|rio de janeiro)/i.test(e)) return e;
  if (/(RN|CE|PE|PB|PI|MA|BA|SP|RJ|MG|GO|DF)/.test(e)) return e;
  if (/brasil/i.test(e)) return e;
  // Adiciona contexto de Natal/RN
  return `${e}, Natal, RN, Brasil`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. GEOCODIFICAÇÃO — endereço → lat/lng
// ═══════════════════════════════════════════════════════════════════════════════
export async function geocodificarEndereco(endereco) {
  const key = `geo:${endereco.toLowerCase().trim()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  // Enriquece com contexto geográfico de Natal/RN
  const q = enriquecerQuery(endereco);

  // Passa viewbox para o Nominatim priorizar resultados na área RN
  // bounded=0 = prefere mas não exclui; limit=8 para ter opções para filtrar
  const url = `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=json&limit=8&countrycodes=br&addressdetails=1&viewbox=${NOMINATIM_VIEWBOX}&bounded=0`;

  try {
    const data = await nominatimFetch(url);
    if (!data?.length) return null;

    const results = data.map(r => ({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      endereco: r.display_name,
      cidade: r.address?.city || r.address?.town || r.address?.municipality || "",
      bairro: r.address?.suburb || r.address?.neighbourhood || "",
      cep: r.address?.postcode || "",
      _dentroRN: dentroDaAreaRN(parseFloat(r.lat), parseFloat(r.lon)),
    }));

    // Ordena: resultados dentro da área RN primeiro
    results.sort((a, b) => (b._dentroRN ? 1 : 0) - (a._dentroRN ? 1 : 0));

    // Se tiver resultados dentro da área, filtra só eles (evita retornar Pitimbu, SP etc)
    const dentroRN = results.filter(r => r._dentroRN);
    const final = dentroRN.length > 0 ? dentroRN : results;

    // Limita a 5 e remove campo interno
    const clean = final.slice(0, 5).map(({ _dentroRN, ...r }) => r);

    cacheSet(key, clean);
    return clean;
  } catch (e) {
    console.warn("⚠️ Nominatim geocode:", e.message);
    return null;
  }
}

/** Exporta helpers para uso em outros módulos */
export { dentroDaAreaRN, enriquecerQuery };

// ═══════════════════════════════════════════════════════════════════════════════
// 2. REVERSE GEOCODING — lat/lng → endereço
// ═══════════════════════════════════════════════════════════════════════════════
export async function reverseGeocode(lat, lng) {
  const key = `rev:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const url = `${NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
  try {
    const data = await nominatimFetch(url);
    if (!data?.display_name) return null;

    const result = {
      lat, lng,
      endereco: data.display_name,
      logradouro: data.address?.road || data.address?.pedestrian || "",
      numero: data.address?.house_number || "",
      bairro: data.address?.suburb || data.address?.neighbourhood || "",
      cidade: data.address?.city || data.address?.town || data.address?.municipality || "",
      uf: data.address?.state_district || data.address?.state || "",
      cep: data.address?.postcode || "",
    };

    cacheSet(key, result);
    return result;
  } catch (e) {
    console.warn("⚠️ Nominatim reverse:", e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. CEP → endereço + lat/lng
// ═══════════════════════════════════════════════════════════════════════════════
export async function geocodificarCEP(cep) {
  const cepLimpo = cep.replace(/\D/g, "");
  if (cepLimpo.length !== 8) return null;

  const key = `cep:${cepLimpo}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  // Tenta ViaCEP primeiro
  let dados = null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    const j = await r.json();
    if (!j.erro) dados = j;
  } catch {}

  // Fallback BrasilAPI
  if (!dados) {
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cepLimpo}`);
      const j = await r.json();
      if (!j.message) {
        dados = {
          logradouro: j.street || "",
          bairro: j.neighborhood || "",
          localidade: j.city || "",
          uf: j.state || "",
          cep: cepLimpo,
        };
        if (j.location?.coordinates) {
          const result = {
            cep: cepLimpo,
            logradouro: dados.logradouro,
            bairro: dados.bairro,
            cidade: dados.localidade,
            uf: dados.uf,
            lat: j.location.coordinates.latitude,
            lng: j.location.coordinates.longitude,
            endereco: `${dados.logradouro}, ${dados.bairro}, ${dados.localidade} - ${dados.uf}`,
          };
          cacheSet(key, result);
          return result;
        }
      }
    } catch {}
  }

  if (!dados) return null;

  // Geocodifica o endereço retornado pelo CEP
  const endQuery = `${dados.logradouro}, ${dados.bairro}, ${dados.localidade}, ${dados.uf}, Brasil`;
  const coords = await geocodificarEndereco(endQuery);
  const melhor = coords?.[0] || null;

  const result = {
    cep: cepLimpo,
    logradouro: dados.logradouro || "",
    bairro: dados.bairro || "",
    cidade: dados.localidade || "",
    uf: dados.uf || "",
    lat: melhor?.lat || null,
    lng: melhor?.lng || null,
    endereco: `${dados.logradouro}, ${dados.bairro}, ${dados.localidade} - ${dados.uf}`,
  };

  cacheSet(key, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. POINT-IN-POLYGON — ray-casting algorithm
// ═══════════════════════════════════════════════════════════════════════════════

/** Verifica se ponto (lat, lng) está dentro de um polígono GeoJSON */
function pontoNoPoligono(lat, lng, polygon) {
  // GeoJSON usa [lng, lat] — inverso do padrão lat/lng
  const coords = polygon.type === "Polygon"
    ? polygon.coordinates[0]
    : polygon.type === "MultiPolygon"
      ? polygon.coordinates.flat(1).flat(0)
      : null;

  if (!coords) return false;

  // Se MultiPolygon, testa cada polígono
  if (polygon.type === "MultiPolygon") {
    return polygon.coordinates.some(poly =>
      pontoNoPoligonoCoords(lng, lat, poly[0])
    );
  }

  // Testa ponto exato + 4 pontos vizinhos com buffer de ~50m para bordas
  const buffer = 0.0005; // ~55 metros
  return pontoNoPoligonoCoords(lng, lat, coords) ||
    pontoNoPoligonoCoords(lng + buffer, lat, coords) ||
    pontoNoPoligonoCoords(lng - buffer, lat, coords) ||
    pontoNoPoligonoCoords(lng, lat + buffer, coords) ||
    pontoNoPoligonoCoords(lng, lat - buffer, coords);
}

function pontoNoPoligonoCoords(x, y, coords) {
  let dentro = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0], yi = coords[i][1];
    const xj = coords[j][0], yj = coords[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) {
      dentro = !dentro;
    }
  }
  return dentro;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CARREGAR ZONAS DO BANCO (cache 5 min)
// ═══════════════════════════════════════════════════════════════════════════════
let _zonasCache = null;
let _zonasCacheTs = 0;

export async function carregarZonas(forcar = false) {
  if (!forcar && _zonasCache && Date.now() - _zonasCacheTs < 300000) return _zonasCache;
  try {
    const r = await query(`
      SELECT z.*, c.nome as cidade_nome,
        COALESCE(
          json_agg(json_build_object('plano_id', zp.plano_id, 'nome', p.nome, 'velocidade', p.velocidade, 'unidade', p.unidade, 'valor', p.valor, 'sgp_id', p.sgp_id))
          FILTER (WHERE zp.plano_id IS NOT NULL), '[]'
        ) as planos
      FROM zonas_cobertura z
      LEFT JOIN cidades c ON c.id = z.cidade_id
      LEFT JOIN zona_planos zp ON zp.zona_id = z.id
      LEFT JOIN planos p ON p.id = zp.plano_id
      WHERE z.ativo = true
      GROUP BY z.id, c.nome
      ORDER BY z.id
    `);
    _zonasCache = r.rows;
    _zonasCacheTs = Date.now();
    return _zonasCache;
  } catch (e) {
    console.warn("⚠️ carregarZonas:", e.message);
    return _zonasCache || [];
  }
}

export function invalidarCacheZonas() {
  _zonasCache = null;
  _zonasCacheTs = 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. VERIFICAR COBERTURA — ponto nas zonas
// ═══════════════════════════════════════════════════════════════════════════════
export async function verificarCobertura(lat, lng) {
  if (!lat || !lng) return { cobertura: false, zona: null };

  const zonas = await carregarZonas();
  if (!zonas.length) return { cobertura: false, zona: null, semZonas: true };

  for (const zona of zonas) {
    let geojson = zona.geojson;
    if (typeof geojson === "string") { try { geojson = JSON.parse(geojson); } catch { continue; } }

    // Suporta Feature, FeatureCollection ou geometria direta
    const features = geojson?.type === "FeatureCollection"
      ? geojson.features
      : geojson?.type === "Feature"
        ? [geojson]
        : [{ type: "Feature", geometry: geojson }];

    for (const feat of features) {
      const geom = feat.geometry || feat;
      if (!geom?.type) continue;
      if (pontoNoPoligono(lat, lng, geom)) {
        return {
          cobertura: true,
          zona: { id: zona.id, nome: zona.nome, cor: zona.cor, descricao: zona.descricao, tipo: zona.tipo },
          cidade: zona.cidade_nome,
          cidade_id: zona.cidade_id,
          planos: Array.isArray(zona.planos) ? zona.planos.filter(p => p.plano_id) : [],
        };
      }
    }
  }

  // Sem cobertura — encontra a zona mais próxima para informar distância
  const maisperto = zonasMaisProxima(lat, lng, zonas);
  return { cobertura: false, zona: null, zonaMaisProxima: maisperto };
}

function zonaMaisProxima(lat, lng, zonas) {
  let menor = Infinity, resultado = null;
  for (const zona of zonas) {
    let geojson = zona.geojson;
    if (typeof geojson === "string") { try { geojson = JSON.parse(geojson); } catch { continue; } }
    const features = geojson?.type === "FeatureCollection" ? geojson.features : [geojson];
    for (const feat of features) {
      const coords = feat?.geometry?.coordinates || feat?.coordinates;
      if (!coords) continue;
      const flat = coords.flat(3);
      for (let i = 0; i < flat.length - 1; i += 2) {
        const dist = Math.sqrt(Math.pow(flat[i] - lng, 2) + Math.pow(flat[i+1] - lat, 2));
        if (dist < menor) { menor = dist; resultado = { nome: zona.nome, distanciaKm: Math.round(dist * 111) }; }
      }
    }
  }
  return resultado;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. NORMALIZAÇÃO DE ENDEREÇO VIA IA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Usa Claude Haiku para normalizar endereço digitado pelo cliente
 * Corrige: palavras grudadas, abreviações, erros de digitação
 * Rápido e barato (~50 tokens por chamada)
 */
export async function normalizarEnderecoIA(texto) {
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [{
        role: "user",
        content: `Normalize este endereço brasileiro para busca geográfica. `
          + `Corrija erros de digitação óbvios, separe palavras grudadas, padronize maiúsculas. `
          + `Se houver bairro ou cidade junto à rua sem espaço, separe-os com vírgula. `
          + `Retorne APENAS o endereço corrigido em uma linha, sem explicações.

Endereço: "${texto}"`,
      }],
    });
    const normalizado = res.content[0]?.text?.trim();
    if (normalizado && normalizado.length > 3 && normalizado !== texto) {
      return normalizado;
    }
    return texto;
  } catch {
    return texto; // falha silenciosa — usa texto original
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. FUNÇÕES ORQUESTRADORAS (usadas pelo bot)
// ═══════════════════════════════════════════════════════════════════════════════

export async function consultarPorLocalizacao(lat, lng, telefone = null) {
  const [resultado, endereco] = await Promise.all([
    verificarCobertura(lat, lng),
    reverseGeocode(lat, lng),
  ]);
  await _logConsulta({ telefone, lat, lng, endereco: endereco?.endereco, resultado });
  return { ...resultado, enderecoResolvido: endereco };
}

export async function consultarPorCEP(cep, telefone = null) {
  const dados = await geocodificarCEP(cep);
  if (!dados) return { erro: "CEP não encontrado", cobertura: false };
  if (!dados.lat || !dados.lng) return { erro: "Não foi possível obter coordenadas para este CEP", cobertura: false, dadosCEP: dados };

  const resultado = await verificarCobertura(dados.lat, dados.lng);
  await _logConsulta({ telefone, lat: dados.lat, lng: dados.lng, cep, endereco: dados.endereco, resultado });
  return { ...resultado, enderecoResolvido: dados };
}

export async function consultarPorEndereco(texto, telefone = null) {
  // Normaliza o endereço via IA antes de geocodificar
  let textoNorm = texto;
  const precisaNorm = /[a-z][A-Z]/.test(texto) // palavras grudadas ex: "AlfredoMesquita"
    || /[a-zA-Z]{15,}/.test(texto.replace(/\s/g,'')) // texto muito longo sem espaço
    || texto.split(' ').some(w => w.length > 12); // palavra muito longa
  if (precisaNorm) {
    textoNorm = await normalizarEnderecoIA(texto);
  }

  // Tenta com texto normalizado, fallback para original
  let sugestoes = await geocodificarEndereco(textoNorm);
  if (!sugestoes?.length && textoNorm !== texto) {
    sugestoes = await geocodificarEndereco(texto); // fallback original
  }

  if (!sugestoes?.length) {
    // Última tentativa: normaliza sempre com IA independente das heurísticas
    const textoIA = await normalizarEnderecoIA(texto);
    if (textoIA !== textoNorm) sugestoes = await geocodificarEndereco(textoIA);
  }

  if (!sugestoes?.length) {
    return { erro: "Endereço não encontrado. Tente informar o CEP para maior precisão.", cobertura: false, sugerirCEP: true,
      textoNormalizado: textoNorm !== texto ? textoNorm : null };
  }

  // Filtra sugestões dentro da área RN (já vêm ordenadas, mas garante)
  const dentroRN = sugestoes.filter(s => dentroDaAreaRN(s.lat, s.lng));
  const lista = dentroRN.length > 0 ? dentroRN : sugestoes;

  // Se o melhor resultado está fora da área e temos só resultados externos,
  // alerta mas não bloqueia — pode ser que a cobertura chegue lá
  const foraRN = dentroRN.length === 0 && sugestoes.length > 0;

  // Sempre pede confirmação do endereço encontrado — evita inviabilidade falsa
  if (lista.length === 1) {
    // Uma única sugestão — mostra para confirmar
    return {
      sugestoes: lista,
      precisaConfirmar: true,
      cobertura: false,
      ...(foraRN ? { avisoForaArea: true } : {}),
      textoNormalizado: textoNorm !== texto ? textoNorm : null,
    };
  }

  if (lista.length > 0) {
    // Múltiplas sugestões — mostra até 3 para o cliente escolher
    return {
      sugestoes: lista.slice(0, 3),
      precisaConfirmar: true,
      cobertura: false,
      textoNormalizado: textoNorm !== texto ? textoNorm : null,
    };
  }

  return { erro: "Endereço não encontrado na região atendida.", cobertura: false, sugerirCEP: true };
}

async function _logConsulta({ telefone, lat, lng, cep, endereco, resultado }) {
  try {
    await query(
      `INSERT INTO consultas_cobertura(telefone,lat,lng,cep,endereco,zona_id,resultado)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [telefone, lat, lng, cep || null, endereco || null,
       resultado?.zona?.id || null,
       resultado?.cobertura ? "com_cobertura" : "sem_cobertura"]
    );
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. IMPORTAR KMZ/KML → GeoJSON
// ═══════════════════════════════════════════════════════════════════════════════
export async function kmzParaGeoJSON(buffer) {
  // KMZ é um ZIP contendo doc.kml
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  const kmlFile = Object.keys(zip.files).find(n => n.endsWith(".kml"));
  if (!kmlFile) throw new Error("Nenhum arquivo .kml encontrado no KMZ");
  const kmlText = await zip.files[kmlFile].async("string");
  return kmlParaGeoJSON(kmlText);
}

export function kmlParaGeoJSON(kmlText) {
  // Parser KML simples — extrai Placemarks com Polygon/MultiPolygon
  const features = [];
  const placemarkRegex = /<Placemark[\s\S]*?<\/Placemark>/g;
  const nameRegex = /<name>([\s\S]*?)<\/name>/;
  const coordsRegex = /<coordinates>([\s\S]*?)<\/coordinates>/g;

  for (const pm of kmlText.matchAll(placemarkRegex)) {
    const pmStr = pm[0];
    const nome = (nameRegex.exec(pmStr)?.[1] || "Zona importada").trim();
    const allCoords = [];

    for (const coordMatch of pmStr.matchAll(coordsRegex)) {
      const coords = coordMatch[1].trim().split(/\s+/).map(c => {
        const [lng, lat] = c.split(",").map(Number);
        return [lng, lat];
      }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
      if (coords.length >= 3) allCoords.push(coords);
    }

    if (!allCoords.length) continue;

    features.push({
      type: "Feature",
      properties: { name: nome },
      geometry: allCoords.length === 1
        ? { type: "Polygon", coordinates: [allCoords[0]] }
        : { type: "MultiPolygon", coordinates: allCoords.map(c => [c]) },
    });
  }

  return { type: "FeatureCollection", features };
}

// ── Exportações de conveniência ───────────────────────────────────────────────
export { pontoNoPoligono };
