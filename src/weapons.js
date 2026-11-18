import { RULES } from './simulation.js?v=field-playtest-1';
// Fictional cinematic rotor speed; steady through the whole firing burst.
export const GATLING_ROTOR_SPEED=100;
export const rotorBlurOpacity=speed=>Math.max(0,Math.min(.24,(speed-28)/72*.24));
/** Cosmetic presentation of authoritative rounds; never creates damage or chooses a barrel. */
export function authoritativeSide(event){
 return event?.type==='shot'&&typeof event.sourceId==='string'&&Number.isSafeInteger(event.shotSerial)&&event.shotSerial>0&&['L','R','LR'].includes(event.muzzleSide)?event.muzzleSide:null;
}
export class GatlingShots {
 constructor(){this.clear();}
 clear(){this.lastSerial=new Map();this.history=[];}
 accept(event,renderTime){
  const side=authoritativeSide(event);if(!Number.isFinite(renderTime)||!Number.isFinite(event?.time)||event.time>renderTime+1e-7)return null;if(!side||event.shotSerial<=(this.lastSerial.get(event.sourceId)||0))return null;
  this.lastSerial.set(event.sourceId,event.shotSerial);
  // A reconnect or a stalled tab must not replay an old burst of flashes/recoil.
  const age=Math.max(0,renderTime-event.time);if(!Number.isFinite(age)||age>.35)return null;
  const shot={sourceId:event.sourceId,serial:event.shotSerial,side,sides:side==='LR'?['L','R']:[side],time:event.time,age};this.history.push(shot);if(this.history.length>32)this.history.shift();return shot;
 }
}
export class GatlingRotors {
 constructor(){this.engaged=false;this.startedAt=0;this.sides={L:{phase:0,speed:0,holdUntil:-Infinity},R:{phase:0,speed:0,holdUntil:-Infinity}};}
 start(time,spin=0){if(this.engaged)return;this.engaged=true;this.startedAt=time-Math.max(0,Math.min(1,spin))*RULES.gatlingSpoolSeconds;}
 stop(){this.engaged=false;for(const rotor of Object.values(this.sides))rotor.holdUntil=-Infinity;}
 shot(side,time){for(const name of side==='LR'?['L','R']:[side])if(this.sides[name])this.sides[name].holdUntil=Math.max(this.sides[name].holdUntil,time+.3);}
 update(dt,time){
  for(const rotor of Object.values(this.sides)){
   const target=this.engaged?GATLING_ROTOR_SPEED*Math.max(0,Math.min(1,(time-this.startedAt)/RULES.gatlingSpoolSeconds)):time<=rotor.holdUntil?GATLING_ROTOR_SPEED:0,old=rotor.speed;
   if(dt>0)rotor.speed=this.engaged?target:old+(target-old)*(1-Math.exp(-Math.max(0,dt)*(target?18:6)));
   rotor.phase=(rotor.phase+(old+rotor.speed)*.5*Math.max(0,dt))%(Math.PI*2);
   if(rotor.speed<.0001)rotor.speed=0;
  }
  return this.sides;
 }
}
