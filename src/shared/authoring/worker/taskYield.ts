/** Yield to a new browser task without nested timer clamping. One scheduler per
 * compiler client; closing it releases pending waiters so disposal cannot hang. */
export class TaskYield {
 private channel:MessageChannel|undefined;
 private pending:Array<()=>void>=[];
 private closed=false;
 next():Promise<void>{
  if(this.closed)return Promise.resolve();
  if(!this.channel){
   this.channel=new MessageChannel();
   this.channel.port1.onmessage=()=>this.pending.shift()?.();
  }
  return new Promise<void>(resolve=>{this.pending.push(resolve);this.channel!.port2.postMessage(null);});
 }
 dispose():void{
  if(this.closed)return;this.closed=true;
  this.channel?.port1.close();this.channel?.port2.close();this.channel=undefined;
  for(const resolve of this.pending)resolve();this.pending=[];
 }
}
