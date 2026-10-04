import {expect,it,vi} from 'vitest';
import type {WebGLRenderer} from 'three';
import {measureRenderBenchmark,renderBenchmarkOptions} from '../../src/render/display/renderBenchmark';
import {editorPerformanceSchema} from '../../src/shared/authoring/editorPerformance';
function fixture(timer=true,disjoint=false){
 const gl={getExtension:()=>timer?{TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2}:null,isContextLost:()=>false,getError:()=>0,
 createQuery:vi.fn(()=>({})),beginQuery:vi.fn(),endQuery:vi.fn(),flush:vi.fn(),deleteQuery:vi.fn(),getParameter:()=>disjoint,
 QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,getQueryParameter:(_q:unknown,p:number)=>p===3?true:2_000_000};
 const renderer={getContext:()=>gl,info:{reset:vi.fn(),render:{calls:42,triangles:1234}}} as unknown as WebGLRenderer;
 return {gl,renderer};
}
it('warms twice, keeps CPU and GPU separate and releases every GPU query',async()=>{
 const {gl,renderer}=fixture(),draw=vi.fn();
 const report=await measureRenderBenchmark(renderer,draw,renderBenchmarkOptions({frames:3}));
 expect(draw.mock.calls.map(c=>c[0])).toEqual([-2,-1,0,1,2]);expect(report.completedFrames).toBe(3);expect(report.complete).toBe(true);
 expect(report.gpu?.mean).toBe(2);expect(report.gpu?.samples).toBe(3);expect(report.drawCalls).toEqual([42,42,42]);
 expect(gl.flush).toHaveBeenCalledTimes(3);expect(gl.beginQuery).toHaveBeenCalledTimes(3);expect(gl.endQuery).toHaveBeenCalledTimes(3);expect(gl.deleteQuery).toHaveBeenCalledTimes(3);
});
it('reports missing/disjoint GPU timers honestly',async()=>{
 const unavailable=fixture(false),invalid=fixture(true,true);
 const a=await measureRenderBenchmark(unavailable.renderer,()=>{},renderBenchmarkOptions({frames:1}));
 expect(a.gpu).toBeNull();expect(a.gpuSupported).toBe(false);expect(a.cpu.samples).toBe(1);
 const b=await measureRenderBenchmark(invalid.renderer,()=>{},renderBenchmarkOptions({frames:1}));
 expect(b.gpu).toBeNull();expect(b.rejectedGpuSamples).toBe(1);expect(invalid.gl.deleteQuery).toHaveBeenCalledTimes(1);
});
it('ends and deletes an active query if drawing fails',async()=>{
 const {gl,renderer}=fixture();
 await expect(measureRenderBenchmark(renderer,frame=>{if(frame===0)throw Error('draw failed');},renderBenchmarkOptions({frames:1}))).rejects.toThrow('draw failed');
 expect(gl.endQuery).toHaveBeenCalledTimes(1);expect(gl.deleteQuery).toHaveBeenCalledTimes(1);
});
it('stops retrying rejected GPU queries but completes CPU measurements',async()=>{
 const {gl,renderer}=fixture(true,true);
 const report=await measureRenderBenchmark(renderer,()=>{},renderBenchmarkOptions({frames:6}));
 expect(report.complete).toBe(true);expect(report.cpu.samples).toBe(6);expect(report.gpu).toBeNull();
 expect(report.rejectedGpuSamples).toBe(3);expect(gl.createQuery).toHaveBeenCalledTimes(3);expect(gl.deleteQuery).toHaveBeenCalledTimes(3);
 expect(report.gpuFailures).toEqual(Array.from({length:3},()=>({disjoint:true,ready:true,contextLost:false,error:0})));
});
it('bounds workload in the renderer and rejects invalid MCP dimensions',()=>{
 expect(renderBenchmarkOptions({width:9999,height:9999,frames:9999})).toEqual({width:2560,height:1440,frames:120});
 expect(editorPerformanceSchema.parse({action:'benchmark',width:1920,height:1080,frames:24}).action).toBe('benchmark');
 expect(()=>editorPerformanceSchema.parse({action:'benchmark',frames:10000})).toThrow();
});
