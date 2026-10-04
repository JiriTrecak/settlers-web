export type BuildStage={name:string;startMs:number;durationMs:number};
/** Coarse, non-overlapping build stages. No timers in per-vertex or per-instance loops. */
export class BuildProfile{
 private readonly started=performance.now();
 private previous=this.started;
 readonly stages:BuildStage[]=[];
 mark(name:string){const now=performance.now();this.stages.push({name,startMs:this.previous-this.started,durationMs:now-this.previous});this.previous=now;}
 report(){return {totalMs:this.previous-this.started,stages:this.stages.map(s=>({...s}))};}
}
