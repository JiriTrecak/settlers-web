/** Published metadata shared by simulation, authoring, wiki and renderer. No URL imports here. */
import raw from '../../../assets/manifest.json';
import type {Asset} from '../../content/schema';
import type {Catalogue} from '../asset/catalog';
import type {RuntimeRecord} from '../../../tooling/asset-studio/shared/schema';
export const publishedAssets=raw.records as RuntimeRecord[];
export const renderAssets:Asset[]=publishedAssets.flatMap(r=>r.render) as Asset[];
export const sceneryCatalogue:Catalogue={v:1,name:'Under the Canopy',assets:publishedAssets.flatMap(r=>r.scenery) as Catalogue['assets']};
