import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {GameContext} from '../../src/sim/game/context';
import {emptyState} from '../../src/sim/game/state';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {fixed,precise} from '../../src/sim/game/motion';
import {routeToAttack} from '../../src/sim/game/attackApproach';
import {TargetIndex} from '../../src/sim/game/targetIndex';
import {game,placed,run} from './helpers';

it('declares the agreed C-based unit sizes, speeds, supply and starting company',()=>{
 for(const [role,radius,speed,supply] of [['settler',1.5,12,1],['warrior',1.5,12,1],['archer',1.5,12,1],['marshal',2,13,4],['hunter',2,14,2],['bombardier',2.5,10,3]] as const){
  const d=content.get('unit.ants.'+role);
  expect(d.dimensions!.radius).toBe(radius);expect(d.dimensions!.formationSpacing).toBeGreaterThanOrEqual(radius*2);
  expect(d.behaviors.movement!.speed).toBe(speed);expect(d.supplyCost).toBe(supply);
 }
 expect(content.get('unit.ants.archer').behaviors.combat!.range).toBe(20);
 expect(content.get('unit.ants.bombardier').behaviors.combat!.range).toBe(32);
 expect(content.get('unit.ants.warrior').behaviors.combat!.range).toBe(.6);
 const g=game(),company=g.entities.filter(e=>e.owner==='player.1'&&e.unit);
 expect(company.filter(e=>e.definition==='unit.ants.settler')).toHaveLength(6);
 expect(company.filter(e=>content.get(e.definition).hero)).toHaveLength(1);
 expect(company.reduce((s,e)=>s+content.get(e.definition).supplyCost!,0)).toBe(10);
 expect(content.get('building.ants.fort').supplyProvided).toBe(15);
 expect(content.get('building.ants.house').supplyProvided).toBe(8);
 for(let i=0;i<company.length;i++){
  expect(g.spatial.unitWalkable(company[i],company[i])).toBe(true);
  for(let j=0;j<i;j++)expect(Math.hypot(company[i].x-company[j].x,company[i].y-company[j].y)).toBeGreaterThanOrEqual(g.spatial.dimensions(company[i]).radius+g.spatial.dimensions(company[j]).radius);
 }
});

it('measures circle/circle and circle/building edge gaps without changing point ranges',()=>{
 const c=new GameContext(emptyState(),content,emptyUtcMap());
 const a=c.create(placed('a','unit.ants.warrior',100,100)),b=c.create(placed('b','unit.ants.marshal',104,100));
 expect(c.spatial.range(a,b)).toBe(16);expect(c.spatial.bodyRange(a,b)).toBe(.25);
 b.unit!.position=fixed({x:104.1,y:100});expect(c.spatial.bodyRange(a,b)).toBeCloseTo(.36);
 const house=c.create(placed('house','building.ants.house',135.5,135.5));
 expect(c.spatial.bodyRange(a,house,{x:129.4,y:135.5})).toBeCloseTo(.36);
 const diagonal=2.1/Math.sqrt(2);
 expect(c.spatial.bodyRange(a,house,{x:131.5-diagonal,y:131.5-diagonal})).toBeCloseTo(.36);
});

it('indexes body edges across buckets so hold can acquire a target beyond center reach',()=>{
 const placements=[placed('a','unit.ants.warrior',129,100),{...placed('b','unit.ants.warrior',132,100),owner:'player.2' as const}];
 const g=game(placements),a=g.entities.find(e=>e.placement==='a')!,b=g.entities.find(e=>e.placement==='b')!;
 const index=new TargetIndex([b],g.registry);
 expect([...index.near(a,2.1)]).toContain(b);
 g.command(a.owner,{type:'hold',actors:[a.id]});g.command(b.owner,{type:'hold',actors:[b.id]});
 const hp=b.hp!;run(g,100);
 expect(b.hp).toBeLessThan(hp);expect(precise(a)).toMatchObject({x:129,y:100});
});

it('approaches a melee target at body-edge reach and replays the fight through restore',()=>{
 const placements=[placed('a','unit.ants.warrior',80,100),{...placed('b','unit.ants.warrior',105,100),owner:'player.2' as const}];
 const g=game(placements),copy=game(placements),a=g.entities.find(e=>e.placement==='a')!,b=g.entities.find(e=>e.placement==='b')!;
 g.command(b.owner,{type:'hold',actors:[b.id]});
 expect(g.command(a.owner,{type:'attack',actors:[a.id],target:b.id}).accepted).toBe(true);
 const hp=b.hp!;run(g,30);copy.restore(g.snapshot());
 for(let i=0;i<180;i++){
  g.tick();copy.tick();expect(copy.checksum('full')).toBe(g.checksum('full'));
  expect(Math.hypot(precise(a).x-precise(b).x,precise(a).y-precise(b).y)).toBeGreaterThanOrEqual(3-.001);
 }
 expect(b.hp).toBeLessThan(hp);expect(g.spatial.bodyRange(a,b)).toBeLessThanOrEqual(.6**2+.001);
});

it('finds legal approaches to each side of a building for infantry, heroes and siege',()=>{
 for(const role of ['warrior','marshal','bombardier']){
  const c=new GameContext(emptyState(),content,emptyUtcMap()),a=c.create(placed('a','unit.ants.'+role,70,100)),b=c.create(placed('house','building.ants.house',105,100));
  c.spatial.rebuild();expect(routeToAttack(c,a,b)).toBe(true);
  const goal=c.spatial.point(a.unit!.goal!);
  expect(c.spatial.bodyRange(a,b,goal)).toBeLessThanOrEqual(c.def(a).behaviors.combat!.range**2);
  expect(c.spatial.unitWalkable(goal,a)).toBe(true);
 }
});

it('travels at the authored speed on the 128 C map without a hidden scale multiplier',()=>{
 const c=new GameContext(emptyState(),content,emptyUtcMap(512));
 const e=c.create({...placed('runner','unit.ants.warrior',64,64),rotation:90});
 c.spatial.rebuild();expect(c.spatial.route(e,{x:184,y:64},false)).toBe(true);
 for(let i=0;i<200;i++){c.state.tick++;c.move();}
 expect(precise(e).x).toBeCloseTo(124,2); // 15 C in five seconds.
 for(let i=0;i<200;i++){c.state.tick++;c.move();}
 expect(precise(e).x).toBeCloseTo(184,2); // 30 C in ten seconds.
});

it('releases contained large bodies only at positions with full-body clearance',()=>{
 const c=new GameContext(emptyState(),content,emptyUtcMap());
 const house=c.create(placed('house','building.ants.house',103.5,103.5));
 const e=c.create(placed('large','unit.ants.bombardier',80,100));
 e.unit!.contained=house.id;c.spatial.rebuild();
 // A point just outside the west wall fits the generic probe, not this body.
 c.release(e,{x:99,y:103});
 expect(e.unit!.release).toBeNull();expect(c.spatial.unitWalkable(e,e)).toBe(true);
 expect(c.spatial.bodyRange(e,house)).toBeGreaterThanOrEqual(0);
 expect(e.x+2.5).toBeLessThanOrEqual(99.5);
});

it('moves two full-size infantry groups through a 6 C choke without overlap or stranded orders',()=>{
 const placements=Array.from({length:24},(_,i)=>placed('army.'+i,'unit.ants.warrior',i<12?64+i%3*4:192+i%3*4,80+Math.floor(i%12/3)*4));
 const g=game(placements),army=g.entities.filter(e=>e.placement?.startsWith('army.'));
 for(let y=0;y<256;y++)if(y<76||y>=100)g.spatial.terrain[y*256+132]=0;
 g.spatial.rebuild();
 for(const side of [0,1])expect(g.command('player.1',{type:'move',actors:army.slice(side*12,(side+1)*12).map(e=>e.id),destination:{x:side?68:196,y:86}}).accepted).toBe(true);
 let ticks=0;
 for(;ticks<2400;ticks++){
  g.tick();
  for(let i=0;i<army.length;i++)for(let j=0;j<i;j++){
   const a=precise(army[i]),b=precise(army[j]);
   expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeGreaterThanOrEqual(3-.001);
  }
  if(army.every(e=>!e.unit!.order))break;
 }
 expect(ticks).toBeLessThan(2400);
 expect(army.slice(0,12).every(e=>e.x>132)).toBe(true);
 expect(army.slice(12).every(e=>e.x<132)).toBe(true);
});

it.each([23,23.01])('uses body-edge archer reach consistently for hold and launch at center distance %s',distance=>{
 const g=game([placed('archer','unit.ants.archer',100,100),{...placed('target','unit.ants.warrior',123,100),owner:'player.2' as const}]);
 const a=g.entities.find(e=>e.placement==='archer')!,b=g.entities.find(e=>e.placement==='target')!;
 b.unit!.position=fixed({x:100+distance,y:100});
 g.command(a.owner,{type:'hold',actors:[a.id]});g.command(b.owner,{type:'hold',actors:[b.id]});
 const hp=b.hp!;run(g,110);
 if(distance===23)expect(b.hp).toBeLessThan(hp);else expect(b.hp).toBe(hp);
 expect(precise(a)).toMatchObject({x:100,y:100});
});
