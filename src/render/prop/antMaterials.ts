import { Mesh, MeshStandardMaterial, type Object3D } from 'three';

/** Shared authored Ant surface treatment, used by both stamps and simulation entities.
 * Object-space grain follows each asset and survives instancing without texture uploads.
 */
export function prepareAntMaterial(m:MeshStandardMaterial):void {
 if(!m.name.startsWith('Ant ')||m.userData.antSurface)return;
 m.userData.antSurface=true;
 const wood=/timber|end grain|growth rings/.test(m.name),metal=/iron|steel/.test(m.name),roof=/carapace roof/.test(m.name),stone=/foundation/.test(m.name);
 if(!wood&&!metal&&!roof&&!stone)return;
 const kind=wood?1:metal?2:roof?3:4;
 m.customProgramCacheKey=()=>`ant-surface-1-${kind}`;
 m.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vAntSurface;').replace('#include <begin_vertex>','#include <begin_vertex>\nvAntSurface=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying vec3 vAntSurface;
   float antHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
   float antNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(antHash(i),antHash(i+vec3(1,0,0)),f.x),mix(antHash(i+vec3(0,1,0)),antHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(antHash(i+vec3(0,0,1)),antHash(i+vec3(1,0,1)),f.x),mix(antHash(i+vec3(0,1,1)),antHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
  `).replace('#include <map_fragment>',`#include <map_fragment>
   float antBroad=antNoise(vAntSurface*3.7),antFine=antNoise(vAntSurface*38.);
   float antDetailFade=1.-smoothstep(.025,.09,length(fwidth(vAntSurface)));
   ${kind===1?`float grainWave=sin(vAntSurface.x*75.+antNoise(vAntSurface*vec3(3.,.9,1.7))*11.);
    float grainLine=smoothstep(.68,.97,grainWave)*antDetailFade;
    diffuseColor.rgb*=.84+antBroad*.28+antFine*.09-grainLine*.14;`
   :kind===2?`float wear=smoothstep(.57,.79,antBroad)*(.5+.5*antFine);
    diffuseColor.rgb=mix(diffuseColor.rgb*.80,diffuseColor.rgb*1.8,wear*.6);
    diffuseColor.rgb*=.91+.18*antFine;`
   :kind===3?`float patina=smoothstep(.4,.75,antBroad);
    diffuseColor.rgb*=.76+patina*.42+antFine*.12;
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.14,.91,.76),patina*.3);`
   :`diffuseColor.rgb*=.78+.32*antBroad+.13*antFine;`}
  `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
   roughnessFactor=clamp(roughnessFactor+${kind===2?'.18':'.08'}*(antFine-.5),.18,1.);
  `);
 };
 m.needsUpdate=true;
}
export function prepareAntMaterials(root:Object3D):void {
 root.traverse(o=>{if(o instanceof Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof MeshStandardMaterial)prepareAntMaterial(m);});
}
