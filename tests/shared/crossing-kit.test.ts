import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {bridgeSurfaces,surfaceHeight} from '../../src/shared/map/bridgeSurface';
import {WalkSurfaces} from '../../src/shared/map/walkSurfaces';
import {applySceneryBlockers} from '../../src/shared/map/sceneryCollision';

describe('published crossing kit',()=>{
 for(const asset of ['arched-root-walkway','woodland-timber-bridge','moss-stone-bridge']){
  it(`${asset} retains the modeled profile and crosses a real river`,()=>{
   const config=JSON.parse(readFileSync(`art/sources/environment/${asset}/asset.json`,'utf8'));
   const stamp={id:'crossing',asset,x:31.5,y:31.5,walk:{level:1,height:config.deck.height+config.deck.arch}};
   const [deck]=bridgeSurfaces([stamp],()=>-3);
   expect(deck.width).toBe(config.deck.width);expect(deck.depth).toBe(config.deck.depth);
   expect(deck.base).toBe(0);expect(deck.thickness).toBe(config.deck.thickness);
   expect(surfaceHeight(deck,32,32)).toBeCloseTo(config.deck.height+config.deck.arch);
   const land=new Uint8Array(64*64).fill(1),heights=new Int16Array(64*64);
   const bank=deck.depth/2-2;
   for(let z=0;z<64;z++)for(let x=0;x<64;x++)if(Math.abs(z+.5-32)<bank){land[z*64+x]=0;heights[z*64+x]=-300;}
   applySceneryBlockers({size:64,stamps:[stamp]},land);
   const graph=new WalkSurfaces(64,heights,land,[deck]);
   const route=graph.path({x:32,y:15},{x:32,y:49});
   expect(route).not.toBeNull();expect(route!.some(p=>p.surface==='crossing')).toBe(true);
   expect(route!.filter(p=>Math.abs(p.y+.5-32)<bank).every(p=>p.surface==='crossing')).toBe(true);
   expect(graph.path({x:10,y:32},{x:54,y:32})).toBeNull();
  });
 }
 it('leaves the root underpass open while separating its elevated crown',()=>{
  const [deck]=bridgeSurfaces([{id:'root',asset:'arched-root-walkway',x:31.5,y:31.5}],()=>0);
  const graph=new WalkSurfaces(64,new Int16Array(64*64),new Uint8Array(64*64).fill(1),[deck]);
  const lower=graph.path({x:16,y:32},{x:48,y:32});
  expect(lower).not.toBeNull();expect(lower!.every(p=>!p.surface)).toBe(true);
  expect(graph.path({x:32,y:16},{x:32,y:32,surface:'root'})).not.toBeNull();
  expect(graph.meleeClear({x:32,y:32},{x:32,y:32,surface:'root'})).toBe(false);
 });
});
