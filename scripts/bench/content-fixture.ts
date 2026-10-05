import {readFileSync,writeFileSync} from 'node:fs';
import {builtinSource,content} from '../../src/content/builtin';
import {ContentRegistry,type ContentSource} from '../../src/content/registry';

/** Optional immutable benchmark input, outside runtime timing. Keeps shared
 * workspace edits from invalidating a long-running experiment's checkpoints. */
export function benchmarkContent(input:string,output:string){
 const fixture=input?JSON.parse(readFileSync(input,'utf8')) as {source:ContentSource;fingerprint:string}
  :{source:builtinSource,fingerprint:content.fingerprint};
 const registry=input?new ContentRegistry(fixture.source):content;
 if(registry.fingerprint!==fixture.fingerprint)throw Error('Benchmark content fixture fingerprint mismatch');
 if(output)writeFileSync(output,JSON.stringify(fixture));
 return {fixture,registry};
}
