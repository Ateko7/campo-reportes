# 🌱 Campo Reportes — SaaS de reportes de campo por WhatsApp

Plataforma **multi-empresa** para compañías que tercerizan agricultores. Los
productores en campo mandan sus anotaciones **por WhatsApp en lenguaje natural**
y cada empresa ve su información **en vivo** en un tablero propio, con fotos, GPS,
reportes, exportación y todo **configurable por empresa**. Cobro de mensualidad
con **Recurrente**.

> Adiós al lápiz y papel que se pierde. Data de campo en tiempo real, por cliente.

---

## Lo que incluye

### 🔐 Multi-empresa + login
- Registro de empresa con **14 días de prueba gratis**.
- Usuarios con **roles**: `owner`, `admin`, `supervisor`.
- **Aislamiento total**: cada empresa solo ve sus datos (reportes, catálogos, usuarios).
- Sesiones persistentes (SQLite), contraseñas con bcrypt.

### ⚙️ Configurable por empresa
- **Acciones reportables**: define qué puede reportar tu equipo (siembra, aplicación,
  cosecha, estimación, riego… o las tuyas, como "Poda"), con su ícono, color,
  **palabras clave** (que activan la acción al interpretar el WhatsApp) y
  **campos personalizados**.
- **Catálogos propios**: cultivos, lotes/parcelas e insumos.
- **Marca**: nombre, color principal y logo (se aplican al tablero y exportables).
- **Usuarios**: invita a tu equipo con roles.

### 📊 Reportes
- **Tablero en vivo**: KPIs, tabla filtrable, mapa GPS, detalle por registro.
- **Reporte de aplicaciones**: resumen por insumo (cuántas, cuánto) + detalle.
- **Reporte de cosechas**: todas las cosechas registradas.
- **Cantidades cosechadas**: total por cultivo, **cosechado vs. estimado** (% cumplimiento).
- **Exportación PDF y Excel** de cada reporte (respetando filtros).

### 💳 Cobro con Recurrente
- Página de suscripción con estado (prueba / activa / pago pendiente / cancelada).
- Checkout de Recurrente + **webhook** que activa/desactiva el acceso según el pago.
- **Bloqueo automático** cuando termina la prueba o la suscripción.
- **Modo demo** incluido: sin claves reales, activa la cuenta localmente para probar.

---

## Cómo correrlo

```bash
npm install
npm run seed     # crea empresa demo + datos de ejemplo
npm start
```

Abre **http://localhost:3000** → te manda al login.

**Cuenta demo:**  `demo@campo.com`  /  `demo1234`

### Probar sin WhatsApp
En el tablero, **💬 Simular WhatsApp**: escribe un mensaje como lo haría un
productor y míralo convertirse en registro (con ejemplos de un clic).

---

## Conectar WhatsApp real (Twilio)

1. Crea cuenta en [Twilio](https://www.twilio.com) y activa el **WhatsApp Sandbox**.
2. Expón tu servidor (en desarrollo, `ngrok http 3000`).
3. En Twilio, webhook de mensajes entrantes: `POST https://TU-DOMINIO/webhook/whatsapp`
4. Para separar empresas, guarda en cada una su **número de WhatsApp entrante**
   (Configuración → Marca). El webhook identifica la empresa por el número `To`.

El webhook responde en **TwiML**, así el productor recibe confirmación automática.

---

## Conectar el cobro (Recurrente)

1. En [Recurrente](https://recurrente.com): crea un **producto con precio recurrente
   mensual** y copia su `price_id`.
2. En Ajustes → API Keys, copia la **public key** y **secret key**.
3. Crea un **webhook** apuntando a `https://TU-DOMINIO/billing/webhook` y copia su
   secreto de firma (`whsec_...`).
4. Pon todo en `.env` (ver `.env.example`). Sin estas claves, corre en **modo demo**.

> Nota: el host de Recurrente estaba bloqueado al desarrollar, así que algunos
> nombres de campo del checkout (`price_id`, `checkout_url`) deben verificarse
> contra su documentación oficial al conectar en producción. La autenticación
> (`X-PUBLIC-KEY` / `X-SECRET-KEY`), el endpoint `POST /api/checkouts` y los
> webhooks con firma Svix están basados en su API documentada.

---

## Arquitectura

```
campo-reportes/
├── server.js            Express: sesiones, auth, aislamiento, control de suscripción
├── auth.js              Hash de contraseñas, middleware de sesión/roles/suscripción
├── db.js                SQLite: empresas, usuarios, catálogos, acciones, reportes
├── parser.js            Mensaje español → registro (configurable por empresa)
├── seed.js              Empresa demo + datos de ejemplo
├── routes/
│   ├── auth.js          /auth: registro, login, logout, /yo
│   ├── whatsapp.js      /webhook/whatsapp (Twilio) + lógica de procesado
│   ├── api.js           /api: reportes, stats, acciones, simulador, reportes agregados
│   ├── config.js        /config: acciones, catálogos, marca, usuarios
│   ├── export.js        /export: Excel y PDF (general + por reporte)
│   └── billing.js       /billing: checkout, estado, webhook (Recurrente)
├── public/              Assets + páginas públicas (login, registro) + JS del tablero
│   ├── common.js        fetch autenticado, branding dinámico, navegación
│   ├── app.js           Lógica del tablero
│   └── vendor/leaflet   Mapa (servido localmente, sin CDN)
├── views/               Páginas protegidas (dashboard, config, reportes, suscripción)
└── data/                Bases de datos SQLite y fotos
```

**Stack:** Node.js + Express · SQLite (better-sqlite3) · bcryptjs · express-session ·
Leaflet · ExcelJS · PDFKit. Sin servicios externos obligatorios.

---

## Roles y permisos

| Acción | owner | admin | supervisor |
|--------|:---:|:---:|:---:|
| Ver tablero y reportes | ✅ | ✅ | ✅ |
| Configurar acciones/catálogos/marca | ✅ | ✅ | — |
| Gestionar usuarios | ✅ | ✅ | — |
| Activar/gestionar suscripción | ✅ | ✅ | — |

---

## Siguientes pasos sugeridos

- **Fotos de WhatsApp:** descargar y guardar el `MediaUrl` de Twilio (requiere auth).
- **Parser con IA (Claude):** interpretar frases más libres, manteniendo las reglas de respaldo.
- **Alertas:** avisar al supervisor ante palabras como "plaga" o "urgente".
- **Más planes** y límites por plan (número de productores, reportes, etc.).
- **Panel de super-admin** para que tú (dueño del SaaS) veas todas las empresas.
