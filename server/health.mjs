const BODY = JSON.stringify({ status: 'ok', service: 'surf-multiplayer' });

/** Public readiness check used before opening a socket to a sleeping free server. */
export function handleHealthRequest(request, response) {
  if (request.url?.split('?')[0] !== '/healthz') return false;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  // This route exposes only readiness, never room state or credentials.
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return true; }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD, OPTIONS' }); response.end(); return true;
  }
  response.writeHead(200);
  response.end(request.method === 'HEAD' ? undefined : BODY);
  return true;
}
