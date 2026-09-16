import {perf} from '../../debug/performance';
type TimerExtension={TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number};
type Sample={query:WebGLQuery;label:string};
/** Sample one scope per frame. Never nest queries, wait for the GPU, or sum
 * subpass timings: tile-based drivers may attribute shared work to both passes. */
export class GpuTimings {
 private readonly extension:TimerExtension|null;
 private readonly pending:Sample[]=[];
 private current:Sample|null=null;
 private frame=0;
 private scope='GPU frame';
 private active=false;
 constructor(private readonly gl:WebGL2RenderingContext){this.extension=gl.getExtension('EXT_disjoint_timer_query_webgl2');}
 get supported(){return !!this.extension;}
 begin(){
  const ext=this.extension;if(!ext)return;
  const disjoint=this.gl.getParameter(ext.GPU_DISJOINT_EXT);
  while(this.pending.length){
   const sample=this.pending[0];
   if(!disjoint&&!this.gl.getQueryParameter(sample.query,this.gl.QUERY_RESULT_AVAILABLE))break;
   if(!disjoint)perf.sample(sample.label,this.gl.getQueryParameter(sample.query,this.gl.QUERY_RESULT)/1e6);
   this.gl.deleteQuery(sample.query);this.pending.shift();
  }
  this.active=perf.enabled&&this.pending.length<4;
  this.scope=['GPU frame','GPU atmosphere','GPU frame','GPU scene'][this.frame++%4];
  if(this.active&&this.scope==='GPU frame')this.start(this.scope);
 }
 private start(label:string){const query=this.gl.createQuery();if(!query||!this.extension)return;this.current={query,label};this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT,query);}
 private finish(){if(!this.current||!this.extension)return;this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);this.pending.push(this.current);this.current=null;}
 measure(label:string,draw:()=>void){
  const sample=this.active&&label===this.scope&&this.scope!=='GPU frame';
  if(sample)this.start(label);
  try{draw();}finally{if(sample)this.finish();}
 }
 end(){this.finish();this.active=false;}
 dispose(){this.finish();for(const s of this.pending)this.gl.deleteQuery(s.query);this.pending.length=0;}
}
