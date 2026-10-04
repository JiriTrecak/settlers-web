/** Common image boundary for embedded and external agents; never resolves URLs or paths. */
export function splitEditorImage(output:unknown){
 if(!output||typeof output!=='object'||!('image' in output)||typeof output.image!=='string')return;
 const {image,...metadata}=output;
 const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
 if(!match||image.length>8_000_000)throw Error('Invalid editor image. Capture the canvas again.');
 return {image,metadata,mimeType:match[1],data:match[2]};
}
