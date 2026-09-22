import {createBiomeMap} from '../../src/shared/map/newMap';
import {proceduralLayerSchema} from '../../src/shared/authoring/layers';
/** Tiny generated fixtures, independent of the shipped map library. */
export function biomeFixture(biome:'vibrant-forest'|'frozen-forest'|'autumn-forest'){
 const frozen=biome==='frozen-forest',autumn=biome==='autumn-forest',base=createBiomeMap('Biome fixture',256,biome);
 const mask=(id:string,recipe:string,points:number[][],radius:number)=>proceduralLayerSchema.parse({id,name:id,recipe,seed:32,shape:{type:'mask',elevation:-.6,strokes:[{operation:'add',radius,points:points.map(([x,z])=>({x,z}))}]}});
 const forest=frozen?'recipe.forest.frozen':autumn?'recipe.forest.autumn':'recipe.forest.diverse';
 const layers=[mask('forest.west',forest,[[65,110],[70,150],[85,185]],19),mask('forest.east',forest,[[175,135],[187,185]],20),mask('leaves.west',autumn?'recipe.grass.autumn':frozen?'recipe.grass.winter':'recipe.grass.meadow',[[103,125],[113,155]],9)];
 if(!frozen&&!autumn)layers.push(mask('leafy','recipe.forest.leafy',[[122,191],[143,195]],14));
 const lake=mask('water',frozen?'recipe.river.meltwater':'recipe.river.gentle',[[167,88],[174,84]],11);if(lake.shape.type==='mask')lake.shape.strokes.push({operation:'subtract',radius:3,points:[{x:173,z:84}]});layers.push(lake);
 return {...base,sandbox:true,playerStarts:[{...base.playerStarts[0]!,x:125,z:134}],entities:[{id:'hero',definition:'unit.ants.marshal',position:{x:125,y:134},rotation:0,owner:'player.1' as const}],authoring:{version:1 as const,layers,objects:[]}};
}
