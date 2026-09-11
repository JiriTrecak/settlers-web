import {expect,it} from 'vitest';
import {authoredMaps,missionMaps,playableMaps} from '../../src/shared/map/library';
import {createMissionMatch} from '../../src/shared/scenario/match';
it('keeps missions in the editor and campaign, out of skirmish',()=>{
 const entry=authoredMaps().find(m=>m.id==='vanguard-prologue');expect(entry).toBeTruthy();
 expect(missionMaps('vanguard').map(m=>m.id)).toEqual(['vanguard-prologue']);
 expect(playableMaps().some(m=>m.id===entry!.id)).toBe(false);
 expect(createMissionMatch(entry!.id,entry!.map,entry!.revision).slots).toEqual([{player:0,kind:'human',name:'Vanguard'}]);
});
