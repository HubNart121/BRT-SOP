import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

export interface Queryable {
  query<T = AnyRow>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Database extends Queryable {
  kind: 'postgres' | 'pglite';
  /** Run `fn` inside a single transaction (BEGIN … COMMIT / ROLLBACK). */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
}

const globalForDb = globalThis as unknown as { __brtDb?: Promise<Database> };

export function getDb(): Promise<Database> {
  if (!globalForDb.__brtDb) {
    globalForDb.__brtDb = createDb().catch((err) => {
      globalForDb.__brtDb = undefined;
      throw err;
    });
  }
  return globalForDb.__brtDb;
}

async function createDb(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  if (url) return createPostgres(url);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is not configured');
  }
  return createPglite();
}

async function createPostgres(connectionString: string): Promise<Database> {
  const pg = await import('pg');
  const { Pool, types } = pg.default ?? pg;
  // Keep DATE columns as 'YYYY-MM-DD' strings instead of local-midnight Date objects.
  types.setTypeParser(1082, (v: string) => v);
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err: Error) => console.error('[db] idle client error', err));

  return {
    kind: 'postgres',
    query: async (text, params) => pool.query(text, params as unknown[]) as Promise<{ rows: AnyRow[] }>,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn({
          query: (text, params) => client.query(text, params as unknown[]) as Promise<{ rows: AnyRow[] }>,
        });
        await client.query('commit');
        return result;
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

/** Local development database: embedded Postgres (PGlite) stored in .data/pglite */
async function createPglite(): Promise<Database> {
  const { PGlite, types } = await import('@electric-sql/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  const dataDir = process.env.PGLITE_DATA_DIR || path.join(process.cwd(), '.data', 'pglite');
  await fs.mkdir(dataDir, { recursive: true });
  const pg = await PGlite.create({
    dataDir,
    extensions: { pg_trgm },
    parsers: { [types.DATE]: (v: string) => v },
  });

  const db: Database = {
    kind: 'pglite',
    query: (text, params) => pg.query(text, params),
    tx: (fn) => pg.transaction((t) => fn({ query: (text, params) => t.query(text, params) })),
  };

  const { rows } = await pg.query<{ t: string | null }>(`select to_regclass('public.app_users')::text as t`);
  if (!rows[0]?.t) {
    console.log(`[db] PGlite: creating schema and demo data in ${dataDir}`);
    const schema = await fs.readFile(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
    await pg.exec(schema);
    const { seedDemoData } = await import('./dev-seed');
    await seedDemoData(db);
  }
  // Bring an existing local database up to date (migrations are idempotent).
  const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
  const files = (await fs.readdir(migrationsDir).catch(() => [] as string[])).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await pg.exec(await fs.readFile(path.join(migrationsDir, file), 'utf8'));
  }
  return db;
}
