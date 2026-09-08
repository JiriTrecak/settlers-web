import { describe, it, expect } from 'vitest';
import { Settlement } from '../../src/sim/settlement/settlement';
import { economyStatus } from '../../src/ui/settlement/economyStatus';
import type { UtcMap } from '../../src/shared';
const map: UtcMap={v:1,waterLevel:-1,name:'Logistics',playerStarts:[{player:1,x:218,z:218}],stamps:[{id:'tree',asset:'pine-chunky',x:198.5,y:217.5},{id:'rock',asset:'rock-rounded-cool',x:237.5,y:228.5}]};
const create=()=>new Settlement(map,[{player:0,kind:'human'}]);
describe('unassigned settlers carry goods',()=>{
  it('uses all free settlers, recruits specialists only between deliveries, and puts new residents to work',()=>{
    const s=create();
    expect(s.workers.filter(w=>w.role==='carrier')).toHaveLength(6);
    expect(s.command(0,{type:'build',kind:'house',x:204,z:218})).toBe(true);
    expect(s.command(0,{type:'build',kind:'lumberjack',x:218,z:233})).toBe(true);
    let rejectedInterruption=false;
    for(let t=1;t<=3000;t++){
      const active=s.workers.filter(w=>w.shipment).map(w=>w.id);
      const carrying=s.workers.find(w=>w.shipment && w.quantity>0);
      if(carrying && !rejectedInterruption){
        expect(s.command(0,{type:'move-worker',id:carrying.id,x:225,z:240})).toBe(true);
        expect(carrying.pendingMove).toBe(240*256+225);
        rejectedInterruption=true;
      }
      s.tick(t);
      for(const id of active) expect(s.workers.find(w=>w.id===id)!.role).toBe('carrier');
    }
    expect(rejectedInterruption).toBe(true);
    expect(s.workers.filter(w=>w.role==='builder')).toHaveLength(2);
    expect(s.workers.filter(w=>w.role==='lumberjack')).toHaveLength(1);
    expect(s.workers.filter(w=>w.role==='carrier')).toHaveLength(8);
    expect(s.workers.some(w=>w.id>10 && w.role==='carrier')).toBe(true);
  });
  it('requires physical delivery before builders can construct and cancels reserved/in-flight goods exactly once',()=>{
    const s=create();
    s.command(0,{type:'build',kind:'house',x:204,z:218});
    const b=s.buildings.at(-1)!;
    const carriers=s.workers.filter(w=>w.role==='carrier');
    for(const w of carriers) w.timer=10000;
    for(let t=1;t<=500;t++)s.tick(t);
    expect(b.progress).toBe(0);
    expect(b.delivered).toEqual({wood:0,stone:0});
    expect(economyStatus(b,s.view())).toContain('Waiting for construction deliveries');
    carriers.forEach(w=>w.timer=0);
    let inFlight=false;
    for(let t=501;t<1000;t++){
      s.tick(t);
      expect(s.workers.filter(w=>w.role==='builder').every(w=>w.quantity===0)).toBe(true);
      if(carriers.some(w=>w.quantity>0)){inFlight=true;break;}
    }
    expect(inFlight).toBe(true);
    expect(s.command(0,{type:'cancel-building',id:b.id})).toBe(true);
    expect(s.colonies[0]!.stock).toEqual({wood:40,stone:30});
    expect(carriers.every(w=>w.shipment===null && w.quantity===0)).toBe(true);
    for(let t=1000;t<2000;t++)s.tick(t);
    expect(s.colonies[0]!.stock).toEqual({wood:40,stone:30});
  });
  it('conserves every log/plank/stone through competing deliveries and keeps specialists on their jobs',()=>{
    const s=create();
    for(const [kind,x,z] of [['lumberjack',204,218],['sawmill',218,233],['stonemason',231,218]] as const)
      expect(s.command(0,{type:'build',kind,x,z})).toBe(true);
    let logCargo=false, plankCargo=false, stoneCargo=false;
    for(let t=1;t<=12000;t++){
      s.tick(t);
      const cargo=s.workers.reduce((n,w)=>n+(w.carry==='wood'?w.quantity:0),0);
      const nodes=s.resources.filter(n=>n.kind==='wood').reduce((n,r)=>n+r.amount,0);
      const stored=s.buildings.reduce((n,b)=>n+b.inventory.log+b.inventory.plank+b.escrow.wood+b.delivered.wood,0);
      expect(s.colonies[0]!.stock.wood+cargo+nodes+stored).toBe(64);
      const stones=s.colonies[0]!.stock.stone+s.resources.filter(n=>n.kind==='stone').reduce((n,r)=>n+r.amount,0)+s.buildings.reduce((n,b)=>n+b.inventory.stone+b.escrow.stone+b.delivered.stone,0)+s.workers.reduce((n,w)=>n+(w.carry==='stone'?w.quantity:0),0);
      expect(stones).toBe(78);
      for(const b of s.buildings){
        const incoming=s.workers.filter(w=>w.shipment?.target===b.id && !w.shipment.construction).reduce((n,w)=>n+w.shipment!.amount,0);
        if(b.kind!=='fort')expect(b.inventory.log+b.inventory.plank+b.inventory.stone+incoming).toBeLessThanOrEqual(16);
      }
      for(const w of s.workers){
        if(w.role==='builder' || w.role==='sawyer')expect(w.quantity).toBe(0);
        if(w.role==='carrier' && w.quantity){logCargo ||=w.shipment?.item==='log';plankCargo ||=w.shipment?.item==='plank' && !w.shipment.construction;stoneCargo ||=w.shipment?.item==='stone' && !w.shipment.construction;}
      }
    }
    expect(logCargo && plankCargo && stoneCargo).toBe(true);
    expect(s.colonies[0]!.stock.wood).toBeGreaterThan(20);
    expect(s.colonies[0]!.stock.stone).toBeGreaterThan(22);
  });
});
