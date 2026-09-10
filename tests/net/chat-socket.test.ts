import { expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { once } from 'node:events';
import { MatchHost } from '../../src/net';

it('delivers serialized chat in both directions over separate WebSocket connections', async () => {
  const host = new MatchHost();
  const created = host.create({name:'Chat integration',mapId:'test',mapRevision:'test',slotCount:2,guestName:'Alice'});
  const room = host.get(created.room.id)!;
  const joined = room.join('Bob','player') as {token:string};
  const server = new WebSocketServer({port:0,host:'127.0.0.1'});
  const clients: WebSocket[] = [];
  try {
    await once(server,'listening');
    const address = server.address(); if (typeof address === 'string' || !address) throw new Error('No port');
    server.on('connection',(socket,req)=>{
      const token = new URL(req.url!, 'http://localhost').searchParams.get('token')!;
      room.bind(token,msg=>socket.send(JSON.stringify(msg)));
      socket.on('message',raw=>room.ingest(token,JSON.parse(String(raw))));
    });
    const a = new WebSocket(`ws://127.0.0.1:${address.port}/?token=${created.token}`);
    const b = new WebSocket(`ws://127.0.0.1:${address.port}/?token=${joined.token}`);
    clients.push(a,b);
    await Promise.all([once(a,'open'),once(b,'open')]);
    room.start(created.token);
    const message = (socket: WebSocket) => new Promise<unknown>(resolve=>{
      const listener = (raw: unknown) => { const data=JSON.parse(String(raw)); if(data.type==='chat'){ socket.off('message',listener); resolve(data.message); } };
      socket.on('message',listener);
    });
    const toB = message(b); a.send(JSON.stringify({type:'chat',text:'Ready?'}));
    expect(await toB).toEqual({name:'Alice',player:0,text:'Ready?'});
    // Drain Alice's own echo before listening for the reply.
    const toA = new Promise<unknown>(resolve=>a.on('message',raw=>{const data=JSON.parse(String(raw));if(data.type==='chat'&&data.message.player===1)resolve(data.message);}));
    b.send(JSON.stringify({type:'chat',text:'Ready!'}));
    expect(await toA).toEqual({name:'Bob',player:1,text:'Ready!'});
  } finally {
    clients.forEach(client=>client.terminate());
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
