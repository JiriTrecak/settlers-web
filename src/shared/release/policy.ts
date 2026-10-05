import {compareVersions} from './schema.ts';

/** Pre-1.0 minor versions are product milestones, not routine feature batches. */
export function assertReleaseBump(current:string,next:string,milestone=false){
 if(compareVersions(next,current)<=0)throw Error('Release version must increase');
 const [major,minor,patch]=current.split('.').map(Number);
 const [nextMajor,nextMinor,nextPatch]=next.split('.').map(Number);
 if(nextMajor===major&&nextMinor===minor&&nextPatch===patch+1)return;
 const nextMilestone=(nextMajor===major&&nextMinor===minor+1&&nextPatch===0)||(nextMajor===major+1&&nextMinor===0&&nextPatch===0);
 if(!nextMilestone)throw Error(`Use ${major}.${minor}.${patch+1} for routine work, or the next major milestone`);
 if(!milestone)throw Error('Minor/major releases require --milestone and an agreed major upgrade. Use a patch release for routine changes.');
}
