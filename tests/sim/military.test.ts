import { describe, it, expect } from 'vitest';
import { Settlement } from '../../src/sim/settlement/settlement';
import { SOLDIERS, isSoldier } from '../../src/shared/settlement/rules';
import { validAction } from '../../src/shared/types/types';
const create=()=>new Settlement({v:1,name:'Army',waterLevel:-1,stamps:[],playerStarts:[{player:1,x:60,z:60},{player:2,x:196,z:196}]},[{player:0,kind:'human'},{player:1,kind:'human'}]);
const runner=(s:Settlement)=>{let t=0;return (n:number)=>{for(let i=0;i<n;i++)s.tick(++t);};};
const barracks=(s:Settlement)=>{expect(s.command(0,{type:'build',kind:'barracks',x:74,z:60})).toBe(true);return s.buildings.at(-1)!;};
const refresh=(s:Settlement)=>s.visibility.update(s.buildings,s.workers,s.resources,s.territory);
describe('first army',()=>{
  it('starts both sides with two healthy warriors and eight economic settlers',()=>{
    const s=create();
    for(const owner of [0,1]){
      expect(s.workers.filter(w=>w.owner===owner && w.role==='warrior')).toHaveLength(2);
      expect(s.workers.filter(w=>w.owner===owner && !isSoldier(w.role))).toHaveLength(8);
      expect(s.workers.filter(w=>w.owner===owner).every(w=>w.health>0)).toBe(true);
    }
  });
  it('delivers real planks, then converts existing free settlers without touching builders',()=>{
    const s=create(),run=runner(s),b=barracks(s);run(1500);expect(b.complete).toBe(true);
    const ids=s.workers.map(w=>w.id),stock=s.colonies[0]!.stock.wood;
    expect(s.command(0,{type:'recruit',id:b.id,kind:'warrior'})).toBe(true);
    expect(s.command(0,{type:'recruit',id:b.id,kind:'archer'})).toBe(true);
    let delivered=false,arrived=false;
    for(let i=0;i<1800;i++){
      run(1);
      if(b.inventory.plank)delivered=true;
      if(b.training){arrived=true;expect(delivered).toBe(true);expect(s.workers.find(w=>w.id===b.recruit)?.job).toBe('training');}
    }
    expect(arrived).toBe(true);expect(s.workers.map(w=>w.id)).toEqual(ids);
    expect(s.workers.filter(w=>w.owner===0&&w.role==='warrior')).toHaveLength(3);
    expect(s.workers.filter(w=>w.owner===0&&w.role==='archer')).toHaveLength(1);
    expect(s.workers.filter(w=>w.owner===0&&w.role==='builder')).toHaveLength(2);
    expect(s.colonies[0]!.stock.wood).toBe(stock-2);expect(b.queue).toEqual([]);
  });
  it('does not reserve the workforce while waiting for materials, bounds queues and validates ownership',()=>{
    const s=create(),run=runner(s),b=barracks(s);run(1500);s.colonies[0]!.stock.wood=0;
    expect(s.command(1,{type:'recruit',id:b.id,kind:'warrior'})).toBe(false);
    for(let i=0;i<12;i++)expect(s.command(0,{type:'recruit',id:b.id,kind:'archer'})).toBe(true);
    expect(s.command(0,{type:'recruit',id:b.id,kind:'archer'})).toBe(false);
    run(400);expect(b.recruit).toBe(0);expect(b.training).toBe(0);
    expect(s.workers.filter(w=>w.role==='carrier'&&w.owner===0)).toHaveLength(6);
    expect(validAction({type:'cancel-recruit',id:b.id,index:-1})).toBe(false);
    expect(validAction({type:'attack',id:1,target:NaN})).toBe(false);
  });
  it('cancels active training without losing a settler or consuming its plank',()=>{
    const s=create(),run=runner(s),b=barracks(s);run(1500);const stock=s.colonies[0]!.stock.wood;
    s.command(0,{type:'recruit',id:b.id,kind:'archer'});
    for(let i=0;i<1000&&!b.training;i++)run(1);
    expect(b.training).toBeGreaterThan(0);const id=b.recruit;
    expect(s.command(0,{type:'cancel-recruit',id:b.id,index:0})).toBe(true);
    expect(b.recruit).toBe(0);expect(s.workers.find(w=>w.id===id)!.role).toBe('carrier');
    run(600);expect(s.colonies[0]!.stock.wood).toBe(stock);
  });
  it('releases a recruit when its barracks is destroyed',()=>{
    const s=create(),run=runner(s),b=barracks(s);run(1500);
    s.command(0,{type:'recruit',id:b.id,kind:'archer'});
    for(let i=0;i<1000&&!b.training;i++)run(1);
    const id=b.recruit;expect(id).toBeGreaterThan(0);
    s.damageBuilding(b.id,9999);run(1);
    expect(s.workers.find(w=>w.id===id)!.job).not.toBe('training');expect(b.queue).toEqual([]);
  });
  it('fights at melee/ranged distances, rejects unseen targets, and stops exposing dead units',()=>{
    const s=create(),run=runner(s),a=s.workers.find(w=>w.owner===0&&w.role==='warrior')!,b=s.workers.find(w=>w.owner===1&&w.role==='carrier')!;
    expect(s.command(0,{type:'attack',id:a.id,target:b.id})).toBe(false);
    a.role='archer';a.health=SOLDIERS.archer.health;a.x=120;a.z=120;b.x=126;b.z=120;b.timer=9999;refresh(s);
    expect(s.command(0,{type:'attack',id:a.id,target:b.id})).toBe(true);
    run(1);expect(b.health).toBe(60-SOLDIERS.archer.damage);expect(a.x).toBe(120);
    run(400);expect(s.workers.some(w=>w.id===b.id)).toBe(false);
  });
  it('grows construction HP, repairs for free, gives forts no attack and ends the match on fort death',()=>{
    const s=create(),run=runner(s),b=barracks(s);
    expect(b.health).toBe(45);run(1500);expect(b.health).toBe(450);
    const stock={...s.colonies[0]!.stock};s.damageBuilding(b.id,100);run(1000);
    expect(b.health).toBe(450);expect(s.colonies[0]!.stock).toEqual(stock);
    const fort=s.buildings.find(b=>b.owner===1&&b.kind==='fort')!;
    const scout=s.workers.find(w=>w.owner===0&&w.role==='carrier')!;
    scout.x=fort.x;scout.z=fort.z-6;scout.timer=9999;
    s.workers.filter(w=>w.owner===1&&isSoldier(w.role)).forEach(w=>{w.x=230;w.z=230;});
    run(160);expect(scout.health).toBe(60);
    s.damageBuilding(fort.id,9999);expect(s.outcome?.winner).toBe(0);
  });
  it('keeps independent recruitment and battle simulations identical',()=>{
    const a=create(),b=create();const ra=runner(a),rb=runner(b);
    for(const s of [a,b])barracks(s);
    ra(1500);rb(1500);
    for(const s of [a,b]){
      s.command(0,{type:'recruit',id:s.buildings.at(-1)!.id,kind:'archer'});
      const w=s.workers.find(w=>w.owner===0&&w.role==='warrior')!,enemy=s.workers.find(w=>w.owner===1&&w.role==='warrior')!;
      w.x=120;w.z=120;enemy.x=125;enemy.z=120;refresh(s);
      s.command(0,{type:'attack',id:w.id,target:enemy.id});
    }
    for(let i=0;i<30;i++){ra(40);rb(40);expect(a.checksum()).toBe(b.checksum());}
  });
});
