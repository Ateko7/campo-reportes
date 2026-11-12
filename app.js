import 'dotenv/config';
import express from 'express';
import cookieSession from 'cookie-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { cargarSesion, requireAuth, requireSuscripcion } from './auth.js';
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
