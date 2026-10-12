import {AmbientLight,Color,DirectionalLight,Mesh,MeshBasicMaterial,PlaneGeometry,PerspectiveCamera,Scene,WebGLRenderer} from 'three';
import {Game} from '../../../src/sim/game/game';
import {emptyUtcMap} from '../../../src/shared/map/utcmap';
import {HeightField} from '../../../src/shared/map/height';
import {content} from '../../../src/content/builtin';
import {SettlementLayer} from '../../../src/render/settlement/settlementLayer';
import {GAME_FOV,GAME_PITCH,GAME_ASPECT} from '../../../src/render/camera/camera';
const count=new URLSearchParams(location.search).get('count')==='1'?1:12;
const map=emptyUtcMap();map.sandbox=true;
for(const side of [0,1])for(let i=0;i<count;i++)map.entities.push({id:`archer.${side}.${i}`,definition:'unit.ants.archer',position:{x:side?85+i%3*4:43-i%3*4,y:54+Math.floor(i/3)*5},rotation:side?270:90,owner:side?'player.2':'player.1'});
const game=new Game(map,[{player:0,kind:'human'},{player:1,kind:'human'}]);
for(const side of [0,1]){
 const owner=side?'player.2':'player.1';
 const result=game.command(owner,{type:'move',actors:game.entities.filter(e=>e.owner===owner).map(e=>e.id),destination:{x:side?43:85,y:62},attackMove:true});
 if(!result.accepted)throw Error(result.reason);
}
const renderer=new WebGLRenderer({canvas:document.querySelector('canvas')!,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const scene=new Scene();scene.background=new Color('#18181b');scene.add(new AmbientLight(0xfff4e0,.9));
const sun=new DirectionalLight(0xffefdc,3.2);sun.position.set(70,100,40);scene.add(sun);
const ground=new Mesh(new PlaneGeometry(120,120),new MeshBasicMaterial({color:'#27272a'}));ground.rotation.x=-Math.PI/2;ground.position.set(64,-.05,64);scene.add(ground);
const camera=new PerspectiveCamera(GAME_FOV,innerWidth/innerHeight,.1,250);
function resize(){const aspect=innerWidth/innerHeight;renderer.setSize(innerWidth,innerHeight);camera.aspect=aspect;camera.fov=Math.min(75,2*Math.atan(Math.tan(GAME_FOV*Math.PI/360)*Math.max(1,GAME_ASPECT/aspect))*180/Math.PI);camera.position.set(64,Math.sin(GAME_PITCH)*72,62+Math.cos(GAME_PITCH)*72);camera.lookAt(64,0,62);camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();
const layer=new SettlementLayer(scene),field=new HeightField(map.size);layer.viewer(0,owner=>owner===0?'own':'enemy');layer.preloadAssets([content.get('unit.ants.archer').asset]);await layer.ready;
const volley=document.querySelector<HTMLInputElement>('#volley')!;
const status=document.querySelector('#status')!,pause=document.querySelector<HTMLButtonElement>('#pause')!;
let playing=true,last=performance.now(),remainder=0,shots=0;const seen=new Set<number>();
pause.onclick=()=>{playing=!playing;pause.textContent=playing?'Pause':'Play';};document.querySelector<HTMLButtonElement>('#restart')!.onclick=()=>location.reload();
function frame(now:number){const dt=Math.min(.1,(now-last)/1000);last=now;if(playing){remainder+=dt*40;while(remainder>=1){game.tick();for(const missile of game.state.missiles)if(!seen.has(missile.id)){seen.add(missile.id);shots++;}remainder--;if(volley.checked&&game.state.missiles.some(m=>game.state.tick-m.launched>=3)){playing=false;pause.textContent='Play';volley.checked=false;remainder=0;break;}}}
 layer.update(game.view(),field,game.state.tick+remainder);renderer.render(scene,camera);
 const alive=(owner:string)=>game.entities.filter(e=>e.owner===owner&&e.unit&&e.hp!>0).length;
 status.textContent=`Tick ${game.state.tick} · Red ${alive('player.1')} / Blue ${alive('player.2')} · ${shots} shots · ${game.state.missiles.length} in flight · ${renderer.info.render.calls} draws`;
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
