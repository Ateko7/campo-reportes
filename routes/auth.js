import express from 'express';
import { hashPassword, verifyPassword, suscripcionActiva } from '../auth.js';
import {
  crearEmpresa, getEmpresaPorSlug, crearUsuario, getUsuarioPorEmail,
} from '../db.js';

const router = express.Router();

function slugify(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'empresa';
}

// POST /auth/registro  -> crea empresa + usuario owner
router.post('/registro', async (req, res) => {
  const { empresa, nombre, email, password } = req.body || {};
  if (!empresa || !nombre || !email || !password)
    return res.status(400).json({ error: 'Faltan datos (empresa, nombre, email, password).' });
  if (password.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  if (await getUsuarioPorEmail(email))
    return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });

  // slug único
  let base = slugify(empresa), slug = base, i = 1;
  while (await getEmpresaPorSlug(slug)) slug = `${base}-${i++}`;

  const emp = await crearEmpresa({ nombre: empresa, slug });
  const hash = await hashPassword(password);
  const user = await crearUsuario({ empresaId: emp.id, nombre, email, passwordHash: hash, rol: 'owner' });

  req.session.usuarioId = user.id;
  res.json({ ok: true, redirect: '/suscripcion.html?nuevo=1' });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = await getUsuarioPorEmail(email);
  if (!user || !user.activo) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  const ok = await verifyPassword(password || '', user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  req.session.usuarioId = user.id;
  res.json({ ok: true, redirect: '/' });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// GET /auth/yo -> datos del usuario y empresa actuales
router.get('/yo', (req, res) => {
  if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });
  const e = req.empresa;
  res.json({
    usuario: { id: req.usuario.id, nombre: req.usuario.nombre, email: req.usuario.email, rol: req.usuario.rol },
    empresa: {
      id: e.id, nombre: e.nombre, slug: e.slug, logo_url: e.logo_url,
      color_primario: e.color_primario, plan: e.plan,
      sub_estado: e.sub_estado, trial_hasta: e.trial_hasta, sub_hasta: e.sub_hasta,
      suscripcion_activa: suscripcionActiva(e),
    },
  });
});

export default router;
