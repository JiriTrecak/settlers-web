import {afterEach,expect,it,vi} from 'vitest';
import {Session} from '../../src/session/session/session';
afterEach(()=>vi.unstubAllGlobals());
it('advances hidden match commits without snapshots, input or presentation and resumes on visibility',()=>{
 const doc={hidden:true};vi.stubGlobal('document',doc);
 const clock={tickMs:25,tickIndex:0},world={clock,settlement:{state:{}},commandReceipts:[],enqueue:vi.fn(),tick:vi.fn(()=>clock.tickIndex++),view:vi.fn(()=>({}))};
 const lock={confirm:vi.fn(),take:vi.fn(()=>({slots:[]}))};
 const renderer={draw:vi.fn(),camera:{distance:40,cinematic:vi.fn()}},input={tick:vi.fn()},mini={paint:vi.fn()},onHud=vi.fn();
 const session=Object.assign(Object.create(Session.prototype),{started:true,world,renderer,input,mini,config:{hooks:{onHud}},me:0,locksteps:new Map([[0,lock]]),acc:0,fpsFrames:0,fpsMs:0,stamps:[]});
 session.tick(50,50);expect(world.tick).toHaveBeenCalledTimes(2);expect(lock.confirm).toHaveBeenCalledTimes(2);
 expect(world.view).not.toHaveBeenCalled();expect(input.tick).not.toHaveBeenCalled();expect(renderer.draw).not.toHaveBeenCalled();expect(mini.paint).not.toHaveBeenCalled();
 doc.hidden=false;session.tick(25,75);expect(clock.tickIndex).toBe(3);expect(world.view).toHaveBeenCalledOnce();expect(input.tick).toHaveBeenCalledOnce();expect(renderer.draw).toHaveBeenCalledOnce();expect(mini.paint).toHaveBeenCalledOnce();
});

it('does not accumulate simulation time or send confirmations while assets load',()=>{
 const world={clock:{tickMs:25},tick:vi.fn()},lock={confirm:vi.fn()};
 const session=Object.assign(Object.create(Session.prototype),{started:false,world,renderer:{},acc:0,locksteps:new Map([[0,lock]])});
 session.tick(5000,5000);expect(session.acc).toBe(0);expect(world.tick).not.toHaveBeenCalled();expect(lock.confirm).not.toHaveBeenCalled();
});
