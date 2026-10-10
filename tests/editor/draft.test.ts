import {describe,expect,it} from 'vitest';
import {EditorDraft} from '../../src/editor/file/draft';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
class MemoryStorage {
 private values=new Map<string,string>();
 get length(){return this.values.size;}clear(){this.values.clear();}
 key(i:number){return [...this.values.keys()][i]??null;}
 async getItem(k:string){return this.values.get(k)??null;}
 async setItem(k:string,v:string){this.values.set(k,String(v));}removeItem(k:string){this.values.delete(k);}
}
const initial=()=>({...emptyUtcMap(),name:'Threewater Forest'});
describe('revision-aware editor drafts',()=>{
 it('restores unsaved edits only on the same base revision',async()=>{
  const storage=new MemoryStorage(),base=initial(),edited={...base,description:'My unfinished edits'};
  await new EditorDraft(storage,'amberwake-basin',base).write(edited,true);
  expect((await new EditorDraft(storage,'amberwake-basin',base).restore()).map).toEqual(edited);
  const next={...base,description:'New project scenery'};
  const result=await new EditorDraft(storage,'amberwake-basin',next).restore();
  expect(result.map).toBeUndefined();expect(result.recovery).toEqual(edited);
  await new EditorDraft(storage,'amberwake-basin',next).write(next,false);
  expect((await new EditorDraft(storage,'amberwake-basin',next).restore()).recovery).toEqual(edited);
 });
 it('keeps the original draft when recovery cannot be stored',async()=>{
  const storage=new MemoryStorage(),base=initial(),edited={...base,description:'Unfinished'};
  await new EditorDraft(storage,'map',base).write(edited,true);
  const stored=await storage.getItem('utc.editor.draft.v3:map');
  const set=storage.setItem.bind(storage);storage.setItem=async(key,value)=>{if(key.includes('.recovery'))throw new Error('Quota exceeded');await set(key,value);};
  const next={...base,description:'Updated project'},draft=new EditorDraft(storage,'map',next);
  expect((await draft.restore()).recovery).toEqual(edited);await expect(draft.write(next,false)).rejects.toThrow('preserved');
  expect(await storage.getItem('utc.editor.draft.v3:map')).toBe(stored);
 });
 it('ignores retired procedural drafts and clean saved copies',async()=>{
  const storage=new MemoryStorage(),base=initial();await storage.setItem('utc.editor.draft.v2:map',JSON.stringify({map:{...base,v:2},dirty:true}));
  const draft=new EditorDraft(storage,'map',base);expect(await draft.restore()).toEqual({});
  await draft.write({...base,description:'Saved locally'},false);expect(await draft.restore()).toEqual({});
 });
});

it('restores a large replacement map through the original editor route',async()=>{
 const storage=new MemoryStorage(),base=initial(),imported={...emptyUtcMap(512),name:'Imported battlefield',description:'Unsaved import'};
 const draft=new EditorDraft(storage,'new',base);await draft.write(imported,true);
 expect((await storage.getItem('utc.editor.draft.v3:new'))!.length).toBeGreaterThan(5*1024*1024);
 expect((await new EditorDraft(storage,'new',base).restore()).map).toEqual(imported);
});
it('orders writes so a slow older draft cannot overwrite the latest edit',async()=>{
 const storage=new MemoryStorage(),base=initial(),save=storage.setItem.bind(storage);let release!:()=>void;
 storage.setItem=async(key,value)=>{await new Promise<void>(resolve=>release=resolve);await save(key,value);};
 const draft=new EditorDraft(storage,'new',base),older=draft.write({...base,name:'Earlier'},true),newer=draft.write({...base,name:'Latest'},true);
 for(let i=0;i<8;i++)await Promise.resolve();release();await older;
 for(let i=0;i<8;i++)await Promise.resolve();release();await newer;await draft.flush();
 expect((await new EditorDraft(storage,'new',base).restore()).map?.name).toBe('Latest');
});
it('reports storage failures and can save a following edit after a write failure',async()=>{
 const storage=new MemoryStorage(),base=initial(),save=storage.setItem.bind(storage),draft=new EditorDraft(storage,'new',base);
 storage.setItem=async()=>{throw Error('Quota exceeded');};
 await expect(draft.write({...base,name:'First'},true)).rejects.toThrow('Quota');
 storage.setItem=save;await draft.write({...base,name:'Latest'},true);
 expect((await new EditorDraft(storage,'new',base).restore()).map?.name).toBe('Latest');
});
it('never overwrites a draft whose read failed',async()=>{
 const storage=new MemoryStorage(),base=initial();storage.getItem=async()=>{throw Error('Storage unavailable');};
 const draft=new EditorDraft(storage,'new',base);await expect(draft.restore()).rejects.toThrow('unavailable');
 await expect(draft.write({...base,name:'Replacement'},true)).rejects.toThrow('preserved');expect(storage.length).toBe(0);
});
