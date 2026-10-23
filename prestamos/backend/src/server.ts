import { crearApp } from './app.js';
import { pool } from './db/pool.js';

if ((process.env.JWT_SECRET ?? '').length < 32) {
  console.error('Falta JWT_SECRET en .env (mínimo 32 caracteres). Mira .env.example');
  process.exit(1);
}

const puerto = Number(process.env.PORT ?? 3000);

try {
  await pool.query('SELECT 1'); // falla rápido si la base no responde
} catch (e) {
  const motivo = (e as { code?: string }).code ?? (e as Error).message;
  console.error('\nNo se pudo conectar a la base de datos (' + motivo + ').');
  console.error('Revisa que Docker Desktop esté abierto y que la base esté encendida:');
  console.error('  docker compose up -d   (desde la carpeta que tiene docker-compose.yml)\n');
  process.exit(1);
}
crearApp().listen(puerto, () => console.log(`API lista en http://localhost:${puerto}`));
