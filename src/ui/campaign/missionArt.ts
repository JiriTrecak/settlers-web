import {projectMeshUrl} from '../../shared/assets/project';
import forest from '../../../assets/library/asset.interface.main-menu.forest-aftermath/image.webp';
/** Missions reference published canonical interface assets, never remote URLs. */
export function missionArt(id?:string):string|undefined {
 return id?projectMeshUrl(`assets/library/${id}/image.webp`):undefined;
}
export const campaignArtFallback=forest;
