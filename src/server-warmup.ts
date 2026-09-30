const cancelled = () => new Error('서버 연결을 취소했습니다.');

function pause(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(cancelled()); return; }
    const abort = () => { clearTimeout(timer); reject(cancelled()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, delay);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function waitForMultiplayerServer(socketUrl: string, signal: AbortSignal, {
  timeoutMs = 120_000, attemptMs = 10_000, retryMs = 2_000,
} = {}): Promise<void> {
  const url = new URL(socketUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '/healthz'; url.search = ''; url.hash = '';
  const deadline = Date.now() + timeoutMs;
  while (!signal.aborted && Date.now() < deadline) {
    const attempt = new AbortController();
    const abort = () => attempt.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, Math.min(attemptMs, deadline - Date.now()));
    try {
      const response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: attempt.signal });
      const body: unknown = await response.json();
      if (signal.aborted) throw cancelled();
      if (response.ok && typeof body === 'object' && body !== null
        && 'status' in body && body.status === 'ok' && 'service' in body && body.service === 'surf-multiplayer') return;
    } catch { if (signal.aborted) throw cancelled(); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
    const remaining = deadline - Date.now();
    if (remaining > 0) await pause(Math.min(retryMs, remaining), signal);
  }
  if (signal.aborted) throw cancelled();
  throw new Error('서버 시작이 지연되고 있습니다. 잠시 후 다시 접속해 주세요.');
}
