import type {PostProcessingSettings} from '../shared/environment/postProcessing';
import {FOREST,type GlobalLight} from '../shared/environment/presets';
import {DEFAULT_ATMOSPHERE} from '../shared/landscape/atmosphere';
import {weatherPreset,type WeatherSettings} from '../shared/landscape/weather';
import {environmentConditions,type EnvironmentConditions} from '../shared/environment/conditions';
import type {Landscape} from '../shared/landscape/curve';
import {DEFAULT_CANOPY} from '../shared/landscape/canopy';
import type {EnvironmentState, TerrainStroke} from '../shared/landscape/curve';

export type Biome = {
  id: string;
  name: string;
  description: string;
  ground: 'soil' | 'dirt';
  lightingProfile: 'temperate' | 'winter';
  terrainSet: 'temperate' | 'winter';
  terrainTiles?: Partial<Record<'soil'|'dirt'|'grass'|'waterbed'|'stones'|'rock', {ar:string; nh:string; tiling?:number; blend?:number; tint?:string}>>;
  groundCover?: {radius:number; strength:number};
  minimap: {ground: string; grass: string; forest: string; crown: string};
  environment: EnvironmentState & {light:GlobalLight;postProcessing:PostProcessingSettings};
  weatherLooks?: Partial<Record<WeatherSettings["kind"],WeatherSettings>>;
  materials: readonly {id: TerrainStroke['layer']; name: string}[];
  foliage: readonly {id: string; name: string}[];
  rivers: readonly {id: string; name: string}[];
  scenery: {prefixes: readonly string[]; default: string};
  paths?: readonly {id:string;name:string}[];
  landforms: readonly {id: string; name: string}[];
};

/** Clear-air woodland: golden sunlight, living greens and cool intact shadows. */
const WOODLAND_FINISH:PostProcessingSettings={
 daytimeLutStrength:0,distanceFogStrength:0,
 exposure:1.08,contrast:1.035,saturation:1.16,highlightShoulder:.86,
 shadowTint:'#d6eaf0',highlightTint:'#fff4db',splitStrength:.12,shadowLift:0,vignette:0,
 bloom:{strength:.035,threshold:1.6,knee:.15,radius:1.5},
 contact:{strength:.4,radius:1.2,bias:.07},
};
const WINTER_FINISH:PostProcessingSettings={
 ...WOODLAND_FINISH,exposure:1.12,contrast:1.025,saturation:1.05,
 shadowTint:'#b8d7f3',highlightTint:'#ffffff',splitStrength:.16,
 bloom:{strength:.025,threshold:1.8,knee:.15,radius:1.5},
 contact:{strength:.3,radius:1.2,bias:.07},
};
const AUTUMN_FINISH:PostProcessingSettings={
 ...WOODLAND_FINISH,exposure:1.04,saturation:1.045,
 shadowTint:'#ba8cc4',highlightTint:'#ffdfba',splitStrength:.76,shadowLift:.12,vignette:.18,
 bloom:{strength:.3,threshold:1,knee:.3,radius:4},
};

/** Art direction and editor choices live here. Entries refer to published assets/recipes. */
const BASE_BIOMES: readonly Biome[] = [{
  id: 'vibrant-forest',
  name: 'Vibrant Forest',
  description: 'Warm exposed soil, patchy meadow grass, dense pines and clear woodland streams.',
  ground: 'soil',
  lightingProfile:'temperate', terrainSet: 'temperate',
  terrainTiles:{soil:{ar:'asset.terrain.woodland-soil',nh:'asset.terrain.woodland-soil-normal',tiling:.8},dirt:{ar:'asset.terrain.woodland-dirt',nh:'asset.terrain.woodland-dirt-normal',tiling:.8},grass:{ar:'asset.terrain.woodland-grass',nh:'asset.terrain.woodland-grass-normal',tiling:.9},stones:{ar:'asset.terrain.pebble-trail',nh:'asset.terrain.pebble-normal',tiling:1.2,blend:.65}},
  paths:[{id:'recipe.path.pebbles',name:'Pebble forest trail'},{id:'recipe.path.grass',name:'Grass ground'},{id:'recipe.path.soil',name:'Exposed earth'}],
  minimap: {ground: '#ad956d', grass: '#829151', forest: '#344c2a', crown: '#687a40'},
  environment: {postProcessing:WOODLAND_FINISH,light:{...FOREST.light,ambientTint:'#e5f3e8',ambientStrength:.3,skyTint:'#e0eeff',fillStrength:.8,sunTint:'#eef0ff',sunStrength:1,sunHeight:45,sunDirection:-100,shadowSoftness:3},atmosphere:{...DEFAULT_ATMOSPHERE,enabled:false,density:0,shaftDensity:0,regions:[]},hour: 12, season: 'summer', playing: false, canopy: {...DEFAULT_CANOPY,enabled:true,height:140,scale:240,coverage:.55,softness:.22,strength:.14,cloudShadow:0}},
  materials: [{id: 'sand', name: 'Exposed soil'}, {id: 'road', name: 'Dirt path'}, {id: 'grass', name: 'Grass ground'}, {id: 'rock', name: 'Rock'}],
  foliage: [
    {id: 'recipe.grass.meadow', name: 'Patchy meadow'},
    {id: 'recipe.forest.conifer-edge', name: 'Pine forest'},
    {id: 'recipe.forest.diverse', name: 'Living pine forest'},
    {id: 'recipe.forest.leafy', name: 'Leafy woodland'},
    {id: 'recipe.foliage.riverbank', name: 'Riverbank undergrowth'},
    {id: 'recipe.foliage.mushroom-patches', name: 'Woodland mushroom patches'},
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
  ground: 'soil', lightingProfile:'winter', terrainSet: 'winter',
  terrainTiles:{soil:{ar:'asset.terrain.winter-dirt',nh:'asset.terrain.winter-dirt-normal',tiling:.65},grass:{ar:'asset.terrain.winter-soil',nh:'asset.terrain.winter-soil-normal',tiling:.6,blend:.65}},
  minimap: {ground: '#ced4d8', grass: '#a8b7ad', forest: '#4f6869', crown: '#b8d0ce'},
  environment: {postProcessing:WINTER_FINISH,light:{...FOREST.light,ambientTint:'#c4dcf5',ambientStrength:.7,skyTint:'#c5ddff',fillStrength:.85,sunTint:'#dceaff',sunStrength:.72,shadowSoftness:3},atmosphere:{...DEFAULT_ATMOSPHERE,enabled:false,density:0,shaftDensity:0,regions:[]},hour: 12, season: 'summer', playing: false, canopy: {...DEFAULT_CANOPY,enabled:true,height:150,scale:320,coverage:.45,softness:.22,strength:.12,cloudShadow:0}, weather: {kind: 'clear', intensity: 0, windX: .7, windZ: .25}},
  materials: [{id: 'sand', name: 'Snow-covered soil'}, {id: 'road', name: 'Winter dirt path'}, {id: 'grass', name: 'Frozen grass ground'}, {id: 'rock', name: 'Snowy rock'}],
  foliage: [{id: 'recipe.grass.winter', name: 'Winter meadow'}, {id: 'recipe.forest.frozen', name: 'Frozen pine forest'}, {id: 'recipe.foliage.frozen-bank', name: 'Snowy riverbank'}],
  rivers: [{id: 'recipe.river.meltwater', name: 'Quiet meltwater'}, {id: 'recipe.river.glacial', name: 'Fast glacial stream'}],
  scenery: {prefixes: ['frost-', 'canopy-ancient-tree'], default: 'frost-boulder'},
  landforms: [{id: 'recipe.terrain.hill', name: 'Snowy hill'}, {id:'recipe.terrain.bank',name:'Snowy banks'}, {id:'recipe.terrain.mountain',name:'Rocky mountains'}],
}, {
  id: 'autumn-forest', name: 'Amberleaf Forest',
  description: 'Golden broadleaf crowns, copper leaf litter, dry woodland grass and warm earthen paths.',
  ground: 'soil', lightingProfile:'temperate', terrainSet: 'temperate',
  terrainTiles: {grass:{ar:'asset.terrain.autumn-leaf-litter',nh:'asset.terrain.autumn-leaf-normal',tiling:.6,blend:.7}},
  groundCover:{radius:2.6,strength:.8},
  minimap: {ground:'#ad8960',grass:'#89834a',forest:'#99622f',crown:'#d69b37'},
  environment: {postProcessing:AUTUMN_FINISH,light:{...FOREST.light},atmosphere:{...DEFAULT_ATMOSPHERE,enabled:true,density:0,shaftDensity:.0014,heightFalloff:18,sunStrength:2.2,color:'#c4adc8',sunTint:'#ffda9e',noiseScale:.05,noiseStrength:.8,regions:[]},hour:12,season:'summer',playing:false,canopy:{...DEFAULT_CANOPY,enabled:true,height:140,scale:280,coverage:.62,softness:.17,strength:.58,cloudShadow:.08}},
  materials: [{id:'sand',name:'Warm exposed soil'},{id:'road',name:'Woodland path'},{id:'grass',name:'Fallen leaves and dry grass'},{id:'rock',name:'Rock'}],
  foliage: [{id:'recipe.grass.autumn',name:'Fallen-leaf meadow'},{id:'recipe.forest.autumn',name:'Amberleaf woodland'},{id:'recipe.foliage.riverbank',name:'Green riverbank'},{id:'recipe.foliage.mushroom-patches',name:'Woodland mushroom patches'}],
  rivers: [{id:'recipe.river.gentle',name:'Woodland stream'},{id:'recipe.river.swift',name:'Fast woodland river'}],
  scenery: {prefixes:['autumn-','canopy-','woodland-'],default:'autumn-shrub-gold'},
  landforms:[{id:'recipe.terrain.hill',name:'Woodland hill'},{id:'recipe.terrain.bank',name:'Leaf-covered banks'},{id:'recipe.terrain.mountain',name:'Rocky mountains'}],
}];

/** Variants share recipes and assets, while owning an intentional visual profile. */
export const BIOMES:readonly Biome[]=[...BASE_BIOMES,{
 ...BASE_BIOMES[0],id:'deep-forest',name:'Deep Forest',
 description:'Sheltered woodland with denser overhead canopy, cooler shade and low forest haze.',
 environment:{...BASE_BIOMES[0].environment,
  postProcessing:{...WOODLAND_FINISH,exposure:1.01,shadowTint:'#a392c7',splitStrength:.7,shadowLift:.12,vignette:.21,bloom:{...WOODLAND_FINISH.bloom,strength:.28}},
  light:{...BASE_BIOMES[0].environment.light,sunStrength:.82,ambientTint:'#dbe4ea',hazeColor:'#d9e4d8'},
  canopy:{...DEFAULT_CANOPY,enabled:true,height:180,scale:360,coverage:.80,softness:.2,strength:.65,cloudShadow:.10},
  atmosphere:{...DEFAULT_ATMOSPHERE,enabled:true,density:.00015,shaftDensity:.0018,baseHeight:1,heightFalloff:20,sunStrength:2.2,color:'#a8bdc3',regions:[]},
 },
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
  return {ar:base,nh:name==='stones'?'asset.terrain.pebble-normal':base+'-normal',tiling:undefined,blend:undefined,tint:undefined};
 }
 const base='asset.terrain.'+(['soil','grass','dirt','rock'].includes(name)?'winter-'+name:name==='waterbed'?'woodland-riverbed':'pebble-trail');
 return {ar:base,nh:name==='stones'?'asset.terrain.pebble-normal':base+'-normal',tiling:undefined,blend:undefined,tint:undefined};
}

/** Resolve every visual parameter from the live biome, never from map snapshots
 * or browser-local presets. The result is isolated from the shared definition. */
export function biomeEnvironment(id?:string,conditions?:Partial<EnvironmentConditions>):EnvironmentState {
 const biome=biomeById(id),look=structuredClone(biome.environment);
 if(conditions?.hour!==undefined)look.hour=conditions.hour;
 if(conditions?.playing!==undefined)look.playing=conditions.playing;
 const kind=conditions?.weather?.kind??look.weather?.kind??'clear';
 look.weather=structuredClone(biome.weatherLooks?.[kind]??(look.weather?.kind===kind?look.weather:weatherPreset(kind)));
 return look;
}
export type ResolvedLandscape=Omit<Landscape,'environment'> & {environment:EnvironmentState};
export function biomeLandscape(id:string|undefined,landscape:Landscape):ResolvedLandscape {
 const {water:_retiredWater,...rest}=landscape;
 return {...rest,environment:biomeEnvironment(id,environmentConditions(landscape.environment))};
}
