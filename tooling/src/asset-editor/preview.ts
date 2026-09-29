import {content} from '../../../src/content/builtin';
import {InspectionSubject,type SubjectControls,type SubjectInfo} from './subject';
import {biomeById} from '../../../src/content/biomes';
import {type WeatherSettings} from '../../../src/shared/landscape/weather';
import {Renderer} from '../../../src/render';
import {HeightField} from '../../../src/shared/map/height';
import {parseUtcMap,type MapStamp,type UtcMap} from '../../../src/shared/map/utcmap';
import {emptyLandscape,type Landscape} from '../../../src/shared/landscape/curve';
import {projectCatalogue,projectMeshUrl} from '../../../src/shared/assets/project';
import type {AssetDefinition} from '../../../src/shared/authoring/asset';
import {compileMapScene} from '../../../src/shared/authoring/mapScene';
import {landscapeCatalogue} from '../../../src/shared/authoring/catalogue';
import {authoringSceneSchema} from '../../../src/shared/authoring/layers';
import {emptyUtcMap} from '../../../src/shared/map/utcmap';
import {frameModel} from './framing';
const maps=import.meta.glob('../../../assets/maps/{campaign,skirmish,showcase}/**/*.utcmap',{query:'?raw',import:'default'}) as Record<string,()=>Promise<string>>;
export const previewMaps=Object.entries(maps).map(([id,load])=>({id,name:id.split('/').at(-1)!.replace('.utcmap','').replaceAll('-',' '),load:async()=>{const map=parseUtcMap(JSON.parse(await load()));if(!map)throw Error('Invalid preview map');return map;}}));
export type PreviewSettings={mode:'single'|'clump'|'patch'|'formation'|'map';map:string;x:number;z:number;elevation:number;yaw:number;scale:number;hour:number;view:'game'|'free'|'top';environment:string;weather:'map'|WeatherSettings['kind']};
export function resourceUrl(asset:AssetDefinition,role:string,index=1){return '/__studio/authoring/resource?'+new URLSearchParams({id:asset.id,role,index:String(index),revision:String(asset.revision)});}
export class ProductionPreview{
 private renderer:Renderer;private frame=0;private stopped=false;private drag:{x:number;y:number;button:number}|null=null;
 private cancel=new AbortController();private generation=0;
 private interactive=false;private lastViewKey='';private previewIds:string[]=[];
 private subject?:InspectionSubject;private subjectKey='';private sceneKey='';private lastTime=0;private field?:HeightField;
 private subjectControls?:SubjectControls;private baseLandscape:Landscape=emptyLandscape();
 private loadedMaps=new Map<string,Promise<UtcMap>>();
 constructor(private canvas:HTMLCanvasElement,private library:AssetDefinition[]=[],private onPlacement?:(x:number,z:number)=>void){
  const catalog=projectCatalogue(),urls=new Map(catalog.assets.flatMap(a=>{const url=projectMeshUrl(a.file);return url?[[a.id,url] as [string,string]]:[];}));
  this.renderer=new Renderer(canvas,urls);this.renderer.setKinds(new Map(catalog.assets.map(a=>[a.id,a.type])));this.renderer.setGridMode('none');
  const {signal}=this.cancel;
  canvas.addEventListener('pointerdown',e=>{if(!this.interactive)return;if(e.button===0&&e.shiftKey){const point=this.renderer.pickGround(e.clientX,e.clientY);if(point)this.onPlacement?.(point.x,point.z);e.preventDefault();return;}if(e.button===0||e.button===1||e.button===2){this.drag={x:e.clientX,y:e.clientY,button:e.button};canvas.setPointerCapture(e.pointerId);}},{signal});
  canvas.addEventListener('pointermove',e=>{if(!this.drag)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;if(this.drag.button===2)this.renderer.camera.orbitScreen(dx,dy);else this.renderer.camera.panScreen(dx,dy,canvas.clientHeight);this.drag.x=e.clientX;this.drag.y=e.clientY;},{signal});
  canvas.addEventListener('pointerup',()=>{this.drag=null;},{signal});canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
  canvas.addEventListener('wheel',e=>{e.preventDefault();this.renderer.camera.zoomBy(Math.exp(e.deltaY*.001));},{signal,passive:false});
  const draw=(now:number)=>{if(this.stopped)return;if(!document.hidden){this.subject?.update(Math.min(.1,this.lastTime?(now-this.lastTime)/1000:0));this.renderer.present(now);}this.lastTime=now;this.frame=requestAnimationFrame(draw);};this.frame=requestAnimationFrame(draw);
 }
 async show(asset:AssetDefinition,settings:PreviewSettings,geometryUrl?:string){
  const version=++this.generation;this.interactive=false;
  let map:UtcMap|undefined,environmentMap:UtcMap|undefined;
  {const entry=previewMaps.find(m=>m.id===settings.map);if(entry){let loading=this.loadedMaps.get(entry.id);if(!loading){loading=entry.load();this.loadedMaps.set(entry.id,loading);}environmentMap=await loading;if(settings.mode==='map')map=environmentMap;}}
  if(version!==this.generation||this.stopped)return;
  const catalog=projectCatalogue(),urls=new Map(catalog.assets.flatMap(a=>{const url=projectMeshUrl(a.file);return url?[[a.id,url] as [string,string]]:[];}));
  const sourceId=asset.bindings.scenery[0]?.id??asset.bindings.render[0]?.id??asset.id,previewId='asset-editor-preview.'+asset.id;
  if(asset.usesGeometry)urls.set(previewId,resourceUrl(asset,'geometry'));
  let definitions=[...this.library.filter(a=>a.id!==asset.id),{...asset,status:'published' as const}];
  if(asset.recipe||asset.water){
   map??={...emptyUtcMap(),waterLevel:-8};const x=settings.x,z=settings.z;
   if(asset.water)definitions.push({...asset,id:'preview.river',kind:'landscape-recipe',water:undefined,recipe:{type:'river',water:asset.id,width:10,depth:2,bankWidth:3,flow:1,maxUphillGrade:0}});
   const recipe=asset.recipe??definitions.at(-1)!.recipe!,spline={type:'spline',knots:[{x:x-20,z:z-10,elevation:-.2,outgoing:{x:x-7,z:z-17}},{x:x+20,z:z+10,elevation:-.2,incoming:{x:x+6,z:z+17}}]};
   const region={type:'region',points:[{x:x-16,z:z-16},{x:x+16,z:z-16},{x:x+16,z:z+16},{x:x-16,z:z+16}]};
   const needsRiver='riverBank'in recipe&&recipe.riverBank;
   map={...map,authoring:authoringSceneSchema.parse({version:1,objects:map.authoring?.objects??[],layers:[...(map.authoring?.layers??[]),...(needsRiver?[{id:'preview.bank-stream',name:'Preview stream',seed:1,recipe:'recipe.river.gentle',shape:spline}]:[]),{id:'preview.asset-layer',name:asset.name,seed:1,recipe:asset.recipe?asset.id:'preview.river',shape:['river','path'].includes(recipe.type)?spline:region}]})};
  }
  const isSubject=asset.usesGeometry&&['unit','creature','building'].includes(asset.kind);
  const sceneKey=JSON.stringify([settings.mode,settings.map,settings.environment,asset,asset.recipe||asset.water?[settings.x,settings.z]:null]);
  const rebuild=sceneKey!==this.sceneKey;
  if(rebuild)this.renderer.setAssets(urls,new Map([[previewId,{sourceAsset:sourceId,transform:asset.transform,groundContact:asset.capabilities.groundContact?.mode,...(asset.capabilities.canopy?{canopy:true as const}:{})}]]));
  const kinds=new Map(catalog.assets.map(a=>[a.id,a.type]));kinds.set(previewId,asset.capabilities.groundContact?.mode==='water'?'water':asset.bindings.scenery[0]?.type??'prop');if(rebuild)this.renderer.setKinds(kinds);
  const previewBiome=biomeById(settings.environment==='map'?environmentMap?.biome:settings.environment);
  if(map)map={...map,biome:previewBiome.id};
  const compiled=rebuild&&map?compileMapScene(map,landscapeCatalogue(definitions)):undefined;
  const field=rebuild?(compiled?.field??new HeightField(256)):this.field!;if(rebuild&&!compiled)field.load([],-2);this.field=field;
  if(rebuild){field.biome=previewBiome.id;this.renderer.setTerrain(field);}
  if(rebuild)this.baseLandscape=map?.landscape??{...emptyLandscape(),environment:environmentMap?.landscape?.environment??emptyLandscape().environment};
  const landscape={...this.baseLandscape,environment:{...this.baseLandscape.environment}};
  if(settings.weather!=='map')landscape.environment.weather={kind:settings.weather};
  landscape.environment.hour=settings.hour;landscape.environment.playing=false;
  this.renderer.setLandscape(landscape);
  const viewKey=JSON.stringify([asset.id,settings.view,settings.mode,settings.map]),resetView=viewKey!==this.lastViewKey;
  if(resetView){
   this.renderer.camera.setGame(settings.view==='game',map?.size??256);this.renderer.camera.minZoom=1;this.renderer.camera.maxZoom=10000;
   if(settings.view==='top')this.renderer.camera.setTopDown();
   this.renderer.camera.pose({x:settings.x,z:settings.z,...(settings.view==='game'?{gameZoom:1}:{yaw:settings.view==='top'?0:Math.PI/4,pitch:settings.view==='top'?Math.PI/2:Math.PI/6,zoom:asset.recipe||asset.water?30:settings.mode==='single'?8:20})});
   this.lastViewKey=viewKey;
  }
  const stamps:MapStamp[]=[...(compiled?.stamps??map?.stamps??[])];
  const count=!asset.usesGeometry?0:settings.mode==='clump'?9:settings.mode==='patch'?49:settings.mode==='formation'?12:1;
  this.previewIds=[];
  for(let i=0;i<(isSubject?0:count);i++){const columns=settings.mode==='formation'?4:Math.sqrt(count),spacing=settings.mode==='patch'?.7:settings.mode==='clump'?3:1.8;
   const id=previewId+'.'+i;this.previewIds.push(id);
   stamps.push({id,asset:previewId,x:settings.x-.5+(count===1?0:(i%columns-(columns-1)/2)*spacing),y:settings.z-.5+(count===1?0:(Math.floor(i/columns)-(Math.ceil(count/columns)-1)/2)*spacing),yaw:settings.yaw*Math.PI/180,elevation:settings.elevation,scale:settings.scale});
  }
  if(rebuild){this.renderer.draw({tick:0,size:map?.size??256},stamps);await this.renderer.ready();if(version!==this.generation||this.stopped)return;this.sceneKey=sceneKey;}
  else if(!isSubject)for(const stamp of stamps.filter(s=>this.previewIds.includes(s.id)))this.renderer.previewEditorStamp(stamp);
  const subjectKey=isSubject?JSON.stringify([asset,count]):'';
  if(subjectKey!==this.subjectKey){
   this.subject?.dispose();this.subject=undefined;this.subjectKey='';
   if(isSubject){const subject=await InspectionSubject.load(asset,geometryUrl??resourceUrl(asset,'geometry'),count);if(version!==this.generation||this.stopped){subject.dispose();return;}this.subject=subject;this.renderer.mountInspectionSubject(subject.root);this.subjectKey=subjectKey;if(this.subjectControls)subject.configure(this.subjectControls);}
  }
  if(this.subject){this.subject.root.position.set(settings.x,field.sample(settings.x,settings.z)+settings.elevation,settings.z);this.subject.root.rotation.y=settings.yaw*Math.PI/180;this.subject.root.scale.setScalar(settings.scale*(asset.bindings.render.find(b=>b.geometry)?.scale??1)*(['unit','creature'].includes(asset.kind)?content.rules.unitScale:1));}
  if(resetView&&settings.mode!=='map')this.fit();this.interactive=true;
 }
 fit(){
  const camera=this.renderer.camera,pose=frameModel(this.subject?.worldBounds()??this.renderer.assetBounds(this.previewIds),this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight),camera.yaw,camera.pitch);
  if(!pose)return;
  if(camera.game){camera.lookAt(pose.x,pose.z);return;}
  camera.pose(pose);
 }
 configureSubject(controls:SubjectControls){this.subjectControls=controls;this.subject?.configure(controls);}
 subjectInfo():SubjectInfo|undefined{return this.subject?.info;}
 progress(){return this.subject?.progress();}
 seek(value:number){this.subject?.seek(value);}
 restart(){this.subject?.restart();}
 lightingDiagnostics(){return this.renderer.sky.lightingDiagnostics();}
 capture(){const canvas=this.renderer.capture(1600,Math.max(.1,this.canvas.clientWidth/this.canvas.clientHeight),12);const a=document.createElement('a');a.href=canvas.toDataURL();a.download='asset-preview.png';a.click();}
 dispose(){this.stopped=true;this.generation++;cancelAnimationFrame(this.frame);this.cancel.abort();this.subject?.dispose();this.renderer.destroy();}
}
