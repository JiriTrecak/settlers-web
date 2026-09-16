import {it,expect} from 'vitest';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {content} from '../../src/content/builtin';
import {placementOccupancyError,validatePlacements} from '../../src/content/map';
import type {Placement} from '../../src/content/schema';
const unit=(id:string,surface?:string):Placement=>({id,definition:'unit.ants.warrior',position:{x:32,y:32,...(surface?{surface}:{})},owner:'player.1',rotation:0});
const map=()=>({...emptyUtcMap(),stamps:[{id:'root',asset:'arched-root-walkway',x:31.5,y:31.5}],entities:[unit('lower'),unit('upper','root')]});
it('authors units above and below the same crossing while rejecting overlap on one floor',()=>{
 const m=map();expect(()=>validatePlacements(m,content)).not.toThrow();expect(placementOccupancyError(m,content)).toBeNull();
 m.entities.push(unit('second-upper','root'));expect(placementOccupancyError(m,content)).toBe('upper: overlaps second-upper');
});
it('rejects unknown and out-of-bounds surfaces at map import',()=>{
 const m=map();m.entities[1].position.surface='unknown';expect(()=>validatePlacements(m,content)).toThrow(/walk surface/);
 m.entities[1].position={x:80,y:80,surface:'root'};expect(()=>validatePlacements(m,content)).toThrow(/walk surface/);
});
it('rejects coplanar intersecting surface placements even if their stamp IDs differ',()=>{
 const m=map();m.stamps.push({id:'other',asset:'arched-root-walkway',x:31.5,y:31.5});m.entities=[unit('one','root'),unit('two','other')];
 expect(placementOccupancyError(m,content)).toMatch(/overlaps one/);
});
