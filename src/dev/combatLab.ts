/** Disposable scenarios using the actual simulation, assets and entity renderer.
 * No connection to a running match, map storage, or network command channel. */
import {Scene,Color,WebGLRenderer,OrthographicCamera,DirectionalLight,HemisphereLight,Mesh,BoxGeometry,PlaneGeometry,MeshStandardMaterial,GridHelper,Raycaster,Vector2,Vector3,Plane,PCFSoftShadowMap} from 'three';
import {Game} from '../sim/game/game';
import {emptyUtcMap} from '../shared/map/utcmap';
import {HeightField} from '../shared/map/height';
import {SettlementLayer} from '../render/settlement/settlementLayer';
import type {Placement} from '../content/schema';
import {commandFeedback} from '../presentation/commandFeedback';
import {content} from '../content/builtin';
import './combatLab.css';

document.body.innerHTML=`<aside><h1>Combat Lab</h1><p>Disposable simulation · real game models and combat systems</p><label>Scenario <select id="scenario"><option value="duel">Warrior duel</option><option value="arrow">Archer and moving target</option><option value="chase">Melee pursuit and reversal</option><option value="army">12 vs 12 mixed army</option><option value="micro">Compact army short move</option><option value="cast">Marshal spell release</option><option value="cast-ultimate">Marshal ultimate release</option><option value="advanced">24 vs 24 advanced mixed army</option><option value="traffic">48-unit counterflow passage</option><option value="packing">Packed destination escape</option><option value="packing-long">Parked allies and distant move</option><option value="packing-waypoint">Occupied corridor waypoint</option><option value="packing-crowd">Packed army final approach</option><option value="yielding">Three-unit deadlock recovery</option><option value="yielding-turn">Turning actor at a narrow gap</option><option value="yielding-mouth">Narrow-mouth yielding reversal</option></select></label><label>Passage width <select id="gap"><option value="1">1 cell</option><option value="3" selected>3 cells</option><option value="5">5 cells</option></select></label><button id="reset">Reset scenario</button><button id="engage">Engage</button><button id="reverse">Reverse red army</button><button id="stop">Stop red army</button><button id="target-move">Move blue target</button><button id="target-reverse">Reverse blue target</button><label>Speed <select id="speed"><option value="0.25">¼× slow motion</option><option value="1" selected>1×</option></select></label><label>Zoom <select id="zoom"><option value="0.65">Wide overview</option><option value="1" selected>Overview</option><option value="2">Close-up</option></select></label><button id="pause">Pause</button><button id="step">Step 25 ms</button><button id="stall">Stall simulation</button><p>Right-click ground to move the red army. Observe turns, contact, projectiles and health.</p><output id="status" aria-live="off">Loading models…</output></aside><main></main>`;
const scene=new Scene();scene.background=new Color('#202a2d');
const renderer=new WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=PCFSoftShadowMap;
document.querySelector('main')!.append(renderer.domElement);
const camera=new OrthographicCamera(-18,18,14,-14,.1,200);camera.position.set(151,34,151);camera.lookAt(128,0,128);
const light=new DirectionalLight('#fff0d7',3);light.position.set(116,35,139);light.target.position.set(128,0,128);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-30,right:30,top:30,bottom:-30,far:100});scene.add(light,light.target,new HemisphereLight('#c3d5e7','#655037',2));
const ground=new Mesh(new PlaneGeometry(80,80),new MeshStandardMaterial({color:'#74715a',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(128,-.015,128);ground.receiveShadow=true;scene.add(ground);
const grid=new GridHelper(60,60,'#929581','#777b6b');grid.position.set(128,.005,128);scene.add(grid);
const field=new HeightField();
let layer=new SettlementLayer(scene),game:Game,paused=false,stalled=false,acc=0,previous=performance.now(),frameCount=0,frameMs=0,lastInput:number|null=null,response:string='No order yet';
const select=document.querySelector<HTMLSelectElement>('#scenario')!,speed=document.querySelector<HTMLSelectElement>('#speed')!,status=document.querySelector<HTMLOutputElement>('#status')!;
const red=()=>game.entities.filter(e=>e.placement?.startsWith('lab.red')&&e.hp!>0);
const blue=()=>game.entities.filter(e=>e.placement?.startsWith('lab.blue')&&e.hp!>0);
const walls:Mesh[]=[];
function reset(){
 for(const wall of walls){scene.remove(wall);wall.geometry.dispose();(wall.material as MeshStandardMaterial).dispose();}walls.length=0;
 const placements:Placement[]=[];const count=select.value==='traffic'||select.value==='advanced'?24:select.value==='army'?12:1;
 for(const side of ['red','blue'])for(let i=0;i<count;i++){
  const role=select.value==='advanced'?['marshal','warrior','hunter','archer','bombardier','warrior'][i%6]:select.value==='chase'&&side==='blue'?'settler':select.value==='arrow'&&side==='red'?'archer':count>1&&i%3===2?'archer':'warrior';
  placements.push({id:`lab.${side}.${i}`,definition:`unit.ants.${role}`,owner:side==='red'?'player.1':'player.2',rotation:side==='red'?270:90,position:{x:(side==='red'?122:134)+(i%3)*(side==='red'?-1:1),y:126+Math.floor(i/3)*1.5}});
 }
 if(select.value==='traffic')for(const p of placements){const i=Number(p.id.split('.').at(-1)),side=p.id.includes('.red.');p.owner='player.1';p.position={x:(side?108:145)+i%4,y:119+Math.floor(i/4)};p.rotation=side?90:270;}
 if(select.value==='chase'||select.value==='arrow')for(const p of placements){p.position={x:p.id.includes('.red.')?122:128,y:126};p.rotation=90;}
 if(select.value.startsWith('packing')){
  placements.length=0;
  placements.push({id:'lab.red.0',definition:'unit.ants.warrior',owner:'player.1',rotation:0,position:{x:126,y:126}});
  (select.value==='packing-waypoint'?[[127,126],[136,126]]:[[125,126],[127,126],[126,125],[126,127]]).forEach(([x,y],i)=>placements.push({id:`lab.blue.${i}`,definition:'unit.ants.warrior',owner:'player.1',rotation:0,position:{x,y}}));
 }
 if(select.value==='packing-crowd'){
  placements.length=0;
  placements.push({id:'lab.red.0',definition:'unit.ants.bombardier',owner:'player.1',rotation:90,position:{x:126,y:126}});
  const crowd=[[146,117],[147,119],[149,121],[146,121],[147,122],[147,121],[148,122],[149,122],[146,123],[145,122],[148,119],[147,123],[148,123],[149,123],[149,120],[149,119],[146,120],[147,120],[148,121],[146,122]];
  crowd.forEach(([x,y],i)=>placements.push({id:`lab.blue.${i}`,definition:'unit.ants.warrior',owner:'player.1',rotation:90,position:{x:x-19,y:y+5}}));
 }
 if(select.value.startsWith('yielding')){
  placements.length=0;
  (select.value==='yielding-mouth'?[129,127,128]:[127,129,128]).forEach((x,i)=>placements.push({id:`lab.red.${i}`,definition:'unit.ants.warrior',owner:'player.1',rotation:i===1?270:90,position:{x,y:126}}));
 }
 if(select.value.startsWith('cast')){
  placements.length=0;
  placements.push({id:'lab.red.0',definition:'unit.ants.marshal',owner:'player.1',rotation:90,position:{x:125,y:126}});
  placements.push({id:'lab.blue.0',definition:'unit.ants.warrior',owner:'player.2',rotation:270,position:{x:130,y:126}});
 }
 if(select.value==='micro'){
  placements.length=0;
  for(let i=0;i<12;i++)placements.push({id:`lab.red.${i}`,definition:'unit.ants.warrior',owner:'player.1',rotation:90,position:{x:124+i%4,y:125+Math.floor(i/4)}});
 }
 // Map placement coordinates are integral; keep rows readable and deterministic.
 for(const p of placements)p.position.y=Math.round(p.position.y);
 game=new Game({...emptyUtcMap(),entities:placements},[{player:0,kind:'human'},{player:1,kind:'human'}]);
 if(select.value.startsWith('cast')){
  const hero=red()[0];hero.progression!.experience=3200;
  game.command(hero.owner,{type:'learnAbility',actor:hero.id,ability:select.value==='cast-ultimate'?'spell.marshal.crownfall':'spell.marshal.faultline'});
 }
 if(select.value==='traffic'){
  const gap=Number(document.querySelector<HTMLSelectElement>('#gap')!.value);
  for(let y=0;y<256;y++)if(y<121||y>=121+gap)game.spatial.terrain[y*256+128]=0;
  for(const [z,depth] of [[113,15],[(121+gap-.5+140.5)/2,140.5-(121+gap-.5)]]){const wall=new Mesh(new BoxGeometry(1,.6,depth),new MeshStandardMaterial({color:'#4d5149'}));wall.position.set(128,.3,z);scene.add(wall);walls.push(wall);}
 }
 if(select.value.startsWith('yielding')){
  game.state.tick=200;
  for(let y=0;y<256;y++)if(y!==126)game.spatial.terrain[y*256+128]=0;
  for(const [z,depth] of [[119.5,12],[133,13]]){const wall=new Mesh(new BoxGeometry(1,.6,depth),new MeshStandardMaterial({color:'#4d5149'}));wall.position.set(128,.3,z);scene.add(wall);walls.push(wall);}
 }
 for(const owner of ['player.1','player.2'] as const){const actors=game.entities.filter(e=>e.placement?.startsWith('lab.')&&e.owner===owner).map(e=>e.id);if(actors.length)game.command(owner,{type:'hold',actors});}
 camera.zoom=select.value==='packing-long'?.65:select.value==='traffic'?.6:select.value==='advanced'?.8:select.value==='packing'||select.value.startsWith('cast')?2:1;camera.updateProjectionMatrix();
 acc=0;response='No order yet';lastInput=null;layer.select(red().map(e=>e.id));
}
function issue(action:Parameters<Game['command']>[1]){
 lastInput=performance.now();response='Awaiting next tick';const receipt=game.command('player.1',action);if(!receipt.accepted){response=receipt.reason??'Order rejected';lastInput=null;return;}
 const cue=commandFeedback(action,game.view('player.1'),content);if(cue)layer.commandFeedback(cue,field);
}
function tick(){
 game.tick();if(lastInput!==null){response=`Order → next simulation tick: ${(performance.now()-lastInput).toFixed(1)} ms`;lastInput=null;}
}
document.querySelector('#reset')!.addEventListener('click',()=>{layer.destroy(scene);layer=new SettlementLayer(scene);reset()});
document.querySelector('#engage')!.addEventListener('click',()=>{if(select.value.startsWith('cast')){issue({type:'cast',actor:red()[0].id,ability:select.value==='cast-ultimate'?'spell.marshal.crownfall':'spell.marshal.faultline',point:{x:130,y:126}});return;}if(select.value==='micro'){issue({type:'move',actors:red().map(e=>e.id),destination:{x:132,y:126}});return;}if(select.value.startsWith('yielding')){
  red().forEach((e,i)=>{
   const mouth=select.value==='yielding-mouth',goal={x:mouth?(i?137:117):(i?117:137),y:126};issue({type:'move',actors:[e.id],destination:goal});
   e.unit!.position={x:(mouth?[128800,127400,128400]:[127400,128800,128400])[i],y:126000};e.unit!.segment=null;e.unit!.lastMovedTick=0;
   e.rotation=mouth?(i?90:270):(i===1?270:90);if(select.value==='yielding-turn'&&i===1)e.rotation=90;e.unit!.route=(!mouth&&i===2?[{x:129,y:126},goal]:[goal]).map(p=>game.spatial.cell(p));e.unit!.goal=game.spatial.cell(goal);
  });return;
 }if(select.value==='packing-crowd'){const e=red()[0],goal={x:131,y:127};issue({type:'move',actors:[e.id],destination:goal});e.unit!.position={x:126497,y:126437};e.rotation=90;e.unit!.segment=null;e.unit!.route=[game.spatial.cell(goal)];e.unit!.goal=game.spatial.cell(goal);return;}if(select.value==='packing-waypoint'){const e=red()[0],goal={x:136,y:126};issue({type:'move',actors:[e.id],destination:goal});e.unit!.position={x:126400,y:126000};e.rotation=90;e.unit!.segment=null;e.unit!.route=[game.spatial.cell({x:127,y:126}),game.spatial.cell(goal)];e.unit!.goal=game.spatial.cell(goal);return;}if(select.value.startsWith('packing')){issue({type:'move',actors:red().map(e=>e.id),destination:select.value==='packing-long'?{x:146,y:126}:{x:129,y:129}});return;}if(select.value==='traffic'){issue({type:'move',actors:red().map(e=>e.id),destination:{x:148,y:121}});game.command('player.1',{type:'move',actors:blue().map(e=>e.id),destination:{x:108,y:121}});return;}const target=blue()[0];if(select.value==='chase'||select.value==='arrow'){if(target){issue({type:'attack',actors:red().map(e=>e.id),target:target.id});game.command('player.2',{type:'move',actors:blue().map(e=>e.id),destination:{x:138,y:126}});}return;}game.command('player.2',{type:'stop',actors:blue().map(e=>e.id)});if(target)issue({type:'move',actors:red().map(e=>e.id),destination:{x:target.x,y:target.y},attackMove:true});});
document.querySelector('#reverse')!.addEventListener('click',()=>issue({type:'move',actors:red().map(e=>e.id),destination:{x:115,y:126}}));
document.querySelector('#target-move')!.addEventListener('click',()=>game.command(select.value==='traffic'||select.value.startsWith('packing')?'player.1':'player.2',{type:'move',actors:blue().map(e=>e.id),destination:{x:138,y:116}}));
document.querySelector('#target-reverse')!.addEventListener('click',()=>game.command(select.value==='traffic'||select.value.startsWith('packing')?'player.1':'player.2',{type:'move',actors:blue().map(e=>e.id),destination:{x:126,y:138}}));
document.querySelector('#stop')!.addEventListener('click',()=>issue({type:'stop',actors:red().map(e=>e.id)}));
document.querySelector('#pause')!.addEventListener('click',e=>{paused=!paused;(e.target as HTMLButtonElement).textContent=paused?'Resume':'Pause'});
document.querySelector('#stall')!.addEventListener('click',e=>{stalled=!stalled;(e.target as HTMLButtonElement).textContent=stalled?'End simulation stall':'Stall simulation'});
document.querySelector('#step')!.addEventListener('click',()=>{paused=true;document.querySelector('#pause')!.textContent='Resume';tick()});
const ray=new Raycaster(),plane=new Plane(new Vector3(0,1,0),0),hit=new Vector3();
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==2)return;const r=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);if(ray.ray.intersectPlane(plane,hit))issue({type:'move',actors:red().map(e=>e.id),destination:{x:Math.round(hit.x),y:Math.round(hit.z)}})});
function resize(){const r=document.querySelector('main')!.getBoundingClientRect(),aspect=r.width/r.height;renderer.setSize(r.width,r.height);camera.left=-15*aspect;camera.right=15*aspect;camera.updateProjectionMatrix()}
document.querySelector<HTMLSelectElement>('#zoom')!.addEventListener('change',e=>{camera.zoom=Number((e.target as HTMLSelectElement).value);camera.updateProjectionMatrix()});
window.addEventListener('resize',resize);reset();resize();
function frame(now:number){
 const dt=Math.min(100,now-previous);previous=now;if(!paused&&!stalled){acc+=dt*Number(speed.value);while(acc>=25){tick();acc-=25;}}
 const snapshot=game.view(),view={...snapshot,entities:snapshot.entities.filter(e=>game.context.get(e.id)?.placement?.startsWith('lab.'))};
 layer.update(view,field,game.state.tick,paused?0:Number(speed.value));renderer.render(scene,camera);
 frameCount++;frameMs+=dt;if(frameMs>=200){
  status.textContent=`${Math.round(frameCount*1000/frameMs)} FPS · ${renderer.info.render.triangles.toLocaleString()} triangles\nTick ${game.state.tick}${stalled?' · SIMULATION STALLED (renderer live)':''}\n${select.value==='traffic'?`Crossed: ${red().filter(e=>e.x>130).length}/24 east · ${blue().filter(e=>e.x<126).length}/24 west\n`:''}${select.value.startsWith('yielding')?`Traffic recovery: ${red().some(e=>e.unit?.detour?.yielding)?'active':'inactive'}\n`:''}${select.value.startsWith('packing')?`Local escape: ${red()[0]?.unit?.detour?'active':'inactive'}\n`:''}${select.value==='army'||select.value==='advanced'?`Alive: ${red().length} red · ${blue().length} blue\n`:''}${response}\n\n`+[...red(),...blue()].slice(0,8).map(e=>`${e.owner} ${e.definition.split('.').at(-1)} #${e.id}\nHP ${e.hp} · yaw ${e.rotation.toFixed(0)}°\n${e.spellcasting?.pending?`Cast ${e.spellcasting.pending.startTick} → ${e.spellcasting.pending.resolveTick}`:e.unit?.attack?`Strike ${e.unit.attack.started} → ${e.unit.attack.impact} → ${e.unit.attack.ends}`:e.unit?.route.length?'Moving / turning':'Idle'}`).join('\n\n');frameCount=0;frameMs=0;
 }requestAnimationFrame(frame);
}requestAnimationFrame(frame);
