import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForMultiplayerServer } from '../src/server-warmup.ts';

test('cold server loading pages are retried until the real multiplayer service is ready', async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    assert.equal(String(input), 'https://game.example/healthz');
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.cache, 'no-store');
    attempts++;
    if (attempts === 1) return new Response('Starting', { status: 503 });
    if (attempts === 2) return new Response('<html>Loading</html>');
    return Response.json({ status: 'ok', service: 'surf-multiplayer' });
  });
  await waitForMultiplayerServer('wss://game.example/ws?ignored=value', new AbortController().signal, { retryMs: 1, timeoutMs: 1000 });
  assert.equal(attempts, 3);
});

test('cancelling an in-flight server wake-up aborts its request and prevents retries', async (t) => {
  const controller = new AbortController();
  let attempts = 0;
  let aborted = false;
  t.mock.method(globalThis, 'fetch', (_input, options) => new Promise((_resolve, reject) => {
    attempts++;
    options?.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
  }));
  const wakeup = waitForMultiplayerServer('wss://game.example/ws', controller.signal);
  controller.abort();
  await assert.rejects(wakeup, /취소/);
  assert.equal(attempts, 1);
  assert.equal(aborted, true);
});

test('wrong service responses have a bounded wait instead of opening a game socket', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'ok', service: 'another-app' }));
  await assert.rejects(waitForMultiplayerServer('wss://game.example/ws', new AbortController().signal,
    { timeoutMs: 20, retryMs: 5 }), /시작이 지연/);
});
