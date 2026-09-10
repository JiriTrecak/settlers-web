import { HeightField, decodeHeight } from "../../src/shared/map/height";
import { sampleCurve } from "../../src/shared/landscape/curve";
import type { UtcMap } from "../../src/shared/map/utcmap";
import { escape } from "./catalog";

/** North-up vector atlas, sampled from the game's decoded height field. No WebGL or browser needed. */
export function mapSvg(map: UtcMap): string {
  const field = new HeightField(map.size);
  field.load(
    map.height ? decodeHeight(map.height, map.size)! : [],
    map.waterLevel ?? 0,
  );
  const elements: string[] = [],
    water: string[] = [];
  const step = map.size / 128;
  // Merge equal-color runs into paths: thousands of samples, only a handful of SVG elements.
  const terrainPaths = new Map<string, string[]>();
  for (let y = 0; y < 128; y++) {
    const row: string[] = [],
      wet: boolean[] = [];
    for (let x = 0; x < 128; x++) {
      const h = field.sample(x * step, y * step);
      const slope = field.sample((x - 1) * step, (y - 1) * step) - h;
      const light =
        Math.round(Math.max(0.7, Math.min(1.25, 1 + slope * 0.12)) * 16) / 16;
      row.push(
        `rgb(${[70, 83, 51].map((v) => Math.round(v * light)).join(",")})`,
      );
      wet.push(h < field.waterLevel);
    }
    for (let x = 0; x < 128;) {
      const start = x,
        color = row[x];
      while (x < 128 && row[x] === color) x++;
      const chunks = terrainPaths.get(color) ?? [];
      const width = (x - start) * step;
      chunks.push(`M${start * step},${y * step}h${width}v${step}h-${width}z`);
      terrainPaths.set(color, chunks);
    }
    for (let x = 0; x < 128;) {
      if (!wet[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < 128 && wet[x]) x++;
      const width = (x - start) * step;
      water.push(`M${start * step},${y * step}h${width}v${step}h-${width}z`);
    }
  }
  for (const [color, paths] of terrainPaths)
    elements.push(`<path fill="${color}" d="${paths.join("")}"/>`);
  const colors = {
    sand: "#b9a077",
    mud: "#8d7358",
    grass: "#566b36",
    rock: "#868677",
    snow: "#c4cec6",
  };
  for (const s of map.landscape?.strokes ?? []) {
    elements.push(`<g fill="${colors[s.layer]}" opacity="${s.opacity * 0.8}">`);
    for (const p of sampleCurve(s.points, s.radius, 1.5))
      elements.push(
        `<circle cx="${p.x.toFixed(1)}" cy="${p.z.toFixed(1)}" r="${p.radius.toFixed(1)}"/>`,
      );
    elements.push("</g>");
  }
  elements.push(`<path fill="#365764" d="${water.join("")}"/>`);
  const trees = [
    ...map.stamps
      .filter((s) => /pine|tree/i.test(s.asset))
      .map((s) => ({ x: s.x, y: s.y })),
    ...map.entities
      .filter((e) => e.definition === "resource.forest.tree")
      .map((e) => e.position),
  ];
  elements.push('<g fill="#243c29" opacity=".7">');
  for (const p of trees)
    elements.push(`<circle cx="${p.x}" cy="${p.y}" r="1.6"/>`);
  elements.push("</g>");
  for (const e of map.entities.filter(
    (e) => e.definition === "building.neutral.amber-mine",
  ))
    elements.push(
      `<rect x="${e.position.x - 2}" y="${e.position.y - 2}" width="4" height="4" fill="#ffc775" stroke="#352918" stroke-width=".7"/>`,
    );
  for (const c of map.camps) {
    const { x, y } = c.home;
    elements.push(
      `<path d="M${x},${y - 3}l3,3 -3,3 -3,-3z" fill="${c.lootPool?.endsWith("hard") ? "#df7361" : c.lootPool?.endsWith("medium") ? "#eda36b" : "#e3daab"}" stroke="#1c2420" stroke-width=".7"/>`,
    );
  }
  for (const s of map.playerStarts)
    elements.push(
      `<circle cx="${s.x}" cy="${s.z}" r="8" fill="#172420" stroke="#f3d79d" stroke-width="1.5"/><text x="${s.x}" y="${s.z + 3}" font-family="sans-serif" font-size="8" font-weight="bold" fill="#fff" text-anchor="middle">${s.player}</text>`,
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${map.size} ${map.size}" role="img"><title>${escape(map.name)} — north-up terrain, mines, camps and starting positions</title>${elements.join("")}<text x="${map.size - 10}" y="14" text-anchor="end" font-family="sans-serif" font-size="10" fill="#fff">N ↑</text></svg>`;
}
