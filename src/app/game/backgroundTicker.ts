/** Keep hidden/throttled multiplayer clients ticking without capping a visible
 * unfocused game. A worker is a fallback for stalled frames, not a second clock. */
const WORKER_MS = 25;

const WORKER_SRC = `
let id = 0;
onmessage = (e) => {
  if (e.data === "start") {
    clearInterval(id);
    id = setInterval(() => {
      if (self.navigator && self.navigator.locks) self.navigator.locks.request("s3-tick", () => {});
      postMessage(0);
    }, ${WORKER_MS});
  }
  if (e.data === "stop") clearInterval(id);
};
`;

export type TickLoop = {
  startRaf(): void;
  stopRaf(): void;
  pump(): void;
  needsPump(): boolean;
};

export class BackgroundTicker {
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private audio: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private background = false;
  private readonly onFocus = (): void => this.sync();
  private readonly onBlur = (): void => this.sync();
  private readonly onVis = (): void => {
    void this.audio?.resume();
    this.sync();
  };
  private readonly onGesture = (): void => {
    this.ensureAudio();
    void this.audio?.resume();
  };

  constructor(private readonly loop: TickLoop) {}

  start(): void {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
    this.workerUrl = url;
    const worker = new Worker(url);
    this.worker = worker;
    worker.onmessage = () => {
      if (!this.background && !this.loop.needsPump()) return;
      this.loop.pump();
    };
    worker.postMessage("start");
    window.addEventListener("focus", this.onFocus);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVis);
    window.addEventListener("pointerdown", this.onGesture);
    this.ensureAudio();
    this.sync();
  }

  destroy(): void {
    window.removeEventListener("focus", this.onFocus);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVis);
    window.removeEventListener("pointerdown", this.onGesture);
    this.worker?.postMessage("stop");
    this.worker?.terminate();
    this.worker = null;
    if (this.workerUrl) URL.revokeObjectURL(this.workerUrl);
    this.workerUrl = null;
    this.osc?.stop();
    this.osc = null;
    void this.audio?.close();
    this.audio = null;
    this.loop.startRaf();
  }

  /** Visible windows keep rAF, even without focus. Hidden windows use the worker. */
  private sync(): void {
    const background = document.hidden;
    this.background = background;
    if (background) this.loop.stopRaf();
    else this.loop.startRaf();
    void this.audio?.resume();
  }

  /** Near-silent tone so Chrome treats the tab as audible and does not park rAF. */
  private ensureAudio(): void {
    if (this.audio) return;
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 20;
    gain.gain.value = 0.00002;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    this.audio = ctx;
    this.osc = osc;
    void ctx.resume();
  }
}
