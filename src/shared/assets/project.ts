/** Exact manifest lookup. No archive fallback or suffix matching. */
import {sceneryCatalogue} from './manifest';
import {assetUrls} from './urls.generated';
export function projectCatalogue(){return sceneryCatalogue;}
export function projectMeshUrl(relative:string):string|undefined {
 const normalized=relative.replace(/^\.\//,'').replaceAll('\\','/');
 return assetUrls[normalized.startsWith('assets/')?normalized:'assets/'+normalized];
}
