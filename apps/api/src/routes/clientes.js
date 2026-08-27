/**
 * clientes.js — a aba Clientes é o HISTÓRICO DE QUEM FALOU COM A GENTE.
 *
 * Não é um CRUD e não é espelho de cadastro: o cadastro do assinante é do SGP.
 * Aqui mora a pergunta que só nós sabemos responder — "este número já falou
 * com a gente? quantas vezes? e nós já sabemos quem é?".
 *
 * A rota antiga fazia outra coisa: buscava CPF ao vivo no SGP e, sem `q`,
 * caía num `groupBy(['id', ...])` que — por incluir o `id` — não agrupava
 * nada: cinco conversas do mesmo cliente viravam cinco "clientes" na lista.
 * A busca ao vivo saiu de propósito: consultar o ERP por CPF arbitrário é o
 * que o Cliente 360 faz DENTRO de uma conversa, com `contratosPermitidos`
 * limitando o contrato. Um segundo caminho até o SGP sem essa allowlist é
 * exatamente a "integração paralela" que a FASE 6 proibiu.
 *
 * A agregação mora na view `clientes_contato` (migration 028).
 */
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';
import { mascararPII, redigirTexto } from '../services/mascarar.js';
import { pode } from '../services/permissoes.js';
import { conversaVisivel } from '../services/filasHelpers.js';
import { filasDoAgente } from '../services/filaService.js';
import { ehUuid } from '../services/estadoStore.js';
import { auditar, ipDe } from '../services/auditoria.js';
import { termosBusca, estaIdentificado } from '../services/clientesHelpers.js';

export const clientesRouter = Router();
clientesRouter.use(authMiddleware);

/** Só os dígitos dos dois lados: o agente cola CPF pontuado, o SGP grava cru. */
const SO_DIGITOS = (col) => `regexp_replace(COALESCE(${col},''), '\\D', '', 'g')`;

/**
 * A view expõe `chave`, que é o TELEFONE CRU quando existe. Ele nunca sai no
 * payload: devolvê-lo como identificador entregaria, na chave da lista, o
 * mesmo dado que o `mascararTelefone` acabou de esconder uma coluna ao lado.
 * O identificador exposto é `ultima_conversa_id` (uuid) — que também é o que
 * o Cliente 360 já sabe receber.
 */
function paraFora(linha, revelar) {
  const { chave: _chave, ultima_conversa_id, ...resto } = linha;
  return {
    ...mascararPII(resto, { revelar }),
    id: ultima_conversa_id,
    identificado: estaIdentificado(linha),
    mascarado: !revelar,
  };
}

// GET /api/clientes?q=&limit=&offset=
clientesRouter.get('/', asyncHandler(async (req, res) => {
  if (!pode(req.agente, 'cliente360')) throw new HttpError(403, 'Sem permissão para ver clientes');

  const db = getDb();
  const { texto, digitos } = termosBusca(req.query.q);
  const limit  = Math.min(Number(req.query.limit) || 30, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  let q = db('clientes_contato');
  if (texto || digitos) {
    q = q.where(w => {
      if (texto) w.orWhereRaw("nome ILIKE '%' || ? || '%' ESCAPE '\\'", [texto]);
      if (digitos) {
        w.orWhereRaw(`${SO_DIGITOS('telefone')} LIKE '%' || ? || '%'`, [digitos])
         .orWhereRaw(`${SO_DIGITOS('cpf')} LIKE '%' || ? || '%'`, [digitos])
         .orWhereRaw("COALESCE(contrato_id,'') = ?", [digitos]);
      }
    });
  }

  const linhas = await q.orderBy('ultimo_contato', 'desc').limit(limit).offset(offset);
  const revelar = pode(req.agente, 'ver_dados_completos');
  res.json(linhas.map(l => paraFora(l, revelar)));
}));

/**
 * GET /api/clientes/:conversaId — o contato e sua linha do tempo.
 *
 * Recebe o uuid de UMA conversa e resolve o grupo NO SERVIDOR. O cliente
 * nunca manda a chave de agrupamento porque a chave é o telefone: aceitá-la
 * como parâmetro deixaria qualquer agente listar o histórico de um número
 * arbitrário digitando-o na URL.
 */
clientesRouter.get('/:conversaId', asyncHandler(async (req, res) => {
  if (!pode(req.agente, 'cliente360')) throw new HttpError(403, 'Sem permissão para ver clientes');

  const db = getDb();
  // `ehUuid` ANTES da query, não `.catch(() => null)` depois: o catch cego
  // transformava banco fora do ar, pool esgotado e view ausente em "Contato
  // não encontrado" — o agente conclui que o registro sumiu quando o sistema é
  // que está de fora. É "não sei" virando "não tem", a assinatura de defeito
  // desta casa, e ainda dava diagnósticos contraditórios (a lista dá 500, o
  // detalhe dava 404) para a mesma causa.
  if (!ehUuid(req.params.conversaId)) throw new HttpError(404, 'Contato não encontrado');
  const ref = await db('conversas').select('id', 'telefone').where({ id: req.params.conversaId }).first();
  if (!ref) throw new HttpError(404, 'Contato não encontrado');

  const chave = ref.telefone || ref.id;
  const cliente = await db('clientes_contato').where({ chave }).first();
  if (!cliente) throw new HttpError(404, 'Contato não encontrado');

  const brutas = await db('conversas as c')
    .leftJoin('agentes as a', 'a.id', 'c.agente_id')
    .select('c.id', 'c.protocolo', 'c.canal', 'c.status', 'c.criado_em',
            'c.encerrada_em', 'c.ultima_mensagem', 'c.fila_id', 'a.nome as agente')
    .whereRaw('COALESCE(c.telefone, c.id::text) = ?', [chave])
    .orderBy('c.criado_em', 'desc')
    .limit(20);

  // A linha do tempo respeita a fila, como a lista do Chat (`chat.js`): sem
  // isso a aba Clientes seria porta lateral para o que a FASE 5 restringiu.
  const escopo = { role: req.agente.role, filaIds: await filasDoAgente(req.agente.id) };
  const conversas = brutas
    .filter(c => conversaVisivel(c, escopo))
    .map(({ fila_id: _f, ultima_mensagem, ...c }) => ({
      ...c,
      // ⚠️ `ultima_mensagem` é a FALA CRUA do cliente (`mensagemRepository`
      // guarda `texto.slice(0,120)`, inbound incluído). "Meu CPF é
      // 111.444.777-35" apareceria por extenso duas linhas abaixo do mesmo CPF
      // mascarado — `mascararPII` é por campo e não alcança texto livre.
      // `redigirTexto` existe exatamente para esse caso (FASE 13, §136).
      ultima_mensagem: redigirTexto(ultima_mensagem),
    }));

  const revelar = pode(req.agente, 'ver_dados_completos');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'cliente_contato_consultado',
            resource: ref.id, ip: ipDe(req) });
  res.json({ cliente: paraFora(cliente, revelar), conversas });
}));
