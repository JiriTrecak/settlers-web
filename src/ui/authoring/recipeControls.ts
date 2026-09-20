import type {LandscapeRecipe,RecipeOverrides} from '../../shared/authoring/recipes';
import {recipeInputs,recipeInputValue} from '../../shared/authoring/recipeInputs';
/** Shared controls; map instances explicitly show whether a value is inherited. */
export function mountRecipeControls(host:HTMLElement,recipe:LandscapeRecipe,options:{disabled?:boolean;overrides?:RecipeOverrides;instance?:boolean;onChange:(path:string,value:number|string|undefined)=>void}){
 for(const field of recipeInputs(recipe)){
  const row=document.createElement('div');row.className='recipe-input';
  const label=document.createElement('label');label.className='field';const title=document.createElement('span');title.textContent=field.label;label.append(title);
  let input:HTMLInputElement|HTMLSelectElement;
  if(field.options){input=document.createElement('select');for(const value of field.options){const option=document.createElement('option');option.value=value;option.textContent=value==='patches'?'Clustered patches':value==='scattered'?'Even scatter':value;input.append(option);}}
  else{input=document.createElement('input');input.type=typeof field.value==='number'?'number':'text';if(field.min!==undefined)input.min=String(field.min);if(field.max!==undefined)input.max=String(field.max);input.step='any';}
  input.value=String(field.value);input.setAttribute('aria-label',field.label);input.disabled=!!options.disabled;
  input.onchange=()=>{if(!input.reportValidity())return;options.onChange(field.path,typeof field.value==='number'?Number(input.value):input.value);};label.append(input);row.append(label);
  if(options.instance){const inherited=recipeInputValue(options.overrides,field.path)===undefined;const reset=document.createElement('button');reset.type='button';reset.textContent=inherited?'Asset default':'Reset to asset default';reset.disabled=inherited||!!options.disabled;reset.setAttribute('aria-label','Reset '+field.label+' to asset default');reset.onclick=()=>options.onChange(field.path,undefined);row.append(reset);}
  host.append(row);
 }
}
