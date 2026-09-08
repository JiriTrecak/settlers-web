/** Art-direction fixture: the saved map and the game's renderer, without editor chrome. */
import compare from "../assets/maps/showcase/ant-colony-compare.utcmap?raw";
import battlefield from "../assets/maps/showcase/mosswater-divide.utcmap?raw";
import { parseUtcMap, decodeHeight, HeightField, MAP_SIZE } from "./shared";
import { emptyLandscape } from "./shared/landscape/curve";
import { projectCatalogue, projectMeshUrl } from "./shared/assets/project";
import { Renderer } from "./render";
import {
  authoredScene,
  editorEntities,
  resourceStamps,
} from "./presentation/scenery";
async function start() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("map") === "mosswater-divide" ? battlefield : compare;
  const x = Number(params.get("x") ?? 128),
    z = Number(params.get("z") ?? 127),
    zoom = Math.max(0.5, Math.min(2, Number(params.get("zoom") ?? 0.8)));
  const map = parseUtcMap(JSON.parse(raw));
  if (!map) throw Error("Invalid Ant comparison map");
  const catalog = projectCatalogue();
  const urls = new Map(
    catalog.assets.flatMap((a) => {
      const url = projectMeshUrl(a.file);
      return url ? [[a.id, url] as [string, string]] : [];
    }),
  );
  const renderer = new Renderer(
    document.querySelector<HTMLCanvasElement>("#scene")!,
    urls,
  );
  renderer.setKinds(new Map(catalog.assets.map((a) => [a.id, a.type])));
  const field = new HeightField();
  field.load(map.height ? decodeHeight(map.height)! : [], map.waterLevel ?? 0);
  renderer.setTerrain(field);
  renderer.setLandscape(map.landscape ?? emptyLandscape());
  renderer.setGridMode("none");
  renderer.camera.setGame(true);
  renderer.camera.pose({
    x,
    z,
    yaw: 0,
    pitch: (42 * Math.PI) / 180,
    gameZoom: zoom,
  });
  const entities = editorEntities(map),
    snapshot = { tick: 0, size: MAP_SIZE, settlement: authoredScene(entities) },
    stamps = [...map.stamps, ...resourceStamps(entities)];
  renderer.draw(snapshot, stamps);
  await Promise.all([renderer.ready(), renderer.gameReady()]);
  renderer.draw(snapshot, stamps);
  // Repeat the same instant: asynchronous texture arrival can repaint without
  // changing wind/water phase or advancing the map's locked daytime clock.
  const frame = () => {
    renderer.present(12_000);
    requestAnimationFrame(frame);
  };
  frame();
  document.body.dataset.ready = "true";
  document.body.dataset.map = map.name;
  document.body.dataset.capture = JSON.stringify({
    x,
    z,
    yaw: 0,
    pitch: 42,
    gameZoom: zoom,
    animationTime: 12,
    stamps: map.stamps.length,
  });
}
void start().catch((error) => {
  const el = document.querySelector<HTMLElement>("#error")!;
  el.hidden = false;
  el.textContent = String(error?.stack ?? error);
  document.body.dataset.error = String(error);
});
