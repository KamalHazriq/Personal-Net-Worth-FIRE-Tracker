import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTailscaleV4, isLoopbackHost, findTailscaleIp, resolveHost } from '../server/src/lib/net.ts';

// Synthetic interface lists, so these pass whether or not Tailscale is
// installed on the machine running them.
const iface = (address: string, over: any = {}) => ({
  address,
  netmask: '255.255.255.255',
  family: 'IPv4' as const,
  mac: '00:00:00:00:00:00',
  internal: false,
  cidr: `${address}/32`,
  ...over,
});

test('the CGNAT range is recognised at its edges and nowhere else', () => {
  for (const ok of ['100.64.0.0', '100.64.0.1', '100.101.102.103', '100.127.255.255']) {
    assert.equal(isTailscaleV4(ok), true, ok);
  }
  // 100.63.x and 100.128.x sit just outside 100.64.0.0/10.
  for (const no of ['100.63.255.255', '100.128.0.0', '99.64.0.1', '101.64.0.1', '192.168.1.50', '127.0.0.1']) {
    assert.equal(isTailscaleV4(no), false, no);
  }
});

test('nonsense is not an address', () => {
  for (const no of ['', 'tailscale', '100.64.0', '100.64.0.1.2', '100.64.0.256', '100.-1.0.1', 'a.b.c.d', '100.64.0.x']) {
    assert.equal(isTailscaleV4(no), false, JSON.stringify(no));
  }
});

test('loopback is spelled several ways', () => {
  for (const h of ['localhost', '127.0.0.1', '::1', 'LOOPBACK', ' localhost ']) {
    assert.equal(isLoopbackHost(h), true, h);
  }
  assert.equal(isLoopbackHost('100.64.0.1'), false);
  assert.equal(isLoopbackHost('0.0.0.0'), false);
});

test('a tailnet address is found among ordinary interfaces', () => {
  const found = findTailscaleIp({
    'Wi-Fi': [iface('192.168.1.50')],
    Tailscale: [iface('100.101.102.103')],
    'Loopback Pseudo-Interface 1': [iface('127.0.0.1', { internal: true })],
  });
  assert.equal(found, '100.101.102.103');
});

test('no Tailscale means null, not a guess', () => {
  assert.equal(findTailscaleIp({ 'Wi-Fi': [iface('192.168.1.50')] }), null);
  assert.equal(findTailscaleIp({}), null);
  // An interface that is present but has no addresses must not throw.
  assert.equal(findTailscaleIp({ Ethernet: undefined as any }), null);
});

test('IPv6 and internal addresses are ignored', () => {
  const found = findTailscaleIp({
    Tailscale: [iface('fd7a:115c:a1e0::1', { family: 'IPv6' as any }), iface('100.64.0.5')],
    Fake: [iface('100.64.0.9', { internal: true })],
  });
  assert.equal(found, '100.64.0.5');
});

test('a Tailscale-named interface wins over another CGNAT address', () => {
  // Some cellular modems hand out 100.64.x.x too. Binding to a hotspot address
  // believing it is a private tailnet would be exactly the wrong outcome.
  const found = findTailscaleIp({
    'Cellular Modem': [iface('100.70.1.1')],
    'Tailscale Tunnel': [iface('100.101.102.103')],
  });
  assert.equal(found, '100.101.102.103');
});

test('unset or loopback SERVER_HOST resolves to 127.0.0.1', () => {
  for (const raw of [undefined, null, '', '  ', 'localhost', '127.0.0.1', 'loopback']) {
    const r = resolveHost(raw as any);
    assert.equal(r.host, '127.0.0.1', JSON.stringify(raw));
    assert.equal(r.scope, 'loopback');
    assert.equal(r.error, undefined);
  }
});

test('SERVER_HOST=tailscale resolves to the tailnet address', () => {
  const r = resolveHost('tailscale', { Tailscale: [iface('100.101.102.103')] });
  assert.equal(r.host, '100.101.102.103');
  assert.equal(r.scope, 'tailscale');
});

test('SERVER_HOST=tailscale with no tailnet refuses and explains', () => {
  const r = resolveHost('tailscale', { 'Wi-Fi': [iface('192.168.1.50')] });
  assert.equal(r.host, null, 'must not fall back to a reachable address');
  assert.match(r.error || '', /no Tailscale address was found/);
});

test('0.0.0.0 and a LAN address are classed as exposed', () => {
  // The scope is what the bootstrap checks before refusing to bind without a
  // passcode, so a plain LAN address must not read as private.
  for (const raw of ['0.0.0.0', 'all', '192.168.1.50', '10.0.0.5', 'fire.example.com']) {
    assert.equal(resolveHost(raw).scope, 'exposed', raw);
  }
});

test('an explicit tailnet address is classed as a tailnet address', () => {
  const r = resolveHost('100.101.102.103');
  assert.equal(r.host, '100.101.102.103');
  assert.equal(r.scope, 'tailscale');
});
