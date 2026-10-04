import {TaskYield} from '../../shared/authoring/worker/taskYield';
import type {WebGLRenderer} from 'three';
import {TimingWindow} from '../../debug/timingWindow';
export type RenderBenchmarkOptions={width?:number;height?:number;frames?:number};
export const renderBenchmarkOptions=(options:RenderBenchmarkOptions)=>({
 width:Math.max(256,Math.min(2560,Math.round(options.width??1280))),
 height:Math.max(256,Math.min(1440,Math.round(options.height??720))),
 frames:Math.max(1,Math.min(120,Math.round(options.frames??24))),
});
/** Renderer-only measurements. No readback/gl.finish and no claims about UI FPS.
 * GPU queries are ended before yielding, and bounded polling discards invalid data. */
export async function measureRenderBenchmark(renderer:WebGLRenderer,draw:(frame:number)=>void,options:ReturnType<typeof renderBenchmarkOptions>){
 const gl=renderer.getContext() as WebGL2RenderingContext;
 const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2') as {TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number}|null;
 const cpu=new TimingWindow(options.frames),gpu=new TimingWindow(options.frames),draws:number[]=[],triangles:number[]=[];
 const started=performance.now();let rejectedGpuSamples=0;const gpuFailures:{disjoint:boolean;ready:boolean;contextLost:boolean;error:number}[]=[];
 const tasks=new TaskYield();
 try{for(let frame=-2;frame<options.frames;frame++){
  if(gl.isContextLost())throw Error('WebGL context lost during render benchmark');
  if(performance.now()-started>15000)break;
  const query=frame>=0&&ext&&rejectedGpuSamples<3?gl.createQuery():null;
  try{
   renderer.info.reset();
   if(query)gl.beginQuery(ext!.TIME_ELAPSED_EXT,query);
   const begin=performance.now();
   try{draw(frame);}finally{if(query){gl.endQuery(ext!.TIME_ELAPSED_EXT);gl.flush();}}
   const elapsed=performance.now()-begin;
   if(frame>=0){cpu.add(elapsed);draws.push(renderer.info.render.calls);triangles.push(renderer.info.render.triangles);}
   if(query){
    const deadline=performance.now()+1000;let ready=false,disjoint=false;
    do{
     await tasks.next();
     disjoint=!!gl.getParameter(ext!.GPU_DISJOINT_EXT);
     ready=!!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE);
    }while(!ready&&!disjoint&&!gl.isContextLost()&&performance.now()<deadline);
    if(ready&&!disjoint&&!gl.isContextLost())gpu.add(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);
    else{rejectedGpuSamples++;gpuFailures.push({disjoint,ready,contextLost:gl.isContextLost(),error:gl.getError()});}
   }else await tasks.next();
  }finally{if(query)gl.deleteQuery(query);}
 }
 return {...options,completedFrames:cpu.stats().samples,cpu:cpu.stats(),complete:cpu.stats().samples===options.frames,gpu:gpu.stats().samples?gpu.stats():null,cpuSamples:cpu.values(),gpuSamples:gpu.values(),drawCalls:draws,triangles,gpuSupported:!!ext,rejectedGpuSamples,gpuFailures,elapsedMs:performance.now()-started,
  note:'Fixed-resolution world rendering with two warm-up frames. Excludes UI, simulation, readback and browser presentation; these timings are not interactive FPS.'};
 }finally{tasks.dispose();}
}
