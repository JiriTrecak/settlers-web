import type {Placement} from '../../src/content/schema';
import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {startingResourceClearanceError} from '../../src/content/map';
import {resourceBlocksCell,resourceCenterSeparation} from '../../src/shared/map/resourceClearance';

it('keeps the enlarged main hall outside the amber service lane before spawning',()=>{
 const map={...emptyUtcMap(),entities:[] as Placement[]},start=map.playerStarts[0]!;
 const hall=content.get(content.rules.startingSetup.fort),amber=content.get('building.neutral.amber-mine');
 const minimum=resourceCenterSeparation(hall.footprint!,amber.footprint!,amber.constructionClearance!);
 expect(minimum).toEqual({x:18,y:18});
 map.entities.push({id:'amber',definition:amber.id,owner:'none',rotation:0,position:{x:start.x+minimum.x-1,y:start.z}});
 expect(startingResourceClearanceError(map,content)).toContain('18 cells');
 map.entities[0]!.position.x++;
 expect(startingResourceClearanceError(map,content)).toBeNull();
 // This is the exact last cell of the hall: construction uses the same boundary.
 const edge={x:start.x+7,y:start.z};
 expect(resourceBlocksCell(edge,map.entities[0]!.position,amber.footprint,amber.constructionClearance!)).toBe(false);
 map.entities[0]!.position.x--;
 expect(resourceBlocksCell(edge,map.entities[0]!.position,amber.footprint,amber.constructionClearance!)).toBe(true);
});

it('rotates rectangular resource envelopes and ignores depleted deposits at starts',()=>{
 expect(resourceBlocksCell({x:3,y:0},{x:0,y:0},{width:3,depth:7},0,90)).toBe(true);
 expect(resourceBlocksCell({x:3,y:0},{x:0,y:0},{width:3,depth:7},0,0)).toBe(false);
 const map={...emptyUtcMap(),entities:[] as Placement[]},s=map.playerStarts[0]!;
 map.entities.push({id:'empty',definition:'building.neutral.amber-mine',owner:'none',rotation:0,position:{x:s.x+10,y:s.z},initialState:{amount:0}});
 expect(startingResourceClearanceError(map,content)).toBeNull();
});
