/** Reused integer A* frontier. Order by f=g+h, then h, then cell ID.
 * Separate methods keep the queue independent of each search's closure state.
 * pop() exposes its result on this instance; consume it before the next pop. */
export class NavigationQueue {
  private ids=new Int32Array(256);
  private scores=new Int32Array(256);
  private heuristics=new Int32Array(256);
  length=0;
  id=0;
  g=0;
  private better(f:number,h:number,id:number,b:number):boolean {
    return f<this.scores[b]!||(f===this.scores[b]!&&
      (h<this.heuristics[b]!||(h===this.heuristics[b]!&&id<this.ids[b]!)));
  }
  push(id:number,g:number,h:number):void {
    if(this.length===this.ids.length){
      const n=this.length*2,ids=new Int32Array(n),scores=new Int32Array(n),heuristics=new Int32Array(n);
      ids.set(this.ids);scores.set(this.scores);heuristics.set(this.heuristics);
      this.ids=ids;this.scores=scores;this.heuristics=heuristics;
    }
    const f=g+h;let i=this.length++;
    while(i){
      const parent=(i-1)>>1;if(!this.better(f,h,id,parent))break;
      this.ids[i]=this.ids[parent]!;this.scores[i]=this.scores[parent]!;this.heuristics[i]=this.heuristics[parent]!;i=parent;
    }
    this.ids[i]=id;this.scores[i]=f;this.heuristics[i]=h;
  }
  /** Requires a nonempty queue. No result object is allocated. */
  pop():this {
    this.id=this.ids[0]!;this.g=this.scores[0]!-this.heuristics[0]!;
    const end=--this.length,id=this.ids[end]!,f=this.scores[end]!,h=this.heuristics[end]!;
    if(this.length){
      let i=0;
      while(i*2+1<this.length){
        let child=i*2+1;
        if(child+1<this.length&&this.better(this.scores[child+1]!,this.heuristics[child+1]!,this.ids[child+1]!,child))child++;
        if(!this.better(this.scores[child]!,this.heuristics[child]!,this.ids[child]!,end))break;
        this.ids[i]=this.ids[child]!;this.scores[i]=this.scores[child]!;this.heuristics[i]=this.heuristics[child]!;i=child;
      }
      this.ids[i]=id;this.scores[i]=f;this.heuristics[i]=h;
    }
    return this;
  }
}
