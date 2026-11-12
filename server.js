// Arranque para desarrollo local.
import app from './app.js';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🌱  Campo Reportes en http://localhost:${PORT}`);
  console.log(`    Login:    http://localhost:${PORT}/login.html`);
  console.log(`    Registro: http://localhost:${PORT}/registro.html\n`);
});
