import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Mesh,MeshStandardMaterial,Vector3} from 'three';
import {createCharacterInstance,type AntState} from '../../src/render/characters/character-player.js';

async function load(role:string){
 const file=`assets/models/units/ants/${role==='base'?'worker':role}/model.glb`;
 const b=readFileSync(file);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'');
}
const roles=['base','warrior','archer','hunter','bombardier','marshal'];
describe('published forest warfare company',()=>{
 it.each(roles)('%s has playable state mappings, finite animated bones and contact timing',async role=>{
  const gltf=await load(role),c=createCharacterInstance(gltf,role);
  const states:AntState[]=['idle','walk','run','carry','carry_walk','carry_run','attack','hit','death'];
  if(role==='base')states.push('build','chop');if(role==='hunter')states.push('charge');if(role==='marshal')states.push('cast');
  for(const state of states){
   expect(c.player.hasState(state)).toBe(true);c.player.setState(state,{fade:0});
   for(const phase of [0,.2,.55,.65,.9,.99999]){
    c.player.seek(phase);c.root.updateMatrixWorld(true);
    c.root.traverse(o=>expect(o.matrixWorld.elements.every(Number.isFinite),`${role}/${state}/${o.name}`).toBe(true));
   }
  }
  const events:string[]=[];c.player.onEvent=e=>events.push(e.type);
  c.player.setState('attack',{restart:true,fade:0});c.player.update(10);
  expect(events).toEqual([['archer','bombardier'].includes(role)?'release':'hit']);
  expect(c.player.state).toBe('idle');
  expect(c.player.attackContact()).toBe(['archer','bombardier'].includes(role)?.65:.55);
  c.player.setState('death');c.player.update(10);expect(c.player.state).toBe('death');expect(c.player.action.paused).toBe(true);
  c.dispose();
 });
 it('keeps natural chitin independent of red ownership and instance recoloring',async()=>{
  const gltf=await load('warrior'),a=createCharacterInstance(gltf,'warrior'),b=createCharacterInstance(gltf,'warrior');
  const mats=(root:typeof a.root)=>{const map=new Map<string,MeshStandardMaterial>();root.traverse(o=>{if(o instanceof Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])map.set(m.name,m as MeshStandardMaterial);});return map;};
  const am=mats(a.root),bm=mats(b.root),natural=am.get('Natural mahogany chitin')!.color.clone();
  a.player.setTeamColor('#2878df');expect(am.get('TC_TeamColor')!.color.equals(bm.get('TC_TeamColor')!.color)).toBe(false);
  expect(am.get('Natural mahogany chitin')!.color.equals(natural)).toBe(true);
  a.dispose();b.dispose();
 });
 it('loops walking, running and loaded locomotion without a pose jump',async()=>{
  const c=createCharacterInstance(await load('base'),'base');
  for(const state of ['idle','walk','run','carry','carry_walk','carry_run'] as const){
   c.player.setState(state,{fade:0});c.player.seek(0);c.root.updateMatrixWorld(true);
   const names=['hips','footL','footR','socket_handL','socket_handR'];
   const start=names.map(n=>c.root.getObjectByName(n)!.getWorldPosition(new Vector3()));
   c.player.seek(.999999);c.root.updateMatrixWorld(true);
   names.forEach((n,i)=>expect(c.root.getObjectByName(n)!.getWorldPosition(new Vector3()).distanceTo(start[i]),`${state}/${n}`).toBeLessThan(.003));
  }
  c.player.setState('carry_run',{fade:0});c.player.seek(.25);
  expect(c.player.action.getClip().name).toBe('carry_run');c.dispose();
 });
});
