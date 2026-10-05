import type {VisibilityFootprint} from '../../shared/map/tacticalTerrain';
import {ByteChangeJournal} from '../../shared/snapshots/byteChanges';
export type VisionSource = {id:number; x:number; y:number; radius:number; surface?:string;elevation?:number;ignoreTerrain?:boolean};
type SightCells=ArrayLike<number>&Iterable<number>;
type Contribution = VisionSource & {cells:VisibilityFootprint};
// Compatibility for layered/specialized footprints. Inputs, like their cached
// terrain equivalents, must remain immutable after publication.
const compressed=new WeakMap<object,VisibilityFootprint>();
function compress(cells:SightCells):VisibilityFootprint {
 const old=compressed.get(cells);if(old)return old;
 const spans:number[]=[];let start=-1,previous=-2,count=0;
 for(const cell of cells){
  if(cell!==previous+1){if(start!==-1)spans.push(start,previous+1);start=cell;}
  previous=cell;count++;
 }
 if(start!==-1)spans.push(start,previous+1);
 const result={spans:new Uint32Array(spans),cellCount:count};compressed.set(cells,result);return result;
}
const EMPTY=new Uint32Array();

/** Derived per-observer coverage. Only changed sensors add/remove their footprint.
 * Published fog arrays stay immutable; overlapping sensors cannot hide each other.
 */
export class VisionMask {
  readonly visible = new Set<number>();
  changedCells:number[]=[];
  private readonly counts:Uint32Array;
  private readonly marks:Uint32Array;
  private readonly sources = new Map<number,Contribution>();
  private epoch=0;
  private initialized=false;
  private readonly changes:ByteChangeJournal;
  constructor(public cells:Uint8Array) {
    this.changes=new ByteChangeJournal(cells);
    this.counts=new Uint32Array(cells.length);
    this.marks=new Uint32Array(cells.length);
    for(let i=0;i<cells.length;i++)if(cells[i]===2)this.visible.add(i);
  }
  /** Immutable footprints contain sorted unique cell IDs or non-overlapping spans. */
  update(sources:readonly VisionSource[], footprint:(source:VisionSource)=>SightCells|VisibilityFootprint):boolean {
    this.changedCells=[];
    if(++this.epoch===0xffffffff){this.marks.fill(0);this.epoch=1;}
    const touched:number[]=[],seen=new Set<number>();
    const touch=(cell:number)=>{if(this.marks[cell]!==this.epoch){this.marks[cell]=this.epoch;touched.push(cell);}};
    if(!this.initialized)for(const cell of this.visible)touch(cell);
    for(const source of sources){
      seen.add(source.id);
      const old=this.sources.get(source.id);
      if(old&&old.x===source.x&&old.y===source.y&&old.radius===source.radius&&old.surface===source.surface&&old.elevation===source.elevation&&old.ignoreTerrain===source.ignoreTerrain)continue;
      const raw=footprint(source),cells='spans' in raw?raw:compress(raw);
      const previous=old?.cells.spans??EMPTY,next=cells.spans;
      let a=0,b=0,startA=previous[0]??Infinity,startB=next[0]??Infinity;
      while(a<previous.length||b<next.length){
        const endA=previous[a+1]??Infinity,endB=next[b+1]??Infinity;
        if(startA<startB){const end=Math.min(endA,startB);for(let cell=startA;cell<end;cell++){this.counts[cell]--;touch(cell);}startA=end;}
        else if(startB<startA){const end=Math.min(endB,startA);for(let cell=startB;cell<end;cell++){this.counts[cell]++;touch(cell);}startB=end;}
        else {const end=Math.min(endA,endB);startA=end;startB=end;}
        if(startA===endA){a+=2;startA=previous[a]??Infinity;}
        if(startB===endB){b+=2;startB=next[b]??Infinity;}
      }
      this.sources.set(source.id,{...source,cells});
    }
    for(const [id,old] of this.sources)if(!seen.has(id)){
      for(let i=0;i<old.cells.spans.length;i+=2)for(let cell=old.cells.spans[i]!;cell<old.cells.spans[i+1]!;cell++){this.counts[cell]--;touch(cell);}
      this.sources.delete(id);
    }
    let changed=false;
    for(const cell of touched){
      const next=this.counts[cell]>0?2:this.cells[cell]===0?0:1;
      if(next===this.cells[cell])continue;
      if(!changed){this.cells=this.cells.slice();changed=true;}
      this.cells[cell]=next;
      this.changedCells.push(cell);
      if(next===2)this.visible.add(cell);else this.visible.delete(cell);
    }
    this.initialized=true;
    if(changed)this.changes.publish(this.cells,this.changedCells);
    return changed;
  }
}
