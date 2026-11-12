// Capa de datos sobre PostgreSQL (Supabase). Todas las funciones son async.
import pg from 'pg';

// Devolver fechas/timestamps como texto (no como objetos Date de JS)
pg.types.setTypeParser(1082, (v) => v); // date
pg.types.setTypeParser(1114, (v) => v); // timestamp
pg.types.setTypeParser(1184, (v) => v); // timestamptz

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: Number(process.env.PG_MAX || 3),
  idleTimeoutMillis: 10000,
});

async function q(text, params) { return (await pool.query(text, params)).rows; }
async function one(text, params) { return (await pool.query(text, params)).rows[0] || null; }

// ---------- Acciones por defecto ----------
const ACCIONES_DEFAULT = [
  { clave: 'siembra', nombre: 'Siembra', icono: '🌱', color: '#16a34a',
    palabras: 'sembr,siembr,plant,trasplant',
    campos: [{ clave: 'variedad', label: 'Variedad', tipo: 'texto' }] },
  { clave: 'aplicacion', nombre: 'Aplicación', icono: '🧪', color: '#f59e0b',
    palabras: 'apliqu,aplic,fumig,fertiliz,abon,herbicid,fungicid,insecticid,cure,curar',
    campos: [{ clave: 'dosis', label: 'Dosis', tipo: 'texto' }, { clave: 'plaga', label: 'Plaga/objetivo', tipo: 'texto' }] },
  { clave: 'estimacion', nombre: 'Estimación', icono: '📈', color: '#0ea5e9',
    palabras: 'estim,proyect,espero cosechar,calculo,voy a cosechar,pienso cosechar', campos: [] },
  { clave: 'cosecha', nombre: 'Cosecha', icono: '🚜', color: '#7c3aed',
    palabras: 'cosech,coseche,levant,recolect,corte',
    campos: [{ clave: 'calidad', label: 'Calidad', tipo: 'opciones', opciones: ['Primera', 'Segunda', 'Tercera'] }] },
  { clave: 'riego', nombre: 'Riego', icono: '💧', color: '#06b6d4',
    palabras: 'rieg,regue,irrig',
    campos: [{ clave: 'horas', label: 'Horas de riego', tipo: 'numero' }] },
  { clave: 'nota', nombre: 'Nota', icono: '📝', color: '#64748b', palabras: '', campos: [] },
];

export async function seedAccionesDefault(empresaId) {
  const n = (await one('SELECT count(*)::int AS n FROM tipos_accion WHERE empresa_id=$1', [empresaId])).n;
  if (n > 0) return;
  for (let i = 0; i < ACCIONES_DEFAULT.length; i++) {
    const a = ACCIONES_DEFAULT[i];
    await q(`INSERT INTO tipos_accion (empresa_id, clave, nombre, icono, color, palabras_clave, campos_json, orden, activo)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)`,
      [empresaId, a.clave, a.nombre, a.icono, a.color, a.palabras, JSON.stringify(a.campos), i]);
  }
}

// ---------- Empresas ----------
export async function crearEmpresa({ nombre, slug }) {
  // Nace "pendiente": debe pagar la suscripción para activarse (cobro al registrarse)
  const empresa = await one(
    `INSERT INTO empresas (nombre, slug, sub_estado) VALUES ($1,$2,'pending') RETURNING *`,
    [nombre, slug]);
  await seedAccionesDefault(empresa.id);
  return empresa;
}
export async function getEmpresa(id) { return one('SELECT * FROM empresas WHERE id=$1', [id]); }
export async function getEmpresaPorSlug(slug) { return one('SELECT * FROM empresas WHERE slug=$1', [slug]); }
export async function getEmpresaPorWhatsapp(numero) { return one('SELECT * FROM empresas WHERE whatsapp_numero=$1', [numero]); }
export async function actualizarEmpresa(id, campos) {
  const permitidos = ['nombre', 'logo_url', 'color_primario', 'whatsapp_numero', 'plan',
    'sub_estado', 'trial_hasta', 'sub_hasta', 'recurrente_checkout_id', 'recurrente_subscription_id'];
  const sets = [], vals = [];
  let i = 1;
  for (const k of permitidos) if (k in campos) { sets.push(`${k}=$${i++}`); vals.push(campos[k]); }
  if (!sets.length) return getEmpresa(id);
  vals.push(id);
  return one(`UPDATE empresas SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, vals);
}

// ---------- Usuarios ----------
export async function crearUsuario({ empresaId, nombre, email, passwordHash, rol = 'admin' }) {
  return one(`INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
              VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [empresaId, nombre, email.toLowerCase().trim(), passwordHash, rol]);
}
export async function getUsuario(id) { return one('SELECT * FROM usuarios WHERE id=$1', [id]); }
export async function getUsuarioPorEmail(email) {
  return one('SELECT * FROM usuarios WHERE email=$1', [(email || '').toLowerCase().trim()]);
}
export async function listUsuarios(empresaId) {
  return q('SELECT id, nombre, email, rol, activo, created_at FROM usuarios WHERE empresa_id=$1 ORDER BY created_at', [empresaId]);
}

// ---------- Tipos de acción ----------
function hidrataAccion(t) { return t ? { ...t, campos: JSON.parse(t.campos_json || '[]'), activo: !!t.activo } : null; }
export async function listTiposAccion(empresaId, soloActivos = false) {
  const rows = await q(`SELECT * FROM tipos_accion WHERE empresa_id=$1 ${soloActivos ? 'AND activo=1' : ''} ORDER BY orden, id`, [empresaId]);
  return rows.map(hidrataAccion);
}
export async function getTipoAccion(empresaId, clave) {
  return hidrataAccion(await one('SELECT * FROM tipos_accion WHERE empresa_id=$1 AND clave=$2', [empresaId, clave]));
}
export async function upsertTipoAccion(empresaId, a) {
  const row = await one(
    `INSERT INTO tipos_accion (empresa_id, clave, nombre, icono, color, palabras_clave, campos_json, orden, activo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (empresa_id, clave) DO UPDATE SET
       nombre=excluded.nombre, icono=excluded.icono, color=excluded.color,
       palabras_clave=excluded.palabras_clave, campos_json=excluded.campos_json,
       orden=excluded.orden, activo=excluded.activo
     RETURNING *`,
    [empresaId, a.clave, a.nombre, a.icono || '📝', a.color || '#64748b',
     a.palabras_clave || '', JSON.stringify(a.campos || []), a.orden || 0, a.activo ? 1 : 0]);
  return hidrataAccion(row);
}
export async function eliminarTipoAccion(empresaId, clave) {
  await q('DELETE FROM tipos_accion WHERE empresa_id=$1 AND clave=$2', [empresaId, clave]);
}

// ---------- Catálogos ----------
export async function listCultivos(empresaId) { return q('SELECT * FROM cultivos WHERE empresa_id=$1 ORDER BY nombre', [empresaId]); }
export async function addCultivo(empresaId, nombre) { return one('INSERT INTO cultivos (empresa_id, nombre) VALUES ($1,$2) RETURNING *', [empresaId, nombre]); }
export async function delCultivo(empresaId, id) { await q('DELETE FROM cultivos WHERE empresa_id=$1 AND id=$2', [empresaId, id]); }

export async function listLotes(empresaId) { return q('SELECT * FROM lotes WHERE empresa_id=$1 ORDER BY nombre', [empresaId]); }
export async function addLote(empresaId, { nombre, cultivo, superficie_ha }) {
  return one('INSERT INTO lotes (empresa_id, nombre, cultivo, superficie_ha) VALUES ($1,$2,$3,$4) RETURNING *',
    [empresaId, nombre, cultivo || null, superficie_ha || null]);
}
export async function delLote(empresaId, id) { await q('DELETE FROM lotes WHERE empresa_id=$1 AND id=$2', [empresaId, id]); }

export async function listInsumos(empresaId) { return q('SELECT * FROM insumos WHERE empresa_id=$1 ORDER BY nombre', [empresaId]); }
export async function addInsumo(empresaId, { nombre, categoria }) {
  return one('INSERT INTO insumos (empresa_id, nombre, categoria) VALUES ($1,$2,$3) RETURNING *', [empresaId, nombre, categoria || null]);
}
export async function delInsumo(empresaId, id) { await q('DELETE FROM insumos WHERE empresa_id=$1 AND id=$2', [empresaId, id]); }

// ---------- Productores ----------
export async function getOrCreateProductor(empresaId, telefono, nombre) {
  let row = await one('SELECT * FROM productores WHERE empresa_id=$1 AND telefono=$2', [empresaId, telefono]);
  if (!row) {
    row = await one('INSERT INTO productores (empresa_id, nombre, telefono) VALUES ($1,$2,$3) RETURNING *',
      [empresaId, nombre || telefono, telefono]);
  }
  return row;
}
export async function listProductores(empresaId) { return q('SELECT * FROM productores WHERE empresa_id=$1 ORDER BY nombre', [empresaId]); }

// ---------- Reportes ----------
export async function insertReporte(r) {
  const row = await one(
    `INSERT INTO reportes
       (empresa_id, productor_id, usuario_id, tipo, lote, cultivo, fecha, producto, cantidad, unidad,
        notas, mensaje_original, campos_json, foto_url, lat, lng, canal)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [r.empresa_id, r.productor_id ?? null, r.usuario_id ?? null, r.tipo, r.lote ?? null, r.cultivo ?? null,
     r.fecha ?? null, r.producto ?? null, r.cantidad ?? null, r.unidad ?? null, r.notas ?? null,
     r.mensaje_original ?? null, JSON.stringify(r.campos || {}), r.foto_url ?? null,
     r.lat ?? null, r.lng ?? null, r.canal ?? 'whatsapp']);
  return getReporte(r.empresa_id, row.id);
}

export async function getReporte(empresaId, id) {
  const r = await one(
    `SELECT r.*, p.nombre AS productor_nombre, p.telefono AS productor_telefono
     FROM reportes r LEFT JOIN productores p ON p.id = r.productor_id
     WHERE r.id=$1 AND r.empresa_id=$2`, [id, empresaId]);
  if (r) r.campos = JSON.parse(r.campos_json || '{}');
  return r;
}

export async function listReportes(empresaId, filtros = {}) {
  const where = ['r.empresa_id=$1'];
  const params = [empresaId];
  let i = 2;
  if (filtros.tipo) { where.push(`r.tipo=$${i++}`); params.push(filtros.tipo); }
  if (filtros.lote) { where.push(`r.lote=$${i++}`); params.push(filtros.lote); }
  if (filtros.cultivo) { where.push(`r.cultivo=$${i++}`); params.push(filtros.cultivo); }
  if (filtros.desde) { where.push(`r.created_at::date >= $${i++}`); params.push(filtros.desde); }
  if (filtros.hasta) { where.push(`r.created_at::date <= $${i++}`); params.push(filtros.hasta); }
  if (filtros.q) {
    where.push(`(r.notas ILIKE $${i} OR r.mensaje_original ILIKE $${i} OR r.producto ILIKE $${i})`);
    params.push(`%${filtros.q}%`); i++;
  }
  params.push(filtros.limit || 500);
  const rows = await q(
    `SELECT r.*, p.nombre AS productor_nombre, p.telefono AS productor_telefono
     FROM reportes r LEFT JOIN productores p ON p.id = r.productor_id
     WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC LIMIT $${i}`, params);
  return rows.map((r) => ({ ...r, campos: JSON.parse(r.campos_json || '{}') }));
}

export async function stats(empresaId) {
  const porTipo = await q('SELECT tipo, COUNT(*)::int AS n FROM reportes WHERE empresa_id=$1 GROUP BY tipo', [empresaId]);
  const total = (await one('SELECT COUNT(*)::int AS n FROM reportes WHERE empresa_id=$1', [empresaId])).n;
  const productores = (await one('SELECT COUNT(*)::int AS n FROM productores WHERE empresa_id=$1', [empresaId])).n;
  const lotes = (await q(`SELECT DISTINCT lote AS v FROM reportes WHERE empresa_id=$1 AND lote IS NOT NULL ORDER BY lote`, [empresaId])).map((r) => r.v);
  const cultivos = (await q(`SELECT DISTINCT cultivo AS v FROM reportes WHERE empresa_id=$1 AND cultivo IS NOT NULL ORDER BY cultivo`, [empresaId])).map((r) => r.v);
  return { total, productores, porTipo, lotes, cultivos };
}

// ---------- Reportes agregados ----------
export async function reporteAplicaciones(empresaId, filtros = {}) {
  const rows = await listReportes(empresaId, { ...filtros, tipo: 'aplicacion', limit: 5000 });
  const porProducto = {};
  for (const r of rows) {
    const k = r.producto || 'Sin especificar';
    porProducto[k] = porProducto[k] || { producto: k, aplicaciones: 0, cantidad: 0, unidad: r.unidad };
    porProducto[k].aplicaciones++;
    if (r.cantidad) porProducto[k].cantidad += r.cantidad;
  }
  return { rows, resumen: Object.values(porProducto).sort((a, b) => b.aplicaciones - a.aplicaciones) };
}
export async function reporteCosechas(empresaId, filtros = {}) {
  const rows = await listReportes(empresaId, { ...filtros, tipo: 'cosecha', limit: 5000 });
  return { rows };
}
export async function reporteCantidadesCosechadas(empresaId) {
  const cosechado = await q(
    `SELECT cultivo, unidad, COALESCE(SUM(cantidad),0) AS total, COUNT(*)::int AS n
     FROM reportes WHERE empresa_id=$1 AND tipo='cosecha' AND cantidad IS NOT NULL
     GROUP BY cultivo, unidad ORDER BY total DESC`, [empresaId]);
  const estimado = await q(
    `SELECT cultivo, unidad, COALESCE(SUM(cantidad),0) AS total
     FROM reportes WHERE empresa_id=$1 AND tipo='estimacion' AND cantidad IS NOT NULL
     GROUP BY cultivo, unidad`, [empresaId]);
  const estMap = {};
  for (const e of estimado) estMap[`${e.cultivo}|${e.unidad}`] = Number(e.total);
  const filas = cosechado.map((c) => ({
    cultivo: c.cultivo || 'Sin cultivo', unidad: c.unidad || '',
    cosechado: Number(c.total), eventos: c.n,
    estimado: estMap[`${c.cultivo}|${c.unidad}`] || 0,
  }));
  return { filas };
}

export default pool;
