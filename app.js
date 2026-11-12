import 'dotenv/config';
import express from 'express';
import cookieSession from 'cookie-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import pool, {
  crearEmpresa, getEmpresaPorSlug, crearUsuario,
  addCultivo, addLote, addInsumo, getOrCreateProductor, insertReporte,
} from './db.js';
import { cargarSesion, requireAuth, requireSuscripcion, hashPassword } from './auth.js';
import { parseMensaje } from './parser.js';
import { configParser } from './routes/whatsapp.js';
import authRouter from './routes/auth.js';
import whatsappRouter from './routes/whatsapp.js';
import apiRouter from './routes/api.js';
import configRouter from './routes/config.js';
import exportRouter from './routes/export.js';
import billingRouter from './routes/billing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);

// --- Sesión en cookie firmada (sin store; apto para serverless) ---
app.use(cookieSession({
  name: 'campo_sess',
  keys: [process.env.SESSION_SECRET || 'dev-secret-cambiar'],
  maxAge: 1000 * 60 * 60 * 24 * 30,
  httpOnly: true,
  sameSite: 'lax',
}));

// --- Body parsers (excepto el webhook de Recurrente, que necesita cuerpo crudo) ---
app.use((req, res, next) => {
  if (req.originalUrl === '/billing/webhook') return next();
  express.json()(req, res, next);
});
app.use((req, res, next) => {
  if (req.originalUrl === '/billing/webhook') return next();
  express.urlencoded({ extended: false })(req, res, next);
});

// --- Carga usuario/empresa de la sesión ---
app.use(cargarSesion);

// --- Assets públicos y páginas públicas (login/registro) ---
app.use(express.static(join(__dirname, 'public'), { index: false }));
app.use('/uploads', express.static(join(__dirname, 'data', 'uploads')));

// --- Rutas públicas ---
app.use('/auth', authRouter);
app.use('/webhook', whatsappRouter);
app.use('/billing', billingRouter);
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/dbcheck', async (_req, res) => {
  try {
    const r = await pool.query('select current_user, current_schema() as schema, count(*)::int as empresas from empresas');
    res.json({ db: 'ok', info: r.rows[0] });
  } catch (e) { res.status(500).json({ db: 'error', message: e.message }); }
});
// Ruta temporal para sembrar datos demo (protegida por SESSION_SECRET)
app.get('/seed-demo', async (req, res) => {
  if (req.query.key !== process.env.SESSION_SECRET) return res.status(403).json({ error: 'no autorizado' });
  try {
    let emp = await getEmpresaPorSlug('agricola-demo');
    if (emp) return res.json({ ok: true, ya_existia: true, login: 'demo@campo.com / demo1234' });
    emp = await crearEmpresa({ nombre: 'Agrícola Demo', slug: 'agricola-demo' });
    await crearUsuario({ empresaId: emp.id, nombre: 'Admin Demo', email: 'demo@campo.com', passwordHash: await hashPassword('demo1234'), rol: 'owner' });
    for (const c of ['Maíz', 'Trigo', 'Soya', 'Frijol', 'Café', 'Tomate']) await addCultivo(emp.id, c);
    for (const l of ['Lote 1', 'Lote 2', 'Lote 3', 'Lote 4', 'Lote 5', 'Lote 7', 'Lote 9']) await addLote(emp.id, { nombre: l });
    for (const i of ['Glifosato', 'Urea', 'Mancozeb', 'NPK', 'Clorpirifos']) await addInsumo(emp.id, { nombre: i });
    const cfg = await configParser(emp.id);
    const prods = [['Juan Pérez', '+5215512345678'], ['María López', '+5215598765432'], ['Carlos Ruiz', '+5215511223344']];
    const msgs = [
      ['Sembré hoy el lote 4 de maíz, 3 hectáreas', 0], ['Apliqué glifosato en el lote 2 ayer, 5 litros', 0],
      ['Coseché el lote 7 de trigo, 12 toneladas', 1], ['Estimo cosechar 8 toneladas de maíz esta semana en el lote 4', 1],
      ['Regué el lote 3 de soya hoy', 2], ['Apliqué urea en el lote 5, 150 kg el 03/11', 2],
      ['Sembré frijol en la parcela 9, 2 ha', 0], ['Coseché 4 toneladas de maíz en el lote 4', 1],
      ['Coseché 10 toneladas de maíz en el lote 1', 2], ['Apliqué mancozeb en el lote 2, 2 litros', 0],
    ];
    for (let i = 0; i < msgs.length; i++) {
      const [t, pi] = msgs[i];
      const pr = await getOrCreateProductor(emp.id, prods[pi][1], prods[pi][0]);
      const p = parseMensaje(t, cfg);
      const geo = i % 2 === 0 ? { lat: 19.4326 + (Math.random() - 0.5) * 2, lng: -99.1332 + (Math.random() - 0.5) * 2 } : {};
      await insertReporte({ empresa_id: emp.id, productor_id: pr.id, tipo: p.tipo, lote: p.lote, cultivo: p.cultivo,
        fecha: p.fecha, producto: p.producto, cantidad: p.cantidad, unidad: p.unidad, notas: p.notas,
        mensaje_original: t, lat: geo.lat ?? null, lng: geo.lng ?? null, canal: 'whatsapp' });
    }
    res.json({ ok: true, empresa: emp.nombre, login: 'demo@campo.com / demo1234', reportes: msgs.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Páginas protegidas ---
const pagina = (nombre) => (req, res) => res.sendFile(join(__dirname, 'views', nombre));
app.get('/', requireAuth, pagina('dashboard.html'));
app.get('/configuracion', requireAuth, pagina('config.html'));
app.get('/reportes', requireAuth, pagina('reportes.html'));
app.get('/suscripcion.html', requireAuth, pagina('suscripcion.html'));

// --- APIs protegidas (sesión + suscripción activa) ---
app.use('/api', requireAuth, requireSuscripcion, apiRouter);
app.use('/config', requireAuth, requireSuscripcion, configRouter);
app.use('/export', requireAuth, requireSuscripcion, exportRouter);

// --- Manejador de errores ---
app.use((err, _req, res, _next) => {
  console.error('Error no controlado:', err);
  if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor' });
});

export default app;
