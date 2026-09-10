import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Mesh, SkinnedMesh, Vector3 } from 'three';
import { createCharacterInstance } from '../../src/render/characters/character-player.js';

for (const species of ['amberjaw-staglord','thornblade-matriarch']) describe(species, () => {
 it('exports a compact neutral rig, isolated instances and six functional states', async () => {
  const bytes=readFileSync(`assets/ant-colony/characters/${species}.glb`);
  expect(bytes.equals(readFileSync(`experiments/assets/characters/${species}/${species}.glb`))).toBe(true);
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  expect(gltf.animations.map(c=>c.name).sort()).toEqual(['attack','death','hit','idle','run','walk']);
  let triangles=0,skins=0;
  gltf.scene.traverse(o=>{if(o instanceof SkinnedMesh)skins++;if(o instanceof Mesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material])expect(m.name).not.toBe('TC_TeamColor');}});
  expect(skins).toBeGreaterThan(0);expect(triangles).toBeLessThan(10000);
  const a=createCharacterInstance(gltf,species),b=createCharacterInstance(gltf,species);
  const bone=a.root.getObjectByName('head')!,other=b.root.getObjectByName('head')!;
  expect(bone).toBeTruthy();const initial=other.quaternion.clone();
  for(const state of ['idle','walk','run','attack','hit','death'] as const){
   a.player.setState(state,{restart:true});
   for(const time of [0,.25,.55,.8,1]){a.player.seek(time);a.root.updateMatrixWorld(true);a.root.traverse(o=>expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));}
  }
  expect(other.quaternion.angleTo(initial)).toBeLessThan(.00001);
  const events:string[]=[];a.player.onEvent=e=>events.push(e.type);a.player.setState('attack',{restart:true});a.player.update(3);expect(events).toEqual(['hit']);expect(a.player.state).toBe('idle');
  a.player.setState('death');a.player.update(5);a.root.updateMatrixWorld(true);let floor=Infinity;a.root.traverse(o=>{if(o instanceof SkinnedMesh){o.skeleton.update();const v=new Vector3();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld);floor=Math.min(floor,v.y);}}});expect(Math.abs(floor)).toBeLessThan(.03);expect(a.player.state).toBe('death');expect(a.player.action.paused).toBe(true);
  for(const name of ['idle','walk','run']){const clip=gltf.animations.find(c=>c.name===name)!;for(const track of clip.tracks){const size=track.getValueSize();for(let i=0;i<size;i++)expect(track.values[i]).toBeCloseTo(track.values[track.values.length-size+i],4);}}
  a.dispose();b.dispose();
 });
});
