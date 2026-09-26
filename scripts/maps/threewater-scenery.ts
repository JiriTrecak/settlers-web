/** Deliberate scenery pass; world-space metres, editable masks and individually named props. */
import {authoredObjectSchema,proceduralLayerSchema,type ProceduralLayer} from '../../src/shared/authoring/layers';
import type {UtcMap} from '../../src/shared/map/utcmap';
import type {LandscapeAsset} from '../../src/shared/authoring/catalogue';
import {compileMapScene} from '../../src/shared/authoring/mapScene';

export const THREEWATER_BASES=[{x:60,z:205,name:'Oldoak Glade'},{x:163,z:56,name:'Amberleaf Glade'}] as const;
export const THREEWATER_VIEWS=[
 {name:'Oldoak Glade',x:59,z:207,zoom:1.5},
 {name:'Amberleaf Glade',x:163,z:57,zoom:1.5},
 {name:'The Stranded Ferry',x:78,z:153,zoom:1.5},
 {name:'The Root Crossing',x:188,z:114,zoom:1.5},
 {name:'The Watchpost',x:232,z:103,zoom:1.35},
 {name:'Spring Hollow',x:108,z:193,zoom:1.3},
 {name:'Southwater Landing',x:184,z:208,zoom:1.5},
] as const;

type Stroke={radius:number;points:{x:number;z:number}[];operation:'add'|'subtract'};
const stroke=(radius:number,points:number[][],operation:'add'|'subtract'='add'):Stroke=>({radius,points:points.map(([x,z])=>({x:x!,z:z!})),operation});
/** Avoid burdening every forest with erasers on the opposite side of the map. */
function intersects(strokes:Stroke[],x:number,z:number,radius:number):boolean {
 return strokes.some(s=>s.operation==='add'&&s.points.some((b,i)=>{
  const a=s.points[Math.max(0,i-1)]!,dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a.x-dx*t,z-a.z-dz*t)<radius+s.radius;
 }));
}
export function dressThreewater(map:UtcMap,catalogue:readonly LandscapeAsset[]):void {
 if(!map.authoring)throw Error('Threewater needs authoring');
 const scene=map.authoring;
 scene.layers=scene.layers.filter(l=>!l.id.startsWith('scenic.'));scene.objects=scene.objects.filter(o=>!o.id.startsWith('scenic.'));
 const layers=scene.layers,objects=scene.objects;
 const add=(id:string,name:string,recipe:string,strokes:Stroke[],overrides?:unknown)=>{
  const l=proceduralLayerSchema.parse({id:'scenic.'+id,name,recipe,seed:2701+layers.length*73,order:layers.length,shape:{type:'mask',elevation:-.6,strokes},overrides});layers.push(l);return l;
 };
 const course=(id:string,name:string,points:number[][],width=3.4,material='soil')=>{
  const knots=points.map(([x,z])=>({x:x!,z:z!,elevation:0}));
  layers.push(proceduralLayerSchema.parse({id:'scenic.'+id,name,recipe:'recipe.path.'+material,seed:700+layers.length,order:layers.length,shape:{type:'spline',knots:knots.map((p,i)=>{const a=knots[Math.max(0,i-1)]!,b=knots[Math.min(knots.length-1,i+1)]!;return {...p,incoming:{x:p.x-(b.x-a.x)/6,z:p.z-(b.z-a.z)/6},outgoing:{x:p.x+(b.x-a.x)/6,z:p.z+(b.z-a.z)/6}};})},overrides:{type:'path',width,shoulder:1.2,flatten:0,vegetationClearance:1.2}}));
 };
 const asset=(slug:string)=>{const a=catalogue.find(a=>a.scenery===slug);if(!a)throw Error('Missing scenery '+slug);return a.id;};
 const prop=(id:string,slug:string,x:number,z:number,scale=1,yaw=0,elevation=0,absolute=false)=>{
  const o=authoredObjectSchema.parse({id:'scenic.'+id,asset:asset(slug),x,z,scale,yaw,elevation,heightMode:absolute?'absolute':'terrain'});objects.push(o);return o;
 };
 // Keep enormous crowns in the perimeter; their cutaway handles the overhang.
 const relocated:Record<string,[number,number]>={'forest-scale.0':[33,203],'forest-scale.1':[188,43],'forest-scale.4':[43,177],'forest-scale.5':[148,82],'forest-scale.6':[85,185],'forest-scale.7':[90,196]};
 for(const o of objects){const xy=relocated[o.id];if(xy){o.x=xy[0];o.z=xy[1];}}
 const mushroomLayer=layers.find(l=>l.id==='foliage.mushroom-glades');
 if(mushroomLayer?.shape.type==='mask')mushroomLayer.shape.strokes[0]=stroke(5,[[82,183],[89,194],[91,200]]);
 // Flat generous building cores, rougher broken grass shoulders. Never build-detail the core.
 for(const [i,b]of THREEWATER_BASES.entries()){
  add('base-'+i,b.name+' · buildable glade','recipe.path.soil',[stroke(12,[[b.x-5,b.z],[b.x+5,b.z]]),stroke(7,[[b.x-2,b.z-9],[b.x+2,b.z+9]])],{type:'path',shoulder:4,vegetationClearance:0});
  add('base-shelf-'+i,b.name+' · level foundation','recipe.terrain.hill',[stroke(19,[[b.x,b.z]])],{type:'terrain',operation:'flatten',height:0,falloff:4,roughness:0});
 }
 // A side-water pocket gives the west bank a distinct silhouette without moving a crossing.
 add('backwater','Stillwater · abandoned ferry pool','recipe.river.gentle',[stroke(5.8,[[75,151],[77,148],[81,150]])],{type:'river',depth:1.45,bankWidth:2.8,flow:.12,details:{banks:{spacing:1.7,probability:.6},water:{spacing:2.1,probability:.65}}});
 // Broad rises retain walkable slopes. No tall ridge is placed in a combat lane.
 add('watch-rise','Watchpost · worn hill','recipe.terrain.bank',[stroke(6.2,[[232,102],[235,105]])],{type:'terrain',height:3,falloff:5,roughness:.14,rockStrength:.48,grassStrength:.65});
 add('spring-rise','Spring Hollow · mossy shoulder','recipe.terrain.bank',[stroke(4.5,[[104,191],[109,193]])],{type:'terrain',height:1.5,falloff:5,roughness:.2,rockStrength:.42});
 add('north-ridge','Northern old-growth ridge','recipe.terrain.mountain',[stroke(5,[[112,14],[120,18],[127,16]])],{type:'terrain',height:5,falloff:4,roughness:.22,rockStrength:.66,grassStrength:.5});
 add('south-ridge','Southern folded banks','recipe.terrain.bank',[stroke(4,[[108,238],[120,237],[131,231]])],{type:'terrain',height:3.3,falloff:3.5,roughness:.2,rockStrength:.65});
 add('island-shoulder','Heartwood island · low shelves','recipe.terrain.bank',[stroke(3.2,[[116,130],[117,137]])],{type:'terrain',height:1.6,falloff:4,roughness:.17,rockStrength:.6});
 // Intentional connections between bases, resources and the three existing crossings.
 course('oldoak-north','Oldoak · north supply track',[[61,195],[62,183],[62,169],[56,155],[52,153],[52,139],[59,125],[70,113]],3.2);
 course('oldoak-east','Oldoak · southern supply track',[[70,211],[88,217],[101,223],[119,222],[139,217],[159,215],[171,209]],3.5);
 course('amberleaf-west','Amberleaf · western approach',[[155,65],[144,69],[132,78],[130,90],[124,101],[110,105]],3.7);
 course('amberleaf-east','Amberleaf · root-bridge approach',[[176,65],[180,77],[173,91],[170,98]],3.7);
 course('oldoak-mine','Oldoak · amber run',[[58,216],[55,225]],3);
 course('amberleaf-mine','Amberleaf · amber run',[[169,44],[175,36]],3);
 course('ferry-spur','Stillwater · old towpath',[[53,147],[62,150],[68,156],[72,157]],2.4);
 course('spring-spur','Spring Hollow · worn footpath',[[88,216],[92,202],[100,195],[109,194]],2.8);
 // Exposed earth under activity areas, irregular edges rather than circular decals.
 for(const [id,name,x,z,r]of [
  ['watch','Watchpost forecourt',232,108,4],['trader','Spilled cargo clearing',216,141,4],
  ['spring','Spring Hollow gathering place',109,196,3.8],['ferry','The old ferry landing',71,155,3.4],
  ['stump','Heartwood acorn cache',111,118,3],['south','Southwater landing',179,207,3.4],
 ] as const)add(id+'-earth',name,'recipe.path.soil',[stroke(r,[[x-2,z],[x+2,z+1]])],{type:'path',shoulder:2.2,vegetationClearance:.6});
 // Five small stories, each with a dominant silhouette and a restrained supporting set.
 prop('ferry.raft','woodland-broken-leaf-raft',75,154,.95,-.45,-.44,true);
 prop('ferry.crate','woodland-supply-crate',70.8,156.6,.72,.28);
 prop('ferry.barrel','woodland-rain-barrel',68.7,157.4,.75,-.2);
 prop('ferry.lamp','woodland-amber-lantern',69.6,154.7,.9,.2);
 prop('ferry.sign','woodland-trail-sign',65,153,.85,-.6);
 prop('ferry.snag','woodland-root-snag',81.7,148,.9,-.85,-.83,true);
 prop('ferry.scraps','woodland-drift-scraps',78.8,151.5,.9,.5,-.55,true);
 prop('ferry.shelf','woodland-bank-slabs',71.3,149.3,.9,.4,-.7,true);
 // Landmarks face their approach; random yaw made the old watchpost read as scattered debris.
 const tower=objects.find(o=>o.asset===asset('woodland-ruined-watchtower'));if(tower)tower.yaw=Math.PI*.8;
 prop('watch.footing','woodland-bank-slabs',236,100,1.05,.6,-.4);
 prop('watch.fall','woodland-snapped-root',235,111,1.2,.8,-.2);
 prop('watch.cache','woodland-supply-crate',228.5,108,.9,-.1);
 prop('watch.mushrooms','woodland-mushrooms-button',235.5,106,1.2,.2);
 prop('trader.spill','woodland-acorn-cache',214.3,143.4,1.2,.6);
 prop('trader.splinters','woodland-drift-scraps',218.5,140,1.1,1);
 prop('trader.wheel-rest','woodland-moss-boulder',220.5,145,.75,.4,-.45);
 prop('spring.stones','woodland-bank-slabs',103,194,.95,.8,-.55);
 prop('spring.stool','woodland-pine-stump',110,198,.8,.4);
 prop('spring.acorns','woodland-acorn-cache',109,197,.85,1.5);
 prop('spring.lamp','woodland-mushroom-lantern',106.5,189.5,1,.8);
 prop('south.landing-log','woodland-drift-log',180,213,.72,-.35,-.68,true);
 prop('south.shelf','woodland-bank-slabs',178,214,1.1,.4,-.68,true);
 prop('south.woodpile','woodland-woodpile',175.5,205,.9,-.4);
 prop('south.lamp','woodland-amber-lantern',178,202,.9,.2);
 // Base rims: trunks, small shelter and mossy rock define shelter while preserving expansion room.
 for(const [i,b]of THREEWATER_BASES.entries()){
  const sign=i?1:-1;
  prop(`base.${i}.shelter`,'woodland-leaf-shelter',b.x+sign*22,b.z+11,1.1,i?-.7:.7);
  prop(`base.${i}.rock`,'woodland-moss-boulder',b.x-sign*21,b.z+11,1.4,i*.8,-.55);
  prop(`base.${i}.bench`,'woodland-log-bench',b.x+sign*19,b.z+13,1.1,i?-.7:.7);
  prop(`base.${i}.cache`,'woodland-acorn-cache',b.x+sign*22,b.z+14,1.1,.4);
  prop(`base.${i}.lamp`,'woodland-mushroom-lantern',b.x+sign*20,b.z+9,.95,.2);
  prop(`base.${i}.stump`,'woodland-pine-stump',b.x-sign*20,b.z-13,1.1,1.5);
 }
 // Subtract protected construction areas from every scatter/forest mask, including edge passes.
 for(const l of layers){const type=catalogue.find(a=>a.id===l.recipe)?.recipe?.type;
  if(l.shape.type==='mask'&&['forest','grass','ground-cover'].includes(type??''))
   {
   for(const b of THREEWATER_BASES){const r=type==='forest'?22:15;if(intersects(l.shape.strokes,b.x,b.z,r))l.shape.strokes.push(stroke(r,[[b.x,b.z]],'subtract'));}
   if(type==='forest')for(const [x,z,r]of [[107,194,9],[231,105,8],[216,142,6],[70,155,5]])if(intersects(l.shape.strokes,x!,z!,r!))l.shape.strokes.push(stroke(r!,[[x!,z!]],'subtract'));
  }
 }
 // Deliberate foliage clusters outside building cores, not uniform extra density.
 add('base-fringes','Glade shoulders · patchy short meadow','recipe.grass.meadow',[
  stroke(4,[[44,189],[39,195],[41,217],[49,222],[76,214],[80,202]]),
  stroke(4,[[141,53],[145,69],[155,78],[179,69],[184,61],[161,34]]),
 ],{type:'grass',spacing:1.15,probability:.68,scaleMin:.4,scaleMax:.72,patchiness:{scale:3.2,strength:.7}});
 add('micro-glades','Sheltered mushrooms · roots and banks','recipe.foliage.mushroom-patches',[
  stroke(3.2,[[34,204],[38,214]]),stroke(3.2,[[184,45],[188,49]]),
  stroke(3.2,[[106,189]]),stroke(3.2,[[235,106]]),
 ],{type:'ground-cover',spacing:1.8,probability:.62,scaleMin:.55,scaleMax:1.1});
 // Use the compiled shore, not guessed river elevations. Choose banks away from bridges.
 const field=compileMapScene(map,catalogue).field;
 const sites:[string,number,number,number][]=[
  ['west-upper',62,72,.8],['west-crossing',82,111,1.2],['island-west',94,127,.9],
  ['island-bend',111,158,1.5],['southern-bend',144,160,.7],['east-upper',204,83,1.2],
  ['root-crossing',181,117,1.1],['east-cove',176,149,.8],['southwater',191,199,.9],['south-exit',183,231,1.3],
 ];
 for(const [id,x,z,yaw]of sites){
  // Project a short cross-section to its shoreline, then sink the skirt into both materials.
  let best:{x:number;z:number;error:number}|undefined;
  for(let dz=-7;dz<=7;dz+=.5)for(let dx=-7;dx<=7;dx+=.5){
   const px=x+dx,pz=z+dz,d=field.sample(px,pz)-field.waterAt(px,pz),error=Math.abs(d+.08)+Math.hypot(dx,dz)*.045;
   if(!best||error<best.error)best={x:px,z:pz,error};
  }
  if(!best)continue;
  const q=best,water=field.waterAt(q.x,q.z);
  prop(id+'.shelf','woodland-bank-slabs',q.x,q.z,.75+(id.length%3)*.15,yaw,water-.35,true);
  prop(id+'.pebbles','woodland-river-stones',q.x+1.6,q.z+1.2,1.05,yaw+.8,water-.05,true);
  for(let j=0;j<3;j++){
   const px=q.x+Math.cos(yaw+j*.8)*(2+j*.5),pz=q.z+Math.sin(yaw+j*.8)*(2+j*.5);
   const floor=field.sample(px,pz),surface=field.waterAt(px,pz);
   if(floor>surface-.7&&floor<surface+1.1)prop(id+'.reeds.'+j,'woodland-reed-tuft',px,pz,.8+j*.14,yaw+j,Math.max(floor,surface-.25),true);
  }
 }
 // Floating timber sits slightly submerged, clear of deck approaches and the main channel silhouette.
 for(const [i,x,z,yaw,s]of [[0,86,123,.25,.75],[1,135,159,-.2,.9],[2,180,143,1,.7],[3,199,188,.8,.72],[4,219,66,.4,.85]] as const){
  const water=field.waterAt(x,z),depth=water-field.sample(x,z);
  if(depth>.55){prop('drift.'+i,'woodland-drift-log',x,z,s,yaw,water-.4,true);prop('drift.bits.'+i,'woodland-drift-scraps',x+2,z+2,.8,yaw+.7,water-.04,true);}
 }
 // Remove any legacy single decorative object that intrudes on a base foundation.
 scene.objects=objects.filter(o=>!THREEWATER_BASES.some(b=>Math.hypot(o.x-b.x,o.z-b.z)<18));
 map.description='Oldoak and Amberleaf glades face one another across three woodland crossings. A stranded leaf ferry, raised watchpost, spring hollow and waterworn root snags frame clear base sites and winding supply tracks.';
 map.landscape!.environment.canopy={...map.landscape!.environment.canopy!,enabled:true,coverage:.18,cloudShadow:.08,sway:.65,speed:.2};
}
