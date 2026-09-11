import {afterEach,expect,it,vi} from 'vitest';
import {WebSocket,WebSocketServer} from 'ws';
import {once} from 'node:events';
import {MatchHost} from '../../src/net/host';
import {WebSocketChannel} from '../../src/net/ws';
import {connectionDelay} from '../../src/net/latency';
import type {ServerMsg} from '../../src/shared';
afterEach(()=>vi.unstubAllGlobals());

it('measures real separate socket connections before gameplay listeners exist',async()=>{
  vi.stubGlobal('WebSocket',WebSocket);
  const host=new MatchHost(),created=host.create({name:'latency',mapId:'test',mapRevision:'test',slotCount:2,guestName:'A'});
  const room=host.get(created.room.id)!,joined=room.join('B','player') as {token:string};
  const server=new WebSocketServer({port:0,host:'127.0.0.1'}),channels:WebSocketChannel[]=[];
  try{
    await once(server,'listening');
    const address=server.address();if(!address||typeof address==='string')throw new Error('No port');
    server.on('connection',(socket,req)=>{
      const token=new URL(req.url!,'http://localhost').searchParams.get('token')!;
      socket.on('message',raw=>room.ingest(token,JSON.parse(String(raw))));
      room.bind(token,msg=>socket.send(JSON.stringify(msg)));
    });
    for(const token of [created.token,joined.token])channels.push(new WebSocketChannel(`ws://127.0.0.1:${address.port}/?token=${token}`));
    await vi.waitFor(()=>expect(room.view().slots.every(s=>s.roundTripMs!==undefined)).toBe(true),{timeout:3000});
    const messages:ServerMsg[][]=[[],[]];channels.forEach((c,i)=>c.onMessage(m=>messages[i].push(m)));
    const expected=connectionDelay(room.view().slots.map(s=>s.roundTripMs??null));
    const start=room.start(created.token);expect(start).toHaveProperty('config');
    if(!('config' in start))throw new Error(start.error);
    expect(start.config.delay).toBe(expected);
    await vi.waitFor(()=>expect(messages.every(ms=>ms.some(m=>m.type==='start'))).toBe(true));
    for(const ms of messages){
      expect(ms[0].type).toBe('welcome');
      expect(ms.some(m=>m.type==='latencyProbe')).toBe(false);
      expect(ms.find(m=>m.type==='start')).toMatchObject({config:{delay:start.config.delay}});
    }
  }finally{
    channels.forEach(c=>c.destroy());server.clients.forEach(c=>c.terminate());
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
