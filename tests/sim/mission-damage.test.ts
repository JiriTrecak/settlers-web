import {expect,it} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {placementOccupancyError} from '../../src/content/map';
import {placed} from '../game/helpers';
import {testContent} from '../fixtures/content';
function fixture(script:string){return {...emptyUtcMap(),entities:[placed('hero','unit.test.marshal',55,60),{...placed('cottage','building.test.briar-cottage',65,60),owner:'none' as const}],mission:{campaign:'test',title:'Destruction',order:1,regions:[],script}};}
it('queues scripted damage through ordinary destruction and saves the queued impact deterministically',()=>{
 const m=fixture(`function on_start() mission.damage('cottage',10000) end`),a=new Game(m,[{player:0,kind:'human'}],testContent);a.tick();
 expect(a.entities.some(e=>e.placement==='cottage')).toBe(true);expect(a.state.mission?.pendingDamage).toHaveLength(1);
 const b=new Game(m,a.slots,testContent);b.restore(a.snapshot());a.tick();b.tick();
 expect(b.checksum()).toBe(a.checksum());expect(a.entities.some(e=>e.placement==='cottage')).toBe(false);expect(a.state.mission?.pendingDamage).toEqual([]);
});
it('does not apply damage from an invalid callback',()=>{
 const g=new Game(fixture(`function on_start() mission.damage('cottage',10000);mission.damage('missing',10) end`),[{player:0,kind:'human'}],testContent);
 for(let i=0;i<5;i++)g.tick();expect(g.state.mission?.error).toContain('Unknown entity ID');expect(g.entities.find(e=>e.placement==='cottage')?.hp).toBe(testContent.get('building.test.briar-cottage').body!.maxHp);
});
it('allows a deferred ruin at a demolished building position while still rejecting overlapping starting buildings',()=>{
 const m=fixture('function on_start() end');const ruin={...placed('ruin','building.test.briar-ruined-cottage',65,60),owner:'none' as const,activation:'script' as const};m.entities.push(ruin);
 expect(placementOccupancyError(m,testContent)).toBeNull();delete (ruin as {activation?:string}).activation;expect(placementOccupancyError(m,testContent)).toContain('overlaps');
});
