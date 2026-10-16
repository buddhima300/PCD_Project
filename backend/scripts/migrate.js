import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readConfig } from '../src/config.js';
import { createDatabase, transaction } from '../src/db/pool.js';
import { digest } from '../src/shared/security.js';

export async function migrate(db) {
  return transaction(db, async client => {
    await client.query('SELECT pg_advisory_xact_lock(726341)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    const directory = new URL('../migrations/',import.meta.url);
    for (const name of (await readdir(directory)).filter(n => /^\d+.*\.sql$/.test(n)).sort()) {
      const sql = await readFile(new URL(name,directory),'utf8');
      const existing = (await client.query('SELECT checksum FROM schema_migrations WHERE name=$1',[name])).rows[0];
      if (existing) {
        if (existing.checksum !== digest(sql)) throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,digest(sql)]);
      console.log(`Applied ${name}`);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = createDatabase(readConfig().DATABASE_URL);
  try { await migrate(db); } finally { await db.end(); }
}
