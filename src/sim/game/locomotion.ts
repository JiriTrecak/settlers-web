import type {Definition} from '../../content/schema';
/** One classification shared by navigation, weapons, spells and observations. Buildings are ground targets. */
export const locomotion=(d:Pick<Definition,'behaviors'>):'ground'|'air'=>d.behaviors.movement?.locomotion??'ground';
export const flightHeight=(d:Pick<Definition,'behaviors'>)=>locomotion(d)==='air'?(d.behaviors.movement?.flightHeight??6):0;
export function weaponTargets(combat:Definition['behaviors']['combat'],target:Pick<Definition,'behaviors'>){
 return !!combat&&(combat.targets??(combat.projectile?['ground','air']:['ground'])).includes(locomotion(target));
}
