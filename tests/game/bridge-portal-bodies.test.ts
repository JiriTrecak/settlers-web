import {expect,it} from 'vitest';
import {WalkSurfaces} from '../../src/shared/map/walkSurfaces';
import type {BridgeSurface} from '../../src/shared/map/bridgeSurface';
import {clearLayeredSweep} from '../../src/sim/game/layeredSweep';
import {fixed} from '../../src/sim/game/motion';

const bridge:BridgeSurface={id:'brook',level:1,connections:{start:0,end:0},x:16,z:16,c:1,s:0,base:0,width:12,depth:24,height:0,arch:1.2,thickness:.3};
function graph(deck=bridge){
 const heights=new Int16Array(1024),land=new Uint8Array(1024).fill(1);
 for(let y=8;y<=24;y++)for(let x=0;x<32;x++){heights[y*32+x]=-300;land[y*32+x]=0;}
 return new WalkSurfaces(32,heights,land,[deck]);
}
const sweep=(g:WalkSurfaces,a:{x:number;y:number;surface?:string},b:typeof a)=>clearLayeredSweep(g,fixed(a),fixed(b),3.4,2000,id=>g.walkable(id,340));

it('supports the leading edge of a wide body before its center crosses a bridge portal',()=>{
 const g=graph();
 expect(sweep(g,{x:16,y:2},{x:16,y:3})).toBe(true);
 expect(sweep(g,{x:16,y:3},{x:16,y:4,surface:'brook'})).toBe(true);
 expect(sweep(g,{x:16,y:4,surface:'brook'},{x:16,y:3})).toBe(true);
});
it('cannot borrow support from a disconnected deck or beyond the side rails',()=>{
 expect(sweep(graph({...bridge,connections:{}}),{x:16,y:2},{x:16,y:3})).toBe(false);
 expect(sweep(graph(),{x:21,y:15,surface:'brook'},{x:21,y:16,surface:'brook'})).toBe(false);
});
