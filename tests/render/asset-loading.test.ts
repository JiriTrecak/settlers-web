import {describe,it,expect} from 'vitest';
import {DefaultLoadingManager as manager} from 'three';
import {AssetLoading} from '../../src/render/loading/assetLoading';
describe('match asset barrier',()=>{
 it('waits for nested resources, forwards progress and restores existing callbacks',async()=>{
  let inherited=0;const old=manager.onLoad;manager.onLoad=()=>inherited++;
  const progress:number[]=[];const loading=new AssetLoading(p=>progress.push(p.loaded!));
  manager.itemStart('model');manager.itemStart('texture');
  let ready=false;const promise=loading.ready().then(()=>ready=true);
  manager.itemEnd('model');await Promise.resolve();expect(ready).toBe(false);
  manager.itemEnd('texture');await promise;expect(ready).toBe(true);expect(progress.length).toBeGreaterThan(1);
  loading.close();expect(inherited).toBe(1);manager.onLoad=old;
 });
 it('reports failed files even when the loader otherwise resolves',async()=>{
  const loading=new AssetLoading(()=>{});manager.itemStart('missing.glb');manager.itemError('missing.glb');manager.itemEnd('missing.glb');
  await expect(loading.ready()).rejects.toThrow('missing.glb');loading.close();
 });
 it('releasing an old session does not detach a newer loading session',async()=>{
  const previous=manager.onLoad,a=new AssetLoading(()=>{}),b=new AssetLoading(()=>{});
  manager.itemStart('shared');const released=a.ready();a.close();await released;
  let finished=false;const pending=b.ready().then(()=>finished=true);await Promise.resolve();expect(finished).toBe(false);
  manager.itemEnd('shared');await pending;b.close();expect(manager.onLoad).toBe(previous);
 });
});

it('reports files relative to the current loading screen, not previous matches',async()=>{
 manager.itemStart('previous');manager.itemEnd('previous');
 const progress:{loaded?:number;total?:number}[]=[];
 const loading=new AssetLoading(p=>progress.push(p));
 manager.itemStart('new-model');manager.itemStart('new-texture');
 manager.itemEnd('new-model');manager.itemEnd('new-texture');await loading.ready();loading.close();
 expect(progress[0]).toMatchObject({loaded:0,total:1});
 expect(progress.at(-1)).toMatchObject({loaded:2,total:2});
});
