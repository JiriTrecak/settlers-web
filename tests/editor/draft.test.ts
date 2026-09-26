import {describe,expect,it} from 'vitest';
import {EditorDraft} from '../../src/editor/file/draft';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
class MemoryStorage implements Storage {
 private values=new Map<string,string>();
 get length(){return this.values.size;}clear(){this.values.clear();}
 key(i:number){return [...this.values.keys()][i]??null;}
 getItem(k:string){return this.values.get(k)??null;}
 setItem(k:string,v:string){this.values.set(k,String(v));}removeItem(k:string){this.values.delete(k);}
}
const initial=()=>({...emptyUtcMap(),name:'Threewater Forest'});
describe('revision-aware editor drafts',()=>{
 it('restores unsaved edits only on the same base revision',()=>{
  const storage=new MemoryStorage(),base=initial(),edited={...base,description:'My unfinished edits'};
  new EditorDraft(storage,'threewater-forest',base).write(edited,true);
  expect(new EditorDraft(storage,'threewater-forest',base).restore().map).toEqual(edited);
  const next={...base,description:'New project scenery'};
  const result=new EditorDraft(storage,'threewater-forest',next).restore();
  expect(result.map).toBeUndefined();expect(result.recovery).toEqual(edited);
  new EditorDraft(storage,'threewater-forest',next).write(next,false);
  expect(new EditorDraft(storage,'threewater-forest',next).restore().recovery).toEqual(edited);
 });
 it('keeps the original draft when recovery cannot be stored',()=>{
  const storage=new MemoryStorage(),base=initial(),edited={...base,description:'Unfinished'};
  new EditorDraft(storage,'map',base).write(edited,true);
  const stored=storage.getItem('utc.editor.draft.v2:map');
  const set=storage.setItem.bind(storage);storage.setItem=(key,value)=>{if(key.includes('.recovery'))throw new Error('Quota exceeded');set(key,value);};
  const next={...base,description:'Updated project'},draft=new EditorDraft(storage,'map',next);
  expect(draft.restore().recovery).toEqual(edited);draft.write(next,false);
  expect(storage.getItem('utc.editor.draft.v2:map')).toBe(stored);
 });
 it('preserves legacy drafts without silently replacing the project or erasing the original',()=>{
  const storage=new MemoryStorage(),base=initial(),old={...base,description:'Old scenery'};
  storage.setItem('legacy',JSON.stringify(old));
  const draft=new EditorDraft(storage,'threewater-forest',base),result=draft.restore(['legacy']);
  expect(result.map).toBeUndefined();expect(result.recovery).toEqual(old);
  draft.write(base,false);expect(JSON.parse(storage.getItem('legacy')!)).toEqual(old);
 });
 it('does not restore another map from the legacy menu key or a clean saved copy',()=>{
  const storage=new MemoryStorage(),base=initial();storage.setItem('legacy',JSON.stringify({...base,name:'Another map'}));
  const draft=new EditorDraft(storage,'threewater-forest',base);expect(draft.restore(['legacy'])).toEqual({});
  draft.write({...base,description:'Saved locally'},false);expect(draft.restore()).toEqual({});
 });
});
