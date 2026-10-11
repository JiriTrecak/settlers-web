import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {expect,it,vi} from 'vitest';
import {graphicsMode,installedGroundChannels} from '../../scripts/assets/warcraft/installed';
import {decodeGroundDds} from '../../scripts/assets/warcraft/dds';

it('preserves installed Classic diffuse bytes and never requests unrelated material maps',async()=>{
 const bytes=await readFile('art/assets/asset.terrain.warcraft-lgrs/source.bin');
 const extract=vi.fn(async(_path:string)=>bytes);
 const channels=await installedGroundChannels('terrainart/lordaeronsummer/lords_grass','classic',extract);
 expect(extract.mock.calls).toHaveLength(1);
 expect(extract).toHaveBeenCalledWith('war3.w3mod:terrainart/lordaeronsummer/lords_grass.dds');
 expect(channels[0].bytes).toBe(bytes);
 const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 expect(hash(channels[0].pixels.rgba)).toBe(hash(decodeGroundDds(bytes).rgba));
 expect(channels[1].origin).toBe('neutral-material');expect(channels[2].origin).toBe('neutral-material');
 for(let i=0;i<channels[1].pixels.rgba.length;i+=4){
  if(i%4096!==0)continue;
  expect([...channels[1].pixels.rgba.subarray(i,i+4)]).toEqual([128,128,255,255]);
  expect([...channels[2].pixels.rgba.subarray(i,i+4)]).toEqual([255,255,0,255]);
 }
});

it('requests the entire Reforged material from one archive and fails closed on absent channels',async()=>{
 const bytes=await readFile('art/assets/asset.terrain.warcraft-lgrs/source.bin');
 const extract=vi.fn(async(_path:string)=>bytes);
 const channels=await installedGroundChannels('terrainart/test','reforged',extract);
 expect(extract.mock.calls.map(c=>c[0])).toEqual(['diffuse','normal','orm'].map(c=>`war3.w3mod:_hd.w3mod:terrainart/test_${c}.dds`));
 expect(channels.every(c=>c.origin==='installed-reforged')).toBe(true);
 await expect(installedGroundChannels('terrainart/test','reforged',async()=>{throw Error('missing source');})).rejects.toThrow('missing source');
 expect(graphicsMode()).toBe('definitive');expect(()=>graphicsMode('mod-pack')).toThrow();
});

it('publishes a coherent installed Definitive catalogue with unchanged albedo calibration',async()=>{
 const {groundTextures}=await import('../../src/shared/authoring/groundTextures');
 const imported=[...groundTextures.values()].filter(a=>a.id.startsWith('asset.terrain.warcraft-'));
 expect(imported).toHaveLength(106);
 for(const a of imported){
  expect(a.terrain!.reflectance,a.id).toBe(1);
  expect(a.terrain!.shading,a.id).toBe('physical');
  const source=JSON.parse(await readFile(`art/assets/${a.id}/source_4.json`,'utf8'));
  expect(source.graphics,a.id).toBe('definitive');
  expect(source.sources.map((s:{origin:string})=>s.origin),a.id).toEqual(Array(3).fill('installed-definitive'));
 }
});

it('resolves Definitive channels exclusively from the installed DE archive',async()=>{
 const bytes=await readFile('art/assets/asset.terrain.warcraft-lgrs/source.bin');
 const extract=vi.fn(async(_path:string)=>bytes);
 const channels=await installedGroundChannels('terrainart/test','definitive',extract);
 expect(extract.mock.calls.map(c=>c[0])).toEqual(['diffuse','normal','orm'].map(c=>`war3.w3mod:_de.w3mod:terrainart/test_${c}.dds`));
 expect(channels.every(c=>c.origin==='installed-definitive')).toBe(true);
 await expect(installedGroundChannels('terrainart/test','definitive',async()=>{throw Error('missing DE source');})).rejects.toThrow('missing DE source');
});
