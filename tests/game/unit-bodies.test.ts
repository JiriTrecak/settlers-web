import '../fixtures/walkableCatalogue';
import {expect, it} from 'vitest';
import {ContentRegistry} from '../../src/content/registry';
import type {AuthoredDefinition} from '../../src/content/schema';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {GameContext} from '../../src/sim/game/context';
import {emptyState} from '../../src/sim/game/state';
import {fixed, precise} from '../../src/sim/game/motion';
import {formationDestinations} from '../../src/sim/game/formation';
import {game, placed, source} from './helpers';

const profiles={
 small:{radius:.2,height:2,formationSpacing:1},
 standard:{radius:.34,height:3.4,formationSpacing:1.7},
 wide:{radius:.6,height:6,formationSpacing:3},
 tall:{radius:.5,height:5,formationSpacing:2.5},
};
type Profile=keyof typeof profiles;
function setBody(raw:ReturnType<typeof source>,profile:Profile) {
 for(const d of raw.definitions as AuthoredDefinition[])if(d.kind==='unit')d.dimensions={...profiles[profile]};
}
function registry(profile:Profile) {const raw=source();setBody(raw,profile);return new ContentRegistry(raw);}
function context(profile:Profile,bridge=false) {
 return new GameContext(emptyState(),registry(profile),{...emptyUtcMap(),stamps:bridge?[{id:'arch',asset:'leafbound-twig-bridge',x:40,y:40}]:[]});
}

it('requires explicit unit dimensions and does not derive gameplay from model or asset metadata',()=>{
 const raw=source(),before=JSON.stringify(raw),baseline=new ContentRegistry(raw);
 expect(JSON.stringify(raw)).toBe(before);
 const edited=source(),unit=(edited.definitions as AuthoredDefinition[]).find(d=>d.id==='unit.ants.warrior')!;
 unit.modelScale=4;
 const changed=new ContentRegistry(edited),a=baseline.get(unit.id),b=changed.get(unit.id);
 expect(b.dimensions).toEqual(a.dimensions);expect(b.behaviors).toEqual(a.behaviors);
 expect(changed.fingerprint).not.toBe(baseline.fingerprint);
 unit.dimensions={radius:1.5,height:4.8,formationSpacing:3.25};
 const larger=new ContentRegistry(edited).get(unit.id);
 expect(larger.behaviors).toEqual(a.behaviors);expect(larger.modelScale).toBe(4);
 delete unit.dimensions;expect(()=>new ContentRegistry(edited)).toThrow(/require explicit dimensions/);
});

it('moves at its authored speed regardless of body and presentation size',()=>{
 const travel=(profile:Profile,speed:number,modelScale:number)=>{
  const raw=source();setBody(raw,profile);
  const d=(raw.definitions as AuthoredDefinition[]).find(d=>d.id==='unit.ants.warrior')!;
  d.behaviors!.movement!.speed=speed;d.modelScale=modelScale;
  const c=new GameContext(emptyState(),new ContentRegistry(raw),emptyUtcMap()),e=c.create({...placed('runner',d.id,100,100),rotation:90});
  c.spatial.rebuild();expect(c.spatial.route(e,{x:140,y:100},false)).toBe(true);
  for(let tick=0;tick<40;tick++){c.state.tick++;c.move();}
  return precise(e).x-100;
 };
 expect(travel('small',4,1)).toBeCloseTo(4,2);
 expect(travel('wide',4,3)).toBeCloseTo(4,2);
 expect(travel('standard',12,1.7)).toBeCloseTo(12,2);
});

it('uses declared bodies for terrain, actual unit collisions, indexed broad phase and free spawn positions', () => {
  for(const profile of ['small','standard'] as const){
    const c=context(profile), mover=c.create(placed('mover','unit.ants.warrior',100,100));
    const other=c.create(placed('other','unit.ants.warrior',101,100));
    other.unit!.position=fixed({x:100.6,y:100});
    c.spatial.rebuild();
    expect(c.spatial.unitRadius).toBe(Math.round(profiles[profile].radius*1000));
    for(const indexed of [false,true]){
      if(indexed)c.spatial.beginUnitMovement();
      expect(c.spatial.unitSegmentClear(fixed(mover),fixed(mover),mover.id)).toBe(profile==='small');
      expect(c.spatial.free({x:100,y:100},mover.id)).toBe(profile==='small');
      c.spatial.endUnitMovement();
    }
    c.spatial.terrain[20*256+20]=0;
    expect(c.spatial.clearSegment(fixed({x:20.75,y:19}),fixed({x:20.75,y:21}))).toBe(profile==='small');
    expect(c.spatial.clearSegment(fixed({x:21,y:19}),fixed({x:21,y:21}))).toBe(true);
  }
});

it('plans around an undersized gate instead of returning a route the enlarged body cannot traverse', () => {
  for(const layered of [false,true]) for(const profile of ['small','wide'] as const) {
    const c=context(profile,layered), s=c.spatial;
    // One short single-cell gate and a wider alternative farther south.
    for(let y=0;y<s.size;y++)if(y!==10&&(y<20||y>22))s.terrain[y*s.size+20]=0;
    s.navigation.invalidate();s.sectors.invalidate();s.sectors.prepare();
    const from=s.cell({x:10,y:10}), to=s.cell({x:30,y:10});
    const path=s.findPath(from,to)!;expect(path).not.toBeNull();
    expect(path.some(id=>s.point(id).x===20&&s.point(id).y===(profile==='small'?10:21))).toBe(true);
    let previous=from;
    for(const id of path){expect(s.clearSegment(fixed(s.point(previous)),fixed(s.point(id)))).toBe(true);previous=id;}
  }
});

it('replans wide-body clearance when an adjacent building appears and disappears',()=>{
  const c=context('wide'),s=c.spatial,from=s.cell({x:10,y:10}),to=s.cell({x:30,y:10});
  expect(s.findPath(from,to)).toContain(s.cell({x:20,y:10}));
  // A one-cell resource next to (not on) the route still clips a 1.2-wide body.
  const tree=c.create({...placed('obstacle','resource.forest.tree',20,11),owner:'none'});
  s.rebuild();const diverted=s.findPath(from,to)!;
  expect(diverted).not.toContain(s.cell({x:20,y:10}));
  c.remove(tree);s.rebuild();expect(s.findPath(from,to)).toContain(s.cell({x:20,y:10}));
});

it('requires authored headroom under bridges and spreads formation slots for larger units', () => {
  expect(context('small',true).spatial.unitWalkable({x:40,y:40})).toBe(true);
  expect(context('standard',true).spatial.unitWalkable({x:40,y:40})).toBe(true);
  expect(context('tall',true).spatial.unitWalkable({x:40,y:40})).toBe(false);
  const actors=Array.from({length:16},(_,i)=>({id:i,x:10+i%4,y:10+Math.floor(i/4)}));
  for(const profile of ['small','standard','wide'] as const){
    const spacing=profiles[profile].formationSpacing;
    const slots=[...formationDestinations(actors,{x:50,y:50},100,()=>true,()=>true,spacing).values()];
    expect(slots).toHaveLength(actors.length);
    for(let i=0;i<slots.length;i++)for(let j=0;j<i;j++)expect(Math.hypot(slots[i].x-slots[j].x,slots[i].y-slots[j].y)).toBeGreaterThanOrEqual(spacing);
  }
});

it('preserves deterministic movement through a save and rejects saves from a different body definition',()=>{
  const entities=[placed('walker','unit.ants.warrior',100,100)];
  const setup=(profile:Profile)=>game(entities,raw=>setBody(raw,profile));
  const a=setup('standard'),b=setup('standard'),e=a.entities.find(e=>e.placement==='walker')!;
  expect(a.command(e.owner,{type:'move',actors:[e.id],destination:{x:130,y:110}}).accepted).toBe(true);
  for(let i=0;i<27;i++)a.tick();b.restore(a.snapshot());
  for(let i=0;i<80;i++){a.tick();b.tick();expect(b.checksum()).toBe(a.checksum());}
  expect(()=>setup('small').restore(a.snapshot())).toThrow();
});

it('moves two enlarged armies through a passage without overlaps or stranded units',()=>{
  const placements=Array.from({length:24},(_,i)=>placed('army.'+i,'unit.ants.warrior',i<12?100+i%3:130+i%3,98+Math.floor(i%12/3)*2));
  const g=game(placements,raw=>setBody(raw,'standard')),army=g.entities.filter(e=>e.placement?.startsWith('army.'));
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

it('uses individual dimensions for mixed-size collisions, gates and bridge headroom',()=>{
 const raw=source();
 const definitions=raw.definitions as any[];
 const small=definitions.find(d=>d.id==='unit.ants.warrior');
 const tall=definitions.find(d=>d.id==='unit.ants.archer');
 small.dimensions={radius:.2,height:1.5,formationSpacing:1};
 tall.dimensions={radius:.65,height:5,formationSpacing:1.4};
 const c=new GameContext(emptyState(),new ContentRegistry(raw),{...emptyUtcMap(),stamps:[{id:'arch',asset:'leafbound-twig-bridge',x:40,y:40}]});
 const a=c.create(placed('small',small.id,100,100)),b=c.create(placed('large',tall.id,101,100));c.spatial.rebuild();
 expect(c.spatial.unitWalkable({x:40,y:40},a)).toBe(true);
 expect(c.spatial.unitWalkable({x:40,y:40},b)).toBe(false);
 b.unit!.position=fixed({x:100.8,y:100});
 for(const indexed of [false,true]){if(indexed)c.spatial.beginUnitMovement();expect(c.spatial.unitSegmentClear(fixed(a),fixed(a),a.id)).toBe(false);expect(c.spatial.unitSegmentClear(fixed(precise(b)),fixed(precise(b)),b.id)).toBe(false);c.spatial.endUnitMovement();}
 const s=c.spatial;for(let y=0;y<s.size;y++)if(y!==10&&(y<20||y>22))s.terrain[y*s.size+20]=0;
 s.navigation.invalidate();s.sectors.invalidate();s.sectors.prepare();
 const from=s.cell({x:10,y:10}),to=s.cell({x:30,y:10});
 expect(s.findPath(from,to,undefined,Infinity,a)).toContain(s.cell({x:20,y:10}));
 const wide=s.findPath(from,to,undefined,Infinity,b)!;expect(wide).not.toContain(s.cell({x:20,y:10}));expect(wide).toContain(s.cell({x:20,y:21}));
});
