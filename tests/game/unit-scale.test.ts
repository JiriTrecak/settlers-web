import '../fixtures/walkableCatalogue';
import {expect, it} from 'vitest';
import {ContentRegistry} from '../../src/content/registry';
import type {Rules} from '../../src/content/schema';
import {unitDimensions} from '../../src/content/unitScale';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {GameContext} from '../../src/sim/game/context';
import {emptyState} from '../../src/sim/game/state';
import {fixed, precise} from '../../src/sim/game/motion';
import {formationDestinations} from '../../src/sim/game/formation';
import {game, placed, source} from './helpers';

function registry(scale: number) {
  const raw = source(); (raw.rules as Rules).unitScale = scale;
  return new ContentRegistry(raw);
}
function context(scale: number, bridge = false) {
  return new GameContext(emptyState(), registry(scale), {
    ...emptyUtcMap(), stamps: bridge ? [{id:'arch', asset:'leafbound-twig-bridge', x:40, y:40}] : [],
  });
}

it('resolves the single scale once for every unit and fingerprints it, leaving authored content intact', () => {
  const small = registry(1), large = registry(1.7);
  expect(large.fingerprint).not.toBe(small.fingerprint);
  for (const original of small.definitions) {
    const scaled = large.get(original.id);
    if (original.kind !== 'unit') { expect(scaled).toEqual(original); continue; }
    const a=original.behaviors, b=scaled.behaviors;
    if (a.movement) {
      expect(b.movement!.speed).toBeCloseTo(a.movement.speed*1.7);
      if (a.movement.walkSpeed) expect(b.movement!.walkSpeed).toBeCloseTo(a.movement.walkSpeed*1.7);
      expect(b.movement!.turnRate).toBe(a.movement.turnRate);
    }
    if (a.combat) {
      const melee = !a.combat.projectile && !a.combat.shell;
      expect(b.combat!.range).toBeCloseTo(a.combat.range*(melee?1.7:1));
      expect(b.combat!.damage).toBe(a.combat.damage);
      expect(b.combat!.cooldownTicks).toBe(a.combat.cooldownTicks);
    }
  }
  expect(registry(1).fingerprint).toBe(small.fingerprint); // no mutation/double scaling
  for (const invalid of [0, -1, 5, NaN]) expect(()=>registry(invalid)).toThrow(/unitScale/);
});

it('moves 70% farther in the same simulation time with unchanged animation cadence', () => {
  const travel=(scale:number)=>{
    const c=context(scale), e=c.create({...placed('runner','unit.ants.warrior',100,100),rotation:90});
    c.spatial.rebuild(); expect(c.spatial.route(e,{x:130,y:100},false)).toBe(true);
    for(let tick=0;tick<40;tick++){c.state.tick++;c.move();}
    return precise(e).x-100;
  };
  expect(travel(1.7)/travel(1)).toBeCloseTo(1.7,2);
});

it('uses larger bodies for terrain, actual unit collisions, indexed broad phase and free spawn positions', () => {
  for(const scale of [1,1.7]){
    const c=context(scale), mover=c.create(placed('mover','unit.ants.warrior',100,100));
    const other=c.create(placed('other','unit.ants.warrior',101,100));
    other.unit!.position=fixed({x:100.6,y:100});
    c.spatial.rebuild();
    expect(c.spatial.unitRadius).toBe(Math.round(.2*scale*1000));
    for(const indexed of [false,true]){
      if(indexed)c.spatial.beginUnitMovement();
      expect(c.spatial.unitSegmentClear(fixed(mover),fixed(mover),mover.id)).toBe(scale===1);
      expect(c.spatial.free({x:100,y:100},mover.id)).toBe(scale===1);
      c.spatial.endUnitMovement();
    }
    c.spatial.terrain[20*256+20]=0;
    expect(c.spatial.clearSegment(fixed({x:20.75,y:19}),fixed({x:20.75,y:21}))).toBe(scale===1);
    expect(c.spatial.clearSegment(fixed({x:21,y:19}),fixed({x:21,y:21}))).toBe(true);
  }
});

it('plans around an undersized gate instead of returning a route the enlarged body cannot traverse', () => {
  for(const layered of [false,true]) for(const scale of [1,3]) {
    const c=context(scale,layered), s=c.spatial;
    // One short single-cell gate and a wider alternative farther south.
    for(let y=0;y<s.size;y++)if(y!==10&&(y<20||y>22))s.terrain[y*s.size+20]=0;
    s.navigation.invalidate();s.sectors.invalidate();s.sectors.prepare();
    const from=s.cell({x:10,y:10}), to=s.cell({x:30,y:10});
    const path=s.findPath(from,to)!;expect(path).not.toBeNull();
    expect(path.some(id=>s.point(id).x===20&&s.point(id).y===(scale===1?10:21))).toBe(true);
    let previous=from;
    for(const id of path){expect(s.clearSegment(fixed(s.point(previous)),fixed(s.point(id)))).toBe(true);previous=id;}
  }
});

it('replans wide-body clearance when an adjacent building appears and disappears',()=>{
  const c=context(3),s=c.spatial,from=s.cell({x:10,y:10}),to=s.cell({x:30,y:10});
  expect(s.findPath(from,to)).toContain(s.cell({x:20,y:10}));
  // A one-cell resource next to (not on) the route still clips a 1.2-wide body.
  const tree=c.create({...placed('obstacle','resource.forest.tree',20,11),owner:'none'});
  s.rebuild();const diverted=s.findPath(from,to)!;
  expect(diverted).not.toContain(s.cell({x:20,y:10}));
  c.remove(tree);s.rebuild();expect(s.findPath(from,to)).toContain(s.cell({x:20,y:10}));
});

it('requires scaled headroom under bridges and spreads formation slots for larger units', () => {
  expect(context(1,true).spatial.unitWalkable({x:40,y:40})).toBe(true);
  expect(context(1.7,true).spatial.unitWalkable({x:40,y:40})).toBe(false);
  const actors=Array.from({length:16},(_,i)=>({id:i,x:10+i%4,y:10+Math.floor(i/4)}));
  for(const scale of [1,1.7,3]){
    const spacing=unitDimensions(scale).formationSpacing;
    const slots=[...formationDestinations(actors,{x:50,y:50},100,()=>true,()=>true,spacing).values()];
    expect(slots).toHaveLength(actors.length);
    for(let i=0;i<slots.length;i++)for(let j=0;j<i;j++)expect(Math.hypot(slots[i].x-slots[j].x,slots[i].y-slots[j].y)).toBeGreaterThanOrEqual(spacing);
  }
});

it('preserves deterministic movement through a save and rejects saves from a different scale',()=>{
  const entities=[placed('walker','unit.ants.warrior',100,100)];
  const setup=(scale:number)=>game(entities,raw=>{(raw.rules as Rules).unitScale=scale;});
  const a=setup(1.7),b=setup(1.7),e=a.entities.find(e=>e.placement==='walker')!;
  expect(a.command(e.owner,{type:'move',actors:[e.id],destination:{x:130,y:110}}).accepted).toBe(true);
  for(let i=0;i<27;i++)a.tick();b.restore(a.snapshot());
  for(let i=0;i<80;i++){a.tick();b.tick();expect(b.checksum()).toBe(a.checksum());}
  expect(()=>setup(1).restore(a.snapshot())).toThrow();
});

it('moves two enlarged armies through a passage without overlaps or stranded units',()=>{
  const placements=Array.from({length:24},(_,i)=>placed('army.'+i,'unit.ants.warrior',i<12?100+i%3:130+i%3,98+Math.floor(i%12/3)*2));
  const g=game(placements,raw=>{(raw.rules as Rules).unitScale=1.7;}),army=g.entities.filter(e=>e.placement?.startsWith('army.'));
  for(let y=0;y<256;y++)if(y<100||y>102)g.spatial.terrain[y*256+116]=0;
  g.spatial.navigation.invalidate();g.spatial.sectors.invalidate();g.spatial.sectors.prepare();
  for(const side of [0,1])expect(g.command('player.1',{type:'move',actors:army.slice(side*12,(side+1)*12).map(e=>e.id),destination:{x:side?100:132,y:101}}).accepted).toBe(true);
  for(let tick=0;tick<2400;tick++){
    g.tick();
    for(let i=0;i<army.length;i++)for(let j=0;j<i;j++){
      const a=precise(army[i]),b=precise(army[j]);
      expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeGreaterThanOrEqual(.68-.001);
    }
    if(army.every(e=>!e.unit!.order))break;
  }
  expect(army.every(e=>!e.unit!.order&&!e.unit!.route.length)).toBe(true);
  expect(army.slice(0,12).every(e=>e.x>116)).toBe(true);
  expect(army.slice(12).every(e=>e.x<116)).toBe(true);
});
