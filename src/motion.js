/** Presentation only. No prediction, movement orders, combat or resources live here. */
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const angleDelta=(from,to)=>((to-from+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
export function dampAngle(from,to,dt,{response=7,maxSpeed=2.6}={}){
 const delta=angleDelta(from,to),step=delta*(1-Math.exp(-response*Math.max(0,dt)));
 return from+clamp(step,-maxSpeed*dt,maxSpeed*dt);
}
// A small render delay absorbs normal packet spacing. Never extrapolate past server truth.
export class SnapshotTimeline {
 constructor(interval=.05){this.delay=clamp(interval*1.2,.075,.4);this.reset(0,0);}
 reset(time,now){this.latest=time;this.time=Math.max(0,time-this.delay);this.receivedAt=now;}
 receive(time,now){if(time<this.latest){this.reset(time,now);return;}if(time>this.latest){this.latest=time;this.receivedAt=now;}}
 advance(dt,now,paused=false){
  if(paused)return this.time;
  const desired=Math.max(0,this.latest+clamp(now-this.receivedAt,0,.5)-this.delay);
  const rate=clamp(1+(desired-this.time)*2,.85,1.15);
  this.time=Math.min(this.latest,this.time+Math.max(0,dt)*rate);
  return this.time;
 }
}
export class SnapshotTrack {
 constructor(){this.samples=[];}
 push(entity,time){
  const sample={time,x:entity.x,z:entity.z,angle:entity.angle||0,lastShotAt:entity.lastShotAt};
  const last=this.samples.at(-1);
  if(last&&time<last.time)this.samples.length=0;
  if(last&&time===last.time)this.samples[this.samples.length-1]=sample;else this.samples.push(sample);
  if(this.samples.length>32)this.samples.splice(0,this.samples.length-32);
 }
 sample(time){
  const list=this.samples;if(!list.length)return null;
  if(time<=list[0].time)return {...list[0],speed:0};
  for(let i=1;i<list.length;i++)if(time<=list[i].time){
   const a=list[i-1],b=list[i],span=b.time-a.time,t=clamp((time-a.time)/span,0,1);
   return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,angle:a.angle+angleDelta(a.angle,b.angle)*t,speed:Math.hypot(b.x-a.x,b.z-a.z)/span,lastShotAt:b.lastShotAt<=time?b.lastShotAt:a.lastShotAt};
  }
  return {...list.at(-1),speed:0};
 }
}
export class LocomotionBlend {
 constructor(nominalSpeed=2.444){this.nominalSpeed=nominalSpeed;this.speed=0;this.weight=0;this.rate=1;}
 update(speed,dt){
  const a=1-Math.exp(-Math.max(0,dt)*9);
  this.speed+=(clamp(speed,0,12)-this.speed)*a;
  const target=clamp(this.speed/.7,0,1);
  this.weight+=(target-this.weight)*(1-Math.exp(-Math.max(0,dt)*10));
  this.rate=clamp(this.speed/this.nominalSpeed,.12,3.5);
  return {walkWeight:this.weight,idleWeight:1-this.weight,timeScale:this.rate,speed:this.speed};
 }
}
