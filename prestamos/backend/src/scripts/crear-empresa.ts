// Crea la empresa y su primer administrador (para producción).
// Uso: npm run crear-empresa -- "Nombre de la empresa" "Nombre del admin" correo@empresa.com ClaveLarga123
import { conTransaccion, pool } from '../db/pool.js';
import { hashPassword } from '../modules/auth/password.js';

const [empresa, nombre, email, password] = process.argv.slice(2);
if (!empresa || !nombre || !email || !password || password.length < 10) {
  console.error('Uso: npm run crear-empresa -- "<empresa>" "<nombre del admin>" <correo> <contraseña de 10+ caracteres>');
  process.exit(1);
}

const hash = await hashPassword(password);
await conTransaccion(async (c) => {
  const e = await c.query('INSERT INTO empresas (nombre) VALUES ($1) RETURNING id', [empresa]);
  await c.query(
    `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol) VALUES ($1,$2,$3,$4,'ADMIN')`,
    [e.rows[0].id, nombre, email.toLowerCase(), hash],
  );
  console.log(`Empresa "${empresa}" creada (id ${e.rows[0].id}) con el administrador ${email.toLowerCase()}`);
});
await pool.end();
