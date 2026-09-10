import { HeightField, decodeHeight } from "../../shared/map/height";
import { sampleCurve } from "../../shared/landscape/curve";
import type { UtcMap } from "../../shared/map/utcmap";
import { playerCss } from "../../shared/player/player";

/** A small, north-up atlas drawn from the same authored terrain as the match. No world or GPU needed. */
export function mapPreview(
  map: UtcMap,
  human: number | null,
  terrain?: HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    `${map.name} terrain and player starting positions`,
  );
  const ctx = canvas.getContext("2d")!;
  if (terrain) ctx.drawImage(terrain, 0, 0);
  else drawTerrain(ctx, map);
  for (const start of map.playerStarts) {
    const x = (start.x / map.size) * 512,
      y = (start.z / map.size) * 512,
      active = start.player - 1 === human;
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, y, active ? 16 : 13, 0, Math.PI * 2);
    ctx.fillStyle = "#111a19";
    ctx.fill();
    ctx.lineWidth = active ? 3 : 2;
    ctx.strokeStyle = active ? "#f7e2aa" : playerCss(start.player - 1);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = playerCss(start.player - 1);
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "#f8ecd1";
    ctx.strokeStyle = "#111a19";
    ctx.lineWidth = 4;
    ctx.strokeText(`P${start.player}`, x, y + 30);
    ctx.fillText(`P${start.player}`, x, y + 30);
  }
  ctx.font = "12px Georgia";
  ctx.textAlign = "center";
  ctx.fillStyle = "#d5ddc8";
  ctx.fillText("N", 484, 24);
  ctx.beginPath();
  ctx.moveTo(484, 30);
  ctx.lineTo(480, 42);
  ctx.lineTo(484, 39);
  ctx.lineTo(488, 42);
  ctx.closePath();
  ctx.fill();
  return canvas;
}
export function mapTerrain(map: UtcMap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  drawTerrain(canvas.getContext("2d")!, map);
  return canvas;
}
function drawTerrain(ctx: CanvasRenderingContext2D, map: UtcMap) {
  const field = new HeightField(map.size);
  field.load(
    map.height ? decodeHeight(map.height, map.size)! : [],
    map.waterLevel ?? 0,
  );
  const image = ctx.createImageData(512, 512),
    water = ctx.createImageData(512, 512),
    scale = 512 / map.size;
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const wx = x / scale,
        wz = y / scale,
        h = field.sample(wx, wz),
        slope = field.sample(wx - 1, wz - 1) - h;
      const light = Math.max(0.65, Math.min(1.3, 1 + slope * 0.15)),
        grain = ((x * 73 + y * 137) % 19) - 9,
        i = (y * 512 + x) * 4;
      image.data.set(
        [
          Math.round(82 * light + grain),
          Math.round(88 * light + grain),
          Math.round(54 * light + grain * 0.4),
          255,
        ],
        i,
      );
      if (h < field.waterLevel) {
        const depth = Math.min(1, (field.waterLevel - h) / 5);
        water.data.set(
          [54 - depth * 14, 83 - depth * 16, 87 - depth * 12, 255],
          i,
        );
      }
    }
  ctx.putImageData(image, 0, 0);
  ctx.save();
  ctx.scale(scale, scale);
  for (const patch of map.landscape?.cover ?? []) {
    ctx.fillStyle = "#60743b14";
    ctx.beginPath();
    ctx.arc(patch.x, patch.z, patch.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const stroke of map.landscape?.strokes ?? []) {
    ctx.fillStyle = {
      sand: "#b39a67",
      mud: "#817054",
      grass: "#596a38",
      rock: "#777767",
      snow: "#bbcbc1",
    }[stroke.layer];
    ctx.globalAlpha = stroke.opacity * 0.8;
    for (const p of sampleCurve(stroke.points, stroke.radius, 1.5)) {
      ctx.beginPath();
      ctx.arc(p.x, p.z, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  const waterCanvas = document.createElement("canvas");
  waterCanvas.width = waterCanvas.height = 512;
  waterCanvas.getContext("2d")!.putImageData(water, 0, 0);
  ctx.drawImage(waterCanvas, 0, 0);
  ctx.save();
  ctx.scale(scale, scale);
  const trees = [
    ...map.stamps
      .filter((s) => /pine|tree/i.test(s.asset))
      .map((s) => ({ x: s.x, y: s.y })),
    ...map.entities
      .filter((e) => e.definition === "resource.forest.tree")
      .map((e) => e.position),
  ];
  for (const p of trees) {
    ctx.fillStyle = "#182f25b3";
    ctx.beginPath();
    ctx.arc(p.x + 0.6, p.y + 0.7, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#526743";
    ctx.beginPath();
    ctx.arc(p.x - 0.25, p.y - 0.35, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  for (const e of map.entities.filter(
    (e) => e.definition === "building.neutral.amber-mine",
  )) {
    const x = e.position.x * scale,
      y = e.position.y * scale;
    ctx.fillStyle = "#e3b361";
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  for (const camp of map.camps) {
    const x = camp.home.x * scale,
      y = camp.home.y * scale;
    ctx.strokeStyle = "#daa06d";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x + 3, y);
    ctx.lineTo(x, y + 3);
    ctx.lineTo(x - 3, y);
    ctx.closePath();
    ctx.stroke();
  }
  const fade = ctx.createRadialGradient(256, 256, 130, 256, 256, 360);
  fade.addColorStop(0, "#08141100");
  fade.addColorStop(1, "#08141177");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 512, 512);
}
