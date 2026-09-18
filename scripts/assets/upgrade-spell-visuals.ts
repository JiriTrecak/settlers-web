/** Intentional one-time visual publication; does not change mechanics or ranks. */
import {readFileSync,writeFileSync} from 'node:fs';
import {EFFECT_PRESETS} from '../../src/content/effectLayers';
import {renderAssets} from '../../src/shared/assets/manifest';
import {ContentRegistry} from '../../src/content/registry';
const path='content/game.json',source=JSON.parse(readFileSync(path,'utf8'));
for(const [id,preset] of Object.entries({'effect.faultline':'Heavy impact','effect.crownfall':'Earthquake','effect.rally':'Guardian aura','effect.carapace':'Guardian aura'})){
 const visual=source.rules.spellVisuals[id];visual.layers=structuredClone(EFFECT_PRESETS[preset]);
 // Short, legible gameplay effects; the extended storm/aura are editor examples.
 if(id==='effect.rally')for(const l of visual.layers){l.color='#e5bd61';l.endColor='#fff2b3';}
 if(id==='effect.carapace')visual.layers=visual.layers.filter((l:{kind:string})=>l.kind!=='disc');
 visual.durationTicks=Math.max(...visual.layers.filter((l:{phase:string})=>l.phase==='impact').map((l:{delay:number;duration:number})=>l.delay+l.duration));
}
new ContentRegistry({...source,assets:renderAssets});writeFileSync(path,JSON.stringify(source,null,2)+'\n');
const mapPath='assets/maps/campaign/vanguard-heartwood-vault.utcmap',map=JSON.parse(readFileSync(mapPath,'utf8'));map.mission.script=readFileSync('scripts/missions/heartwood-vault.lua','utf8');writeFileSync(mapPath,JSON.stringify(map,null,2)+'\n');
