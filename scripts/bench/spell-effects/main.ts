import {Scene,WebGLRenderer,PerspectiveCamera,Mesh,MeshStandardMaterial,BoxGeometry,PlaneGeometry,DirectionalLight,HemisphereLight,Texture} from 'three';
import {EffectPlayer} from '../../../src/render/abilities/effectPlayer';
import {coreEffects} from '../../../src/content/effects/library';
import {effectWarmModels} from '../../../src/render/settlement/effectWarmup';
const ids=['effect.core.holy-light-lite.released-1','effect.core.blizzard.wavestarted','effect.marshal.carapace.cast','effect.marshal.crownfall.impact','effect.rootbreaker.uproot','effect.core.inferno'];
const effects=ids.map(id=>{const effect=coreEffects.find(e=>e.id===id);if(!effect)throw Error('Missing benchmark effect: '+id);return effect;});
const scene=new Scene(),camera=new PerspectiveCamera(45,640/400,.1,200),gl=new WebGLRenderer({antialias:true});gl.setSize(640,400);document.querySelector('#view')!.append(gl.domElement);camera.position.set(15,20,26);camera.lookAt(0,0,0);
scene.add(new HemisphereLight(0xffffff,0x444444,2));const sun=new DirectionalLight(0xffffff,3);sun.position.set(8,15,10);scene.add(sun);
const ground=new Mesh(new PlaneGeometry(50,50),new MeshStandardMaterial({color:'#52525b'}));ground.rotation.x=-Math.PI/2;scene.add(ground);
for(let i=0;i<12;i++){const material=new MeshStandardMaterial({color:0x909090,roughness:.5,flatShading:!!(i%2),vertexColors:!!(i%3),transparent:!!(i%4),alphaTest:i%5?.1:0});const mesh=new Mesh(new BoxGeometry(1,2,1),material);mesh.position.set((i%4)*3-5,1,Math.floor(i/4)*3-3);scene.add(mesh);}
const player=new EffectPlayer();scene.add(player.root);
const pinned=new Set<object>();const links=()=>{let count=0;for(const p of gl.info.programs??[])if(!pinned.has(p)){pinned.add(p);p.usedTimes++;count++;}return count;};
const frame=()=>new Promise<number>(r=>requestAnimationFrame(r));
const output=document.querySelector('#report')!,status=document.querySelector('#status')!;
(document.querySelector('#run') as HTMLButtonElement).onclick=async()=>{
 (document.querySelector('#run') as HTMLButtonElement).disabled=true;
 try{
 status.textContent='Preparing shaders';const warm=effectWarmModels();for(const m of warm.models)scene.add(m);
 await player.prepare(effects);const models=player.preparedModelsForWarmup();for(const m of models)scene.add(m);
 scene.traverse(o=>{const m=(o as Mesh).material;for(const mat of m?(Array.isArray(m)?m:[m]):[])for(const v of Object.values(mat))if(v instanceof Texture)gl.initTexture(v);});
 await gl.compileAsync(scene,camera);gl.render(scene,camera);links();for(const m of [...warm.models,...models])m.removeFromParent();
 performance.clearResourceTimings();performance.setResourceTimingBufferSize(2000);
 const rows=[];for(const effect of effects)for(let repeat=0;repeat<2;repeat++){
 status.textContent=`${effect.name} · ${repeat?'repeat':'first cast'}`;const requests=performance.getEntriesByType('resource').length;
 await frame();const started=performance.now();player.play(effect,{tick:0,seed:42,target:{x:0,y:0},source:{x:-5,y:0}});const create=performance.now()-started;
 let maxCPU=0,maxInterval=0,newPrograms=0,draws=0,previous=await frame();
 for(let i=0;i<60;i++){const now=await frame();maxInterval=Math.max(maxInterval,now-previous);previous=now;const begin=performance.now();player.update(i*2);gl.render(scene,camera);maxCPU=Math.max(maxCPU,performance.now()-begin);newPrograms+=links();draws=Math.max(draws,gl.info.render.calls);}
 player.clear();gl.render(scene,camera);newPrograms+=links();rows.push({effect:effect.id,repeat,createMs:+create.toFixed(2),maxCPUms:+maxCPU.toFixed(2),maxIntervalMs:+maxInterval.toFixed(2),newPrograms,newRequests:performance.getEntriesByType('resource').length-requests,maxDraws:draws});output.textContent=JSON.stringify(rows,null,2);
 }
 status.textContent='Complete';
 player.play(effects[1],{tick:0,seed:42});player.update(18);gl.render(scene,camera);
 const body=document.querySelector('#results')!;for(const row of rows){const tr=document.createElement('tr');for(const value of [row.effect.replace(/^effect\./,''),row.repeat?'Repeat':'First',row.createMs,row.maxCPUms,row.maxIntervalMs,row.newPrograms,row.newRequests,row.maxDraws-13]){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}body.append(tr);}
 }catch(e){status.textContent=String(e);console.error(e);}
};
gl.render(scene,camera);
