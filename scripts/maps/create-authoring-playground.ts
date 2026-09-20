import {writeFile,mkdir} from 'node:fs/promises';
import {emptyUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {emptyLandscape} from '../../src/shared/landscape/curve';
const map={...emptyUtcMap(),name:'Authoring Playground',description:'Blank Scouring-style canvas. Add forest, meadow and river layers; gameplay objects use diagnostic art until replacements are authored.',landscape:emptyLandscape(),authoring:{version:1 as const,objects:[],layers:[]}};
await mkdir('assets/maps/showcase',{recursive:true});
await writeFile('assets/maps/showcase/authoring-playground.utcmap',stringifyUtcMap(map));
