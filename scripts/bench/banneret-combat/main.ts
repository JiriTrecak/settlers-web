import {AmbientLight,Color,DirectionalLight,Mesh,MeshBasicMaterial,PlaneGeometry,PerspectiveCamera,Scene,WebGLRenderer} from 'three';
import {Game} from '../../../src/sim/game/game';
import {emptyUtcMap} from '../../../src/shared/map/utcmap';
import {HeightField} from '../../../src/shared/map/height';
import {content} from '../../../src/content/builtin';
import {SettlementLayer} from '../../../src/render/settlement/settlementLayer';
import {GAME_FOV,GAME_PITCH,GAME_ASPECT} from '../../../src/render/camera/camera';
const count=new URLSearchParams(location.search).get('count')==='12'?12:3;
const map=emptyUtcMap();map.sandbox=true;
for(const side of [0,1])for(let i=0;i<count;i++){
 const owner=side?'player.2':'player.1';
 map.entities.push({id:`front.${side}.${i}`,definition:'unit.ants.warrior',position:{x:side?77:51,y:50+i*5},rotation:side?270:90,owner});
 map.entities.push({id:`healer.${side}.${i}`,definition:'unit.ants.banneret',position:{x:side?82:46,y:50+i*5},rotation:side?270:90,owner});
}
const game=new Game(map,[{player:0,kind:'human'},{player:1,kind:'human'}]);
for(const e of game.entities)if(e.definition==='unit.ants.warrior')e.hp=Math.floor(e.hp!*.5);
for(const side of [0,1]){
 const owner=side?'player.2':'player.1';
 const result=game.command(owner,{type:'move',actors:game.entities.filter(e=>e.owner===owner).map(e=>e.id),destination:{x:side?51:77,y:Math.round(50+(count-1)*2.5)},attackMove:true});
 if(!result.accepted)throw Error(result.reason);
}
const renderer=new WebGLRenderer({canvas:document.querySelector('canvas')!,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const scene=new Scene();scene.background=new Color('#18181b');scene.add(new AmbientLight(0xfff4e0,.9));
const sun=new DirectionalLight(0xffefdc,3.2);sun.position.set(70,100,40);scene.add(sun);
const ground=new Mesh(new PlaneGeometry(120,120),new MeshBasicMaterial({color:'#27272a'}));ground.rotation.x=-Math.PI/2;ground.position.set(64,-.05,64);scene.add(ground);
const camera=new PerspectiveCamera(GAME_FOV,innerWidth/innerHeight,.1,250);
function resize(){const aspect=innerWidth/innerHeight;renderer.setSize(innerWidth,innerHeight);camera.aspect=aspect;camera.fov=Math.min(75,2*Math.atan(Math.tan(GAME_FOV*Math.PI/360)*Math.max(1,GAME_ASPECT/aspect))*180/Math.PI);camera.position.set(64,Math.sin(GAME_PITCH)*90,(50+(count-1)*2.5)+Math.cos(GAME_PITCH)*90);camera.lookAt(64,0,50+(count-1)*2.5);camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();
const layer=new SettlementLayer(scene),field=new HeightField(map.size);layer.viewer(0,owner=>owner===0?'own':'enemy');layer.preloadAssets([content.get('unit.ants.banneret').asset,content.get('unit.ants.warrior').asset]);await layer.ready;
const volley=document.querySelector<HTMLInputElement>('#volley')!;
volley.checked=new URLSearchParams(location.search).get('pause')==='rally';
const speed=document.querySelector<HTMLSelectElement>('#speed')!;
const status=document.querySelector('#status')!,pause=document.querySelector<HTMLButtonElement>('#pause')!;
let playing=true,last=performance.now(),remainder=0,shots=0;const seen=new Set<number>();
pause.onclick=()=>{playing=!playing;pause.textContent=playing?'Pause':'Play';};document.querySelector<HTMLButtonElement>('#restart')!.onclick=()=>location.reload();
const advance=()=>{game.tick();for(const e of game.entities)for(const s of e.spellStatuses??[])if(s.status==='rallied')seen.add(e.id);shots=seen.size;};
document.querySelector<HTMLButtonElement>('#step')!.onclick=()=>{playing=false;pause.textContent='Play';advance();remainder=0;};
function frame(now:number){const dt=Math.min(.1,(now-last)/1000);last=now;if(playing){remainder+=dt*40*Number(speed.value);while(remainder>=1){advance();remainder--;if(volley.checked&&game.entities.some(e=>e.spellStatuses?.some(s=>s.status==='rallied'))){playing=false;pause.textContent='Play';volley.checked=false;remainder=0;break;}}}
 layer.update(game.view(),field,game.state.tick+remainder);renderer.render(scene,camera);
 const alive=(owner:string)=>game.entities.filter(e=>e.owner===owner&&e.unit&&e.hp!>0).length;
 status.textContent=`Tick ${game.state.tick} · Red ${alive('player.1')} / Blue ${alive('player.2')} · ${shots} rallied allies · ${game.entities.filter(e=>e.spellStatuses?.some(s=>s.status==='rallied')).length} buffed · ${renderer.info.render.calls} draws`;
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
