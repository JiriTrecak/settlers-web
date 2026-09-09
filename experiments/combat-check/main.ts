import {Raycaster,Vector2,Vector3,Plane,Scene,OrthographicCamera,WebGLRenderer,AmbientLight,DirectionalLight,Mesh,PlaneGeometry,MeshStandardMaterial} from 'three';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {HeightField} from '../../src/shared/map/height';
import {SettlementLayer} from '../../src/render/settlement/settlementLayer';
import {TICK_MS} from '../../src/shared/match/match';
const map=emptyUtcMap();map.playerStarts[0].x=40;map.playerStarts[0].z=40;
const g=new Game(map,[{player:0,kind:'human'},{player:1,kind:'human'}]);
const spawn=(id:string,definition:string,x:number,y:number,owner:'player.1'|'player.2')=>g.context.create({id,definition,position:{x,y},owner,rotation:0});
const hero=spawn('qa.marshal','unit.ants.marshal',130,138,'player.1');hero.progression!.experience=3200;hero.hp=g.context.stats(hero).maxHp;
for(const name of ['faultline','rally','carapace','crownfall'])for(let i=0;i<(name==='crownfall'?1:3);i++)g.spells.learn(hero,`spell.marshal.${name}`);
const target=spawn('qa.target','building.ants.barracks',142,126,'player.2');
const archers=[0,1,2].map(i=>spawn(`qa.archer.${i}`,'unit.ants.archer',128,124+i*3,'player.1'));
for(let i=0;i<4;i++)spawn(`qa.enemy.${i}`,'unit.ants.warrior',137+i*2,139,'player.2');
const crowd=Math.max(0,Math.min(400,Number(new URLSearchParams(location.search).get('crowd'))||0));
for(let i=0;i<crowd;i++)spawn(`qa.crowd.${i}`,'unit.ants.warrior',110+(i%20)*2,108+Math.floor(i/20)*2,'player.1');
g.tick();for(const a of archers)g.command('player.1',{type:'attack',actors:[a.id],target:target.id});
const scene=new Scene(),camera=new OrthographicCamera(-24,24,15,-15,.1,200),renderer=new WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x233128);document.body.append(renderer.domElement);
camera.position.set(158,30,163);camera.lookAt(135,0,132);
scene.add(new AmbientLight(0xffffff,2));const sun=new DirectionalLight(0xffe4b0,3);sun.position.set(120,40,140);scene.add(sun);
const ground=new Mesh(new PlaneGeometry(100,100),new MeshStandardMaterial({color:0x716447,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(135,-.05,132);scene.add(ground);
const field=new HeightField(),layer=new SettlementLayer(scene);await layer.ready;
let playing=false,untilArrow=false,last=performance.now(),accumulator=0,message='';
const status=document.querySelector('#status')!;
let drawTotal=0,drawCount=0,drawMean=0;
const render=()=>{const start=performance.now();layer.update(g.view(),field,g.state.tick);renderer.render(scene,camera);drawTotal+=performance.now()-start;if(++drawCount===60){drawMean=drawTotal/drawCount;drawCount=0;drawTotal=0;}status.textContent=`Tick ${g.state.tick} · Hero ${hero.hp} HP · ${hero.spellcasting!.mana} mana · ${crowd} extra soldiers · CPU draw ${drawMean.toFixed(2)}ms · ${renderer.info.render.calls} calls · ${message}`;};
function step(){g.tick();render();if(untilArrow&&archers.some(a=>a.unit?.shot?.tick===g.state.tick)){playing=false;untilArrow=false;document.querySelector('#play')!.textContent='Play';message='Paused on emitted arrow. Step to inspect its flight.';render();}}
document.querySelector('#step')!.addEventListener('click',()=>step());
document.querySelector('#play')!.addEventListener('click',()=>{playing=!playing;document.querySelector('#play')!.textContent=playing?'Pause':'Play';});
document.querySelector('#arrow')!.addEventListener('click',()=>{untilArrow=true;playing=true;});
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-spell]'))button.onclick=()=>{const result=g.command('player.1',{type:'cast',actor:hero.id,ability:`spell.marshal.${button.dataset.spell}`,point:{x:140,y:139}});message=result.accepted?'Cast accepted':result.reason??'Rejected';render();};
const resize=()=>{const w=innerWidth,h=Math.max(250,innerHeight-120);renderer.setSize(w,h);camera.left=-15*w/h;camera.right=15*w/h;camera.updateProjectionMatrix();};addEventListener('resize',resize);resize();
function frame(now:number){accumulator+=Math.min(now-last,100);last=now;if(playing){while(accumulator>=TICK_MS&&playing){step();accumulator-=TICK_MS;}}else accumulator=0;render();requestAnimationFrame(frame);}requestAnimationFrame(frame);

// Pointer-driven previews exercise the same geometry used by the game session.
let aim:string|null=null;
const aimRay=new Raycaster(),aimNdc=new Vector2(),aimHit=new Vector3(),aimPlane=new Plane(new Vector3(0,1,0),0);
for(const name of ['faultline','crownfall']){const button=document.createElement('button');button.textContent=`Aim ${name}`;button.onclick=()=>{aim=`spell.marshal.${name}`;message='Move over the ground to aim. Escape cancels.';};document.querySelector('header')!.append(button);}
renderer.domElement.addEventListener('pointermove',event=>{
 if(!aim)return;const r=renderer.domElement.getBoundingClientRect();aimNdc.set((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2);aimRay.setFromCamera(aimNdc,camera);if(!aimRay.ray.intersectPlane(aimPlane,aimHit))return;
 const spell=g.registry.rules.spells[aim],rank=hero.spellcasting!.learned[aim],point={x:Math.round(aimHit.x),y:Math.round(aimHit.z)},origin={x:hero.x,y:hero.y};
 layer.targetAbility({spell,rank,point,origin,valid:Math.hypot(point.x-origin.x,point.y-origin.y)<=spell.ranks[rank-1].range},field);
});
addEventListener('keydown',e=>{if(e.key==='Escape'){aim=null;layer.targetAbility(null,field);}});
