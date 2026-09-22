/** Check repository-relative links in maintained documentation, without fetching external URLs. */
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
async function markdown(dir:string):Promise<string[]>{
 const entries=await readdir(dir,{withFileTypes:true});
 return (await Promise.all(entries.map(e=>e.isDirectory()?markdown(path.join(dir,e.name)):e.name.endsWith('.md')?[path.join(dir,e.name)]:[]))).flat();
}
const files=['README.md','art/README.md','assets/index.md',...await markdown('docs'),...await markdown('art/sources')];
const errors:string[]=[];let checked=0;
for(const file of files){
 const text=(await readFile(file,'utf8')).replace(/```[\s\S]*?```/g,'');
 for(const match of text.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g)){
  const href=match[1]!.replace(/^<|>$/g,'').split('#')[0]!.split('?')[0]!;
  // Root-relative wiki routes are validated by the production wiki build.
  if(!href||/^(?:[a-z]+:|\/)/i.test(href))continue;
  checked++;
  const target=path.resolve(root,path.dirname(file),decodeURIComponent(href));
  try{await stat(target);}catch{errors.push(`${file}: ${href}`);}
 }
}
if(errors.length){console.error('Broken documentation links:\n'+errors.join('\n'));process.exitCode=1;}
else console.log(`Validated ${checked} repository links across ${files.length} Markdown files.`);
