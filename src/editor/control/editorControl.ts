import { parseUtcMap, stringifyUtcMap } from "../../shared";
import type { CurvePoint, TerrainLayer, EnvironmentState } from "../../shared/landscape/curve";
/**
 * Named editor ops the MCP bridge dispatches. Add a method here when you add a tool.
 */
import { filterCatalog, parseCatalogQuery, sitAllowed } from "../../shared";
import type { CatalogueStore } from "../assets/store";
import type { EditorTool, WorldEditor } from "../world/worldEditor";

const TOOLS: readonly EditorTool[] = ["select", "stamp", "brush", "clean", "sculpt", "terrain"];

export class EditorControl {
  constructor(
    private readonly editor: WorldEditor,
    private readonly library: CatalogueStore,
    private readonly after: () => void,
  ) {}

  dispatch(op: string, params: unknown): unknown {
    const fn = this.ops[op];
    if (!fn) throw new Error(`unknown op '${op}'`);
    const result = fn.call(this, params);
    this.after();
    return result;
  }

  private readonly ops: Record<string, (params: unknown) => unknown> = {
    status: () => this.status(),
    landscape: (p) => this.landscape(p),
    catalog: (p) => this.catalog(p),
    place: (p) => this.place(p),
    stamps: (p) => this.stamps(p),
    select: (p) => this.select(p),
    move: (p) => this.move(p),
    delete: (p) => this.remove(p),
    lookAt: (p) => this.lookAt(p),
    setTool: (p) => this.setTool(p),
    setAsset: (p) => this.setAsset(p),
    brush: (p) => this.brush(p),
    clean: (p) => this.clean(p),
    sculpt: (p) => this.sculpt(p),
    rename: (p) => this.rename(p),
    screenshot: (p) => this.screenshot(p),
  };

  private landscape(raw: unknown): unknown {
    const o=obj(raw), action=str(o.action) ?? 'status';
    if(action==='export') return { map: JSON.parse(stringifyUtcMap(this.editor.map)) };
    if(action==='load') {
      const map=parseUtcMap(o.map); if(!map) throw new Error('Invalid map'); this.editor.replace(map);
    } else if(action==='base') {
      const height=num(o.height); if(height===undefined || height < -16 || height>24) throw new Error('height must be -16..24');
      this.editor.terrainBase(height);
    } else if(action==='curve') {
      const points=o.points as CurvePoint[];
      if(!Array.isArray(points)||!points.length||points.length>128||!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&(p.radius===undefined||(Number.isFinite(p.radius)&&p.radius>0&&p.radius<=64)))) throw new Error('Provide 1..128 finite curve points');
      const mode=str(o.mode) ?? 'terrain';
      if(!['terrain','river','foliage','raise','smooth','flatten'].includes(mode)) throw new Error('Invalid curve mode');
      const radius=num(o.radius) ?? 4; if(radius<=0||radius>64) throw new Error('radius must be 0..64');
      const layer=str(o.layer) ?? 'sand'; if(!['grass','sand','mud','rock','snow'].includes(layer)) throw new Error('Invalid terrain layer');
      const depth=num(o.depth) ?? 1.4; if(Math.abs(depth)>16) throw new Error('depth must be -16..16');
      const opacity=num(o.opacity) ?? 1; if(opacity<0||opacity>1) throw new Error('opacity must be 0..1');
      this.editor.curveStroke({points,radius,mode:mode as 'terrain'|'river'|'foliage'|'raise'|'smooth'|'flatten',depth,layer:layer as TerrainLayer,opacity});
    } else if(action==='cover') {
      const x=num(o.x),z=num(o.z),radius=num(o.radius)??10,density=num(o.density)??3,flowers=num(o.flowers)??.1;
      if(x===undefined||z===undefined||radius<=0||radius>100||density<0||density>12||flowers<0||flowers>1) throw new Error('Invalid cover patch');
      this.editor.addCover({x,z,radius,density,flowers,seed:num(o.seed)??42});
    } else if(action==='environment') {
      const settings:Partial<EnvironmentState>={};
      if(o.hour!==undefined){const h=num(o.hour);if(h===undefined)throw new Error('Invalid hour');settings.hour=((h%24)+24)%24;}
      if(o.season!==undefined){if(!['spring','summer','autumn'].includes(String(o.season)))throw new Error('Invalid season');settings.season=o.season as EnvironmentState['season'];}
      if(typeof o.playing==='boolean')settings.playing=o.playing;
      this.editor.environment(settings);
    } else if(action==='view') {
      if(o.grid!==undefined)this.editor.setGridMode(o.grid===true?'tiles':'none');
      this.editor.setTool(null);
    } else if(action!=='status') throw new Error('Unknown landscape action');
    return { landscape:this.editor.map.landscape, diagnostics:this.editor.diagnostics() };
  }

  private status(): unknown {
    const v = this.camView();
    return {
      connected: true,
      map: this.editor.map.name,
      stamps: this.editor.map.stamps.length,
      tool: this.editor.tool,
      asset: this.editor.asset,
      waterLevel: this.editor.height.waterLevel,
      lookAt: { x: v.x, z: v.z },
      zoom: v.zoom,
      yaw: v.yaw,
      pitch: v.pitch,
      gameCam: v.gameCam,
      catalog: this.library.doc.assets.length,
      brush: {
        radius: this.editor.brush.radius,
        density: this.editor.brush.density,
        painted: this.editor.brush.any(),
        slots: this.editor.kit.slots.map((s) => ({ id: s.id, asset: s.asset, pct: s.pct, scale: s.scale })),
      },
      selected: this.editor.selectedStamp(),
    };
  }

  private catalog(raw: unknown): unknown {
    const q = parseCatalogQuery(raw);
    const assets = filterCatalog(this.library.doc.assets, q);
    return { total: this.library.doc.assets.length, shown: assets.length, assets };
  }

  private place(raw: unknown): unknown {
    const items = placeItems(raw);
    if (!items.length) throw new Error("place needs { asset, x, y } or { items: [...] }");
    const placed: unknown[] = [];
    const skipped: unknown[] = [];
    for (const item of items) {
      const entry = this.library.entry(item.asset);
      if (!entry) {
        skipped.push({ ...item, reason: "unknown asset" });
        continue;
      }
      const stamp = this.editor.placeAt(item.asset, item.x, item.y, item.yaw, item.scale, item.elevation, item.variant);
      if (!stamp) {
        const wet = this.editor.height.wet(Math.floor(item.x) + 0.5, Math.floor(item.y) + 0.5);
        skipped.push({
          ...item,
          reason: sitAllowed(entry.type, wet) ? "out of bounds" : wet ? "land asset on water" : "water asset on dry",
        });
        continue;
      }
      placed.push(stamp);
    }
    if (placed[0] && items.length === 1) {
      const s = placed[0] as { x: number; y: number };
      this.editor.lookAt(s.x + 0.5, s.y + 0.5);
    }
    return { placed, skipped };
  }

  private stamps(raw: unknown): unknown {
    const o = obj(raw);
    const asset = str(o.asset);
    const limit = num(o.limit) ?? 200;
    let list = this.editor.map.stamps;
    if (asset) list = list.filter((s) => s.asset === asset);
    return { count: list.length, stamps: list.slice(0, Math.min(400, Math.max(1, limit))) };
  }

  private select(raw: unknown): unknown {
    const id = str(obj(raw).id);
    this.editor.pickStamp(id ?? null);
    return { selected: this.editor.selectedStamp() };
  }

  private move(raw: unknown): unknown {
    const o = obj(raw);
    const id = str(o.id);
    const x = num(o.x);
    const y = num(o.y);
    if (!id || x === undefined || y === undefined) throw new Error("move needs id, x, y");
    const ok = this.editor.moveStamp(id, x, y, num(o.yaw));
    if (!ok) throw new Error("move refused (missing, sit, or bounds)");
    return { stamp: this.editor.map.stamps.find((s) => s.id === id) ?? null };
  }

  private remove(raw: unknown): unknown {
    const id = str(obj(raw).id) ?? this.editor.select.id;
    if (!id) throw new Error("delete needs id");
    const ok = this.editor.removeStamp(id);
    if (!ok) throw new Error("no stamp " + id);
    return { deleted: id };
  }

  private lookAt(raw: unknown): unknown {
    const o = obj(raw);
    const x = num(o.x);
    const z = num(o.z) ?? num(o.y);
    if (x === undefined || z === undefined) throw new Error("lookAt needs x and z");
    this.editor.lookAt(x, z);
    return this.camView();
  }

  private setTool(raw: unknown): unknown {
    const tool = str(obj(raw).tool);
    if (!tool || !TOOLS.includes(tool as EditorTool)) throw new Error(`tool is ${TOOLS.join("|")}`);
    this.editor.setTool(tool as EditorTool);
    return { tool: this.editor.tool };
  }

  private setAsset(raw: unknown): unknown {
    const id = str(obj(raw).id);
    if (!id || !this.library.entry(id)) throw new Error("unknown asset");
    this.editor.setAsset(id);
    return { asset: id, entry: this.library.entry(id) };
  }

  private brush(raw: unknown): unknown {
    const o = obj(raw);
    const action = str(o.action) ?? "status";
    if (action === "kit") {
      const assets = arr(o.assets);
      if (assets) {
        this.editor.kit.clear();
        for (const id of assets) {
          if (typeof id === "string" && this.library.entry(id)) this.editor.kit.add(id);
        }
      }
      const add = str(o.add);
      if (add && this.library.entry(add)) this.editor.kit.add(add);
    }
    if (action === "config" || action === "kit") {
      const r = num(o.radius);
      const d = num(o.density);
      if (r !== undefined) this.editor.setBrushRadius(r);
      if (d !== undefined) this.editor.setBrushDensity(d);
    }
    if (action === "paint") {
      const x = num(o.x);
      const z = num(o.z) ?? num(o.y);
      if (x === undefined || z === undefined) throw new Error("paint needs x, z");
      this.editor.dabBrush(x, z, Boolean(o.erase));
    }
    if (action === "clear") this.editor.brush.clear();
    if (action === "apply") this.editor.applyBrush();
    this.editor.setTool("brush");
    return {
      radius: this.editor.brush.radius,
      density: this.editor.brush.density,
      painted: this.editor.brush.any(),
      slots: this.editor.kit.slots,
      stamps: this.editor.map.stamps.length,
    };
  }

  private clean(raw: unknown): unknown {
    const o = obj(raw);
    const r = num(o.radius);
    if (r !== undefined) this.editor.setCleanRadius(r);
    const x = num(o.x);
    const z = num(o.z) ?? num(o.y);
    if (x === undefined || z === undefined) throw new Error("clean needs x, z");
    this.editor.setTool("clean");
    this.editor.dabClean(x, z);
    return { stamps: this.editor.map.stamps.length, radius: this.editor.clean.radius };
  }

  private sculpt(raw: unknown): unknown {
    const o = obj(raw);
    const action = str(o.action) ?? "stroke";
    const mode = str(o.mode);
    if (mode === "live" || mode === "water") this.editor.setSculptMode(mode);
    const r = num(o.radius);
    const s = num(o.strength);
    if (r !== undefined) this.editor.setSculptRadius(r);
    if (s !== undefined) this.editor.setSculptStrength(s);
    this.editor.setTool("sculpt");
    if (action === "apply") {
      this.editor.applySculpt();
      return { mode: this.editor.sculpt.mode, waterLevel: this.editor.height.waterLevel };
    }
    const x = num(o.x);
    const z = num(o.z) ?? num(o.y);
    if (x === undefined || z === undefined) throw new Error("sculpt stroke needs x, z");
    this.editor.dabSculpt(x, z, Boolean(o.lower ?? o.erase));
    return { mode: this.editor.sculpt.mode, painted: this.editor.sculpt.mask.any() };
  }

  private rename(raw: unknown): unknown {
    const name = str(obj(raw).name);
    if (!name) throw new Error("rename needs name");
    this.editor.rename(name);
    return { name: this.editor.map.name };
  }

  private async screenshot(raw: unknown): Promise<unknown> {
    await this.editor.ready();
    const o = obj(raw);
    const format = str(o.format);
    const shot = this.editor.screenshot({
      x: num(o.x),
      z: num(o.z) ?? num(o.y),
      zoom: num(o.zoom),
      yaw: rad(num(o.yaw) ?? num(o.angle)),
      pitch: rad(num(o.pitch)),
      gameCam: bool(o.gameCam) ?? bool(o.game),
      iso: o.iso === true,
      keep: o.keep === true,
      maxWidth: num(o.maxWidth) ?? num(o.width),
      format: format === "png" ? "png" : format === "jpeg" || format === "jpg" ? "jpeg" : undefined,
      quality: num(o.quality),
      aspect:num(o.aspect),
    });
    return {
      data: shot.data,
      mime: shot.mime,
      width: shot.width,
      height: shot.height,
      view: this.camViewFrom(shot.view),
    };
  }

  private camView() {
    return this.camViewFrom(this.editor.view());
  }

  private camViewFrom(v: { x: number; z: number; zoom: number; yaw: number; pitch: number; gameCam: boolean }) {
    return { x: v.x, z: v.z, zoom: v.zoom, yaw: deg(v.yaw), pitch: deg(v.pitch), gameCam: v.gameCam };
  }
}

function placeItems(raw: unknown): { asset: string; x: number; y: number; yaw?: number; scale?: number; elevation?: number; variant?: "snow"|"gold"|"red"|"green" }[] {
  const o = obj(raw);
  const items = arr(o.items);
  if (items) {
    return items.flatMap((item) => {
      const one = onePlace(item);
      return one ? [one] : [];
    });
  }
  const one = onePlace(o);
  return one ? [one] : [];
}

function onePlace(raw: unknown): { asset: string; x: number; y: number; yaw?: number; scale?: number; elevation?: number; variant?: "snow"|"gold"|"red"|"green" } | null {
  const o = obj(raw);
  const asset = str(o.asset);
  const x = num(o.x);
  const y = num(o.y);
  if (!asset || x === undefined || y === undefined) return null;
  return { asset, x, y, yaw: num(o.yaw), scale: num(o.scale), elevation:num(o.elevation), variant:["snow","gold","red","green"].includes(String(o.variant))?o.variant as "snow"|"gold"|"red"|"green":undefined };
}

function obj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function arr(v: unknown): unknown[] | undefined {
  return Array.isArray(v) ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function deg(rad: number): number {
  return Math.round((rad * 180) / Math.PI);
}

function rad(deg: number | undefined): number | undefined {
  return deg === undefined ? undefined : (deg * Math.PI) / 180;
}
