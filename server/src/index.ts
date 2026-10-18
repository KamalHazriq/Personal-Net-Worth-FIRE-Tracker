import dotenv from 'dotenv';
import { join } from 'node:path';
import { openDb, initSchema, PROJECT_ROOT } from './db.js';
import { seed } from './seed.js';
import { createApp } from './app.js';
import { resolveHost } from './lib/net.js';
import { serveClient } from './lib/serve.js';
import { sessionTtlDays } from './lib/auth.js';

// Load .env from project root first, then server dir / cwd as fallback.
dotenv.config({ path: join(PROJECT_ROOT, '.env') });
dotenv.config();

// Use SERVER_PORT (not PORT) so external launchers that inject PORT for the
// frontend don't accidentally rebind the API onto the client's port.
const PORT = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 8787;

// Default is loopback. `SERVER_HOST=tailscale` finds this machine's tailnet
// address so a phone on the same tailnet can reach it; see server/src/lib/net.ts.
const resolved = resolveHost(process.env.SERVER_HOST);
if (!resolved.host) {
  console.error('\n' + resolved.error + '\n');
  process.exit(1);
}
const { host, scope } = resolved;

const db = openDb();
initSchema(db);

// Auto-seed on first run if the DB is empty.
const empty = (db.prepare('SELECT COUNT(*) c FROM accounts').get() as any).c === 0;
if (empty) {
  console.log('Empty DB detected — seeding from workbook…');
  seed({ reset: false });
}

// Listening anywhere but loopback requires a passcode. Without one every
// request is served, and a page in any browser that can resolve this address —
// including one that resolves a domain it controls to it — would be able to
// read the whole database. The passcode is what makes those requests 401.
if (scope !== 'loopback') {
  const hash = (db.prepare('SELECT passcode_hash FROM settings WHERE id=1').get() as any)?.passcode_hash;
  if (!hash) {
    console.error(
      `\nRefusing to listen on ${host}: no passcode is set.\n\n` +
        'Anything that can reach this address could read every figure in the\n' +
        'database, so set a passcode before opening it up:\n\n' +
        '  1. Start normally (npm run dev) and open http://localhost:5173\n' +
        '  2. Settings -> Passcode -> set one\n' +
        '  3. Then start again with SERVER_HOST=tailscale\n',
    );
    process.exit(1);
  }
}

const app = createApp(db);

// Serve the built client from the API server too, so a phone needs one address
// instead of a separate Vite origin. Mounted after createApp so the API routes
// keep priority, and kept out of createApp so the route tests are unaffected.
const hasBuild = serveClient(app, join(PROJECT_ROOT, 'client', 'dist'));

app.listen(PORT, host, () => {
  if (scope === 'loopback') {
    console.log(`API listening on http://127.0.0.1:${PORT}`);
    return;
  }
  const url = `http://${host}:${PORT}`;
  console.log(`\nListening on ${url}  (${scope})`);
  console.log(`Passcode required; a session lasts ${sessionTtlDays()} day(s).`);
  if (hasBuild) {
    console.log(`Open ${url} on your phone — the whole app is served from here.`);
  } else {
    console.log('No built client found. Run `npm run build` so the phone has a UI to load.');
  }
  if (scope === 'exposed') {
    console.log(
      '\nWARNING: this address is not a private tailnet address. On an untrusted\n' +
        'network the passcode is the only thing between this data and anyone else\n' +
        'who can reach the port. SERVER_HOST=tailscale is the safer option.',
    );
  }
  console.log('');
});
