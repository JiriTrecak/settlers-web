import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {readWarcraftMap} from '../../src/editor/import/warcraft/read';
import {readWarcraftTerrain} from '../../src/editor/import/warcraft/terrain';
import {readWarcraftInfo} from '../../src/editor/import/warcraft/info';
const load=(name:string)=>readWarcraftMap(new Uint8Array(readFileSync(`tests/editor/fixtures/warcraft/${name}.w3x`)));
describe('Warcraft map source decoding',()=>{
 it('reads Echo Isles metadata, terrain, neutral owners, gold mines and trees',()=>{
  const map=load('echo-isles');
  expect(map.info.name).toBe('Echo Isles v2.2');expect(map.info.players).toHaveLength(2);
  expect(map.terrain).toMatchObject({version:11,width:129,height:129,groundTiles:['Ldrt','Ldro','Ldrg','Lrok','Lgrs','Lgrd','Zsan']});
  expect(map.units.filter(u=>u.id==='ngol')).toHaveLength(5);
  expect(map.units.filter(u=>u.player===24)).toHaveLength(77);
  expect(map.doodads.filter(d=>d.id==='LTlt')).toHaveLength(2060);
  expect(map.info.players[0]).toMatchObject({x:-5184,y:4480});
 });
 it('reads the newer Turtle Rock metadata and 16-bit terrain flags without misalignment',()=>{
  const map=load('turtle-rock');
  expect(map.info.name).toBe('Turtle Rock v2.0');expect(map.info.version).toBe(33);expect(map.info.players).toHaveLength(4);
  expect(map.terrain.version).toBe(12);expect(map.terrain.corners).toHaveLength(129*129);
  expect(map.terrain.corners.every(c=>c.texture<6)).toBe(true);
  expect(map.units.filter(u=>u.id==='ngol')).toHaveLength(10);expect(map.doodads).toHaveLength(2200);
 });
 it('rejects truncated files instead of manufacturing terrain or players',()=>{
  expect(()=>readWarcraftTerrain(new Uint8Array([87,51,69,33,12,0,0,0]))).toThrow(/truncated/);
  expect(()=>readWarcraftInfo(new Uint8Array([33,0,0,0]))).toThrow(/truncated/);
  expect(()=>readWarcraftMap(new Uint8Array(16))).toThrow();
 });
});
