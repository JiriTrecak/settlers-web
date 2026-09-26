import {expect,it} from 'vitest';
import {hitLayer,hitLayers} from '../../src/editor/select/layerHit';
import {proceduralLayerSchema} from '../../src/shared/authoring/layers';
import {landscapeAssets} from '../../src/shared/authoring/project';
const patch=(id:string)=>proceduralLayerSchema.parse({id,name:id,recipe:'recipe.foliage.mushroom-patches',seed:1,shape:{type:'mask',strokes:[{operation:'add',radius:8,points:[{x:20,z:20}]}]}});
it('lists all overlapping masks and regions, including locked layers, in selection order',()=>{
 const a=patch('a'),b={...patch('b'),locked:true},c={...patch('c'),visible:false},d={...patch('d'),enabled:false};
 expect(hitLayers([a,b,c,d],landscapeAssets,20,20).map(l=>l.id)).toEqual(['b','a']);
 expect(hitLayer([a,b],landscapeAssets,20,20)?.id).toBe('b');
 expect(hitLayers([a,b],landscapeAssets,50,50)).toEqual([]);
 const region=proceduralLayerSchema.parse({...a,id:'region',shape:{type:'region',points:[{x:10,z:10},{x:30,z:10},{x:20,z:30}]}});
 expect(hitLayers([region,a],landscapeAssets,20,20).map(l=>l.id)).toEqual(['a','region']);
});
it('respects subtracted mask holes',()=>{
 const a=patch('a');if(a.shape.type!=='mask')throw Error();
 a.shape.strokes.push({operation:'subtract',radius:2,points:[{x:20,z:20}]});
 expect(hitLayers([a],landscapeAssets,20,20)).toEqual([]);
 expect(hitLayers([a],landscapeAssets,24,20)).toEqual([a]);
});
it('includes river banks and authored spline width scaling',()=>{
 const asset=landscapeAssets.find(a=>a.recipe?.type==='river')!;
 if(asset.recipe?.type!=='river')throw Error();
 const layer=proceduralLayerSchema.parse({id:'river',name:'River',seed:1,recipe:asset.id,shape:{type:'spline',knots:[{x:10,z:20,elevation:0,widthScale:2},{x:100,z:20,elevation:0,widthScale:2}]}});
 const width=asset.recipe.width+asset.recipe.bankWidth;
 expect(hitLayers([layer],landscapeAssets,50,20+width-.1)).toEqual([layer]);
 expect(hitLayers([layer],landscapeAssets,50,20+width+.1)).toEqual([]);
});
