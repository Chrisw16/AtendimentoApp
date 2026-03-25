/**
 * protocolo.js — Gera protocolo único CIT + timestamp com milissegundos
 * Formato: CIT20260318075430123
 */
export function gerarProtocolo() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const dt = new Date(utc + (3600000 * -3)); // Brasília UTC-3
  const pad = (n) => n.toString().padStart(2, '0');
  const padMs = (n) => n.toString().padStart(3, '0');
  const timestamp = `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}${pad(dt.getHours())}${pad(dt.getMinutes())}${pad(dt.getSeconds())}${padMs(dt.getMilliseconds())}`;
  return `CIT${timestamp}`;
}

export function dataHoraBrasilia() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const dt = new Date(utc + (3600000 * -3));
  const pad = (n) => n.toString().padStart(2, '0');
  return {
    data: `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`,
    hora: `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`,
    dia: dt.getDate(),
    mes: dt.getMonth() + 1,
    ano: dt.getFullYear(),
    horaNum: dt.getHours(),
  };
}
