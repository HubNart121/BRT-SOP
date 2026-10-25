#!/usr/bin/env node
// Apply a SQL file to the PostgreSQL database in DATABASE_URL (single transaction).
//   npm run db:schema                 → db/schema.sql
//   node scripts/db-apply.mjs <file>
// DATABASE_URL is read from the environment, or from .env.local if present.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/db-apply.mjs <file.sql>');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  const envFile = path.resolve('.env.local');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
      if (m) process.env.DATABASE_URL = m[1].replace(/^['"]|['"]$/g, '');
    }
  }
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (environment or .env.local)');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(file), 'utf8');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query(`select to_regclass('public.app_users')::text as t`);
  if (rows[0].t && path.basename(file) === 'schema.sql') {
    console.error('The schema already exists in this database — schema.sql is for an empty database only.');
    console.error('To upgrade an existing database, apply the files in db/migrations/ instead.');
    process.exitCode = 2;
  } else {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log(`Applied ${file} to ${new URL(url).host}${new URL(url).pathname}`);
  }
} catch (err) {
  await client.query('rollback').catch(() => undefined);
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
