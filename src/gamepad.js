// Standard Gamepad mapping only. All discrete actions are rising-edge triggered.
export const BUTTONS = {a:0,b:1,x:2,y:3,lb:4,rb:5,lt:6,rt:7,view:8,menu:9,ls:10,rs:11,up:12,down:13,left:14,right:15};
export function deadzone(value, threshold=.2) {
 const n=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
 return Math.abs(n)<=threshold?0:Math.sign(n)*(Math.abs(n)-threshold)/(1-threshold);
}
export function createGamepadReader() {
 let previous=new Set(),lastIndex=null;
 return function read(pads=[]) {
  const pad=Array.from(pads).find(p=>p?.connected!==false&&p?.mapping==='standard');
  if(!pad){previous.clear();lastIndex=null;return null;}
  if(lastIndex!==pad.index)previous.clear();lastIndex=pad.index;
  const held=new Set(),pressed=new Set();
  for(const [name,index] of Object.entries(BUTTONS))if(pad.buttons[index]?.pressed||pad.buttons[index]?.value>.5){held.add(name);if(!previous.has(name))pressed.add(name);}
  previous=held;
  return {index:pad.index,held,pressed,lx:deadzone(pad.axes[0]),ly:deadzone(pad.axes[1]),rx:deadzone(pad.axes[2]),ry:deadzone(pad.axes[3]),zoom:(pad.buttons[6]?.value||0)-(pad.buttons[7]?.value||0)};
 };
}
export function wrapIndex(index,delta,length){return length?((index+delta)%length+length)%length:0;}
export function controllerProfile(userAgent=''){return /Xbox/i.test(userAgent)?{console:true,mech:'m06-lod1.glb',pod:'anchor-lod1.glb'}:{console:false,mech:'m06-runtime.glb',pod:'anchor-runtime.glb'};}

// Pure classification: no device identifiers, axes or button values leave the page.
export function diagnoseController({supported=true,secure=true,policyAllowed=null,errorName=null,pads=[]}={}) {
 if(!secure)return {code:'insecure',message:'Controller API needs a secure page. Open the HTTPS game link directly.'};
 if(!supported)return {code:'unsupported',message:'This browser does not expose the Gamepad API. Browser-cursor controls are available.'};
 if(policyAllowed===false)return {code:'policy-blocked',message:'This page’s Permissions Policy blocks gamepad access. Open the game directly; the host may need to enable it.'};
 if(errorName==='SecurityError')return {code:'security-error',message:'The browser denied gamepad access (SecurityError). Try opening the game directly; this page cannot change browser permissions.'};
 if(errorName)return {code:'read-error',message:'The browser could not read the controller. Check controller again, or use browser-cursor controls.'};
 const connected=Array.from(pads).filter(p=>p&&p.connected!==false);
 if(connected.some(p=>p.mapping==='standard'))return {code:'ready',message:'Standard controller detected. Press a button to use it. Help and Pause are also available on screen.'};
 if(connected.length)return {code:'nonstandard',message:'A controller is exposed without a standard mapping. Its buttons are not guessed; use browser-cursor controls.'};
 return {code:'waiting',message:'No controller exposed to this page yet. Focus the game and press a button; Edge may still be in browser-cursor mode.'};
}

export function gamepadPolicyAllowed(policy){
 try{
  if(!policy?.allowsFeature)return null;
  if(typeof policy.features==='function'&&!Array.from(policy.features()).includes('gamepad'))return null;
  return policy.allowsFeature('gamepad');
 }catch{return null;}
}
export function setInputMode(state,mode){
 if(mode==='cursor-order')return {rawInputEnabled:false,cursorOrderMode:true};
 if(mode==='gamepad-on')return {rawInputEnabled:true,cursorOrderMode:false};
 if(mode==='gamepad-off')return {...state,rawInputEnabled:false};
 if(mode==='cursor-select')return {...state,cursorOrderMode:false};
 return {...state};
}
