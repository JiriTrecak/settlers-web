import {InspectionSubject,defaultSubjectControls} from '../../src/asset-editor/subject';
import {resolveEffectSocket} from '../../../src/render/abilities/effectSocket';
import published from '../../../assets/authoring/published.json';
import {content} from '../../../src/content/builtin';
import {assetDefinitionSchema,type AssetDefinition} from '../../../src/shared/authoring/asset';
import {visibleBounds,frameBounds,inspectionCapture} from './framing';
import {Vector3,Group,Mesh,MeshStandardMaterial,GridHelper,PlaneGeometry} from 'three';
import {Renderer} from '../../../src/render';
import {HeightField} from '../../../src/shared/map/height';
import {emptyLandscape} from '../../../src/shared/landscape/curve';
import {EffectPlayer} from '../../../src/render/abilities/effectPlayer';
import type {VisualEffect} from '../../../src/content/effects/schema';
/** Independent visual stage, sharing the game's renderer, lighting and biome profiles. */
export class EffectStage{
 private subject?:InspectionSubject;private subjectAsset?:AssetDefinition;private modelGeneration=0;private modelId='';private modelLoading?:Promise<void>;modelAnchor:'source'|'target'='target';
 private renderer:Renderer;private player=new EffectPlayer();private root=new Group();private grid=new GridHelper(40,40,0x80908c,0x65716a);
 private geometry=new PlaneGeometry(2000,2000);private material=new MeshStandardMaterial({color:0x263438,roughness:1});
 private frame=0;private abort=new AbortController();private drag?:{x:number;y:number};private last=0;private effect?:VisualEffect;
 tick=0;playing=true;speed=1;repeat=true;sustain=false;distance=6;seed=1;private end=200;
 constructor(private canvas:HTMLCanvasElement,private onFrame:(tick:number,end:number)=>void){
  this.renderer=new Renderer(canvas);this.renderer.setGridMode('none');this.renderer.mountInspectionSubject(this.root);this.renderer.mountInspectionSubject(this.player.root);
  this.renderer.camera.setGame(false);this.renderer.camera.minZoom=1;this.renderer.camera.maxZoom=80;
  const floor=new Mesh(this.geometry,this.material);floor.rotation.x=-Math.PI/2;floor.position.set(123,.02,120);floor.receiveShadow=true;this.grid.position.set(123,.025,120);this.root.add(floor,this.grid);this.setBiome('vibrant-forest');this.fit();
  const {signal}=this.abort;canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);},{signal});canvas.addEventListener('pointermove',e=>{if(!this.drag)return;this.renderer.camera.orbitScreen(e.clientX-this.drag.x,e.clientY-this.drag.y);this.drag={x:e.clientX,y:e.clientY};},{signal});for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,()=>this.drag=undefined,{signal});canvas.addEventListener('wheel',e=>{e.preventDefault();this.renderer.camera.zoomBy(Math.exp(e.deltaY*.001));},{signal,passive:false});
  const frame=(now:number)=>{const dt=Math.min(100,now-this.last);this.last=now;if(this.playing&&this.effect){this.tick+=dt/25*this.speed;if(this.tick>this.end){if(this.repeat)this.seek(0);else{this.tick=this.end;this.playing=false;}}this.player.setAudioFrame(this.renderer.effectAudioView(),this.playing,this.speed);this.sample();this.onFrame(this.tick,this.end);}this.player.setAudioFrame(this.renderer.effectAudioView(),this.playing,this.speed);this.renderer.present(now);this.frame=requestAnimationFrame(frame);};this.frame=requestAnimationFrame(frame);
 }
 async setModel(id:string){
  if(id===this.modelId)return this.modelLoading;this.modelId=id;const generation=++this.modelGeneration;this.modelLoading=undefined;
  this.subject?.dispose();this.subject=undefined;this.subjectAsset=undefined;if(!id)return;
  const raw=published.assets.find(a=>a.id===id&&a.usesGeometry);if(!raw){this.modelId='';throw Error('Unknown published preview model');}
  const asset=assetDefinitionSchema.parse(raw);
  this.modelLoading=InspectionSubject.load(asset,`/runtime-assets/${id}/geometry.glb`,1).then(subject=>{
   if(generation!==this.modelGeneration){subject.dispose();return;}
   this.subject=subject;this.subjectAsset=asset;subject.root.scale.setScalar(content.rules.unitScale);this.renderer.mountInspectionSubject(subject.root);this.sample();this.fit();
  }).catch(error=>{if(generation===this.modelGeneration)this.modelId='';throw error;}).finally(()=>{if(generation===this.modelGeneration)this.modelLoading=undefined;});return this.modelLoading;
 }
 private sample(){
  if(this.subject){const controls=defaultSubjectControls();controls.paused=true;controls.state=this.subject.info.states.includes('idle')?'idle':this.subject.info.states[0]??'idle';this.subject.configure(controls);this.subject.seek((this.tick%100)/100);this.subject.update(0);this.subject.root.position.set(120+(this.modelAnchor==='target'?this.distance:0),0,120);}
  this.player.update(this.tick,undefined,undefined,(id,name)=>this.subject&&this.subjectAsset&&id===(this.modelAnchor==='target'?1:0)?resolveEffectSocket(this.subject.root,this.subjectAsset.capabilities.sockets,name):undefined);
 }
 setBiome(biome:string){const field=new HeightField(256);field.load([],0);field.biome=biome as typeof field.biome;this.renderer.setTerrain(field);this.renderer.setLandscape(emptyLandscape());this.renderer.draw({tick:0,size:256},[]);}
 load(effect:VisualEffect){const changed=this.effect?.id!==effect.id;this.effect=effect;this.end=Math.max(effect.durationTicks,...effect.layers.map(l=>l.startTick+l.durationTicks+(l.launchDelayMs??0)/25+(l.impact?.durationTicks??0)+(l.emitter?.lifetimeTicks??0)),...effect.layers.flatMap(l=>[l.motion?.rotation,l.motion?.scale,l.motion?.opacity].map(m=>(m?.periodTicks??0)*2)));this.seek(Math.min(this.tick,this.end));if(changed)this.fit();}
 seek(tick:number){this.tick=tick;this.player.setAudioFrame(this.renderer.effectAudioView(),false,this.speed);this.player.clear();if(this.effect)this.player.play(this.effect,{seed:this.seed,source:{x:120,y:120},target:{x:120+this.distance,y:120},sustain:this.sustain});this.sample();this.onFrame(tick,this.end);}
 restart(){this.seek(0);this.playing=true;}
 resume(){this.seek(this.tick>=this.end?0:this.tick);this.playing=true;}
 stop(){this.playing=false;this.tick=0;this.player.clear();this.onFrame(0,this.end);}
 fit(aspect=this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight)){
  const bounds=visibleBounds([this.player.root,...(this.subject?[this.subject.root]:[])]);
  if(bounds.isEmpty()){
   const layers=this.effect?.layers.filter(l=>l.enabled&&!['light','sound'].includes(l.shape))??[];
   for(const layer of layers){const x=120+(layer.anchor==='source'?0:this.distance),radius=Math.max(layer.size,layer.spread??0,1),height=Math.max(2,layer.height);
    bounds.expandByPoint(new Vector3(x-radius,0,120-radius));bounds.expandByPoint(new Vector3(x+radius,height,120+radius));
    if(['beam','missile','wavefront'].includes(layer.shape))bounds.expandByPoint(new Vector3(120,layer.height,120));
   }
  }
  this.renderer.camera.pose(frameBounds(bounds,aspect));
 }
 async capture(){await Promise.all([this.player.ready(),this.modelLoading]);if(this.abort.signal.aborted)throw Error("Effect canvas was closed during capture");this.sample();this.fit(inspectionCapture.aspect);try{return this.renderer.capture(inspectionCapture.width,inspectionCapture.aspect).toDataURL('image/png');}finally{this.fit();}}
 dispose(){this.modelGeneration++;this.subject?.dispose();cancelAnimationFrame(this.frame);this.abort.abort();this.player.dispose();this.grid.dispose();this.geometry.dispose();this.material.dispose();this.renderer.destroy();}
}
