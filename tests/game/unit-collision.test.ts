import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {fixed} from '../../src/sim/game/motion';

it('does not treat contained, releasing or dead units as collision bodies',()=>{
 const g=game([placed('mover','unit.test.warrior',100,100),placed('u','unit.test.warrior',103,100)]);
 const mover=g.entities.find(e=>e.placement==='mover')!,e=g.entities.find(e=>e.placement==='u')!;
 const at=fixed({x:103,y:100});
 const check=(solid:boolean)=>{
  for(const indexed of [false,true]){
   if(indexed)g.spatial.beginUnitMovement();
   try{
    expect(g.spatial.unitSegmentClear(at,at,mover.id)).toBe(!solid);
    expect(g.spatial.unitSegmentClear(fixed(mover),at,mover.id)).toBe(!solid);
   }finally{if(indexed)g.spatial.endUnitMovement();}
  }
 };
 check(true);
 e.unit!.contained=1;check(false);
 e.unit!.contained=null;e.unit!.release={x:103,y:100};check(false);
 e.unit!.release=null;check(true);
 e.hp=0;check(false);
});

it('waits at a temporarily occupied passage instead of marching around the map edge',()=>{
 const g=game([placed('mover','unit.test.warrior',100,100),placed('gate','unit.test.warrior',105,100)]);
 const a=g.entities.find(e=>e.placement==='mover')!,b=g.entities.find(e=>e.placement==='gate')!;
 // Five navigation cells fit one three-unit body, but not two abreast.
 for(let y=6;y<250;y++)if(y<98||y>102)g.spatial.terrain[y*256+105]=0;
 g.spatial.rebuild();
 // Keep the obstruction intentional: ordinary idle allies may now yield.
 g.command('player.1',{type:'hold',actors:[b.id]});
 g.command('player.1',{type:'move',actors:[a.id],destination:{x:110,y:100}});
 for(let i=0;i<180;i++){g.tick();expect(a.y).toBe(100);}
 expect(a.x).toBeLessThan(105);
 g.command('player.1',{type:'move',actors:[b.id],destination:{x:110,y:104}});
 for(let i=0;i<160;i++)g.tick();
 expect(a.x).toBe(110);expect(a.y).toBe(100);
});


it('collects every physical blocker while matching the ordinary collision query',()=>{
 const g=game([0,1,2,3].map(i=>placed('body'+i,'unit.test.warrior',100+i,100)));
 const units=g.entities.filter(e=>e.placement?.startsWith('body')).sort((a,b)=>a.x-b.x),mover=units[0];
 const before=g.snapshot();
 for(const indexed of [false,true]){
  if(indexed)g.spatial.beginUnitMovement();
  const from=fixed(mover),to=fixed({x:104,y:100}),blockers:number[]=[];
  expect(g.spatial.unitSegmentClear(from,to,mover.id,blockers)).toBe(false);
  expect(g.spatial.unitSegmentClear(from,to,mover.id)).toBe(false);
  expect(blockers.sort((a,b)=>a-b)).toEqual(units.slice(1).map(e=>e.id).sort((a,b)=>a-b));
  const untouched=[999];
  expect(g.spatial.unitSegmentClear(from,fixed({x:100,y:101}),mover.id,untouched)).toBe(true);
  expect(untouched).toEqual([999]);
  if(indexed)g.spatial.endUnitMovement();
 }
 expect(g.snapshot()).toEqual(before);
});
