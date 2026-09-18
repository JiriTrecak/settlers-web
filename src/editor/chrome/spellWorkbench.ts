import {EFFECT_PRESETS,effectLayerSchema,type EffectLayer} from '../../content/effectLayers';
import {AmbientLight,DirectionalLight,GridHelper,Group,Mesh,MeshStandardMaterial,OrthographicCamera,PlaneGeometry,Scene,WebGLRenderer} from 'three';
import {builtinSource} from '../../content/builtin';
import {ContentRegistry,type ContentSource} from '../../content/registry';
import {spellVisualSchema,type SpellVisual} from '../../content/spells';
import {SpellEffects} from '../../render/settlement/spellEffects';
import {TICK_MS} from '../../shared/match/match';
import {HeightField} from '../../shared/map/height';
import type {VisualCue} from '../../sim/game/visualCues';

/** An isolated content draft, previewed by the exact gameplay effect renderer. */
export class SpellWorkbench {
 private readonly dialog=document.createElement('dialog');
 private readonly viewport=document.createElement('div');
 private readonly fields=document.createElement('div');
 private readonly status=document.createElement('p');
 private readonly chooser=document.createElement('select');
 private readonly rank=document.createElement('select');
 private readonly json=document.createElement('textarea');
 private readonly saveButton=document.createElement('button');
 private readonly applyButton:HTMLButtonElement;
 private editingLocked=true;
 private selectedLayer=0;
 get isOpen(){return !this.stopped;}
 private readonly textDrafts=new Map<string,string>();
 private readonly timeline=document.createElement('input');
 private readonly timeLabel=document.createElement('span');
 private source:ContentSource=structuredClone(builtinSource);
 private rules=new ContentRegistry(this.source).rules;
 private revision='';
 private readonly scene=new Scene();
 private readonly camera=new OrthographicCamera(-16,16,10,-10,.1,100);
 private readonly renderer=new WebGLRenderer({antialias:true,alpha:false});
 private readonly effects:SpellEffects;
 private readonly field=new HeightField();
 private readonly ground=new Mesh(new PlaneGeometry(60,60),new MeshStandardMaterial({color:0x28372b,roughness:1}));
 private readonly grid=new GridHelper(60,60,0x53604e,0x354637);
 private readonly resize:ResizeObserver;
 private frame=0;
 private start=performance.now();
 private paused=false;
 private age=0;
 private stopped=false;
 private looping=true;
 private phase:'cast'|'impact'|'sequence'='sequence';
 constructor(host:HTMLElement){
  this.dialog.style.cssText='box-sizing:border-box;margin:auto;width:min(1080px,95vw);max-height:94vh;overflow:auto;padding:24px;border:1px solid #69715b;border-radius:16px;background:#18181b;color:#e4e8d8;font:14px system-ui;pointer-events:auto';
  this.dialog.setAttribute('aria-label','Spell effects workbench');
  const heading=document.createElement('h2');heading.textContent='Spell effects · Layer studio';
  const help=document.createElement('p');help.textContent='Preview the same effects used in combat. Save writes the project declarations; reload the game to use them. Switching abilities keeps drafts. Closing discards unsaved changes.';
  const toolbar=document.createElement('div');toolbar.style.cssText='display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:16px 0';
  this.chooser.setAttribute('aria-label','Ability');this.rank.setAttribute('aria-label','Ability rank');
  const phase=document.createElement('select');phase.setAttribute('aria-label','Preview phase');
  for(const [value,label] of [['sequence','Cast + impact'],['cast','Cast telegraph'],['impact','Impact']])phase.add(new Option(label,value));
  phase.onchange=()=>{this.phase=phase.value as typeof this.phase;this.replay();};
  const replay=this.button('Replay',()=>this.replay());
  const pause=this.button('Pause',()=>{this.paused=!this.paused;pause.textContent=this.paused?'Resume':'Pause';this.start=performance.now()-this.age*TICK_MS;});
  const loop=document.createElement('input');loop.type='checkbox';loop.checked=true;loop.onchange=()=>this.looping=loop.checked;
  const loopLabel=document.createElement('label');loopLabel.append(loop,' Loop');
  toolbar.append(this.chooser,this.rank,phase,replay,pause,loopLabel);
  this.timeline.type='range';this.timeline.min='0';this.timeline.step='.1';this.timeline.setAttribute('aria-label','Preview time');this.timeline.style.width='180px';
  this.timeline.oninput=()=>{this.age=Number(this.timeline.value);this.paused=true;pause.textContent='Resume';this.start=performance.now()-this.age*TICK_MS;};
  toolbar.append(this.timeline,this.timeLabel);
  const layout=document.createElement('div');layout.style.cssText='display:grid;grid-template-columns:minmax(0,2fr) minmax(230px,1fr);gap:20px';
  this.viewport.style.cssText='height:clamp(200px,38vh,340px);min-width:0;border-radius:8px;overflow:hidden;background:#202024';
  this.fields.style.cssText='display:grid;gap:10px;align-content:start;max-height:55vh;overflow:auto;padding-right:8px';layout.append(this.viewport,this.fields);
  const jsonLabel=document.createElement('label');jsonLabel.textContent='Visual declaration (JSON)';
  this.json.setAttribute('aria-label','Visual declaration JSON');this.json.style.cssText='display:block;box-sizing:border-box;width:100%;height:100px;margin-top:8px;background:#101014;color:#cddbbc;padding:12px;font:12px monospace';jsonLabel.append(this.json);
  this.json.oninput=()=>{const id=this.rules.spells[this.chooser.value]?.visual;if(id)this.textDrafts.set(id,this.json.value);this.status.textContent='Unsaved JSON draft. Apply to preview.';};
  const apply=this.applyButton=this.button('Apply JSON draft',()=>{
   try{this.replaceVisual(spellVisualSchema.parse(JSON.parse(this.json.value)));this.renderFields();this.status.textContent='Draft applied to preview.';}catch(e){this.status.textContent=(e as Error).message;}
  });
  this.saveButton.textContent='Validate & save';this.saveButton.disabled=true;this.saveButton.onclick=()=>void this.save();
  const close=this.button('Close',()=>this.destroy());
  const footer=document.createElement('div');footer.style.cssText='display:flex;gap:10px;margin-top:16px';footer.append(apply,this.saveButton,close);
  this.status.setAttribute('role','status');
  this.dialog.append(heading,help,toolbar,layout,jsonLabel,this.status,footer);
  const style=document.createElement('style');style.textContent='dialog[aria-label="Spell effects workbench"] button,dialog[aria-label="Spell effects workbench"] select,dialog[aria-label="Spell effects workbench"] input {background:#303036;color:#e4e8d8;border:1px solid #647057;border-radius:5px;padding:5px 8px} dialog[aria-label="Spell effects workbench"] button:disabled {opacity:.4}';this.dialog.append(style);
  // Keep map shortcuts from acting through the modal (including Ctrl+S).
  this.dialog.addEventListener('keydown',e=>{e.stopPropagation();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();void this.save();}});
  this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.destroy();});
  host.append(this.dialog);
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setClearColor(0x202024);
  this.viewport.append(this.renderer.domElement);
  this.ground.rotation.x=-Math.PI/2;this.ground.position.set(128,-.03,128);this.scene.add(this.ground);
  this.grid.position.set(128,0,128);this.scene.add(this.grid);
  this.scene.add(new AmbientLight(0xffffff,2));const sun=new DirectionalLight(0xffe8ba,2);sun.position.set(120,30,135);this.scene.add(sun);
  this.camera.position.set(147,21,149);this.camera.lookAt(128,0,128);
  const root=new Group();this.scene.add(root);this.effects=new SpellEffects(root,()=>this.rules);
  this.resize=new ResizeObserver(()=>{const w=this.viewport.clientWidth,h=this.viewport.clientHeight;this.renderer.setSize(w,h);this.camera.left=-11*w/h;this.camera.right=11*w/h;this.camera.top=11;this.camera.bottom=-11;this.camera.updateProjectionMatrix();this.fitPreview();});this.resize.observe(this.viewport);
  this.chooser.onchange=()=>{this.populateRanks();this.renderFields();this.replay();};
  this.rank.onchange=()=>this.replay();this.populate();this.lockEdits(true);this.dialog.showModal();void this.load();this.animate();
 }
 private button(text:string,run:()=>void){const b=document.createElement('button');b.textContent=text;b.onclick=run;return b;}
 private populate(){
  const selected=this.chooser.value;this.chooser.replaceChildren();
  for(const [id,spell] of Object.entries(this.rules.spells))this.chooser.add(new Option(spell.name,id));
  if(this.rules.spells[selected])this.chooser.value=selected;
  this.populateRanks();this.renderFields();this.replay();
 }
 private populateRanks(){this.rank.replaceChildren();this.rules.spells[this.chooser.value]?.ranks.forEach((_,i)=>this.rank.add(new Option(`Rank ${i+1}`,String(i+1))));}
 private renderFields(){
  const scroll=this.fields.scrollTop;this.fields.replaceChildren();const spell=this.rules.spells[this.chooser.value];if(!spell)return;
  const visual=this.rules.spellVisuals[spell.visual];
  const title=document.createElement('strong');title.textContent=spell.visual;this.fields.append(title);
  const controls:[keyof SpellVisual,string,string,number?,number?,number?][]=[['color','Ring color','color'],['accent','Particle color','color'],['durationTicks','Impact duration (ticks)','number',1,200,1],['particles','Particle count','number',0,64,1],['particleSize','Particle size','number',.01,1,.01],['rise','Particle rise','number',0,10,.1]];
  for(const [key,name,type,min,max,step] of controls.filter(c=>!visual.layers||c[0]==='durationTicks')){const label=document.createElement('label');label.style.cssText='display:flex;justify-content:space-between;gap:12px';label.textContent=name;
   const input=document.createElement('input');input.disabled=this.editingLocked;input.type=type;input.value=String(visual[key]);input.setAttribute('aria-label',name);input.style.width='90px';if(min!==undefined)input.min=String(min);if(max!==undefined)input.max=String(max);if(step!==undefined)input.step=String(step);
   input.onchange=()=>{try{this.replaceVisual(spellVisualSchema.parse({...JSON.parse(this.json.value),[key]:type==='color'?input.value:Number(input.value)}));this.status.textContent='Unsaved visual draft.';}catch(e){input.value=String(visual[key]);this.status.textContent=`Fix the JSON draft first: ${(e as Error).message}`;}};
   label.append(input);this.fields.append(label);
  }
  this.json.value=this.textDrafts.get(spell.visual)??JSON.stringify(visual,null,2);
  this.renderLayers(visual);this.fields.scrollTop=scroll;
 }
 private editLayers(change:(layers:EffectLayer[])=>void){
  try{const v=spellVisualSchema.parse(JSON.parse(this.json.value));const layers=structuredClone(v.layers??[]);change(layers);
   this.replaceVisual(spellVisualSchema.parse({...v,layers,durationTicks:Math.max(v.durationTicks,...layers.filter(l=>l.phase==='impact').map(l=>l.delay+l.duration))}));
   this.renderFields();this.status.textContent='Unsaved layered effect. Preview uses the combat renderer.';
  }catch(e){this.status.textContent=(e as Error).message;}
 }
 private selectedPreset=Object.keys(EFFECT_PRESETS)[0]!;
 private renderLayers(visual:SpellVisual){
  const tools=document.createElement('div');tools.style.cssText='display:flex;gap:6px;flex-wrap:wrap;border-top:1px solid #657063;padding-top:12px';
  const preset=document.createElement('select');preset.setAttribute('aria-label','Effect preset');
  for(const name of Object.keys(EFFECT_PRESETS))preset.add(new Option(name,name));
  preset.value=this.selectedPreset;preset.onchange=()=>{this.selectedPreset=preset.value;};
  const use=this.button('Use preset',()=>this.editLayers(l=>{l.splice(0,l.length,...structuredClone(EFFECT_PRESETS[preset.value]));}));
  const add=this.button('Add layer',()=>this.editLayers(l=>{let n=1;while(l.some(x=>x.id===`layer-${n}`))n++;l.push(effectLayerSchema.parse({id:`layer-${n}`,kind:'ring',color:visual.color,endColor:visual.accent}));}));
  add.disabled=(visual.layers?.length??0)>=8||this.editingLocked;use.disabled=this.editingLocked;
  tools.append(preset,use,add);this.fields.append(tools);
  const note=document.createElement('small');note.textContent='Up to 8 layers. Times are ticks (40/s). Presets replace this visual only, not spell mechanics. Texture masks are shared. Particle size is metres; shape size multiplies ability radius.';this.fields.append(note);
  for(const [index,l] of (visual.layers??[]).entries()){
   const card=document.createElement('details');card.open=index===this.selectedLayer;card.ontoggle=()=>{if(card.open)this.selectedLayer=index;};card.style.cssText='background:#242428;padding:8px;border:1px solid #435047;border-radius:6px';
   const summary=document.createElement('summary');summary.textContent=`${index+1}. ${l.id} · ${l.kind} · ${l.phase}`;card.append(summary);
   const track=document.createElement('div');track.style.cssText='height:5px;background:#090e0b;margin:9px 0';
   const segment=document.createElement('div');segment.style.cssText=`height:100%;background:${l.color};margin-left:${l.delay/200*100}%;width:${l.duration/200*100}%`;track.append(segment);card.append(track);
   const edit=(key:keyof EffectLayer,value:unknown)=>this.editLayers(layers=>{layers[index]=effectLayerSchema.parse({...layers[index],[key]:value});});
   const controls=document.createElement('div');controls.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:6px';
   for(const [key,label] of [['enabled','Enabled'],['id','Name']] as const){
    const box=document.createElement('label');box.textContent=label;const input=document.createElement('input');input.setAttribute('aria-label',`${l.id} ${label}`);input.type=key==='enabled'?'checkbox':'text';input.value=l.id;input.checked=l.enabled;input.disabled=this.editingLocked;input.style.width=key==='id'?'95px':'auto';input.onchange=()=>edit(key,key==='enabled'?input.checked:input.value);box.append(input);controls.append(box);
   }
   const choices:Partial<Record<keyof EffectLayer,readonly string[]>>={kind:['ring','disc','sphere','particles'],phase:['cast','impact'],texture:['none','soft','rune','cracks','spark'],motion:['burst','rise','fall','orbit'],anchor:['target','origin'],blending:['normal','additive']};
   for(const [key,options] of Object.entries(choices)){
    const label=document.createElement('label');label.textContent=key;const select=document.createElement('select');select.setAttribute('aria-label',`${l.id} ${key}`);for(const value of options)select.add(new Option(value,value));select.value=String(l[key as keyof EffectLayer]);select.disabled=this.editingLocked;select.onchange=()=>edit(key as keyof EffectLayer,select.value);label.append(select);controls.append(label);
   }
   const numbers:[keyof EffectLayer,number,number,number][]=[['delay',0,199,1],['duration',1,200,1],['repeat',1,12,1],['opacity',0,1,.05],['fadeIn',0,.5,.01],['fadeOut',.01,1,.01],['size',.01,4,.01],['endSize',.01,4,.01],['spread',0,3,.1],['height',0,20,.1],['rotation',-360,360,5],['spin',-720,720,5],['count',1,128,1]];
   for(const [key,min,max,step] of numbers){
    const label=document.createElement('label');label.textContent=key;const input=document.createElement('input');input.type='number';input.style.width='70px';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(l[key]);input.disabled=this.editingLocked;input.setAttribute('aria-label',`${l.id} ${key}`);input.onchange=()=>edit(key,Number(input.value));label.append(input);controls.append(label);
   }
   for(const key of ['color','endColor'] as const){const label=document.createElement('label');label.textContent=key;const input=document.createElement('input');input.type='color';input.value=l[key];input.disabled=this.editingLocked;input.setAttribute('aria-label',`${l.id} ${key}`);input.onchange=()=>edit(key,input.value);label.append(input);controls.append(label);}
   const buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:4px;margin-top:8px';
   for(const [name,run,disabled] of [
    ['↑',()=>this.editLayers(a=>{[a[index-1],a[index]]=[a[index],a[index-1]];}),index===0],
    ['↓',()=>this.editLayers(a=>{[a[index+1],a[index]]=[a[index],a[index+1]];}),index===(visual.layers?.length??0)-1],
    ['Duplicate',()=>this.editLayers(a=>{let id=l.id+'-copy';while(a.some(x=>x.id===id))id+='2';a.splice(index+1,0,{...a[index],id});}),(visual.layers?.length??0)>=8],
    ['Remove',()=>this.editLayers(a=>{a.splice(index,1);}),false],
   ] as const){const button=this.button(name,run);button.setAttribute('aria-label',`${name} ${l.id}`);button.disabled=disabled||this.editingLocked;buttons.append(button);}
   card.append(controls,buttons);this.fields.append(card);
  }
 }
 private replaceVisual(visual:SpellVisual){
  const id=this.rules.spells[this.chooser.value].visual;
  const next=structuredClone(this.source);(next.rules as typeof this.rules).spellVisuals[id]=visual;
  const registry=new ContentRegistry(next);this.source=next;this.rules=registry.rules;this.json.value=JSON.stringify(visual,null,2);this.textDrafts.set(id,this.json.value);this.replay();
 }
 private fitPreview(){
  const spell=this.rules.spells[this.chooser.value];if(!spell)return;
  const r=spell.ranks[(Number(this.rank.value)||1)-1]!,visual=this.rules.spellVisuals[spell.visual];
  const layers=visual.layers?.filter(l=>l.enabled)??[],height=Math.max(1,...layers.map(l=>l.kind==='particles'||l.kind==='sphere'?l.height+Math.max(l.size,l.endSize):0));
  const width=Math.max(1,r.radius)*Math.max(1.5,...layers.map(l=>l.kind==='particles'?l.spread:Math.max(l.size,l.endSize)));
  const extent=Math.max(3,width*.9+height*.55),aspect=Math.max(1,this.viewport.clientWidth)/Math.max(1,this.viewport.clientHeight),centerY=height*.45;
  this.camera.left=-extent*aspect;this.camera.right=extent*aspect;this.camera.top=extent;this.camera.bottom=-extent;this.camera.updateProjectionMatrix();
  const x=spell.target==='self'?123:spell.effect==='line'?128:132;this.camera.position.set(x+19,centerY+21,149);this.camera.lookAt(x,centerY,128);
 }
 private replay(){this.effects.reset();this.age=0;this.start=performance.now();this.fitPreview();}
 private animate=()=>{
  if(this.stopped)return;this.frame=requestAnimationFrame(this.animate);
  if(document.hidden)return;
  const spell=this.rules.spells[this.chooser.value];if(!spell)return;
  const rank=Number(this.rank.value)||1,r=spell.ranks[rank-1],visual=this.rules.spellVisuals[spell.visual];
  const cast=this.phase==='impact'?0:r.castTicks,impact=this.phase==='cast'?0:visual.durationTicks,total=cast+impact;
  if(!this.paused)this.age=(performance.now()-this.start)/TICK_MS;
  if(this.looping&&this.age>total+28)this.replay();
  const self=spell.target==='self',origin={x:123,y:128},target=self?origin:{x:132,y:128};
  const base={ability:this.chooser.value,rank,origin,target,viewers:[]};
  const cues:VisualCue[]=[];
  if(cast&&this.age<cast)cues.push({...base,id:1,tick:0,phase:'cast',durationTicks:cast});
  if(impact&&this.age>=cast)cues.push({...base,id:2,tick:cast,phase:'impact',durationTicks:impact});
  this.timeline.max=String(total);this.timeline.value=String(Math.min(total,this.age));this.timeLabel.textContent=`${(Math.min(total,this.age)*TICK_MS/1000).toFixed(2)} s`;
  this.effects.update(cues,this.field,this.age);this.timeLabel.title=`${this.effects.stats.layers} layers · ${this.effects.stats.particles} particles · ${this.renderer.info.render.calls} draws`;this.renderer.render(this.scene,this.camera);
 };
 private lockEdits(locked:boolean){
  this.editingLocked=locked;this.chooser.disabled=locked;this.json.disabled=locked;this.applyButton.disabled=locked;
  this.renderFields();
 }
 private async load(){try{
  const response=await fetch('/__authoring/content');if(!response.ok)throw new Error('Saving requires the local development server. Preview remains available.');
  const data=await response.json();if(this.stopped)return;
  const registry=new ContentRegistry(data.source);this.source=data.source;this.rules=registry.rules;this.revision=data.revision;this.saveButton.disabled=false;this.populate();
 }catch(e){this.status.textContent=(e as Error).message;}finally{if(!this.stopped)this.lockEdits(false);}}
 private async save(){if(!this.revision||this.saveButton.disabled)return;this.saveButton.disabled=true;this.lockEdits(true);try{
  // Include every ability's text draft, including ones switched away from.
  // Validate the whole candidate before replacing the working source or saving.
  const next=structuredClone(this.source);
  for(const [id,text] of this.textDrafts){
   try{(next.rules as typeof this.rules).spellVisuals[id]=spellVisualSchema.parse(JSON.parse(text));}
   catch(e){throw new Error(`${id}: ${(e as Error).message}`);}
  }
  const registry=new ContentRegistry(next);this.source=next;this.rules=registry.rules;
  const response=await fetch('/__authoring/content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:this.revision,source:this.source})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not save effects.');
  this.revision=data.revision;this.status.textContent='Saved to content/game.json. Reload the page to use this revision.';
 }catch(e){this.status.textContent=(e as Error).message;}finally{if(!this.stopped){this.saveButton.disabled=false;this.lockEdits(false);}}}
 destroy(){if(this.stopped)return;this.stopped=true;cancelAnimationFrame(this.frame);this.resize.disconnect();this.effects.dispose();this.ground.geometry.dispose();this.ground.material.dispose();this.grid.geometry.dispose();const materials=Array.isArray(this.grid.material)?this.grid.material:[this.grid.material];materials.forEach(m=>m.dispose());this.renderer.dispose();this.renderer.forceContextLoss();this.dialog.close();this.dialog.remove();}
}
