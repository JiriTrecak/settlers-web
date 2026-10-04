import {SpellContainments} from '../abilities/containment';
import type {Owner} from '../../content/schema';
import type {Game} from './game';
import {alive,type Entity} from './state';
import {colonySupply,supplyAdmission} from './supply';

/** Atomic permanent unit conversion; no replacement entity or second supply counter. */
export class UnitOwnership {
 constructor(private readonly game:Game){}
 reason(e:Entity|undefined,owner:Owner,supply:'require'|'allow-over-cap',camp?:string):string|null{
  const c=this.game.context;
  if(!e?.unit||!alive(e)||e.fallen||c.def(e).hero)return 'Choose a living non-hero unit';
  if(owner!=='none'&&!c.def(e).behaviors.playerControl)return 'Unit does not support player control';
  if(e.summoned?.splitOperation||e.unit.contained||e.unit.garrison||e.unit.release)return 'Unit is unavailable';
  if(e.owner===owner&&(owner!=='none'||e.unit.camp===(camp??null)))return 'Unit already belongs to this controller';
  const population=colonySupply(c.populationCandidates(),owner,c.registry);
  return supplyAdmission(population,supply==='require'?c.def(e).supplyCost??0:0);
 }
 transfer(e:Entity,owner:Owner,supply:'require'|'allow-over-cap',camp?:string):boolean{
  if(this.reason(e,owner,supply,camp))return false;
  const c=this.game.context,u=e.unit!,position=u.position?{...u.position}:null,cargo=u.cargo,cooldown=u.cooldown,charge=u.charge?{...u.charge,target:null}:undefined;
  new SpellContainments(this.game).releaseHosted(e.id);
  this.game.abilities.cancel(e.id,'Owner changed');
  this.game.economy.detachUnit(e);
  e.owner=owner;
  e.unit={...c.freshUnit(),position,cargo,cooldown,...(charge?{charge}:{}),camp:owner==='none'?camp??null:null};
  e.spellStatuses=e.spellStatuses?.filter(s=>!s.aura);
  if(!e.spellStatuses?.length)delete e.spellStatuses;
  c.clampPools(e);
  c.spatial.updateUnitMovement(e);
  c.motionRevision++;c.observationRevision++;
  return true;
 }
}
