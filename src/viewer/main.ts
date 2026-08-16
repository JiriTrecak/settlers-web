import { compositeSettler, toImageData, type DecodedImage } from "../assets/dat";
import {
  CATEGORIES,
  catalogItems,
  collapseSettlerDirections,
  groupSettlerProfessions,
  matchesRace,
  parseSettlerId,
  RACES,
  searchItems,
  type Catalog,
  type CatalogItem,
  type Category,
  type Race,
  type Sprite,
} from "../assets/catalog/sprite";

const BASE = "/graphics/";
const LIMIT = 480;
const PLAYERS: [number, number, number][] = [
  [40, 90, 200],
  [200, 40, 40],
  [220, 180, 40],
  [40, 160, 70],
  [220, 110, 30],
  [40, 180, 200],
  [180, 60, 180],
  [180, 180, 180],
];

type Layer = "composite" | "body" | "torso" | "shadow";

function hueRgb(h: number): [number, number, number] {
  const s = 0.72;
  const l = 0.46;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

function checker(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = 8;
  for (let y = 0; y < h; y += s) {
    for (let x = 0; x < w; x += s) {
      ctx.fillStyle = ((x / s + y / s) & 1) === 0 ? "#0b1224" : "#132038";
      ctx.fillRect(x, y, s, s);
    }
  }
}

const decodeCache = new Map<string, Promise<DecodedImage>>();

function loadDecoded(path: string, ox: number, oy: number): Promise<DecodedImage> {
  const key = `${path}:${ox}:${oy}`;
  const hit = decodeCache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const img = new Image();
    img.src = BASE + path;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      offsetX: ox,
      offsetY: oy,
      rgba: ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight).data,
    };
  })();
  decodeCache.set(key, p);
  return p;
}

async function spriteImage(sprite: Sprite, layer: Layer, player: [number, number, number]): Promise<DecodedImage> {
  const body = await loadDecoded(sprite.path, sprite.offsetX, sprite.offsetY);
  const torso = sprite.torso
    ? await loadDecoded(sprite.torso.path, sprite.torso.offsetX, sprite.torso.offsetY)
    : null;
  const shadow = sprite.shadow
    ? await loadDecoded(sprite.shadow.path, sprite.shadow.offsetX, sprite.shadow.offsetY)
    : null;
  if (layer === "body") return body;
  if (layer === "torso") return torso ?? body;
  if (layer === "shadow") return shadow ?? body;
  return compositeSettler(body, torso, shadow, player);
}

function blit(ctx: CanvasRenderingContext2D, img: DecodedImage, ox: number, oy: number, zoom: number): void {
  if (img.width === 0 || img.height === 0) return;
  const off = document.createElement("canvas");
  off.width = img.width;
  off.height = img.height;
  off.getContext("2d")!.putImageData(toImageData(img), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, ox, oy, img.width * zoom, img.height * zoom);
}

export function mountViewer(host: HTMLElement): void {
  host.innerHTML = `
    <div class="shell">
      <header class="top">
        <a href="/">game</a>
        <h1>Catalogue</h1>
        <input class="search" placeholder="lumberjack  ·  alchemist idle  ·  grass" />
        <span class="count"></span>
        <div class="races"></div>
        <div class="global"></div>
      </header>
      <nav class="cats"></nav>
      <div class="body">
        <main class="grid"></main>
        <aside class="detail hidden">
          <button class="close" type="button">✕</button>
          <div class="toolbar"></div>
          <div class="preview-wrap"><canvas></canvas></div>
          <div class="meta"></div>
          <div class="strip"></div>
        </aside>
      </div>
    </div>
    <div class="empty hidden"></div>
  `;

  const empty = host.querySelector(".empty") as HTMLElement;
  const catsEl = host.querySelector(".cats") as HTMLElement;
  const gridEl = host.querySelector(".grid") as HTMLElement;
  const detailEl = host.querySelector(".detail") as HTMLElement;
  const toolbar = host.querySelector(".toolbar") as HTMLElement;
  const metaEl = host.querySelector(".meta") as HTMLElement;
  const stripEl = host.querySelector(".strip") as HTMLElement;
  const canvas = host.querySelector(".preview-wrap canvas") as HTMLCanvasElement;
  const search = host.querySelector(".search") as HTMLInputElement;
  const countEl = host.querySelector(".count") as HTMLElement;
  const globalEl = host.querySelector(".global") as HTMLElement;
  const racesEl = host.querySelector(".races") as HTMLElement;

  let clips: CatalogItem[] = [];
  let category: Category = "buildings";
  let race: Race = "roman";
  let folder: string | null = null;
  let selected: CatalogItem | null = null;
  let spriteIndex = 0;
  let layer: Layer = "composite";
  let zoom = 4;
  let playing = false;
  let player: [number, number, number] = PLAYERS[0]!;
  let hueDeg = 220;
  let lastTick = 0;
  let previewGen = 0;
  let thumbGen = 0;
  let thumbs: { canvas: HTMLCanvasElement; sprite: Sprite }[] = [];

  function categoryCount(c: Category): number {
    const list = clips.filter((i) => matchesRace(i, race) && i.category === c);
    if (c === "settlers") return groupSettlerProfessions(list).length;
    return list.length;
  }

  const visible = (): CatalogItem[] => {
    const q = search.value;
    let list = clips.filter((i) => matchesRace(i, race) && i.category === category);

    if (folder) {
      list = list.filter((i) => i.id === folder || i.id.startsWith(`${folder}/`));
      list = list.filter((i) => parseSettlerId(i.id)?.action);
      return searchItems(list, q);
    }

    if (category === "settlers") {
      if (q.trim()) return searchItems(list, q);
      return groupSettlerProfessions(list);
    }

    return searchItems(list, q);
  };

  function renderCats(): void {
    catsEl.replaceChildren();
    for (const c of CATEGORIES) {
      const n = categoryCount(c);
      if (n === 0) continue;
      const b = document.createElement("button");
      b.className = `cat${category === c ? " is-active" : ""}`;
      b.textContent = `${c} ${n}`;
      b.addEventListener("click", () => {
        category = c;
        folder = null;
        selected = null;
        render();
      });
      catsEl.append(b);
    }
    if (folder) {
      const back = document.createElement("button");
      back.className = "cat crumb";
      const name = parseSettlerId(folder)?.profession.replace(/-/g, " ") ?? "back";
      back.textContent = `← ${name}`;
      back.addEventListener("click", () => {
        folder = null;
        selected = null;
        render();
      });
      catsEl.append(back);
    }
  }

  function renderRaces(): void {
    racesEl.replaceChildren();
    for (const r of RACES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `cat${race === r ? " is-active" : ""}`;
      b.textContent = r;
      b.addEventListener("click", () => {
        race = r;
        folder = null;
        selected = null;
        renderRaces();
        render();
      });
      racesEl.append(b);
    }
  }

  function openCard(item: CatalogItem): void {
    if (item.folder) {
      folder = item.id;
      selected = null;
      category = "settlers";
      render();
      return;
    }
    selected = item;
    const east = item.sprites.findIndex((s) => s.variant === "e" && (s.frame ?? 0) === 0);
    spriteIndex = east >= 0 ? east : item.sprites.findIndex((s) => s.id === item.cover.id);
    if (spriteIndex < 0) spriteIndex = 0;
    const variant = item.sprites[spriteIndex]?.variant;
    const pool = item.sprites.filter((s) => (variant ? s.variant === variant : true));
    playing = pool.length > 1;
    render();
  }

  async function paintThumb(canvas: HTMLCanvasElement, sprite: Sprite, rgb: [number, number, number]): Promise<void> {
    const img = await spriteImage(sprite, "composite", rgb);
    const w = 128;
    const h = 96;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    checker(ctx, w, h);
    if (img.width === 0 || img.height === 0) return;
    const scale = Math.min(w / img.width, h / img.height, 4);
    blit(ctx, img, (w - img.width * scale) / 2, (h - img.height * scale) / 2, scale);
  }

  async function paintThumbs(): Promise<void> {
    const gen = ++thumbGen;
    const rgb: [number, number, number] = [player[0], player[1], player[2]];
    const batch = 24;
    for (let i = 0; i < thumbs.length; i += batch) {
      if (gen !== thumbGen) return;
      await Promise.all(thumbs.slice(i, i + batch).map((t) => paintThumb(t.canvas, t.sprite, rgb)));
    }
  }

  function colorChanged(): void {
    for (const sw of globalEl.querySelectorAll(".swatch")) {
      const raw = (sw as HTMLElement).dataset.rgb?.split(",").map(Number);
      sw.classList.toggle(
        "is-active",
        !!raw && raw[0] === player[0] && raw[1] === player[1] && raw[2] === player[2],
      );
    }
    void paintThumbs();
    void renderPreview();
  }

  function renderGlobal(): void {
    globalEl.replaceChildren();
    const hueL = document.createElement("label");
    hueL.append("player ");
    const hue = document.createElement("input");
    hue.type = "range";
    hue.min = "0";
    hue.max = "360";
    hue.value = String(hueDeg);
    hue.addEventListener("input", () => {
      hueDeg = Number(hue.value);
      player = hueRgb(hueDeg);
      colorChanged();
    });
    hueL.append(hue);
    globalEl.append(hueL);
    for (const rgb of PLAYERS) {
      const sw = document.createElement("button");
      sw.type = "button";
      sw.className = "swatch";
      sw.dataset.rgb = rgb.join(",");
      sw.style.background = `rgb(${rgb.join(",")})`;
      sw.addEventListener("click", () => {
        player = rgb;
        colorChanged();
      });
      globalEl.append(sw);
    }
    colorChanged();
  }

  function renderGrid(): void {
    const list = visible();
    const shown = list.slice(0, LIMIT);
    countEl.textContent =
      list.length > LIMIT ? `${shown.length} of ${list.length}` : `${list.length}`;
    gridEl.replaceChildren();
    thumbs = [];
    const frag = document.createDocumentFragment();
    for (const item of shown) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `card${selected?.id === item.id ? " is-active" : ""}${item.folder ? " is-folder" : ""}`;
      if (item.category === "settlers") {
        const canvas = document.createElement("canvas");
        canvas.className = "thumb";
        thumbs.push({ canvas, sprite: item.cover });
        card.append(canvas);
      } else {
        const img = document.createElement("img");
        img.loading = "lazy";
        img.src = BASE + item.cover.path;
        img.alt = item.title;
        card.append(img);
      }
      const label = document.createElement("div");
      label.className = "card-label";
      label.innerHTML = `<strong>${item.title}</strong><span>${item.subtitle}</span>`;
      card.append(label);
      card.addEventListener("click", () => openCard(item));
      frag.append(card);
    }
    gridEl.append(frag);
    void paintThumbs();
  }

  function renderToolbar(): void {
    toolbar.replaceChildren();
    if (!selected) return;
    const layers: Layer[] = ["composite", "body", "torso", "shadow"];
    for (const l of layers) {
      const b = document.createElement("button");
      b.className = `tool${layer === l ? " is-active" : ""}`;
      b.textContent = l;
      b.addEventListener("click", () => {
        layer = l;
        renderToolbar();
        void renderPreview();
      });
      toolbar.append(b);
    }
    const play = document.createElement("button");
    play.className = `tool${playing ? " is-active" : ""}`;
    play.textContent = playing ? "pause" : "play";
    play.addEventListener("click", () => {
      playing = !playing;
      renderToolbar();
    });
    toolbar.append(play);

    const zoomL = document.createElement("label");
    const zoomR = document.createElement("input");
    zoomR.type = "range";
    zoomR.min = "1";
    zoomR.max = "16";
    zoomR.value = String(zoom);
    const zoomVal = document.createElement("span");
    zoomVal.textContent = `${zoom}×`;
    zoomR.addEventListener("input", () => {
      zoom = Number(zoomR.value);
      zoomVal.textContent = `${zoom}×`;
      void renderPreview();
    });
    zoomL.append(zoomR, zoomVal);
    toolbar.append(zoomL);
  }

  async function renderPreview(): Promise<void> {
    const gen = ++previewGen;
    const wrap = canvas.parentElement!;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    checker(ctx, w, h);
    const sprite = selected?.sprites[spriteIndex];
    if (!sprite) {
      metaEl.textContent = "";
      return;
    }
    const img = await spriteImage(sprite, layer, player);
    if (gen !== previewGen) return;
    checker(ctx, w, h);
    const dx = w / 2 + img.offsetX * zoom;
    const dy = h / 2 + img.offsetY * zoom;
    blit(ctx, img, dx, dy, zoom);
    ctx.strokeStyle = "#c4a35a";
    ctx.beginPath();
    ctx.moveTo(w / 2 - 8, h / 2);
    ctx.lineTo(w / 2 + 8, h / 2);
    ctx.moveTo(w / 2, h / 2 - 8);
    ctx.lineTo(w / 2, h / 2 + 8);
    ctx.stroke();
    const extra = sprite.variant ? ` · ${sprite.variant}` : "";
    metaEl.textContent = `${sprite.id}${extra}   ${img.width}×${img.height}  offset ${img.offsetX},${img.offsetY}`;
  }

  function renderStrip(): void {
    stripEl.replaceChildren();
    if (!selected) return;
    const variants = [...new Set(selected.sprites.map((s) => s.variant).filter(Boolean))] as string[];
    if (variants.length > 1) {
      for (const v of variants) {
        const b = document.createElement("button");
        b.className = `tool${selected.sprites[spriteIndex]?.variant === v ? " is-active" : ""}`;
        b.textContent = v;
        b.addEventListener("click", () => {
          const i = selected!.sprites.findIndex((s) => s.variant === v);
          if (i >= 0) spriteIndex = i;
          render();
        });
        stripEl.append(b);
      }
    }
    for (let i = 0; i < selected.sprites.length; i++) {
      const s = selected.sprites[i]!;
      if (variants.length > 1 && s.variant !== selected.sprites[spriteIndex]?.variant) continue;
      const img = document.createElement("img");
      img.src = BASE + s.path;
      img.alt = s.id;
      img.className = i === spriteIndex ? "is-active" : "";
      img.addEventListener("click", () => {
        spriteIndex = i;
        void renderPreview();
        renderStrip();
      });
      stripEl.append(img);
    }
  }

  function cycleFrame(delta: number): void {
    if (!selected) return;
    const cur = selected.sprites[spriteIndex];
    const pool = selected.sprites
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => (cur?.variant ? s.variant === cur.variant : true));
    if (pool.length === 0) return;
    const pos = pool.findIndex(({ i }) => i === spriteIndex);
    spriteIndex = pool[(pos + delta + pool.length) % pool.length]!.i;
    void renderPreview();
    renderStrip();
  }

  function render(): void {
    detailEl.classList.toggle("hidden", !selected);
    renderCats();
    renderGrid();
    renderToolbar();
    renderStrip();
    void renderPreview();
  }

  search.addEventListener("input", () => {
    selected = null;
    render();
  });

  host.querySelector(".close")!.addEventListener("click", () => {
    selected = null;
    render();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "/" && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      search.focus();
      search.select();
      return;
    }
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === "Escape") {
      if (selected) {
        selected = null;
        render();
      } else if (folder) {
        folder = null;
        render();
      }
      return;
    }
    if (!selected) return;
    if (e.key === " ") {
      e.preventDefault();
      playing = !playing;
      renderToolbar();
    } else if (e.key === "ArrowRight") {
      cycleFrame(1);
    } else if (e.key === "ArrowLeft") {
      cycleFrame(-1);
    }
  });

  window.addEventListener("resize", () => void renderPreview());
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom = Math.min(16, Math.max(1, zoom + (e.deltaY < 0 ? 1 : -1)));
      renderToolbar();
      void renderPreview();
    },
    { passive: false },
  );

  const loop = (t: number): void => {
    requestAnimationFrame(loop);
    if (!playing || !selected || selected.sprites.length <= 1) return;
    if (t - lastTick < 120) return;
    lastTick = t;
    const cur = selected.sprites[spriteIndex];
    const pool = selected.sprites
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => (cur?.variant ? s.variant === cur.variant : true));
    const pos = pool.findIndex(({ i }) => i === spriteIndex);
    spriteIndex = pool[(pos + 1) % pool.length]!.i;
    void renderPreview();
    renderStrip();
  };
  requestAnimationFrame(loop);

  renderRaces();
  renderGlobal();
  void (async () => {
    try {
      const r = await fetch(BASE + "catalog.json");
      if (!r.ok) throw new Error("no catalog");
      const cat = (await r.json()) as Catalog;
      clips = collapseSettlerDirections(catalogItems(cat.sprites));
      empty.classList.add("hidden");
      render();
    } catch {
      empty.classList.remove("hidden");
      empty.innerHTML =
        `No catalogue yet.<br/>Run <code>npm run dump:graphics</code> then refresh.`;
    }
  })();
}

const root = document.getElementById("viewer");
if (!root) throw new Error("#viewer missing");
mountViewer(root);
