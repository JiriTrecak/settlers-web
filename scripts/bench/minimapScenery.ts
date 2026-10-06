/** CPU-only minimap classification/sort benchmark. Does not render or save a map. */
import {readFileSync} from 'node:fs';
import {deepStrictEqual} from 'node:assert';
import {parseUtcMap,type MapStamp} from '../../src/shared/map/utcmap';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {MinimapSceneryIndex} from '../../src/render/minimap/sceneryIndex';
import {sceneryKind} from '../../src/render/minimap/terrainStyle';

const path=process.argv[2]??'assets/maps/skirmish/amberwake-basin.utcmap';
const map=parseUtcMap(JSON.parse(readFileSync(path,'utf8')));if(!map?.authoring)throw Error('Expected an authored map');
const compiled=compileMapScene(map,landscapeAssets),assets=new Map(landscapeAssets.map(a=>[a.id,a]));
const stamps:MapStamp[]=[...map.stamps,...[...map.authoring.objects,...compiled.generated!.objects].filter(o=>o.visible).map(o=>({id:o.id,asset:assets.get(o.asset)!.scenery!,x:o.x,y:o.z,scale:o.scale}))];
const index=new MinimapSceneryIndex(),runs=[];
for(let i=0;i<8;i++){
 // Fresh stamp records mimic a compiled edit, including one changed tree.
 const next=stamps.map(s=>({...s})),moved=next.find(s=>sceneryKind(s.asset)==='tree')!;moved.x+=i;
 let start=performance.now();const direct=next.filter(s=>sceneryKind(s.asset)).slice().sort((a,b)=>a.y-b.y).map(stamp=>({stamp,kind:sceneryKind(stamp.asset)}));const directMs=performance.now()-start;
 start=performance.now();index.update(next);const indexedMs=performance.now()-start;
 deepStrictEqual(index.items,direct);runs.push({directMs,indexedMs});
}
console.log(JSON.stringify({map:path,props:stamps.length,minimapItems:index.items.length,identicalOutput:true,runs},null,2));
