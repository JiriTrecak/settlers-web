import { describe, expect, it } from 'vitest';
import { MatchHost } from '../../src/net';
import { chatText } from '../../src/shared/chat/chat';
import type { ClientMsg, ServerMsg } from '../../src/shared';

describe('match chat', () => {
  it('broadcasts to both players using authenticated identity and leaves simulation untouched', () => {
    const host = new MatchHost();
    const a = host.create({name:'Chat',mapId:'map',mapRevision:'map.json',slotCount:2,guestName:'Alice'});
    const room = host.get(a.room.id)!;
    const b = room.join('Bob','player') as {token:string};
    const receivedA: ServerMsg[] = [], receivedB: ServerMsg[] = [];
    room.bind(a.token,m=>receivedA.push(m)); room.bind(b.token,m=>receivedB.push(m));
    room.start(a.token);
    receivedA.length=receivedB.length=0;
    room.ingest(b.token,{type:'chat',text:'hello',name:'Alice',player:0} as ClientMsg);
    const expected = {type:'chat',message:{name:'Bob',player:1,text:'hello'}};
    expect(receivedA).toEqual([expected]); expect(receivedB).toEqual([expected]);
    expect(room.view().tick).toBe(0);
    room.ingest(b.token,{type:'chat',text:'spam'});
    room.ingest('invalid-token',{type:'chat',text:'spoof'});
    expect(receivedA).toHaveLength(1);
    room.unbind(a.token); receivedB.length=0;
    room.ingest(a.token,{type:'chat',text:'offline'});
    expect(receivedB).toEqual([]);
  });
  it('rejects empty and malformed text, bounds size, preserves literal text for safe DOM rendering',()=>{
    expect(chatText({text:'hi'})).toBeNull();
    expect(chatText(' \n\t ')).toBeNull();
    expect(chatText('a'.repeat(400))).toHaveLength(300);
    expect(chatText(' hi\nthere ')).toBe('hi there');
    expect(chatText('<img src=x onerror=evil()>')).toBe('<img src=x onerror=evil()>');
  });
});
