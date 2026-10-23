import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.js';

test('Contraseña correcta verifica y la incorrecta no', async () => {
  const h = await hashPassword('MiClaveSegura1');
  assert.ok(await verifyPassword('MiClaveSegura1', h));
  assert.equal(await verifyPassword('miclavesegura1', h), false);
});

test('Misma contraseña produce hashes distintos (sal única)', async () => {
  assert.notEqual(await hashPassword('igual1234'), await hashPassword('igual1234'));
});

test('Hash inválido o placeholder no verifica', async () => {
  assert.equal(await verifyPassword('x', 'sin-login-todavia'), false);
  assert.equal(await verifyPassword('x', ''), false);
});
