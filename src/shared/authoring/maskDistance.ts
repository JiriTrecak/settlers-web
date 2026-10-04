import type {LayerShape} from './layers';

type Mask=Extract<LayerShape,{type:'mask'}>;
type Segment={x:number;z:number;dx:number;dz:number;length:number;radius:number};
type Node={minX:number;minZ:number;maxX:number;maxZ:number;radius:number;segments?:Segment[];left?:Node;right?:Node};

function build(segments:Segment[]):Node{
 const node:Node={minX:Infinity,minZ:Infinity,maxX:-Infinity,maxZ:-Infinity,radius:0};
 for(const s of segments){node.minX=Math.min(node.minX,s.x,s.x+s.dx);node.maxX=Math.max(node.maxX,s.x,s.x+s.dx);node.minZ=Math.min(node.minZ,s.z,s.z+s.dz);node.maxZ=Math.max(node.maxZ,s.z,s.z+s.dz);node.radius=Math.max(node.radius,s.radius);}
 if(segments.length<=8)node.segments=segments;
 else{
  const axis=node.maxX-node.minX>node.maxZ-node.minZ?'x':'z';
  segments.sort((a,b)=>axis==='x'?a.x+a.dx*.5-b.x-b.dx*.5:a.z+a.dz*.5-b.z-b.dz*.5);
  const mid=segments.length>>1;node.left=build(segments.slice(0,mid));node.right=build(segments.slice(mid));
 }
 return node;
}

function upperBound(n:Node,x:number,z:number):number{
 const dx=Math.max(n.minX-x,0,x-n.maxX),dz=Math.max(n.minZ-z,0,z-n.maxZ);
 return n.radius-Math.sqrt(dx*dx+dz*dz);
}
function queryNode(n:Node,x:number,z:number,best:number,bound=upperBound(n,x,z)):number{
 if(bound<best-1e-10)return best;
 if(n.segments){
  for(const s of n.segments){
   const t=Math.max(0,Math.min(1,((x-s.x)*s.dx+(z-s.z)*s.dz)/s.length));
   const dx=x-s.x-t*s.dx,dz=z-s.z-t*s.dz,reach=s.radius-best+1e-10;
   // Reject only segments that cannot improve the exact signed distance. Keep
   // hypot for candidates, preserving its rounding at brush/terrain thresholds.
   if(reach<0||dx*dx+dz*dz>reach*reach)continue;
   best=Math.max(best,s.radius-Math.hypot(dx,dz));
  }
  return best;
 }
 const a=n.left!,b=n.right!,ab=upperBound(a,x,z),bb=upperBound(b,x,z);
 return ab>=bb?queryNode(b,x,z,queryNode(a,x,z,best,ab),bb):queryNode(a,x,z,queryNode(b,x,z,best,bb),ab);
}

/** Compile an immutable snapshot. Consecutive equal operations commute, but the
 * add/subtract runs retain their order, including repainting a subtracted hole.
 * Each run indexes swept brush segments with exact radius-aware upper bounds.
 * No raster approximation: generation thresholds and seeded placements stay identical.
 */
export function compileMaskDistance(mask:Mask):(x:number,z:number)=>number{
 const runs:{operation:'add'|'subtract';segments:Segment[]}[]=[];
 for(const stroke of mask.strokes){
  let run=runs[runs.length-1];
  if(!run||run.operation!==stroke.operation){run={operation:stroke.operation,segments:[]};runs.push(run);}
  for(let i=0;i<stroke.points.length;i++){
   const a=stroke.points[i]!,b=stroke.points[Math.min(i+1,stroke.points.length-1)]!,dx=b.x-a.x,dz=b.z-a.z;
   run.segments.push({x:a.x,z:a.z,dx,dz,length:dx*dx+dz*dz||1,radius:stroke.radius});
  }
 }
 const roots=runs.map(run=>({operation:run.operation,root:build(run.segments)}));
 return (x,z)=>{
  let distance=-Infinity;
  for(const {operation,root} of roots){
   // Only a value above this threshold can change the CSG result.
   const best=queryNode(root,x,z,operation==='add'?distance:-distance);
   distance=operation==='add'?best:-best;
  }
  return distance;
 };
}
