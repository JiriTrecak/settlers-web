import {afterEach,expect,it,vi} from 'vitest';
import {GpuTimings} from '../../src/render/display/gpuTimings';
import {perf} from '../../src/debug/performance';
afterEach(()=>{perf.enabled=false;vi.restoreAllMocks();});
function driver(){
 let active=false,ready=true,disjoint=false,id=0;
 const gl={QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,
 getExtension:()=>({TIME_ELAPSED_EXT:3,GPU_DISJOINT_EXT:4}),getParameter:()=>disjoint,
 createQuery:vi.fn(()=>({id:++id})),deleteQuery:vi.fn(),
 beginQuery:vi.fn(()=>{if(active)throw Error('nested query');active=true;}),endQuery:vi.fn(()=>{active=false;}),
 getQueryParameter:(_:unknown,key:number)=>key===1?ready:2_000_000,
 };
 return {gl:gl as unknown as WebGL2RenderingContext,spy:gl,setReady:(v:boolean)=>{ready=v;},setDisjoint:(v:boolean)=>{disjoint=v;}};
}
it('uses non-nested scopes, bounds pending work and disposes uncollected GPU queries',()=>{
 const d=driver();d.setReady(false);perf.enabled=true;const timers=new GpuTimings(d.gl);
 for(let i=0;i<40;i++){timers.begin();timers.measure('GPU scene',()=>{});timers.measure('GPU atmosphere',()=>{});timers.end();}
 expect(d.spy.createQuery).toHaveBeenCalledTimes(4);timers.dispose();expect(d.spy.deleteQuery).toHaveBeenCalledTimes(4);
});
it('discards disjoint samples and records whole-frame measurements independently',()=>{
 const d=driver(),sample=vi.spyOn(perf,'sample');perf.enabled=true;const timers=new GpuTimings(d.gl);
 timers.begin();timers.measure('GPU scene',()=>{});timers.measure('GPU atmosphere',()=>{});timers.end();timers.begin();
 expect(sample).toHaveBeenCalledWith('GPU frame',2);sample.mockClear();timers.measure('GPU atmosphere',()=>{});timers.end();d.setDisjoint(true);timers.begin();timers.end();
 expect(sample).not.toHaveBeenCalled();timers.dispose();
});
