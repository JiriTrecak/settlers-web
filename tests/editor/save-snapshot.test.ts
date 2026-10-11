import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {EditorScreen} from '../../src/app/game/editorScreen';
import {emptyUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {playableMapError} from '../../src/shared/map/playable';
vi.mock('../../src/shared/map/playable',()=>({playableMapError:vi.fn(()=>null)}));
beforeEach(()=>vi.mocked(playableMapError).mockReturnValue(null));
afterEach(()=>vi.unstubAllGlobals());
function editor(){
 vi.stubGlobal('document',{activeElement:null});vi.stubGlobal('HTMLElement',class {});
 const map=emptyUtcMap(),screen=Object.create(EditorScreen.prototype) as any;
 screen.editor={map,editsReady:async()=>{}};screen.saved='';screen.syncDoc=vi.fn();screen.alert=vi.fn();
 screen.files={save:vi.fn()};return {map,screen};
}
it('saves one file snapshot and leaves edits made during the write dirty',async()=>{
 const {map,screen}=editor();let finish!:(value:string)=>void;
 screen.files.save.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=screen.save();await Promise.resolve();
 expect(screen.files.save).toHaveBeenLastCalledWith(map,false);expect(screen.save()).toBe(pending);
 screen.editor.map={...map,name:'Edited while saving'};finish('ok');
 expect(await pending).toBe(false);expect(screen.saved).toBe(stringifyUtcMap(map));expect(screen.dirty()).toBe(true);
 expect(screen.files.save).toHaveBeenCalledTimes(1);
});
it.each(['cancel','fail'])('does not mark a %s file write as saved',async result=>{
 const {screen}=editor();screen.files.save.mockResolvedValue(result);
 expect(await screen.save()).toBe(false);expect(screen.saved).toBe('');expect(screen.dirty()).toBe(true);
 expect(screen.alert).toHaveBeenCalledTimes(result==='fail'?1:0);
});
it('Save as explicitly requests another file destination',async()=>{
 const {map,screen}=editor();screen.files.save.mockResolvedValue('ok');
 expect(await screen.save(true)).toBe(true);expect(screen.files.save).toHaveBeenCalledWith(map,true);
});

it('allows an unfinished map to be explicitly saved before its starts are playable',async()=>{
 const {screen}=editor();vi.mocked(playableMapError).mockReturnValue('Player 1 needs dry ground');
 screen.files.save.mockResolvedValue('ok');expect(await screen.save()).toBe(true);
 expect(screen.files.save).toHaveBeenCalledOnce();expect(screen.alert).not.toHaveBeenCalled();
});
