import {describe,it,expect} from 'vitest';
import {entityMarker,footprintPixels} from '../../src/render/minimap/presentation';
import type {EntityView} from '../../src/sim/game/observation';
const entity:EntityView={id:1,definition:'building.ants.fort',owner:'player.1',x:20,y:20,rotation:0,hp:100};
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
  it('shows a neutral amber mine yellow at its actual footprint, including remembered mines',()=>{
    const marker=entityMarker({...entity,owner:'none',remembered:true,resource:{amount:10,growingUntil:null}},{id:'building.neutral.amber-mine',kind:'building',footprint:{width:5,depth:5}},512,264)!;
    expect(marker.fill).toBe('#ffd43b');expect(marker.width).toBeCloseTo(2.578125);expect(marker.height).toBe(marker.width);expect(marker.alpha).toBe(.5);
  });
  it('does not promote trees, exhausted deposits, contained workers or loose items to player markers',()=>{
    expect(entityMarker({...entity,resource:{amount:10,growingUntil:null}},{id:'resource.tree',kind:'resource'},256,264)).toBeNull();
    expect(entityMarker({...entity,resource:{amount:0,growingUntil:null}},{id:'building.neutral.amber-mine',kind:'building'},256,264)).toBeNull();
    expect(entityMarker(entity,{id:'item.wood',kind:'item'},256,264)).toBeNull();
  });
});
