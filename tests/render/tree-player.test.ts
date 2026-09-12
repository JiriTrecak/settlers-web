import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, Vector3 } from 'three';
import { TreePlayer } from '../../src/render/prop/treePlayer';

it('samples actual hit/fall/decay clips at 1x, sinks at full size, and keeps instances independent', async () => {
  const b = readFileSync('assets/models/environment/trees/olive-pine-animated/model.glb');
  const g = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset+b.byteLength), '');
  const a = g.scene.clone(true), untouched = g.scene.clone(true), player = new TreePlayer(a, g.animations);
  const standing = new Box3().setFromObject(untouched);
  const f = {hp: 9, lastHitTick: 0, fallTick: null as number | null, direction:{x:0,y:1}};
  player.sample(f, 10, 72, 240); expect(player.state).toBe('hit');
  expect(new Box3().setFromObject(a).equals(standing)).toBe(false);
  player.sample(f, 24, 72, 240);
  expect(new Box3().setFromObject(a).max.distanceTo(standing.max)).toBeLessThan(.001);
  f.hp = 0; f.fallTick = f.lastHitTick = 100;
  player.sample(f, 171.999, 72, 240); expect(player.state).toBe('fall');
  const fallen = new Box3().setFromObject(a);
  player.sample(f, 172, 72, 240); expect(player.state).toBe('decay');
  expect(new Box3().setFromObject(a).max.distanceTo(fallen.max)).toBeLessThan(.01);
  player.sample(f, 411.99, 72, 240);
  expect(new Box3().setFromObject(a).max.y).toBeLessThan(0);
  a.traverse(o => expect(o.scale.distanceTo(new Vector3(1,1,1))).toBeLessThan(.001));
  expect(player.sample(f, 412, 72, 240)).toBe(false); expect(a.visible).toBe(false);
  expect(new Box3().setFromObject(untouched).equals(standing)).toBe(true);
  player.dispose();
});
