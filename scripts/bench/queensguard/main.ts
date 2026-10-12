import {AmbientLight,Color,DirectionalLight,Mesh,MeshBasicMaterial,MeshStandardMaterial,PlaneGeometry,PerspectiveCamera,Scene,WebGLRenderer} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCharacterInstance,type AntState} from '../../../src/render/characters/character-player.js';
import {prepareMaskedTeamColor} from '../../../src/render/settlement/maskedTeamColor.js';
import {PLAYER_COLORS} from '../../../src/shared/player/player';
import {GAME_DISTANCE,GAME_FOV,GAME_PITCH,GAME_ASPECT} from '../../../src/render/camera/camera';

import {content} from '../../../src/content/builtin';
import {geometryModel} from '../../../src/shared/assets/models';
const binding=content.asset(content.get('unit.ants.queensguard').asset);
const modelUrl=new URL('../../../assets/library/asset.models.units.ants-queensguard/geometry.glb',import.meta.url).href;
const select=(id:string)=>document.querySelector<HTMLSelectElement>(`#${id}`)!;
const action=select('action'),distance=select('distance'),angle=select('angle'),facing=select('facing');
const status=document.querySelector('#status')!,phaseControl=document.querySelector<HTMLInputElement>('#phase')!;
const pause=document.querySelector<HTMLButtonElement>('#pause')!,phaseText=document.querySelector('#phase-text')!;
const renderer=new WebGLRenderer({canvas:document.querySelector('canvas')!,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const scene=new Scene();scene.background=new Color('#18181b');scene.add(new AmbientLight(0xfff4e0,.9));
const sun=new DirectionalLight(0xffefdc,3.2);sun.position.set(70,100,40);scene.add(sun);
const ground=new Mesh(new PlaneGeometry(100,100),new MeshBasicMaterial({color:'#27272a'}));
ground.rotation.x=-Math.PI/2;ground.position.set(64,-.05,64);scene.add(ground);
const camera=new PerspectiveCamera(GAME_FOV,innerWidth/innerHeight,.1,250);
function resize(){
 const aspect=innerWidth/innerHeight,d=distance.value==='game'?GAME_DISTANCE:80;
 const pitch=angle.value==='top'?Math.PI/2-.001:GAME_PITCH;
 renderer.setSize(innerWidth,innerHeight);camera.aspect=aspect;
 camera.fov=Math.min(75,2*Math.atan(Math.tan(GAME_FOV*Math.PI/360)*Math.max(1,GAME_ASPECT/aspect))*180/Math.PI);
 camera.position.set(64,Math.sin(pitch)*d,60+Math.cos(pitch)*d);camera.lookAt(64,0,60);camera.updateProjectionMatrix();
}
addEventListener('resize',resize);distance.addEventListener('change',resize);angle.addEventListener('change',resize);resize();
try{
 const gltf=await new GLTFLoader().loadAsync(modelUrl);
 const warriorBinding=content.asset(content.get('unit.ants.warrior').asset);
 const warriorGltf=await new GLTFLoader().loadAsync(new URL('../../../assets/library/asset.models.units.ants-cleaver-warrior/geometry.glb',import.meta.url).href);
 const capabilities=geometryModel(binding.file!)!.capabilities;
 const instances=PLAYER_COLORS.map((_,owner)=>owner).flatMap(owner=>[0,1].map(row=>{
  const reference=row===1,b=reference?warriorBinding:binding;
  const instance=createCharacterInstance(reference?warriorGltf:gltf,b.character,reference?geometryModel(warriorBinding.file!)!.capabilities:capabilities);
  instance.root.traverse(object=>{if(object instanceof Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof MeshStandardMaterial)prepareMaskedTeamColor(material);});
  instance.player.setTeamColor(PLAYER_COLORS[owner]!);
  instance.root.scale.setScalar((b.scale??1)*(content.get(reference?'unit.ants.warrior':'unit.ants.queensguard').modelScale??1));
  instance.root.position.set(49+(owner%4)*10,0,50+Math.floor(owner/4)*20+row*9);scene.add(instance.root);return instance;
 }));
 let playing=true,phase=0,last=performance.now();
 const setPlaying=(value:boolean)=>{playing=value;pause.textContent=value?'Pause':'Play';};
 pause.addEventListener('click',()=>setPlaying(!playing));
 action.addEventListener('change',()=>{phase=0;for(const [index,{player}] of instances.entries())player.setState((index%2===1&&action.value==='cast'?'idle':action.value) as AntState,{restart:true,fade:0});});
 phaseControl.addEventListener('input',()=>{setPlaying(false);phase=Number(phaseControl.value)/100;});
 function frame(now:number){
  const dt=Math.min(.1,(now-last)/1000);last=now;
  if(playing)phase=(phase+dt/instances[0]!.player.clipDuration())%1;
  for(const {root,player} of instances){root.rotation.y=Number(facing.value)*Math.PI/180;player.seek(phase);}
  phaseControl.value=String(phase*100);phaseText.textContent=`${Math.round(phase*100)}%${action.value==='attack'?` · contact at ${Math.round(instances[0]!.player.attackContact()*100)}%`:''}`;
  renderer.render(scene,camera);status.textContent=`8 Queensguards + 8 Warriors · all eight player colors · ${renderer.info.render.calls} draws · published model · motion review`;
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}catch(error){status.textContent=`Queensguard could not load: ${String(error)}`;console.error(error);}
