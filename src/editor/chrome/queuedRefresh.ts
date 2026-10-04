/** Coalesce model notifications within one action. Explicit UI actions may flush
 * immediately (for example, replacing a search input and restoring its focus). */
export class QueuedRefresh {
 private pending=false;
 private disposed=false;
 constructor(private readonly render:()=>void){}
 request(){
  if(this.pending||this.disposed)return;
  this.pending=true;
  queueMicrotask(()=>{if(this.pending)this.flush();});
 }
 flush(){
  this.pending=false;
  if(!this.disposed)this.render();
 }
 destroy(){this.disposed=true;this.pending=false;}
}
