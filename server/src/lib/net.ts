/**
 * Working out which address to listen on.
 *
 * The default is loopback: this server hands out a complete picture of someone's
 * finances, so it should not be reachable from other machines unless that was
 * asked for deliberately. The one case worth supporting is reaching it from a
 * phone over Tailscale, which is a private network between your own devices
 * rather than an open port - so `SERVER_HOST=tailscale` resolves to this
 * machine's own tailnet address and nothing wider.
 */
import os from 'node:os';

type Ifaces = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

/**
 * Tailscale allocates IPv4 addresses from 100.64.0.0/10, the carrier-grade NAT
 * range (100.64.x.x through 100.127.x.x).
 */
export function isTailscaleV4(addr: string): boolean {
  const parts = addr.split('.');
  if (parts.length !== 4) return false;
  const n = parts.map(Number);
  if (n.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  return n[0] === 100 && n[1] >= 64 && n[1] <= 127;
}

export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === 'loopback';
}

/**
 * This machine's own tailnet IPv4, or null if Tailscale is not up.
 *
 * An interface actually named Tailscale wins, because the CGNAT range is also
 * handed out by some cellular modems - matching on the range alone could bind
 * to a mobile hotspot's address, which is a real network, not a private one.
 */
export function findTailscaleIp(ifaces: Ifaces = os.networkInterfaces()): string | null {
  const candidates: { name: string; addr: string }[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (isTailscaleV4(a.address)) candidates.push({ name, addr: a.address });
    }
  }
  const named = candidates.find((c) => /tailscale|^ts\d/i.test(c.name));
  return (named || candidates[0])?.addr ?? null;
}

export type HostScope = 'loopback' | 'tailscale' | 'exposed';

/**
 * `host` is null when the request could not be honoured, and `error` then says
 * why. A flat shape rather than a discriminated union because this workspace
 * compiles with `strict: false`, where narrowing on a boolean discriminant does
 * not apply.
 */
export type HostResolution = { host: string | null; scope: HostScope; error?: string };

/**
 * Turn the SERVER_HOST setting into an address to bind, plus how exposed that
 * address is. `exposed` means reachable from a network you do not control; the
 * caller refuses to bind there unless a passcode is set.
 */
export function resolveHost(raw?: string | null, ifaces?: Ifaces): HostResolution {
  const want = (raw || '').trim().toLowerCase();

  if (!want || isLoopbackHost(want)) return { host: '127.0.0.1', scope: 'loopback' };

  if (want === 'tailscale' || want === 'ts') {
    const ip = findTailscaleIp(ifaces);
    if (!ip) {
      return {
        host: null,
        scope: 'tailscale',
        error:
          'SERVER_HOST=tailscale, but no Tailscale address was found on this machine.\n' +
          'Start Tailscale and sign in, then try again. (Looking for an IPv4 in 100.64.0.0/10.)',
      };
    }
    return { host: ip, scope: 'tailscale' };
  }

  if (want === '0.0.0.0' || want === 'all') return { host: '0.0.0.0', scope: 'exposed' };

  // An explicit address. Tailnet addresses are private; anything else is a
  // network this app has no business being on without a passcode.
  return { host: want, scope: isTailscaleV4(want) ? 'tailscale' : 'exposed' };
}
