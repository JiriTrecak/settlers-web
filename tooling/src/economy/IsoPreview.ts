/**
 * Iso grid + hut preview for the economy editor.
 * Origin cell is the snap point; sprites sit on `gridToWorld(origin)` like the game.
 */
import { Application, Container, Graphics, Sprite } from "pixi.js";
import { Camera } from "../../../src/render/camera/camera";
import { atlasPacksForCivs, loadAtlases } from "../../../src/render/graphics/atlas";
import { loadGroup, placeLayer, type CatalogSprite, type PropFrame } from "../../../src/render/graphics/textures";
import { gridToWorld, pickCell } from "../../../src/shared";

const GRID = 24;
const ORIGIN = 12;
const WASD = 900;

export type HutVariant = "built" | "scaffold";

export class IsoPreview {
  readonly camera = new Camera();
  private readonly world = new Container();
  private readonly grid = new Graphics();
  private readonly hover = new Graphics();
  private readonly pin = new Graphics();
  private readonly shadow = new Sprite();
  private readonly hut = new Sprite();
  private sprites: CatalogSprite[] | null = null;
  private loadGen = 0;
  private variant: HutVariant = "built";
  private builtFrame: PropFrame | null = null;
  private scaffoldFrame: PropFrame | null = null;
  private hovering: { x: number; y: number } | null = null;
  private pinned: { x: number; y: number } | null = null;
  private dragging = false;
  private dragMoved = false;
  private last: { x: number; y: number } | null = null;
  private readonly keys = new Set<string>();
  private readonly onSnap: (text: string) => void;
  private dead = false;

  constructor(
    private readonly app: Application,
    onSnap: (text: string) => void,
  ) {
    this.onSnap = onSnap;
    this.camera.zoom = 4;
    this.camera.minZoom = 1;
    this.camera.maxZoom = 12;
    this.world.eventMode = "none";
    this.grid.eventMode = "none";
    this.hover.eventMode = "none";
    this.pin.eventMode = "none";
    this.shadow.eventMode = "none";
    this.hut.eventMode = "none";
    this.world.addChild(this.grid, this.hover, this.pin, this.shadow, this.hut);
    this.app.canvas.style.cursor = "grab";
  }

  async start(sprites: CatalogSprite[] | null): Promise<void> {
    this.sprites = sprites;
    this.app.stage.addChild(this.world);
    this.drawGrid();
    this.lookAtOrigin();
    this.bind();
    this.emitSnap();
  }

  destroy(): void {
    this.dead = true;
    this.loadGen++;
    this.unbind();
    this.app.canvas.style.cursor = "";
    this.world.removeFromParent();
    this.world.destroy({ children: true });
  }

  tick(dtMs: number): void {
    if (this.keys.size === 0) return;
    const step = WASD * (dtMs / 1000);
    let dx = 0;
    let dy = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx += step;
    if (this.keys.has("d") || this.keys.has("arrowright")) dx -= step;
    if (this.keys.has("w") || this.keys.has("arrowup")) dy += step;
    if (this.keys.has("s") || this.keys.has("arrowdown")) dy -= step;
    if (!dx && !dy) return;
    this.camera.pan(dx, dy);
    this.applyCamera();
  }

  setVariant(variant: HutVariant): void {
    this.variant = variant;
    this.paintHut();
  }

  async show(civ: string, built: string, scaffold: string): Promise<void> {
    const gen = ++this.loadGen;
    if (this.sprites) await loadAtlases(atlasPacksForCivs([civ]));
    if (this.dead || gen !== this.loadGen) return;
    const sprites = this.sprites;
    const [builtFrames, scaffoldFrames] = sprites
      ? await Promise.all([
          built ? loadGroup(sprites, built, "built") : Promise.resolve([]),
          scaffold ? loadGroup(sprites, scaffold, "scaffold") : Promise.resolve([]),
        ])
      : [[], []];
    if (this.dead || gen !== this.loadGen) return;
    this.builtFrame = builtFrames[0] ?? null;
    this.scaffoldFrame = scaffoldFrames[0] ?? this.builtFrame;
    this.paintHut();
  }

  private paintHut(): void {
    const frame = this.variant === "scaffold" ? this.scaffoldFrame : this.builtFrame;
    const origin = gridToWorld(ORIGIN, ORIGIN);
    if (!frame) {
      this.hut.visible = false;
      this.shadow.visible = false;
      return;
    }
    this.hut.visible = true;
    placeLayer(this.hut, frame, origin.x, origin.y);
    if (frame.shadow) {
      this.shadow.visible = true;
      placeLayer(this.shadow, frame.shadow, origin.x, origin.y);
    } else {
      this.shadow.visible = false;
    }
  }

  private lookAtOrigin(): void {
    const o = gridToWorld(ORIGIN, ORIGIN);
    const r = this.app.renderer;
    this.camera.lookAt(o.x, o.y, r.width, r.height);
    this.camera.pan(-160, 0);
    this.applyCamera(true);
  }

  private applyCamera(redrawGrid = false): void {
    this.world.position.set(this.camera.panX, this.camera.panY);
    this.world.scale.set(this.camera.zoom);
    if (redrawGrid) {
      this.drawGrid();
      this.paintMarks();
    }
  }

  private drawGrid(): void {
    const g = this.grid;
    g.clear();
    const width = 1 / this.camera.zoom;
    for (let y = 0; y < GRID - 1; y++) {
      for (let x = 0; x < GRID - 1; x++) {
        const quad = cellQuad(x, y);
        const origin = x === ORIGIN && y === ORIGIN;
        if (origin) g.poly(quad).fill({ color: 0xe8c36a, alpha: 0.28 });
        g.poly(quad).stroke({
          color: origin ? 0xe8c36a : 0x3a4a62,
          width,
          alpha: origin ? 0.95 : 0.55,
          alignment: 0.5,
        });
      }
    }
    const o = gridToWorld(ORIGIN, ORIGIN);
    g.circle(o.x, o.y, 2 / this.camera.zoom).fill({ color: 0xfff3c4 });
  }

  private paintMarks(): void {
    const width = 1.25 / this.camera.zoom;
    this.hover.clear();
    this.pin.clear();
    if (this.hovering) {
      this.hover.poly(cellQuad(this.hovering.x, this.hovering.y)).stroke({
        color: 0xffffff,
        width,
        alpha: 0.8,
        alignment: 0.5,
      });
    }
    if (this.pinned) {
      this.pin.poly(cellQuad(this.pinned.x, this.pinned.y)).stroke({
        color: 0x7ec8e3,
        width,
        alpha: 0.95,
        alignment: 0.5,
      });
    }
  }

  private bind(): void {
    const canvas = this.app.canvas;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
  }

  private unbind(): void {
    const canvas = this.app.canvas;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.dragging = true;
    this.dragMoved = false;
    this.last = { x: e.clientX, y: e.clientY };
    this.app.canvas.style.cursor = "grabbing";
    this.app.canvas.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.dragging && this.last) {
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      if (!this.dragMoved && dx * dx + dy * dy > 16) this.dragMoved = true;
      if (this.dragMoved) {
        this.camera.pan(dx, dy);
        this.last = { x: e.clientX, y: e.clientY };
        this.applyCamera();
      }
      return;
    }
    const cell = this.cellAt(e);
    if (cell == null) {
      if (this.hovering) {
        this.hovering = null;
        this.paintMarks();
        this.emitSnap();
      }
      return;
    }
    if (this.hovering?.x === cell.x && this.hovering.y === cell.y) return;
    this.hovering = cell;
    this.paintMarks();
    this.emitSnap();
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    this.last = null;
    this.app.canvas.style.cursor = "grab";
    try {
      this.app.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (e.button !== 0 || this.dragMoved) return;
    const cell = this.cellAt(e);
    if (!cell) return;
    if (this.pinned?.x === cell.x && this.pinned.y === cell.y) this.pinned = null;
    else this.pinned = cell;
    this.paintMarks();
    this.emitSnap();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    this.applyCamera(true);
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (typingIn(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "home") {
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      this.lookAtOrigin();
      return;
    }
    this.keys.add(k);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private readonly onResize = (): void => {
    this.applyCamera();
  };

  private cellAt(e: PointerEvent): { x: number; y: number } | null {
    const rect = this.app.canvas.getBoundingClientRect();
    const world = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    // Diamond containment (game pick). pickGrid is the north corner, not the cell.
    return pickCell(world.x, world.y, GRID, GRID, () => 0);
  }

  private emitSnap(): void {
    const cell = this.pinned ?? this.hovering;
    if (!cell) {
      this.onSnap("origin 0, 0 · click a tile to pin");
      return;
    }
    const dx = cell.x - ORIGIN;
    const dy = cell.y - ORIGIN;
    const pin = this.pinned ? "pinned" : "hover";
    this.onSnap(`${pin}  ${fmtDelta(dx)}, ${fmtDelta(dy)}  from origin`);
  }
}

function cellQuad(x: number, y: number): { x: number; y: number }[] {
  return [gridToWorld(x, y), gridToWorld(x + 1, y), gridToWorld(x + 1, y + 1), gridToWorld(x, y + 1)];
}

function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function fmtDelta(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}
