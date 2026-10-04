import type {LayerShape,SplineKnot} from './layers';
type Point={x:number;z:number};
export type SplineSample=Point&{elevation:number;widthScale:number;depthScale:number;flowScale:number;distance:number};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
function bezier(a:Point,b:Point,c:Point,d:Point,t:number):Point{
 const s=1-t;return {x:s*s*s*a.x+3*s*s*t*b.x+3*s*t*t*c.x+t*t*t*d.x,z:s*s*s*a.z+3*s*s*t*b.z+3*s*t*t*c.z+t*t*t*d.z};
}
/** Handles are world-space, so top-down dragging never changes the height profile. */
export function sampleBezier(knots:readonly SplineKnot[],spacing=.5):SplineSample[]{
 if(!Number.isFinite(spacing)||spacing<=0)throw Error('Spline spacing must be positive');
 const result:SplineSample[]=[];let distance=0;
 for(let i=0;i<knots.length-1;i++){
  const a=knots[i]!,d=knots[i+1]!,b=a.outgoing??a,c=d.incoming??d;
  const polygonLength=Math.hypot(b.x-a.x,b.z-a.z)+Math.hypot(c.x-b.x,c.z-b.z)+Math.hypot(d.x-c.x,d.z-c.z);
  const steps=Math.max(1,Math.ceil(polygonLength/spacing));
  if(steps>65536)throw Error('Spline exceeds sampling budget');
  for(let j=i?1:0;j<=steps;j++){
   const t=j/steps,p=bezier(a,b,c,d,t),last=result[result.length-1];if(last)distance+=Math.hypot(p.x-last.x,p.z-last.z);
   result.push({...p,elevation:mix(a.elevation,d.elevation,t),widthScale:mix(a.widthScale,d.widthScale,t),depthScale:mix(a.depthScale,d.depthScale,t),flowScale:mix(a.flowScale,d.flowScale,t),distance});
  }
 }
 return result;
}
type SplineNode={minX:number;maxX:number;minZ:number;maxZ:number;segments?:number[];left?:SplineNode;right?:SplineNode};
const splineIndexes=new WeakMap<readonly SplineSample[],SplineNode>();
function splineIndex(samples:readonly SplineSample[]):SplineNode{
 const build=(segments:number[]):SplineNode=>{
  const node:SplineNode={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
  for(const i of segments){const a=samples[i]!,b=samples[i+1]!;node.minX=Math.min(node.minX,a.x,b.x);node.maxX=Math.max(node.maxX,a.x,b.x);node.minZ=Math.min(node.minZ,a.z,b.z);node.maxZ=Math.max(node.maxZ,a.z,b.z);}
  if(segments.length<=8)node.segments=segments;
  else{const axis=node.maxX-node.minX>node.maxZ-node.minZ?'x':'z';segments.sort((i,j)=>samples[i]![axis]+samples[i+1]![axis]-samples[j]![axis]-samples[j+1]![axis]);const mid=segments.length>>1;node.left=build(segments.slice(0,mid));node.right=build(segments.slice(mid));}
  return node;
 };
 let index=splineIndexes.get(samples);if(!index){index=build(Array.from({length:samples.length-1},(_,i)=>i));splineIndexes.set(samples,index);}return index;
}
type SplineQuery={x:number;z:number;samples:readonly SplineSample[];best:number;index:number;t:number};
function testSplineSegment(q:SplineQuery,i:number):void{
 const a=q.samples[i]!,b=q.samples[i+1]!,dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
 const t=length?Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.z-a.z)*dz)/length)):0;
 const offset=Math.hypot(q.x-mix(a.x,b.x,t),q.z-mix(a.z,b.z,t));
 if(offset>q.best||(offset===q.best&&i>=q.index))return;
 q.best=offset;q.index=i;q.t=t;
}
function splineBound(n:SplineNode,q:SplineQuery):number{
 const dx=Math.max(n.minX-q.x,0,q.x-n.maxX),dz=Math.max(n.minZ-q.z,0,q.z-n.maxZ);return Math.sqrt(dx*dx+dz*dz);
}
function visitSpline(n:SplineNode,q:SplineQuery,bound=splineBound(n,q)):void{
 if(bound>q.best+1e-10)return;
 if(n.segments){for(const i of n.segments)testSplineSegment(q,i);return;}
 const a=n.left!,b=n.right!,ad=splineBound(a,q),bd=splineBound(b,q);
 if(ad<=bd){visitSpline(a,q,ad);visitSpline(b,q,bd);}else{visitSpline(b,q,bd);visitSpline(a,q,ad);}
}
/** Exact nearest segment, indexed for immutable sampled courses. Ties keep original segment order. */
export function nearestSpline(x:number,z:number,samples:readonly SplineSample[]):SplineSample&{offset:number;direction:Point}{
 const query:SplineQuery={x,z,samples,best:Infinity,index:-1,t:0};
 if(samples.length<=16){for(let i=0;i<samples.length-1;i++)testSplineSegment(query,i);}
 else visitSpline(splineIndex(samples),query);
 const {best,index:bestIndex,t:bestT}=query;
 if(bestIndex<0)throw Error('Spline requires at least two samples');
 const a=samples[bestIndex]!,b=samples[bestIndex+1]!,t=bestT,dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
 return {x:mix(a.x,b.x,t),z:mix(a.z,b.z,t),offset:best,elevation:mix(a.elevation,b.elevation,t),widthScale:mix(a.widthScale,b.widthScale,t),depthScale:mix(a.depthScale,b.depthScale,t),flowScale:mix(a.flowScale,b.flowScale,t),distance:mix(a.distance,b.distance,t),direction:{x:dx/Math.sqrt(length||1),z:dz/Math.sqrt(length||1)}};
}
/** Positive distance inside, negative outside. Boundary is included in a region. */
export function regionDistance(x:number,z:number,shape:Exclude<LayerShape,{type:'spline'}>):number{
 if(shape.type==='mask'){
  let distance=-Infinity;
  for(const stroke of shape.strokes){
   let nearest=Infinity;
   for(let i=0;i<stroke.points.length;i++){
    const a=stroke.points[i]!,b=stroke.points[Math.min(i+1,stroke.points.length-1)]!,dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
    nearest=Math.min(nearest,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));
   }
   const d=stroke.radius-nearest;
   distance=stroke.operation==='add'?Math.max(distance,d):Math.min(distance,-d);
  }
  return distance;
 }
 let inside=false,distance=Infinity;
 for(let i=0,j=shape.points.length-1;i<shape.points.length;j=i++){
  const a=shape.points[i]!,b=shape.points[j]!,dx=b.x-a.x,dz=b.z-a.z;
  if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
  distance=Math.min(distance,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));
 }
 return inside?distance:-distance;
}
/** Cell-local random values do not shift when another part of the region changes. */
export function cellRandom(seed:number,layer:string,x:number,z:number,channel:number):number{
 let h=(seed^Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(channel,2246822519))>>>0;
 for(let i=0;i<layer.length;i++)h=Math.imul(h^layer.charCodeAt(i),16777619)>>>0;
 h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);return ((h^(h>>>16))>>>0)/4294967296;
}

/** Smooth world-space mask: clumps remain anchored when a boundary is reshaped. */
export function patchNoise(seed:number,layer:string,x:number,z:number,scale:number):number{
 const gx=x/scale,gz=z/scale,ix=Math.floor(gx),iz=Math.floor(gz),sx=gx-ix,sz=gz-iz,u=sx*sx*(3-2*sx),v=sz*sz*(3-2*sz);
 return mix(mix(cellRandom(seed,layer,ix,iz,91),cellRandom(seed,layer,ix+1,iz,91),u),mix(cellRandom(seed,layer,ix,iz+1,91),cellRandom(seed,layer,ix+1,iz+1,91),u),v);
}

/** Reuse deterministic lattice corners while sampling a single immutable noise
 * field. The arithmetic is identical to patchNoise; only integer-cell hashes are
 * memoized. Bound memory for unusually fine scales or very large authoring areas. */
export function patchNoiseSampler(seed:number,layer:string,scale:number):(x:number,z:number)=>number{
 const rows=new Map<number,Map<number,number>>();let entries=0;
 const at=(x:number,z:number)=>{
  let row=rows.get(z),value=row?.get(x);if(value!==undefined)return value;
  if(entries===65536){rows.clear();entries=0;row=undefined;}
  if(!row)rows.set(z,row=new Map());
  value=cellRandom(seed,layer,x,z,91);row.set(x,value);entries++;return value;
 };
 return (x,z)=>{
  const gx=x/scale,gz=z/scale,ix=Math.floor(gx),iz=Math.floor(gz),sx=gx-ix,sz=gz-iz,u=sx*sx*(3-2*sx),v=sz*sz*(3-2*sz);
  return mix(mix(at(ix,iz),at(ix+1,iz),u),mix(at(ix,iz+1),at(ix+1,iz+1),u),v);
 };
}
