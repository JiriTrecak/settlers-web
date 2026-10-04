import {expect,it,vi} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,type Effect} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';

const injured={kind:'resource',of:'caster',resource:'health',measure:'missing',comparison:'gt',value:0} as const;
const heal:Effect={op:'heal',target:'caster',amount:100};
const vision:Effect={op:'vision',id:'afterglow',target:'point',amount:20,radius:3,ignoreTerrain:false,detectInvisible:false,endsWithCaster:false};
function fixture(name:string,onRelease:unknown[],patch={},settings={}){
 const base=coreAbilities.abilities.find(a=>a.id==='ability.core.'+name)!;
 const a=abilitySchema.parse({...base,onRelease,...patch}),p=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
 return {...createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'enemy',distance:6,mana:1000,...settings})),a};
}
function step(f:ReturnType<typeof fixture>,n=40){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
function baseOperation(name:string){return coreAbilities.abilities.find(a=>a.id==='ability.core.'+name)!.onRelease[0];}

it('validates only the selected arm and still rejects a selected blocked displacement',()=>{
 const name='blink';
 const op=baseOperation(name);
 for(const hp of [500,400]){
  const f=fixture(name,[{op:'branch',condition:injured,then:[op],else:[heal]}],{}, {casterHealth:hp});
  const blocked=vi.spyOn(f.game.spatial,'nearest').mockReturnValue(null);
  const aim={x:128,y:120};
  const result=f.game.abilities.cast(f.caster,'preview',aim);
  if(hp===400){expect(result).toBeTruthy();expect(f.game.context.get(f.caster)!.abilities!.mana).toBe(1000);}
  else{expect(result).toBeNull();step(f);expect(f.game.context.get(f.caster)!.spellSplit).toBeUndefined();expect(f.game.abilities.observedEvents().some(e=>e.event==='teleported'||e.event==='splitStarted')).toBe(false);}
  blocked.mockRestore();
 }
});
it('evaluates caster-operation branch conditions against the caster, not the enemy aim',()=>{
 const base=coreAbilities.abilities.find(a=>a.id==='ability.core.blink')!;
 const f=fixture('blink',[{op:'branch',condition:{kind:'relation',of:'target',to:'caster',is:'enemy'},then:[{...baseOperation('blink'),destination:'target'}],else:[heal]}],{targeting:{...base.targeting,kind:'unit',relations:['enemy'],radius:undefined}}, {casterHealth:400});
 const blocked=vi.spyOn(f.game.spatial,'nearest').mockReturnValue(null);
 expect(f.game.abilities.cast(f.caster,'preview',f.target!)).toBeNull();step(f);expect(f.game.context.get(f.caster)!.hp).toBe(500);blocked.mockRestore();
});
it('honors an operation filter before preflighting caster displacement',()=>{
 const f=fixture('blink',[{...baseOperation('blink'),filter:{heroes:true}}],{}, {casterHero:false});
 const blocked=vi.spyOn(f.game.spatial,'nearest').mockReturnValue(null);
 expect(f.game.abilities.cast(f.caster,'preview',{x:128,y:120})).toBeNull();step(f);
 expect(f.game.abilities.observedEvents().some(e=>e.event==='teleported')).toBe(false);blocked.mockRestore();
});
it('defers later conditional world checks when a preceding effect changes the branch input',()=>{
 const f=fixture('blink',[heal,{op:'branch',condition:injured,then:[baseOperation('blink')],else:[vision]}],{}, {casterHealth:400});
 const blocked=vi.spyOn(f.game.spatial,'nearest').mockReturnValue(null);
 expect(f.game.abilities.cast(f.caster,'preview',{x:128,y:120})).toBeNull();step(f);
 expect(f.game.context.get(f.caster)!.hp).toBe(500);expect(f.game.abilities.observedEvents().some(e=>e.event==='visionCreated')).toBe(true);
 expect(f.game.abilities.observedEvents().some(e=>e.event==='teleported')).toBe(false);blocked.mockRestore();
});
it.each([false,true])('conditional reincarnation respects its arm (selected=%s) across a queued-death save',selected=>{
 const base=coreAbilities.abilities.find(a=>a.id==='ability.core.reincarnation')!;
 const revive=base.triggers![0].operations[0];
 const patch={triggers:[{...base.triggers![0],operations:[{op:'branch',condition:{kind:'matches',of:'caster',filter:{heroes:selected}},then:[revive],else:[vision]}]}]};
 const f=fixture('reincarnation',base.onRelease,patch,{casterHero:true}),copy=fixture('reincarnation',base.onRelease,patch,{casterHero:true});
 const caster=f.game.context.get(f.caster)!;caster.hp=0;f.game.onCombatDeath(caster);copy.game.restore(JSON.parse(JSON.stringify(f.game.snapshot())));
 for(let i=0;i<320;i++){step(f,1);step(copy,1);expect(f.game.checksum()).toBe(copy.game.checksum());}
 expect(f.game.abilities.observedEvents().some(e=>e.event==='revived')).toBe(selected);
 expect(f.game.abilities.observedEvents().some(e=>e.event==='visionCreated')).toBe(!selected);
 expect((f.game.context.get(f.caster)!.hp??0)>0).toBe(selected);
});

it('keeps linked splitting explicitly atomic instead of silently supporting partial branch execution',()=>{
 expect(()=>fixture('spirit-trinity',[{op:'branch',condition:injured,then:[baseOperation('spirit-trinity')],else:[heal]}])).toThrow(/atomic direct self-cast/);
});
