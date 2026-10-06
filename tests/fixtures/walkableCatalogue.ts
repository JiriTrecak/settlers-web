/** A fixed test arch isolates layered simulation behavior from art-package dimensions.
 * Its underside must clear the baseline infantry body (3.4 world units). */
import {vi} from 'vitest';
vi.mock('../../src/shared/assets/manifest',async original=>{
 const actual=await original<typeof import('../../src/shared/assets/manifest')>();
 return {...actual,sceneryCatalogue:{...actual.sceneryCatalogue,assets:actual.sceneryCatalogue.assets.map(a=>a.id==='leafbound-twig-bridge'?{...a,deck:{width:6,depth:24,height:0,arch:5,thickness:.8,level:1,connections:{start:0,end:0}}}:a)}};
});
