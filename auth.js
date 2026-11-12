import bcrypt from 'bcryptjs';
import { getUsuario, getEmpresa } from './db.js';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}
export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Carga req.usuario y req.empresa a partir de la sesión
export async function cargarSesion(req, _res, next) {
  req.usuario = null;
  req.empresa = null;
  req.empresaId = null;
  try {
    if (req.session && req.session.usuarioId) {
      const u = await getUsuario(req.session.usuarioId);
      if (u && u.activo) {
        req.usuario = u;
        req.empresa = await getEmpresa(u.empresa_id);
        req.empresaId = u.empresa_id;
      }
    }
    next();
  } catch (e) { next(e); }
}

// Exige sesión para rutas de API / tablero
export function requireAuth(req, res, next) {
  if (!req.usuario) {
    const esApi = req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/config')
      || req.originalUrl.startsWith('/export') || req.xhr;
    if (!esApi && req.accepts('html')) return res.redirect('/login.html');
    return res.status(401).json({ error: 'No autenticado' });
  }
  next();
}

// Exige un rol mínimo
const JERARQUIA = { supervisor: 1, admin: 2, owner: 3 };
export function requireRol(min) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });
    if ((JERARQUIA[req.usuario.rol] || 0) < (JERARQUIA[min] || 0)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    next();
  };
}

// Estado de suscripción: ¿tiene acceso la empresa?
export function suscripcionActiva(empresa) {
  if (!empresa) return false;
  const hoy = new Date().toISOString().slice(0, 10);
  if (empresa.sub_estado === 'active') {
    return !empresa.sub_hasta || empresa.sub_hasta >= hoy;
  }
  if (empresa.sub_estado === 'trialing') {
    return !empresa.trial_hasta || empresa.trial_hasta >= hoy;
  }
  return false;
}

// Bloquea el uso si la suscripción venció (deja pasar las rutas de facturación)
export function requireSuscripcion(req, res, next) {
  if (suscripcionActiva(req.empresa)) return next();
  return res.status(402).json({
    error: 'suscripcion_requerida',
    mensaje: 'Tu periodo de prueba o suscripción terminó. Activa tu plan para continuar.',
  });
}
