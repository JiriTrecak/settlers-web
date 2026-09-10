import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {Box3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {TreePlayer} from '../../src/render/prop/treePlayer';
for(const id of ['tree_primary','tree_secondary'])it(`${id} plays the game's felling sequence without shrinking`,async()=>{
 const bytes=readFileSync(`assets/environment/coniferous-pack/${id}.glb`);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const player=new TreePlayer(gltf.scene,gltf.animations),f={hp:0,lastHitTick:0,fallTick:0,direction:{x:0,y:1}};
 player.sample(f,0,72,240);const initial=new Box3().setFromObject(gltf.scene,true);
 player.sample(f,72,72,240);const fallen=new Box3().setFromObject(gltf.scene,true);
 expect(fallen.max.y-fallen.min.y).toBeLessThan(initial.max.y-initial.min.y);
 expect(fallen.min.y).toBeGreaterThan(-.15);
 player.sample(f,311,72,240);const sunk=new Box3().setFromObject(gltf.scene,true);
 expect(sunk.max.y).toBeLessThan(0);
 expect(sunk.max.x-sunk.min.x).toBeCloseTo(fallen.max.x-fallen.min.x,3);
 expect(player.sample(f,312,72,240)).toBe(false);expect(gltf.scene.visible).toBe(false);player.dispose();
});
