import dotenv from 'dotenv';
import { join } from 'node:path';
import { openDb, initSchema, PROJECT_ROOT } from './db.js';
import { seed } from './seed.js';
import { createApp } from './app.js';

// Load .env from project root first, then server dir / cwd as fallback.
dotenv.config({ path: join(PROJECT_ROOT, '.env') });
dotenv.config();

// Use SERVER_PORT (not PORT) so external launchers that inject PORT for the
// frontend don't accidentally rebind the API onto the client's port.
const PORT = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 8787;

const db = openDb();
initSchema(db);

// Auto-seed on first run if the DB is empty.
const empty = (db.prepare('SELECT COUNT(*) c FROM accounts').get() as any).c === 0;
if (empty) {
  console.log('Empty DB detected — seeding from workbook…');
  seed({ reset: false });
}

const app = createApp(db);

// Bind to localhost only — this serves your full financial data with no auth,
// so it must not be reachable from other machines on the network.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`API listening on http://127.0.0.1:${PORT}`);
});
