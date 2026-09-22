import './sourceAssetFetch';
import {expect,it} from 'vitest';
import {HeightField} from '../../src/shared/map/height';
import {nativeGroundColor} from '../../src/render/terrain/nativeGroundColor';
import {biomeById,biomeTerrainTile} from '../../src/content/biomes';
it('tints foliage with the painted meadow and restores bare soil in erased regions',async()=>{
 const base=new HeightField(16),painted=new HeightField(16),grass=new HeightField(16);
 grass.grassCoverage=new Float32Array(grass.verts**2).fill(1);
 const weights=new Float32Array(painted.verts**2).fill(1);weights[0]=0;weights[1]=.5;
 painted.surfacePaint=[{owner:'meadow',material:biomeTerrainTile(biomeById(painted.biome),'grass').ar,weights}];
 const [soilResult,paintResult,grassResult]=await Promise.all([base,painted,grass].map(nativeGroundColor));
 expect(Array.from(paintResult.rgba.slice(0,3))).toEqual(Array.from(soilResult.rgba.slice(0,3)));
 expect(Array.from(paintResult.rgba.slice(8,11))).toEqual(Array.from(grassResult.rgba.slice(8,11)));
 for(let c=0;c<3;c++)expect(paintResult.rgba[4+c]).toBe(Math.round((soilResult.rgba[4+c]!+grassResult.rgba[4+c]!)/2));
 expect(Array.from(paintResult.rgba.slice(8,11))).not.toEqual(Array.from(soilResult.rgba.slice(8,11)));
});
