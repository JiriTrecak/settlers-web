import {DEFAULT_CANOPY} from '../shared/landscape/canopy';
import type {EnvironmentState, TerrainStroke} from '../shared/landscape/curve';

export type Biome = {
  id: string;
  name: string;
  description: string;
  ground: 'soil' | 'dirt';
  terrainSet: 'temperate' | 'winter';
  terrainTiles?: Partial<Record<'soil'|'dirt'|'grass'|'waterbed'|'stones'|'rock', {ar:string; nh:string; tiling?:number; blend?:number}>>;
  groundCover?: {radius:number; strength:number};
  minimap: {ground: string; grass: string; forest: string; crown: string};
  environment: EnvironmentState;
  materials: readonly {id: TerrainStroke['layer']; name: string}[];
  foliage: readonly {id: string; name: string}[];
  rivers: readonly {id: string; name: string}[];
  scenery: {prefixes: readonly string[]; default: string};
  paths?: readonly {id:string;name:string}[];
  landforms: readonly {id: string; name: string}[];
};

/** Art direction and editor choices live here. Entries refer to published assets/recipes. */
export const BIOMES: readonly Biome[] = [{
  id: 'vibrant-forest',
  name: 'Vibrant Forest',
  description: 'Warm exposed soil, patchy meadow grass, dense pines and clear woodland streams.',
  ground: 'soil',
  terrainSet: 'temperate',
  terrainTiles:{soil:{ar:'asset.terrain.woodland-soil',nh:'asset.terrain.woodland-soil-normal'},grass:{ar:'asset.terrain.woodland-grass',nh:'asset.terrain.woodland-grass-normal',tiling:.5},stones:{ar:'asset.terrain.pebble-trail',nh:'asset.terrain.pebble-normal',tiling:1.2,blend:.65}},
  paths:[{id:'recipe.path.pebbles',name:'Pebble forest trail'},{id:'recipe.path.grass',name:'Grass ground'},{id:'recipe.path.soil',name:'Exposed earth'}],
  minimap: {ground: '#ad956d', grass: '#829151', forest: '#344c2a', crown: '#687a40'},
  environment: {hour: 12, season: 'summer', playing: false, canopy: {...DEFAULT_CANOPY,enabled:true,height:38,scale:100,coverage:.36,cloudShadow:.12}},
  materials: [{id: 'sand', name: 'Exposed soil'}, {id: 'road', name: 'Dirt path'}, {id: 'grass', name: 'Grass ground'}, {id: 'rock', name: 'Rock'}],
  foliage: [
    {id: 'recipe.grass.meadow', name: 'Patchy meadow'},
    {id: 'recipe.forest.conifer-edge', name: 'Pine forest'},
    {id: 'recipe.forest.diverse', name: 'Living pine forest'},
    {id: 'recipe.forest.leafy', name: 'Leafy woodland'},
    {id: 'recipe.foliage.riverbank', name: 'Riverbank undergrowth'},
  ],
  rivers: [
    {id: 'recipe.river.gentle', name: 'Gentle woodland stream'},
    {id: 'recipe.river.swift', name: 'Fast woodland river'},
  ],
  scenery: {prefixes: ['woodland-', 'leafbound-', 'canopy-'], default: 'woodland-moss-boulder'},
  landforms: [{id: 'recipe.terrain.hill', name: 'Woodland hill'}, {id:'recipe.terrain.bank',name:'Grassy banks'}, {id:'recipe.terrain.mountain',name:'Rocky mountains'}],
}, {
  id: 'frozen-forest', name: 'Frozen Forest',
  description: 'Snow-covered earth, frosted pines, winter undergrowth and cold meltwater channels.',
  ground: 'soil', terrainSet: 'winter',
  minimap: {ground: '#ced4d8', grass: '#a8b7ad', forest: '#4f6869', crown: '#b8d0ce'},
  environment: {hour: 12, season: 'summer', playing: false, canopy: {...DEFAULT_CANOPY,enabled:true,height:38,scale:100,coverage:.25,cloudShadow:.12}, weather: {kind: 'snow', intensity: .35, windX: .7, windZ: .25}},
  materials: [{id: 'sand', name: 'Snow-covered soil'}, {id: 'road', name: 'Winter dirt path'}, {id: 'grass', name: 'Frozen grass ground'}, {id: 'rock', name: 'Snowy rock'}],
  foliage: [{id: 'recipe.grass.winter', name: 'Winter meadow'}, {id: 'recipe.forest.frozen', name: 'Frozen pine forest'}, {id: 'recipe.foliage.frozen-bank', name: 'Snowy riverbank'}],
  rivers: [{id: 'recipe.river.meltwater', name: 'Quiet meltwater'}, {id: 'recipe.river.glacial', name: 'Fast glacial stream'}],
  scenery: {prefixes: ['frost-', 'canopy-ancient-tree'], default: 'frost-boulder'},
  landforms: [{id: 'recipe.terrain.hill', name: 'Snowy hill'}, {id:'recipe.terrain.bank',name:'Snowy banks'}, {id:'recipe.terrain.mountain',name:'Rocky mountains'}],
}, {
  id: 'autumn-forest', name: 'Amberleaf Forest',
  description: 'Golden broadleaf crowns, copper leaf litter, dry woodland grass and warm earthen paths.',
  ground: 'soil', terrainSet: 'temperate',
  terrainTiles: {grass:{ar:'asset.terrain.autumn-leaf-litter',nh:'asset.terrain.autumn-leaf-normal',tiling:.6,blend:.7}},
  groundCover:{radius:2.6,strength:.8},
  minimap: {ground:'#ad8960',grass:'#89834a',forest:'#99622f',crown:'#d69b37'},
  environment: {hour:12,season:'summer',playing:false,canopy:{...DEFAULT_CANOPY,enabled:false,height:38,scale:90,coverage:.22,cloudShadow:.10}},
  materials: [{id:'sand',name:'Warm exposed soil'},{id:'road',name:'Woodland path'},{id:'grass',name:'Fallen leaves and dry grass'},{id:'rock',name:'Rock'}],
  foliage: [{id:'recipe.grass.autumn',name:'Fallen-leaf meadow'},{id:'recipe.forest.autumn',name:'Amberleaf woodland'},{id:'recipe.foliage.riverbank',name:'Green riverbank'}],
  rivers: [{id:'recipe.river.gentle',name:'Woodland stream'},{id:'recipe.river.swift',name:'Fast woodland river'}],
  scenery: {prefixes:['autumn-','canopy-','woodland-'],default:'autumn-shrub-gold'},
  landforms:[{id:'recipe.terrain.hill',name:'Woodland hill'},{id:'recipe.terrain.bank',name:'Leaf-covered banks'},{id:'recipe.terrain.mountain',name:'Rocky mountains'}],
}];

export const MAP_DIMENSIONS = [
  {size: 256, name: 'Small'}, {size: 512, name: 'Medium'},
  {size: 1024, name: 'Large'}, {size: 2048, name: 'Extra large'},
] as const;
export type MapSize = typeof MAP_DIMENSIONS[number]['size'];
export function biomeById(id = 'vibrant-forest'): Biome {
  const biome = BIOMES.find(b => b.id === id);
  if (!biome) throw new Error(`Unknown biome: ${id}`);
  return biome;
}
export function biomeRecipes(biome: Biome) {
  return [...biome.foliage, ...biome.rivers, ...biome.landforms, ...(biome.paths??[])];
}

/** Resolve a biome's texture inputs without coupling original art to imported filenames. */
export function biomeTerrainTile(biome:Biome,name:'soil'|'dirt'|'grass'|'waterbed'|'stones'|'rock') {
 const override=biome.terrainTiles?.[name];if(override)return override;
 if(biome.terrainSet==='temperate'){
  const base='asset.terrain.'+(name==='stones'?'pebble-trail':name==='waterbed'?'woodland-riverbed':'woodland-'+name);
  return {ar:base,nh:name==='stones'?'asset.terrain.pebble-normal':base+'-normal',tiling:undefined,blend:undefined};
 }
 const base='asset.terrain.'+(['soil','grass','dirt','rock'].includes(name)?'winter-'+name:name==='waterbed'?'woodland-riverbed':'pebble-trail');
 return {ar:base,nh:name==='stones'?'asset.terrain.pebble-normal':base+'-normal',tiling:undefined,blend:undefined};
}
