import {afterEach,describe,it,expect,vi} from 'vitest';
import {BackgroundTicker} from '../../src/app/game/backgroundTicker';
afterEach(()=>vi.unstubAllGlobals());
describe('visible background rendering',()=>{
 it('keeps rAF when focus is lost, pumps only when stalled, and uses the worker while hidden',()=>{
  const handlers=new Map<string,()=>void>(),doc={hidden:false,hasFocus:()=>false,addEventListener:(n:string,f:()=>void)=>handlers.set(n,f),removeEventListener:()=>{}};
  let worker:any;
  vi.stubGlobal('document',doc);
  vi.stubGlobal('window',{addEventListener:(n:string,f:()=>void)=>handlers.set(n,f),removeEventListener:()=>{}});
  vi.stubGlobal('Worker',class {onmessage=()=>{};constructor(){worker=this;}postMessage(){}terminate(){}});
  const loop={startRaf:vi.fn(),stopRaf:vi.fn(),pump:vi.fn(),needsPump:vi.fn(()=>false)},ticker=new BackgroundTicker(loop);
  ticker.start();expect(loop.stopRaf).not.toHaveBeenCalled();
  handlers.get('blur')!();worker.onmessage();expect(loop.pump).not.toHaveBeenCalled();
  loop.needsPump.mockReturnValue(true);worker.onmessage();expect(loop.pump).toHaveBeenCalledOnce();
  loop.needsPump.mockReturnValue(false);doc.hidden=true;handlers.get('visibilitychange')!();worker.onmessage();expect(loop.stopRaf).toHaveBeenCalledOnce();expect(loop.pump).toHaveBeenCalledTimes(2);
  doc.hidden=false;handlers.get('visibilitychange')!();expect(loop.startRaf).toHaveBeenCalled();ticker.destroy();
 });
});
