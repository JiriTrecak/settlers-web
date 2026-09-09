import {expect,it} from 'vitest';
import {experienceMeter} from '../../src/presentation/experience';
import {game} from './helpers';
it('uses authored thresholds at level boundaries and fills the capped level without revealing hidden XP',()=>{
 const g=game(),hero=g.entities.find(e=>e.owner==='player.1'&&e.progression)!,definition=g.registry.get(hero.definition);
 const meter=(xp:number)=>{hero.progression!.experience=xp;g.observation.update();return experienceMeter(g.view('player.1').entities.find(e=>e.id===hero.id)!,definition)!;};
 expect(meter(50)).toMatchObject({fraction:.5,label:'Experience: 50 / 100'});
 expect(meter(100)).toMatchObject({fraction:0,label:'Experience: 0 / 150'});
 expect(meter(3200)).toMatchObject({fraction:1,label:'Maximum level 10'});
 const view=g.view('player.1').entities.find(e=>e.id===hero.id)!;
 expect(experienceMeter({...view,progression:undefined},definition)).toBeNull();
 const worker=g.view('player.1').entities.find(e=>e.definition==='unit.ants.settler')!;
 expect(experienceMeter(worker,g.registry.get(worker.definition))).toBeNull();
});
