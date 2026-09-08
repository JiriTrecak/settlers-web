import { territoryPostPositions } from '../../src/render/settlement/territoryPosts';
import { describe,it,expect } from 'vitest';
import { Settlement } from '../../src/sim/settlement/settlement';
import { Visibility } from '../../src/sim/visibility/visibility';
const make=()=>new Settlement({v:1,waterLevel:-1,name:'Sight',playerStarts:[{player:1,x:218,z:218},{player:2,x:38,z:38}],stamps:[{id:'remote-tree',asset:'pine-chunky',x:37.5,y:49.5}]},[{player:0,kind:'human'},{player:1,kind:'human'}]);
const refresh=(s:Settlement)=>s.visibility.update(s.buildings,s.workers,s.resources,s.territory);
describe('per-player fog of war',()=>{
  it('separates darkness, current sight and explored fog without exposing enemy settlers or colony inventories',()=>{
    const s=make(),scout=s.workers.find(w=>w.owner===0)!;
    const initial=s.view(0);
    expect(initial.fog!.cells[218*256+218]).toBe(2);
    expect(initial.fog!.cells[38*256+38]).toBe(0);
    expect(initial.buildings.every(b=>b.owner===0)).toBe(true);
    expect(initial.workers.every(w=>w.owner===0)).toBe(true);
    expect(initial.colonies.map(c=>c.owner)).toEqual([0]);
    scout.x=38;scout.z=48;refresh(s);
    const seen=s.view(0);
    expect(seen.buildings.some(b=>b.owner===1&&!b.remembered)).toBe(true);
    expect(seen.workers.some(w=>w.owner===1)).toBe(true);
    scout.x=218;scout.z=225;refresh(s);
    const fog=s.view(0);
    expect(fog.fog!.cells[48*256+38]).toBe(1);
    expect(fog.workers.every(w=>w.owner===0)).toBe(true);
    expect(fog.buildings.find(b=>b.owner===1)!.remembered).toBe(true);
    expect(initial.fog!.cells[48*256+38]).toBe(0); // Previous snapshots remain stable.
    expect(seen.fog!.cells[48*256+38]).toBe(2);
  });
  it('freezes observed buildings/resources and only learns destruction or new construction when sight returns',()=>{
    const s=make(),scout=s.workers.find(w=>w.owner===0)!,enemy=s.buildings.find(b=>b.owner===1)!;
    scout.x=38;scout.z=48;refresh(s);
    const known=s.view(0).buildings.find(b=>b.owner===1)!;
    scout.x=218;scout.z=225;refresh(s);
    enemy.health=0;s.resources[0]!.amount=0;
    const hidden={...enemy,id:999,health:250,kind:'house' as const,x:40,z:48};s.buildings.push(hidden);
    refresh(s);
    expect(s.view(0).buildings.find(b=>b.id===enemy.id)!.health).toBe(known.health);
    expect(s.view(0).buildings.some(b=>b.id===999)).toBe(false);
    expect(s.view(0).resources[0]!.amount).toBe(24);
    scout.x=38;scout.z=48;refresh(s);
    expect(s.view(0).buildings.some(b=>b.id===enemy.id)).toBe(false);
    expect(s.view(0).buildings.some(b=>b.id===999)).toBe(true);
    expect(s.view(0).resources[0]!.amount).toBe(0);
  });
  it('round-trips explored state and last-seen memories and includes them in deterministic checksums',()=>{
    const a=make(),b=make();
    expect(a.checksum()).toBe(b.checksum());
    a.workers[0]!.x=38;a.workers[0]!.z=48;refresh(a);
    a.workers[0]!.x=b.workers[0]!.x;a.workers[0]!.z=b.workers[0]!.z;refresh(a);
    expect(a.checksum()).not.toBe(b.checksum());
    const saved=JSON.parse(JSON.stringify(a.visibility.snapshot()));
    b.visibility.restore(saved);
    expect(a.checksum()).toBe(b.checksum());
    expect(b.view(0).buildings).toEqual(a.view(0).buildings);
    refresh(a);refresh(b);expect(a.checksum()).toBe(b.checksum());
    const blank=new Visibility([0,1]);
    expect(()=>blank.restore({...saved,players:[]})).toThrow();
  });
});

describe('observed territory borders',()=>{
  it('does not turn a scout vision circle inside enemy territory into a border',()=>{
    const state=make().view(), scout={...state.workers[0]!,owner:0,x:128,z:128};
    const territory=new Int16Array(65536).fill(1), visibility=new Visibility([0]);
    visibility.update([], [scout], [], territory);
    const view=visibility.project({...state,territory},0);
    expect(view.territory[128*256+128]).toBe(1);
    expect(view.territory[100*256+128]).toBe(-1);
    expect(territoryPostPositions(view.territory,256,view.territoryBorders)).toEqual([]);
  });
  it('clips a real border without closing it and remembers it until it is seen again',()=>{
    const state=make().view(), scout={...state.workers[0]!,owner:0,x:128,z:128};
    const territory=new Int16Array(65536).fill(-1), visibility=new Visibility([0]);
    for(let z=0;z<256;z++)territory.fill(1,z*256,z*256+128);
    const observe=()=>visibility.update([], [scout], [], territory);
    const posts=()=>{const v=visibility.project({...state,territory},0);return territoryPostPositions(v.territory,256,v.territoryBorders);};
    observe();
    const seen=posts();
    expect(seen.length).toBeGreaterThan(2);
    expect(seen.every(p=>p.x===127.25 && p.owner===1)).toBe(true);
    scout.x=180;observe();
    territory.fill(1);observe();
    expect(posts()).toEqual(seen); // Hidden expansion must not update remembered borders.
    const restored=new Visibility([0]);restored.restore(JSON.parse(JSON.stringify(visibility.snapshot())));
    expect(restored.checksum()).toBe(visibility.checksum());
    const v=restored.project({...state,territory},0);
    expect(territoryPostPositions(v.territory,256,v.territoryBorders)).toEqual(seen);
    scout.x=128;observe();
    expect(posts()).toEqual([]);
  });
  it('still renders full territory borders without a fog projection',()=>{
    const territory=new Int16Array(16*16).fill(-1);
    for(let z=4;z<12;z++)territory.fill(1,z*16+4,z*16+12);
    expect(territoryPostPositions(territory,16).length).toBeGreaterThan(4);
  });
});
