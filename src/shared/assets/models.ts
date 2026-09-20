import raw from '../../../assets/authoring/models.json';
import type {PublishedModel} from '../authoring/modelCatalogue';

const models=raw as PublishedModel[];
export const sceneryModels=new Map(models.flatMap(m=>m.scenery.map(id=>[id,m] as const)));
const geometryModels=new Map(models.flatMap(m=>m.geometry.map(file=>[file,m] as const)));
export function geometryModel(file:string){return geometryModels.get(file.startsWith('assets/')?file:'assets/'+file);}
