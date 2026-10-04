import {biomeById,biomeTerrainTile} from '../../content/biomes';
import type {ImportedTerrain} from '../../shared/map/importedTerrain';
import {terrainTilePixels} from './terrainTilePixels';

/** Warm the bounded CPU tile cache only; the material owns its GPU arrays.
 * Material readiness remains authoritative and retries any failed prefetch. */
export function prefetchTerrain(biomeId?:string,source?:ImportedTerrain):void{
 const biome=biomeById(biomeId);
 const layers=source?.layers??([biome.ground,'grass','dirt','waterbed','stones','rock'] as const).map(name=>biomeTerrainTile(biome,name));
 const names=new Set(layers.flatMap(l=>[l.ar,l.nh]));
 if(source?.displacement)names.add(source.displacement.texture);
 for(const name of names)void terrainTilePixels(name).catch(()=>{});
}
