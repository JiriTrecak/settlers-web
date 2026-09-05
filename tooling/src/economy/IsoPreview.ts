/**
 * Iso grid + hut preview for the economy editor.
 * Origin cell is the snap point; sprites sit on `gridToWorld(origin)` like the game.
 * Building mode paints occupancy; Function mode paints door / flag / stacks.
 */
import { Application, Container, Graphics, Sprite } from "pixi.js";
import { Camera } from "../../../src/render/camera/camera";
import { atlasPacksForCivs, loadAtlases } from "../../../src/render/graphics/atlas";
import { loadGroup, placeLayer, type CatalogSprite, type PropFrame } from "../../../src/render/graphics/textures";
import { deltaOf, gridToWorld, pickCell, PLAYER_COLORS } from "../../../src/shared";
import { hasRel, type DirRel, type Rel, type StackSlot } from "./format";

const GRID = 24;
const ORIGIN = 12;
const WASD = 900;
/** Match `.ed-left` / `.ed-right` so the hut sits in the remaining gap. */
const CHROME_LEFT = 280;
const CHROME_RIGHT = 348;

export type HutVariant = "built" | "scaffold";
export type OccupancyLayer = "blocked" | "protected" | "buildMarks";
export type SiteLayer = "door" | "flag" | "workSpot" | "workCenter" | "request" | "offer";
export type PaintLayer = OccupancyLayer | SiteLayer;

export type SiteState = {
  door: Rel;
  flag: Rel;
  workSpot: DirRel | null;
  workCenter: Rel | null;
  request: StackSlot[];
  offer: StackSlot[];
  /** Picks roof vs door flag sheet. Null → door (houses / towers). */
  worker?: string | null;
};

export class IsoPreview {
  readonly camera = new Camera();
  private readonly world = new Container();
  private readonly grid = new Graphics();
  private readonly plot = new Graphics();
  private readonly hover = new Graphics();
  private readonly hut = new Sprite();
  private readonly postLayer = new Container();
  private readonly posts: Sprite[] = [];
  private readonly flagShadow = new Sprite();
  private readonly flagBody = new Sprite();
  private readonly flagTorso = new Sprite();
  private blocked: Rel[] = [];
  private protectedCells: Rel[] = [];
  private marks: Rel[] = [];
  private sites: SiteState = {
    door: { dx: 0, dy: 0 },
    flag: { dx: 0, dy: 0 },
    workSpot: null,
    workCenter: null,
    request: [],
    offer: [],
    worker: null,
  };
  private postFrame: PropFrame | null = null;
  private flagDoor: PropFrame[] = [];
  private flagRoof: PropFrame[] = [];
  private flagMs = 0;
  private flagStep = 0;
  private sprites: CatalogSprite[] | null = null;
  private loadGen = 0;
  private variant: HutVariant = "built";
  private builtFrame: PropFrame | null = null;
  private scaffoldFrame: PropFrame | null = null;
  private hovering: { x: number; y: number } | null = null;
  private dragging = false;
  private dragMoved = false;
  private painting = false;
  private paintOn = true;
  private paintLayer: PaintLayer | null = null;
  private onPaint: ((dx: number, dy: number, on: boolean) => void) | null = null;
  private last: { x: number; y: number } | null = null;
  private readonly keys = new Set<string>();
  private readonly onSnap: (text: string) => void;
  private dead = false;

  constructor(
    private readonly app: Application,
    onSnap: (text: string) => void,
  ) {
    this.onSnap = onSnap;
    this.camera.zoom = 2.5;
    this.camera.minZoom = 1;
    this.camera.maxZoom = 12;
    this.world.eventMode = "none";
    this.grid.eventMode = "none";
    this.plot.eventMode = "none";
    this.hover.eventMode = "none";
    this.hut.eventMode = "none";
    this.postLayer.eventMode = "none";
    this.flagShadow.eventMode = "none";
    this.flagBody.eventMode = "none";
    this.flagTorso.eventMode = "none";
    this.hut.alpha = 0.88;
    this.flagTorso.tint = PLAYER_COLORS[0];
    this.world.addChild(this.grid, this.plot, this.hut, this.postLayer, this.flagShadow, this.flagBody, this.flagTorso, this.hover);
    this.app.canvas.style.cursor = "grab";
  }

  async start(sprites: CatalogSprite[] | null): Promise<void> {
    this.sprites = sprites;
    this.app.stage.addChild(this.world);
    if (sprites) {
      await loadAtlases(atlasPacksForCivs(["roman"]));
      this.postFrame =
        (await loadGroup(sprites, "props/site-post"))[0] ??
        (await loadGroup(sprites, "uncatalogued/settler/01/092"))[0] ??
        null;
      this.flagDoor = await loadGroup(sprites, "props/flag-door");
      this.flagRoof = await loadGroup(sprites, "props/flag-roof");
    }
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
    this.flagMs += dtMs;
    const step = (this.flagMs / 100) | 0;
    if (step !== this.flagStep) {
      this.flagStep = step;
      this.paintFlag();
    }
    if (this.keys.size === 0) return;
    const pan = WASD * (dtMs / 1000);
    let dx = 0;
    let dy = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx += pan;
    if (this.keys.has("d") || this.keys.has("arrowright")) dx -= pan;
    if (this.keys.has("w") || this.keys.has("arrowup")) dy += pan;
    if (this.keys.has("s") || this.keys.has("arrowdown")) dy -= pan;
    if (!dx && !dy) return;
    this.camera.pan(dx, dy);
    this.applyCamera();
  }

  setVariant(variant: HutVariant): void {
    this.variant = variant;
    this.paintHut();
  }

  setHutAlpha(alpha: number): void {
    this.hut.alpha = Math.min(1, Math.max(0, alpha));
  }

  setPlot(blocked: readonly Rel[], protectedCells: readonly Rel[], marks: readonly Rel[] = []): void {
    this.blocked = blocked.slice();
    this.protectedCells = protectedCells.slice();
    this.marks = marks.slice();
    this.paintPlot();
    this.paintPosts();
  }

  setSites(sites: SiteState): void {
    this.sites = {
      door: { ...sites.door },
      flag: { ...sites.flag },
      workSpot: sites.workSpot ? { ...sites.workSpot } : null,
      workCenter: sites.workCenter ? { ...sites.workCenter } : null,
      request: sites.request.slice(),
      offer: sites.offer.slice(),
      worker: sites.worker ?? null,
    };
    this.paintPlot();
    this.paintFlag();
  }

  /** `layer` null = pan with LMB. Else LMB paints, RMB erases, Alt+LMB pans. */
  setPaint(layer: PaintLayer | null, onPaint: ((dx: number, dy: number, on: boolean) => void) | null): void {
    this.paintLayer = layer;
    this.onPaint = onPaint;
    this.app.canvas.style.cursor = layer ? "cell" : "grab";
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
      return;
    }
    this.hut.visible = true;
    placeLayer(this.hut, frame, origin.x, origin.y);
  }

  private paintPlot(): void {
    const g = this.plot;
    g.clear();
    const width = 1.4 / this.camera.zoom;
    for (const r of this.protectedCells) {
      g.poly(cellQuad(ORIGIN + r.dx, ORIGIN + r.dy)).fill({ color: 0x7ec8e3, alpha: 0.18 });
    }
    for (const r of this.blocked) {
      g.poly(cellQuad(ORIGIN + r.dx, ORIGIN + r.dy)).fill({ color: 0xe8c36a, alpha: 0.38 });
    }
    for (const r of this.marks) {
      g.poly(cellQuad(ORIGIN + r.dx, ORIGIN + r.dy)).stroke({
        color: 0xd08a58,
        width,
        alpha: 0.95,
        alignment: 0.5,
      });
    }
    for (const r of this.sites.request) {
      fillCell(g, r, 0xb388ff, 0.28);
    }
    for (const r of this.sites.offer) {
      fillCell(g, r, 0x7dffb3, 0.28);
    }
    fillCell(g, this.sites.door, 0xffffff, 0.22);
    fillCell(g, this.sites.flag, 0xff6b5a, 0.28);
    if (this.sites.workCenter) {
      g.poly(cellQuad(ORIGIN + this.sites.workCenter.dx, ORIGIN + this.sites.workCenter.dy)).stroke({
        color: 0x7dffb3,
        width: width * 1.4,
        alpha: 0.95,
        alignment: 0.5,
      });
    }
    if (this.sites.workSpot) {
      const spot = this.sites.workSpot;
      fillCell(g, spot, 0xe07aff, 0.32);
      const from = gridToWorld(ORIGIN + spot.dx + 0.5, ORIGIN + spot.dy + 0.5);
      const d = deltaOf(spot.direction);
      const to = gridToWorld(ORIGIN + spot.dx + 0.5 + d.dx * 0.45, ORIGIN + spot.dy + 0.5 + d.dy * 0.45);
      g.moveTo(from.x, from.y);
      g.lineTo(to.x, to.y);
      g.stroke({ color: 0xfff3c4, width: width * 1.6, alpha: 1 });
    }
  }

  private paintPosts(): void {
    const frame = this.postFrame;
    this.ensurePosts(this.marks.length);
    for (let i = 0; i < this.posts.length; i++) {
      const sprite = this.posts[i]!;
      const mark = this.marks[i];
      if (!frame || !mark) {
        sprite.visible = false;
        continue;
      }
      const at = gridToWorld(ORIGIN + mark.dx, ORIGIN + mark.dy);
      sprite.visible = true;
      placeLayer(sprite, frame, at.x, at.y);
    }
  }

  private paintFlag(): void {
    const frames = this.sites.worker ? this.flagRoof : this.flagDoor;
    const frame = frames.length > 0 ? frames[this.flagStep % frames.length]! : null;
    if (!frame) {
      this.flagShadow.visible = false;
      this.flagBody.visible = false;
      this.flagTorso.visible = false;
      return;
    }
    const at = gridToWorld(ORIGIN + this.sites.flag.dx, ORIGIN + this.sites.flag.dy);
    this.flagBody.visible = true;
    placeLayer(this.flagBody, frame, at.x, at.y);
    if (frame.torso) {
      this.flagTorso.visible = true;
      placeLayer(this.flagTorso, frame.torso, at.x, at.y);
    } else {
      this.flagTorso.visible = false;
    }
    if (frame.shadow) {
      this.flagShadow.visible = true;
      placeLayer(this.flagShadow, frame.shadow, at.x, at.y);
    } else {
      this.flagShadow.visible = false;
    }
  }

  private ensurePosts(n: number): void {
    while (this.posts.length < n) {
      const s = new Sprite();
      s.eventMode = "none";
      this.postLayer.addChild(s);
      this.posts.push(s);
    }
  }

  private lookAtOrigin(): void {
    const o = gridToWorld(ORIGIN, ORIGIN);
    const r = this.app.renderer;
    this.camera.lookAt(o.x, o.y, r.width, r.height);
    this.camera.pan((CHROME_LEFT - CHROME_RIGHT) / 2, 0);
    this.applyCamera(true);
  }

  private applyCamera(redrawGrid = false): void {
    this.world.position.set(this.camera.panX, this.camera.panY);
    this.world.scale.set(this.camera.zoom);
    if (redrawGrid) {
      this.drawGrid();
      this.paintPlot();
      this.paintPosts();
      this.paintFlag();
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
    this.hover.clear();
    if (!this.hovering) return;
    this.hover.poly(cellQuad(this.hovering.x, this.hovering.y)).stroke({
      color: 0xffffff,
      width: 1.25 / this.camera.zoom,
      alpha: 0.85,
      alignment: 0.5,
    });
  }

  private bind(): void {
    const canvas = this.app.canvas;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContextMenu);
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
    canvas.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
  }

  private readonly onContextMenu = (e: Event): void => {
    if (this.paintLayer) e.preventDefault();
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    const pan = e.button === 1 || (e.button === 0 && (e.altKey || !this.paintLayer));
    if (pan) {
      this.dragging = true;
      this.dragMoved = false;
      this.last = { x: e.clientX, y: e.clientY };
      this.app.canvas.style.cursor = "grabbing";
      this.app.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (!this.paintLayer || (e.button !== 0 && e.button !== 2)) return;
    const cell = this.cellAt(e);
    if (!cell) return;
    this.painting = true;
    this.paintOn = e.button === 2 ? false : !this.layerAt(cell.x - ORIGIN, cell.y - ORIGIN);
    this.strokeCell(cell);
    this.app.canvas.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.painting) {
      const cell = this.cellAt(e);
      if (cell) this.strokeCell(cell);
      return;
    }
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
    this.painting = false;
    try {
      this.app.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!this.dragging) return;
    this.dragging = false;
    this.last = null;
    this.app.canvas.style.cursor = this.paintLayer ? "cell" : "grab";
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

  private layerAt(dx: number, dy: number): boolean {
    const layer = this.paintLayer;
    if (!layer) return false;
    if (layer === "blocked") return hasRel(this.blocked, dx, dy);
    if (layer === "protected") return hasRel(this.protectedCells, dx, dy);
    if (layer === "buildMarks") return hasRel(this.marks, dx, dy);
    if (layer === "door") return this.sites.door.dx === dx && this.sites.door.dy === dy;
    if (layer === "flag") return this.sites.flag.dx === dx && this.sites.flag.dy === dy;
    if (layer === "workCenter") return this.sites.workCenter?.dx === dx && this.sites.workCenter?.dy === dy;
    if (layer === "workSpot") return this.sites.workSpot?.dx === dx && this.sites.workSpot?.dy === dy;
    if (layer === "request") return this.sites.request.some((r) => r.dx === dx && r.dy === dy);
    return this.sites.offer.some((r) => r.dx === dx && r.dy === dy);
  }

  private strokeCell(cell: { x: number; y: number }): void {
    const dx = cell.x - ORIGIN;
    const dy = cell.y - ORIGIN;
    const singleton =
      this.paintLayer === "door" ||
      this.paintLayer === "flag" ||
      this.paintLayer === "workSpot" ||
      this.paintLayer === "workCenter";
    if (!singleton && this.layerAt(dx, dy) === this.paintOn) return;
    if (singleton && this.paintOn && this.layerAt(dx, dy) && this.paintLayer !== "workSpot") return;
    this.onPaint?.(dx, dy, this.paintOn);
    if (this.paintLayer === "blocked") {
      this.blocked = applyRel(this.blocked, dx, dy, this.paintOn);
      if (this.paintOn) this.protectedCells = applyRel(this.protectedCells, dx, dy, true);
    } else if (this.paintLayer === "protected") {
      this.protectedCells = applyRel(this.protectedCells, dx, dy, this.paintOn);
      if (!this.paintOn) this.blocked = applyRel(this.blocked, dx, dy, false);
    } else if (this.paintLayer === "buildMarks") {
      this.marks = applyRel(this.marks, dx, dy, this.paintOn);
    } else if (this.paintLayer === "door") {
      this.sites.door = this.paintOn ? { dx, dy } : { dx: 0, dy: 0 };
    } else if (this.paintLayer === "flag") {
      this.sites.flag = this.paintOn ? { dx, dy } : { dx: 0, dy: 0 };
    } else if (this.paintLayer === "workCenter") {
      this.sites.workCenter = this.paintOn ? { dx, dy } : null;
    } else if (this.paintLayer === "workSpot") {
      this.sites.workSpot = this.paintOn
        ? { dx, dy, direction: this.sites.workSpot?.direction ?? "ne" }
        : null;
    } else if (this.paintLayer === "request") {
      this.sites.request = applyStack(this.sites.request, dx, dy, this.paintOn);
    } else if (this.paintLayer === "offer") {
      this.sites.offer = applyStack(this.sites.offer, dx, dy, this.paintOn);
    }
    this.paintPlot();
    this.paintPosts();
    this.paintFlag();
    this.hovering = cell;
    this.paintMarks();
    this.emitSnap();
  }

  private cellAt(e: PointerEvent): { x: number; y: number } | null {
    const rect = this.app.canvas.getBoundingClientRect();
    const world = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    return pickCell(world.x, world.y, GRID, GRID, () => 0);
  }

  private emitSnap(): void {
    const cell = this.hovering;
    if (!cell) {
      this.onSnap(this.paintLayer ? "paint · LMB add / RMB erase · Alt-drag pan" : "origin 0, 0");
      return;
    }
    const dx = cell.x - ORIGIN;
    const dy = cell.y - ORIGIN;
    const occ = hasRel(this.blocked, dx, dy) ? "occupied" : hasRel(this.protectedCells, dx, dy) ? "plot" : "empty";
    const stick = hasRel(this.marks, dx, dy) ? "  stick" : "";
    const site = siteLabel(this.sites, dx, dy);
    this.onSnap(`${fmtDelta(dx)}, ${fmtDelta(dy)}  ${occ}${stick}${site}`);
  }
}

function applyRel(rs: Rel[], dx: number, dy: number, on: boolean): Rel[] {
  const next = rs.filter((r) => r.dx !== dx || r.dy !== dy);
  if (on) next.push({ dx, dy });
  return next;
}

function applyStack(rs: StackSlot[], dx: number, dy: number, on: boolean): StackSlot[] {
  const hit = rs.find((r) => r.dx === dx && r.dy === dy);
  const next = rs.filter((r) => r.dx !== dx || r.dy !== dy);
  if (on) next.push({ dx, dy, material: hit?.material ?? "?" });
  return next;
}

function fillCell(g: Graphics, r: Rel, color: number, alpha: number): void {
  g.poly(cellQuad(ORIGIN + r.dx, ORIGIN + r.dy)).fill({ color, alpha });
}

function siteLabel(sites: SiteState, dx: number, dy: number): string {
  const bits: string[] = [];
  if (sites.door.dx === dx && sites.door.dy === dy) bits.push("door");
  if (sites.flag.dx === dx && sites.flag.dy === dy) bits.push("flag");
  if (sites.workSpot?.dx === dx && sites.workSpot?.dy === dy) bits.push(`spot ${sites.workSpot.direction}`);
  if (sites.workCenter?.dx === dx && sites.workCenter?.dy === dy) bits.push("center");
  const req = sites.request.find((r) => r.dx === dx && r.dy === dy);
  if (req) bits.push(`in ${req.material}`);
  const off = sites.offer.find((r) => r.dx === dx && r.dy === dy);
  if (off) bits.push(`out ${off.material}`);
  return bits.length ? `  ${bits.join(" · ")}` : "";
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
