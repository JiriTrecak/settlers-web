import type {LandscapeRecipe} from './recipes';
export type RecipeInput={path:string;label:string;value:number|string;min?:number;max?:number;step?:number;options?:readonly string[]};
const numbers:Record<string,[string,number,number,number]>={
 density:['Density multiplier',0,8,.1],spacing:['Placement spacing',.1,64,.1],probability:['Coverage',0,1,.05],jitter:['Position variation',0,1,.05],
 scaleMin:['Minimum size',.01,20,.05],scaleMax:['Maximum size',.01,20,.05],maxSlope:['Maximum slope',0,10,.1],
 waterClearance:['Water clearance',0,64,.1],objectClearance:['Object clearance',0,64,.1],edgeFade:['Boundary fade',0,64,.1],
 minSpacing:['Minimum separation',.1,64,.1],interiorMargin:['Interior inset',0,64,.1],
 'patchiness.scale':['Patch size',.5,128,.5],'patchiness.strength':['Patch contrast',0,1,.05],
 'riverBank.min':['Bank start distance',0,128,.1],'riverBank.max':['Bank end distance',.1,256,.1],
 height:['Height',-128,128,.1],falloff:['Falloff',0,128,.1],width:['Width',.2,128,.1],depth:['Depth',.1,64,.1],bankWidth:['Bank width',.1,64,.1],
 flow:['Flow speed',0,3,.1],maxUphillGrade:['Maximum uphill grade',0,.05,.001],shoulder:['Shoulder width',0,64,.1],flatten:['Flatten strength',0,1,.05],vegetationClearance:['Vegetation clearance',0,32,.1],
};
/** One control vocabulary for recipe assets and their map instances. */
export function recipeInputs(recipe:LandscapeRecipe):RecipeInput[]{
 const result:RecipeInput[]=[];
 function visit(object:Record<string,unknown>,prefix='',labelPrefix=''){
  const values={...object};
  if('species'in values){values.density??=1;values.pattern??=values.patchiness?'patches':'scattered';values.patchiness??={scale:12,strength:.6};}
  for(const [key,value]of Object.entries(values)){
   const path=prefix+key,local=path.replace(/^edge\./,'');
   if(key==='edge'&&value){visit(value as Record<string,unknown>,'edge.','Edge · ');continue;}
   if(['patchiness','riverBank'].includes(key)&&value){visit(value as Record<string,unknown>,path+'.',labelPrefix);continue;}
   if(typeof value==='number'&&numbers[local]){const [label,min,max,step]=numbers[local]!;result.push({path,label:labelPrefix+label,value,min:local==='width'&&prefix==='edge.'?.1:min,max:local==='width'&&prefix==='edge.'?64:max,step});}
   if(key==='pattern')result.push({path,label:labelPrefix+'Pattern',value:String(value),options:['scattered','patches']});
   if(key==='operation')result.push({path,label:'Terrain operation',value:String(value),options:['raise','lower','flatten']});
   if(typeof value==='string'&&['water','material','bankMaterial','bedMaterial'].includes(key))result.push({path,label:labelPrefix+key.replace(/([A-Z])/g,' $1'),value});
  }
 }
 visit(recipe);
 const priority=['density','pattern','patchiness.scale','patchiness.strength','spacing','probability'];
 return result.sort((a,b)=>{
  const ae=a.path.startsWith('edge.'),be=b.path.startsWith('edge.');if(ae!==be)return ae?1:-1;
  const rank=(path:string)=>{const i=priority.indexOf(path.replace(/^edge\./,''));return i<0?priority.length:i;};return rank(a.path)-rank(b.path);
 });
}
export function recipeInputValue(object:unknown,path:string):unknown{
 let cursor=object;for(const key of path.split('.')){if(!cursor||typeof cursor!=='object')return undefined;cursor=(cursor as Record<string,unknown>)[key];}return cursor;
}
/** Immutable sparse edits; resetting a nested input leaves its siblings inherited. */
export function changeRecipeInput<T extends object>(object:T,path:string,value:unknown):T{
 const result=structuredClone(object) as Record<string,unknown>,keys=path.split('.');
 if(keys.some(k=>['__proto__','constructor','prototype'].includes(k)))throw Error('Invalid input path');
 function edit(target:Record<string,unknown>,index:number){const key=keys[index]!;
  if(index===keys.length-1){if(value===undefined)delete target[key];else target[key]=value;return;}
  const child=target[key];const nested=child&&typeof child==='object'&&!Array.isArray(child)?child as Record<string,unknown>:{};edit(nested,index+1);
  if(Object.keys(nested).length)target[key]=nested;else delete target[key];
 }
 edit(result,0);return result as T;
}
