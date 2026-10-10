import {captureTerrain} from '../../src/shared/authoring/captureTerrain';
import {expect,it} from 'vitest';
import {content} from '../../src/content/builtin';
import {expandMap} from '../../src/content/map';
import {startingUnitPosition} from '../../src/content/startingHero';
import {emptyUtcMap,parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {mapRevision,playableMapError} from '../../src/shared/map/playable';
import {World} from '../../src/sim/world/world';
import {HeightField} from '../../src/shared/map/height';
import {slots} from './helpers';

it.each([0,90,180,270] as const)('keeps the complete formation point-symmetric on navigation centres at %i degrees',rotation=>{
 const blank=emptyUtcMap(512),map={...blank,playerStarts:blank.playerStarts.map((s,i)=>({...s,x:i?429.5:81.5,z:i?85.5:425.5,
  rotation:(i?(rotation+180)%360:rotation) as 0|90|180|270}))};
 expect(playableMapError(map)).toBeNull();
 const placements=expandMap(map,content),a=placements.filter(p=>p.owner==='player.1'),b=placements.filter(p=>p.owner==='player.2');
 expect(a).toHaveLength(8);expect(b).toHaveLength(8);
 for(let i=0;i<a.length;i++){
  expect(b[i].position).toEqual({x:511-a[i].position.x,y:511-a[i].position.y});
  expect(b[i].rotation).toBe((a[i].rotation+180)%360);
  if(content.get(a[i].definition).kind==='unit'){
   expect(Number.isInteger(a[i].position.x)).toBe(true);
   expect(Number.isInteger(a[i].position.y)).toBe(true);
  }
 }
 expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))!.playerStarts).toEqual(map.playerStarts);
});

it('rotates clockwise and rejects arbitrary formation angles',()=>{
 const start={x:81.5,z:81.5},offset={x:2,y:14};
 expect(startingUnitPosition({...start,rotation:0},offset)).toEqual({x:84,y:96});
 expect(startingUnitPosition({...start,rotation:90},offset)).toEqual({x:96,y:79});
 expect(startingUnitPosition({...start,rotation:180},offset)).toEqual({x:79,y:67});
 expect(startingUnitPosition({...start,rotation:270},offset)).toEqual({x:67,y:84});
 expect(()=>startingUnitPosition({...start,rotation:13},offset)).toThrow(/90-degree/);
});

it('validates clearance for the rotated units, not just the Hall footprint',()=>{
 const blank=emptyUtcMap(),map={...blank,playerStarts:[{...blank.playerStarts[0],x:21.5,z:81.5,rotation:90 as 0|90|180|270},blank.playerStarts[1]]};
 const field=new HeightField(map.size);field.waterLevel=-1;
 for(let z=0;z<field.verts;z++)for(let x=0;x<field.verts;x++)if(x+field.origin<=2)field.samples[z*field.verts+x]=-2;
 map.authoring={version:1,objects:[],terrain:captureTerrain(field)};
 expect(playableMapError(map)).toBeNull();
 map.playerStarts[0].rotation=270;
 expect(playableMapError(map)).not.toBeNull();
});

it('includes start facing in match identity and preserves it through deterministic save continuation',()=>{
 const map=emptyUtcMap();map.playerStarts[1].rotation=180;
 expect(mapRevision(map)).not.toBe(mapRevision(emptyUtcMap()));
 const options={map,slots,seed:103},a=new World(options),b=new World(options);
 for(let i=0;i<20;i++)a.tick();b.restore(a.snapshot());
 for(let i=0;i<40;i++){a.tick();b.tick();expect(b.checksum('full')).toBe(a.checksum('full'));}
 expect(b.snapshot()).toEqual(a.snapshot());
});
