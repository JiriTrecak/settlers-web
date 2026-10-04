import {it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {EffectStore} from '../../tooling/spell-editor/server/effects';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import {coreAbilities} from '../../src/content/abilities/core';
import {visualEffectSchema} from '../../src/content/effects/schema';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
import {authoringResponse} from '../../tooling/spell-editor/server/toolResponses';
it('rebuilds curved swarm history on seek, clears it on reset, and keeps it out of compact assistant replies',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'trail-preview-'));try{
  const effect=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.trail',name:'Trail',durationTicks:200,layers:[{id:'head',shape:'missile',colour:'#ffffff',accent:'#ffffff',durationTicks:200,count:1,size:.3,height:.9,trail:{durationTicks:20,maxPoints:32,width:.3,colour:'#88ff99',opacity:.7,breakDistance:3}}]});
  const store=new EffectStore(root),saved=await store.save(effect,null);await store.publish(effect.id,saved.revision);
  const definition=structuredClone(coreAbilities.abilities.find(a=>a.id==='ability.core.spirit-swarm')!),presentation=structuredClone(coreAbilities.presentations.find(p=>p.id===definition.presentation)!);delete presentation.icon;presentation.effects=[{id:'flight',effect:effect.id,event:'projectile',anchor:'target',lifetime:'finite'}];
  const service=new SpellEditorService(root);await service.execute({op:'preview.load',document:{definition,presentation},settings:{targetCount:3,relationship:'enemy',targetHealth:500,casterHealth:100,distance:6}});
  await service.execute({op:'preview.cast'});await service.execute({op:'preview.seek',tick:90});
  const first=service.state() as PreviewState;expect(first.deliveryHistory?.length).toBeGreaterThan(0);expect(first.deliveryHistory?.some(p=>p.points.length>10)).toBe(true);
  const compact=authoringResponse({op:'preview.state'},first,{response:'compact',offset:0,limit:20}) as Record<string,unknown>;expect(compact.deliveryHistory).toBeUndefined();expect(compact.omitted).toContain('deliveryHistory');
  await service.execute({op:'preview.seek',tick:5});await service.execute({op:'preview.seek',tick:90});const repeated=service.state() as PreviewState;expect(repeated.checksum).toBe(first.checksum);expect(repeated.deliveryHistory).toEqual(first.deliveryHistory);
  await service.execute({op:'preview.reset'});expect((service.state() as PreviewState).deliveryHistory).toEqual([]);
 }finally{await rm(root,{recursive:true,force:true});}
});
