import {expect,it} from 'vitest';
import {experienceMeter} from '../../src/presentation/experience';
import {game} from './helpers';
it('uses authored thresholds at level boundaries and fills the capped level without revealing hidden XP',()=>{
 const g=game(),hero=g.entities.find(e=>e.owner==='player.1'&&e.progression)!,definition=g.registry.get(hero.definition);
 const meter=(xp:number)=>{hero.progression!.experience=xp;g.observation.update();return experienceMeter(g.view('player.1').entities.find(e=>e.id===hero.id)!,definition)!;};
 expect(meter(80)).toMatchObject({fraction:.5,label:'Experience: 80 / 160'});
 expect(meter(160)).toMatchObject({fraction:0,label:'Experience: 0 / 240'});
 expect(meter(5200)).toMatchObject({fraction:1,label:'Maximum level 11'});
 const view=g.view('player.1').entities.find(e=>e.id===hero.id)!;
 expect(experienceMeter({...view,progression:undefined},definition)).toBeNull();
 const worker=g.view('player.1').entities.find(e=>e.definition==='unit.ants.settler')!;
 expect(experienceMeter(worker,g.registry.get(worker.definition))).toBeNull();
});

it('explains the neutral ceiling while leaving player-combat progression open',()=>{
 const g=game(),hero=g.entities.find(e=>e.owner==='player.1'&&e.progression)!;
 hero.progression!.experience=1600;g.observation.update();
 const view=g.view('player.1').entities.find(e=>e.id===hero.id)!;
 const meter=experienceMeter(view,g.registry.get(hero.definition),undefined,6)!;
 expect(meter.fraction).toBe(0);expect(meter.description).toContain('Neutral creeps no longer grant experience');
 expect(meter.description).toContain('560 more to reach level 7');
});
