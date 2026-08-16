import { Application } from "pixi.js";
import type { GridPos } from "../shared";
import type { MapCatalogEntry } from "../assets/map";
import { MAPS, generateMap, mapViewFromGrid, originalMapToGrid, allDecorations, type MapView, type MapDecoration } from "../sim";
import { Renderer, loadLandscapeAtlas, loadDecorationSheets } from "../render";
import { lookAtMinimap, mountHud, paintMinimap, paintMinimapViewport, type HudMapOption } from "../ui";
import { fetchMapCatalog, fetchOriginalMap } from "./maps";

const WASD_SPEED = 900;

export class GameApp {
  private app: Application | null = null;
  private renderer: Renderer | null = null;
  private view: MapView | null = null;
  private mapId = "";
  private catalog: MapCatalogEntry[] = [];
  private loadGen = 0;
  private keys = new Set<string>();
  private dragging = false;
  private dragMoved = false;
  private minimapDrag = false;
  private selected: GridPos | null = null;
  private unbind: Array<() => void> = [];
  private hud: ReturnType<typeof mountHud> | null = null;

  constructor(
    private readonly gameRoot: HTMLElement,
    private readonly hudRoot: HTMLElement,
  ) {}

  async start(): Promise<void> {
    const app = new Application();
    await app.init({
      background: 0x020814,
      resizeTo: window,
      antialias: false,
      preference: "webgl",
    });
    this.app = app;
    this.gameRoot.appendChild(app.canvas);

    const renderer = new Renderer(app);
    this.renderer = renderer;
    const [atlas, sheets] = await Promise.all([loadLandscapeAtlas(), loadDecorationSheets()]);
    renderer.setAtlas(atlas);
    renderer.setSheets(sheets);

    this.catalog = await fetchMapCatalog();
    this.hud = mountHud(this.hudRoot, hudMaps(this.catalog), (id) => {
      void this.loadMap(id);
    });
    await this.loadMap(defaultMapId(this.catalog));
    const hud = this.hud;
    if (!hud) throw new Error("hud");

    const canvas = app.canvas;
    canvas.style.cursor = "grab";

    const currentView = (): MapView => {
      if (!this.view) throw new Error("no map");
      return this.view;
    };

    const onPointerDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.dragMoved = false;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const onPointerMove = (e: PointerEvent): void => {
      const view = currentView();
      if (this.dragging) {
        renderer.camera.pan(e.movementX, e.movementY);
        renderer.applyCamera();
        if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.dragMoved = true;
      }
      const pos = renderer.pick({ x: e.clientX, y: e.clientY });
      renderer.highlight(pos, "hover");
      hud.update({
        cursor: pos,
        landscape: pos ? view.landscapeAt(pos.x, pos.y) : null,
        height: pos ? view.heightAt(pos.x, pos.y) : null,
        zoom: renderer.camera.zoom,
      });
    };
    const onPointerUp = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      this.dragging = false;
      canvas.style.cursor = "grab";
      if (!this.dragMoved) {
        this.selected = renderer.pick({ x: e.clientX, y: e.clientY });
        renderer.highlight(this.selected, "select");
      }
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const view = currentView();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      renderer.camera.zoomAt(e.clientX, e.clientY, factor);
      renderer.applyCamera();
      renderer.highlight(this.selected, "select");
      const pos = renderer.pick({ x: e.clientX, y: e.clientY });
      hud.update({
        cursor: pos,
        landscape: pos ? view.landscapeAt(pos.x, pos.y) : null,
        height: pos ? view.heightAt(pos.x, pos.y) : null,
        zoom: renderer.camera.zoom,
      });
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      this.keys.add(e.key.toLowerCase());
      if (e.key === " " && this.view) {
        e.preventDefault();
        renderer.setView(this.view);
        this.selected = null;
        renderer.highlight(null, "select");
      }
      const index = Number(e.key) - 1;
      const ids = hud.mapIds;
      if (index >= 0 && index < Math.min(9, ids.length)) {
        void this.loadMap(ids[index]!);
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      this.keys.delete(e.key.toLowerCase());
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onMinimapPointer = (e: PointerEvent): void => {
      lookAtMinimap(
        renderer.camera,
        app.renderer.width,
        app.renderer.height,
        currentView(),
        hud.minimap,
        e.clientX,
        e.clientY,
      );
      renderer.applyCamera();
    };
    const onMinimapDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.minimapDrag = true;
      hud.minimap.classList.add("is-dragging");
      hud.minimap.setPointerCapture(e.pointerId);
      onMinimapPointer(e);
    };
    const onMinimapMove = (e: PointerEvent): void => {
      if (!this.minimapDrag) return;
      onMinimapPointer(e);
    };
    const onMinimapUp = (e: PointerEvent): void => {
      if (e.button !== 0 && e.type !== "pointercancel") return;
      this.minimapDrag = false;
      hud.minimap.classList.remove("is-dragging");
    };

    hud.minimap.addEventListener("pointerdown", onMinimapDown);
    hud.minimap.addEventListener("pointermove", onMinimapMove);
    hud.minimap.addEventListener("pointerup", onMinimapUp);
    hud.minimap.addEventListener("pointercancel", onMinimapUp);

    this.unbind.push(
      () => canvas.removeEventListener("pointerdown", onPointerDown),
      () => window.removeEventListener("pointermove", onPointerMove),
      () => canvas.removeEventListener("pointerup", onPointerUp),
      () => canvas.removeEventListener("wheel", onWheel),
      () => window.removeEventListener("keydown", onKeyDown),
      () => window.removeEventListener("keyup", onKeyUp),
      () => hud.minimap.removeEventListener("pointerdown", onMinimapDown),
      () => hud.minimap.removeEventListener("pointermove", onMinimapMove),
      () => hud.minimap.removeEventListener("pointerup", onMinimapUp),
      () => hud.minimap.removeEventListener("pointercancel", onMinimapUp),
    );

    app.ticker.add((ticker) => {
      renderer.tick(performance.now());
      if (this.view) {
        paintMinimapViewport(
          hud.minimap,
          renderer.camera,
          app.renderer.width,
          app.renderer.height,
          this.view,
        );
      }
      if (!this.renderer || this.keys.size === 0) return;
      const dt = ticker.deltaMS / 1000;
      const step = WASD_SPEED * dt;
      let dx = 0;
      let dy = 0;
      if (this.keys.has("a") || this.keys.has("arrowleft")) dx += step;
      if (this.keys.has("d") || this.keys.has("arrowright")) dx -= step;
      if (this.keys.has("w") || this.keys.has("arrowup")) dy += step;
      if (this.keys.has("s") || this.keys.has("arrowdown")) dy -= step;
      if (dx || dy) {
        renderer.camera.pan(dx, dy);
        renderer.applyCamera();
      }
    });

    hud.update({ cursor: null, landscape: null, height: null, zoom: renderer.camera.zoom });
  }

  private async loadMap(id: string): Promise<void> {
    if (!this.app || !this.renderer) return;
    if (this.view && this.mapId === id) return;
    const gen = ++this.loadGen;
    this.hud?.setBusy(true);
    try {
      const { grid, decorations } = await this.loadGrid(id);
      if (gen !== this.loadGen || !this.renderer) return;
      this.mapId = id;
      this.view = mapViewFromGrid(grid);
      this.selected = null;
      this.renderer.setView(this.view, decorations);
      this.renderer.highlight(null, "select");
      this.renderer.highlight(null, "hover");
      if (this.hud) {
        paintMinimap(this.hud.minimap, this.view);
        this.hud.setMap(id);
        this.hud.update({
          cursor: null,
          landscape: null,
          height: null,
          zoom: this.renderer.camera.zoom,
        });
      }
    } catch (err) {
      console.error(err);
      if (id !== MAPS[0].id) await this.loadMap(MAPS[0].id);
    } finally {
      if (gen === this.loadGen) this.hud?.setBusy(false);
    }
  }

  private async loadGrid(id: string): Promise<{ grid: ReturnType<typeof generateMap>; decorations: MapDecoration[] }> {
    const procedural = MAPS.find((m) => m.id === id);
    if (procedural) {
      const grid = generateMap(procedural);
      return { grid, decorations: allDecorations(mapViewFromGrid(grid)) };
    }
    const entry = this.catalog.find((m) => m.id === id);
    if (!entry) throw new Error(`unknown map ${id}`);
    const map = await fetchOriginalMap(entry.file);
    const grid = originalMapToGrid(map);
    return { grid, decorations: allDecorations(mapViewFromGrid(grid), map) };
  }

  stop(): void {
    for (const fn of this.unbind) fn();
    this.unbind = [];
    this.app?.destroy(true);
    this.app = null;
    this.renderer = null;
    this.view = null;
    this.hud = null;
  }
}

function hudMaps(catalog: readonly MapCatalogEntry[]): HudMapOption[] {
  return [
    ...catalog.map((m) => ({
      id: m.id,
      name: m.name,
      group: m.group,
      detail: `${m.size} · ${m.players}p`,
    })),
    ...MAPS.map((m) => ({
      id: m.id,
      name: m.name,
      group: "generated" as const,
      detail: String(m.size),
    })),
  ];
}

function defaultMapId(catalog: readonly MapCatalogEntry[]): string {
  return catalog.find((m) => m.group === "tutorial")?.id ?? catalog[0]?.id ?? MAPS[0].id;
}
