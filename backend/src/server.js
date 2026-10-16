import { readConfig } from './config.js';
import { createDatabase } from './db/pool.js';
import { createApp } from './app.js';

const config = readConfig();
const db = createDatabase(config.DATABASE_URL);
await db.query('SELECT 1 FROM users LIMIT 1');
const server = createApp(db,config).listen(config.PORT, () => console.log(`PCD backend listening on port ${config.PORT}`));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1),10000).unref();
  server.close(async () => { await db.end(); clearTimeout(deadline); });
}
process.on('SIGINT',stop);
process.on('SIGTERM',stop);
