import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {flatTerrainData} from '../../src/shared/map/terrainData';
import type {PreviewMap} from '../../src/shared/authoring/mapScene';
import {authoringSceneSchema} from '../../src/shared/authoring/layers';
/** Synthetic compiler fixture, not a shipped or retired map. */
export function proceduralFixture():PreviewMap{
 const region={type:'region',points:[{x:105,z:105},{x:147,z:105},{x:151,z:147},{x:106,z:151}]};
 return {...emptyUtcMap(),authoring:authoringSceneSchema.parse({terrain:flatTerrainData(256,0,-8),version:1,objects:[],layers:[
 {id:'forest',name:'Forest',recipe:'recipe.forest.conifer-edge',seed:14,shape:region},
 {id:'stream',name:'Stream',recipe:'recipe.river.gentle',seed:1,shape:{type:'spline',knots:[{x:100,z:116,elevation:-.2,outgoing:{x:118,z:105}},{x:127,z:129,elevation:-.2,incoming:{x:120,z:118},outgoing:{x:135,z:142}},{x:155,z:135,elevation:-.2,incoming:{x:149,z:146}}]}},
 {id:'banks',name:'Banks',recipe:'recipe.foliage.riverbank',seed:6,shape:region}]})};
}
