import {describe,it,expect} from 'vitest';
import {createBiomeMap} from '../../src/shared/map/newMap';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {proceduralLayerSchema} from '../../src/shared/authoring/layers';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';
function fixture(){const map=createBiomeMap('Trail',256,'vibrant-forest');map.authoring!.layers=[proceduralLayerSchema.parse({id:'trail',name:'Trail',recipe:'recipe.path.pebbles',seed:1,shape:{type:'mask',strokes:[{operation:'add',radius:10,points:[{x:120,z:128},{x:140,z:128}]}]}})];return map;}
function maskAt(map:ReturnType<typeof fixture>,x:number,z:number){const s=compileMapScene(map,landscapeAssets),t=authoredTerrain(s.field,[],[]);return {value:Buffer.from(t.layers[4]!.mask!,'base64')[(z-s.field.origin)*s.field.verts+x-s.field.origin],texture:t.layers[4]!.ar,scene:s};}
describe('editable pebble trails',()=>{
 it('renders a painted trail and restores underlying ground when subtracted or disabled',()=>{const map=fixture(),before=maskAt(map,130,128);expect(before.value).toBe(255);expect(before.texture).toBe('asset.terrain.pebble-trail');expect(before.scene.generated!.issues).toEqual([]);const l=map.authoring!.layers[0]!;if(l.shape.type==='mask')l.shape.strokes.push({operation:'subtract',radius:4,points:[{x:130,z:128}]});expect(maskAt(map,130,128).value).toBe(0);expect(maskAt(map,122,128).value).toBe(255);l.enabled=false;expect(maskAt(map,122,128).value).toBe(0);});
 it('supports a curved course without flattening the riverbed underneath',()=>{const map=fixture();map.authoring!.layers[0]!.shape={type:'spline',knots:[{x:110,z:128,elevation:9,widthScale:1,depthScale:1,flowScale:1,outgoing:{x:120,z:140}},{x:150,z:128,elevation:9,widthScale:1,depthScale:1,flowScale:1,incoming:{x:140,z:140}}]};const s=compileMapScene(map,landscapeAssets);expect(s.generated!.issues).toEqual([]);expect(s.field.samples.every(n=>n===0)).toBe(true);expect(s.generated!.paint[0]!.weights.some(n=>n===1)).toBe(true);});
});
