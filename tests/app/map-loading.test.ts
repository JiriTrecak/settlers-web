import {beforeEach,expect,it,vi} from 'vitest';
import {GameApp} from '../../src/app/game/GameApp';
import {loadMap,type LoadedMapEntry} from '../../src/shared/map/library';
const state=vi.hoisted(()=>({screens:[] as {destroy:ReturnType<typeof vi.fn>;error:ReturnType<typeof vi.fn>;leave:()=>void}[]}));
vi.mock('../../src/shared/map/library',()=>({loadMap:vi.fn()}));
vi.mock('../../src/ui/loadingScreen',()=>({LoadingScreen:class {
 destroy=vi.fn();error=vi.fn();update=vi.fn();
 constructor(_host:unknown,readonly leave:()=>void){state.screens.push(this);}
}}));
beforeEach(()=>{state.screens=[];vi.clearAllMocks();});
function fixture(){
 const app=Object.create(GameApp.prototype) as any;
 Object.assign(app,{playGen:0,mapLoading:null,canvas:{},hudRoot:{},showMenu:vi.fn(()=>app.playGen++)});return app;
}
function deferred(){let resolve!:(value:LoadedMapEntry)=>void,reject!:(e:Error)=>void;const promise=new Promise<LoadedMapEntry>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const entry={id:'example'} as LoadedMapEntry;
it('does not open an editor or match after the user cancels terrain loading',async()=>{
 const app=fixture(),request=deferred(),ready=vi.fn();vi.mocked(loadMap).mockReturnValue(request.promise);
 const pending=app.openMap('example',ready);state.screens[0].leave();request.resolve(entry);await pending;
 expect(ready).not.toHaveBeenCalled();expect(app.showMenu).toHaveBeenCalledOnce();expect(app.mapLoading).toBeNull();
});
it('only opens the latest selected map when requests finish out of order',async()=>{
 const app=fixture(),a=deferred(),b=deferred(),first=vi.fn(),second=vi.fn();
 vi.mocked(loadMap).mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
 const one=app.openMap('first',first),two=app.openMap('second',second);
 b.resolve(entry);await two;a.resolve(entry);await one;
 expect(first).not.toHaveBeenCalled();expect(second).toHaveBeenCalledWith(entry);
 expect(state.screens.every(screen=>screen.destroy.mock.calls.length>0)).toBe(true);expect(app.mapLoading).toBeNull();
});
it('shows a failed load without starting a world and keeps a working back action',async()=>{
 const app=fixture(),ready=vi.fn(),error=Error('Invalid terrain cells');vi.mocked(loadMap).mockRejectedValue(error);
 await app.openMap('example',ready);
 expect(ready).not.toHaveBeenCalled();expect(state.screens[0].error).toHaveBeenCalledWith(error);
 state.screens[0].leave();expect(app.mapLoading).toBeNull();expect(app.showMenu).toHaveBeenCalledOnce();
});
