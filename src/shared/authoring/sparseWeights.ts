export type SparseWeights={offsets:Uint32Array;layers:Uint32Array};
/** Ordered nonzero paint layers at each vertex. Keep source weights untouched:
 * blending still uses the original sequence and arithmetic, including overlap. */
export function sparseWeights(weights:readonly Float32Array[],count:number):SparseWeights{
 const offsets=new Uint32Array(count+1);
 for(const mask of weights)for(let i=0,n=Math.min(count,mask.length);i<n;i++)if(mask[i]>0)offsets[i+1]++;
 for(let i=0;i<count;i++)offsets[i+1]+=offsets[i];
 const layers=new Uint32Array(offsets[count]),cursor=offsets.slice(0,count);
 for(let layer=0;layer<weights.length;layer++){
  const mask=weights[layer];for(let i=0,n=Math.min(count,mask.length);i<n;i++)if(mask[i]>0)layers[cursor[i]++]=layer;
 }
 return {offsets,layers};
}

// Generated paint arrays and their masks are immutable snapshots. Share the
// index between generation and renderer uploads; weak ownership lets old map
// surfaces be collected. Never use this cache for a mutable brush mask.
const indexes=new WeakMap<readonly {weights:Float32Array}[],{count:number;index:SparseWeights}>();
export function indexedPaints(paints:readonly {weights:Float32Array}[],count:number):SparseWeights{
 const cached=indexes.get(paints);if(cached?.count===count)return cached.index;
 const index=sparseWeights(paints.map(p=>p.weights),count);indexes.set(paints,{count,index});return index;
}
