import pg from 'pg';

// DATE llega como texto 'YYYY-MM-DD' (evita líos de zona horaria con objetos Date)
pg.types.setTypeParser(1082, (v: string) => v);

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/** NUMERIC(14,2) llega como texto ("100.00") -> centavos enteros */
export const aCentavos = (v: string | number): number => Math.round(Number(v) * 100);
/** centavos -> texto para NUMERIC(14,2) */
export const aNumeric = (centavos: number): string => (centavos / 100).toFixed(2);

export async function conTransaccion<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export async function auditar(
  c: pg.PoolClient,
  empresaId: string,
  usuarioId: string,
  accion: string,
  entidad: string,
  entidadId: string | number,
  datos: unknown,
): Promise<void> {
  await c.query(
    `INSERT INTO auditoria (empresa_id, usuario_id, accion, entidad, entidad_id, datos)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [empresaId, usuarioId, accion, entidad, entidadId, JSON.stringify(datos)],
  );
}
