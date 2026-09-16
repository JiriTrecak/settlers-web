import {readFileSync,writeFileSync} from 'node:fs';
import {fourCrowns,terrainLab} from './tactical-maps';
import {dressCanopyMap} from './canopy-dressing';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {content} from '../../src/content/builtin';
import {validatePlacements} from '../../src/content/map';
const hollow=parseUtcMap(JSON.parse(readFileSync('art/sources/maps/worldroot-hollow-layout.utcmap','utf8')))!;
for(const [id,base] of [['worldroot-hollow',hollow],['four-crowns',fourCrowns()],['terrain-proving-ground',terrainLab()]] as const){
 const map=dressCanopyMap(base);validatePlacements(map,content);if(!parseUtcMap(map))throw Error(`${id}: invalid canopy map`);
 writeFileSync(`assets/maps/skirmish/${id}.utcmap`,stringifyUtcMap(map));console.log(`${id}: ${map.entities.length} entities, ${map.stamps.filter(s=>s.asset==='ancient-canopy-trunk').length} giant trunks, ${map.stamps.length} props`);
}
