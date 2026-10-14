import {expect,it} from 'vitest';
import {hitLayer,hitLayers} from '../../src/editor/select/layerHit';
import {proceduralLayerSchema} from '../../src/shared/authoring/layers';
import type {LandscapeAsset} from '../../src/shared/authoring/catalogue';
/** Test-owned recipe catalogue: mask/region layers need no recipe data; spline hits read river width and banks. */
const river={type:'river' as const,water:'water.test',width:7,depth:1.8,bankWidth:3,flow:.6,maxUphillGrade:0};
const assets:LandscapeAsset[]=[
 {id:'recipe.test.patches',name:'Test patches',kind:'landscape-recipe',scale:1,clearance:0},
 {id:'recipe.test.river',name:'Test river',kind:'landscape-recipe',scale:1,clearance:0,recipe:river},
];
const patch=(id:string)=>proceduralLayerSchema.parse({id,name:id,recipe:'recipe.test.patches',seed:1,shape:{type:'mask',strokes:[{operation:'add',radius:8,points:[{x:20,z:20}]}]}});
it('lists all overlapping masks and regions, including locked layers, in selection order',()=>{
 const a=patch('a'),b={...patch('b'),locked:true},c={...patch('c'),visible:false},d={...patch('d'),enabled:false};
 expect(hitLayers([a,b,c,d],assets,20,20).map(l=>l.id)).toEqual(['b','a']);
 expect(hitLayer([a,b],assets,20,20)?.id).toBe('b');
 expect(hitLayers([a,b],assets,50,50)).toEqual([]);
 const region=proceduralLayerSchema.parse({...a,id:'region',shape:{type:'region',points:[{x:10,z:10},{x:30,z:10},{x:20,z:30}]}});
 expect(hitLayers([region,a],assets,20,20).map(l=>l.id)).toEqual(['a','region']);
});
it('respects subtracted mask holes',()=>{
 const a=patch('a');if(a.shape.type!=='mask')throw Error();
 a.shape.strokes.push({operation:'subtract',radius:2,points:[{x:20,z:20}]});
 expect(hitLayers([a],assets,20,20)).toEqual([]);
 expect(hitLayers([a],assets,24,20)).toEqual([a]);
});
it('includes river banks and authored spline width scaling',()=>{
 const layer=proceduralLayerSchema.parse({id:'river',name:'River',seed:1,recipe:'recipe.test.river',shape:{type:'spline',knots:[{x:10,z:20,elevation:0,widthScale:2},{x:100,z:20,elevation:0,widthScale:2}]}});
 // Half the doubled water width plus the full bank on each side.
 const reach=river.width*2/2+river.bankWidth;
 expect(hitLayers([layer],assets,50,20+reach-.1)).toEqual([layer]);
 expect(hitLayers([layer],assets,50,20+reach+.1)).toEqual([]);
 expect(hitLayers([layer],[],50,20)).toEqual([]);
});
