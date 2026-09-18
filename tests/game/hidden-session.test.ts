import {afterEach,expect,it,vi} from 'vitest';
import {Session} from '../../src/session/session/session';
afterEach(()=>vi.unstubAllGlobals());
it('does no presentation work while hidden and resumes using the latest worker snapshot',()=>{
 const doc={hidden:true};vi.stubGlobal('document',doc);
 const visual={tick:10,size:256,settlement:{entities:[],objectives:{}}},request=vi.fn();
 const worker={latest:{visual,selection:visual},receivedAt:0,request};
 const renderer={draw:vi.fn(),unitCamera:vi.fn(),gameSelect:vi.fn(),camera:{distance:40,cinematic:vi.fn()}},input={tick:vi.fn()},mini={paint:vi.fn(),setFog:vi.fn()},onHud=vi.fn();
 const session=Object.assign(Object.create(Session.prototype),{started:true,canvas:{style:{}},worker,workerProfiling:false,renderer,input,mini,config:{hooks:{onHud}},me:0,fpsFrames:0,fpsMs:0,stamps:[],updateResourceStamps:vi.fn()});
 session.tick(50,50);expect(input.tick).not.toHaveBeenCalled();expect(renderer.draw).not.toHaveBeenCalled();expect(mini.paint).not.toHaveBeenCalled();expect(renderer.unitCamera).not.toHaveBeenCalled();
 // Authoritative time advances independently; no main-thread tick/confirm calls.
 visual.tick=80;doc.hidden=false;session.tick(25,75);
 expect(renderer.draw).toHaveBeenCalledWith(visual,[]);expect(input.tick).toHaveBeenCalledOnce();expect(mini.paint).toHaveBeenCalledOnce();expect(request).not.toHaveBeenCalled();
});
it('does not start or pump the worker from render frames while assets load',()=>{
 const worker={request:vi.fn()},session=Object.assign(Object.create(Session.prototype),{started:false,worker,renderer:{}});
 session.tick(5000,5000);expect(worker.request).not.toHaveBeenCalled();
});
