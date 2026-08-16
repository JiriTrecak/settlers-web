import { Application } from "pixi.js";
import { Session } from "../../session";

/** Pixi host. Session owns the match. */
export class GameApp {
  private pixi: Application | null = null;
  private session: Session | null = null;

  constructor(
    private readonly gameRoot: HTMLElement,
    private readonly hudRoot: HTMLElement,
  ) {}

  async start(): Promise<void> {
    const pixi = new Application();
    await pixi.init({
      background: 0x020814,
      resizeTo: window,
      antialias: false,
      preference: "webgl",
    });
    this.pixi = pixi;
    this.gameRoot.appendChild(pixi.canvas);

    const session = new Session(pixi, this.hudRoot);
    this.session = session;
    await session.start();

    pixi.ticker.add((ticker) => {
      session.tick(ticker.deltaMS, performance.now());
    });
  }

  stop(): void {
    this.session?.stop();
    this.session = null;
    this.pixi?.destroy(true);
    this.pixi = null;
  }
}
