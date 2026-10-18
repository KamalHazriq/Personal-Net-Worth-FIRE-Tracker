/**
 * `npm run phone` - start the server on this machine's tailnet address so a
 * phone on the same Tailscale network can open the app.
 *
 * Setting an env var inline differs between shells (and PowerShell has no
 * `VAR=x cmd` form at all), so this sets it in-process and hands over to the
 * normal bootstrap. Everything else, including the refusal to bind without a
 * passcode, is the same code path as a local start.
 */
process.env.SERVER_HOST = process.env.SERVER_HOST || 'tailscale';
await import('./index.js');
