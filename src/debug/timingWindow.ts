/** Fixed memory, O(1) sampling. Sorting happens only when the UI/report requests it. */
export class TimingWindow {
 private readonly data:Float64Array;private cursor=0;private used=0;
 constructor(readonly capacity=120){this.data=new Float64Array(capacity);}
 add(value:number){if(!Number.isFinite(value)||value<0)return;this.data[this.cursor]=value;this.cursor=(this.cursor+1)%this.capacity;this.used=Math.min(this.used+1,this.capacity);}
 values(){return Array.from({length:this.used},(_,i)=>this.data[(this.cursor-this.used+i+this.capacity)%this.capacity]!);}
 stats(){const a=this.values(),b=[...a].sort((x,y)=>x-y);return {mean:a.length?a.reduce((s,v)=>s+v,0)/a.length:0,p50:b[Math.ceil(b.length*.5)-1]??0,p95:b[Math.ceil(b.length*.95)-1]??0,p99:b[Math.ceil(b.length*.99)-1]??0,max:b.at(-1)??0,samples:a.length,over16ms:a.filter(v=>v>16.667).length,over33ms:a.filter(v=>v>33.334).length};}
}
