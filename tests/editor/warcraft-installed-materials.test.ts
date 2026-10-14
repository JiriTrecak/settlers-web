import {expect,it,vi} from 'vitest';
import {graphicsMode,installedGroundChannels} from '../../scripts/assets/warcraft/installed';
import {decodeGroundDds} from '../../scripts/assets/warcraft/dds';

/** A synthetic 8×8 DXT1 ground texture (two colours per block), so the importer is tested without shipped art. */
function dxt1(width=8,height=8){
 const bytes=Buffer.alloc(128+width*height/16*8),view=new DataView(bytes.buffer);
 bytes.write('DDS ',0,'latin1');view.setUint32(4,124,true);view.setUint32(8,0x1007,true);
 view.setUint32(12,height,true);view.setUint32(16,width,true);view.setUint32(28,1,true);
 view.setUint32(76,32,true);view.setUint32(80,0x4,true);bytes.write('DXT1',84,'latin1');view.setUint32(108,0x1000,true);
 for(let block=0;block<width*height/16;block++){const at=128+block*8;view.setUint16(at,0xf800,true);view.setUint16(at+2,0x001f,true);view.setUint32(at+4,0x55555555,true);}
 return bytes;
}

it('preserves installed Classic diffuse bytes and never requests unrelated material maps',async()=>{
 const bytes=dxt1();
 const extract=vi.fn(async(_path:string)=>bytes);
 const channels=await installedGroundChannels('terrainart/lordaeronsummer/lords_grass','classic',extract);
 expect(extract.mock.calls).toHaveLength(1);
 expect(extract).toHaveBeenCalledWith('war3.w3mod:terrainart/lordaeronsummer/lords_grass.dds');
 expect(channels[0].bytes).toBe(bytes);
 expect(Buffer.compare(channels[0].pixels.rgba,decodeGroundDds(bytes).rgba)).toBe(0);
 expect(channels[1].origin).toBe('neutral-material');expect(channels[2].origin).toBe('neutral-material');
 for(let i=0;i<channels[1].pixels.rgba.length;i+=4){
  expect([...channels[1].pixels.rgba.subarray(i,i+4)]).toEqual([128,128,255,255]);
  expect([...channels[2].pixels.rgba.subarray(i,i+4)]).toEqual([255,255,0,255]);
 }
});

it('requests the entire Reforged material from one archive and fails closed on absent channels',async()=>{
 const bytes=dxt1();
 const extract=vi.fn(async(_path:string)=>bytes);
 const channels=await installedGroundChannels('terrainart/test','reforged',extract);
 expect(extract.mock.calls.map(c=>c[0])).toEqual(['diffuse','normal','orm'].map(c=>`war3.w3mod:_hd.w3mod:terrainart/test_${c}.dds`));
 expect(channels.every(c=>c.origin==='installed-reforged')).toBe(true);
 await expect(installedGroundChannels('terrainart/test','reforged',async()=>{throw Error('missing source');})).rejects.toThrow('missing source');
 expect(graphicsMode()).toBe('definitive');expect(()=>graphicsMode('mod-pack')).toThrow();
});

it('resolves Definitive channels exclusively from the installed DE archive',async()=>{
 const bytes=dxt1();
 const extract=vi.fn(async(_path:string)=>bytes);
 const channels=await installedGroundChannels('terrainart/test','definitive',extract);
 expect(extract.mock.calls.map(c=>c[0])).toEqual(['diffuse','normal','orm'].map(c=>`war3.w3mod:_de.w3mod:terrainart/test_${c}.dds`));
 expect(channels.every(c=>c.origin==='installed-definitive')).toBe(true);
 await expect(installedGroundChannels('terrainart/test','definitive',async()=>{throw Error('missing DE source');})).rejects.toThrow('missing DE source');
});
