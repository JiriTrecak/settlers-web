import {records,writeManifest} from '../../tooling/asset-studio/server/manifest';
const root=process.cwd();const manifest=await writeManifest(root,await records(root));
console.log(`Validated ${manifest.records.length} published asset records.`);
