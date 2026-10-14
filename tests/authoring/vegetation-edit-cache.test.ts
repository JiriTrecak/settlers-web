import {isDeepStrictEqual} from 'node:util';
import {expect,it} from 'vitest';
import {compileMapScene,type CompiledMapScene} from '../../src/shared/authoring/mapScene';
import {updateMapScene} from '../../src/shared/authoring/updateMapScene';
import {testLandscape} from './landscape';
import {proceduralLayerSchema,type ProceduralLayer} from '../../src/shared/authoring/layers';
import {proceduralFixture} from './fixture';

function equivalent(a:CompiledMapScene,b:CompiledMapScene){
 for(const key of ['generated','stamps','resources','owners'] as const)expect(isDeepStrictEqual(a[key],b[key]),key).toBe(true);
 for(const key of ['samples','grassCoverage','rockCoverage','forestCoverage','surfacePaint'] as const)expect(isDeepStrictEqual(a.field[key],b.field[key]),key).toBe(true);
}
const mask=(x:number)=>({type:'mask' as const,elevation:0,strokes:[{operation:'add' as const,radius:16,points:[{x,z:125},{x:x+5,z:130}]},{operation:'subtract' as const,radius:3,points:[{x:x+6,z:130}]}]});

it.each(['forest','grass','meadow','ground-cover'] as const)('incremental %s edits, other layers and undo match a full compile',type=>{
 const map=proceduralFixture(),recipe=testLandscape.find(a=>a.recipe?.type===type)!;
 const layer=proceduralLayerSchema.parse({id:'edit',name:'Edit',recipe:recipe.id,seed:7,order:9,shape:mask(125)});
 map.authoring!.layers.push(proceduralLayerSchema.parse({...layer,id:'meadow',recipe:'recipe.meadow.woodland-edge',order:20}));
 const original=compileMapScene(map,testLandscape),snapshot=structuredClone(original.generated);
 let before=map,compiled=original;
 const variants:Array<ProceduralLayer|undefined>=[layer,{...layer,shape:mask(135)},{...layer,seed:99},
  {...layer,overrides:type==='meadow'?{type,reach:18,edgeFade:3,ragged:{strength:1}}:{type,density:.7,minSpacing:2,waterClearance:4}},
  {...layer,visible:false,locked:true},{...layer,order:-1},{...layer,enabled:false},undefined,layer];
 for(const variant of variants){
  const next={...map,authoring:{...map.authoring!,layers:[...map.authoring!.layers,...(variant?[variant]:[])]}};
  const incremental=updateMapScene(before,next,compiled,testLandscape);
  equivalent(incremental,compileMapScene(next,testLandscape));
  before=next;compiled=incremental;
 }
 // A stale snapshot must not borrow changed caches.
 equivalent(updateMapScene(map,map,original,testLandscape),original);
 equivalent(compileMapScene(map,testLandscape,compiled),original);
 expect(isDeepStrictEqual(original.generated,snapshot)).toBe(true);
});

it('revalidates recipe/shape changes and terrain-recipe replacements against a full compile',()=>{
 const before=proceduralFixture(),original=compileMapScene(before,testLandscape),forest=before.authoring!.layers[0];
 const swapped={...before,authoring:{...before.authoring!,layers:before.authoring!.layers.map(l=>l.id===forest.id?{...l,recipe:'recipe.meadow.woodland-edge'}:l)}};
 const result=updateMapScene(before,swapped,original,testLandscape);equivalent(result,compileMapScene(swapped,testLandscape));
 const malformed={...swapped,authoring:{...swapped.authoring,layers:swapped.authoring.layers.map(l=>l.id===forest.id?{...l,shape:before.authoring!.layers[1].shape}:l)}};
 const mismatch=compileMapScene(malformed,testLandscape,result);equivalent(mismatch,compileMapScene(malformed,testLandscape));
 expect(mismatch.generated!.issues.some(i=>i.code==='shape-mismatch'&&i.id===forest.id)).toBe(true);
 const terrain=testLandscape.find(a=>a.recipe?.type==='terrain')!;
 const carved={...swapped,authoring:{...swapped.authoring,layers:swapped.authoring.layers.map(l=>l.id===forest.id?{...l,recipe:terrain.id}:l)}};
 const changed=compileMapScene(carved,testLandscape,result);equivalent(changed,compileMapScene(carved,testLandscape));
});
