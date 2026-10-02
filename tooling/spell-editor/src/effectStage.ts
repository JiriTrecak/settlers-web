import {Group,Mesh,MeshStandardMaterial,GridHelper,PlaneGeometry} from 'three';
import {Renderer} from '../../../src/render';
import {HeightField} from '../../../src/shared/map/height';
import {emptyLandscape} from '../../../src/shared/landscape/curve';
import {EffectPlayer} from '../../../src/render/abilities/effectPlayer';
import type {VisualEffect} from '../../../src/content/effects/schema';
/** Independent visual stage, sharing the game's renderer, lighting and biome profiles. */
export class EffectStage{
 private renderer:Renderer;private player=new EffectPlayer();private root=new Group();private grid=new GridHelper(40,40,0x80908c,0x65716a);
 private geometry=new PlaneGeometry(2000,2000);private material=new MeshStandardMaterial({color:0x263438,roughness:1});
 private frame=0;private abort=new AbortController();private drag?:{x:number;y:number};private last=0;private effect?:VisualEffect;
 tick=0;playing=true;speed=1;repeat=true;sustain=false;distance=6;seed=1;private end=200;
 constructor(private canvas:HTMLCanvasElement,private onFrame:(tick:number,end:number)=>void){
  this.renderer=new Renderer(canvas);this.renderer.setGridMode('none');this.renderer.mountInspectionSubject(this.root);this.renderer.mountInspectionSubject(this.player.root);
  this.renderer.camera.setGame(false);this.renderer.camera.minZoom=1;this.renderer.camera.maxZoom=80;
  const floor=new Mesh(this.geometry,this.material);floor.rotation.x=-Math.PI/2;floor.position.set(123,.02,120);floor.receiveShadow=true;this.grid.position.set(123,.025,120);this.root.add(floor,this.grid);this.setBiome('vibrant-forest');this.fit();
  const {signal}=this.abort;canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);},{signal});canvas.addEventListener('pointermove',e=>{if(!this.drag)return;this.renderer.camera.orbitScreen(e.clientX-this.drag.x,e.clientY-this.drag.y);this.drag={x:e.clientX,y:e.clientY};},{signal});for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,()=>this.drag=undefined,{signal});canvas.addEventListener('wheel',e=>{e.preventDefault();this.renderer.camera.zoomBy(Math.exp(e.deltaY*.001));},{signal,passive:false});
  const frame=(now:number)=>{const dt=Math.min(100,now-this.last);this.last=now;if(this.playing&&this.effect){this.tick+=dt/25*this.speed;if(this.tick>this.end){if(this.repeat)this.seek(0);else{this.tick=this.end;this.playing=false;}}this.player.update(this.tick);this.onFrame(this.tick,this.end);}this.renderer.present(now);this.frame=requestAnimationFrame(frame);};this.frame=requestAnimationFrame(frame);
 }
 setBiome(biome:string){const field=new HeightField(256);field.load([],0);field.biome=biome as typeof field.biome;this.renderer.setTerrain(field);this.renderer.setLandscape(emptyLandscape());this.renderer.draw({tick:0,size:256},[]);}
 load(effect:VisualEffect){const changed=this.effect?.id!==effect.id;this.effect=effect;this.end=Math.max(effect.durationTicks,...effect.layers.map(l=>l.startTick+l.durationTicks+(l.launchDelayMs??0)/25+(l.impact?.durationTicks??0)+(l.emitter?.lifetimeTicks??0)),...effect.layers.flatMap(l=>[l.motion?.rotation,l.motion?.scale,l.motion?.opacity].map(m=>(m?.periodTicks??0)*2)));this.seek(Math.min(this.tick,this.end));if(changed)this.fit();}
 seek(tick:number){this.tick=tick;this.player.clear();if(this.effect)this.player.play(this.effect,{seed:this.seed,source:{x:120,y:120},target:{x:120+this.distance,y:120},sustain:this.sustain});this.player.update(tick);this.onFrame(tick,this.end);}
 restart(){this.seek(0);this.playing=true;}
 resume(){this.seek(this.tick>=this.end?0:this.tick);this.playing=true;}
 stop(){this.playing=false;this.tick=0;this.player.clear();this.onFrame(0,this.end);}
 fit(){const layers=this.effect?.layers??[],link=layers.some(l=>['beam','missile','wavefront'].includes(l.shape))||new Set(layers.map(l=>l.anchor)).size>1;const extent=Math.max(2,...layers.filter(l=>l.shape!=='light').map(l=>Math.max(l.size,l.spread??0,l.height*.6)));this.renderer.camera.pose({x:120+(link?this.distance/2:layers[0]?.anchor==='source'?0:this.distance),z:120,height:1.3,yaw:Math.PI*.2,pitch:Math.PI*.23,zoom:Math.max(4,extent*1.4,link?this.distance*.9:0),gameZoom:1.8});}
 capture(){return this.renderer.capture(1440,this.canvas.clientWidth/this.canvas.clientHeight).toDataURL('image/png');}
 dispose(){cancelAnimationFrame(this.frame);this.abort.abort();this.player.dispose();this.grid.dispose();this.geometry.dispose();this.material.dispose();this.renderer.destroy();}
}
