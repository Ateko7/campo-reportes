import express from 'express';
import {
  listReportes, stats, getReporte, listTiposAccion,
  reporteAplicaciones, reporteCosechas, reporteCantidadesCosechadas,
} from '../db.js';
import { procesarMensaje, construirRespuesta } from './whatsapp.js';

const router = express.Router();

function parseFiltros(q) {
  return {
    tipo: q.tipo || null, lote: q.lote || null, cultivo: q.cultivo || null,
    desde: q.desde || null, hasta: q.hasta || null, q: q.q || null,
    limit: Math.min(parseInt(q.limit || '500', 10), 2000),
  };
}
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Error interno' }); });

router.get('/reportes', wrap(async (req, res) => res.json(await listReportes(req.empresaId, parseFiltros(req.query)))));
router.get('/reportes/:id', wrap(async (req, res) => {
  const r = await getReporte(req.empresaId, req.params.id);
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  res.json(r);
}));
router.get('/stats', wrap(async (req, res) => res.json(await stats(req.empresaId))));
router.get('/acciones', wrap(async (req, res) => res.json(await listTiposAccion(req.empresaId, true))));

router.post('/simular', wrap(async (req, res) => {
  const { body, from, fromName, lat, lng, mediaUrl } = req.body || {};
  if (!body) return res.status(400).json({ error: 'Falta "body" (el texto del mensaje).' });
  const { parsed, reporte } = await procesarMensaje({ empresaId: req.empresaId, body, from, fromName, mediaUrl, lat, lng });
  res.json({ ok: true, respuesta_whatsapp: await construirRespuesta(req.empresaId, parsed), parsed, reporte });
}));

router.get('/reportes-aplicaciones', wrap(async (req, res) => res.json(await reporteAplicaciones(req.empresaId, parseFiltros(req.query)))));
router.get('/reportes-cosechas', wrap(async (req, res) => res.json(await reporteCosechas(req.empresaId, parseFiltros(req.query)))));
router.get('/reportes-cantidades', wrap(async (req, res) => res.json(await reporteCantidadesCosechadas(req.empresaId))));

export default router;
