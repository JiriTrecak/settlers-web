import type {WorldEditor} from '../world/worldEditor';
import {proceduralLayerSchema} from '../../shared/authoring/layers';
import {generationStage,resolveRecipe} from '../../shared/authoring/recipes';
import './scenePanel.css';
import {changeRecipeInput} from '../../shared/authoring/recipeInputs';
import {mountRecipeControls} from '../../ui/authoring/recipeControls';
import {ShapeOverlay} from './shapeOverlay';
const escape=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** The hierarchy owns selection. Clicking a generated item selects its complete recipe layer. */
export class ScenePanel{
 private overlay:ShapeOverlay;
 private left=document.createElement('aside');private right=document.createElement('aside');private toolbar=document.createElement('div');private search='';private error='';
 constructor(private host:HTMLElement,private editor:WorldEditor){
  host.classList.add('authoring-editor');this.left.className='scene-library';this.right.className='scene-inspector';this.toolbar.className='scene-camera';
  this.left.setAttribute('aria-label','Scene hierarchy');this.right.setAttribute('aria-label','Scene inspector');
  for(const [mode,label]of [['top','Top down'],['game','Game'],['free','Free']] as const){const b=document.createElement('button');b.textContent=label;b.onclick=()=>editor.authoringCamera(mode);this.toolbar.append(b);}
  host.append(this.left,this.right,this.toolbar);this.overlay=new ShapeOverlay(host,editor,message=>{this.error=message;this.sync();});this.sync();
 }
 private action(fn:()=>void){try{fn();this.error='';}catch(e){this.error=e instanceof Error?e.message:String(e);}this.sync();}
 sync(){
  const state=this.editor.layers.scene,selection=this.editor.layers.selection,assets=this.editor.authoringAssets;
  const recipes=assets.filter(a=>a.recipe),query=this.search.toLowerCase();
  const layers=[...state.layers].sort((a,b)=>(generationStage[assets.find(v=>v.id===a.recipe)?.recipe?.type??'ground-cover']-generationStage[assets.find(v=>v.id===b.recipe)?.recipe?.type??'ground-cover'])||a.order-b.order);
  this.left.innerHTML=`<h2>Scene</h2><input aria-label="Search scene" placeholder="Search layers and objects" value="${escape(this.search)}"/><label>New procedural layer<select id="recipe">${recipes.map(a=>`<option value="${escape(a.id)}">${escape(a.name)}</option>`).join('')}</select></label><button id="add">＋ Add layer</button><div class="scene-history"><button id="undo" ${!this.editor.layers.canUndo?'disabled':''}>Undo</button><button id="redo" ${!this.editor.layers.canRedo?'disabled':''}>Redo</button></div><h3>Procedural layers · ${state.layers.length}</h3><div id="layers"></div><h3>Independent objects · ${state.objects.length}</h3><div id="objects"></div><details><summary>Placed scenery · ${this.editor.map.stamps.length}</summary><div id="stamps"></div></details><details><summary>Gameplay entities · ${this.editor.map.entities.length}</summary><div id="entities"></div></details>`;
  const search=this.left.querySelector<HTMLInputElement>('input')!;search.oninput=()=>{const pos=search.selectionStart;this.search=search.value;this.sync();const next=this.left.querySelector<HTMLInputElement>('input')!;next.focus();next.setSelectionRange(pos,pos);};
  const row=(parent:string,label:string,meta:string,id:string,on:()=>void,active=false)=>{if(query&&!`${label} ${meta} ${id}`.toLowerCase().includes(query))return;const b=document.createElement('button');b.className='scene-row'+(active?' active':'');b.innerHTML=`${escape(label)}<small>${escape(meta)}</small>`;b.onclick=()=>this.action(on);this.left.querySelector(parent)!.append(b);};
  for(const l of layers)row('#layers',l.name,`${l.locked?'Locked · ':''}${l.enabled?'Live':'Disabled'} · ${this.editor.generatedScene?.objects.filter(o=>o.owner===l.id).length??0} objects`,l.id,()=>this.editor.selectLayer({kind:'layer',id:l.id}),selection?.id===l.id);
  for(const o of state.objects)row('#objects',assets.find(a=>a.id===o.asset)?.name??o.asset,o.bakedFrom?'Baked object':'Placed object',o.id,()=>this.editor.selectLayer({kind:'object',id:o.id}),selection?.id===o.id);
  for(const s of this.editor.map.stamps)row('#stamps',s.asset,s.id,s.id,()=>{this.editor.layers.selection=null;this.editor.setTool('select');this.editor.pickStamp(s.id);});
  for(const e of this.editor.map.entities)row('#entities',e.definition,e.id,e.id,()=>{this.editor.layers.selection=null;this.editor.setTool('select');this.editor.selectEntity(e.id);});
  this.left.querySelector('#add')!.addEventListener('click',()=>this.action(()=>{
   const recipe=assets.find(a=>a.id===this.left.querySelector<HTMLSelectElement>('#recipe')!.value)!;const view=this.editor.view(),x=view.x,z=view.z;
   const shape=['river','path'].includes(recipe.recipe!.type)?{type:'spline',knots:[{x:x-14,z:z-8,elevation:this.editor.map.waterLevel??0},{x:x+14,z:z+8,elevation:this.editor.map.waterLevel??0}]}:{type:'region',points:[{x:x-16,z:z-16},{x:x+16,z:z-16},{x:x+16,z:z+16},{x:x-16,z:z+16}]};
   this.editor.putLayer(proceduralLayerSchema.parse({id:'layer.'+crypto.randomUUID(),name:recipe.name,recipe:recipe.id,seed:1,shape}));this.editor.authoringCamera('top');
  }));
  this.left.querySelector('#undo')!.addEventListener('click',()=>this.action(()=>this.editor.undoLayers()));this.left.querySelector('#redo')!.addEventListener('click',()=>this.action(()=>this.editor.undoLayers(true)));
  const layer=state.layers.find(l=>l.id===selection?.id),object=state.objects.find(o=>o.id===selection?.id),item=layer??object;
  this.right.innerHTML=`<h2>${layer?'Layer':object?'Object':'Inspector'}</h2>${item?`<p class="scene-note">${escape(item.id)}</p><div class="scene-actions"><button id="lock">${item.locked?'Unlock':'Lock'}</button><button id="delete" ${item.locked?'disabled':''}>Delete</button></div>`:'<p class="scene-note">Select a layer, object or unit. Rivers shape the terrain before forests and ground cover grow.</p>'}${layer?`<label>Name<input id="name" value="${escape(layer.name)}"/></label><label>Recipe<select id="layer-recipe">${recipes.map(a=>`<option value="${escape(a.id)}" ${a.id===layer.recipe?'selected':''}>${escape(a.name)}</option>`).join('')}</select></label><label>Seed<input id="seed" type="number" min="0" max="4294967295" value="${layer.seed}"/></label><label><input id="enabled" type="checkbox" ${layer.enabled?'checked':''}/> Generate this layer</label><label><input id="visible" type="checkbox" ${layer.visible?'checked':''}/> Show generated objects</label><div class="scene-actions"><button id="shape">Draw new ${layer.shape.type==='spline'?'course':'outline'}</button><button id="finish">Finish drawing</button><button id="cancel">Cancel drawing</button></div><p class="scene-note">Click points in the top-down viewport. Finish commits the complete shape as one undo step.</p><button id="bake" ${item?.locked?'disabled':''}>Bake whole layer</button><h3>Recipe inputs</h3><p class="scene-note">Values inherit the asset defaults until you change them here. Density remains constrained by minimum separation and available ground.</p><div id="recipe-inputs"></div><h3>Shape and elevation</h3><p class="scene-note">Spline knots carry absolute elevation, width, depth and flow multipliers. Incoming / outgoing handles use world X and Z.</p><textarea id="shape-json" spellcheck="false">${escape(JSON.stringify(layer.shape,null,2))}</textarea><button id="apply-shape">Apply shape</button>`:''}${object?`<textarea id="object-json" spellcheck="false">${escape(JSON.stringify(object,null,2))}</textarea><button id="apply-object">Apply object</button>`:''}<p class="scene-error" role="status">${escape(this.error)}</p><h3>Generation</h3><p class="scene-note">${this.editor.generatedScene?.objects.length??0} generated objects · ${this.editor.generatedScene?.rivers.length??0} watercourses</p>${(this.editor.generatedScene?.issues??[]).map(i=>`<p class="scene-error">${escape(i.message)}</p>`).join('')}`;
  const click=(id:string,fn:()=>void)=>this.right.querySelector(id)?.addEventListener('click',()=>this.action(fn));
  if(item){click('#lock',()=>this.editor.lockLayerSelection(!item.locked));click('#delete',()=>this.editor.removeLayerSelection());}
  if(layer){
   const defaults=assets.find(a=>a.id===layer.recipe)?.recipe;
   if(defaults)mountRecipeControls(this.right.querySelector<HTMLElement>('#recipe-inputs')!,resolveRecipe(defaults,layer.overrides),{instance:true,overrides:layer.overrides,disabled:layer.locked,onChange:(path,value)=>this.action(()=>{
    const overrides=changeRecipeInput(layer.overrides??{type:defaults.type},path,value);
    this.editor.putLayer({...layer,overrides:Object.keys(overrides).length>1?overrides:undefined});
   })});
   for(const [id,key]of [['name','name'],['seed','seed'],['enabled','enabled'],['visible','visible'],['layer-recipe','recipe']] as const){const input=this.right.querySelector<HTMLInputElement>('#'+id)!;input.disabled=layer.locked;input.onchange=()=>this.action(()=>this.editor.putLayer({...layer,...(key==='recipe'?{overrides:undefined}:{}),[key]:key==='seed'?Number(input.value):['enabled','visible'].includes(key)?input.checked:input.value}));}
   click('#shape',()=>this.editor.beginLayerShape(layer.id));click('#finish',()=>this.editor.finishLayerShape());click('#cancel',()=>this.editor.cancelLayerShape());click('#bake',()=>this.editor.bakeSelectedLayer());click('#apply-shape',()=>this.editor.putLayer({...layer,shape:JSON.parse(this.right.querySelector<HTMLTextAreaElement>('#shape-json')!.value)}));
  }
  if(object)click('#apply-object',()=>this.editor.putAuthoredObject(JSON.parse(this.right.querySelector<HTMLTextAreaElement>('#object-json')!.value)));
 }
 destroy(){this.overlay.destroy();this.host.classList.remove('authoring-editor');this.left.remove();this.right.remove();this.toolbar.remove();}
}
