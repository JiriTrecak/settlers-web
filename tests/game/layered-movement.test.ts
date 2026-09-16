import {Revival} from '../../src/sim/game/revival';
import {Inventory} from '../../src/sim/game/inventory';
import {it,expect,vi} from 'vitest';
vi.mock('../../src/shared/assets/manifest',async original=>{
 const actual=await original<typeof import('../../src/shared/assets/manifest')>();
 return {...actual,sceneryCatalogue:{...actual.sceneryCatalogue,assets:actual.sceneryCatalogue.assets.map(a=>a.id==='timber-bridge'?{...a,deck:{width:6,depth:24,height:0,arch:4,thickness:.8,level:1,connections:{start:0,end:0}}}:a)}};
});
import {GameContext} from '../../src/sim/game/context';
import {emptyState} from '../../src/sim/game/state';
import {fixed,precise} from '../../src/sim/game/motion';
import {ContentRegistry} from '../../src/content/registry';
import {builtinSource} from '../../src/content/builtin';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {placed,slots,run} from './helpers';
import {Game} from '../../src/sim/game/game';
import {heading} from '../../src/sim/game/facing';
import {World} from '../../src/sim/world/world';
import {PresentationView} from '../../src/session/session/presentationView';
import {emptyMissionState} from '../../src/shared/scenario/schema';
const map=()=>({...emptyUtcMap(),playerStarts:emptyUtcMap().playerStarts.map((s,i)=>({...s,x:200,z:i?80:200})),stamps:[{id:'arch',asset:'timber-bridge',x:40,y:40}]});
const setup=()=>new GameContext(emptyState(),new ContentRegistry(builtinSource),map());
function move(c:GameContext,n=1600){for(let i=0;i<n;i++){c.state.tick++;c.move();}}
it('moves under an occupied deck without collision or height snapping',()=>{
 const c=setup(),lower=c.create(placed('lower','unit.ants.warrior',30,40)),upper=c.create({...placed('upper','unit.ants.warrior',40,40),position:{x:40,y:40,surface:'arch'}});
 c.spatial.rebuild();expect(c.spatial.route(lower,{x:50,y:40},false)).toBe(true);
 expect(c.spatial.unitSegmentClear(fixed({x:39,y:40}),fixed({x:41,y:40}),lower.id)).toBe(true);
 move(c);expect(precise(lower)).toEqual({x:50,y:40});expect(upper.surface).toBe('arch');
});
it('walks through an entrance onto the arch, can be interrupted there, and walks down again',()=>{
 const c=setup(),e=c.create(placed('walker','unit.ants.warrior',40,26));c.spatial.rebuild();
 expect(c.spatial.route(e,{x:40,y:40,surface:'arch'},false)).toBe(true);
 move(c);expect(precise(e)).toEqual({x:40,y:40,surface:'arch'});
 expect(c.spatial.height(precise(e))).toBeGreaterThan(3);
 expect(c.spatial.route(e,{x:41,y:41,surface:'arch'},false)).toBe(true);
 move(c,20);
 expect(c.spatial.route(e,{x:40,y:55},false)).toBe(true);
 move(c);expect(precise(e)).toEqual({x:40,y:55});
});
it('reaches the top from directly underneath by walking around to an end',()=>{
 const c=setup(),e=c.create(placed('walker','unit.ants.warrior',40,40));c.spatial.rebuild();
 expect(c.spatial.route(e,{x:40,y:40,surface:'arch'},false)).toBe(true);
 expect(e.unit!.route.length).toBeGreaterThan(2);
 move(c,2400);expect(precise(e)).toEqual({x:40,y:40,surface:'arch'});
});

it('keeps queued surface destinations and a mid-climb save deterministic',()=>{
 const m={...map(),entities:[placed('walker','unit.ants.warrior',40,26)]},g=new Game(m,slots),e=g.entities.find(e=>e.placement==='walker')!;
 expect(g.command('player.1',{type:'move',actors:[e.id],destination:{x:40,y:40,surface:'arch'}}).accepted).toBe(true);
 expect(g.command('player.1',{type:'move',actors:[e.id],destination:{x:50,y:40},append:true}).accepted).toBe(true);
 run(g,110);expect(e.surface).toBe('arch');
 const saved=g.snapshot(),copy=new Game(m,slots);copy.restore(saved);expect(copy.snapshot()).toEqual(saved);
 run(g,600);run(copy,600);expect(copy.snapshot()).toEqual(g.snapshot());
 expect(precise(g.entities.find(u=>u.id===e.id)!)).toEqual({x:50,y:40});
 const invalid=structuredClone(saved);invalid.state.entities.find(u=>u.id===e.id)!.surface='missing';
 expect(()=>copy.restore(invalid)).toThrow(/surface/);
});
it('allows archers to see and shoot down, without revealing the upper deck to units below',()=>{
 const m={...map(),entities:[{...placed('archer','unit.ants.archer',43,40),position:{x:43,y:40,surface:'arch'}},{...placed('enemy','unit.ants.warrior',49,40),owner:'player.2' as const}]};
 const g=new Game(m,slots),a=g.entities.find(e=>e.placement==='archer')!,b=g.entities.find(e=>e.placement==='enemy')!,hp=b.hp!;
 a.rotation=heading(a,b);
 expect(g.observation.visible('player.1',b)).toBe(true);expect(g.observation.visible('player.2',a)).toBe(false);
 expect(g.view('player.2').entities.some(e=>e.id===a.id)).toBe(false);
 expect(g.command('player.1',{type:'attack',actors:[a.id],target:b.id}).accepted).toBe(true);
 g.combat.resolve();g.state.tick=a.unit!.attack!.impact;g.combat.resolve();
 const missile=g.state.missiles[0];expect(missile.origin.surface).toBe('arch');expect(missile.destination.surface).toBeUndefined();
 const snapshot=g.snapshot();g.restore(snapshot);expect(g.snapshot()).toEqual(snapshot);
 g.state.tick=missile.impact;g.combat.resolve();expect(g.context.get(b.id)!.hp).toBeLessThan(hp);
});

it('keeps neutral camp sight on the correct floor, then acquires troops at its own height',()=>{
 const m={...map(),entities:[{...placed('upper','unit.ants.warrior',43,40),position:{x:43,y:40,surface:'arch'}},{...placed('sentry','unit.neutral.thornspitter',49,40),owner:'none' as const}],camps:[{id:'sentries',members:['sentry'],home:{x:49,y:40},aggroRange:10,leash:15,aggression:'players' as const}]};
 const g=new Game(m,slots),upper=g.entities.find(e=>e.placement==='upper')!,sentry=g.entities.find(e=>e.placement==='sentry')!;
 expect(g.command('player.1',{type:'hold',actors:[upper.id]}).accepted).toBe(true);
 run(g,32);expect(sentry.unit!.target).toBeNull();expect(sentry.unit!.route).toHaveLength(0);
 // The same horizontal distance becomes visible after walking down to ground.
 delete upper.surface;upper.unit!.position=fixed(upper);g.observation.update();
 run(g,16);expect(sentry.unit!.target).toBe(upper.id);
});

it('sweeps body width beside an obstacle even on a map with elevated surfaces',()=>{
 const c=setup();c.spatial.terrain[20*256+20]=0;
 // The center line lies in the open adjacent cell, but the body clips the wall.
 expect(c.spatial.clearSegment(fixed({x:20.6,y:19}),fixed({x:20.6,y:21}))).toBe(false);
 expect(c.spatial.clearSegment(fixed({x:21,y:19}),fixed({x:21,y:21}))).toBe(true);
});

it('keeps lower-floor memories when only the bridge above is visible',()=>{
 const m={...map(),entities:[placed('scout','unit.ants.archer',35,40),{...placed('tree','resource.forest.tree',40,40),owner:'none' as const}]};
 const g=new Game(m,slots),a=g.entities.find(e=>e.placement==='scout')!,tree=g.entities.find(e=>e.placement==='tree')!;
 g.observation.update();expect(g.view('player.1').entities.some(e=>e.id===tree.id)).toBe(true);
 a.x=40;a.y=40;a.surface='arch';a.unit!.position=fixed(a);g.observation.update();
 g.context.remove(tree);g.observation.update();
 const remembered=g.view('player.1').entities.find(e=>e.id===tree.id);
 expect(remembered?.remembered).toBe(true);
 a.x=35;delete a.surface;a.unit!.position=fixed(a);g.observation.update();
 expect(g.view('player.1').entities.some(e=>e.id===tree.id)).toBe(false);
});

it('saves explored fog per floor while projecting a union for the minimap',()=>{
 const m={...map(),entities:[placed('scout','unit.ants.archer',35,40)]},g=new Game(m,slots),scout=g.entities.find(e=>e.placement==='scout')!;
 g.observation.update();const below=g.view('player.1').fog!,cell=40*256+40,deck=g.spatial.cell({x:40,y:40,surface:'arch'});
 expect(below.cells[cell]).toBe(2);expect(below.floors!.cells[cell]).toBe(2);expect(below.floors!.cells[deck]).toBe(0);
 scout.x=40;scout.y=40;scout.surface='arch';scout.unit!.position=fixed(scout);g.observation.update();
 const above=g.view('player.1').fog!;
 expect(above.cells[cell]).toBe(2);expect(above.floors!.cells[cell]).toBe(1);expect(above.floors!.cells[deck]).toBe(2);
 expect(below.floors!.cells[deck]).toBe(0); // Existing presentations stay immutable.
 const copy=new Game(m,slots);copy.restore(g.snapshot());expect(copy.checksum()).toBe(g.checksum());expect(copy.view('player.1').fog!.floors!.cells).toEqual(above.floors!.cells);
 const invalid=structuredClone(g.snapshot());invalid.knowledge[0]!.cells.length=256*256;expect(()=>copy.restore(invalid)).toThrow(/dimensions/);
});

it('reveals cinematic staging on its stacked floors without unveiling remote decks or exploring the map',()=>{
 const m=map();m.stamps.push({id:'remote-arch',asset:'timber-bridge',x:100,y:100});
 const world=new World({map:m,slots,seed:1}),g=world.settlement;
 g.state.mission={...emptyMissionState(),scene:{x:40,y:40}};
 const before=world.checksum(),normal=world.view(0).settlement.fog!,projection=new PresentationView();
 const local=g.spatial.cell({x:40,y:40,surface:'arch'}),remote=g.spatial.cell({x:100,y:100,surface:'remote-arch'});
 const staged=projection.project(world,0,false).settlement.fog!;
 expect(normal.floors!.cells[local]).toBe(0);expect(staged.floors!.cells[local]).toBe(2);
 expect(staged.floors!.cells[40*256+40]).toBe(2);expect(staged.floors!.cells[remote]).toBe(0);
 expect(world.checksum()).toBe(before);g.state.mission.scene=null;g.observation.update();
 expect(projection.project(world,0,false).settlement.fog!.floors!.cells[local]).toBe(0);
});


it('keeps loot on its deck and cannot pick it up through the floor',()=>{
 const c=setup(),hero=c.create({...placed('hero','unit.ants.marshal',40,40),position:{x:40,y:40,surface:'arch'}}),
  lower=c.create({...placed('lower-item','item.barkguard',40,40),owner:'none'}),inventory=new Inventory(c);
 c.spatial.rebuild();c.state.tick=10;hero.unit!.order={type:'pickup',target:lower.id};
 inventory.advance();expect(c.get(lower.id)).toBe(lower);expect(hero.equipment!.every(i=>i===null)).toBe(true);
 hero.equipment![0]='item.thornband';expect(inventory.drop(hero,0)).toBeNull();
 const dropped=c.state.entities.find(e=>e.definition==='item.thornband')!;
 expect(dropped.surface).toBe('arch');expect(c.spatial.height(dropped)).toBeGreaterThan(3);
 hero.unit!.order={type:'pickup',target:dropped.id};inventory.advance();
 expect(hero.equipment).toContain('item.thornband');expect(c.get(dropped.id)).toBeUndefined();
});


it('revives a hero killed on a bridge onto the sanctuary landing',()=>{
 const c=setup(),hero=c.create({...placed('hero','unit.ants.marshal',40,40),position:{x:40,y:40,surface:'arch'}}),
 shrine=c.create(placed('shrine','building.ants.sanctuary',65,65)),revival=new Revival(c);
 c.remove(hero);revival.retain(hero);c.state.tick=10;c.spatial.rebuild();
 expect(revival.enqueue(shrine,hero.id)).toBeNull();
 shrine.revival!.queue[0].progress=c.def(shrine).behaviors.revival!.workTicks;
 revival.tick();expect(hero.fallen).toBeUndefined();expect(hero.surface).toBeUndefined();
 expect(c.spatial.validPoint(hero)).toBe(true);expect(c.spatial.height(hero)).toBe(0);
});
