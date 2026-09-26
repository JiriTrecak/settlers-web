/** Sparse forest-scale landmarks; existing paths, rivers and gameplay objects are retained. */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseUtcMap,stringifyUtcMap,type UtcMap} from '../../src/shared/map/utcmap';
import {authoredObjectSchema,proceduralLayerSchema} from '../../src/shared/authoring/layers';
export function addForestGiants(map:UtcMap){
 if(!map.authoring)throw Error('Threewater needs procedural authoring');
 const landmarks:[string,number,number,number,number][]=[
  ['woodland-canopy-elder',42,204,1,.35],
  ['woodland-canopy-spreading',171,48,1,-.5],
  ['woodland-canopy-elder',237,221,.95,1.8],
  ['woodland-great-broken-trunk',111,112,.85,.1],
  ['woodland-great-fallen-log',49,174,.9,.55],
  ['woodland-great-fallen-log',156,73,.8,-.6],
  ['woodland-giant-mushroom-ochre',72,191,1,.4],
  ['woodland-giant-mushroom-russet',81,201,.9,2.1],
  ['woodland-giant-mushroom-ochre',205,144,.9,-.7],
  ['woodland-giant-mushroom-russet',211,151,.8,1],
 ];
 map.authoring.objects=map.authoring.objects.filter(o=>!o.id.startsWith('forest-scale.'));
 map.authoring.objects.push(...landmarks.map(([slug,x,z,scale,yaw],i)=>authoredObjectSchema.parse({id:'forest-scale.'+i,asset:'asset.models.environment.'+slug,x,z,scale,yaw})));
 map.authoring.layers=map.authoring.layers.filter(l=>l.id!=='foliage.mushroom-glades');
 map.authoring.layers.push(proceduralLayerSchema.parse({id:'foliage.mushroom-glades',name:'Mushroom glades · forest-scale landmarks',recipe:'recipe.foliage.mushroom-patches',seed:19027,order:map.authoring.layers.length,shape:{type:'mask',strokes:[
  {operation:'add',radius:7,points:[{x:69,z:194},{x:78,z:198},{x:82,z:206}]},
  {operation:'add',radius:6,points:[{x:202,z:149},{x:211,z:156}]},
  {operation:'add',radius:5,points:[{x:111,z:117}]},
 ]}}));
 map.description='Three woodland rivers and walkable crossings beneath sparse ancient oak crowns, giant mushroom umbrellas and fallen trunks. Mushroom glades, a ruined lookout, a broken cart and secluded camps give the forest floor its scale.';
 return map;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const path='assets/maps/skirmish/threewater-forest.utcmap';
 const map=parseUtcMap(JSON.parse(readFileSync(path,'utf8')));if(!map)throw Error('Invalid Threewater map');
 writeFileSync(path,stringifyUtcMap(addForestGiants(map)));
 console.log('Added ten sparse forest-scale landmarks and one editable mushroom brush layer.');
}
