import {expect,it} from 'vitest';
import {game,placed,run} from '../game/helpers';
function fixture(){
 const g=game([placed('banner','unit.ants.banneret',215,230),placed('second','unit.ants.banneret',214,235),placed('ally','unit.ants.warrior',223,230),placed('far','unit.ants.warrior',240,250),placed('building','building.ants.house',225,240),{...placed('enemy','unit.ants.warrior',225,230),owner:'player.2'}]);
 const get=(id:string)=>g.entities.find(e=>e.placement===id)!;return{g,get};
}
it('rallies nearby allied units for 15% damage, excluding buildings, enemies and distant units',()=>{
 const {g,get}=fixture(),a=get('ally'),base=g.context.stats(a).damage;
 expect(g.abilities.cast(get('banner').id,'rallying-standard',get('banner').id)).toBeNull();
 for(let i=0;i<20;i++)g.tick(undefined,{passiveUnits:true});
 expect(g.context.stats(a).damage).toBeCloseTo(base*1.15,6);expect(get('banner').spellStatuses?.some(s=>s.status==='rallied')).toBe(true);
 for(const id of ['enemy','far','building'])expect(get(id).spellStatuses?.some(s=>s.status==='rallied')??false).toBe(false);
});
it('refreshes the same rally from a second Banneret without stacking and expires deterministically',()=>{
 const {g,get}=fixture(),a=get('ally'),base=g.context.stats(a).damage;
 g.abilities.cast(get('banner').id,'rallying-standard',get('banner').id);for(let i=0;i<20;i++)g.tick(undefined,{passiveUnits:true});
 g.abilities.cast(get('second').id,'rallying-standard',get('second').id);for(let i=0;i<20;i++)g.tick(undefined,{passiveUnits:true});
 expect(a.spellStatuses?.filter(s=>s.status==='rallied')).toHaveLength(1);expect(g.context.stats(a).damage).toBeCloseTo(base*1.15,6);
 const other=fixture().g;other.restore(g.snapshot());for(let i=0;i<500;i++){g.tick(undefined,{passiveUnits:true});other.tick(undefined,{passiveUnits:true});}
 expect(g.context.stats(a).damage).toBe(base);expect(g.checksum()).toBe(other.checksum());
});
it('saves its rally until enemies are near when autocast is enabled',()=>{
 const g=game([placed('banner','unit.ants.banneret',215,230),placed('ally','unit.ants.warrior',218,235)]),b=g.entities.find(e=>e.placement==='banner')!;b.unit!.order={type:'hold'};
 for(let i=0;i<80;i++)g.tick();expect(b.spellStatuses?.length??0).toBe(0);
 const e=g.context.create({...placed('enemy','unit.ants.warrior',235,230),owner:'player.2'});e.unit!.order={type:'hold'};
 let rallied=false;for(let i=0;i<100;i++){g.tick();rallied ||= b.spellStatuses?.some(s=>s.status==='rallied')??false;}expect(rallied).toBe(true);
});
it('recruits the Banneret with a standard and rally binding from ant barracks',()=>{
 const g=game([placed('b','building.ants.barracks',160,180),placed('supply','building.ants.house',245,240)]),b=g.entities.find(e=>e.placement==='b')!;g.state.wallets['player.1']={'item.amber':10000,'item.wood':10000};
 expect(g.command('player.1',{type:'produce',actor:b.id,definition:'unit.ants.banneret'}).accepted).toBe(true);run(g,1050);
 const u=g.entities.find(e=>e.definition==='unit.ants.banneret');expect(u).toBeDefined();expect(g.registry.get(u!.definition).asset).toBe('asset.ants.banneret');expect(g.registry.get(u!.definition).behaviors.abilities!.bindings[0].ability).toBe('ability.ants.rallying-standard');
});
