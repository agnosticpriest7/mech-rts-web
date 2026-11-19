import {GAME_API_URL} from './runtime-config.js';
/** Hosted transport. All game state is advanced/validated by the Worker, never the browser. */
export class HttpRoomSocket extends EventTarget {
 static snapshotInterval=.25;
 static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
 constructor(){super();this.readyState=0;this.code=null;this.token=null;this.chain=Promise.resolve();this.polling=false;this.closed=false;this.lastVersion=-1;this.failures=0;queueMicrotask(()=>{if(this.closed)return;this.readyState=1;this.dispatchEvent(new Event('open'));});this.timer=setInterval(()=>this.poll(),250);}
 emit(data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}
 send(raw){let message;try{message=JSON.parse(raw);}catch{return;}this.chain=this.chain.then(()=>this.request(message)).catch(()=>{});}
 async request(message){if(this.closed)return;const body={...message};if(message.type==='create'||message.type==='restart'){body.playtestVersion=1;body.squadVersion=1;}if(this.code){body.code=this.code;body.token=this.token;}if(message.type!=='poll')body.requestId=crypto.randomUUID();
  try{const response=await fetch(GAME_API_URL,{method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});const type=response.headers.get('content-type')||'';if(!type.includes('application/json'))throw new Error('The game service returned an unexpected response. Please retry.');const data=await response.json();if(this.closed)return;if(data.type==='error'){this.emit(data);return;}this.failures=0;
   const roomKey=JSON.stringify(data.room);if(data.type==='welcome'){this.code=data.room.code;this.token=data.token;this.emit(data);this.lastRoom=roomKey;}else if(roomKey!==this.lastRoom){this.lastRoom=roomKey;this.emit({type:'room',room:data.room});}
   if(data.state)this.emit({type:'state',state:data.state});
  }catch(error){this.failures++;if(this.failures===1||this.failures===12)this.emit({type:'error',message:'Connection interrupted. The host pauses after a short timeout; retrying…'});if(this.failures>=24){this.closed=true;clearInterval(this.timer);this.readyState=3;this.dispatchEvent(new Event('close'));}}
 }
 poll(){if(!this.code||this.closed||this.polling)return;this.polling=true;this.chain=this.chain.then(()=>this.request({type:'poll'})).catch(()=>{}).finally(()=>this.polling=false);}
 close(){if(this.closed)return;this.closed=true;clearInterval(this.timer);this.readyState=3;if(this.code&&this.token)fetch(GAME_API_URL,{method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'leave',code:this.code,token:this.token,requestId:crypto.randomUUID()}),keepalive:true}).catch(()=>{});queueMicrotask(()=>this.dispatchEvent(new Event('close')));}
}
