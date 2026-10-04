import {NavigationQueue} from './navigationQueue';

/** Nonnegative signed-32-bit radix frontier for A* with a consistent heuristic: newly pushed f
 * cannot be lower than the last popped f. Only the current minimum-f bucket
 * needs h/cell ordering, supplied by the ordinary binary frontier. Remaining
 * buckets use reusable intrusive lists, avoiding comparisons on every push.
 * This changes queue work, never A*'s f/h/cell ordering or route choices. */
export class MonotonicNavigationQueue {
  private readonly heads=new Int32Array(33).fill(-1);
  private ids=new Int32Array(256);
  private scores=new Int32Array(256);
  private heuristics=new Int32Array(256);
  private next=new Int32Array(256);
  private readonly minimum=new NavigationQueue();
  private used=0;
  private free=-1;
  private last=0;
  private count=0;
  id=0;
  g=0;
  get length(){return this.count;}
  reset():void {
    this.count=0;this.used=0;this.free=-1;this.last=0;
    this.minimum.length=0;this.heads.fill(-1);
  }
  private bucket(score:number){return 32-Math.clz32((score^this.last)>>>0);}
  push(id:number,g:number,h:number):void {
    const score=g+h;
    if(score<this.last||score>0x7fffffff)throw new Error('Navigation requires monotonic signed-32-bit priorities');
    this.count++;
    const bucket=this.bucket(score);
    if(bucket===0){this.minimum.push(id,g,h);return;}
    let index=this.free;
    if(index>=0)this.free=this.next[index]!;
    else {
      index=this.used++;
      if(index===this.ids.length){
        const n=index*2,ids=new Int32Array(n),scores=new Int32Array(n),heuristics=new Int32Array(n),next=new Int32Array(n);
        ids.set(this.ids);scores.set(this.scores);heuristics.set(this.heuristics);next.set(this.next);
        this.ids=ids;this.scores=scores;this.heuristics=heuristics;this.next=next;
      }
    }
    this.ids[index]=id;this.scores[index]=score;this.heuristics[index]=h;
    this.next[index]=this.heads[bucket]!;this.heads[bucket]=index;
  }
  /** Consume id/g before the next pop; no result objects are allocated. */
  pop():this {
    if(!this.count)throw new Error('Empty navigation queue');
    if(!this.minimum.length){
      let bucket=1;while(this.heads[bucket]!<0)bucket++;
      let score=Infinity;
      for(let i=this.heads[bucket]!;i>=0;i=this.next[i]!)score=Math.min(score,this.scores[i]!);
      this.last=score;
      let index=this.heads[bucket]!;this.heads[bucket]=-1;
      while(index>=0){
        const next=this.next[index]!,target=this.bucket(this.scores[index]!);
        if(target===0){
          this.minimum.push(this.ids[index]!,this.scores[index]!-this.heuristics[index]!,this.heuristics[index]!);
          this.next[index]=this.free;this.free=index;
        }else{
          this.next[index]=this.heads[target]!;this.heads[target]=index;
        }
        index=next;
      }
    }
    const result=this.minimum.pop();this.id=result.id;this.g=result.g;this.count--;
    return this;
  }
}
