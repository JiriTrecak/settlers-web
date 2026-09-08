import {describe,it,expect} from 'vitest';
import {Settlement} from '../../src/sim/settlement/settlement';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared';
const map={v:1 as const,name:'Camps',waterLevel:-1,stamps:[{id:'wolf',asset:'neutral-wolf',x:99.5,y:99.5,yaw:0},{id:'ogre',asset:'neutral-ogre',x:103.5,y:99.5,yaw:0}],playerStarts:[{player:1,x:60,z:60},{player:2,x:196,z:196}]};
const create=()=>new Settlement(map,[{player:0,kind:'human'},{player:1,kind:'human'}]);
describe('neutral camps',()=>{
 it('round trips authored placements and spawns independent creatures',()=>{
  expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))?.stamps).toEqual(map.stamps);
  const s=create(),n=s.workers.filter(w=>w.owner===-1);
  expect(n.map(w=>[w.role,w.health])).toEqual([['wolf',90],['ogre',350]]);
  expect(n[0]!.camp).toEqual({x:100,z:100});expect(s.colonies).toHaveLength(2);
  for(let t=1;t<200;t++)s.tick(t);
  expect(n.every(w=>w.health===(w.role==='wolf'?90:350)&&w.job==='idle')).toBe(true);
  expect(s.command(0,{type:'move-units',ids:[n[0]!.id],x:120,z:120})).toBe(false);
 });
 it('aggros players, deals damage, and returns home after a long chase',()=>{
  const s=create(),wolf=s.workers.find(w=>w.role==='wolf')!,victim=s.workers.find(w=>w.owner===0&&w.role==='carrier')!;
  victim.x=101;victim.z=100;
  for(let t=1;t<=20;t++)s.tick(t);
  expect(victim.health).toBeLessThan(60);expect(wolf.target).toBe(victim.id);
  victim.x=150;victim.z=150;
  for(let t=21;t<=200;t++)s.tick(t);
  expect(wolf.target).toBe(0);expect([wolf.x,wolf.z]).toEqual([100,100]);
 });
 it('allows player combat and removes dead neutrals without drops',()=>{
  const s=create(),wolf=s.workers.find(w=>w.role==='wolf')!,warrior=s.workers.find(w=>w.owner===0&&w.role==='warrior')!;
  warrior.x=99;warrior.z=100;s.visibility.update(s.buildings,s.workers,s.resources,s.territory);
  expect(s.command(0,{type:'attack',id:warrior.id,target:wolf.id})).toBe(true);
  const resources=s.resources.length;expect(s.damageUnit(wolf.id,90)).toBe(true);
  expect(s.workers.some(w=>w.id===wolf.id)).toBe(false);expect(s.resources).toHaveLength(resources);
 });
 it('remains deterministic including camp state and hides unexplored creatures',()=>{
  const a=create(),b=create();
  for(let t=1;t<=160;t++){a.tick(t);b.tick(t);}
  expect(a.checksum()).toBe(b.checksum());
  expect(a.view(0).workers.some(w=>w.owner===-1)).toBe(false);
 });
});
