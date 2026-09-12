import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SkinnedMesh,Mesh,MeshStandardMaterial} from 'three';
import {createCharacterInstance, type AntState} from '../../src/render/characters/character-player.js';
async function load(){const b=readFileSync('assets/models/units/ants/hunter/model.glb');return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
it('exports a skinned Hunter with distinct locomotion, charge and spear attack clips',async()=>{
 const gltf=await load();let skins=0;gltf.scene.traverse(o=>{if(o instanceof SkinnedMesh)skins++});expect(skins).toBeGreaterThan(0);
 const c=createCharacterInstance(gltf,'hunter');
 for(const state of ['idle','walk','run','charge','carry','attack','hit','death'] as AntState[]){c.player.setState(state);expect(c.player.action.getClip().tracks.length).toBeGreaterThan(0)}
 expect(gltf.animations.map(c=>c.name)).toContain('attack_spear');
 const samples=new Map();for(const state of ['walk','run','charge'] as AntState[]){c.player.setState(state);c.player.seek(.3);samples.set(state,c.root.getObjectByName('upper_armR')!.quaternion.toArray())}
 expect(samples.get('run')).not.toEqual(samples.get('walk'));expect(samples.get('charge')).not.toEqual(samples.get('run'));
 c.dispose();
});
it('loops cleanly, emits one impact, and holds death without mutating another Hunter',async()=>{
 const gltf=await load(),a=createCharacterInstance(gltf,'hunter'),b=createCharacterInstance(gltf,'hunter');
 const team=(root: typeof a.root)=>{let m:MeshStandardMaterial|undefined;root.traverse(o=>{if(o instanceof Mesh)for(const x of Array.isArray(o.material)?o.material:[o.material])if(x.name==='TC_TeamColor')m=x as MeshStandardMaterial});return m!};
 a.player.setTeamColor('#2878df');expect(team(a.root).color.equals(team(b.root).color)).toBe(false);
 for(const state of ['idle','walk','run','charge','carry'] as AntState[]){a.player.setState(state);a.player.seek(0);const before=a.root.getObjectByName('thighL')!.quaternion.clone();a.player.seek(.999999);expect(before.angleTo(a.root.getObjectByName('thighL')!.quaternion)).toBeLessThan(.005);}
 const events:string[]=[];a.player.onEvent=e=>events.push(e.type);a.player.setState('attack');a.player.update(3);a.player.update(1);expect(events).toEqual(['hit']);expect(a.player.state).toBe('idle');
 a.player.setState('death');a.player.update(3);expect(a.player.action.paused).toBe(true);expect(b.player.state).toBe('idle');
 a.dispose();b.dispose();
});
