import {expect,it} from 'vitest';
import {DewPlacements,type DewContributor} from '../../src/render/prop/dewPlacements';
const beads=(x:number)=>new Float32Array([x,2,3,.1]);
it('matches exhaustive packing through pose, membership and length changes without changing old snapshots',()=>{
 const rows:DewContributor[]=[{dewWorld:beads(1)},{},{dewWorld:beads(3)}],data=new DewPlacements();
 const all=()=>rows,check=()=>expect(data.dew).toEqual(Float32Array.from(rows.flatMap(r=>Array.from(r.dewWorld??[]))));
 data.sync(all,[],true);check();const old=data.dew;
 rows[0].dewWorld=beads(20);data.sync(()=>{throw Error('pose edit must not walk forest');},[rows[0]],false);check();
 expect(old).toEqual(Float32Array.from([1,2,3,.1,3,2,3,.1]));
 rows[0].dewWorld=undefined;data.sync(all,[rows[0]],false);check();
 rows[1].dewWorld=beads(2);data.sync(all,[rows[1]],false);check();
 rows[2].dewWorld=new Float32Array([...beads(3),...beads(4)]);data.sync(all,[rows[2]],false);check();
 rows.splice(0,1);data.sync(all,[],true);check();rows.reverse();data.sync(all,[],true);check();
 rows.push({dewWorld:beads(9)});data.sync(all,[],true);check();rows.splice(0);data.sync(all,[],true);check();
});
it('retains dew buffer identity when ordinary scenery changes',()=>{
 const tree={},data=new DewPlacements();data.sync(()=>[tree,{dewWorld:beads(5)}],[],true);const before=data.dew;
 data.sync(()=>{throw Error('unexpected forest scan');},[tree],false);expect(data.dew).toBe(before);
});
