import express from 'express';
import { requireRol, hashPassword } from '../auth.js';
import {
  listTiposAccion, upsertTipoAccion, eliminarTipoAccion,
  listCultivos, addCultivo, delCultivo,
  listLotes, addLote, delLote,
  listInsumos, addInsumo, delInsumo,
  actualizarEmpresa, listUsuarios, crearUsuario, getUsuarioPorEmail,
} from '../db.js';

const router = express.Router();
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Error interno' }); });

/* ---- Acciones reportables ---- */
router.get('/acciones', wrap(async (req, res) => res.json(await listTiposAccion(req.empresaId))));
router.post('/acciones', requireRol('admin'), wrap(async (req, res) => {
  const a = req.body || {};
  if (!a.clave || !a.nombre) return res.status(400).json({ error: 'Falta clave o nombre.' });
  a.clave = a.clave.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (a.activo === undefined) a.activo = true;
  res.json(await upsertTipoAccion(req.empresaId, a));
}));
router.delete('/acciones/:clave', requireRol('admin'), wrap(async (req, res) => {
  await eliminarTipoAccion(req.empresaId, req.params.clave); res.json({ ok: true });
}));

/* ---- Catálogos ---- */
router.get('/cultivos', wrap(async (req, res) => res.json(await listCultivos(req.empresaId))));
router.post('/cultivos', requireRol('admin'), wrap(async (req, res) => {
  if (!req.body?.nombre) return res.status(400).json({ error: 'Falta nombre.' });
  res.json(await addCultivo(req.empresaId, req.body.nombre));
}));
router.delete('/cultivos/:id', requireRol('admin'), wrap(async (req, res) => { await delCultivo(req.empresaId, req.params.id); res.json({ ok: true }); }));

router.get('/lotes', wrap(async (req, res) => res.json(await listLotes(req.empresaId))));
router.post('/lotes', requireRol('admin'), wrap(async (req, res) => {
  if (!req.body?.nombre) return res.status(400).json({ error: 'Falta nombre.' });
  res.json(await addLote(req.empresaId, req.body));
}));
router.delete('/lotes/:id', requireRol('admin'), wrap(async (req, res) => { await delLote(req.empresaId, req.params.id); res.json({ ok: true }); }));

router.get('/insumos', wrap(async (req, res) => res.json(await listInsumos(req.empresaId))));
router.post('/insumos', requireRol('admin'), wrap(async (req, res) => {
  if (!req.body?.nombre) return res.status(400).json({ error: 'Falta nombre.' });
  res.json(await addInsumo(req.empresaId, req.body));
}));
router.delete('/insumos/:id', requireRol('admin'), wrap(async (req, res) => { await delInsumo(req.empresaId, req.params.id); res.json({ ok: true }); }));

/* ---- Branding / empresa ---- */
router.put('/empresa', requireRol('admin'), wrap(async (req, res) => {
  const { nombre, logo_url, color_primario, whatsapp_numero } = req.body || {};
  const campos = {};
  if (nombre) campos.nombre = nombre;
  if (logo_url !== undefined) campos.logo_url = logo_url;
  if (color_primario) campos.color_primario = color_primario;
  if (whatsapp_numero !== undefined) campos.whatsapp_numero = whatsapp_numero;
  res.json(await actualizarEmpresa(req.empresaId, campos));
}));

/* ---- Usuarios y roles ---- */
router.get('/usuarios', requireRol('admin'), wrap(async (req, res) => res.json(await listUsuarios(req.empresaId))));
router.post('/usuarios', requireRol('admin'), wrap(async (req, res) => {
  const { nombre, email, password, rol } = req.body || {};
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Faltan datos.' });
  if (await getUsuarioPorEmail(email)) return res.status(409).json({ error: 'Ese correo ya existe.' });
  const rolFinal = ['admin', 'supervisor'].includes(rol) ? rol : 'supervisor';
  const hash = await hashPassword(password);
  const u = await crearUsuario({ empresaId: req.empresaId, nombre, email, passwordHash: hash, rol: rolFinal });
  res.json({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol });
}));

export default router;
