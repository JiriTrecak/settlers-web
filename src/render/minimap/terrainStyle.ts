/** Cartographic palette shared by the cached terrain raster. No simulation or visibility logic. */
export function terrainPixel(base:readonly number[],height:number,water:number,slopeX:number,slopeZ:number,x:number,y:number):[number,number,number]{
  const hash=((Math.imul(x+19,374761393)^Math.imul(y+73,668265263))>>>0);
  const grain=((hash^(hash>>>13))>>>0)%101/100-.5;
  if(height<water){
    const depth=Math.min(1,(water-height)/5);
    const shallow=[100,139,131],deep=[36,69,83];
    const ripple=Math.sin(x*.58+y*.37)*Math.cos(y*.23-x*.11)*2;
    return shallow.map((v,i)=>Math.round(v+(deep[i]-v)*depth+grain*5+ripple)) as [number,number,number];
  }
  const shade=Math.min(1.24,Math.max(.58,1+(height-water)*.008-(slopeX+slopeZ)*.09))+grain*.065;
  const shore=Math.max(0,1-(height-water)/.75)*.2;
  return base.map((v,i)=>Math.round((v*(1-shore)+[153,146,107][i]*shore)*shade)) as [number,number,number];
}
export function sceneryKind(asset:string):'tree'|'rock'|null{
  if(/tree|pine|conifer/i.test(asset))return 'tree';
  if(/rock|boulder|cliff/i.test(asset))return 'rock';
  return null;
}
