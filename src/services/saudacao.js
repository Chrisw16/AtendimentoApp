/**
 * saudacao.js — Saudação personalizada por horário + datas comemorativas
 * Portado do n8n Code node
 */
import { dataHoraBrasilia } from "./protocolo.js";

// Feriados Móveis (Páscoa, Dia das Mães, Dia dos Pais)
const FERIADOS_MOVEIS = {
  '2025-04-20': "Feliz Páscoa! 🐰",
  '2025-05-11': "Feliz Dia das Mães! 💐",
  '2025-08-10': "Feliz Dia dos Pais! 👨‍👦",
  '2026-04-05': "Feliz Páscoa! 🐰",
  '2026-05-10': "Feliz Dia das Mães! 💐",
  '2026-08-09': "Feliz Dia dos Pais! 👨‍👦",
  '2027-03-28': "Feliz Páscoa! 🐰",
  '2027-05-09': "Feliz Dia das Mães! 💐",
  '2027-08-08': "Feliz Dia dos Pais! 👨‍👦",
};

// Feriados Fixos — formato 'MM/DD'
const FERIADOS_FIXOS = {
  '03/15': "Feliz Dia do Consumidor! 🛍️",
  '09/15': "Feliz Dia do Cliente! 💙",
  '03/16': "Hoje é aniversário da CITmax! 🎂🎉",
  '03/08': "Feliz Dia Internacional da Mulher! 🌹",
  '06/12': "Feliz Dia dos Namorados! ❤️",
  '06/24': "Feliz São João! 🔥🌽",
  '07/20': "Feliz Dia do Amigo! 🤝",
  '07/26': "Feliz Dia dos Avós! 👵👴",
  '04/21': "Bom feriado de Tiradentes! 🇧🇷",
  '05/01': "Feliz Dia do Trabalhador! 👷",
  '09/07': "Feliz Dia da Independência! 🇧🇷",
  '11/02': "Bom feriado de Finados 🕊️",
  '11/15': "Feliz Proclamação da República! 🇧🇷",
  '11/20': "Feliz Dia da Consciência Negra! ✊🏿",
  '12/24': "Feliz Véspera de Natal! 🎄",
  '12/25': "Feliz Natal! 🎅🎄",
  '12/31': "Feliz Réveillon! 🎆",
  '01/01': "Feliz Ano Novo! 🎉",
  '10/31': "Feliz Halloween! 🎃",
  '10/12': "Feliz Dia das Crianças! 👶🎈",
};

// Carnaval por ano
function isCarnaval(d, m, y) {
  const f = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  if (y === 2025 && f >= '2025-03-01' && f <= '2025-03-05') return true;
  if (y === 2026 && f >= '2026-02-14' && f <= '2026-02-18') return true;
  if (y === 2027 && f >= '2027-02-06' && f <= '2027-02-10') return true;
  return false;
}

/**
 * Gera saudação personalizada
 * @returns {string} ex: "Bom dia! 🌞 Feliz Natal! 🎅🎄"
 */
export function gerarSaudacao() {
  const { dia, mes, ano, horaNum } = dataHoraBrasilia();
  const diaStr = String(dia).padStart(2, '0');
  const mesStr = String(mes).padStart(2, '0');
  const dataISO = `${ano}-${mesStr}-${diaStr}`;
  const dataMD = `${mesStr}/${diaStr}`;

  // Saudação por horário
  let saudacao;
  if (horaNum >= 5 && horaNum < 12) saudacao = "Bom dia! 🌞";
  else if (horaNum >= 12 && horaNum < 18) saudacao = "Boa tarde! 🌤️";
  else if (horaNum >= 18 && horaNum <= 23) saudacao = "Boa noite! 🌙";
  else saudacao = "Boa madrugada! 🌙🦉";

  // Data comemorativa (adiciona à saudação)
  let comemorativa = null;
  if (FERIADOS_MOVEIS[dataISO]) comemorativa = FERIADOS_MOVEIS[dataISO];
  else if (FERIADOS_FIXOS[dataMD]) comemorativa = FERIADOS_FIXOS[dataMD];
  else if (isCarnaval(dia, mes, ano)) comemorativa = "Feliz Carnaval! 🎊";

  if (comemorativa) return `${comemorativa} Sou a Maxxi da CITmax 😊`;
  return saudacao;
}
