import {resolveEffectSocket} from '../../../src/render/abilities/effectSocket';
import {visibleBounds,frameBounds,inspectionCapture} from './framing';
import {acceptsSpell,matchesSpellTarget} from '../../../src/sim/abilities/eligibility';
import {attackPhase} from '../../../src/render/characters/attackPhase';
import {ProjectileEffects} from '../../../src/render/settlement/projectileEffects';
import {ShellEffects} from '../../../src/render/settlement/shellEffects';
import {coreEffects} from '../../../src/content/effects/library';
import {ConcealmentVisuals} from '../../../src/render/characters/concealment';
import {value} from '../../../src/content/abilities/schema';
import {AbilityTarget} from '../../../src/render/settlement/abilityTarget';
import {castAnimation} from '../../../src/render/abilities/castAnimation';
import {Vector3,Group,Mesh,MeshStandardMaterial,GridHelper,PlaneGeometry} from 'three';
import {Renderer} from '../../../src/render';
import {HeightField} from '../../../src/shared/map/height';
import {emptyLandscape} from '../../../src/shared/landscape/curve';
import {InspectionSubject,defaultSubjectControls} from '../../src/asset-editor/subject';
import {AbilityEffects} from '../../../src/render/abilities/abilityEffects';
import published from '../../../assets/authoring/published.json';
import {content} from '../../../src/content/builtin';
import type {AssetDefinition} from '../../../src/shared/authoring/asset';
import type {PreviewState} from '../shared/view';
export type ViewMode='encounter'|'caster'|'target'|'effect'|'environment';
type TargetSelection={kind:'point';position:{x:number;y:number}}|{kind:'unit';entity:number};
export class SpellStage{
 private concealment=new ConcealmentVisuals();
 private hover?:TargetSelection;
 private field=new HeightField(256);private aimRoot=new Group();private aimVisual=new AbilityTarget(this.aimRoot);
 private renderer:Renderer;private effects=new AbilityEffects(()=>this.state?.effects??coreEffects);private fixtures=new Group();
 private weapons=new Group();private projectiles=new ProjectileEffects(this.weapons);private shells=new ShellEffects(this.weapons);
 private modelJobs=new Map<number,{asset:string;promise:Promise<void>}>();
 private subjects=new Map<number,InspectionSubject>();private epoch=-1;private eventId=0;private lastTick=0;private state?:PreviewState;
 private receivedAt=0;
 private modelKey='';private version=0;private mode:ViewMode='encounter';private frame=0;private abort=new AbortController();private drag?:{x:number;y:number;startX:number;startY:number};
 private active=true;private autoFrame=true;private framedKey='';
 private grid=new GridHelper(40,40,0x80908c,0x65716a);
 private floorGeometry=new PlaneGeometry(2000,2000);private floorMaterial=new MeshStandardMaterial({color:0x263438,roughness:1});
 constructor(private canvas:HTMLCanvasElement,private onError:(error:unknown)=>void,private onAim:(selection:TargetSelection)=>void){
  this.renderer=new Renderer(canvas);this.renderer.setGridMode('none');this.renderer.mountInspectionSubject(this.fixtures);this.renderer.mountInspectionSubject(this.effects.root);this.renderer.mountInspectionSubject(this.aimRoot);this.renderer.mountInspectionSubject(this.weapons);
  this.renderer.camera.setGame(false);this.renderer.camera.minZoom=1;this.renderer.camera.maxZoom=80;
  const {signal}=this.abort;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};canvas.setPointerCapture(e.pointerId);},{signal});
  canvas.addEventListener('pointermove',e=>{if(this.drag){this.autoFrame=false;this.renderer.camera.orbitScreen(e.clientX-this.drag.x,e.clientY-this.drag.y);this.drag={...this.drag,x:e.clientX,y:e.clientY};}else if(this.state?.targeting){this.hover=this.pickTarget(e.clientX,e.clientY);this.updateTargetVisual();}},{signal});
  canvas.addEventListener('pointerup',e=>{
   if(e.button===0&&this.drag&&Math.hypot(e.clientX-this.drag.startX,e.clientY-this.drag.startY)<4&&this.state?.targeting){
    const target=this.pickTarget(e.clientX,e.clientY);if(target)this.onAim(target);
   }this.drag=undefined;
  },{signal});canvas.addEventListener('pointercancel',()=>{this.drag=undefined;},{signal});canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
  canvas.addEventListener('wheel',e=>{e.preventDefault();this.autoFrame=false;this.renderer.camera.zoomBy(Math.exp(e.deltaY*.001));},{signal,passive:false});
  const frame=(now:number)=>{if(!this.active){this.frame=requestAnimationFrame(frame);return;}if(this.state){const tick=this.state.tick+(this.state.playing?Math.min(75,Math.max(0,now-this.receivedAt))*this.state.speed/25:0);this.updateEffects(tick);}this.renderer.present(now);this.frame=requestAnimationFrame(frame);};this.frame=requestAnimationFrame(frame);
 }
 async update(state:PreviewState){
  if(!state.loaded)return;if(!this.state||state.tick!==this.state.tick||state.playing!==this.state.playing||state.epoch!==this.state.epoch)this.receivedAt=performance.now();this.state=state;
  if(state.epoch!==this.epoch){
   this.epoch=state.epoch;this.hover=undefined;this.eventId=0;this.lastTick=state.tick;this.effects.clear();this.projectiles.update(state.tick,[],this.field);this.shells.update([],this.field,state.tick);
   // Actor membership changes during summons, death and containment; syncSubjects handles them.
   const key=state.settings.biome;
   if(key!==this.modelKey){this.modelKey=key;await this.load(state);}
   if(this.state?.epoch!==state.epoch)return;
  }
  await this.syncSubjects(state);if(this.state!==state)return;
  const dt=Math.max(0,Math.min(.1,(state.tick-this.lastTick)/40));this.lastTick=state.tick;
  for(const [id,subject]of this.subjects){
   const entity=[...state.entities,...state.corpses??[]].find(e=>e.id===id);subject.root.visible=!!entity&&this.showsEntity(id);if(!entity)continue;
   subject.root.scale.setScalar(content.rules.unitScale*(entity.appearance?.scale??1));
   subject.root.position.set(entity.x,entity.elevation??0,entity.y);subject.root.rotation.y=entity.rotation*Math.PI/180;
   const controls=defaultSubjectControls();controls.owner=entity.owner==='player.2'?1:0;controls.paused=true;
   const pending=entity.abilities?.pending;
   const pose=pending?castAnimation(state.document.presentation,pending,state.tick,clip=>subject.info.states.includes(clip)):undefined;
   controls.state=pose?.clip??(entity.hp===0?'death':entity.attack?'attack':entity.moving?'run':'idle');if(!subject.info.states.includes(controls.state))controls.state='idle';subject.configure(controls);
   subject.seek(entity.corpse||entity.fallen?1:pose?.phase??(entity.attack?attackPhase(state.tick,entity.attack,subject.attackContact()):(state.tick%100)/100));
   subject.update(dt);
   this.concealment.set(subject.root,entity.concealmentOpacity??1);
  }
  for(const event of state.events){if(event.id<=this.eventId)continue;this.effects.update(event.tick);this.effects.consume(event,state.document.presentation,()=>0,id=>{const e=state.entities.find(e=>e.id===id);return e?{x:e.x,y:e.y,height:e.elevation??0}:undefined;});this.eventId=event.id;}
  this.canvas.style.cursor=state.targeting?'crosshair':'grab';this.updateTargetVisual();
  this.effects.syncDeliveries(state.deliveries??[],id=>id===state.document.definition.id?state.document.presentation:undefined,()=>0,state.deliveryHistory);
  this.effects.syncStatuses(state.entities,state.tick,id=>id===state.document.definition.id?state.document.presentation:undefined);
  this.effects.syncReturns(state.heroReturns??[],state.tick,id=>id===state.document.definition.id?state.document.presentation:undefined);
  this.updateEffects(state.tick);
  const frameKey=JSON.stringify([state.epoch,state.settings,state.entities.map(e=>[e.id,e.appearance])]);
  if(frameKey!==this.framedKey){this.framedKey=frameKey;if(this.autoFrame)this.fit();}
 }
 private pickTarget(x:number,y:number):TargetSelection|undefined{
  if(!this.state)return;
  if(this.state.document.definition.targeting.kind==='point'){
   const hit=this.renderer.pickGround(x,y);if(hit)return {kind:'point',position:{x:Math.max(0,Math.min(255,Math.round(hit.x))),y:Math.max(0,Math.min(255,Math.round(hit.z)))}};
  }else if(this.state.document.definition.targeting.kind==='unit'){
   const hit=this.renderer.pickInspectionObject(x,y,[...this.subjects.values()].filter(s=>s.root.visible).map(s=>s.root));
   for(const [entity,subject]of this.subjects)for(let object=hit;object;object=object.parent)if(object===subject.root)return {kind:'unit',entity};
   return {kind:'unit',entity:0};
  }
 }
 private updateTargetVisual(){
  const state=this.state;if(!state)return;
  const spell=state.document.definition,caster=state.entities.find(e=>e.id===state.caster);
  const target=state.entities.find(e=>e.id===(this.hover?.kind==='unit'?this.hover.entity:state.target));
  const point=spell.targeting.kind==='point'?(this.hover?.kind==='point'?{x:this.hover.position.x,y:this.hover.position.y}:state.aim):target;
  const relation=caster?.owner===target?.owner?'ally':'enemy';
  this.aimVisual.update(state.targeting&&caster&&point&&spell.targeting.kind!=='self'?{spell,rank:state.rank,origin:caster,point,valid:Math.hypot(point.x-caster.x,point.y-caster.y)<=value(spell.targeting.range,spell.ranks[state.rank-1])&&(spell.targeting.kind==='point'||(!!target&&!!target.hp&&matchesSpellTarget(target.eligibility??{},spell,caster.eligibility??{},relation)&&acceptsSpell(target.eligibility??{},spell,relation)&&spell.targeting.relations.includes(relation)&&(target.id!==caster.id||spell.targeting.allowSelf)))}:null,this.field);
 }
 private updateEffects(tick:number){
  const state=this.state;if(!state)return;
  const origin=(shot:{source:number})=>{const e=state.entities.find(e=>e.id===shot.source),subject=this.subjects.get(shot.source);if(!e||!subject)return;const socket=content.asset(this.renderAsset(e,state)).projectileSocket;return socket?subject.root.getObjectByName(socket)?.getWorldPosition(new Vector3()):undefined;};
  this.projectiles.update(tick,state.missiles??[],this.field,origin,content.rules.unitScale);this.shells.update(state.shells??[],this.field,tick,origin,content.rules.unitScale);
  this.effects.setAudioFrame(this.renderer.effectAudioView(),!!state.playing,state.speed);
  this.effects.update(tick,id=>{const e=this.state?.entities.find(e=>e.id===id);return e?{x:e.x,y:e.y,height:e.elevation??0}:undefined;},this.projectiles.effectPose,(id,name)=>{const e=state.entities.find(e=>e.id===id),subject=this.subjects.get(id);return e&&subject?resolveEffectSocket(subject.root,content.asset(this.renderAsset(e,state)).sockets,name):undefined;});
 }
 private async load(state:PreviewState){
  const version=++this.version;this.modelJobs.clear();this.concealment.dispose();for(const subject of this.subjects.values())subject.dispose();this.subjects.clear();this.fixtures.clear();
  const field=this.field;field.load([],0);field.biome=state.settings.biome;this.renderer.setTerrain(field);
  this.renderer.setLandscape(emptyLandscape());this.renderer.draw({tick:0,size:256},[]);
  {const floor=new Mesh(this.floorGeometry,this.floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.set(123,.02,120);floor.receiveShadow=true;this.fixtures.add(floor);}
  if(this.mode!=='environment'){
   this.grid.position.set(123,.025,120);this.fixtures.add(this.grid);
  }
  await this.syncSubjects(state);if(version!==this.version)return;
  this.fixtures.visible=this.mode!=='environment';this.fit();
 }
 private renderAsset(e:PreviewState['entities'][number],state:PreviewState){
  const id=e.modelDefinition??(e.definition==='unit.preview.caster'?state.settings.casterDefinition:e.definition==='unit.preview.target'?state.settings.targetDefinition:e.definition);
  return e.appearance?.asset??content.get(id).asset;
 }
 /** Swap only changed actors; shared updates await the same in-flight load. */
 private async syncSubjects(state:PreviewState){
  const version=this.version,jobs:Promise<void>[]=[];
  for(const [id,subject]of this.subjects)if(![...state.entities,...state.corpses??[]].some(e=>e.id===id)){this.concealment.remove(subject.root);subject.dispose();this.subjects.delete(id);}
  for(const e of [...state.entities,...state.corpses??[]]){
   const render=this.renderAsset(e,state),current=this.subjects.get(e.id);
   if(current?.root.userData.renderAsset===render)continue;
   const pending=this.modelJobs.get(e.id);if(pending?.asset===render){jobs.push(pending.promise);continue;}
   const asset=published.assets.find(a=>a.bindings.render.some(b=>b.id===render)) as AssetDefinition|undefined;
   if(!asset)throw Error('No published model for '+render);
   const job={asset:render,promise:Promise.resolve()};
   job.promise=(async()=>{
    try{
     const subject=await InspectionSubject.load(asset,`/runtime-assets/${asset.id}/geometry.glb`,1);
     if(version!==this.version||this.modelJobs.get(e.id)!==job){subject.dispose();return;}
     const latest=this.state&&[...this.state.entities,...this.state.corpses??[]].find(x=>x.id===e.id);
     if(!latest||this.renderAsset(latest,this.state!)!==render){subject.dispose();return;}
     const previous=this.subjects.get(e.id);if(previous){this.concealment.remove(previous.root);previous.dispose();}
     subject.root.userData.renderAsset=render;subject.root.scale.setScalar(content.rules.unitScale*(latest.appearance?.scale??1));subject.root.position.set(latest.x,latest.elevation??0,latest.y);
     this.renderer.mountInspectionSubject(subject.root);this.subjects.set(e.id,subject);
    }catch(error){this.onError(error);}finally{if(this.modelJobs.get(e.id)===job)this.modelJobs.delete(e.id);}
   })();this.modelJobs.set(e.id,job);jobs.push(job.promise);
  }
  await Promise.all(jobs);
 }
 setActive(active:boolean){this.active=active;}
 private showsEntity(id:number){return this.mode!=='effect'&&(this.mode!=='caster'||id===this.state?.caster)&&(this.mode!=='target'||id===this.state?.target);}
 setMode(mode:ViewMode){this.mode=mode;if(this.state){for(const [id,s] of this.subjects)s.root.visible=this.showsEntity(id);this.fixtures.visible=mode!=='environment';this.fit();}}
 fit(aspect=this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight)){
  const state=this.state;if(!state)return;this.autoFrame=true;
  const id=this.mode==='caster'?state.caster:this.mode==='target'?state.target:undefined;
  const roots=[...this.subjects].filter(([key])=>this.mode!=='effect'&&(id===undefined||key===id)).map(([,s])=>s.root);
  if(id===undefined)roots.push(this.effects.root,this.weapons);else roots.push(...this.effects.rootsForEntity(id));
  const bounds=visibleBounds(roots);
  // Empty views still have a useful focus before the first effect is emitted.
  if(bounds.isEmpty()){const focus=state.entities.find(e=>e.id===id)??state.aim;bounds.set(new Vector3(focus.x-2,0,focus.y-2),new Vector3(focus.x+2,4,focus.y+2));}
  this.renderer.camera.setGame(this.mode==='environment',256);
  this.renderer.camera.pose({...frameBounds(bounds,aspect),gameZoom:1.8});
 }
 async capture(){await this.effects.ready();if(this.abort.signal.aborted)throw Error("Spell canvas was closed during capture");this.updateEffects(this.state?.tick??0);this.fit(inspectionCapture.aspect);try{return this.renderer.capture(inspectionCapture.width,inspectionCapture.aspect).toDataURL('image/png');}finally{this.fit();}}
 dispose(){this.concealment.dispose();cancelAnimationFrame(this.frame);this.abort.abort();this.version++;for(const s of this.subjects.values())s.dispose();this.effects.dispose();this.projectiles.dispose();this.shells.dispose();this.aimVisual.dispose();this.grid.dispose();this.floorGeometry.dispose();this.floorMaterial.dispose();this.renderer.destroy();}
}
