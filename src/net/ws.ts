/**
 * Browser Channel over `WebSocket`. Buffers until a listener exists. Multiple `onMessage` handlers (App wait + Lockstep).
 */
import type { ClientMsg, ServerMsg } from "../shared";
import type { Channel } from "./channel";

export class WebSocketChannel implements Channel {
  private readonly ws: WebSocket;
  private readonly fns: Array<(msg: ServerMsg) => void> = [];
  private readonly buf: ServerMsg[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMsg;
      if (this.fns.length === 0) this.buf.push(msg);
      else for (const fn of this.fns) fn(msg);
    });
  }

  send(msg: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else {
      this.ws.addEventListener("open", () => this.ws.send(JSON.stringify(msg)), { once: true });
    }
  }

  onMessage(fn: (msg: ServerMsg) => void): void {
    this.fns.push(fn);
    const pending = this.buf.splice(0);
    for (const msg of pending) fn(msg);
  }

  destroy(): void {
    this.fns.length = 0;
    this.ws.close();
  }
}
