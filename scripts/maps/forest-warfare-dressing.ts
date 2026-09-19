import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseUtcMap,stringifyUtcMap,type UtcMap} from '../../src/shared/map/utcmap';
import {content} from '../../src/content/builtin';
import {validatePlacements} from '../../src/content/map';
import {DEFAULT_CANOPY} from '../../src/shared/landscape/canopy';
import {DEFAULT_ATMOSPHERE} from '../../src/shared/landscape/atmosphere';

function variation(id:string){let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)/4294967296;}
const leaves=new Set(['ant-fern','ant-broadleaf','fern-thicket','bramble-thicket','curled-forest-leaf','synty-plant-fern-01','synty-plant-fern-02','synty-plant-fern-03','canopy-forest-leaves']);
const mushrooms=new Set(['synty-plant-mushrooms-01','canopy-tiny-mushrooms']);
const twigs=new Set(['forest-splinter-pile','canopy-twig-log']);

/** Presentation-only rebuild: identities, terrain, roads, portals, camp loot,
 * triggers, walk surfaces and resource positions remain authored gameplay data.
 * Pure/idempotent so it can also finish future procedural map builds. */
export function forestWarfareDressing(source:UtcMap):UtcMap{
 const map={...structuredClone(source)},indoor=!!map.landscape?.environment.interior;
 for(const entity of map.entities){
  if(entity.definition==='unit.ants.civilian'||entity.definition==='unit.ants.youngling')entity.appearance={...entity.appearance,asset:'asset.ants.settler'};
  if(entity.definition==='building.briar.cottage')entity.appearance={...entity.appearance,asset:'asset.ants.house',scale:.95};
  if(entity.definition!=='resource.forest.tree')continue;
  const v=variation(entity.id);
  entity.appearance={...entity.appearance,asset:v<.73?'asset.resource.tree-primary':'asset.resource.tree-secondary',scale:.86+v*.26};
 }
 map.stamps=map.stamps.map(source=>{
  const stamp={...source};
  const v=variation(stamp.id);
  if(leaves.has(stamp.asset)){stamp.asset='canopy-forest-leaves';stamp.scale=.70+v*.75;}
  else if(mushrooms.has(stamp.asset)||stamp.asset.startsWith('lowpolymushroom')){stamp.asset='canopy-tiny-mushrooms';stamp.scale=.85+v*.8;}
  else if(twigs.has(stamp.asset)){stamp.asset='canopy-twig-log';stamp.scale=.45+v*.5;}
  // Large mushrooms belong along forest edges. The small variant is distinct
  // from trees and keeps roads/starting clearings visually quiet.
  else if(stamp.asset==='ochre-mushroom-colony')stamp.scale=.48+v*.34;
  return stamp;
 });
 const landscape=map.landscape;
 if(landscape){
  const clearings=map.entities.filter(e=>content.get(e.definition).kind==='building').map(e=>{
   const f=content.get(e.definition).footprint;
   return {x:e.position.x,z:e.position.y,radius:Math.hypot(f?.width??3,f?.depth??3)*.5+1.25};
  });
  for(const cover of landscape.cover){
   cover.palette='forest';cover.grassScale=indoor?.65:1;cover.density=indoor?1.3:3.4;cover.flowers=Math.min(cover.flowers,.025);
   const exclusions=[...(cover.exclusions??[]),...clearings.filter(p=>Math.hypot(p.x-cover.x,p.z-cover.z)<cover.radius+p.radius)];
   cover.exclusions=[...new Map(exclusions.map(p=>[`${p.x}:${p.z}:${p.radius}`,p])).values()];
  }
  if(!indoor){
   landscape.environment.preset='forest-warfare';
   landscape.environment.canopy={...DEFAULT_CANOPY,...landscape.environment.canopy,enabled:true,coverage:.56,cloudShadow:.18,scale:42};
   landscape.environment.atmosphere={...DEFAULT_ATMOSPHERE,...landscape.environment.atmosphere,enabled:true,color:'#b9b59e',sunTint:'#ffe0a6',density:.0018,sunStrength:1.65};
  }
 }
 return map;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const visit=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?visit(join(dir,e.name)):e.name.endsWith('.utcmap')?[join(dir,e.name)]:[]);
 for(const path of visit('assets/maps')){
  const source=parseUtcMap(JSON.parse(readFileSync(path,'utf8')));if(!source)throw Error(`Invalid source map ${path}`);
  const map=forestWarfareDressing(source);if(!parseUtcMap(map))throw Error(`Invalid dressed map ${path}`);
  validatePlacements(map,content);writeFileSync(path,stringifyUtcMap(map));
  console.log(`${path}: ${map.entities.filter(e=>e.definition==='resource.forest.tree').length} harvestable trees, ${map.stamps.length} scenery placements`);
 }
}
