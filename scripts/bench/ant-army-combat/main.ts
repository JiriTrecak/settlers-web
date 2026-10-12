import {AmbientLight,Color,DirectionalLight,Mesh,MeshBasicMaterial,PlaneGeometry,PerspectiveCamera,Scene,WebGLRenderer} from 'three';
import {HeightField} from '../../../src/shared/map/height';
import {content} from '../../../src/content/builtin';
import {SettlementLayer} from '../../../src/render/settlement/settlementLayer';
import {GAME_FOV,GAME_PITCH,GAME_ASPECT} from '../../../src/render/camera/camera';
import {armyRoster,createArmyEncounter,engageArmies,castArmyHeroSpell} from './scenario';
const params=new URLSearchParams(location.search),multiplier=params.get('army')==='large'?2:1;
const heroDefinition=params.get('hero')==='rootbreaker'?'unit.ants.rootbreaker':'unit.ants.marshal';
let game=createArmyEncounter(multiplier,heroDefinition),engaged=false,playing=false;
const roster=document.querySelector('#roster')!;
for(const row of armyRoster){const el=document.createElement('span');el.textContent=`${row.count*(row.slug==='marshal'?1:multiplier)} ${content.get(row.slug==='marshal'?heroDefinition:'unit.ants.'+row.slug).name}`;roster.append(el);}
const heroSelect=document.querySelector<HTMLSelectElement>('#hero-select')!;heroSelect.value=heroDefinition.split('.').at(-1)!;heroSelect.onchange=()=>{params.set('hero',heroSelect.value);location.search=params.toString();};
for(const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="?army="]')){
 const destination=new URL(link.href);destination.searchParams.set('hero',heroSelect.value);link.href=destination.href;
}
const heroCommands=document.querySelector('#hero-commands')!,orderStatus=document.querySelector('#order-status')!;
const hero=game.entities.find(e=>e.owner==='player.1'&&content.get(e.definition).hero)!;
for(const binding of content.get(hero.definition).behaviors.abilities!.bindings){
 const ability=content.abilityLibrary.abilities.find(a=>a.id===binding.ability)!;
 if(ability.activation==='passive')continue;
 const button=document.createElement('button');button.textContent=ability.name;button.title=ability.description;
 button.onclick=()=>{const result=castArmyHeroSpell(game,binding.id);orderStatus.textContent=result.accepted?`${ability.name} ordered`:result.reason??'Order rejected';};heroCommands.append(button);
}
const canvas=document.querySelector('canvas')!,renderer=new WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const scene=new Scene();scene.background=new Color('#18181b');scene.add(new AmbientLight(0xfff4e0,.9));
const sun=new DirectionalLight(0xffefdc,3.2);sun.position.set(70,100,40);scene.add(sun);
const ground=new Mesh(new PlaneGeometry(500,500),new MeshBasicMaterial({color:'#27272a'}));ground.rotation.x=-Math.PI/2;ground.position.set(128,-.05,128);scene.add(ground);
const camera=new PerspectiveCamera(GAME_FOV,innerWidth/innerHeight,.1,650);
const zoom=document.querySelector<HTMLInputElement>('#zoom')!,angle=document.querySelector<HTMLSelectElement>('#angle')!,focus={x:128,y:128};
function resize(){const aspect=innerWidth/innerHeight,pitch=angle.value==='top'?Math.PI/2-.001:GAME_PITCH,d=Number(zoom.value);renderer.setSize(innerWidth,innerHeight);camera.aspect=aspect;camera.fov=Math.min(75,2*Math.atan(Math.tan(GAME_FOV*Math.PI/360)*Math.max(1,GAME_ASPECT/aspect))*180/Math.PI);camera.position.set(focus.x,Math.sin(pitch)*d,focus.y+Math.cos(pitch)*d);camera.lookAt(focus.x,0,focus.y);camera.updateProjectionMatrix();}
addEventListener('resize',resize);zoom.oninput=resize;angle.onchange=resize;resize();
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom.value=String(Math.max(60,Math.min(220,Number(zoom.value)+Math.sign(e.deltaY)*8)));resize();},{passive:false});
let drag:{x:number;y:number}|undefined;
canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{if(!drag)return;const scale=Number(zoom.value)/innerHeight;focus.x-=(e.clientX-drag.x)*scale;focus.y-=(e.clientY-drag.y)*scale;drag={x:e.clientX,y:e.clientY};resize();};canvas.onpointerup=()=>{drag=undefined;};
const layer=new SettlementLayer(scene),field=new HeightField(game.map.size);layer.viewer(0,owner=>owner==='player.1'?'own':'enemy');layer.preloadAssets([...new Set(game.entities.map(e=>content.get(e.definition).asset))]);await layer.ready;
const speed=document.querySelector<HTMLSelectElement>('#speed')!,status=document.querySelector('#status')!,pause=document.querySelector<HTMLButtonElement>('#pause')!;
let last=performance.now(),remainder=0;
function engage(){if(!engaged){engageArmies(game);engaged=true;}}
pause.onclick=()=>{engage();playing=!playing;pause.textContent=playing?'Pause':'Resume';};
document.querySelector<HTMLButtonElement>('#restart')!.onclick=()=>location.reload();
document.querySelector<HTMLButtonElement>('#step')!.onclick=()=>{engage();playing=false;pause.textContent='Resume';game.tick();remainder=0;};
function frame(now:number){const dt=Math.min(.1,(now-last)/1000);last=now;if(playing){remainder+=dt*40*Number(speed.value);while(remainder>=1){game.tick();remainder--;}}
 layer.update(game.view(),field,game.state.tick+remainder);renderer.render(scene,camera);
 const alive=(owner:string)=>game.entities.filter(e=>e.owner===owner&&e.definition!=='unit.ants.settler'&&e.hp!>0).length;
 status.textContent=`${engaged?'Battle':'Formation ready'} · Tick ${game.state.tick} · Red ${alive('player.1')} / Blue ${alive('player.2')} · ${game.state.spellDeliveries.length} spell flights · ${renderer.info.render.calls} draws`;
 requestAnimationFrame(frame);
}requestAnimationFrame(frame);
