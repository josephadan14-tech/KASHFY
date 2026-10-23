// Uso: npm run set-password -- correo@empresa.com NuevaClave123 [empresaId]
import { pool } from '../db/pool.js';
import { hashPassword } from '../modules/auth/password.js';

const [email, password, empresaId = '1'] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('Uso: npm run set-password -- <email> <contraseña de 8+ caracteres> [empresaId]');
  process.exit(1);
}

const r = await pool.query(
  'UPDATE usuarios SET password_hash=$1 WHERE lower(email)=lower($2) AND empresa_id=$3 RETURNING id',
  [await hashPassword(password), email, empresaId],
);
console.log(r.rows.length ? `Contraseña actualizada para ${email}` : 'No se encontró ese usuario en esa empresa');
await pool.end();
