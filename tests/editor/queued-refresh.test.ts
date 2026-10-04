import {expect,it,vi} from 'vitest';
import {QueuedRefresh} from '../../src/editor/chrome/queuedRefresh';

it('renders the final state once for repeated model notifications in one action',async()=>{
 let state=0;const seen:number[]=[],refresh=new QueuedRefresh(()=>seen.push(state));
 for(state=1;state<6;state++)refresh.request();
 expect(seen).toEqual([]);
 await Promise.resolve();expect(seen).toEqual([6]);
 state=7;refresh.request();await Promise.resolve();expect(seen).toEqual([6,7]);
});
it('an explicit flush supersedes queued work and teardown cancels it',async()=>{
 const render=vi.fn(),refresh=new QueuedRefresh(render);
 refresh.request();refresh.flush();expect(render).toHaveBeenCalledTimes(1);
 await Promise.resolve();expect(render).toHaveBeenCalledTimes(1);
 refresh.request();refresh.destroy();await Promise.resolve();refresh.flush();refresh.request();
 expect(render).toHaveBeenCalledTimes(1);
});
