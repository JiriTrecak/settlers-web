import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SkinnedMesh} from 'three';
import {createCharacterInstance,type AntState} from '../../src/render/characters/character-player.js';
async function load(){const b=readFileSync('assets/models/units/ants/bombardier/model.glb');return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
it('exports a skinned mortar carrier with distinct gaits and actual barrel recoil',async()=>{
 const gltf=await load();let skins=0;gltf.scene.traverse(o=>{if(o instanceof SkinnedMesh)skins++});expect(skins).toBeGreaterThan(0);
 const c=createCharacterInstance(gltf,'bombardier');
 for(const state of ['idle','walk','run','carry','attack','hit','death'] as AntState[]){c.player.setState(state);expect(c.player.action.getClip().tracks.length).toBeGreaterThan(0)}
 c.player.setState('attack');c.player.seek(.5);const mortar=c.root.getObjectByName('mortar')!,before=mortar.position.clone();c.player.seek(.68);expect(mortar.position.distanceTo(before)).toBeGreaterThan(.05);
 const q=[];for(const state of ['walk','run'] as AntState[]){c.player.setState(state);c.player.seek(.3);q.push(c.root.getObjectByName('thighL')!.quaternion.toArray())}expect(q[0]).not.toEqual(q[1]);c.dispose();
});
it('loops gaits, releases once across long frames, and holds a separate death instance',async()=>{
 const gltf=await load(),a=createCharacterInstance(gltf,'bombardier'),b=createCharacterInstance(gltf,'bombardier');
 for(const state of ['idle','walk','run','carry'] as AntState[]){a.player.setState(state);a.player.seek(0);const q=a.root.getObjectByName('thighL')!.quaternion.clone();a.player.seek(.99999);expect(q.angleTo(a.root.getObjectByName('thighL')!.quaternion)).toBeLessThan(.005);}
 const events:string[]=[];a.player.onEvent=e=>events.push(e.type);a.player.setState('attack');a.player.update(3);a.player.update(1);expect(events).toEqual(['release']);expect(a.player.state).toBe('idle');
 a.player.setState('death');a.player.update(3);expect(a.player.action.paused).toBe(true);expect(b.player.state).toBe('idle');a.dispose();b.dispose();
});
