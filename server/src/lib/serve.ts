/**
 * Serving the built client from the API server.
 *
 * In development the client is served by Vite on its own port and proxies /api
 * here. That is two addresses, which is fine on one machine and awkward from a
 * phone - so when a build exists, the API server serves it too and the whole
 * app lives on one address. The client already calls /api with relative paths,
 * so same-origin needs no client-side configuration.
 */
import express, { type Express } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mount `dist` on `app`, if it has been built. Returns whether it was found,
 * so the caller can say so at startup rather than leaving someone staring at a
 * blank page on their phone.
 *
 * Call this after the API routes are registered: Express matches in order, and
 * the fallback below must not shadow them.
 */
export function serveClient(app: Express, dist: string): boolean {
  if (!existsSync(join(dist, 'index.html'))) return false;

  app.use(express.static(dist));

  // SPA fallback. A deep link like /fire is a client-side route, so the server
  // has no file for it and must return the app shell instead of a 404. API
  // paths and anything that is not a GET fall through untouched - an unknown
  // /api/... path has to stay a 404, not quietly return HTML to a fetch().
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(join(dist, 'index.html'));
  });

  return true;
}
