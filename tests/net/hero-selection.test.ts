import {expect,it} from 'vitest';
import {MatchHost} from '../../src/net/host';
import type {ServerMsg} from '../../src/shared/net/wire';
const heroes={default:'unit.ants.marshal',choices:['unit.ants.marshal','unit.test.warden']};
function fixture(){
 const host=new MatchHost(heroes),created=host.create({name:'test',mapId:'test',mapRevision:'test',slotCount:2,guestName:'Host'}),room=host.get(created.room.id)!;
 const joined=room.join('Guest','player') as {token:string},spectator=room.join('Watcher','spectator') as {token:string};
 const a:ServerMsg[]=[],b:ServerMsg[]=[];room.bind(created.token,m=>a.push(m));room.bind(joined.token,m=>b.push(m));
 return {room,created,joined,spectator,a,b};
}
it('broadcasts an owned choice then freezes it identically for every peer',()=>{
 const {room,created,joined,a,b}=fixture();room.ingest(joined.token,{type:'selectHero',hero:'unit.test.warden'});
 expect(room.view().slots.map(s=>s.hero)).toEqual(['unit.ants.marshal','unit.test.warden']);
 expect(a.at(-1)).toEqual(b.at(-1));
 const started=room.start(created.token);expect('config' in started).toBe(true);if(!('config' in started))return;
 expect(started.config.slots.map(s=>s.hero)).toEqual(['unit.ants.marshal','unit.test.warden']);
 expect(a.find(m=>m.type==='start')).toMatchObject({config:started.config});expect(b.find(m=>m.type==='start')).toMatchObject({config:started.config});
 room.ingest(joined.token,{type:'selectHero',hero:'unit.ants.marshal'});expect(started.config.slots[1].hero).toBe('unit.test.warden');
 expect(room.restart(created.token)).toMatchObject({config:{slots:started.config.slots}});
});
it('rejects undeclared heroes and spectator attempts without altering any seat',()=>{
 const {room,joined,spectator,b}=fixture(),before=room.view();
 room.ingest(spectator.token,{type:'selectHero',hero:'unit.test.warden'});expect(room.view()).toEqual(before);
 room.ingest(joined.token,{type:'selectHero',hero:'unit.ants.settler'});expect(room.view()).toEqual(before);
 expect(b.at(-1)).toMatchObject({type:'error',code:'INVALID_HERO'});
});
it('orders the host selection before Start on the same channel and refuses guest starts',()=>{
 const {room,created,joined,a,b}=fixture();
 room.ingest(joined.token,{type:'startMatch'});expect(room.view().state).toBe('waiting');expect(b.at(-1)).toMatchObject({type:'error',code:'START_REJECTED'});
 room.ingest(created.token,{type:'selectHero',hero:'unit.test.warden'});room.ingest(created.token,{type:'startMatch'});
 expect(a.find(m=>m.type==='start')).toMatchObject({config:{slots:[{hero:'unit.test.warden'},{hero:'unit.ants.marshal'}]}});
});
