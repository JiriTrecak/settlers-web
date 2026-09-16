import {it,expect} from 'vitest';
import {content} from '../../src/content/builtin';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {Geography,integerPoint,playerObservation} from '../../src/sim/ai/frame';
import type {BridgeSurface} from '../../src/shared/map/bridgeSurface';
import type {SettlementView} from '../../src/sim/game/observation';
const arch:BridgeSurface={id:'arch',level:1,connections:{start:0,end:0},x:16,z:16,c:1,s:0,base:0,width:5,depth:24,height:0,arch:5,thickness:.8};
const briefing=()=>({...createMapBriefing(emptyUtcMap(),content),size:32,heights:Array(1024).fill(0),land:Array(1024).fill(1),surfaces:[arch]});
it('keeps authored ground and bridge surfaces separate in AI map knowledge',()=>{
 const m={...emptyUtcMap(),stamps:[{id:'bridge',asset:'timber-bridge',x:40,y:40}]},b=createMapBriefing(m,content);
 expect(b.heights.every(h=>h===0)).toBe(true);expect(b.surfaces[0].id).toBe('bridge');
 expect(b.fingerprint).not.toBe(createMapBriefing({...m,stamps:[{...m.stamps[0],walk:{level:3,connections:{}}}]},content).fingerprint);
});
it('finds a same-level destination across water through the upper bridge',()=>{
 const b=briefing();for(let y=8;y<=24;y++)for(let x=0;x<32;x++){b.heights[y*32+x]=-300;b.land[y*32+x]=0;}
 const g=new Geography(b);
 expect(g.connected({x:16,y:2},{x:16,y:30})).toBe(true);
 expect(g.connected({x:16,y:2},{x:16,y:16,surface:'arch'})).toBe(true);
 expect(g.connected({x:16,y:2},{x:16,y:16})).toBe(false);
});
it('does not invent an access route onto a disconnected elevated surface',()=>{
 const g=new Geography({...briefing(),surfaces:[{...arch,connections:{}}]});
 expect(g.connected({x:6,y:16},{x:26,y:16})).toBe(true);
 expect(g.connected({x:16,y:16},{x:16,y:16,surface:'arch'})).toBe(false);
 expect(g.connected({x:16,y:16,surface:'missing'},{x:26,y:16})).toBe(false);
});
it('preserves observed surface identity when rounding points and sanitizing enemy observations',()=>{
 expect(integerPoint({x:16.1,y:15.9,surface:'arch'})).toEqual({x:16,y:16,surface:'arch'});
 const view:SettlementView={revision:0,outcome:null,events:[],objectives:{},entities:[{id:1,definition:'unit.ants.archer',owner:'player.2',x:16,y:16,surface:'arch',rotation:0,hp:100}]};
 expect(playerObservation(view,'player.1').entities[0].surface).toBe('arch');
});
