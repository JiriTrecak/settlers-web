/**
 * MatchHost HTTP + WebSocket. Mailbox only — no Pixi, no World.
 * Binds 0.0.0.0:8787. Clients use MATCH_HOST (EC2), not a Vite proxy.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import { MatchHost } from "../src/net/host";
import type { CreateRoom, JoinRoom } from "../src/shared";

const PORT = Number(process.env.PORT ?? 8787);
const BIND = process.env.BIND ?? "0.0.0.0";
const VERSION = "0.1.0";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

const host = new MatchHost();

const server = createServer((req, res) => {
  void handle(req, res);
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "", "http://match");
  const m = /^\/match\/([^/]+)$/.exec(url.pathname);
  const token = url.searchParams.get("token") ?? "";
  const room = m ? host.get(decodeURIComponent(m[1]!)) : undefined;
  if (!room || !token) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const bound = room.bind(token, (msg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    });
    if ("error" in bound) {
      ws.close();
      return;
    }
    ws.on("message", (raw) => {
      try {
        room.ingest(token, JSON.parse(String(raw)));
      } catch {
        ws.send(JSON.stringify({ type: "error", code: "bad_json", message: "bad json" }));
      }
    });
    ws.on("close", () => room.unbind(token));
  });
});

server.listen(PORT, BIND, () => {
  console.log(`matchhost ${VERSION} ${BIND}:${PORT}`);
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  const url = new URL(req.url ?? "/", "http://match");
  const path = url.pathname;
  try {
    if (req.method === "GET" && path === "/api/health") {
      send(res, 200, { ok: true, version: VERSION });
      return;
    }
    if (req.method === "GET" && path === "/api/rooms") {
      send(res, 200, host.list());
      return;
    }
    const one = /^\/api\/rooms\/([^/]+)$/.exec(path);
    if (req.method === "GET" && one) {
      const room = host.get(decodeURIComponent(one[1]!));
      if (!room) {
        send(res, 404, { error: "not_found" });
        return;
      }
      send(res, 200, room.view());
      return;
    }
    if (req.method === "POST" && path === "/api/rooms") {
      const body = (await readJson(req)) as CreateRoom;
      if (!body?.mapId || !body?.guestName) {
        send(res, 400, { error: "bad_body" });
        return;
      }
      send(res, 200, host.create({ ...body, mapRevision: body.mapRevision ?? body.mapId, name: body.name ?? "room" }));
      return;
    }
    const join = /^\/api\/rooms\/([^/]+)\/join$/.exec(path);
    if (req.method === "POST" && join) {
      const room = host.get(decodeURIComponent(join[1]!));
      if (!room) {
        send(res, 404, { error: "not_found" });
        return;
      }
      const body = (await readJson(req)) as JoinRoom;
      const out = room.join(body.guestName ?? "guest", body.role === "spectator" ? "spectator" : "player");
      if ("error" in out) {
        send(res, 400, out);
        return;
      }
      send(res, 200, { token: out.token, room: room.view(), you: out.you });
      return;
    }
    const start = /^\/api\/rooms\/([^/]+)\/start$/.exec(path);
    if (req.method === "POST" && start) {
      const room = host.get(decodeURIComponent(start[1]!));
      const token = bearer(req);
      if (!room || !token) {
        send(res, 404, { error: "not_found" });
        return;
      }
      const out = room.start(token);
      if ("error" in out) {
        send(res, 400, out);
        return;
      }
      send(res, 200, { ok: true, config: out.config });
      return;
    }
    const leave = /^\/api\/rooms\/([^/]+)\/leave$/.exec(path);
    if (req.method === "POST" && leave) {
      const room = host.get(decodeURIComponent(leave[1]!));
      const token = bearer(req);
      if (room && token) room.leave(token);
      send(res, 200, { ok: true });
      return;
    }
    send(res, 404, { error: "not_found" });
  } catch (err) {
    send(res, 500, { error: err instanceof Error ? err.message : "error" });
  }
}

function bearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...CORS });
  res.end(data);
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}
