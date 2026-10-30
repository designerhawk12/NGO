import { existsSync, readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { env } from '../config/env';
import { HttpError } from '../middleware/errorHandler';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!env.databaseUrl) throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Database is not configured.');
  if (!pool) {
    let caCert: string | undefined;
    if (env.databaseSsl && env.databaseSslCaPath) {
      if (!existsSync(env.databaseSslCaPath)) {
        throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Database SSL CA file not found at configured path.');
      }
      caCert = readFileSync(env.databaseSslCaPath, 'utf8');
    }

        pool = new Pool({
      connectionString: env.databaseUrl,
      max: 4,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      ssl: env.databaseSsl ? { rejectUnauthorized: true, ...(caCert ? { ca: caCert } : {}) } : undefined,
    });

    pool.on('error', (error) => {
      const candidate = (error as Error & { code?: unknown }).code;
      const code = typeof candidate === 'string' && /^[A-Z0-9_-]{1,40}$/i.test(candidate)
        ? candidate : undefined;
      console.error(JSON.stringify({
        level: 'error',
        kind: 'PoolIdleError',
        message: 'Unexpected error on idle database client',
        code,
      }));
    });
  }
  return pool;
}

export async function withTransaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) { await pool.end(); pool = undefined; }
}
