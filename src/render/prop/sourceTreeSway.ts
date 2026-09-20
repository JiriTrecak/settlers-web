/** Plants.fxs trunk branch. Positions are in translated world coordinates;
 * phase uses original source X/Z. Leaf noise and dynamic gusts are separate. */
export const sourceTreeSwayGLSL=`
vec3 sourceTreeSway(vec3 p,vec3 origin,float localY,float height,float scale,float obscurance,float time,vec2 sourceOffset){
 float bendScale=clamp((height*scale-4.)/10.,0.,1.);
 vec2 sourceOrigin=origin.xz-sourceOffset;
 float phase=time+sourceOrigin.x*.16+sourceOrigin.y*.24;
 float harmonic=cos(phase*.4)*cos(phase*.4*1.3);
 float t=phase*.5;
 float noise=harmonic*cos(t*1.7)+.25*sin(t*4.7);
 float bend=pow(clamp(localY/height,0.,1.),2.);
 vec3 offset=vec3(noise,0.,harmonic)*(.5*bendScale)*bend*clamp(1.-obscurance,0.,1.);
 float radius=length(p-origin),stretchedLength=length(p+offset-origin);
 return stretchedLength>0.?origin+(p+offset-origin)*(radius/stretchedLength):p;
}
`;
