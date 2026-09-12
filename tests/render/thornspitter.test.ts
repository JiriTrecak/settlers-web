import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SkinnedMesh,Vector3} from 'three';
import {createCharacterInstance,type AntState} from '../../src/render/characters/character-player.js';
it('exports a natural-color quadruped with distinct locomotion and a timed ranged release',async()=>{
 const bytes=readFileSync('assets/models/units/neutral/thornspitter/model.glb');
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const a=createCharacterInstance(gltf,'thornspitter');let triangles=0,team=false;
 a.root.traverse(o=>{if(o instanceof SkinnedMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material])team ||= m.name==='TC_TeamColor';}});
 expect(triangles).toBe(3456);expect(team).toBe(false);
 const poses:Vector3[]=[];
 for(const state of ['idle','walk','run','attack','hit','death'] as AntState[]){a.player.setState(state,{restart:true});a.player.seek(.3);a.root.updateMatrixWorld(true);a.root.traverse(o=>expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));if(state==='walk'||state==='run')poses.push(a.root.getObjectByName('frontL')!.getWorldPosition(new Vector3()));}
 expect(poses[0].distanceTo(poses[1])).toBeGreaterThan(.02);
 const events:string[]=[];a.player.onEvent=e=>events.push(e.type);a.player.setState('attack',{restart:true});a.player.update(2);expect(events).toEqual(['release']);expect(a.player.state).toBe('idle');
 a.player.setState('death');a.player.update(3);expect(a.player.state).toBe('death');a.dispose();
});
