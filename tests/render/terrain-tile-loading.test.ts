import {afterEach,expect,it,vi} from 'vitest';
import {gzipSync} from 'node:zlib';
import {LinearMipmapLinearFilter,RepeatWrapping,SRGBColorSpace} from 'three';
vi.mock('../../src/render/terrain/terrainTextureUrl',()=>({terrainTextureUrl:(name:string)=>`/tiles/${name}`}));
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
const bytes=1024*1024*4;
const response=(value:number)=>new Response(gzipSync(new Uint8Array(bytes).fill(value)));

it('reuses prefetched biome tiles for the actual material without allocating GPU textures early',async()=>{
 const {prefetchTerrain}=await import('../../src/render/terrain/prefetchTerrain');
 const {terrainTileArray}=await import('../../src/render/terrain/terrainTileArray');
 const {biomeById}=await import('../../src/content/biomes');
 const {authoredTerrain}=await import('../../src/render/terrain/authoredTerrain');
 const {HeightField}=await import('../../src/shared/map/height');
 const biome=biomeById('vibrant-forest');
 const field=new HeightField(256);field.biome=biome.id;field.baseMaterial=biome.ground;
 const names=authoredTerrain(field,[],[]).layers;
 const fetch=vi.fn(async()=>response(47));vi.stubGlobal('fetch',fetch);
 prefetchTerrain(biome.id);
 const arrays=await Promise.all([terrainTileArray(names.map(l=>l.ar),true),terrainTileArray(names.map(l=>l.nh),false)]);
 expect(fetch).toHaveBeenCalledTimes(new Set(names.flatMap(l=>[l.ar,l.nh])).size);
 for(const array of arrays){expect(array.image.data![0]).toBe(47);expect(array.image.data![array.image.data!.length-1]).toBe(47);array.dispose();}
});

it('loads tiles concurrently, joins duplicate requests and preserves array order and raw channels',async()=>{
 const {terrainTilePixels}=await import('../../src/render/terrain/terrainTilePixels');
 const {terrainTileArray}=await import('../../src/render/terrain/terrainTileArray');
 const release=new Map<string,(r:Response)=>void>();
 const fetch=vi.fn((url:string)=>new Promise<Response>(resolve=>release.set(url,resolve)));vi.stubGlobal('fetch',fetch);
 const arrayReady=terrainTileArray(['a','b','a','c','d','e'],true);
 const duplicate=terrainTilePixels('a');
 expect(fetch).toHaveBeenCalledTimes(4);expect(release.has('/tiles/e')).toBe(false);
 release.get('/tiles/b')!(response(73));
 await terrainTilePixels('b');
 await vi.waitFor(()=>expect(release.has('/tiles/e')).toBe(true));
 for(const [name,value] of [['e',201],['d',0],['c',127],['a',255]] as const)release.get('/tiles/'+name)!(response(value));
 const array=await arrayReady,raw=await duplicate;
 expect(fetch).toHaveBeenCalledTimes(5);
 for(const [i,value] of [255,73,255,127,0,201].entries())expect(Buffer.from(array.image.data!.subarray(i*bytes,(i+1)*bytes)).equals(Buffer.alloc(bytes,value))).toBe(true);
 expect(array.colorSpace).toBe(SRGBColorSpace);expect(array.wrapS).toBe(RepeatWrapping);expect(array.minFilter).toBe(LinearMipmapLinearFilter);
 expect(await terrainTilePixels('a')).toBe(raw);
 array.image.data![0]=1;expect(raw[0]).toBe(255);array.dispose();
});

it('retries failed requests and rejects wrong dimensions without poisoning the cache',async()=>{
 const {terrainTilePixels}=await import('../../src/render/terrain/terrainTilePixels');
 const fetch=vi.fn().mockResolvedValueOnce(new Response('missing',{status:404})).mockResolvedValueOnce(new Response(gzipSync(new Uint8Array(8)))).mockImplementation(()=>Promise.resolve(response(19)));vi.stubGlobal('fetch',fetch);
 await expect(terrainTilePixels('bad')).rejects.toThrow('Failed terrain texture');
 await expect(terrainTilePixels('bad')).rejects.toThrow('dimensions mismatch');
 expect((await terrainTilePixels('bad'))[0]).toBe(19);expect(fetch).toHaveBeenCalledTimes(3);
});

it('bounds decoded tile retention and keeps recently used pixels',async()=>{
 const {terrainTilePixels}=await import('../../src/render/terrain/terrainTilePixels');
 const compressed=gzipSync(new Uint8Array(bytes).fill(31));
 const fetch=vi.fn(async()=>new Response(compressed));vi.stubGlobal('fetch',fetch);
 for(let i=0;i<16;i++)await terrainTilePixels(String(i));
 const hot=await terrainTilePixels('0');await terrainTilePixels('16');
 expect(await terrainTilePixels('0')).toBe(hot);expect(fetch).toHaveBeenCalledTimes(17);
 await terrainTilePixels('1');expect(fetch).toHaveBeenCalledTimes(18);
});
