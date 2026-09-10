import {expect,it} from 'vitest';
import {localMatch} from '../../src/shared';
import {Lockstep,MemoryChannel,Room} from '../../src/net';
it('commits local input on the next simulation tick, with no extra empty input tick',()=>{
 const config=localMatch({mapId:'test',mapRevision:'test',seed:1,slotCount:2,me:0,delay:1});
 const room=new Room(config),peers=[0,1].map(id=>new Lockstep(new MemoryChannel(room,id),id,1));
 for(let tick=1;tick<=4;tick++){
  const action={type:'move' as const,actors:[1],destination:{x:tick,y:10}};
  peers[0].send(action);
  for(const p of peers)p.confirm(tick,tick);
  const a=peers[0].take(tick)!,b=peers[1].take(tick)!;
  expect(a).toEqual(b);expect(a.slots.find(s=>s.player===0)!.actions).toEqual([action]);
 }
});
