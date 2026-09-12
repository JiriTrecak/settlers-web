import type { ContentRegistry } from '../content/registry';
import type { EntityView } from '../sim/game/observation';
import type { queueCard } from './commands';

type Task = ReturnType<typeof queueCard>[number];
/** The current operation occupies the health-bar column; waiting orders occupy the right wing. */
export function workplaceCard(focus: EntityView | undefined, queue: readonly Task[], registry: ContentRegistry) {
  let active: {key:string;icon:string;name:string;progress:number|null;task:Task|null}|null=null;
  let waiting=[...queue];
  let summary='';
  if (!focus || focus.remembered) return {active,waiting:[],summary};
  const definition=registry.get(focus.definition), policy=definition.behaviors.production;
  if (focus.upgrade) {
    const target=registry.get(focus.upgrade.target);
    active={key:`upgrade/${target.id}`,icon:target.icon,name:`Upgrading to ${target.name}`,progress:focus.upgrade.progress/definition.upgrade!.workTicks,task:null};
  } else if (focus.production?.active) {
    const operation=focus.production.active, product=registry.get(operation.definition);
    const task=queue.find(q=>q.id===operation.queue)??null;
    active={key:`production/${operation.queue ?? product.id}`,icon:product.icon,name:product.name,
      progress:operation.progress/(policy?.population?.intervalTicks??product.creation?.workTicks??1),task};
    waiting=queue.filter(q=>q!==task);
  } else if (queue.length) {
    const task=queue[0];
    active={key:`queue/${task.id}`,icon:task.icon,name:task.name,progress:task.progress,task};
    waiting=queue.slice(1);
  }
  if(focus.production)summary=focus.production.status;
  if(focus.gathering)summary=`${focus.gathering.workers}/${focus.gathering.capacity} workers · ${focus.resource?.amount??0} remaining`;
  return {active,waiting,summary};
}
