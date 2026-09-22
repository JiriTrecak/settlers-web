import {biomeById, biomeRecipes} from '../../content/biomes';
import type {WorldEditor} from '../world/worldEditor';
import {generationStage,resolveRecipe} from '../../shared/authoring/recipes';
import './scenePanel.css';
import {changeRecipeInput} from '../../shared/authoring/recipeInputs';
import {mountRecipeControls} from '../../ui/authoring/recipeControls';
import {ShapeOverlay} from './shapeOverlay';
import {SceneToolstrip,type AuthoringMode} from './sceneToolstrip';
import {createElement,Layers,Box,TreePine,Waves,Mountain,Paintbrush,Flag,Search,type IconNode} from 'lucide';
const escape=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** The hierarchy owns selection. Clicking a generated item selects its complete recipe layer. */
export class ScenePanel{
 private overlay:ShapeOverlay;
 private mode:AuthoringMode='select';
 private tools:SceneToolstrip;
 private filter:'all'|'layers'|'objects'='all';
 private collapsed=new Set<string>(['stamps','entities']);
 private inspectorKey='';
 private creationRecipe='';private drawingMode:'paint'|'line'|'curve'='paint';
 private onKey=(e:KeyboardEvent)=>{
  if((e.target as HTMLElement)?.matches('input,textarea,select'))return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&(this.editor.isPaintingLayer||this.editor.layers.selection)){
   e.preventDefault();e.stopImmediatePropagation();this.action(()=>this.editor.undoLayers(e.shiftKey));return;
  }
  if(e.key==='Escape'&&this.editor.isPaintingLayer){e.preventDefault();e.stopImmediatePropagation();this.action(()=>{this.editor.cancelLayerShape();this.editor.setTool('select');});return;}
  if(!this.editor.isDrawingLayer)return;
  if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.action(()=>e.key==='Enter'?this.editor.finishLayerShape():this.editor.cancelLayerShape());}
 };
 private left=document.createElement('aside');private right=document.createElement('aside');private search='';private error='';
 constructor(private host:HTMLElement,private editor:WorldEditor, private changed:()=>void, mcp:()=>void, environment:()=>void){
  window.addEventListener('keydown',this.onKey,true);
  host.classList.add('authoring-editor');this.left.className='scene-library';this.right.className='scene-inspector';
  this.left.setAttribute('aria-label','Scene hierarchy');this.right.setAttribute('aria-label','Scene inspector');
  this.tools=new SceneToolstrip(host,{mode:mode=>this.choose(mode),camera:mode=>{editor.authoringCamera(mode);this.sync();},undo:redo=>this.action(()=>editor.undoLayers(redo)),placement:scenery=>{if(scenery)editor.setAsset(biomeById(editor.map.biome).scenery.default);editor.setTool(scenery?'stamp':'entity');this.changed();this.sync();},mcp,environment});
  host.append(this.left,this.right);this.overlay=new ShapeOverlay(host,editor,message=>{this.error=message;this.sync();});this.sync();
 }
 setUtilities(mcp:boolean,environment:boolean){this.tools.utilities(mcp,environment);}
 private choose(mode:typeof this.mode){
  this.editor.pickStamp(null);
  this.mode=mode;this.creationRecipe='';this.drawingMode=mode==='water'?'curve':'paint';this.editor.cancelLayerShape();this.editor.layers.selection=null;this.editor.selectedEntity=null;
  this.editor.setTool(mode==='place'?'entity':mode==='terrain'?'terrain':mode==='spawn'?'spawn':'select');
  this.host.dataset.authoringTool=mode;
  if(['terrain','foliage','water'].includes(mode))this.editor.authoringCamera('top');
  this.changed();this.sync();
 }
 private action(fn:()=>void){try{fn();this.error='';}catch(e){this.error=e instanceof Error?e.message:String(e);}this.sync();}
 sync(){
  const state=this.editor.layers.scene,selection=this.editor.layers.selection,assets=this.editor.authoringAssets;
  const biome=biomeById(this.editor.map.biome),allowed=biomeRecipes(biome);
  const recipes=assets.filter(a=>a.recipe&&allowed.some(p=>p.id===a.id)),query=this.search.toLowerCase();
  if(this.editor.tool==='select'&&(selection||this.editor.selectedEntity||this.editor.selectedStamp())&&!this.editor.isPaintingLayer)this.mode='select';
  this.host.dataset.authoringTool=this.mode;
  const view=this.editor.view();this.tools.sync(this.mode,this.editor.layers.canUndo,this.editor.layers.canRedo,view.gameCam?'game':view.pitch>1.5?'top':'free',this.editor.tool==='stamp');
  const choices=this.mode==='water'?biome.rivers:this.mode==='terrain'?biome.landforms:biome.foliage;
  if(!choices.some(p=>p.id===this.creationRecipe))this.creationRecipe=choices[0]?.id??'';
  const layers=[...state.layers].sort((a,b)=>(generationStage[assets.find(v=>v.id===a.recipe)?.recipe?.type??'ground-cover']-generationStage[assets.find(v=>v.id===b.recipe)?.recipe?.type??'ground-cover'])||a.order-b.order);
  const scroll=this.left.querySelector('.scene-tree')?.scrollTop??0;
  const group=(id:string,label:string,count:number)=>`<details data-group="${id}" ${this.search||!this.collapsed.has(id)?'open':''}><summary>${label}<span>${count}</span></summary><div id="${id}"></div></details>`;
  this.left.innerHTML=`<header class="scene-library-header"><div class="scene-panel-title"><h2>Scene</h2><span>${this.editor.map.size} × ${this.editor.map.size}</span></div><p class="scene-biome">${escape(biome.name)}</p><div class="scene-search"><input aria-label="Search scene" placeholder="Find a layer or object…" value="${escape(this.search)}"/></div><div class="scene-filters" aria-label="Scene filter">${(['all','layers','objects']as const).map(f=>`<button data-filter="${f}" aria-pressed="${this.filter===f}">${f[0]!.toUpperCase()+f.slice(1)}</button>`).join('')}</div></header><div class="scene-tree">${this.filter!=='objects'?group('layers','Layers',state.layers.length):''}${this.filter!=='layers'?group('objects','Objects',state.objects.length)+group('stamps','Placed scenery',this.editor.map.stamps.length)+group('entities','Gameplay',this.editor.map.entities.length):''}</div>`;
  this.left.querySelector('.scene-search')!.prepend(createElement(Search,{width:15,height:15,'aria-hidden':'true'}));
  this.left.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(b=>b.onclick=()=>{this.filter=b.dataset.filter as typeof this.filter;this.sync();});
  this.left.querySelectorAll<HTMLDetailsElement>('[data-group]').forEach(d=>d.ontoggle=()=>{if(this.search||!d.isConnected)return;if(d.open)this.collapsed.delete(d.dataset.group!);else this.collapsed.add(d.dataset.group!);});
  const search=this.left.querySelector<HTMLInputElement>('input')!;search.oninput=()=>{const pos=search.selectionStart;this.search=search.value;this.sync();const next=this.left.querySelector<HTMLInputElement>('input')!;next.focus();next.setSelectionRange(pos,pos);};
  let matches=0;
  const row=(parent:string,label:string,meta:string,id:string,on:()=>void,active=false,icon:IconNode=Box)=>{
   const target=this.left.querySelector(parent);if(!target||query&&!`${label} ${meta} ${id}`.toLowerCase().includes(query))return;
   matches++;const b=document.createElement('button');b.type='button';b.className='scene-row'+(active?' active':'');b.title=label;b.setAttribute('aria-pressed',String(active));b.innerHTML=`<span class="scene-row-copy"><span>${escape(label)}</span><small>${escape(meta)}</small></span>`;b.prepend(createElement(icon,{width:16,height:16,'stroke-width':1.5,'aria-hidden':'true'}));b.onclick=()=>{this.mode='select';this.action(on);this.changed();};target.append(b);
  };
  const counts=new Map<string,number>();for(const o of this.editor.generatedScene?.objects??[])counts.set(o.owner,(counts.get(o.owner)??0)+1);
  for(const l of layers){const type=assets.find(a=>a.id===l.recipe)?.recipe?.type;row('#layers',l.name,`${l.locked?'Locked · ':''}${!l.enabled?'Disabled':counts.get(l.id)?`${counts.get(l.id)!.toLocaleString()} objects`:type==='terrain'?'Landform':type==='path'?'Ground surface':'Live layer'}`,l.id,()=>this.editor.selectLayer({kind:'layer',id:l.id}),selection?.kind==='layer'&&selection.id===l.id,type==='river'?Waves:type==='forest'?TreePine:type==='terrain'?Mountain:type==='path'?Paintbrush:Layers);}
  for(const o of state.objects)row('#objects',assets.find(a=>a.id===o.asset)?.name??o.asset,o.bakedFrom?'Baked object':'Placed object',o.id,()=>this.editor.selectLayer({kind:'object',id:o.id}),selection?.kind==='object'&&selection.id===o.id);
  for(const s of this.editor.map.stamps)row('#stamps',s.asset,s.id,s.id,()=>{this.editor.layers.selection=null;this.editor.setTool('select');this.editor.pickStamp(s.id);},this.editor.selectedStamp()?.id===s.id);
  for(const e of this.editor.map.entities)row('#entities',e.definition,e.id,e.id,()=>{this.editor.layers.selection=null;this.editor.setTool('select');this.editor.selectEntity(e.id);},this.editor.selectedEntity===e.id,Flag);
  if(!matches){const empty=document.createElement('p');empty.className='scene-empty';empty.textContent=this.search?'No matching layers or objects.':'Nothing here yet. Choose a tool below to start.';this.left.querySelector('.scene-tree')!.append(empty);}
  this.left.querySelector('.scene-tree')!.scrollTop=scroll;
  const layer=state.layers.find(l=>l.id===selection?.id),object=state.objects.find(o=>o.id===selection?.id),item=layer??object;
  this.right.hidden=!this.editor.isPaintingLayer&&((this.mode==='place'&&this.editor.tool!=='stamp')||['terrain','spawn'].includes(this.mode)||!!this.editor.selectedEntity||!!this.editor.selectedStamp());
  this.right.classList.toggle('is-empty',this.mode==='select'&&!item);
  const brush=this.editor.isPaintingLayer||(layer?.shape.type==='mask'&&!layer.locked);
  const creation=['foliage','water'].includes(this.mode);
  const scenery=assets.filter(a=>a.scenery&&biome.scenery.prefixes.some(p=>a.scenery!.startsWith(p)));
  const inspectorKey=`${this.mode}:${selection?.kind??''}:${selection?.id??''}`;
  const keepInspector=inspectorKey===this.inspectorKey,inspectorScroll=keepInspector?this.right.scrollTop:0;
  const openDetails=keepInspector?[...this.right.querySelectorAll('details')].map(d=>d.open):[];
  this.inspectorKey=inspectorKey;
  this.right.innerHTML=`${this.mode==='place'&&this.editor.tool==='stamp'?`<h2>Place scenery</h2><label>Asset<select id="place-asset">${scenery.map(a=>`<option value="${a.scenery}" ${a.scenery===this.editor.asset?'selected':''}>${escape(a.name)}</option>`).join('')}</select></label><p class="scene-note">Click once to place one object. R rotates. Use Select to move it afterward.</p>`:''}${creation?`<h2>${this.mode==='water'?'Water':'Foliage'}</h2><label>Preset<select id="recipe">${choices.map(p=>`<option value="${escape(p.id)}" ${p.id===this.creationRecipe?'selected':''}>${escape(p.name)}</option>`).join('')}</select></label>${this.mode==='water'?`<div class="scene-actions" aria-label="Water drawing mode">${(['paint','line','curve']as const).map(m=>`<button data-draw="${m}" aria-pressed="${m===this.drawingMode}">${m==='paint'?'Paint lake':m==='line'?'Line':'Curve'}</button>`).join('')}</div>`:''}<button id="add">${this.mode==='foliage'||this.drawingMode==='paint'?'New painted layer':'Draw river'}</button><p class="scene-note">${this.mode==='water'?'Banks and water details follow the selected biome preset automatically.':'Paint broad strokes. Trees and grass avoid water and structures.'}</p>`:''}
  ${brush?`<h2>Paint</h2><div class="scene-actions" aria-label="Brush operation"><button id="paint-add" aria-pressed="${this.editor.layerBrushOperation==='add'}">Add</button><button id="paint-subtract" aria-pressed="${this.editor.layerBrushOperation==='subtract'}">Subtract</button></div><label>Size <output id="brush-size-label">${this.editor.layerBrushSize} m</output><input id="brush-size" aria-label="Brush size" type="range" min="1" max="128" step="1" value="${this.editor.layerBrushSize}"/></label><p class="scene-note">Drag to paint. Each stroke is one undo step. Shift temporarily subtracts.</p>${this.editor.isPaintingLayer?'<button id="stop-paint">Done painting</button>':'<button id="resume-paint">Paint this layer</button>'}`:''}
  ${item||this.mode==='select'?`<h2>${layer?'Layer':object?'Object':'Inspector'}</h2>`:''}${item?`<div class="scene-actions"><button id="lock">${item.locked?'Unlock':'Lock'}</button><button id="delete" ${item.locked?'disabled':''}>Delete</button></div>`:this.mode==='select'?'<p class="scene-note">Select a layer, object or unit.</p>':''}
  ${layer?`<label>Name<input id="name" value="${escape(layer.name)}"/></label><label>Recipe<select id="layer-recipe">${recipes.filter(a=>a.recipe?.type===assets.find(v=>v.id===layer.recipe)?.recipe?.type).map(a=>`<option value="${escape(a.id)}" ${a.id===layer.recipe?'selected':''}>${escape(a.name)}</option>`).join('')}</select></label><label><input id="enabled" type="checkbox" ${layer.enabled?'checked':''}/> Generate this layer</label><label><input id="visible" type="checkbox" ${layer.visible?'checked':''}/> Show generated objects</label>${layer.shape.type==='spline'?'<button id="shape">Redraw course</button><p class="scene-note">Drag anchors and handles in Top down view to edit the course.</p>':''}${this.editor.generatedScene?.scatterLayers.includes(layer.id)?`<button id="bake" ${layer.locked?'disabled':''}>Bake whole layer</button>`:''}<details><summary>Generation settings</summary><label>Seed<input id="seed" type="number" min="0" max="4294967295" value="${layer.seed}"/></label><div id="recipe-inputs"></div></details>`:''}
  ${object?`<h3 class="scene-section-label">Transform</h3><div class="scene-transform">${([['x','X position',object.x],['z','Z position',object.z],['elevation','Elevation',object.elevation],['yaw','Rotation °',object.yaw*180/Math.PI],['scale','Scale',object.scale]]as const).map(([key,label,value])=>`<label>${label}<input data-transform="${key}" aria-label="${label}" type="number" step="${key==='yaw'?5:.1}" ${key==='scale'?'min="0.01"':''} value="${Number(value.toFixed(2))}" ${object.locked?'disabled':''}/></label>`).join('')}</div><details><summary>Advanced object data</summary><textarea id="object-json" aria-label="Object JSON" spellcheck="false" ${object.locked?'disabled':''}>${escape(JSON.stringify(object,null,2))}</textarea><button id="apply-object" ${object.locked?'disabled':''}>Apply object</button></details>`:''}<p class="scene-error" role="status">${escape(this.error)}</p><p class="scene-note">${this.editor.generatedScene?.objects.length??0} generated objects · ${this.editor.generatedScene?.rivers.length??0} water bodies</p>${(this.editor.generatedScene?.issues??[]).map(i=>`<p class="scene-error">${escape(i.message)}</p>`).join('')}`;
  this.right.querySelector<HTMLSelectElement>('#place-asset')?.addEventListener('change',e=>this.editor.setAsset((e.target as HTMLSelectElement).value));
  this.right.querySelector<HTMLSelectElement>('#recipe')?.addEventListener('change',e=>{this.creationRecipe=(e.target as HTMLSelectElement).value;});
  this.right.querySelectorAll<HTMLButtonElement>('[data-draw]').forEach(b=>b.onclick=()=>{this.drawingMode=b.dataset.draw as typeof this.drawingMode;this.sync();});
  this.right.querySelector('#add')?.addEventListener('click',()=>this.action(()=>{
    const id=this.creationRecipe,name=choices.find(p=>p.id===id)?.name??id;
    if(this.mode==='foliage'||this.drawingMode==='paint')this.editor.beginLayerPaint(id,name);
    else this.editor.beginNewLayer(id,name,this.drawingMode);
  }));
  for(const operation of ['add','subtract']as const)this.right.querySelector('#paint-'+operation)?.addEventListener('click',()=>this.action(()=>{this.editor.layerBrushOperation=operation;if(!this.editor.isPaintingLayer&&layer)this.editor.beginLayerPaint(layer.recipe,layer.name,layer.id);}));
  const size=this.right.querySelector<HTMLInputElement>('#brush-size');if(size)size.oninput=()=>{this.editor.layerBrushSize=Number(size.value);this.right.querySelector('#brush-size-label')!.textContent=size.value+' m';};
  this.right.querySelector('#resume-paint')?.addEventListener('click',()=>this.action(()=>{if(layer)this.editor.beginLayerPaint(layer.recipe,layer.name,layer.id);}));
  this.right.querySelector('#stop-paint')?.addEventListener('click',()=>this.action(()=>{this.editor.cancelLayerShape();this.editor.setTool('select');}));
  if(this.editor.isDrawingLayer){const notice=document.createElement('div');notice.className='drawing-notice';notice.innerHTML='<strong>Drawing · click points on the map</strong><p>Enter to finish · Escape to cancel</p><button id="complete-drawing">Finish</button><button id="cancel-drawing">Cancel</button>';this.right.prepend(notice);notice.querySelector('#complete-drawing')!.addEventListener('click',()=>this.action(()=>this.editor.finishLayerShape()));notice.querySelector('#cancel-drawing')!.addEventListener('click',()=>this.action(()=>this.editor.cancelLayerShape()));}
  const click=(id:string,fn:()=>void)=>this.right.querySelector(id)?.addEventListener('click',()=>this.action(fn));
  if(item){click('#lock',()=>this.editor.lockLayerSelection(!item.locked));click('#delete',()=>this.editor.removeLayerSelection());}
  if(layer){
   const defaults=assets.find(a=>a.id===layer.recipe)?.recipe;
   if(defaults)mountRecipeControls(this.right.querySelector<HTMLElement>('#recipe-inputs')!,resolveRecipe(defaults,layer.overrides),{instance:true,overrides:layer.overrides,disabled:layer.locked,onChange:(path,value)=>this.action(()=>{
    const overrides=changeRecipeInput(layer.overrides??{type:defaults.type},path,value);
    this.editor.putLayer({...layer,overrides:Object.keys(overrides).length>1?overrides:undefined});
   })});
   for(const [id,key]of [['name','name'],['seed','seed'],['enabled','enabled'],['visible','visible'],['layer-recipe','recipe']] as const){const input=this.right.querySelector<HTMLInputElement>('#'+id)!;input.disabled=layer.locked;input.onchange=()=>this.action(()=>this.editor.putLayer({...layer,...(key==='recipe'?{overrides:undefined}:{}),[key]:key==='seed'?Number(input.value):['enabled','visible'].includes(key)?input.checked:input.value}));}
   click('#shape',()=>this.editor.beginLayerShape(layer.id));click('#finish',()=>this.editor.finishLayerShape());click('#cancel',()=>this.editor.cancelLayerShape());click('#bake',()=>this.editor.bakeSelectedLayer());
  }
  if(object)this.right.querySelectorAll<HTMLInputElement>('[data-transform]').forEach(input=>input.onchange=()=>this.action(()=>{const key=input.dataset.transform!;this.editor.putAuthoredObject({...object,[key]:Number(input.value)*(key==='yaw'?Math.PI/180:1)});}));
  if(object)click('#apply-object',()=>this.editor.putAuthoredObject(JSON.parse(this.right.querySelector<HTMLTextAreaElement>('#object-json')!.value)));
  this.right.querySelectorAll('details').forEach((d,i)=>d.open=openDetails[i]??false);
  this.right.scrollTop=inspectorScroll;
 }
 destroy(){window.removeEventListener('keydown',this.onKey,true);this.overlay.destroy();this.host.classList.remove('authoring-editor');this.left.remove();this.right.remove();this.tools.destroy();}
}
