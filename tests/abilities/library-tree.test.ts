import {it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readLibraryTree,mutateLibraryTree} from '../../tooling/spell-editor/server/libraryTree';
import {treeActionSchema} from '../../tooling/spell-editor/shared/libraryTree';
it('persists folders and bulk moves without changing document IDs; prevents stale edits, cycles and destructive folder removal',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'utc-folders-'));try{
  const docs=['effect.test.fire','effect.test.sparks'];let state=await readLibraryTree(root,'effects');
  const mutate=async(action:any)=>state=await mutateLibraryTree(root,'effects',treeActionSchema.parse(action),state.revision,docs);
  await mutate({type:'create',parent:'root',name:'spells'});const spells=state.tree.folders[0].id;
  await mutate({type:'create',parent:spells,name:'heroes'});const heroes=state.tree.folders[1].id;
  await mutate({type:'move',ids:docs,parent:heroes});expect(state.tree.items).toEqual(Object.fromEntries(docs.map(id=>[id,heroes])));
  await expect(mutate({type:'move',ids:[spells],parent:heroes})).rejects.toThrow('descendants');
  await expect(mutate({type:'remove',id:heroes})).rejects.toThrow('contents');
  await expect(mutate({type:'create',parent:spells,name:'Heroes'})).rejects.toThrow('already exists');
  const stale=state.revision;await mutate({type:'rename',id:heroes,name:'champions'});expect(state.tree.items[docs[0]]).toBe(heroes);
  await expect(mutateLibraryTree(root,'effects',{type:'create',parent:'root',name:'stale'},stale,docs)).rejects.toThrow('conflict');
  expect(await readLibraryTree(root,'effects')).toEqual(state);
  await mutate({type:'move',ids:docs,parent:'root'});await mutate({type:'remove',id:heroes});expect(state.tree.folders).toHaveLength(1);
  await expect(mutate({type:'move',ids:['root'],parent:spells})).rejects.toThrow('Root');
  await expect(mutate({type:'move',ids:['effect.missing'],parent:spells})).rejects.toThrow('Unknown document');
  expect((await readLibraryTree(root,'spells')).tree.folders).toHaveLength(0);
 }finally{await rm(root,{recursive:true,force:true});}
});
it('rejects malformed names and unsafe tree identifiers',()=>{
 for(const name of ['../escape','hello/world','..',''])expect(treeActionSchema.safeParse({type:'create',parent:'root',name}).success).toBe(false);
 expect(treeActionSchema.safeParse({type:'move',ids:['../bad'],parent:'root'}).success).toBe(false);
});
