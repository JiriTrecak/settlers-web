/** Match-local entity references. Membership never grants ownership or reveals fog. */
export class ControlGroups {
 private groups=new Map<number,number[]>();
 private last:{slot:number;time:number}|null=null;
 members(slot:number):readonly number[]{return this.groups.get(slot)??[];}
 assign(slot:number,ids:readonly number[],add=false){
  if(!Number.isInteger(slot)||slot<0||slot>9)return;
  this.groups.set(slot,[...new Set([...(add?this.members(slot):[]),...ids])]);this.last=null;
 }
 prune(valid:ReadonlySet<number>){for(const[slot,ids]of this.groups)this.groups.set(slot,ids.filter(id=>valid.has(id)));}
 recall(slot:number,time:number):{ids:number[];focus:boolean}{
  const focus=!!this.last&&this.last.slot===slot&&time>=this.last.time&&time-this.last.time<=350;
  this.last={slot,time};return {ids:[...this.members(slot)],focus};
 }
 clear(){this.groups.clear();this.last=null;}
}
