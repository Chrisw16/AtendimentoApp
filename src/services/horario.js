/**
 * horario.js — Utilitários de horário com timezone Brasil (UTC-3)
 * Fortaleza/Natal não tem horário de verão — sempre UTC-3
 */

const TZ = process.env.TZ || "America/Fortaleza";

// Retorna data/hora atual no timezone correto
export function agora() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

// Retorna HH:MM no timezone correto
export function horaAtual() {
  return new Date().toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Retorna hora e minuto como números no timezone correto
export function horaMinuto() {
  const now = agora();
  return { hora: now.getHours(), minuto: now.getMinutes() };
}

// Retorna dia da semana (0=Dom, 6=Sab) no timezone correto
export function diaSemana() {
  return agora().getDay();
}

// Converte "HH:MM" para minutos do dia
export function paraMinutos(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return h * 60 + m;
}

// Retorna minutos do dia atual no timezone correto
export function minutosAgora() {
  const { hora, minuto } = horaMinuto();
  return hora * 60 + minuto;
}

// Verifica se está dentro de um horário HH:MM - HH:MM
export function dentroDoIntervalo(inicio, fim) {
  const atual = minutosAgora();
  return atual >= paraMinutos(inicio) && atual <= paraMinutos(fim);
}

// Início do dia no timezone correto (para queries de banco)
export function inicioDoDia() {
  const d = agora();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Formata timestamp para exibição em PT-BR
export function formatarHora(ts) {
  return new Date(ts).toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}
