/**
 * Browser Channel over `WebSocket`. Buffers until `onMessage` is set so App can wait for `start`.
 */
import type { ClientMsg, ServerMsg } from "../shared";
import type { Channel } from "./channel";

export class WebSocketChannel implements Channel {
  private readonly ws: WebSocket;
  private fn: ((msg: ServerMsg) => void) | null = null;
  private readonly buf: ServerMsg[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMsg;
      if (this.fn) this.fn(msg);
      else this.buf.push(msg);
    });
  }

  send(msg: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else {
      this.ws.addEventListener("open", () => this.ws.send(JSON.stringify(msg)), { once: true });
    }
  }

  onMessage(fn: (msg: ServerMsg) => void): void {
    this.fn = fn;
    const pending = this.buf.splice(0);
    for (const msg of pending) fn(msg);
  }

  destroy(): void {
    this.fn = null;
    this.ws.close();
  }
}
