import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Group, Scene, SkinnedMesh } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SettlementLayer } from "../../src/render/settlement/settlementLayer";
import { HeightField } from "../../src/shared/map/height";
import { game } from "../game/helpers";
afterEach(() => vi.restoreAllMocks());

it("uses independent animated game variants, reacts once per strike, and distinguishes fog removal from death", async () => {
  const loader = new GLTFLoader();
  const variants = await Promise.all(["base", "warrior", "archer"].map(async variant => {
    const bytes = readFileSync(`assets/ant-colony/characters/${variant}.glb`);
    return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  }));
  vi.spyOn(GLTFLoader.prototype, "loadAsync").mockImplementation(async url => {
    const index = ["base", "warrior", "archer"].findIndex(v => url.includes(`characters/${v}.glb`));
    return index >= 0 ? variants[index] : {scene: new Group(), animations: []} as any;
  });
  const scene = new Scene(), layer = new SettlementLayer(scene);
  await layer.ready;
  const view = structuredClone(game().view()), field = new HeightField();
  layer.update(view, field, 0);
  const units = view.entities.filter(e => e.unit && e.definition.startsWith("unit.ants."));
  const warrior = units.find(e => e.definition === "unit.ants.warrior")!;
  const worker = units.find(e => e.definition === "unit.ants.settler")!;
  const characters = (layer as any).characters as Map<number, any>;
  expect(characters.get(warrior.id).player.variant).toBe("warrior");
  expect(characters.get(worker.id).player.variant).toBe("base");
  let skins = 0;
  characters.get(warrior.id).root.traverse((o: any) => { if (o instanceof SkinnedMesh) skins++; });
  expect(skins).toBeGreaterThan(0);
  warrior.unit!.moving = true;
  worker.unit!.moving = true;
  layer.update(view, field, 1);
  expect(characters.get(warrior.id).player.state).toBe("run");
  expect(characters.get(worker.id).player.state).toBe("run");
  worker.unit!.strolling = true;
  layer.update(view, field, 1);
  expect(characters.get(worker.id).player.state).toBe("walk");
  const attack = vi.spyOn(characters.get(warrior.id).player, "setState");
  warrior.unit!.moving = false;
  warrior.unit!.cooldown = 40;
  layer.update(view, field, 2);
  layer.update(view, field, 2);
  expect(attack.mock.calls.filter(([state, options]) => state === "attack" && (options as any)?.restart)).toHaveLength(1);
  // A disappeared worker is removed; only an explicitly observed death leaves a corpse.
  const next = {...view, entities: view.entities.filter(e => e.id !== warrior.id && e.id !== worker.id), deaths: [warrior]};
  layer.update(next, field, 3);
  expect(characters.has(worker.id)).toBe(false);
  expect(characters.get(warrior.id).player.state).toBe("death");
  expect((layer as any).entities.has(warrior.id)).toBe(false);
  layer.destroy(scene);
  expect(characters.size).toBe(0);
});
