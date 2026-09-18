import fs from 'node:fs';
import {Game} from '../../src/sim/game/game';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {captureCompany} from '../../src/sim/scenario/company';
import {expect,it} from 'vitest';
import type {CampaignCompany} from '../../src/shared/scenario/company';
const read=(id:string)=>parseUtcMap(JSON.parse(fs.readFileSync(`assets/maps/campaign/${id}.utcmap`,'utf8')))!;
it('wins the outdoor-to-indoor journey with normal orders, learned spells and collected loot',()=>{
let company:CampaignCompany|undefined;
for(const id of ['vanguard-hollow-gate','vanguard-heartwood-vault']){
 const entering=company;
 const g=new Game(read(id),[{player:0,kind:'human'}],undefined,123,company),hero=g.entities.find(e=>e.placement==='marshal')!;
 if(entering){expect(hero.equipment).toContain('item.barkguard');expect(g.entities.filter(e=>e.owner==='player.1'&&e.unit)).toHaveLength(entering.length);}
 if(!company)for(const ability of ['faultline','faultline','faultline','rally','carapace','crownfall']){const r=g.command('player.1',{type:'learnAbility',actor:hero.id,ability:`spell.marshal.${ability}`});if(!r.accepted)throw new Error(JSON.stringify(r));}
 let stage='',lastCast=-1000;const trace=[];
 const goals:Record<string,{x:number;y:number}>=id==='vanguard-hollow-gate'?{crossing:{x:153,y:163},gate:{x:188,y:119},enter:{x:188,y:104}}:{gallery:{x:120,y:143},resin:{x:180,y:136},heart:{x:165,y:80}};
 for(let tick=0;tick<16000&&!g.state.outcome;tick++){
  // Dialogue presentation is covered separately; skip its real-time duration.
  g.state.mission!.dialogue=null;
  // Let authored scene cleanup run before issuing player commands.
  if(g.state.mission!.scene){g.tick();continue;}
  const current=String(g.state.mission!.variables.stage??'');
  if(stage!==current){stage=current;trace.push({stage,tick,army:g.entities.filter(e=>e.owner==='player.1'&&e.unit&&e.hp!>0).length,hp:hero.hp});const p=goals[stage];if(p)g.command('player.1',{type:'move',actors:g.entities.filter(e=>e.owner==='player.1'&&e.unit&&e.hp!>0).map(e=>e.id),destination:p,attackMove:true});}
  if(hero.hp!>0){
   const visible=g.view('player.1').entities.filter(e=>e.owner==='none'&&e.unit&&e.hp!>0&&!e.remembered&&Math.hypot(e.x-hero.x,e.y-hero.y)<13);
   visible.sort((a,b)=>a.stats!.maxHp-b.stats!.maxHp||a.id-b.id);
   const e=visible[0];
   if(e&&tick%40===0){for(const ally of g.entities.filter(a=>a.owner==='player.1'&&a.unit&&a.hp!>0&&!a.spellcasting?.pending)){
     if(ally.unit!.order?.type!=='attack'||ally.unit!.order.target!==e.id){const r=g.command('player.1',{type:'attack',actors:[ally.id],target:e.id});if(!r.accepted)throw new Error(JSON.stringify(r));}
   }}
   if(e&&tick-lastCast>=40){for(const ability of ['crownfall','faultline',...(hero.hp!<700?['carapace']:[])]){
    const r=g.command('player.1',{type:'cast',actor:hero.id,ability:`spell.marshal.${ability}`,point:{x:Math.round(e.x),y:Math.round(e.y),...(e.surface?{surface:e.surface}:{})}});if(!r.accepted&&r.reason==='Invalid request')throw new Error(JSON.stringify(r));if(r.accepted){lastCast=tick;break;}
   }}
   if(!e&&tick%40===0&&!hero.spellcasting?.pending){const loot=g.view('player.1').entities.find(x=>x.item&&!x.remembered&&Math.hypot(x.x-hero.x,x.y-hero.y)<14);if(loot&&hero.equipment?.some(x=>!x)&&hero.unit!.order?.type!=='pickup')g.command('player.1',{type:'pickup',actor:hero.id,target:loot.id});}
   if(hero.hp!<700){const slot=hero.equipment?.indexOf('item.trailkeeper-flask')??-1;if(slot>=0)g.command('player.1',{type:'useItem',actor:hero.id,slot});}
   if(!e&&tick%80===0)for(const ally of g.entities.filter(a=>a.owner==='player.1'&&a.unit&&a.hp!>0&&!a.spellcasting?.pending&&!a.unit!.order)){
    const p=goals[stage];if(p)g.command('player.1',{type:'move',actors:[ally.id],destination:p,attackMove:true});
   }
  }
  g.tick();expect(g.state.mission?.error).toBeNull();
 }
 expect(g.state.outcome?.winner,JSON.stringify({id,stage,trace,survivors:g.entities.filter(e=>e.unit&&e.hp!>0).map(e=>({tag:e.placement,hp:e.hp,x:e.x,y:e.y,order:e.unit?.order}))})).toBe('player.1');
 expect(hero.hp).toBeGreaterThan(0);
 company=captureCompany(g);
}
},30000);
