/** Publish the 26 independently modelled neutral creatures as canonical units. */
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {originalPackage,addBytes,addFile,publishOriginals,type OriginalPackage} from './original-publication';

type Creature={slug:string;name:string;camp:string;tier:string;attack:'melee'|'ranged';body:string;height:number};
const creatures=JSON.parse(await readFile('scripts/assets/neutral-creeps.json','utf8')) as Creature[];
const generations=JSON.parse(await readFile('.asset-work/build/neutral-creeps/generation.json','utf8')) as Record<string,unknown>;
const selected=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
const specs=selected?creatures.filter(spec=>selected.includes(spec.slug)):creatures;
if(specs.length===0||selected?.some(slug=>!specs.some(spec=>spec.slug===slug)))throw Error('Unknown neutral creature slug');
const packs:OriginalPackage[]=[];
for(const spec of specs){
 const directory=`.asset-work/build/neutral-creeps/${spec.slug}`;
 const id=`asset.models.units.neutral-${spec.slug}`;
 const pack=originalPackage(id,spec.name,'unit','generated');
 const renderId=`asset.neutral.${spec.slug}`;
 const iconId=`icon.neutral.${spec.slug}`;
 await addFile(pack,'geometry','glb',`${directory}/model.glb`);
 await addFile(pack,'source','blend',`${directory}/source.blend`);
 await addFile(pack,'reference','png',`${directory}/reference.png`);
 await addFile(pack,'preview','png',`${directory}/preview.png`);
 addBytes(pack,'image','png',await sharp(`${directory}/preview.png`).resize(128,128).png().toBuffer());
 await addFile(pack,'recipe','py','scripts/assets/build-neutral-creep.py');
 const build=JSON.parse(await readFile(`${directory}/build.json`,'utf8'));
 if(build.triangles>5000)throw Error(`${spec.slug} exceeds the 5000 triangle unit budget`);
 const bytes=await readFile(`${directory}/model.glb`);
 const jsonLength=bytes.readUInt32LE(12);
 const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
 const triangles=gltf.meshes.flatMap((mesh:any)=>mesh.primitives).reduce((sum:number,p:any)=>sum+gltf.accessors[p.indices].count/3,0);
 if(triangles>5000||gltf.skins?.length!==1)throw Error(`${spec.slug}: invalid triangle count or skin`);
 const states=['idle','walk','run','attack','hit','death'];
 const eventName=spec.attack==='ranged'?'release':'hit';
 const animations=states.map(semantic=>{
  const animation=gltf.animations?.find((item:any)=>item.name===semantic);
  if(!animation)throw Error(`${spec.slug}: missing ${semantic} animation`);
  const duration=Math.max(...animation.samplers.map((sampler:any)=>gltf.accessors[sampler.input].max?.[0]??0));
  if(!duration)throw Error(`${spec.slug}: invalid ${semantic} duration`);
  return {semantic,clip:semantic,loop:!['attack','hit','death'].includes(semantic),events:semantic==='attack'?[{name:eventName,time:duration*build.attackEvent.normalizedTime}]:[]};
 });
 const socket=gltf.nodes.find((node:any)=>node.name==='socket_projectile');
 if(spec.attack==='ranged'&&!socket)throw Error(`${spec.slug}: missing projectile socket`);
 pack.definition.tags=['original','neutral',spec.camp,spec.tier,'skinned','tripo'];
 pack.definition.bindings={profile:'base',render:[
  {id:renderId,geometry:{asset:id,role:'geometry',index:1},character:'base',scale:1,healthHeight:spec.height*1.1,
   ...(spec.attack==='ranged'?{projectile:spec.slug==='thorn-slinger'?'arrow':'thorn',projectileSocket:'socket_projectile'}:{})},
  {id:iconId,image:{asset:id,role:'image',index:1}},
 ],scenery:[]};
 const radius={small:.29,medium:.42,hard:.68}[spec.tier as 'small'|'medium'|'hard']*(spec.body==='quadruped'?1.35:spec.body==='spider'?1.15:1)*(['hollow-stag','rotwood-ancient'].includes(spec.slug)?1.45:1);
 pack.definition.capabilities={dimensions:{radius:Number(radius.toFixed(3)),height:spec.height,formationSpacing:Number((radius*2.25).toFixed(3))},groundContact:{mode:'pivot'},animations,
  sockets:socket?[{name:'projectile',node:'socket_projectile',offset:[0,0,0]}]:[]};
 addBytes(pack,'generation','json',Buffer.from(JSON.stringify({provider:'Tripo Studio',model:'H3.1',
  ...(generations[spec.slug] as object),sourceImage:'reference.png',editableSource:'source.blend',
  blenderAdapter:'scripts/assets/build-neutral-creep.py',triangleBudget:5000,triangles,
  textureBudget:512,bodyFamily:spec.body},null,2)+'\n'));
 packs.push(pack);
}
// Smaller transactions make interrupted publication resumable and keep the
// asset index available to other editor work while this large roster lands.
for(let i=0;i<packs.length;i+=4)await publishOriginals(packs.slice(i,i+4));
console.log(`Published ${packs.length} neutral creatures.`);
