import type {AbilityState,SpellStatus} from '../../../src/sim/abilities/state';
import type {AbilityEvent} from '../../../src/sim/abilities/runtime';
import type {EncounterSettings} from '../../../src/content/abilities/encounter';
import type {SpellDocument} from './protocol';
export type PreviewState={loaded:boolean;active:boolean;targeting:boolean;rank:number;duration:number;epoch:number;tick:number;playing:boolean;speed:number;settings:EncounterSettings;caster:number;target:number;aim:{x:number;y:number};events:AbilityEvent[];timelineEvents:AbilityEvent[];deliveries:import('../../../src/sim/abilities/runtime').AbilityDeliveryView[];checksum:number;document:SpellDocument;entities:{id:number;owner:string;x:number;y:number;rotation:number;hp:number|null;maxHp:number;definition:string;modelDefinition?:string;spellStatuses?:SpellStatus[];abilities?:AbilityState}[]};
