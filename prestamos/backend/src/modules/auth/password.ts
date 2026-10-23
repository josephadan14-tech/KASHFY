import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as unknown as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const LARGO = 64;

/** Formato guardado: scrypt$<sal base64>$<hash base64> (cada contraseña lleva su propia sal) */
export async function hashPassword(plano: string): Promise<string> {
  const sal = randomBytes(16);
  const clave = await scrypt(plano, sal, LARGO);
  return `scrypt$${sal.toString('base64')}$${clave.toString('base64')}`;
}

export async function verifyPassword(plano: string, guardado: string): Promise<boolean> {
  const [alg, sal, hash] = guardado.split('$');
  if (alg !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await scrypt(plano, Buffer.from(sal, 'base64'), esperado.length);
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}
