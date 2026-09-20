import './style.css';
import {mountRecipeControls} from '../../../src/ui/authoring/recipeControls';
import {changeRecipeInput} from '../../../src/shared/authoring/recipeInputs';
import {resolveRecipe,recipeOverridesSchema} from '../../../src/shared/authoring/recipes';
import {ASSET_KINDS,FILE_ROLES,ROLE_FORMATS,assetDefinitionSchema,type AssetDefinition,type FileRole} from '../../../src/shared/authoring/asset';
import {ProductionPreview,previewMaps,resourceUrl,type PreviewSettings} from './preview';
const escape=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const root=document.querySelector<HTMLElement>('#asset-editor')!;
root.innerHTML=`<header class="topbar"><strong>UNDER THE CANOPY</strong><small>/ Asset editor</small><span class="spacer"></span><a href="/">Image generation studio ↗</a><button id="new">＋ New asset</button></header><aside class="library"><header><input id="search" aria-label="Search assets" placeholder="Search assets…"/></header><div id="assets"></div></aside><main class="viewport"><div class="empty"><h2>Your world, one asset at a time.</h2><p>Select an asset to inspect it.</p></div></main><aside class="inspector"><p class="muted">Select an asset from the library.</p></aside><footer class="status" role="status">Loading authoring library…</footer>`;
const library=root.querySelector<HTMLElement>('#assets')!,inspector=root.querySelector<HTMLElement>('.inspector')!,viewport=root.querySelector<HTMLElement>('.viewport')!,status=root.querySelector<HTMLElement>('.status')!;
let token='',assets:AssetDefinition[]=[],selected:AssetDefinition|undefined,preview:ProductionPreview|undefined,selectionEpoch=0,releaseRevision:number|null=null;
let settings:PreviewSettings={mode:'single',map:previewMaps.find(m=>m.id.endsWith('/texture-test-1.utcmap'))?.id??previewMaps[0]?.id??'',x:128,z:128,elevation:0,yaw:0,scale:1,hour:12,view:'free'};
function message(text:string,error=false){status.textContent=text;status.classList.toggle('error',error);}
async function command(op:Record<string,unknown>){const res=await fetch('/__studio/authoring',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':token},body:JSON.stringify(op)});const data=await res.json();if(!res.ok)throw Error(data.error??'Request failed');return data;}
function work(fn:()=>Promise<void>){void fn().catch(e=>message(e instanceof Error?e.message:String(e),true));}
function renderLibrary(){
 const search=root.querySelector<HTMLInputElement>('#search')!.value.toLowerCase();library.replaceChildren();
 for(const kind of ASSET_KINDS){const items=assets.filter(a=>a.status!=='archived'&&a.kind===kind&&[a.name,a.id,...a.tags].join(' ').toLowerCase().includes(search));if(!items.length)continue;
  const group=document.createElement('details');group.open=!!search||items.some(a=>a.id===selected?.id)||['tree','foliage','building','unit'].includes(kind);const summary=document.createElement('summary');summary.textContent=`${kind.replaceAll('-',' ')} · ${items.length}`;group.append(summary);
  for(const asset of items){const button=document.createElement('button');button.className='asset-row'+(selected?.id===asset.id?' active':'');button.innerHTML=`${escape(asset.name)}<small>${asset.resources.length} files · ${asset.status}</small>`;button.onclick=()=>work(()=>choose(asset));group.append(button);}library.append(group);
 }
}
function field(label:string,key:string,value:string|number,type='text'){return `<label class="field"><span>${escape(label)}</span><input data-field="${key}" type="${type}" value="${escape(value)}" ${type==='number'?'step="any"':''}/></label>`;}
function previewFields(){return `<section class="section"><h3>Preview placement</h3>${field('X','preview.x',settings.x,'number')}${field('Z','preview.z',settings.z,'number')}${field('Height offset','preview.elevation',settings.elevation,'number')}${field('Rotation °','preview.yaw',settings.yaw,'number')}${field('Scale','preview.scale',settings.scale,'number')}${field('Time of day','preview.hour',settings.hour,'number')}<p class="footer-note">Placement changes affect this preview only. A map starts at Player 1; move the asset to test its fit along water and terrain.</p></section>`;}
function inspectorView(){
 if(!selected)return;const a=selected;
 inspector.innerHTML=`<h2>${escape(a.name)}</h2><span class="badge">${escape(a.kind)}</span><span class="badge">revision ${a.revision}</span><span class="badge">${releaseRevision===null?'Not in runtime':'Runtime revision '+releaseRevision}</span>${field('Name','name',a.name)}${field('Tags','tags',a.tags.join(', '))}<div class="controls"><button class="primary" id="save">Save definition</button><button id="validate">Validate</button><button id="publish">Save & publish</button><button id="archive" ${releaseRevision===null?'disabled':''}>Archive</button></div>
 ${a.usesGeometry?`<section class="section"><h3>Model transform</h3>${field('Asset scale','transform.scale',a.transform.scale,'number')}${a.transform.pivot.map((v,i)=>field('Pivot '+['X','Y','Z'][i],'transform.pivot.'+i,v,'number')).join('')}<label class="field"><span>Source forward</span><select data-field="transform.forward">${['+Z','-Z'].map(v=>`<option ${v===a.transform.forward?'selected':''}>${v}</option>`).join('')}</select></label><label class="field"><span>Ground contact</span><select data-field="ground-mode"><option value="" ${a.capabilities.groundContact?'':'selected'}>Imported default</option>${['pivot','terrain','water','free'].map(v=>`<option ${v===a.capabilities.groundContact?.mode?'selected':''}>${v}</option>`).join('')}</select></label><p class="footer-note">Pivot uses unscaled source coordinates. Pivot/free preserve that anchor; terrain aligns the source bottom before applying the pivot. Placement scale multiplies asset scale once.</p></section>`:''}
 ${a.capabilities.wind?`<section class="section"><h3>Wind</h3>${field('Strength','capabilities.wind.strength',a.capabilities.wind.strength,'number')}${field('Speed','capabilities.wind.speed',a.capabilities.wind.speed,'number')}${field('Stiffness','capabilities.wind.stiffness',a.capabilities.wind.stiffness,'number')}</section>`:''}
 ${a.water?`<section class="section"><h3>Water appearance</h3>${Object.entries(a.water).map(([k,v])=>field(k,'water.'+k,v,typeof v==='number'?'number':'color')).join('')}</section>`:''}
 ${a.recipe?`<section class="section"><h3>Recipe defaults · ${escape(a.recipe.type)}</h3><p class="footer-note">New layers inherit these settings. Map layers can override individual inputs. Density is relative to placement spacing; minimum separation still applies.</p><div id="recipe-defaults"></div></section>`:''}
 <section class="section"><h3>Canonical files</h3>${a.resources.map(r=>`<div class="resource">${escape(r.role)}${r.index===1?'':' '+r.index}<small>${escape(r.format.toUpperCase())} · ${(r.bytes/1024).toFixed(1)} KB · ${escape(r.sha256.slice(0,10))}</small></div>`).join('')||'<p class="muted">No files yet. Upload by role below.</p>'}<label class="field"><span>Upload role</span><select id="role">${FILE_ROLES.map(role=>`<option>${role}</option>`).join('')}</select></label><label class="field"><span>Sequence</span><input id="sequence" type="number" value="1" min="1" max="1024"/></label><input id="upload" type="file" style="width:100%"/><p class="footer-note">Files are named by role automatically. Uploading an existing role and sequence replaces that resource.</p></section>
 ${a.usesGeometry||a.recipe||a.water?previewFields():''}<details class="section"><summary>Definition / advanced</summary><textarea id="definition" spellcheck="false">${escape(JSON.stringify(a,null,2))}</textarea><button id="apply-json">Apply validated definition</button></details>`;
 if(a.recipe)mountRecipeControls(inspector.querySelector<HTMLElement>('#recipe-defaults')!,a.recipe,{onChange:(path,value)=>{try{
  const patch=recipeOverridesSchema.parse(changeRecipeInput({type:a.recipe!.type},path,value));
  const recipe=resolveRecipe(a.recipe!,patch);selected={...selected!,recipe};inspectorView();message('Unsaved recipe defaults');work(updatePreview);
 }catch(e){message(e instanceof Error?e.message:String(e),true);}}});
 inspector.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-field]').forEach(input=>input.addEventListener('change',()=>{
  const key=input.dataset.field!,value=input.type==='number'?Number(input.value):input.value;
  if(key.startsWith('preview.')){(settings as unknown as Record<string,unknown>)[key.slice(8)]=value;work(updatePreview);return;}
  if(key==='ground-mode'){const next=structuredClone(selected!);next.capabilities.groundContact=value?{mode:value as 'pivot'|'terrain'|'water'|'free'}:undefined;selected=assetDefinitionSchema.parse(next);message('Unsaved ground contact');work(updatePreview);return;}
  try{
   const next=structuredClone(selected!),keys=key.split('.');let object:Record<string,unknown>=next as unknown as Record<string,unknown>;
   for(const k of keys.slice(0,-1))object=object[k] as Record<string,unknown>;
   object[keys.at(-1)!]=key==='tags'?String(value).split(',').map(v=>v.trim()).filter(Boolean):value;
   if(key.startsWith('transform.pivot.'))next.capabilities.groundContact={...next.capabilities.groundContact,mode:'pivot'};
   selected=assetDefinitionSchema.parse(next);message('Unsaved definition changes');
   if(key.startsWith('transform.pivot.'))inspectorView();
   if(selected.usesGeometry||selected.recipe||selected.water)work(updatePreview);
  }catch(e){inspectorView();message(e instanceof Error?e.message:String(e),true);}
 }));
 inspector.querySelector('#save')!.addEventListener('click',()=>work(save));
 inspector.querySelector('#publish')!.addEventListener('click',()=>work(async()=>{await save();const result=await command({op:'asset.publish',id:selected!.id,expectedRevision:selected!.revision});releaseRevision=result.revision;replace(result);await renderPreview();message('Published. Reload the game or map editor when ready to use this revision.');}));
 inspector.querySelector('#archive')!.addEventListener('click',()=>work(async()=>{const result=await command({op:'asset.archive',id:a.id,expectedRevision:a.revision});releaseRevision=null;replace(result);message('Archived from runtime. The authored files are retained.');}));
 inspector.querySelector('#validate')!.addEventListener('click',()=>work(async()=>{await command({op:'asset.validate',id:a.id});message(`Validated ${a.resources.length} resource hashes for ${a.name}`);}));
 inspector.querySelector('#apply-json')!.addEventListener('click',()=>work(async()=>{const parsed=assetDefinitionSchema.parse(JSON.parse(inspector.querySelector<HTMLTextAreaElement>('#definition')!.value));if(parsed.id!==a.id)throw Error('Asset IDs are immutable');selected=parsed;await save();}));
 inspector.querySelector<HTMLInputElement>('#upload')!.onchange=e=>work(async()=>{
  const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;const role=inspector.querySelector<HTMLSelectElement>('#role')!.value as FileRole,index=Number(inspector.querySelector<HTMLInputElement>('#sequence')!.value),format=file.name.split('.').at(-1)!.toLowerCase().replace(/^jpg$/,'jpeg');
  if(!ROLE_FORMATS[role].includes(format))throw Error(`Choose ${ROLE_FORMATS[role].join(', ')} for ${role}`);if(file.size>50*1024*1024)throw Error('Maximum upload is 50 MiB');
  const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]!);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
  const result=await command({op:'asset.upload',id:a.id,expectedRevision:a.revision,role,index,format,base64});replace(result);await renderPreview();message(`${role} uploaded with a canonical filename`);
 });
}
function replace(asset:AssetDefinition){selected=asset;assets=assets.map(a=>a.id===asset.id?asset:a);inspectorView();renderLibrary();}
async function save(){if(!selected)return;const result=await command({op:'asset.save',definition:assetDefinitionSchema.parse(selected),expectedRevision:selected.revision});replace(result);message('Definition saved. Runtime publication is separate.');}
async function updatePreview(){if(!selected||!preview)return;await preview.show(assetDefinitionSchema.parse(selected),settings);}
async function renderPreview(){
 const a=selected;if(!a)return;preview?.dispose();preview=undefined;viewport.replaceChildren();
 if(a.usesGeometry||a.recipe||a.water){
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-label','Production renderer asset preview');viewport.append(canvas);
  const toolbar=document.createElement('div');toolbar.className='preview-toolbar';toolbar.innerHTML=`<select aria-label="Preview arrangement" id="mode"><option value="single">Single asset</option>${a.kind==='tree'?'<option value="clump">Tree clump</option>':''}${['foliage','tree'].includes(a.kind)?'<option value="patch">Foliage patch</option>':''}${['unit','creature'].includes(a.kind)?'<option value="formation">Formation</option>':''}<option value="map">Custom map</option></select><select aria-label="Preview map" id="map">${previewMaps.map(m=>`<option value="${escape(m.id)}">${escape(m.name)}</option>`).join('')}</select><select aria-label="Preview camera" id="view"><option value="free">Free camera</option><option value="game">Game camera</option><option value="top">Top down</option></select><button id="fit">Fit asset</button><button id="capture">Capture</button>`;viewport.append(toolbar);
  const hint=document.createElement('div');hint.className='preview-hint';hint.textContent='Game renderer · Drag to pan · Right-drag to orbit · Scroll to zoom · Shift-click to place';viewport.append(hint);
  preview=new ProductionPreview(canvas,assets,(x,z)=>{settings.x=Math.round(x*100)/100;settings.z=Math.round(z*100)/100;inspectorView();work(updatePreview);});
  for(const key of ['mode','map','view'] as const){const select=toolbar.querySelector<HTMLSelectElement>('#'+key)!;select.value=settings[key];select.onchange=()=>work(async()=>{(settings as unknown as Record<string,string>)[key]=select.value;if(key==='map'||key==='mode'&&settings.mode==='map'){const map=await previewMaps.find(m=>m.id===settings.map)?.load(),start=map?.playerStarts.find(p=>p.player===1);if(start){settings.x=start.x;settings.z=start.z;}}inspectorView();await updatePreview();});}
  toolbar.querySelector('#fit')!.addEventListener('click',()=>preview?.fit());
  toolbar.querySelector('#capture')!.addEventListener('click',()=>preview?.capture());await updatePreview();
 }else{
  const image=a.resources.find(r=>['image','albedo','preview'].includes(r.role));
  if(image){const img=document.createElement('img');img.className='image-preview';img.alt=a.name;img.src=resourceUrl(a,image.role,image.index);viewport.append(img);}
  else{const code=document.createElement('pre');code.className='data-preview';code.textContent=JSON.stringify(a.recipe??a.water??a,null,2);viewport.append(code);}
 }
}
async function choose(asset:AssetDefinition){const epoch=++selectionEpoch;message('Loading '+asset.name+'…');const fresh=await command({op:'asset.get',id:asset.id});if(epoch!==selectionEpoch)return;const publication=await command({op:'asset.publication',id:asset.id});if(epoch!==selectionEpoch)return;releaseRevision=publication.revision;selected=fresh;settings={...settings,mode:'single',x:128,z:128,elevation:0,yaw:0,scale:1};renderLibrary();inspectorView();await renderPreview();if(epoch===selectionEpoch)message(`${asset.name} · ${asset.id}`);}
root.querySelector('#search')!.addEventListener('input',renderLibrary);
root.querySelector('#new')!.addEventListener('click',()=>{
 const dialog=document.createElement('dialog');dialog.innerHTML=`<form><h2>Create an asset</h2><label>Name<input name="name" required placeholder="Ancient pine"/></label><label>Stable ID<input name="id" required pattern="[a-zA-Z0-9][a-zA-Z0-9._-]*" placeholder="tree.ancient-pine"/></label><label>Type<select name="kind">${ASSET_KINDS.map(k=>`<option>${k}</option>`).join('')}</select></label><div class="controls"><button type="button" id="cancel">Cancel</button><button class="primary">Create draft</button></div></form>`;document.body.append(dialog);dialog.querySelector('#cancel')!.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>dialog.remove());dialog.querySelector('form')!.onsubmit=e=>{e.preventDefault();work(async()=>{
  const data=new FormData(e.target as HTMLFormElement),kind=String(data.get('kind'));const water=kind==='water-profile'?{shallowColor:'#657863',deepColor:'#203b42',clarity:2,rippleScale:.15,rippleStrength:.05,foamStrength:.3,reflectionStrength:.4,causticStrength:.2,cloudStrength:.03,flowSpeed:1}:undefined;
  const recipe=kind==='landscape-recipe'?{type:'terrain',operation:'raise',height:2,falloff:5}:undefined;
  const a=assetDefinitionSchema.parse({version:1,id:data.get('id'),name:data.get('name'),kind,revision:1,status:'draft',resources:[],usesGeometry:false,water,recipe,provenance:{method:'authored'}});
  const saved=await command({op:'asset.create',definition:a});assets.push(saved);dialog.close();await choose(saved);
 });};dialog.showModal();
});
work(async()=>{const res=await fetch('/__studio/bootstrap'),bootstrap=await res.json();token=bootstrap.token;assets=await command({op:'asset.list'});renderLibrary();message(`${assets.length} assets · Canonical authoring library`);const initial=assets.find(a=>a.name==='Reference · fir a')??assets.find(a=>a.kind==='tree');if(initial)await choose(initial);});
window.addEventListener('beforeunload',()=>preview?.dispose());
