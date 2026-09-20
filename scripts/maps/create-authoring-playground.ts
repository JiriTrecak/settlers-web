import {writeFile,mkdir} from 'node:fs/promises';
import {emptyUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {authoringSceneSchema} from '../../src/shared/authoring/layers';
const region={type:'region',points:[{x:105,z:105},{x:147,z:105},{x:151,z:147},{x:106,z:151}]};
const map={...emptyUtcMap(),name:'Authoring Playground',description:'Live procedural forest, stream and riverbank recipes. Edit the source layers; bake only when needed.',sandbox:true,waterLevel:-8,
 playerStarts:[{player:1,x:96,z:140,setup:'setup.ants',mainFort:'start.player.1/main-fort'}],
 authoring:authoringSceneSchema.parse({version:1,objects:[],layers:[
  {id:'forest',name:'Conifer grove',recipe:'recipe.forest.conifer-edge',seed:14,shape:region},
  {id:'stream',name:'Woodland stream',recipe:'recipe.river.gentle',seed:1,shape:{type:'spline',knots:[{x:100,z:116,elevation:-.2,outgoing:{x:118,z:105}},{x:127,z:129,elevation:-.2,incoming:{x:120,z:118},outgoing:{x:135,z:142}},{x:155,z:135,elevation:-.2,incoming:{x:149,z:146}}]}},
  {id:'banks',name:'Tall grass along the water',recipe:'recipe.foliage.riverbank',seed:6,shape:region},
 ]})};
await mkdir('assets/maps/showcase',{recursive:true});await writeFile('assets/maps/showcase/authoring-playground.utcmap',stringifyUtcMap(map));
