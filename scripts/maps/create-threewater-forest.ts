/** Threewater's woodland layout. Every forest, trail and watercourse remains editable. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dressThreewater} from './threewater-scenery';
import {addForestGiants} from './forest-giants';
import {createBiomeMap} from '../../src/shared/map/newMap';
import {stringifyUtcMap,parseUtcMap,type MapStamp} from '../../src/shared/map/utcmap';
import {proceduralLayerSchema,type ProceduralLayer,authoredObjectSchema} from '../../src/shared/authoring/layers';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import type {LandscapeAsset} from '../../src/shared/authoring/catalogue';
const catalogue=JSON.parse(readFileSync('assets/authoring/catalogue.json','utf8')) as LandscapeAsset[];
const p=(x:number,z:number)=>({x:x*256/843,z:z*256/779});
const layers:ProceduralLayer[]=[];
function mask(id:string,name:string,recipe:string,strokes:{r:number;p:number[][];op?:'add'|'subtract'}[],overrides?:unknown){layers.push(proceduralLayerSchema.parse({id,name,recipe,seed:137+layers.length*71,order:layers.length,shape:{type:'mask',elevation:-.6,strokes:strokes.map(s=>({operation:s.op??'add',radius:s.r*256/843,points:s.p.map(([x,z])=>p(x!,z!))}))},overrides}));}
function course(id:string,name:string,recipe:string,points:number[][],overrides:unknown){const knots=points.map(([x,z,w])=>({...p(x!,z!),elevation:-.6,widthScale:w??1}));layers.push(proceduralLayerSchema.parse({id,name,recipe,seed:81+layers.length,order:layers.length,overrides,shape:{type:'spline',knots:knots.map((k,i)=>{const a=knots[Math.max(0,i-1)]!,b=knots[Math.min(knots.length-1,i+1)]!;return {...k,incoming:{x:k.x-(b.x-a.x)/6,z:k.z-(b.z-a.z)/6},outgoing:{x:k.x+(b.x-a.x)/6,z:k.z+(b.z-a.z)/6}};})}}));}
mask('ground.meadow','Meadow ground','recipe.path.grass',[{r:400,p:[[220,180],[620,180],[620,610],[210,620]]}],{type:'path',shoulder:2});
const river={type:'river',width:15,depth:3.4,bankWidth:2.5,details:{banks:{spacing:1.3,probability:.55},water:{spacing:2.5,probability:.48}}};
course('water.west','Western river and island bend','recipe.river.gentle',[[58,-60,4],[62,35,2.4],[85,110,1.55],[157,190,1.2],[233,248,1],[280,310,.85],[278,405,1],[286,455,1.3],[352,495,1.2],[425,490,.9],[478,467,.75],[550,487,1]],river);
course('water.east','Eastern river · three crossings','recipe.river.gentle',[[835,-80,5],[795,45,4.5],[749,159,3],[712,237,1.8],[642,282,1.25],[607,331,.85],[569,414,1],[577,500,1],[616,565,1.2],[622,630,.85],[607,701,1.15],[645,830,1.4]],river);
const trail={type:'path',width:7,shoulder:1.3,flatten:0};
course('trail.west','Western ford approach','recipe.path.pebbles',[[115,418],[167,369],[211,323],[281,317],[343,326],[383,302]],trail);
course('trail.east','Eastern woodland trail','recipe.path.pebbles',[[484,288],[544,300],[608,332],[664,380],[707,401],[717,472],[759,520],[724,578],[690,627],[620,635],[559,627],[521,646],[497,686]],trail);
course('trail.watch','Watchpost approach','recipe.path.pebbles',[[706,404],[747,367],[768,324]],{...trail,width:4.5});
const clearings=[[201,49,26],[578,101,32],[86,267,26],[422,402,32],[446,578,32],[177,694,37],[180,563,20],[760,316,20],[70,444,18]];
for(const [i,c] of clearings.entries()){const [x,z,r]=c as [number,number,number];mask('clearing.'+i,'Forest clearing '+(i+1),'recipe.path.soil',[{r:r*.65,p:[[x-7,z-12],[x+4,z],[x-10,z+15]]},{r:r*.32,p:[[x-r,z-9],[x+r*.7,z+6],[x+4,z+r]]}],{type:'path',shoulder:2});}
const groups:[string,number,number[][]][]=[
 ['northwest',23,[[130,-8],[135,38],[160,60],[141,96],[184,117],[207,130],[229,155],[257,174]]],
 ['north',30,[[220,-4],[280,7],[316,40],[370,17],[430,13],[481,26],[555,12],[620,21],[675,16]]],
 ['northeast',23,[[651,53],[657,106],[646,145],[627,184],[618,220]]],
 ['northern-grove',19,[[346,162],[375,178],[384,205],[412,226]]],
 ['west-upper',26,[[4,150],[42,169],[82,199],[124,219],[149,253],[170,285]]],
 ['west-wall',23,[[9,245],[27,292],[28,333],[15,383],[18,435],[34,483],[48,528],[19,571],[22,628],[15,683],[40,742],[89,779]]],
 ['west-peninsula',17,[[64,343],[83,371],[91,399]]],
 ['island-west',22,[[333,390],[338,424],[362,446]]],
 ['island-east',20,[[488,359],[512,389],[497,425]]],
 ['south-middle',25,[[302,545],[292,580],[349,592],[375,555],[416,535],[462,533],[491,570],[478,603]]],
 ['south-rim',25,[[125,765],[168,758],[220,735],[265,718],[303,757],[360,777],[413,746],[469,762],[526,743],[566,772]]],
 ['southwest-grove',17,[[87,532],[102,566],[116,604],[108,640]]],
 ['east-north',22,[[727,257],[753,264],[796,275],[812,324],[804,366],[775,408]]],
 ['east-middle',18,[[621,410],[636,448],[627,489],[644,522]]],
 ['east-rim',23,[[835,377],[819,429],[827,485],[834,546],[805,585],[818,632],[822,700],[798,751],[759,780],[704,769],[683,724]]],
 ['east-lower',17,[[701,541],[681,562],[677,589]]],
];
for(const [id,r,points] of groups)mask('forest.'+id,'Pines · '+id,'recipe.forest.diverse',[{r,p:points}],{type:'forest',spacing:2.4,minSpacing:1.9,scaleMin:.52,scaleMax:.82,interiorMargin:1.3,edge:{width:2.6,spacing:1.65,probability:.65,scaleMin:.65,scaleMax:1.1},waterClearance:1.5});
// Low banks and rocky shoulders echo the reference's interrupted pale ledges.
for(const [id,points] of [['west',[[56,477],[77,506],[107,531]]],['south',[[357,699],[381,723],[432,710]]],['east',[[799,471],[783,494],[785,530]]],['north',[[181,145],[212,154]]]] as [string,number[][]][])mask('bank.'+id,'Woodland bank · '+id,'recipe.terrain.bank',[{r:8,p:points}],{type:'terrain',height:1.6,falloff:2.4,roughness:.3});
mask('grass.details','Patchy meadow tufts','recipe.grass.meadow',[{r:87,p:[[323,104],[503,171],[454,272]]},{r:52,p:[[162,447],[193,536],[230,609]]},{r:32,p:[[733,469],[759,628]]},{r:27,p:[[418,421]]}],{type:'grass',spacing:.85,probability:.62,scaleMin:.38,scaleMax:.7,patchiness:{scale:7,strength:.8}});
const base=createBiomeMap('Threewater Forest',256,'vibrant-forest');base.description='Three branching woodland waters, three walkable crossings and secluded glades: a ruined lookout, a broken trading cart, a spring and a forgotten camp among dense pines.';
base.landscape!.environment.canopy!.enabled=false;
base.entities=clearings.slice(0,6).map(([x,z],i)=>{const q=p(x!,z!);return {id:'mine.'+i,definition:'building.neutral.amber-mine',owner:'none' as const,position:{x:Math.round(q.x),y:Math.round(q.z)},rotation:(i%4)*90,appearance:{asset:'asset.resource.woodland-amber-deposit',scale:1.25}};});
base.playerStarts=base.playerStarts.map((s,i)=>({...s,...(()=>{const q=p(...(i===0?[199,624]:[536,170]) as [number,number]);return {x:Math.round(q.x),z:Math.round(q.z)};})()}));
// Original twig bridge: analytic arched deck shared by rendering and navigation.
base.stamps=([[280,317,Math.PI/2],[607,332,Math.PI/4],[620,635,Math.PI/2]] as const).map(([x,z,yaw],i):MapStamp=>{const q=p(x,z);return {id:'bridge.'+i,asset:'leafbound-twig-bridge',x:q.x-.5,y:q.z-.5,scale:1,yaw,sourceTransform:{height:-.35,quaternion:[0,Math.sin(yaw/2),0,Math.cos(yaw/2)]},walk:{level:1,connections:{start:0,end:0}}};});
// Small readable compositions; material families repeat across the map.
const landmarks:[string,number,number,number][]=[
 ['woodland-ruined-watchtower',760,316,1.4],['woodland-moss-boulder',744,304,1.5],['woodland-rock-ledge',778,312,1.1],
 ['woodland-trail-sign',745,336,1.1],['woodland-amber-lantern',763,341,1],['woodland-supply-crate',771,329,1],
 ['woodland-broken-trader-cart',713,423,1.2],['woodland-rain-barrel',727,427,.9],['woodland-supply-crate',720,435,.9],
 ['woodland-fallen-log',697,438,.9],['woodland-river-stones',724,416,1.2],['woodland-mushroom-cluster',689,427,1],
 ['woodland-giant-stump',367,354,1.2],['woodland-acorn-cache',376,368,1.3],['woodland-mushroom-lantern',351,364,1],
 ['woodland-snapped-root',354,350,1.1],['woodland-mushroom-cluster',384,357,1.1],
 ['woodland-stone-spring',349,590,1.6],['woodland-hollow-log',331,604,1],['woodland-moss-boulder',362,604,1.2],
 ['woodland-mushroom-cluster',338,587,1.3],['woodland-log-bench',361,583,1.3],
 ['woodland-leaf-shelter',70,444,1.5],['woodland-abandoned-camp',88,451,1.3],['woodland-woodpile',66,462,1.2],
 ['woodland-log-bench',97,444,1.1],['woodland-amber-lantern',81,433,1],['woodland-acorn-cache',60,451,1],
 ['woodland-pine-stump',658,380,1.6],['woodland-moss-boulder',390,192,1],['woodland-rock-ledge',524,258,.8],
 ['woodland-mushroom-cluster',345,431,.8],['woodland-acorn-cache',104,418,.9],['woodland-fallen-log',738,380,1],
 ['woodland-rock-ledge',217,151,.7],['woodland-moss-boulder',672,524,1.1],
 ['woodland-pine-a',430,28,2.4],['canopy-ancient-tree',28,604,.8],['woodland-pine-a',815,704,2.3],
 ['woodland-trail-sign',199,351,1],['woodland-amber-lantern',236,310,1.2],['woodland-amber-lantern',318,320,1.2],
 ['woodland-trail-sign',668,617,1.1],['woodland-mushroom-lantern',567,626,1.3],['woodland-river-stones',653,651,1.6],
];
mask('grass.trail-fringe','Broken meadow at trail shoulders','recipe.grass.meadow',[{r:16,p:[[181,353],[215,341],[329,341],[374,317]]},{r:20,p:[[532,323],[654,403],[693,442],[745,512],[699,584],[548,649]]},{r:32,p:[[616,127],[483,229],[200,657],[277,643]]}],{type:'grass',spacing:.9,probability:.64,scaleMin:.3,scaleMax:.65,patchiness:{scale:4,strength:.76}});
// The middle crossing is a living-root arch. Its endpoints still meet level zero.
base.stamps[1]={...base.stamps[1]!,asset:'woodland-root-arch-bridge',scale:1.5,sourceTransform:{...base.stamps[1]!.sourceTransform!,height:-.72}};
mask('grass.landmarks','Soft grass around woodland landmarks','recipe.grass.meadow',[
 {r:32,p:[[696,335],[734,323],[755,340]]},
 {r:24,p:[[701,416],[725,449]]},{r:22,p:[[350,371],[384,369]]},
 {r:24,p:[[329,589],[367,611]]},{r:22,p:[[62,429],[96,468]]},
 {r:15,p:[[208,69],[562,127],[102,287],[446,421],[459,600],[193,710]]},
],{type:'grass',spacing:.65,probability:.76,scaleMin:.6,scaleMax:1,patchiness:{scale:4,strength:.68}});
base.authoring={version:1,layers,objects:landmarks.map(([scenery,x,z,scale],i)=>authoredObjectSchema.parse({id:'landmark.'+i,asset:catalogue.find(a=>a.scenery===scenery)!.id,...p(x,z),scale,yaw:i*1.7}))};
addForestGiants(base);
dressThreewater(base,catalogue);
const raw=stringifyUtcMap(base),map=parseUtcMap(JSON.parse(raw));if(!map)throw Error('Invalid generated map');
const start=performance.now(),scene=compileMapScene(map,catalogue);if(scene.generated!.issues.length)throw Error(JSON.stringify(scene.generated!.issues));
mkdirSync('assets/maps/skirmish',{recursive:true});writeFileSync('assets/maps/skirmish/threewater-forest.utcmap',raw);
console.log({layers:map.authoring!.layers.length,trees:scene.resources.length,props:scene.stamps.length,bytes:raw.length,compileMs:performance.now()-start});
