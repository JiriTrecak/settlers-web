import {isDeepStrictEqual} from 'node:util';
import {expect,it} from 'vitest';
import {compileMapScene,type CompiledMapScene} from '../../src/shared/authoring/mapScene';
import {updateMapScene} from '../../src/shared/authoring/updateMapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {proceduralLayerSchema,type ProceduralLayer} from '../../src/shared/authoring/layers';
import {proceduralFixture} from './fixture';

function equivalent(a:CompiledMapScene,b:CompiledMapScene){
 for(const key of ['generated','stamps','resources','owners'] as const)expect(isDeepStrictEqual(a[key],b[key]),key).toBe(true);
 for(const key of ['samples','grassCoverage','rockCoverage','forestCoverage','surfacePaint'] as const)expect(isDeepStrictEqual(a.field[key],b.field[key]),key).toBe(true);
}
const mask=(x:number)=>({type:'mask' as const,elevation:0,strokes:[{operation:'add' as const,radius:16,points:[{x,z:125},{x:x+5,z:130}]},{operation:'subtract' as const,radius:3,points:[{x:x+6,z:130}]}]});

it.each(['forest','grass','meadow','ground-cover'] as const)('reuses carving but exactly rechecks %s edits, other layers and undo',type=>{
 const map=proceduralFixture(),recipe=landscapeAssets.find(a=>a.recipe?.type===type)!;
 const layer=proceduralLayerSchema.parse({id:'edit',name:'Edit',recipe:recipe.id,seed:7,order:9,shape:mask(125)});
 map.authoring!.layers.push(proceduralLayerSchema.parse({...layer,id:'meadow',recipe:'recipe.meadow.woodland-edge',order:20}));
 const original=compileMapScene(map,landscapeAssets),snapshot=structuredClone(original.generated);
 let before=map,compiled=original;
 const variants:Array<ProceduralLayer|undefined>=[layer,{...layer,shape:mask(135)},{...layer,seed:99},
  {...layer,overrides:type==='meadow'?{type,reach:18,edgeFade:3,ragged:{strength:1}}:{type,density:.7,minSpacing:2,waterClearance:4}},
  {...layer,visible:false,locked:true},{...layer,order:-1},{...layer,enabled:false},undefined,layer];
 for(const variant of variants){
  const next={...map,authoring:{...map.authoring!,layers:[...map.authoring!.layers,...(variant?[variant]:[])]}};
  const incremental=updateMapScene(before,next,compiled,landscapeAssets);
  expect(incremental.generated!.terrain).toBe(original.generated!.terrain);
  equivalent(incremental,compileMapScene(next,landscapeAssets));
  before=next;compiled=incremental;
 }
 // A stale snapshot shares the carved surface but must not borrow changed caches.
 equivalent(updateMapScene(map,map,original,landscapeAssets),original);
 equivalent(compileMapScene(map,landscapeAssets,compiled),original);
 expect(isDeepStrictEqual(original.generated,snapshot)).toBe(true);
});

it('revalidates recipe/shape changes and invalidates surface caches for terrain replacements',()=>{
 const before=proceduralFixture(),original=compileMapScene(before,landscapeAssets),forest=before.authoring!.layers[0];
 const swapped={...before,authoring:{...before.authoring!,layers:before.authoring!.layers.map(l=>l.id===forest.id?{...l,recipe:'recipe.meadow.woodland-edge'}:l)}};
 const result=updateMapScene(before,swapped,original,landscapeAssets);equivalent(result,compileMapScene(swapped,landscapeAssets));
 expect(result.generated!.terrain).toBe(original.generated!.terrain);
 const malformed={...swapped,authoring:{...swapped.authoring,layers:swapped.authoring.layers.map(l=>l.id===forest.id?{...l,shape:before.authoring!.layers[1].shape}:l)}};
 const mismatch=compileMapScene(malformed,landscapeAssets,result);equivalent(mismatch,compileMapScene(malformed,landscapeAssets));
 expect(mismatch.generated!.issues.some(i=>i.code==='shape-mismatch'&&i.id===forest.id)).toBe(true);
 const terrain=landscapeAssets.find(a=>a.recipe?.type==='terrain')!;
 const carved={...swapped,authoring:{...swapped.authoring,layers:swapped.authoring.layers.map(l=>l.id===forest.id?{...l,recipe:terrain.id}:l)}};
 const changed=compileMapScene(carved,landscapeAssets,result);expect(changed.generated!.terrain).not.toBe(original.generated!.terrain);equivalent(changed,compileMapScene(carved,landscapeAssets));
});
