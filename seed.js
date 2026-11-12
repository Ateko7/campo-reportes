// Datos de ejemplo para el SaaS multi-empresa. Uso: npm run seed
import { parseMensaje } from './parser.js';
import { configParser } from './routes/whatsapp.js';
import { hashPassword } from './auth.js';
import {
  crearEmpresa, getEmpresaPorSlug, crearUsuario, getUsuarioPorEmail,
  addCultivo, addLote, addInsumo, getOrCreateProductor, insertReporte,
} from './db.js';

const SLUG = 'agricola-demo';
const EMAIL = 'demo@campo.com';
const PASS = 'demo1234';

async function main() {
  let empresa = getEmpresaPorSlug(SLUG);
  if (!empresa) {
    empresa = crearEmpresa({ nombre: 'Agrícola Demo', slug: SLUG });
    const hash = await hashPassword(PASS);
    crearUsuario({ empresaId: empresa.id, nombre: 'Admin Demo', email: EMAIL, passwordHash: hash, rol: 'owner' });
    ['Maíz', 'Trigo', 'Soya', 'Frijol', 'Café', 'Tomate'].forEach((c) => addCultivo(empresa.id, c));
    ['Lote 1', 'Lote 2', 'Lote 3', 'Lote 4', 'Lote 5', 'Lote 7', 'Lote 9'].forEach((l) => addLote(empresa.id, { nombre: l }));
    ['Glifosato', 'Urea', 'Mancozeb', 'NPK', 'Clorpirifos'].forEach((i) => addInsumo(empresa.id, { nombre: i }));
    console.log(`✅ Empresa demo creada. Login: ${EMAIL} / ${PASS}`);
  } else {
    console.log('ℹ️  La empresa demo ya existía; agrego más reportes.');
  }

  const productores = [
    { nombre: 'Juan Pérez', tel: '+5215512345678' },
    { nombre: 'María López', tel: '+5215598765432' },
    { nombre: 'Carlos Ruiz', tel: '+5215511223344' },
  ];
  const mensajes = [
    ['Sembré hoy el lote 4 de maíz, 3 hectáreas', 0],
    ['Apliqué glifosato en el lote 2 ayer, 5 litros', 0],
    ['Coseché el lote 7 de trigo, 12 toneladas', 1],
    ['Estimo cosechar 8 toneladas de maíz esta semana en el lote 4', 1],
    ['Regué el lote 3 de soya hoy', 2],
    ['Apliqué urea en el lote 5, 150 kg el 03/11', 2],
    ['Sembré frijol en la parcela 9, 2 ha', 0],
    ['Coseché 4 toneladas de maíz en el lote 4', 1],
    ['Coseché 10 toneladas de maíz en el lote 1', 2],
    ['Apliqué mancozeb en el lote 2, 2 litros', 0],
  ];

  const cfg = configParser(empresa.id);
  let n = 0;
  mensajes.forEach(([texto, pIdx], i) => {
    const p = productores[pIdx];
    const prod = getOrCreateProductor(empresa.id, p.tel, p.nombre);
    const parsed = parseMensaje(texto, cfg);
    const geo = i % 2 === 0 ? { lat: 19.4326 + (Math.random() - 0.5) * 2, lng: -99.1332 + (Math.random() - 0.5) * 2 } : {};
    insertReporte({
      empresa_id: empresa.id, productor_id: prod.id, tipo: parsed.tipo,
      lote: parsed.lote, cultivo: parsed.cultivo, fecha: parsed.fecha,
      producto: parsed.producto, cantidad: parsed.cantidad, unidad: parsed.unidad,
      notas: parsed.notas, mensaje_original: texto,
      lat: geo.lat ?? null, lng: geo.lng ?? null, canal: 'whatsapp',
    });
    n++;
  });
  console.log(`✅ ${n} reportes de ejemplo cargados en "${empresa.nombre}".`);
}

main();
