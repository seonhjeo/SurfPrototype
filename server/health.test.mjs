import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { handleHealthRequest } from './health.mjs';

test('readiness supports cross-origin wake-up without falling through to the game page', async (t) => {
  const server = createServer((request, response) => {
    if (!handleHealthRequest(request, response)) { response.writeHead(404); response.end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${url}/healthz`, { headers: { Origin: 'https://surf-prototype.vercel.app' } });
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok', service: 'surf-multiplayer' });
  assert.equal((await fetch(`${url}/healthz`, { method: 'OPTIONS' })).status, 204);
  assert.equal((await fetch(`${url}/healthz`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${url}/healthz-extra`)).status, 404);
});
