import {AmbientLight,Color,DirectionalLight,Mesh,MeshBasicMaterial,MeshStandardMaterial,PlaneGeometry,PerspectiveCamera,Scene,WebGLRenderer} from 'three';
import {SettlementLayer} from '../../../src/render/settlement/settlementLayer';
import {HeightField} from '../../../src/shared/map/height';
import {GAME_DISTANCE,GAME_FOV,GAME_PITCH,GAME_ASPECT} from '../../../src/render/camera/camera';
import {content} from '../../../src/content/builtin';
import type {EntityView,SettlementView} from '../../../src/sim/game/observation';
const canvas=document.querySelector('canvas')!,renderer=new WebGLRenderer({canvas,antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const scene=new Scene();scene.background=new Color('#18181b');scene.add(new AmbientLight(0xfff4e0,.9));const sun=new DirectionalLight(0xffefdc,3.2);sun.position.set(70,100,40);scene.add(sun);
const ground=new Mesh(new PlaneGeometry(100,100),new MeshBasicMaterial({color:'#27272a'}));ground.rotation.x=-Math.PI/2;ground.position.set(64,-.05,64);scene.add(ground);
const camera=new PerspectiveCamera(GAME_FOV,innerWidth/innerHeight,.1,250);camera.position.set(64,27,94);camera.lookAt(64,2,60);
const distanceControl=document.querySelector<HTMLSelectElement>('#distance')!;
const facing=document.querySelector<HTMLSelectElement>('#facing')!;
function resize(){const aspect=innerWidth/innerHeight,distance=distanceControl.value==='game'?GAME_DISTANCE:60;renderer.setSize(innerWidth,innerHeight);camera.aspect=aspect;camera.fov=Math.min(75,2*Math.atan(Math.tan(GAME_FOV*Math.PI/360)*Math.max(1,GAME_ASPECT/aspect))*180/Math.PI);camera.position.set(64,Math.sin(GAME_PITCH)*distance,60+Math.cos(GAME_PITCH)*distance);camera.lookAt(64,0,60);camera.updateProjectionMatrix();}
addEventListener('resize',resize);distanceControl.addEventListener('change',resize);resize();
const layer=new SettlementLayer(scene),field=new HeightField(128);layer.viewer(0,()=> 'own');
const definition='unit.ants.warrior',def=content.get(definition);layer.preloadAssets([def.asset]);await layer.ready;
const action=document.querySelector<HTMLSelectElement>('#action')!,status=document.querySelector('#status')!;let tick=0,last=performance.now();
function frame(now:number){const dt=Math.min(.1,(now-last)/1000);last=now;tick+=dt*40;const moving=action.value==='walk'||action.value==='run';
 const entities=[0,1,2,7].flatMap((owner,column)=>[0,1,2].map(row=>{const x=49+column*10,y=52+row*9;return {id:column*3+row+1,definition,owner:`player.${owner+1}`,x,y,rotation:Number(facing.value),hp:300,unit:{moving,strolling:action.value==='walk',contained:false,cargo:null,target:null,cooldown:0,...(action.value==='attack'?{attack:{target:null,started:Math.floor(tick/54)*54,impact:Math.floor(tick/54)*54+12,ends:Math.floor(tick/54)*54+22,cycleTicks:54,released:tick%54>=12}}:{})}} as EntityView;}));
 layer.update({entities} as SettlementView,field,tick);renderer.render(scene,camera);status.textContent=`12 independent warriors · red / blue / green / white · ${renderer.info.render.calls} draws`;requestAnimationFrame(frame);}
requestAnimationFrame(frame);
