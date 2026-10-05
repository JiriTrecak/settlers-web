import {afterEach,expect,it,vi} from 'vitest';
import type {MeshReply} from '../../src/render/debug/navigationMeshWorker';
import type {NavigationMeshSnapshot} from '../../src/sim/game/navigationDebug';

afterEach(()=>vi.unstubAllGlobals());
it('draws the routing polygons without the removed internal diagonals',async()=>{
 const postMessage=vi.fn(),port={onmessage:null as ((e:{data:NavigationMeshSnapshot})=>void)|null,postMessage};
 vi.stubGlobal('self',port);
 await import('../../src/render/debug/navigationMeshWorker');
 port.onmessage!({data:{size:32,radius:.34,revision:1,decks:0,walkable:new Uint8Array(32*32).fill(1),heights:new Int16Array(32*32)}});
 const reply=postMessage.mock.calls[0]![0] as MeshReply;
 expect(reply.error).toBeUndefined();expect(reply.triangles).toBe(2);expect(reply.polygons).toBe(1);
 expect(reply.edges.length).toBeGreaterThan(0);
 for(let i=0;i<reply.edges.length;i+=4){
  const [x,z,xx,zz]=reply.edges.slice(i,i+4);
  expect(x===xx||z===zz).toBe(true);
  expect(Math.hypot(xx!-x!,zz!-z!)).toBeLessThanOrEqual(2.00001);
 }
 expect(postMessage.mock.calls[0]![1]).toEqual([reply.edges.buffer]);
});
