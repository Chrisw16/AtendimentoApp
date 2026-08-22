/**
 * mascarar.js — PII mascarada no SERVIDOR (dívida da FASE 3, §116).
 *
 * A regra que este arquivo existe para impor: **mascarar é não enviar**.
 * Esconder no CSS, no `<span>` ou num `slice()` do React deixa o CPF completo
 * viajar até o navegador, aparecer no DevTools, no cache do disco e em
 * qualquer print de tela — a tela mente, o payload não. Por isso a máscara é
 * aplicada na fronteira da API, e o dado inteiro só sai para quem tem
 * permissão explícita (`ver_dados_completos`).
 *
 * O que fica visível é sempre o SUFICIENTE para o agente conferir com o
 * cliente ao telefone ("termina em 7766?") e insuficiente para reconstruir o
 * documento.
 */

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

/**
 * CPF (11) → `***.456.789-**` · CNPJ (14) → `**.***.678/0001-**`
 *
 * Mantém o miolo, esconde início e fim: é o miolo que o atendente usa para
 * conferir, e são as pontas (os 3 primeiros e os 2 dígitos verificadores) que
 * mais ajudam quem quer adivinhar o resto.
 */
export function mascararCpf(valor) {
  const d = soDigitos(valor);
  if (!d) return '';
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.***.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
  // Comprimento inesperado: não tenta adivinhar formato, esconde tudo menos o fim.
  return d.length > 4 ? `${'*'.repeat(d.length - 4)}${d.slice(-4)}` : '*'.repeat(d.length);
}

/**
 * `5584999887766` → `(84) *****-7766`
 *
 * Os 4 últimos ficam porque é como o cliente se identifica; o DDD fica porque
 * é operacional (fuso, POP, região) e não identifica ninguém sozinho.
 */
export function mascararTelefone(valor) {
  const d = soDigitos(valor);
  if (!d) return '';
  const semPais = d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
  if (semPais.length < 6) return '*'.repeat(semPais.length);
  const ddd  = semPais.slice(0, 2);
  const fim  = semPais.slice(-4);
  const meio = '*'.repeat(Math.max(1, semPais.length - 6));
  return `(${ddd}) ${meio}-${fim}`;
}

/** `fulano.silva@provedor.com` → `fu****@provedor.com` */
export function mascararEmail(valor) {
  const v = String(valor ?? '').trim();
  const at = v.lastIndexOf('@');
  if (at < 1) return v ? '****' : '';
  const usuario = v.slice(0, at);
  const dominio = v.slice(at);
  const visivel = usuario.slice(0, Math.min(2, usuario.length - 1)) || usuario[0];
  return `${visivel}${'*'.repeat(Math.max(4, usuario.length - visivel.length))}${dominio}`;
}

/** Campo → função. Quem adicionar PII nova ao Cliente 360 registra aqui. */
const MASCARAS = {
  cpf:      mascararCpf,
  cpfcnpj:  mascararCpf,
  cpf_cnpj: mascararCpf,
  telefone: mascararTelefone,
  fone:     mascararTelefone,
  celular:  mascararTelefone,
  email:    mascararEmail,
};

/**
 * Devolve uma CÓPIA do objeto com os campos sensíveis mascarados.
 *
 * `revelar: true` devolve o objeto como veio — é o caminho de quem tem
 * `ver_dados_completos`, e quem chama é responsável por auditar o acesso.
 *
 * Não desce em arrays/objetos aninhados de propósito: mascarar recursivamente
 * um payload do SGP esconderia campos que ninguém revisou e daria uma falsa
 * sensação de cobertura. Chame de novo para cada nível que você conhece.
 */
export function mascararPII(obj, { revelar = false } = {}) {
  if (!obj || typeof obj !== 'object') return obj;
  if (revelar) return obj;
  const saida = { ...obj };
  for (const [campo, fn] of Object.entries(MASCARAS)) {
    if (saida[campo] != null && saida[campo] !== '') saida[campo] = fn(saida[campo]);
  }
  return saida;
}
