import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }        from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const coberturaRouter = Router();

// Rota pública: verificar cobertura por lat/lng
coberturaRouter.get('/check', asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) throw new HttpError(400, 'lat e lng obrigatórios');

  const db    = getDb();
  const zonas = await db('zonas_cobertura').where({ tipo: 'cobertura' }).select('id','nome','geojson');

  const { pointInPolygon } = await import('../services/geoUtils.js');
  const ponto = { lat: parseFloat(lat), lng: parseFloat(lng) };

  const cobertas = zonas.filter(z => {
    try {
      const geojson = typeof z.geojson === 'string' ? JSON.parse(z.geojson) : z.geojson;
      return pointInPolygon(ponto, geojson);
    } catch { return false; }
  });

  res.json({
    tem_cobertura: cobertas.length > 0,
    zonas: cobertas.map(z => ({ id: z.id, nome: z.nome })),
  });
}));

// Rotas autenticadas
coberturaRouter.use(authMiddleware);

// GET /api/cobertura/zonas
coberturaRouter.get('/zonas', asyncHandler(async (req, res) => {
  const db    = getDb();
  const zonas = await db('zonas_cobertura').orderBy('nome');
  res.json({ zonas });
}));

// POST /api/cobertura/zonas — admin only
coberturaRouter.post('/zonas', adminMiddleware, asyncHandler(async (req, res) => {
  const { nome, tipo = 'cobertura', geojson } = req.body;
  if (!nome || !geojson) throw new HttpError(400, 'nome e geojson obrigatórios');

  const db = getDb();
  const [zona] = await db('zonas_cobertura')
    .insert({ nome, tipo, geojson: JSON.stringify(geojson) })
    .returning('*');
  res.status(201).json(zona);
}));

// PUT /api/cobertura/zonas/:id — admin only
coberturaRouter.put('/zonas/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const { nome, tipo, geojson } = req.body;
  const db   = getDb();
  const patch = {};
  if (nome)    patch.nome    = nome;
  if (tipo)    patch.tipo    = tipo;
  if (geojson) patch.geojson = JSON.stringify(geojson);

  const [zona] = await db('zonas_cobertura')
    .where({ id: req.params.id })
    .update(patch)
    .returning('*');
  if (!zona) throw new HttpError(404, 'Zona não encontrada');
  res.json(zona);
}));

// DELETE /api/cobertura/zonas/:id — admin only
coberturaRouter.delete('/zonas/:id', adminMiddleware, asyncHandler(async (req, res) => {
  await getDb()('zonas_cobertura').where({ id: req.params.id }).delete();
  res.json({ ok: true });
}));
