import {expect,it} from 'vitest';
import {MatchHost} from '../../src/net/host';
import type {ServerMsg} from '../../src/shared/net/wire';
// ENGINE-COUPLED: MatchHost resolves lobby races and starting heroes from the shipped rules with no injection point,
// so the race and hero ids are read from that same shipped source rather than hard-coded.
import {content} from '../../src/content/builtin';
import {raceDefinition} from '../../src/content/races';

const rules=content.rules,home=rules.defaultRace,away=Object.keys(rules.races).find(id=>id!==home);
const heroOf=(race:string)=>race===home?rules.startingSetup.hero!.default:raceDefinition(rules,race).startingSetup.hero!.default;

it.runIf(away)('authenticates race choices, resets hero choice and freezes identical mixed-race starts',()=>{
 const other=away!,homeHero=heroOf(home),otherHero=heroOf(other);
 const host=new MatchHost(),created=host.create({name:'test',mapId:'test',mapRevision:'test',slotCount:2,guestName:'Host'}),room=host.get(created.room.id)!;
 const guest=room.join('Guest','player') as {token:string},spectator=room.join('Watcher','spectator') as {token:string};
 const a:ServerMsg[]=[],b:ServerMsg[]=[];room.bind(created.token,m=>a.push(m));room.bind(guest.token,m=>b.push(m));
 room.ingest(guest.token,{type:'selectRace',race:other});
 expect(room.view().slots.map(s=>[s.race,s.hero])).toEqual([[home,homeHero],[other,otherHero]]);expect(a.at(-1)).toEqual(b.at(-1));
 // Spectators, unknown races and heroes of another race leave every seat unchanged.
 const before=room.view();
 room.ingest(spectator.token,{type:'selectRace',race:home});room.ingest(guest.token,{type:'selectRace',race:'no-such-race'});
 room.ingest(guest.token,{type:'selectHero',hero:homeHero});
 expect(room.view()).toEqual(before);
 const started=room.start(created.token);expect(started).toHaveProperty('config');if(!('config'in started))return;
 expect(a.find(m=>m.type==='start')).toMatchObject({config:started.config});expect(b.find(m=>m.type==='start')).toMatchObject({config:started.config});
 room.ingest(guest.token,{type:'selectRace',race:home});
 expect(started.config.slots[1]).toMatchObject({race:other,hero:otherHero});
 expect(room.restart(created.token)).toMatchObject({config:{slots:started.config.slots}});
});
