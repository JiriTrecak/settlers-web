import { describe,it,expect } from 'vitest';
import { Settlement } from '../../src/sim/settlement/settlement';
import { areaSelection } from '../../src/shared/settlement/selection';
import { validAction } from '../../src/shared/types/types';
import { World } from '../../src/sim/world/world';
const map={v:1 as const,name:'Orders',waterLevel:-1,stamps:[],playerStarts:[{player:1,x:60,z:60},{player:2,x:196,z:196}]};
const slots=[{player:0,kind:'human' as const},{player:1,kind:'human' as const}];
const make=()=>new Settlement(map,slots);
const advance=(s:Settlement,n:number)=>{for(let t=1;t<=n;t++)s.tick(t);};
const refresh=(s:Settlement)=>s.visibility.update(s.buildings,s.workers,s.resources,s.territory);
describe('RTS selection and orders',()=>{
 it('prioritizes only owned soldiers, falls back to workers, and excludes recruits',()=>{
  const s=make(),own=s.workers.filter(w=>w.owner===0);
  expect(areaSelection(s.workers,0)).toEqual(own.filter(w=>w.role==='warrior').map(w=>w.id));
  const workers=own.filter(w=>w.role!=='warrior');workers[0]!.job='training';
  expect(areaSelection(workers,0)).toEqual(workers.slice(1).map(w=>w.id));
  expect(areaSelection(s.workers.filter(w=>w.owner===1),0)).toEqual([]);
 });
 it('uses distinct reachable formation destinations and ignores foreign IDs',()=>{
  const s=make(),army=s.workers.filter(w=>w.owner===0&&w.role==='warrior'),enemy=s.workers.find(w=>w.owner===1)!;
  const initial={x:enemy.x,z:enemy.z};
  expect(s.command(0,{type:'move-units',ids:[enemy.id,...army.map(w=>w.id)],x:100,z:100})).toBe(true);
  expect(new Set(army.map(w=>w.path.at(-1))).size).toBe(2);
  advance(s,800);
  expect(new Set(army.map(w=>`${w.x},${w.z}`)).size).toBe(2);
  expect(army.every(w=>Math.abs(w.x-100)<=2&&Math.abs(w.z-100)<=2)).toBe(true);
  expect({x:enemy.x,z:enemy.z}).toEqual(initial);
 });
 it('attack-moves toward ground, engages an encountered enemy and resumes its destination',()=>{
  const s=make(),w=s.workers.find(w=>w.owner===0&&w.role==='warrior')!,enemy=s.workers.find(w=>w.owner===1&&w.role==='carrier')!;
  w.x=100;w.z=100;enemy.x=109;enemy.z=100;enemy.timer=10000;refresh(s);
  s.command(0,{type:'move-units',ids:[w.id],x:120,z:100,attackMove:true});
  advance(s,700);
  expect(s.workers.some(v=>v.id===enemy.id)).toBe(false);
  expect([w.x,w.z]).toEqual([120,100]);expect(w.attackDestination).toBe(null);
 });
 it('only allows friendly fire when explicitly forced and never allows self-targeting',()=>{
  const s=make(),w=s.workers.find(w=>w.role==='warrior'&&w.owner===0)!,friend=s.workers.find(w=>w.role==='carrier'&&w.owner===0)!;
  w.x=100;w.z=100;friend.x=101;friend.z=100;friend.timer=10000;refresh(s);
  expect(s.command(0,{type:'attack',id:w.id,target:friend.id})).toBe(false);
  expect(s.command(0,{type:'attack-units',ids:[w.id],target:friend.id,force:true})).toBe(true);
  advance(s,1);expect(friend.health).toBeLessThan(60);
  expect(s.command(0,{type:'attack',id:w.id,target:w.id,force:true})).toBe(false);
 });
 it('can explicitly attack a friendly building and clears attack-move when stopped',()=>{
  const s=make(),w=s.workers.find(w=>w.owner===0&&w.role==='warrior')!,fort=s.buildings[0]!;
  w.x=fort.x;w.z=fort.z+5;refresh(s);
  expect(s.command(0,{type:'attack-units',ids:[w.id],target:fort.id,force:true})).toBe(true);
  advance(s,1);expect(fort.health).toBeLessThan(1000);
  s.command(0,{type:'move-units',ids:[w.id],x:100,z:100,attackMove:true});
  s.command(0,{type:'stop-unit',id:w.id});expect(w.attackDestination).toBeNull();expect(w.path).toEqual([]);
 });
 it('rejects malformed group commands and clones group IDs at the input boundary',()=>{
  expect(validAction({type:'move-units',ids:[1,1],x:1,z:1})).toBe(false);
  expect(validAction({type:'attack-units',ids:[],target:1})).toBe(false);
  expect(validAction({type:'attack-units',ids:[1],target:2,force:'yes'})).toBe(false);
  const world=new World({map,slots,seed:1}),id=world.settlement!.workers.find(w=>w.role==='warrior')!.id,ids=[id];
  world.enqueue({type:'move-units',ids,x:100,z:100},1,{player:0});ids[0]=99999;world.tick();
  expect(world.settlement!.workers.find(w=>w.id===id)!.path.length).toBeGreaterThan(0);
 });
 it('keeps group movement and forced attacks deterministic regardless of supplied ID order',()=>{
  const a=make(),b=make();
  for(const [index,s] of [a,b].entries()){
    const ids=s.workers.filter(w=>w.owner===0&&w.role==='warrior').map(w=>w.id);
    s.command(0,{type:'move-units',ids:index?ids.reverse():ids,x:100,z:100,attackMove:true});
  }
  for(let t=1;t<=500;t++){a.tick(t);b.tick(t);if(t%40===0)expect(a.checksum()).toBe(b.checksum());}
 });
});
