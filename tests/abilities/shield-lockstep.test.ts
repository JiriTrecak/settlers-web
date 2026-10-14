import {expect,it} from 'vitest';
import {encounter,runLockstep,testAbility} from './encounter-harness';

it.each([false,true])('replays absorption pool and lifecycle with combat=%s across delayed peers',combat=>{
 const ability=testAbility('ability.test.absorption-shield');
 const f=encounter(ability,{relationship:'enemy',combat,targetCount:3,targetSpacing:2,distance:2,casterHealth:500,targetHealth:500,mana:1000});
 let applied=false,partial=false,depleted=false,expired=false,lossAfterPool=false,expires=0,full=0,previous:{pool:number;hp:number}|undefined;
 const leader=runLockstep(f.game,{type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:f.caster}},450,{restoreAt:[3,18,410],onTick:(tick,world)=>{
  const caster=world.settlement.context.get(f.caster)!,status=caster?.spellStatuses?.find(s=>s.ability===ability.id);let restore=false;
  if(status){
   if(!applied){full=status.shield!;expect(full).toBeGreaterThan(0);applied=true;expires=status.expires;}
   const pool=status.shield!;
   if(previous&&pool>0){expect(pool).toBeLessThanOrEqual(previous.pool);expect(caster.hp).toBe(previous.hp);}
   if(pool>0&&pool<full&&!partial){partial=true;restore=true;}
   previous={pool,hp:caster.hp!};
  }else if(applied&&!combat){expect(caster.hp).toBe(500);expect(tick).toBeGreaterThanOrEqual(expires);expired=true;}
  else if(applied&&combat&&caster){
   if(!depleted){expect(tick).toBeLessThan(expires);expect(partial).toBe(true);depleted=true;restore=true;}
   if(previous?.pool===0&&caster.hp!<previous.hp)lossAfterPool=true;
   previous={pool:0,hp:caster.hp!};
  }
  return restore;
 }});
 expect(applied).toBe(true);
 if(combat){expect(partial).toBe(true);expect(depleted).toBe(true);expect(lossAfterPool).toBe(true);}
 else{expect(partial).toBe(false);expect(expired).toBe(true);expect(leader.settlement.context.get(f.caster)!.abilities!.mana).toBeLessThan(1000);}
},20000);
