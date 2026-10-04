import {expect,it,vi} from 'vitest';
import {Texture} from 'three';
import {EffectImages} from '../../src/render/abilities/effectImages';
import {EffectPlayer} from '../../src/render/abilities/effectPlayer';
import {visualEffectSchema} from '../../src/content/effects/schema';
import {EFFECT_IMAGE_LIMITS as limits} from '../../src/content/effects/limits';
vi.mock('../../src/content/abilities/resources',async importOriginal=>({...await importOriginal<object>(),effectImage:(ref:{asset:string})=>({path:ref.asset+'.png',bytes:ref.asset.endsWith('oversized')?limits.maxBytes+1:100})}));
const ref=(i:number|string)=>({asset:'asset.test.'+i,role:'image' as const,index:1});
function fixture(size=512){
 const maps:Texture[]=[],completed:(()=>void)[]=[],failed:(()=>void)[]=[],disposed:ReturnType<typeof vi.fn>[]=[];
 const cache=new EffectImages((_url,load,error)=>{const map=new Texture({width:size,height:size}),dispose=vi.fn();map.addEventListener('dispose',dispose);maps.push(map);disposed.push(dispose);completed.push(()=>load(map));failed.push(error);return map;});
 return {cache,maps,completed,failed,disposed};
}
it('shares an active image across leases and retires old idle images during repeated authoring',async()=>{
 const f=fixture(),pinned=f.cache.acquire(ref('pinned')),shared=f.cache.acquire(ref('pinned'));expect(shared.map).toBe(pinned.map);expect(f.maps).toHaveLength(1);
 f.completed[0]();await pinned.ready;
 for(let i=0;i<60;i++){const image=f.cache.acquire(ref(i));f.completed.at(-1)!();await image.ready;image.release();}
 expect(f.disposed[0]).not.toHaveBeenCalled();expect(f.disposed.filter(d=>!d.mock.calls.length)).toHaveLength(limits.cachedImages+1);
 pinned.release();expect(f.disposed[0]).not.toHaveBeenCalled();shared.release();expect(f.disposed[0]).toHaveBeenCalled();f.cache.dispose();expect(f.disposed.every(d=>d.mock.calls.length>0)).toBe(true);
});
it('bounds pending requests and admits a new image after an unused load settles',async()=>{
 const f=fixture();for(let i=0;i<limits.entries;i++)f.cache.acquire(ref(i)).release();
 const denied=f.cache.acquire(ref('denied'));await denied.ready;expect(denied.error?.message).toContain('budget');expect(f.maps).toHaveLength(limits.entries);denied.release();
 f.completed[0]();await Promise.resolve();const next=f.cache.acquire(ref('next'));expect(next.error).toBeUndefined();expect(f.maps).toHaveLength(limits.entries+1);expect(f.disposed[0]).toHaveBeenCalled();next.release();f.cache.dispose();
});
it('releases a waiting capture on cue cancellation and safely retires a late image after disposal',async()=>{
 const f=fixture(),image=f.cache.acquire(ref(1));image.release();await image.ready;
 f.cache.dispose();expect(f.disposed[0]).toHaveBeenCalled();f.completed[0]();await Promise.resolve();expect(f.disposed[0]).toHaveBeenCalledTimes(2);
 const closed=f.cache.acquire(ref(2));await closed.ready;expect(closed.error?.message).toContain('closed');expect(f.maps).toHaveLength(1);closed.release();
});
it('reports failed loads, removes unreferenced failures and permits a later retry',async()=>{
 const f=fixture(),image=f.cache.acquire(ref(1));f.failed[0]();await image.ready;expect(image.error?.message).toContain('failed to load');expect(image.map.image).toBeNull();image.release();
 const retry=f.cache.acquire(ref(1));expect(f.maps).toHaveLength(2);f.completed[1]();await retry.ready;expect(retry.error).toBeUndefined();retry.release();f.cache.dispose();
});
it('enforces decoded image and resident memory budgets without evicting active images',async()=>{
 const compressed=fixture(),tooLarge=compressed.cache.acquire(ref('oversized'));await tooLarge.ready;expect(tooLarge.error?.message).toContain('8 MB');expect(compressed.maps).toHaveLength(0);tooLarge.release();compressed.cache.dispose();
 const huge=fixture(2049),bad=huge.cache.acquire(ref(0));huge.completed[0]();await bad.ready;expect(bad.error?.message).toContain('2048');bad.release();huge.cache.dispose();
 const f=fixture(2048),active=[];
 for(let i=0;i<2;i++){const image=f.cache.acquire(ref(i));f.completed.at(-1)!();await image.ready;expect(image.error).toBeUndefined();active.push(image);}
 const denied=f.cache.acquire(ref(2));f.completed[2]();await denied.ready;expect(denied.error?.message).toContain('resident memory');expect(f.disposed[0]).not.toHaveBeenCalled();expect(f.disposed[1]).not.toHaveBeenCalled();denied.release();
 active[0].release();const next=f.cache.acquire(ref(3));f.completed[3]();await next.ready;expect(next.error).toBeUndefined();expect(f.disposed[0]).toHaveBeenCalled();active[1].release();next.release();f.cache.dispose();
});
it('pins one image per effect cue and releases a pending capture when its effect is stopped',async()=>{
 const f=fixture(),player=new EffectPlayer(undefined,f.cache);
 const effect=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.image',name:'Image',durationTicks:40,layers:[{id:'burst',shape:'burst',durationTicks:40,count:12,size:1,height:1,colour:'#ffffff',accent:'#ffffff',texture:ref(1)}]});
 const handle=player.play(effect);expect(f.maps).toHaveLength(1);let finished=false;const capture=player.ready().then(()=>finished=true);await Promise.resolve();expect(finished).toBe(false);player.stop(handle);await capture;expect(finished).toBe(true);
 f.failed[0]();await Promise.resolve();await expect(player.ready()).resolves.toBeUndefined();player.play(effect);expect(f.maps).toHaveLength(2);f.completed[1]();await player.ready();player.dispose();expect(f.disposed[1]).toHaveBeenCalled();
});
