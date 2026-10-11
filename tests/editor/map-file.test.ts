import {beforeEach,expect,it,vi} from 'vitest';
import {MapStore} from '../../src/editor/file/mapFile';
import {emptyUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {readText,writeText,type DiskHandle} from '../../src/editor/file/disk';
import {recallMap,rememberMap} from '../../src/editor/file/recent';
vi.mock('../../src/editor/file/disk',()=>({readText:vi.fn(),writeText:vi.fn()}));
vi.mock('../../src/editor/file/recent',()=>({recallMap:vi.fn(),rememberMap:vi.fn()}));
const handle={name:'map.utcmap'} as DiskHandle;
beforeEach(()=>{vi.resetAllMocks();vi.mocked(recallMap).mockResolvedValue(undefined);});
it('uses only a handle from an explicit load for subsequent Save',async()=>{
 const map=emptyUtcMap();vi.mocked(readText).mockResolvedValue({handle,name:handle.name,text:stringifyUtcMap(map)});
 vi.mocked(writeText).mockResolvedValue({handle,name:handle.name});
 const store=new MapStore();expect(await store.load()).toEqual({ok:true,map});
 expect(await store.save({...map,name:'Edited'})).toBe('ok');
 expect(writeText).toHaveBeenCalledWith(handle,'map.utcmap',stringifyUtcMap({...map,name:'Edited'}),{pick:false,startIn:handle});
 expect(rememberMap).toHaveBeenLastCalledWith({handle,name:'map.utcmap'});
});
it('never overwrites a remembered file without selecting it this session',async()=>{
 vi.mocked(recallMap).mockResolvedValue({handle,name:'old.utcmap'});
 vi.mocked(writeText).mockResolvedValue(undefined);
 const store=new MapStore();expect(await store.save(emptyUtcMap())).toBe('cancel');
 expect(vi.mocked(writeText).mock.calls[0][0]).toBeNull();expect(vi.mocked(writeText).mock.calls[0][3]).toEqual({pick:false,startIn:handle});
 expect(rememberMap).not.toHaveBeenCalled();
});
it('clearing the document removes the writable handle',async()=>{
 const map=emptyUtcMap();vi.mocked(writeText).mockResolvedValue({handle,name:handle.name});
 const store=new MapStore();await store.save(map);store.clearFile();await store.save(map);
 expect(vi.mocked(writeText).mock.calls[1][0]).toBeNull();
});
