import {Renderer} from '../../../src/render';
import {HeightField} from '../../../src/shared/map/height';
import {parseUtcMap,type MapStamp,type UtcMap} from '../../../src/shared/map/utcmap';
import {emptyLandscape} from '../../../src/shared/landscape/curve';
import {projectCatalogue,projectMeshUrl} from '../../../src/shared/assets/project';
import type {AssetDefinition} from '../../../src/shared/authoring/asset';
import {compileMapScene} from '../../../src/shared/authoring/mapScene';
import {landscapeCatalogue} from '../../../src/shared/authoring/catalogue';
import {authoringSceneSchema} from '../../../src/shared/authoring/layers';
import {emptyUtcMap} from '../../../src/shared/map/utcmap';
import {frameModel} from './framing';
const maps=import.meta.glob('../../../assets/maps/{campaign,skirmish,showcase}/**/*.utcmap',{query:'?raw',import:'default'}) as Record<string,()=>Promise<string>>;
export const previewMaps=Object.entries(maps).map(([id,load])=>({id,name:id.split('/').at(-1)!.replace('.utcmap','').replaceAll('-',' '),load:async()=>{const map=parseUtcMap(JSON.parse(await load()));if(!map)throw Error('Invalid preview map');return map;}}));
export type PreviewSettings={mode:'single'|'clump'|'patch'|'formation'|'map';map:string;x:number;z:number;elevation:number;yaw:number;scale:number;hour:number;view:'game'|'free'|'top'};
export function resourceUrl(asset:AssetDefinition,role:string,index=1){return '/__studio/authoring/resource?'+new URLSearchParams({id:asset.id,role,index:String(index),revision:String(asset.revision)});}
export class ProductionPreview{
 private renderer:Renderer;private frame=0;private stopped=false;private drag:{x:number;y:number;button:number}|null=null;
 private cancel=new AbortController();private generation=0;
 private interactive=false;private lastViewKey='';private previewIds:string[]=[];
 private loadedMaps=new Map<string,Promise<UtcMap>>();
 constructor(private canvas:HTMLCanvasElement,private library:AssetDefinition[]=[],private onPlacement?:(x:number,z:number)=>void){
  const catalog=projectCatalogue(),urls=new Map(catalog.assets.flatMap(a=>{const url=projectMeshUrl(a.file);return url?[[a.id,url] as [string,string]]:[];}));
  this.renderer=new Renderer(canvas,urls);this.renderer.setKinds(new Map(catalog.assets.map(a=>[a.id,a.type])));this.renderer.setGridMode('none');
  const {signal}=this.cancel;
  canvas.addEventListener('pointerdown',e=>{if(!this.interactive)return;if(e.button===0&&e.shiftKey){const point=this.renderer.pickGround(e.clientX,e.clientY);if(point)this.onPlacement?.(point.x,point.z);e.preventDefault();return;}if(e.button===0||e.button===1||e.button===2){this.drag={x:e.clientX,y:e.clientY,button:e.button};canvas.setPointerCapture(e.pointerId);}},{signal});
  canvas.addEventListener('pointermove',e=>{if(!this.drag)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;if(this.drag.button===2)this.renderer.camera.orbitScreen(dx,dy);else this.renderer.camera.panScreen(dx,dy,canvas.clientHeight);this.drag.x=e.clientX;this.drag.y=e.clientY;},{signal});
  canvas.addEventListener('pointerup',()=>{this.drag=null;},{signal});canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
  canvas.addEventListener('wheel',e=>{e.preventDefault();this.renderer.camera.zoomBy(Math.exp(e.deltaY*.001));},{signal,passive:false});
  const draw=(now:number)=>{if(this.stopped)return;if(!document.hidden)this.renderer.present(now);this.frame=requestAnimationFrame(draw);};this.frame=requestAnimationFrame(draw);
 }
 async show(asset:AssetDefinition,settings:PreviewSettings){
  const version=++this.generation;this.interactive=false;
  let map:UtcMap|undefined;
  if(settings.mode==='map'){const entry=previewMaps.find(m=>m.id===settings.map);if(entry){let loading=this.loadedMaps.get(entry.id);if(!loading){loading=entry.load();this.loadedMaps.set(entry.id,loading);}map=await loading;}}
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
  this.renderer.setAssets(urls,new Map([[previewId,{sourceAsset:sourceId,transform:asset.transform,groundContact:asset.capabilities.groundContact?.mode}]]));
  const kinds=new Map(catalog.assets.map(a=>[a.id,a.type]));kinds.set(previewId,asset.capabilities.groundContact?.mode==='water'?'water':asset.bindings.scenery[0]?.type??'prop');this.renderer.setKinds(kinds);
  const compiled=map?compileMapScene(map,landscapeCatalogue(definitions)):undefined;
  const field=compiled?.field??new HeightField(256);if(!compiled)field.load([],-2);
  this.renderer.setTerrain(field);this.renderer.setLandscape(map?.landscape??emptyLandscape());this.renderer.sky.setPlaying(false);this.renderer.sky.setHour(settings.hour);
  const viewKey=JSON.stringify([asset.id,settings.view,settings.mode,settings.map]),resetView=viewKey!==this.lastViewKey;
  if(resetView){
   this.renderer.camera.setGame(settings.view==='game',map?.size??256);this.renderer.camera.minZoom=1;this.renderer.camera.maxZoom=10000;
   if(settings.view==='top')this.renderer.camera.setTopDown();
   this.renderer.camera.pose({x:settings.x,z:settings.z,yaw:settings.view==='top'?0:-Math.PI/4,pitch:settings.view==='top'?Math.PI/2:Math.PI/4,zoom:asset.recipe||asset.water?30:settings.mode==='single'?8:20,gameZoom:.7});
   this.lastViewKey=viewKey;
  }
  const stamps:MapStamp[]=[...(compiled?.stamps??map?.stamps??[])];
  const count=!asset.usesGeometry?0:settings.mode==='clump'?9:settings.mode==='patch'?49:settings.mode==='formation'?12:1;
  this.previewIds=[];
  for(let i=0;i<count;i++){const columns=settings.mode==='formation'?4:Math.sqrt(count),spacing=settings.mode==='patch'?.7:settings.mode==='clump'?3:1.8;
   const id=previewId+'.'+i;this.previewIds.push(id);
   stamps.push({id,asset:previewId,x:settings.x-.5+(count===1?0:(i%columns-(columns-1)/2)*spacing),y:settings.z-.5+(count===1?0:(Math.floor(i/columns)-(Math.ceil(count/columns)-1)/2)*spacing),yaw:settings.yaw*Math.PI/180,elevation:settings.elevation,scale:settings.scale});
  }
  this.renderer.draw({tick:0,size:map?.size??256,settlement:{revision:0,entities:[],outcome:null,events:[],objectives:{}}},stamps);await this.renderer.ready();if(version!==this.generation||this.stopped)return;this.renderer.draw({tick:0,size:map?.size??256,settlement:{revision:0,entities:[],outcome:null,events:[],objectives:{}}},stamps);
  if(resetView&&settings.mode!=='map')this.fit();this.interactive=true;
 }
 fit(){
  const camera=this.renderer.camera,pose=frameModel(this.renderer.assetBounds(this.previewIds),this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight),camera.yaw,camera.pitch);
  if(!pose)return;
  if(camera.game){camera.lookAt(pose.x,pose.z);return;}
  camera.pose(pose);
 }
 capture(){const canvas=this.renderer.capture(1600,Math.max(.1,this.canvas.clientWidth/this.canvas.clientHeight),12);const a=document.createElement('a');a.href=canvas.toDataURL();a.download='asset-preview.png';a.click();}
 dispose(){this.stopped=true;this.generation++;cancelAnimationFrame(this.frame);this.cancel.abort();this.renderer.destroy();}
}
