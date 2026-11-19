/** Deterministic M06 orbital insertion. No extra meshes, clip mutation or physics bodies. Pose math uses
 * reusable vectors/quaternions. Coordinates are existing authored rig units.
 * Capture once before mixer evaluation; call apply AFTER mixer while intro runs.
 * Restore the captured playback pose BEFORE the next mixer evaluation, including
 * paused updates: Three caches bindings and may not rewrite unchanged values. */
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
// Extra starters retain separate touchdowns and finish recovery before the 18s handoff.
export function startingMechImpact(id,squad=false){return ({'mech-1':10.5,'mech-2':11.2,...(squad?{'mech-3':11.8,'mech-4':12.4}:{})})[id]??null;}
export function sampleMechLanding(time,{impactTime=10.5}={}){
 const t=(Number.isFinite(time)?time:0)-impactTime;
 // Always falling while visible. Braking eases velocity, never suspends the unit.
 const fall=clamp(-t/3.8),altitude=t<0?48*fall*fall+2*fall:0;
 let crouch,brace;
 if(t<0){crouch=mix(.16,.38,smooth((t+1.3)/1.3));brace=smooth((t+3.8)/1.4);}
 else if(t<.24){crouch=mix(.38,1,smooth(t/.24));brace=1;}
 else if(t<.8){crouch=mix(1,.83,smooth((t-.24)/.56));brace=1;}
 else if(t<1.25){crouch=.83;brace=1;}
 else {crouch=.83*(1-smooth((t-1.25)/2.35));brace=1-smooth((t-1.25)/2.8);}
 const done=t>=4.05;
 return {altitude,visible:t>=-3.8,phase:t<-.75?'descent':t<0?'braking':t<.8?'impact':t<1.25?'settling':done?'ready':'recovery',crouch:done?0:crouch,brace:done?0:brace,thruster:t<0?smooth((t+2.2)/1.4):Math.max(0,1-t/.22),impact:t>=0?Math.exp(-t*6):0,done};
}
export function createMechLandingRig(T,art){
 const names=['CORE_HIP','CORE_TORSO','FRAME_ARM_L','FRAME_ARM_R','SENSOR_CROWN',...['L','R'].flatMap(s=>[`FRAME_THIGH_${s}`,`FRAME_SHIN_${s}`,`FOOT_MEDIUM_${s}`])];
 const records=names.map(name=>{const node=art.getObjectByName(name);if(!node)throw new Error(`M06 landing requires ${name}`);return {node,p:node.position.clone(),q:node.quaternion.clone(),s:node.scale.clone()};});
 const playback=records.map(r=>({node:r.node,p:r.p.clone(),q:r.q.clone(),s:r.s.clone()}));
 const copyPose=(out)=>{for(const r of out){r.p.copy(r.node.position);r.q.copy(r.node.quaternion);r.s.copy(r.node.scale);}};
 const restorePlaybackPose=()=>{for(const r of playback){r.node.position.copy(r.p);r.node.quaternion.copy(r.q);r.node.scale.copy(r.s);}};
 const byName=new Map(records.map(r=>[r.node.name,r]));
 const hip=byName.get('CORE_HIP'),torso=byName.get('CORE_TORSO');
 const legs=['L','R'].map(side=>{const thigh=byName.get(`FRAME_THIGH_${side}`),shin=byName.get(`FRAME_SHIN_${side}`),foot=byName.get(`FOOT_MEDIUM_${side}`);return {thigh,shin,foot,target:thigh.p.clone().add(shin.p).add(foot.p).add(hip.p),upper:shin.p.length(),lower:foot.p.length(),upperDirection:shin.p.clone().normalize(),lowerDirection:foot.p.clone().normalize()};});
 const a=new T.Vector3(),d=new T.Vector3(),pole=new T.Vector3(),knee=new T.Vector3(),v=new T.Vector3(),z=new T.Vector3(0,0,1),x=new T.Vector3(1,0,0),q=new T.Quaternion(),inverse=new T.Quaternion();
 let applied=false;
 function restore(){for(const r of records){r.node.position.copy(r.p);r.node.quaternion.copy(r.q);r.node.scale.copy(r.s);}applied=false;}
 function apply(time,options={}){
  const state=sampleMechLanding(time,options);
  if(options.active===false){if(applied)restore();return state;}
  restore();applied=true;
  // Body descends into planted feet. The rig's rest legs are not straight;
  // solving the original segment lengths retains rigid armor and sole contact.
  hip.node.position.y-=2.25*state.crouch;
  for(const leg of legs){
   a.copy(hip.node.position).add(leg.thigh.p);d.copy(leg.target).sub(a);const distance=d.length();d.normalize();
   const along=(leg.upper*leg.upper-leg.lower*leg.lower+distance*distance)/(2*distance);
   const height=Math.sqrt(Math.max(0,leg.upper*leg.upper-along*along));
   // Recover original bend plane at neutral, then bring knees forward under load.
   pole.copy(leg.shin.p).addScaledVector(d,-leg.shin.p.dot(d));
   pole.lerp(z,Math.min(.65,state.crouch*.65));pole.addScaledVector(d,-pole.dot(d)).normalize();
   knee.copy(a).addScaledVector(d,along).addScaledVector(pole,height);
   v.copy(knee).sub(a).normalize();q.setFromUnitVectors(leg.upperDirection,v);leg.thigh.node.quaternion.copy(q);
   inverse.copy(q).invert();v.copy(leg.target).sub(knee).applyQuaternion(inverse).normalize();
   leg.shin.node.quaternion.setFromUnitVectors(leg.lowerDirection,v);
   leg.foot.node.quaternion.copy(leg.thigh.node.quaternion).multiply(leg.shin.node.quaternion).invert();
  }
  // Slight bow absorbs impact; arms counter-brace instead of waving/ragdolling.
  torso.node.quaternion.setFromAxisAngle(x,.14*state.crouch);
  byName.get('SENSOR_CROWN').node.quaternion.setFromAxisAngle(x,-.055*state.crouch);
  for(const side of ['L','R'])byName.get(`FRAME_ARM_${side}`).node.quaternion.setFromAxisAngle(x,-.18*state.brace-.08*state.crouch);
  if(state.done)restore();
  return state;
 }
 return {apply,restore,capturePlaybackPose:()=>copyPose(playback),restorePlaybackPose,boneNames:names};
}
