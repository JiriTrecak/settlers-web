import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {openMapPreview,receiveMapPreview} from '../../src/editor/file/preview';
import {emptyUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
let listeners:Set<(event:MessageEvent)=>void>,preview:any,opener:any,host:any;
beforeEach(()=>{
 vi.useFakeTimers();listeners=new Set();preview={postMessage:vi.fn(),closed:false};opener={postMessage:vi.fn(),closed:false};
 host={location:{origin:'http://localhost'},open:vi.fn(()=>preview),opener,
 addEventListener:vi.fn((_:string,fn:any)=>listeners.add(fn)),removeEventListener:vi.fn((_:string,fn:any)=>listeners.delete(fn))};
 vi.stubGlobal('window',host);
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function message(source:any,type:string,token:string,map?:unknown,origin='http://localhost'){
 for(const fn of listeners)fn({source,origin,data:{type,token,map}} as MessageEvent);
}
it('hands a frozen snapshot only to the expected tab with the matching token and origin',async()=>{
 const map=emptyUtcMap(),pending=openMapPreview(map);Object.assign(map,{name:'Later edits'});
 const token=new URL(host.open.mock.calls[0][0],'http://localhost').searchParams.get('preview')!;
 message({},'utc-map-preview-ready',token);message(preview,'utc-map-preview-ready','wrong');
 message(preview,'utc-map-preview-ready',token,undefined,'https://elsewhere.test');expect(preview.postMessage).not.toHaveBeenCalled();
 message(preview,'utc-map-preview-ready',token);await pending;
 expect(preview.postMessage.mock.calls[0][0].map.name).toBe(emptyUtcMap().name);
 expect(listeners.size).toBe(0);expect(vi.getTimerCount()).toBe(0);
});
it('accepts a document only from the opening editor and consumes its listener',async()=>{
 const pending=receiveMapPreview('token');expect(opener.postMessage).toHaveBeenCalledWith({type:'utc-map-preview-ready',token:'token'},'http://localhost');
 message({},'utc-map-preview-document','token',emptyUtcMap());expect(listeners.size).toBe(1);
 message(opener,'utc-map-preview-document','token',JSON.parse(stringifyUtcMap(emptyUtcMap())));expect(await pending).toEqual(emptyUtcMap());
 expect(listeners.size).toBe(0);expect(vi.getTimerCount()).toBe(0);
});
it('reports an expired test without consulting saved maps',async()=>{
 host.opener=null;await expect(receiveMapPreview('token')).rejects.toThrow('expired');
});
it('reports a closed preview and cleans up pending handoff',async()=>{
 const pending=expect(openMapPreview(emptyUtcMap())).rejects.toThrow('closed');preview.closed=true;
 await vi.advanceTimersByTimeAsync(1000);await pending;expect(listeners.size).toBe(0);expect(vi.getTimerCount()).toBe(0);
});
it('times out an abandoned handshake and removes the listener',async()=>{
 const pending=expect(receiveMapPreview('token')).rejects.toThrow('expired');
 await vi.advanceTimersByTimeAsync(60_000);await pending;expect(listeners.size).toBe(0);
});
it('serializes runtime editor fields into the portable map contract before handoff',async()=>{
 const map={...emptyUtcMap(),landscape:{environment:{hour:12,playing:false},strokes:[],cover:[]}};
 const pending=openMapPreview(map);
 const token=new URL(host.open.mock.calls[0][0],'http://localhost').searchParams.get('preview')!;
 message(preview,'utc-map-preview-ready',token);await pending;
 expect(preview.postMessage.mock.calls[0][0].map.landscape).toEqual({environment:{hour:12,playing:false}});
});
