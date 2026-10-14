import '../fixtures/walkableCatalogue';
import {it,expect} from 'vitest';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {testContent} from '../fixtures/content';
import {placementOccupancyError,validatePlacements} from '../../src/content/map';
import type {Placement} from '../../src/content/schema';
const unit=(id:string,surface?:string):Placement=>({id,definition:'unit.test.warrior',position:{x:32,y:32,...(surface?{surface}:{})},owner:'player.1',rotation:0});
const base=emptyUtcMap();
// Default starts expand into main forts; keep them clear of the crossing under test.
const map=()=>({...base,playerStarts:base.playerStarts.map((s,i)=>({...s,x:201.5,z:i?81.5:201.5})),stamps:[{id:'root',asset:'leafbound-twig-bridge',x:31.5,y:31.5}],entities:[unit('lower'),unit('upper','root')]});
it('authors units above and below the same crossing while rejecting overlap on one floor',()=>{
 const m=map();expect(()=>validatePlacements(m,testContent)).not.toThrow();expect(placementOccupancyError(m,testContent)).toBeNull();
 m.entities.push(unit('second-upper','root'));expect(placementOccupancyError(m,testContent)).toBe('upper: overlaps second-upper');
});
it('rejects unknown and out-of-bounds surfaces at map import',()=>{
 const m=map();m.entities[1].position.surface='unknown';expect(()=>validatePlacements(m,testContent)).toThrow(/walk surface/);
 m.entities[1].position={x:80,y:80,surface:'root'};expect(()=>validatePlacements(m,testContent)).toThrow(/walk surface/);
});
it('rejects coplanar intersecting surface placements even if their stamp IDs differ',()=>{
 const m=map();m.stamps.push({id:'other',asset:'leafbound-twig-bridge',x:31.5,y:31.5});m.entities=[unit('one','root'),unit('two','other')];
 expect(placementOccupancyError(m,testContent)).toMatch(/overlaps one/);
});
