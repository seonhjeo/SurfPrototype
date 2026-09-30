import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { createMultiplayerServer } from './multiplayer.mjs';
import { handleHealthRequest } from './health.mjs';

const port = Number(process.env.PORT || 5173);
const httpServer = createServer();
const vite = await createViteServer({
  server: { middlewareMode: true, host: '0.0.0.0', hmr: { server: httpServer } },
});
httpServer.on('request', (request, response) => {
  if (!handleHealthRequest(request, response)) vite.middlewares(request, response);
});
const multiplayer = createMultiplayerServer(httpServer);
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Surf 개발 서버: http://localhost:${port} · 같은 네트워크에서 이 컴퓨터의 IP:${port}로 접속`);
});
httpServer.on('error', (error) => { console.error(error.message); process.exitCode = 1; void shutdown(); });
async function shutdown() {
  await multiplayer.close();
  await vite.close();
  httpServer.close();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
