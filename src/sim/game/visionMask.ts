export type VisionSource = {id:number; x:number; y:number; radius:number; surface?:string;elevation?:number};
type SightCells=ArrayLike<number>&Iterable<number>;
type Contribution = VisionSource & {cells:SightCells};

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
  constructor(public cells:Uint8Array) {
    this.counts=new Uint32Array(cells.length);
    this.marks=new Uint32Array(cells.length);
    for(let i=0;i<cells.length;i++)if(cells[i]===2)this.visible.add(i);
  }
  /** Footprints contain unique node IDs in ascending order. */
  update(sources:readonly VisionSource[], footprint:(source:VisionSource)=>SightCells):boolean {
    this.changedCells=[];
    if(++this.epoch===0xffffffff){this.marks.fill(0);this.epoch=1;}
    const touched:number[]=[],seen=new Set<number>();
    const touch=(cell:number)=>{if(this.marks[cell]!==this.epoch){this.marks[cell]=this.epoch;touched.push(cell);}};
    if(!this.initialized)for(const cell of this.visible)touch(cell);
    for(const source of sources){
      seen.add(source.id);
      const old=this.sources.get(source.id);
      if(old&&old.x===source.x&&old.y===source.y&&old.radius===source.radius&&old.surface===source.surface&&old.elevation===source.elevation)continue;
      const cells=footprint(source);
      // Most adjacent movement changes only the edge of a sight circle.
      const previous=old?.cells??[];let a=0,b=0;
      while(a<previous.length||b<cells.length){
        const before=previous[a]??Infinity,after=cells[b]??Infinity;
        if(before===after){a++;b++;continue;}
        if(before<after){this.counts[before]--;touch(before);a++;}
        else{this.counts[after]++;touch(after);b++;}
      }
      this.sources.set(source.id,{...source,cells});
    }
    for(const [id,old] of this.sources)if(!seen.has(id)){
      for(const cell of old.cells){this.counts[cell]--;touch(cell);}
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
    return changed;
  }
}
