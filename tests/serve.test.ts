import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { initSchema } from '../server/src/db.ts';
import { hashPasscode, issueToken, revokeAllTokens } from '../server/src/lib/auth.ts';
import { createApp } from '../server/src/app.ts';
import { serveClient } from '../server/src/lib/serve.ts';

// Serving the built client from the API server is what lets a phone use one
// address. The things that can go wrong are both silent: an unknown /api path
// answering with HTML instead of a 404, or the auth gate blocking the shell so
// the unlock screen can never load.
let db: any;
let server: any;
let base: string;
let dist: string;
let token: string;

const SHELL = '<!doctype html><title>Shell</title><div id="root"></div>';

before(async () => {
  dist = mkdtempSync(join(tmpdir(), 'fire-dist-'));
  writeFileSync(join(dist, 'index.html'), SHELL);
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');

  db = new Database(':memory:');
  initSchema(db);
  db.prepare('INSERT OR IGNORE INTO settings (id) VALUES (1)').run();
  // A passcode is set, as it must be for any non-loopback start.
  db.prepare('UPDATE settings SET passcode_hash=? WHERE id=1').run(hashPasscode('1234'));

  const app = createApp(db);
  assert.equal(serveClient(app, dist), true, 'a built client should have been found');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  token = issueToken();
});

after(() => {
  server?.close();
  db?.close();
  revokeAllTokens();
  rmSync(dist, { recursive: true, force: true });
});

test('the app shell is served at the root', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /html/);
  assert.equal(await res.text(), SHELL);
});

test('a client-side deep link returns the shell, not a 404', async () => {
  // Opening /fire directly on a phone has to work; the router takes it from there.
  for (const path of ['/fire', '/accounts', '/settings', '/studio/anything']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.equal(await res.text(), SHELL, path);
  }
});

test('real files still win over the fallback', async () => {
  const res = await fetch(base + '/assets/app.js');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'console.log(1)');
});

test('the shell loads while locked, so the unlock screen can appear', async () => {
  // If the auth gate covered static files the phone would be shown nothing to
  // type a passcode into.
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), SHELL);
});

test('API routes are not shadowed by the static mount', async () => {
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });

  const locked = await fetch(base + '/api/accounts');
  assert.equal(locked.status, 401, 'a passcode is set, so this must be locked');

  const open = await fetch(base + '/api/accounts', { headers: { 'x-auth-token': token } });
  assert.equal(open.status, 200);
});

test('an unknown API path 404s instead of returning the shell', async () => {
  // The failure this guards is quiet: a fetch for a mistyped route receiving
  // HTML with a 200 reads as success and then fails on res.json().
  const res = await fetch(base + '/api/does-not-exist', { headers: { 'x-auth-token': token } });
  assert.equal(res.status, 404);
  assert.doesNotMatch(await res.text(), /<div id="root">/);
});

test('a non-GET request is never answered with the shell', async () => {
  const res = await fetch(base + '/some/path', { method: 'POST' });
  assert.equal(res.status, 404);
  assert.doesNotMatch(await res.text(), /<div id="root">/);
});

test('with no build, nothing is mounted and the caller is told', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'fire-nodist-'));
  try {
    const app = createApp(new Database(':memory:'));
    assert.equal(serveClient(app, empty), false);
    assert.equal(serveClient(app, join(empty, 'not-a-directory')), false);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});
