import path from 'node:path';
import {planMigration,applyMigration} from '../../tooling/asset-studio/server/authoring/migrate';
import {saveJson} from '../../tooling/asset-studio/server/storage';
const root=process.cwd(),plan=await planMigration(root);
await saveJson(path.join(root,'art/references/authoring-migration-audit.json'),plan);
console.log(JSON.stringify({assets:plan.assets.length,files:plan.copies.length,bytes:plan.copies.reduce((n,c)=>n+c.bytes,0),excluded:plan.excluded.length,warnings:plan.warnings},null,2));
if(process.argv.includes('--apply')){await applyMigration(root,plan);console.log('Canonical authoring folders written and hashes verified; runtime cutover is a separate validated publication.');}
