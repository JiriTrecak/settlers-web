import type {WorldEditor} from '../world/worldEditor';
import {missionSchema} from '../../shared/scenario/schema';
import {validateMissionLua} from '../../shared/scenario/lua';
import './missionEditor.css';
/** Edits the map document. No engine objects or browser APIs are exposed to Lua. */
export class MissionEditor {
  private readonly root=document.createElement('dialog');
  constructor(host:HTMLElement,editor:WorldEditor,onTest:()=>void){
    this.root.className='mission-editor';this.root.setAttribute('aria-label','Mission Lua editor');
    this.root.innerHTML=`<header><div><small>MAP SCRIPTING</small><h2>Mission &amp; Lua</h2></div><button data-close aria-label="Close mission editor">×</button></header>
    <label class="mission-toggle"><input type="checkbox" data-enabled> Campaign mission (hidden from Skirmish)</label>
    <div class="mission-fields"><label>Campaign ID<input data-campaign value="vanguard"></label><label>Mission title<input data-title value="Mission 1 — Prologue"></label><label>Order<input data-order type="number" min="1" max="100" value="1"></label><label>Hero level cap<input data-level-cap type="number" min="1" max="10" placeholder="Unrestricted"></label></div>
    <div class="mission-fields"><label>Next chapter map ID<input data-next placeholder="End of campaign"></label><label>Travelling company (comma-separated Script IDs)<input data-company placeholder="marshal, guard-0, archer-0"></label></div>
    <div class="mission-editors"><label>Lua script<textarea data-script spellcheck="false" aria-label="Mission Lua script"></textarea></label><aside><label>Objective stages (JSON)<textarea data-objectives spellcheck="false" aria-label="Mission objectives JSON"></textarea></label><label>Regions (JSON)<textarea data-regions spellcheck="false" aria-label="Mission regions JSON"></textarea></label><label>Camp rewards &amp; encounters (JSON)<textarea data-camps spellcheck="false" aria-label="Mission camps JSON"></textarea></label><p>Use fixedDrops: ["item.barkguard"] for guaranteed rewards, or lootPool for random rolls.</p><details><summary>Unit camera shots</summary><p>Modes: rts, third-person, first-person. Subject and lookAt are unit Script IDs. Optional nil arguments use model defaults; seconds is transition duration (0–5). A shot starts a scene; end_scene restores the player camera. Gameplay visibility still applies.</p><pre>mission.camera("third-person", "marshal", "watch-captain", 6, 1.6, 55, 0.5)
mission.say("Marshal", "unit.ants.marshal", "We found them.", 4, true)
-- On the next stage:
mission.end_scene()</pre></details><strong>Entity references</strong><pre data-entities></pre><p>Give entities a unique Script ID in the Entities tool. Mark reinforcements “Spawn through Lua” before calling mission.spawn(id).</p><p>Callbacks: on_start(), on_tick() (10×/second). Use mission.get / set for saved variables; Lua locals reset each callback.</p><code>mission.begin_objective(id)<br>mission.complete_objective(id)<br>mission.fail_objective(id)<br>mission.transfer(id, owner)<br>mission.alive(id)<br>mission.recover(id)<br>mission.has_item(id, item)<br>mission.give_item(id, item)<br>mission.take_item(id, item)<br>mission.transform(id, definition, owner, optionalCamp)<br>mission.dialogue_busy()<br>mission.in_region(id, region)<br>mission.position(id)<br>mission.spawn(id)<br>mission.move(id, x, y)<br>mission.follow(id, target)<br>mission.damage(id, amount, optionalSource)<br>mission.begin_scene(x, y) / end_scene()<br>mission.camera(mode, id, lookAt, distance, height, fov, seconds)<br>mission.arrived(id, x, y)<br>mission.face(id, x, y)<br>mission.facing_done()<br>mission.attack(id, target)<br>mission.say(name, definition, text, seconds, cinematic)<br>mission.objective(text)<br>mission.tick()<br>mission.win() / lose()</code></aside></div>
    <footer><span role="status"></span><button data-validate>Check syntax</button><button data-save>Apply to map</button><button data-test>Apply &amp; play mission</button></footer>`;
    const field=<T extends HTMLElement>(selector:string)=>this.root.querySelector<T>(selector)!;
    const enabled=field<HTMLInputElement>('[data-enabled]'),campaign=field<HTMLInputElement>('[data-campaign]'),title=field<HTMLInputElement>('[data-title]'),order=field<HTMLInputElement>('[data-order]'),script=field<HTMLTextAreaElement>('[data-script]'),regions=field<HTMLTextAreaElement>('[data-regions]'),status=field<HTMLElement>('[role=status]');
    const objectives=field<HTMLTextAreaElement>('[data-objectives]');objectives.value=JSON.stringify(editor.map.mission?.objectives??[],null,2);
    const camps=field<HTMLTextAreaElement>('[data-camps]');camps.value=JSON.stringify(editor.map.camps,null,2);
    const levelCap=field<HTMLInputElement>('[data-level-cap]'),next=field<HTMLInputElement>('[data-next]'),company=field<HTMLInputElement>('[data-company]');
    next.value=editor.map.mission?.nextMission??'';company.value=editor.map.mission?.company?.join(', ')??'';
    const m=editor.map.mission;levelCap.value=String(m?.heroLevelCap??'');enabled.checked=!!m;if(m){campaign.value=m.campaign;title.value=m.title;order.value=String(m.order);}
    script.value=m?.script??'function on_start()\n  mission.objective("Explore the forest.")\nend\n\nfunction on_tick()\n  -- Use mission.get/set for persistent state.\nend\n';
    regions.value=JSON.stringify(m?.regions??[],null,2);field<HTMLElement>('[data-entities]').textContent=editor.map.entities.filter(p=>!p.id.startsWith('tree.')).slice(0,160).map(p=>`${p.id}${p.activation?' [spawn]':''}\n  ${p.definition}`).join('\n');
    const run=(fn:()=>void)=>{try{fn();status.style.color='#c4d9b9';}catch(e){status.textContent=(e as Error).message;status.style.color='#ff9c8f';}};
    const apply=()=>{const definition=enabled.checked?missionSchema.parse({campaign:campaign.value,title:title.value,order:Number(order.value),...(next.value.trim()?{nextMission:next.value.trim()}:{}),...(company.value.trim()?{company:company.value.split(',').map(s=>s.trim()).filter(Boolean)}:{}),objectives:JSON.parse(objectives.value),...(levelCap.value?{heroLevelCap:Number(levelCap.value)}:{}),script:script.value,regions:JSON.parse(regions.value)}):undefined;if(definition)validateMissionLua(definition.script);editor.setMission(definition,JSON.parse(camps.value));status.textContent='Applied. Save the map to keep these changes.';};
    field<HTMLButtonElement>('[data-validate]').onclick=()=>run(()=>{validateMissionLua(script.value);status.textContent='Lua syntax is valid. Play to check entity references and runtime behavior.';});
    field<HTMLButtonElement>('[data-save]').onclick=()=>run(apply);
    field<HTMLButtonElement>('[data-test]').onclick=()=>run(()=>{if(!enabled.checked)throw new Error('Enable Campaign mission to test a script.');apply();onTest();});
    field<HTMLButtonElement>('[data-close]').onclick=()=>this.destroy();
    this.root.addEventListener('keydown',e=>e.stopPropagation());
    this.root.addEventListener('cancel',e=>{e.preventDefault();this.destroy();});host.append(this.root);this.root.showModal();
  }
  destroy(){this.root.close();this.root.remove();}
}
