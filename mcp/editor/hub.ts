/**
 * Localhost WebSocket the editor tab joins. MCP tools call through here.
 * First process hosts :7380; a second (Cursor stdio) joins instead of crashing.
 * Stdio MCP must not write to stdout — use stderr.
 */
import { WebSocket, WebSocketServer, type WebSocket as Ws } from "ws";
import {
  EDITOR_MCP_HOST,
  EDITOR_MCP_PORT,
  editorMcpUrl,
  parseRpcHello,
  parseRpcReq,
  parseRpcRes,
} from "../../src/shared/control/rpc";

type Wait = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type Proxy = { ws: Ws; id: number };

export class EditorHub {
  private mode: "idle" | "host" | "join" = "idle";
  private wss: WebSocketServer | null = null;
  private tab: Ws | null = null;
  private uplink: Ws | null = null;
  private readonly controllers = new Set<Ws>();
  private nextId = 1;
  private readonly pending = new Map<number, Wait>();
  private readonly proxied = new Map<number, Proxy>();

  get connected(): boolean {
    if (this.mode === "join") return this.uplink?.readyState === 1;
    return this.tab?.readyState === 1;
  }

  /** Bind the hub, or attach to whoever already owns the port. */
  listen(port = EDITOR_MCP_PORT): Promise<"host" | "join"> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ host: EDITOR_MCP_HOST, port });
      const onError = (err: NodeJS.ErrnoException) => {
        wss.off("listening", onListen);
        if (err.code === "EADDRINUSE") {
          wss.close();
          void this.join(port).then(() => resolve("join"), reject);
          return;
        }
        reject(err);
      };
      const onListen = () => {
        wss.off("error", onError);
        this.mode = "host";
        this.wss = wss;
        console.error(`editor hub ws://${EDITOR_MCP_HOST}:${port}`);
        resolve("host");
      };
      wss.on("error", onError);
      wss.on("listening", onListen);
      wss.on("connection", (ws) => this.attach(ws));
    });
  }

  stop(): void {
    this.failPending("editor hub stopped");
    for (const ws of this.wss?.clients ?? []) ws.close();
    this.uplink?.close();
    for (const ws of this.controllers) ws.close();
    this.controllers.clear();
    this.wss?.close();
    this.wss = null;
    this.tab = null;
    this.uplink = null;
    this.mode = "idle";
  }

  async call(op: string, params?: unknown, timeoutMs = 8000): Promise<unknown> {
    const ws = this.mode === "join" ? this.uplink : this.tab;
    if (!ws || ws.readyState !== 1) {
      throw new Error("Editor not connected. Open the world editor (?screen=editor) while this MCP server is running.");
    }
    const id = this.nextId++;
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`editor op '${op}' timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
    ws.send(JSON.stringify({ id, op, params }));
    return result;
  }

  private join(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(editorMcpUrl(port));
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`editor hub busy on ${port} but join timed out`));
      }, 3000);
      ws.once("open", () => {
        clearTimeout(timer);
        this.mode = "join";
        this.uplink = ws;
        ws.send(JSON.stringify({ role: "mcp" }));
        ws.on("message", (data) => this.onReply(String(data)));
        ws.on("close", () => {
          if (this.uplink === ws) this.uplink = null;
          this.failPending("editor hub closed");
        });
        console.error(`editor hub: joined existing ws://${EDITOR_MCP_HOST}:${port}`);
        resolve();
      });
      ws.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private attach(ws: Ws): void {
    ws.on("message", (data) => this.onHost(ws, String(data)));
    ws.on("close", () => this.drop(ws));
  }

  private onHost(ws: Ws, text: string): void {
    const raw = parseJson(text);
    if (!raw) return;
    const hello = parseRpcHello(raw);
    if (hello) {
      this.identify(ws, hello.role);
      return;
    }
    const req = parseRpcReq(raw);
    if (req) {
      if (!this.controllers.has(ws)) this.identify(ws, "mcp");
      this.proxy(ws, req);
      return;
    }
    const res = parseRpcRes(raw);
    if (!res) return;
    if (!this.tab) this.tab = ws;
    this.settle(res);
  }

  private onReply(text: string): void {
    const raw = parseJson(text);
    if (!raw) return;
    const res = parseRpcRes(raw);
    if (res) this.settle(res);
  }

  private identify(ws: Ws, role: "tab" | "mcp"): void {
    if (role === "tab") {
      // Keep older tabs connected but inactive. Closing them starts their retry
      // loop, which otherwise repeatedly steals the bridge back from this tab.
      this.tab = ws;
      this.controllers.delete(ws);
      console.error("editor hub: tab connected");
      return;
    }
    if (this.tab === ws) this.tab = null;
    this.controllers.add(ws);
    console.error(`editor hub: mcp joined (${this.controllers.size})`);
  }

  private proxy(ws: Ws, req: { id: number; op: string; params?: unknown }): void {
    if (!this.tab || this.tab.readyState !== 1) {
      if (ws.readyState === 1) {
        ws.send(
          JSON.stringify({
            id: req.id,
            ok: false,
            error: "Editor not connected. Open the world editor (?screen=editor) while this MCP server is running.",
          }),
        );
      }
      return;
    }
    const hid = this.nextId++;
    this.proxied.set(hid, { ws, id: req.id });
    this.tab.send(JSON.stringify({ id: hid, op: req.op, params: req.params }));
  }

  private settle(res: { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string }): void {
    const wait = this.pending.get(res.id);
    if (wait) {
      this.pending.delete(res.id);
      if (res.ok) wait.resolve(res.result);
      else wait.reject(new Error(res.error));
      return;
    }
    const proxy = this.proxied.get(res.id);
    if (!proxy) return;
    this.proxied.delete(res.id);
    if (proxy.ws.readyState === 1) proxy.ws.send(JSON.stringify({ ...res, id: proxy.id }));
  }

  private drop(ws: Ws): void {
    this.controllers.delete(ws);
    if (this.tab !== ws) {
      for (const [hid, p] of this.proxied) {
        if (p.ws !== ws) continue;
        this.proxied.delete(hid);
      }
      return;
    }
    this.tab = null;
    this.failPending("editor disconnected");
    for (const [hid, p] of this.proxied) {
      this.proxied.delete(hid);
      if (p.ws.readyState === 1) {
        p.ws.send(JSON.stringify({ id: p.id, ok: false, error: "editor disconnected" }));
      }
    }
  }

  private failPending(message: string): void {
    for (const [id, wait] of this.pending) {
      this.pending.delete(id);
      wait.reject(new Error(message));
    }
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
