import {assetUrls} from '../../shared/assets/urls.generated';
/** Terrain recipes refer directly to original canonical asset packages. */
export function terrainTextureUrl(id:string):string {
 const url=assetUrls[`assets/library/${id}/data.bin`];
 if(!url)throw Error(`Missing terrain texture ${id}`);
 return url;
}
