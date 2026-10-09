import {expect,it} from 'vitest';
import {MatchHost} from '../../src/net/host';
import type {ServerMsg} from '../../src/shared/net/wire';
it('authenticates race choices, resets hero choice and freezes identical mixed-race starts',()=>{
 const host=new MatchHost(),created=host.create({name:'test',mapId:'test',mapRevision:'test',slotCount:2,guestName:'Host'}),room=host.get(created.room.id)!;
 const guest=room.join('Guest','player') as {token:string},spectator=room.join('Watcher','spectator') as {token:string};const a:ServerMsg[]=[],b:ServerMsg[]=[];room.bind(created.token,m=>a.push(m));room.bind(guest.token,m=>b.push(m));
 room.ingest(guest.token,{type:'selectRace',race:'beetles'});expect(room.view().slots.map(s=>[s.race,s.hero])).toEqual([['ants','unit.ants.marshal'],['beetles','unit.beetles.hornbreaker']]);expect(a.at(-1)).toEqual(b.at(-1));
 const before=room.view();room.ingest(spectator.token,{type:'selectRace',race:'ants'});room.ingest(guest.token,{type:'selectRace',race:'bad'});room.ingest(guest.token,{type:'selectHero',hero:'unit.ants.marshal'});expect(room.view()).toEqual(before);
 const started=room.start(created.token);expect(started).toHaveProperty('config');if(!('config'in started))return;
 expect(a.find(m=>m.type==='start')).toMatchObject({config:started.config});expect(b.find(m=>m.type==='start')).toMatchObject({config:started.config});room.ingest(guest.token,{type:'selectRace',race:'ants'});expect(started.config.slots[1]).toMatchObject({race:'beetles',hero:'unit.beetles.hornbreaker'});expect(room.restart(created.token)).toMatchObject({config:{slots:started.config.slots}});
});
