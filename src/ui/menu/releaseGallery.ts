import {createElement,ChevronLeft,ChevronRight,X,Expand,type IconNode} from 'lucide';
import {releaseBaseUrl} from '../../shared/release/installed';
import {releaseImage,releaseVersion,type ReleaseEntry,type ReleaseImage} from '../../shared/release/schema';
// Local copies are bundled by Vite, so installed release galleries work offline.
const bundled=import.meta.glob<string>('../../../releases/media/*.webp',{eager:true,query:'?url',import:'default'});
export function releaseImageUrl(version:string,image:ReleaseImage){
 releaseVersion.parse(version);releaseImage.parse(image);
 return bundled[`../../../releases/media/${image.file}`]??`${releaseBaseUrl}/releases/${version}/media/${image.file}`;
}
function control(label:string,node:IconNode){
 const button=document.createElement('button');button.type='button';button.className='release-button';button.setAttribute('aria-label',label);
 button.append(createElement(node,{width:18,height:18,'aria-hidden':'true'}));return button;
}
export function releaseGallery(entry:ReleaseEntry):HTMLElement|null {
 const images=entry.images??[];if(!images.length)return null;
 const gallery=document.createElement('section');gallery.className='release-gallery';gallery.setAttribute('aria-label',`Images for version ${entry.version}`);
 const grid=document.createElement('div');grid.className='release-gallery-grid';gallery.append(grid);
 const viewer=document.createElement('dialog');viewer.className='release-image-viewer';viewer.setAttribute('aria-label',`Release ${entry.version} image gallery`);
 const stage=document.createElement('div');stage.className='release-image-stage';
 const full=document.createElement('img');full.decoding='async';
 const unavailable=document.createElement('p');unavailable.textContent='Image unavailable. You can still read the release notes.';unavailable.hidden=true;
 stage.append(full,unavailable);
 const footer=document.createElement('footer');footer.className='release-image-footer';
 const details=document.createElement('div'),caption=document.createElement('p'),counter=document.createElement('span');counter.setAttribute('aria-live','polite');details.append(caption,counter);
 const controls=document.createElement('div');controls.className='release-image-controls';
 const previous=control('Previous image',ChevronLeft),next=control('Next image',ChevronRight),close=control('Close image gallery',X);
 controls.append(previous,next,close);footer.append(details,controls);viewer.append(stage,footer);gallery.append(viewer);
 let current=0;
 function show(index:number){
  current=(index+images.length)%images.length;const image=images[current];
  full.hidden=false;unavailable.hidden=true;full.alt=image.alt;full.src=releaseImageUrl(entry.version,image);
  caption.textContent=image.caption??image.alt;counter.textContent=`${current+1} / ${images.length}`;
  previous.disabled=next.disabled=images.length===1;
 }
 full.onerror=()=>{full.hidden=true;unavailable.hidden=false;};
 close.onclick=()=>viewer.close();previous.onclick=()=>show(current-1);next.onclick=()=>show(current+1);
 viewer.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show(current+(e.key==='ArrowLeft'?-1:1));}});
 // Only the top modal closes on Escape; the underlying changelog remains open.
 viewer.addEventListener('cancel',e=>e.stopPropagation());
 images.forEach((image,index)=>{
  const figure=document.createElement('figure');
  const thumbnail=control(`View image ${index+1}: ${image.alt}`,Expand);thumbnail.className='release-gallery-thumbnail';
  const img=document.createElement('img');img.alt=image.alt;img.width=image.width;img.height=image.height;img.loading='lazy';img.decoding='async';img.src=releaseImageUrl(entry.version,image);
  const fallback=document.createElement('span');fallback.className='release-gallery-missing';fallback.textContent='Image unavailable';fallback.hidden=true;
  img.onerror=()=>{img.hidden=true;fallback.hidden=false;thumbnail.disabled=true;};
  thumbnail.prepend(img);thumbnail.append(fallback);
  thumbnail.onclick=()=>{show(index);viewer.showModal();close.focus({preventScroll:true});};
  figure.append(thumbnail);
  if(image.caption){const text=document.createElement('figcaption');text.textContent=image.caption;figure.append(text);}
  grid.append(figure);
 });
 return gallery;
}
