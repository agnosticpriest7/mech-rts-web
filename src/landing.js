import { createSupplyModules, sampleSupplyLanding } from './supply-landing.js';
import { sampleMechLanding } from './mech-landing.js';
import { sampleTacticalCamera } from './world-scale.js';
/** Presentation only. All motion samples authoritative intro elapsed time. */
export const INTRO_DURATION=18;
export const HQ_IMPACT=4+11/6;
export const LANDING_IMPACTS=Object.freeze([HQ_IMPACT,6.3,6.7,10.5,11.2]);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const mix=(a,b,t)=>a+(b-a)*t;
const timeValue=t=>Number.isFinite(t)?clamp(t,0,INTRO_DURATION):0;
const tacticalDefault=sampleTacticalCamera();
export const GAMEPLAY_CAMERA=Object.freeze({position:Object.freeze(tacticalDefault.position),lookAt:Object.freeze(tacticalDefault.lookAt),fov:tacticalDefault.fov});
// Sweep around the outside of the HQ, then face the mech landing zone from its north side.
const shots=[
 {t:0,p:[65,112,171],l:[30,100,120]},
 {t:3.9,p:[66,33,169],l:[32,11,122]},
 {t:5.8,p:[65,20,170],l:[32,5,122]},
 {t:7.4,p:[68,20,166],l:[33,4,124]},
 {t:8.6,p:[77,24,137],l:[33,7,120]},
 {t:9.6,p:[67,28,91],l:[30,14,111]},
 {t:10.5,p:[59,19,78],l:[31,6,111]},
 {t:11.3,p:[56,17,77],l:[30,6,111]},
 {t:13.1,p:[55,20,77],l:[30,6,112]},
 {t:14.6,p:[65,38,91],l:[32,5,113]},
 {t:16.3,p:[79,57,144],l:[35,2,116]},
 {t:18,p:GAMEPLAY_CAMERA.position,l:GAMEPLAY_CAMERA.lookAt},
];
export function sampleLanding(time,{reducedMotion=false}={}){
 const t=timeValue(time);let i=0;while(i<shots.length-2&&t>shots[i+1].t)i++;
 const a=shots[i],b=shots[i+1],u=smooth((t-a.t)/(b.t-a.t));
 const position=a.p.map((v,j)=>mix(v,b.p[j],u)),lookAt=a.l.map((v,j)=>mix(v,b.l[j],u));
 let shakeAmplitude=0;
 if(reducedMotion){const blend=smooth((t-13)/5);for(let j=0;j<3;j++){position[j]=mix([130,165,270][j],GAMEPLAY_CAMERA.position[j],blend);lookAt[j]=mix([32,52,122][j],GAMEPLAY_CAMERA.lookAt[j],blend);}}
 else for(let k=0;k<LANDING_IMPACTS.length;k++){const age=t-LANDING_IMPACTS[k];if(age>=0&&age<.8)shakeAmplitude+=(k===0?.2:k>2?.28:.1)*Math.sin(Math.PI*age/.8)*Math.exp(-age*3);}
 position[0]+=Math.sin(t*49)*shakeAmplitude;position[1]+=Math.sin(t*63)*shakeAmplitude*.55;
 return {time:t,camera:{position,lookAt,fov:43},hqOffsetY:90*(1-smooth(t/4)),hqClipTime:clamp(t-4,0,11.958),hqProxyOffsetY:sampleHqDescent(Math.max(0,t-4)),moduleAltitudes:[0,1].map(index=>sampleSupplyLanding(t,index).altitude),crewVisible:t>=15.958,shakeAmplitude,phase:t<4?'approach':t<6.8?'touchdown':t<9?'deployment':t<11.5?'mech-drop':t<15.958?'ready':t<18?'handoff':'complete',caption:t<4?'OUTPOST // FORMATION DESCENT':t<6.8?'RETRO BURN // TOUCHDOWN':t<9?'SUPPLY & RELAY // DEPLOYING':t<11.5?'M06 INSERTION // BRACE FOR IMPACT':t<15.958?'M06 ONLINE // HYDRAULICS LOCKED':t<18?'CREW ONLINE // ESTABLISH THE FRONTIER':''};
}
// Exact first 3 seconds of the existing HQ root track, 24 Hz; proxy stays aligned on late loads.
const hqDescentY=[6,5.99585,5.983335,5.962365,5.932843,5.894675,5.847769,5.792029,5.727363,5.653676,5.570874,5.478864,5.377551,5.266841,5.146641,5.016858,4.877395,4.728161,4.569061,4.4,4.221128,4.033563,3.838665,3.637796,3.432315,3.223584,3.012964,2.801814,2.591495,2.383369,2.178795,1.979136,1.785751,1.6,1.422948,1.254473,1.094153,0.941569,0.796302,0.657931,0.526037,0.4002,0.28,0.166306,0.065144,-0.01617,-0.070323,-0.09,-0.082266,-0.061875,-0.033047,0,0.033047,0.061875,0.082266,0.09,0.086133,0.075938,0.061523,0.045,0.028477,0.014062,0.003867,0,0,0,0,0,0,0,0,0,0];
export function sampleHqDescent(t){const f=Math.max(0,Math.min(72,t*24)),i=Math.floor(f);return mix(hqDescentY[i],hqDescentY[Math.min(72,i+1)],f-i);}
const sites=[[30,120],[18,136],[48,121],[36,111],[24,111]];
const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
/** Contact-triggered analytic dust. The last plume expires before crew handoff. */
export function sampleLandingDust(time,index,count=120){
 const t=timeValue(time),event=index%5,age=t-LANDING_IMPACTS[event],seed=index+1;
 const lifetime=2.6+hash(seed*3)*.7,live=age>0&&age<lifetime;
 const angle=hash(seed)*Math.PI*2,progress=clamp(age/lifetime),radius=(event>2?.7:1.8)+(event>2?4.5:7.5)*(1-Math.exp(-Math.max(0,age)*1.1));
 return {visible:live&&index>=0&&index<count,x:sites[event][0]+Math.cos(angle)*radius,y:.15+Math.sin(progress*Math.PI)*(.45+hash(seed*7)*.5),z:sites[event][1]+Math.sin(angle)*radius,size:live?(.55+hash(seed*5)*.8)*(1+progress*1.5):0,alpha:live?Math.sin(Math.PI*Math.pow(progress,.45))*.43:0,event};
}
export function createLandingScene(THREE,scene,{lowGraphics=true}={}){
 const root=new THREE.Group();root.name='FRONTIER landing presentation';scene.add(root);
 const modules=createSupplyModules(THREE,root);
 const geometries=[],materials=[];let disposed=false,lastTime=0,dustVisible=0,activeState=false,settledState=false;
 const geo=g=>(geometries.push(g),g),mat=m=>(materials.push(m),m),dummy=new THREE.Object3D();
 const count=lowGraphics?120:180;
 const dustGeometry=geo(new THREE.SphereGeometry(1,7,5));
 const alphas=new Float32Array(count);dustGeometry.setAttribute('dustAlpha',new THREE.InstancedBufferAttribute(alphas,1));
 const dustMaterial=mat(new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{dustColor:{value:new THREE.Color(0xa69679)}},vertexShader:'attribute float dustAlpha; varying float vAlpha; varying float vShade; void main(){vAlpha=dustAlpha;vShade=.72+.28*normal.y;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'uniform vec3 dustColor; varying float vAlpha; varying float vShade; void main(){gl_FragColor=vec4(dustColor*vShade,vAlpha);}',}));
 const dust=new THREE.InstancedMesh(dustGeometry,dustMaterial,count);dust.frustumCulled=false;dust.name='Landing dust';root.add(dust);
 const ringGeometry=geo(new THREE.RingGeometry(.87,1,40));
 const ringMaterial=mat(new THREE.MeshBasicMaterial({color:0xc1aa7d,transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide}));
 const rings=new THREE.InstancedMesh(ringGeometry,ringMaterial,5);rings.frustumCulled=false;root.add(rings);
 const flameGeometry=geo(new THREE.ConeGeometry(.5,2.5,7));
 const flameMaterial=mat(new THREE.MeshBasicMaterial({color:0x8eeaff,transparent:true,opacity:.65,depthWrite:false}));
 const flames=new THREE.InstancedMesh(flameGeometry,flameMaterial,12);flames.frustumCulled=false;root.add(flames);
 function matrix(mesh,index,x,y,z,sx,sy,sz,rx=0,rz=0){dummy.position.set(x,y,z);dummy.rotation.set(rx,0,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);}
 function update(time,{active=false,settled=false,reducedMotion=false}={}){
  if(disposed)return;lastTime=timeValue(time);activeState=!!active;settledState=!!settled;const t=settled?18:lastTime,s=sampleLanding(t,{reducedMotion});root.visible=active||settled;
  modules.update(t,{active,settled,reducedMotion});dustVisible=0;dust.visible=active&&!settled;rings.visible=dust.visible;flames.visible=dust.visible;
  for(let i=0;i<count;i++){const p=sampleLandingDust(t,i,count),visible=active&&!settled&&p.visible,scale=visible?p.size:0;matrix(dust,i,p.x,p.y,p.z,scale,scale*.42,scale);alphas[i]=visible?p.alpha:0;if(visible)dustVisible++;}
  dust.instanceMatrix.needsUpdate=true;dustGeometry.attributes.dustAlpha.needsUpdate=true;
  for(let i=0;i<5;i++){const age=t-LANDING_IMPACTS[i],r=active&&!settled&&age>0&&age<1.3?(i>2?7:12)*smooth(age/1.3):0;matrix(rings,i,sites[i][0],.04,sites[i][1],r,r,r,-Math.PI/2);}
  rings.instanceMatrix.needsUpdate=true;
  const hqY=s.hqOffsetY+s.hqProxyOffsetY;
  for(let i=0;i<4;i++){const scale=active&&!settled&&t>1.4&&t<HQ_IMPACT&&hqY>.1?Math.min(1,hqY/2):0;matrix(flames,i,30+(i%2?4:-4),hqY-.6,120+(i<2?-4:4),scale,scale,scale,0,Math.PI);}
  for(let i=0;i<4;i++){const m=Math.floor(i/2),alt=s.moduleAltitudes[m],scale=active&&!settled&&alt>0&&t>1.4?Math.min(1,alt/2):0;matrix(flames,4+i,sites[m+1][0]+(i%2?1.2:-1.2),alt-.45,sites[m+1][1],scale,scale,scale,0,Math.PI);}
  for(let i=0;i<4;i++){const m=Math.floor(i/2),p=sampleMechLanding(t,{impactTime:LANDING_IMPACTS[m+3]}),scale=active&&!settled&&p.visible?(p.thruster||0):0;matrix(flames,8+i,sites[m+3][0]+(i%2?1.35:-1.35),p.altitude+5.4,sites[m+3][1]-1.8,scale*1.05,scale*2.1,scale*1.05,0,Math.PI);}
  flames.instanceMatrix.needsUpdate=true;
 }
 update(0);
 return {update,dispose(){if(disposed)return;disposed=true;modules.dispose();scene.remove(root);for(const mesh of [dust,rings,flames])mesh.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();},diagnostics(){return {disposed,time:lastTime,active:activeState,settled:settledState,dustCapacity:count,dustVisible,rootVisible:root.visible,modules:modules.diagnostics(),drawCallsUpperBound:(modules.diagnostics().drawCallsUpperBound||10)+3};}};
}
