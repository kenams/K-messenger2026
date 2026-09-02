import http from "node:http";
import { createSocketServer } from "./server.js";
import { env } from "./env.js";

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

createSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[k-ssenger-server] listening on :${env.PORT} (${env.NODE_ENV})`);
});
