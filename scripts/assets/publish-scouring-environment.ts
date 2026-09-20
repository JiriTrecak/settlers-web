/** Register the user-authorized reference import without replacing original masters. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {recordSchema} from '../../tooling/asset-studio/shared/schema';
import {records,writeManifest} from '../../tooling/asset-studio/server/manifest';
const imported=JSON.parse(readFileSync('art/references/trees-water-study/import-manifest.json','utf8')) as {meshes:Record<string,{output:string;outputSha256:string;triangles:number;primitives:number}>};
for(const [key,mesh] of Object.entries(imported.meshes)){
 const tree=key.startsWith('plants_fir'),slug=mesh.output.split('/').at(-2)!,id=`asset.models.environment.${mesh.output.split('/')[3]}.${slug}`;
 const path=`art/records/${id}/asset.json`,name=`Reference · ${slug.replace('reference-','').replaceAll('-',' ')}`;
 const record=recordSchema.parse({version:1,id,name,kind:'model',status:'published',revision:1,profile:'model',tags:['reference','scouring','authorized-import'],
  outputs:[{role:'model',path:mesh.output,sha256:mesh.outputSha256,bytes:readFileSync(mesh.output).length,triangles:mesh.triangles,primitives:mesh.primitives}],
  source:{path:mesh.output,sha256:mesh.outputSha256,quality:'runtime-only'},origin:{method:'import'},
  scenery:[{id:slug,name,category:'foliage',type:'prop',file:mesh.output.replace('assets/','')}],
  render:tree?[{id:`asset.resource.${slug}`,file:mesh.output,harvestAnimation:mesh.output,sceneryAsset:slug}]:[],
  validation:{checkedAt:new Date().toISOString(),warnings:['Authorized reference art; cache provenance and geometry audit in art/references/trees-water-study/import-manifest.json.','Tree harvesting uses UTC adapter clips, not recovered source skeletal animation.']}});
 mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(record,null,2)+'\n');
}
await writeManifest(process.cwd(),await records(process.cwd()));
