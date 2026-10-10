import {assetUrls} from '../../shared/assets/urls.generated';
import {groundTextures} from '../../shared/authoring/groundTextures';
/** Terrain recipes refer directly to original canonical asset packages. */
export function terrainTextureUrl(id:string,channel:'ar'|'nh'|'om'='ar'):string {
 const ground=groundTextures.get(id)?.terrain;
 const ref=ground?.runtime?.[channel==='ar'?'albedoRoughness':channel==='nh'?'normalOpacity':'occlusionMetalness'];
 if(ground&&!ref)throw Error(`Ground texture ${id} has no compiled ${channel} channel`);
 const url=assetUrls[`assets/library/${id}/${ref?ref.role:'data'}${ref&&ref.index!==1?'_'+ref.index:''}.bin`];
 if(!url)throw Error(`Missing terrain texture ${id}`);
 return url;
}
