import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import { createMultiplayerServer } from './multiplayer.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
};
const port = Number(process.env.PORT || 5173);
const httpServer = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname); }
  catch { response.writeHead(400); response.end('잘못된 주소입니다.'); return; }
  let path = resolve(root, `.${pathname}`);
  if (path !== resolve(root) && !path.startsWith(resolve(root) + sep)) {
    response.writeHead(403); response.end(); return;
  }
  try {
    if (!(await stat(path)).isFile()) throw new Error('Not a file');
  } catch {
    // Extension-less navigation uses the same SPA entry; missing assets remain 404.
    if (extname(pathname)) { response.writeHead(404); response.end('파일을 찾을 수 없습니다.'); return; }
    path = resolve(root, 'index.html');
  }
  try {
    const info = await stat(path);
    response.writeHead(200, {
      'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': path.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(path);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  } catch {
    response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('빌드 파일이 없습니다. npm run build를 먼저 실행해 주세요.');
  }
});
const multiplayer = createMultiplayerServer(httpServer);
httpServer.on('upgrade', (request, socket) => {
  try {
    if (new URL(request.url || '/', 'http://localhost').pathname !== '/ws') socket.destroy();
  } catch { socket.destroy(); }
});
httpServer.listen(port, '0.0.0.0', () => console.log(`Surf 서버: http://localhost:${port}`));
httpServer.on('error', (error) => { console.error(error.message); process.exitCode = 1; void shutdown(); });
async function shutdown() { await multiplayer.close(); httpServer.close(); }
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
