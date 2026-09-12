/** Compose the forest from measured reference-image landmarks using the actual Play lens. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera, Vector3 } from 'three';
import { Camera } from '../../src/render/camera/camera';
const root=fileURLToPath(new URL('../../',import.meta.url));
const path=root+'assets/maps/showcase/Verdant-Forest.utcmap';
const map=JSON.parse(readFileSync(path,'utf8'));
const bytes=Buffer.from(map.height,'base64');
function height(x:number,z:number){
 const gx=Math.max(0,Math.min(287.999,x+16)),gz=Math.max(0,Math.min(287.999,z+16)),ix=Math.floor(gx),iz=Math.floor(gz),fx=gx-ix,fz=gz-iz;
 const h=(dx:number,dz:number)=>bytes.readInt16LE(((iz+dz)*289+ix+dx)*2)/100;
 return h(0,0)*(1-fx)*(1-fz)+h(1,0)*fx*(1-fz)+h(0,1)*(1-fx)*fz+h(1,1)*fx*fz;
}
const camera=new Camera();camera.lookAt(126,126);camera.setGame(true);camera.setTerrain(height,0);
const view=new PerspectiveCamera();camera.applyTo(view,1280,720);view.updateMatrixWorld();
function ground(u:number,v:number){
 const a=new Vector3(u/640-1,1-v/360,-1).unproject(view),b=new Vector3(u/640-1,1-v/360,1).unproject(view),d=b.sub(a);
 let t=(height(126,126)-a.y)/d.y;
 for(let i=0;i<12;i++){const p=a.clone().addScaledVector(d,t);t=(height(p.x,p.z)-a.y)/d.y;}
 return a.addScaledVector(d,t);
}
function screen(p:Vector3){const q=p.clone().project(view);return [(q.x+1)*640,(1-q.y)*360];}
map.stamps=[];map.landscape.cover=[];map.landscape.strokes=[];
let seed=907;const rand=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
function stamp(asset:string,u:number,v:number,scale:number,id?:string){const p=ground(u,v);map.stamps.push({id:id??'reference-detail-'+map.stamps.length,asset,x:p.x-.5,y:p.z-.5,scale,yaw:rand()*Math.PI*2});return p;}
// Visible trunk/root locations and crown heights measured in the 1280 x 720 reference.
const trees:[string,number,number,number][]=[
 ['b',118,77,165],['p',200,145,185],['b',296,69,180],['p',493,25,110],
 ['p',683,88,175],['p',862,82,160],['b',929,115,150],['p',1000,155,180],['b',1025,118,145],['b',1250,78,200],
 ['b',36,270,165],['b',126,310,154],['b',65,379,130],['b',193,193,115],['b',270,180,90],
 ['p',397,157,110],['d',470,210,103],['d',608,175,110],['b',710,205,150],['b',780,186,130],['d',834,235,100],
 ['p',432,299,144],['p',926,394,124],['b',1124,393,148],['p',1155,433,122],['b',1260,317,200],
 ['p',205,620,230],['p',320,573,155],['d',382,600,190],['d',430,581,168],['p',594,700,220],
 ['d',660,553,95],['p',746,538,115],['p',881,605,235],['d',820,710,190],['p',1040,790,200],['p',1105,770,235],['b',37,664,140],
];
const landmarks=trees.map(([kind,u,v,pixels],i)=>{
 const p=ground(u,v),modelHeight=kind==='p'?6.47:kind==='d'?6.9135:7.67;
 let lo=.2,hi=4;
 for(let j=0;j<24;j++){const mid=(lo+hi)/2,top=p.clone();top.y+=modelHeight*mid; if(v-screen(top)[1]<pixels)lo=mid;else hi=mid;}
 const id='reference-tree-'+i;stamp(kind==='p'?'pine-chunky':kind==='d'?'tree-chunky-drooping':'tree-chunky-broadleaf',u,v,(lo+hi)/2,id);
 map.stamps.at(-1).widthScale=.8;map.stamps.at(-1).depthScale=.8;
 return {id,reference:{x:u,y:v,crownHeight:pixels},world:{x:p.x,z:p.z},projected:screen(p)};
});
for(const [u,v] of [[450,52],[550,67],[620,76],[384,177],[532,184],[586,215],[419,284],[553,320],[541,372],[808,400],[985,333],[1040,342],[757,445],[127,197]]){
 const count=5+Math.floor(rand()*4);
 for(let j=0;j<count;j++){
  const a=rand()*Math.PI*2,r=Math.sqrt(rand());
  stamp(['flower-single-purple','flower-single-cream','flower-single-blue'][Math.floor(rand()*3)],u+Math.cos(a)*r*32,v+Math.sin(a)*r*18,.80+rand()*.65);
 }
}
for(const [u,v] of [[410,266],[460,271],[574,357],[596,365],[566,200],[632,208],[431,55],[478,60],[515,57],[558,179],[935,111],[1008,153]])stamp('mushroom-chunky-red',u,v,1.05+rand()*.5);
for(const [u,v] of [[506,106],[542,99],[560,92],[604,80],[486,275],[541,277],[590,269],[655,268],[529,327],[568,320],[795,383],[829,380],[826,418],[894,300],[602,434],[662,431],[690,434]])stamp('flower-bud-cream',u,v,1.7+rand()*.4);
for(const [u,v,scale] of [[620,435,3.2],[1227,144,2.4],[661,211,.8],[150,325,.65],[72,104,.5],[725,297,.6],[362,373,.5]])stamp('rock-rounded-cool',u,v,scale*.5);
for(const [u,v] of [[578,413],[651,414],[750,299],[802,341],[336,347],[696,221],[438,321],[903,302],[1187,173],[245,214]])stamp('pebbles-pale',u,v,.75+rand()*.45);
for(const [u,v] of [[307,232],[213,300],[211,377],[561,260],[742,255],[938,269],[977,233],[953,331],[854,368],[394,350],[1128,262]]){
 const p=ground(u,v);map.landscape.cover.push({x:p.x,z:p.z,radius:2.4,density:.65,flowers:0,seed:Math.floor(rand()*10000),palette:'meadow',grassScale:.9,broadRatio:.85});
}
for(const points of [[[207,475],[316,533],[397,570],[521,588]],[[550,478],[670,396],[755,330],[824,299]],[[893,194],[1020,218],[1140,224]],[[136,86],[310,114],[439,109]]]){
 map.landscape.strokes.push({points:points.map(([u,v])=>{const p=ground(u,v);return{x:p.x,z:p.z};}),radius:4,layer:'sand',opacity:.40});
}
writeFileSync(path,JSON.stringify(map));
writeFileSync(root+'tmp/visual-audit/forest-landmarks-projected.json',JSON.stringify(landmarks,null,2));
console.log(`Composed ${trees.length} reference trees and ${map.stamps.length-trees.length} detail stamps.`);
