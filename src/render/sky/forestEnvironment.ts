import { DataTexture, EquirectangularReflectionMapping, FloatType, PMREMGenerator, RGBAFormat, type WebGLRenderer } from 'three';

/** A small procedural canopy radiance map gives forged metal something to reflect.
 * Baked once per renderer; this is lighting, never a replacement for world geometry.
 */
export function forestEnvironment(renderer:WebGLRenderer) {
 const width=256,height=128,pixels=new Float32Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=x/width,v=y/height,sky=Math.max(0,Math.cos(v*Math.PI));
  const gaps=.55+.45*Math.sin(u*37+Math.sin(v*23))*Math.sin(u*19-v*17);
  const canopy=sky*(.35+.65*gaps);
  const sun=Math.exp(-((u-.72)**2/.002+(v-.25)**2/.005))*3;
  const i=(y*width+x)*4;
  pixels[i]=.045+canopy*.42+sun;pixels[i+1]=.05+canopy*.46+sun*.87;pixels[i+2]=.036+canopy*.50+sun*.65;pixels[i+3]=1;
 }
 const source=new DataTexture(pixels,width,height,RGBAFormat,FloatType);source.mapping=EquirectangularReflectionMapping;source.needsUpdate=true;
 const generator=new PMREMGenerator(renderer),target=generator.fromEquirectangular(source);
 generator.dispose();source.dispose();return target;
}
