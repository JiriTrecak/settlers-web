import {describe,it,expect} from 'vitest';
import {entityMarker,footprintPixels} from '../../src/render/minimap/presentation';
import type {EntityView} from '../../src/sim/game/observation';
import {content} from '../../src/content/builtin';
const entity:EntityView={id:1,definition:'building.test.fort',owner:'player.1',x:20,y:20,rotation:0,hp:100};
describe('minimap footprint and resource presentation',()=>{
  it('scales footprint area with map size rather than using a fixed building dot',()=>{
    expect(footprintPixels({width:9,depth:9},0,264,264)).toEqual([9,9]);
    expect(footprintPixels({width:9,depth:9},0,528,264)).toEqual([4.5,4.5]);
    expect(footprintPixels({width:1,depth:1},0,512,264)).toEqual([1,1]);
  });
  it('swaps rectangular footprints at quarter turns',()=>{
    expect(footprintPixels({width:3,depth:7},90,264,264)).toEqual([7,3]);
    expect(footprintPixels({width:3,depth:7},-90,264,264)).toEqual([7,3]);
  });
  // ENGINE-COUPLED: entityMarker recognises resource deposits by shipped definition id
  // (src/render/minimap/presentation.ts), so the recognised deposits are read from shipped content.
  const deposit={...entity,owner:'none' as const,resource:{amount:10,growingUntil:null}};
  const deposits=content.definitions.filter(d=>d.kind==='building'&&d.footprint&&entityMarker(deposit,d,512,264));
  it('shows recognised deposits at their actual footprint, including remembered ones, and hides exhausted ones',()=>{
    expect(deposits.length).toBeGreaterThan(0);
    for(const d of deposits){
      const marker=entityMarker({...deposit,remembered:true},d,512,264)!;
      expect(marker.width).toBeCloseTo(footprintPixels(d.footprint!,0,512,264)[0]);expect(marker.height).toBeCloseTo(footprintPixels(d.footprint!,0,512,264)[1]);
      expect(marker.alpha).toBeLessThan(1);
      expect(entityMarker({...deposit,resource:{amount:0,growingUntil:null}},d,256,264)).toBeNull();
    }
  });
  it('does not promote trees or loose items to player markers',()=>{
    expect(entityMarker({...entity,resource:{amount:10,growingUntil:null}},{id:'resource.tree',kind:'resource'},256,264)).toBeNull();
    expect(entityMarker(entity,{id:'item.test.wood',kind:'item'},256,264)).toBeNull();
  });
});
