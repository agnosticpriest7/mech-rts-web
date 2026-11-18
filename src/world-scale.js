/** Runtime metres. Human-scale cues stay fixed while the M06 establishes the heavy-unit datum. */
export const WORLD_SCALE=Object.freeze({mechHeight:12,workerHeight:2,doorHeight:2.2,railHeight:1.1});
export const TACTICAL_CAMERA=Object.freeze({focusX:38,focusZ:110,defaultZoom:94,minZoom:32,maxZoom:230,fov:43});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>x*x*(3-2*x);
const azimuth=Math.atan2(.65,.85);
/** Pass the previous output to reuse its two arrays. Near zoom lowers the viewpoint,
 * not the horizon into the ground, and aims above the floor to retain the 12m silhouette. */
export function sampleTacticalCamera(x=38,z=110,zoom=94,out={position:[0,0,0],lookAt:[0,0,0],fov:43}){
 x=Number.isFinite(x)?x:38;z=Number.isFinite(z)?z:110;
 zoom=clamp(Number.isFinite(zoom)?zoom:94,32,230);
 const near=smooth(clamp((zoom-32)/62,0,1)),far=smooth(clamp((zoom-94)/136,0,1));
 const elevation=(34+9*near+7*far)*Math.PI/180,aimY=5-2.5*near-1.5*far;
 const horizontal=Math.cos(elevation)*zoom;
 out.lookAt[0]=x;out.lookAt[1]=aimY;out.lookAt[2]=z;
 out.position[0]=x+Math.sin(azimuth)*horizontal;out.position[1]=aimY+Math.sin(elevation)*zoom;out.position[2]=z+Math.cos(azimuth)*horizontal;out.fov=43;
 return out;
}
/** Frame-rate independent short camera ease; reduced motion uses immediate input. */
export function cameraDampingAlpha(dt,{reducedMotion=false}={}){
 return reducedMotion?1:1-Math.exp(-Math.max(0,Number.isFinite(dt)?dt:0)/.12);
}
