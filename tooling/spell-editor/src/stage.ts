import {value} from '../../../src/content/abilities/schema';
import {AbilityTarget} from '../../../src/render/settlement/abilityTarget';
import {castAnimation} from '../../../src/render/abilities/castAnimation';
import {Group,Mesh,MeshStandardMaterial,GridHelper,PlaneGeometry} from 'three';
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
 private hover?:TargetSelection;
 private field=new HeightField(256);private aimRoot=new Group();private aimVisual=new AbilityTarget(this.aimRoot);
 private renderer:Renderer;private effects=new AbilityEffects();private fixtures=new Group();
 private subjects=new Map<number,InspectionSubject>();private epoch=-1;private eventId=0;private lastTick=0;private state?:PreviewState;
 private receivedAt=0;
 private modelKey='';private version=0;private mode:ViewMode='encounter';private frame=0;private abort=new AbortController();private drag?:{x:number;y:number;startX:number;startY:number};
 private grid=new GridHelper(40,40,0x80908c,0x65716a);
 private floorGeometry=new PlaneGeometry(2000,2000);private floorMaterial=new MeshStandardMaterial({color:0x263438,roughness:1});
 constructor(private canvas:HTMLCanvasElement,private onError:(error:unknown)=>void,private onAim:(selection:TargetSelection)=>void){
  this.renderer=new Renderer(canvas);this.renderer.setGridMode('none');this.renderer.mountInspectionSubject(this.fixtures);this.renderer.mountInspectionSubject(this.effects.root);this.renderer.mountInspectionSubject(this.aimRoot);
  this.renderer.camera.setGame(false);this.renderer.camera.minZoom=1;this.renderer.camera.maxZoom=80;
  const {signal}=this.abort;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};canvas.setPointerCapture(e.pointerId);},{signal});
  canvas.addEventListener('pointermove',e=>{if(this.drag){this.renderer.camera.orbitScreen(e.clientX-this.drag.x,e.clientY-this.drag.y);this.drag={...this.drag,x:e.clientX,y:e.clientY};}else if(this.state?.targeting){this.hover=this.pickTarget(e.clientX,e.clientY);this.updateTargetVisual();}},{signal});
  canvas.addEventListener('pointerup',e=>{
   if(e.button===0&&this.drag&&Math.hypot(e.clientX-this.drag.startX,e.clientY-this.drag.startY)<4&&this.state?.targeting){
    const target=this.pickTarget(e.clientX,e.clientY);if(target)this.onAim(target);
   }this.drag=undefined;
  },{signal});canvas.addEventListener('pointercancel',()=>{this.drag=undefined;},{signal});canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
  canvas.addEventListener('wheel',e=>{e.preventDefault();this.renderer.camera.zoomBy(Math.exp(e.deltaY*.001));},{signal,passive:false});
  const frame=(now:number)=>{if(this.state){const tick=this.state.tick+(this.state.playing?Math.min(75,Math.max(0,now-this.receivedAt))*this.state.speed/25:0);this.updateEffects(tick);}this.renderer.present(now);this.frame=requestAnimationFrame(frame);};this.frame=requestAnimationFrame(frame);
 }
 async update(state:PreviewState){
  if(!state.loaded)return;if(!this.state||state.tick!==this.state.tick||state.playing!==this.state.playing||state.epoch!==this.state.epoch)this.receivedAt=performance.now();this.state=state;
  if(state.epoch!==this.epoch){
   this.epoch=state.epoch;this.hover=undefined;this.eventId=0;this.lastTick=state.tick;this.effects.clear();
   const key=JSON.stringify([state.settings.biome,state.settings.casterDefinition,state.settings.targetDefinition,state.entities.map(e=>[e.id,e.modelDefinition])]);
   if(key!==this.modelKey){this.modelKey=key;await this.load(state);}
   if(this.state?.epoch!==state.epoch)return;
  }
  if(state.entities.some(e=>!this.subjects.has(e.id))){await this.load(state);}
  const dt=Math.max(0,Math.min(.1,(state.tick-this.lastTick)/40));this.lastTick=state.tick;
  for(const [id,subject]of this.subjects){
   const entity=state.entities.find(e=>e.id===id);subject.root.visible=!!entity&&this.mode!=='effect';if(!entity)continue;
   subject.root.position.set(entity.x,0,entity.y);subject.root.rotation.y=entity.rotation*Math.PI/180;
   const controls=defaultSubjectControls();controls.owner=entity.owner==='player.2'?1:0;controls.paused=true;
   const pending=entity.abilities?.pending;
   const pose=pending?castAnimation(state.document.presentation,pending,state.tick,clip=>subject.info.states.includes(clip)):undefined;
   controls.state=pose?.clip??'idle';subject.configure(controls);
   subject.seek(pose?.phase??(state.tick%100)/100);
   subject.update(dt);
  }
  for(const event of state.events){if(event.id<=this.eventId)continue;this.effects.update(event.tick);this.effects.consume(event,state.document.presentation);this.eventId=event.id;}
  this.canvas.style.cursor=state.targeting?'crosshair':'grab';this.updateTargetVisual();
  this.effects.syncDeliveries(state.deliveries??[],id=>id===state.document.definition.id?state.document.presentation:undefined);
  this.effects.syncStatuses(state.entities,state.tick,id=>id===state.document.definition.id?state.document.presentation:undefined);
  this.updateEffects(state.tick);
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
  this.aimVisual.update(state.targeting&&caster&&point&&spell.targeting.kind!=='self'?{spell,rank:state.rank,origin:caster,point,valid:Math.hypot(point.x-caster.x,point.y-caster.y)<=value(spell.targeting.range,spell.ranks[state.rank-1])&&(spell.targeting.kind==='point'||(spell.targeting.relations.includes(relation)&&(target?.id!==caster.id||spell.targeting.allowSelf)))}:null,this.field);
 }
 private updateEffects(tick:number){this.effects.update(tick,id=>{const e=this.state?.entities.find(e=>e.id===id);return e?{x:e.x,y:e.y,height:0}:undefined;});}
 private async load(state:PreviewState){
  const version=++this.version;for(const subject of this.subjects.values())subject.dispose();this.subjects.clear();this.fixtures.clear();
  const field=this.field;field.load([],0);field.biome=state.settings.biome;this.renderer.setTerrain(field);
  this.renderer.setLandscape(emptyLandscape());this.renderer.draw({tick:0,size:256},[]);
  {const floor=new Mesh(this.floorGeometry,this.floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.set(123,.02,120);floor.receiveShadow=true;this.fixtures.add(floor);}
  if(this.mode!=='environment'){
   this.grid.position.set(123,.025,120);this.fixtures.add(this.grid);
  }
  for(const e of state.entities){
   const id=e.modelDefinition??(e.definition==='unit.preview.caster'?state.settings.casterDefinition:e.definition==='unit.preview.target'?state.settings.targetDefinition:e.definition);
   const render=content.get(id).asset;
   const asset=published.assets.find(a=>a.bindings.render.some(b=>b.id===render)) as AssetDefinition|undefined;
   if(!asset)throw Error('No published model for '+id);
   try{
    const subject=await InspectionSubject.load(asset,`/runtime-assets/${asset.id}/geometry.glb`,1);
    if(version!==this.version){subject.dispose();return;}
    subject.root.scale.setScalar(content.rules.unitScale);subject.root.position.set(e.x,0,e.y);this.renderer.mountInspectionSubject(subject.root);this.subjects.set(e.id,subject);
   }catch(error){this.onError(error);}
  }
  this.fixtures.visible=this.mode!=='environment';this.fit();
 }
 setMode(mode:ViewMode){this.mode=mode;if(this.state){this.fit();for(const s of this.subjects.values())s.root.visible=mode!=='effect';this.fixtures.visible=mode!=='environment';}}
 fit(){const state=this.state;if(!state)return;const target=state.entities.find(e=>e.id===state.target),caster=state.entities.find(e=>e.id===state.caster);
  const focus=this.mode==='caster'?caster:this.mode==='target'||this.mode==='effect'?(state.document.definition.targeting.kind==='point'?state.aim:target):undefined;
  this.renderer.camera.setGame(this.mode==='environment',256);
  this.renderer.camera.pose({x:focus?.x??120+state.settings.distance/2,z:120,height:1.5,yaw:Math.PI*.2,pitch:Math.PI*.2,zoom:state.document.definition.targeting.kind==='point'?11:focus?4.8:8,gameZoom:1.8});
 }
 capture(){return this.renderer.capture(1440,this.canvas.clientWidth/this.canvas.clientHeight).toDataURL('image/png');}
 dispose(){cancelAnimationFrame(this.frame);this.abort.abort();this.version++;for(const s of this.subjects.values())s.dispose();this.effects.dispose();this.aimVisual.dispose();this.grid.dispose();this.floorGeometry.dispose();this.floorMaterial.dispose();this.renderer.destroy();}
}
