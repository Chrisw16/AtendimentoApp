/**
 * geoUtils.js — utilitários geoespaciais sem dependências externas
 * Algoritmo ray-casting para point-in-polygon
 */

/**
 * Verifica se um ponto está dentro de um polígono GeoJSON
 * @param {{ lat: number, lng: number }} ponto
 * @param {object} geojson — GeoJSON Feature ou Geometry (Polygon/MultiPolygon)
 */
export function pointInPolygon(ponto, geojson) {
  const geometry = geojson.geometry || geojson;
  const { lat, lng } = ponto;

  if (geometry.type === 'Polygon') {
    return _pointInRing(lat, lng, geometry.coordinates[0]);
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some(poly => _pointInRing(lat, lng, poly[0]));
  }

  if (geometry.type === 'FeatureCollection') {
    return geometry.features.some(f => pointInPolygon(ponto, f));
  }

  return false;
}

/**
 * Ray-casting — retorna true se [lat, lng] está dentro do anel de coordenadas
 * Coordenadas GeoJSON são [lng, lat]
 */
function _pointInRing(lat, lng, ring) {
  let inside = false;
  const n    = ring.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0]; const yi = ring[i][1];  // lng, lat
    const xj = ring[j][0]; const yj = ring[j][1];

    const intersect =
      ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Calcula distância em km entre dois pontos (Haversine)
 */
export function distanciaKm(lat1, lng1, lat2, lng2) {
  const R   = 6371;
  const dLat = _rad(lat2 - lat1);
  const dLng = _rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(_rad(lat1)) * Math.cos(_rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const _rad = (deg) => (deg * Math.PI) / 180;
