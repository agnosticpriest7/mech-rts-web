import { HttpRoomSocket as WebSocket } from './room-transport.js';
import { FRONTIER_MAP } from './frontier-map.js';
import { createBasinTerrain } from './basin-terrain.js';
import { contextualOrder, selectionActions } from './selection-controls.js';

import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

import { INTRO_DURATION, LANDING_IMPACTS, sampleLanding, createLandingScene } from './landing.js';

import { createMechLandingRig, sampleMechLanding } from './mech-landing.js';

import { BUILDINGS, UPGRADES, PRODUCTION_RULES, buildingCost, mechStats } from './economy-rules.js';

import { createAlienRig, ALIEN_ASSETS } from './alien-art.js';

import { createArtilleryRig } from './artillery-art.js';

import { createDropPad } from './drop-pad-art.js';

import { createHiveArt } from './hive-art.js';

import { createMechFactory } from './mech-factory.js';

import { createEconomyBuilding } from './economy-buildings.js';

import { createServiceBay } from './service-bay.js';

import { structureTerrainZones, terrainIntersectsZones } from './terrain-clearance.js';

import { WORLD_SCALE, TACTICAL_CAMERA, sampleTacticalCamera, cameraDampingAlpha } from './world-scale.js';

import { RESOURCE_COLORS, resourceKind, resourceBalance, formatCost, affordable, shortResource, buildingLabel, coverageStatus, displayAmount } from './economy-ui.js';

import { createGame, teamVisible, servicePlacementClear } from './simulation.js';

import { workerClip, objectiveTarget, objectiveHint } from './mission-ui.js';

import { SnapshotTimeline, SnapshotTrack, LocomotionBlend, dampAngle } from './motion.js';

import { GatlingAudio } from './gatling-audio.js';
import { MusicPlayer } from './music-player.js';

import { GatlingShots, GatlingRotors, authoritativeSide, rotorBlurOpacity } from './weapons.js';

import { createGamepadReader, wrapIndex, controllerProfile, diagnoseController, gamepadPolicyAllowed, setInputMode } from './gamepad.js';

const graphicsProfile=controllerProfile(navigator.userAgent);



const $=id=>document.getElementById(id);

const scene=new THREE.Scene();scene.background=new THREE.Color(0x132429);scene.fog=new THREE.FogExp2(0x17292b,.0027);

let renderer;try{renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});}catch(error){const notice=document.createElement('div');notice.className='modal';notice.id='graphics-error';notice.setAttribute('role','alert');notice.innerHTML='<section><div class="eyebrow">3D GRAPHICS UNAVAILABLE</div><h2>This browser could not start the renderer.</h2><p>This demo needs WebGL 2. A restricted preview, memory pressure or disabled graphics acceleration may prevent it from running.</p><p>The mission has not started. Close other browser tabs, open the hosted game directly in Edge, then reload this page.</p></section>';document.body.appendChild(notice);console.warn('FRONTIER renderer unavailable:',error.message);}

if(renderer){

const gl=renderer.getContext(),debugRenderer=gl.getExtension('WEBGL_debug_renderer_info');const rendererName=debugRenderer?gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL):'';let lowGraphics=true;renderer.setPixelRatio(1);renderer.shadowMap.enabled=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;$('viewport').appendChild(renderer.domElement);

const camera=new THREE.PerspectiveCamera(TACTICAL_CAMERA.fov,innerWidth/innerHeight,1,1600);let focus=new THREE.Vector3(TACTICAL_CAMERA.focusX,0,TACTICAL_CAMERA.focusZ),zoom=TACTICAL_CAMERA.defaultZoom;

const cameraFocus=focus.clone();let cameraZoom=zoom;const tacticalPose=sampleTacticalCamera();

const hemi=new THREE.HemisphereLight(0xc5e0e0,0x152128,2.5);scene.add(hemi);const sun=new THREE.DirectionalLight(0xffdda7,3.8);sun.position.set(-40,95,25);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-110,right:110,top:110,bottom:-110,near:1,far:300});sun.shadow.bias=-.0005;scene.add(sun);sun.target.position.set(70,0,80);scene.add(sun.target);

const mat=(color,roughness=.85,metalness=.2,extra={})=>new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});

const materials={dark:mat(0x1c2c30),steel:mat(0x4c6060,.7,.6),armor:mat(0x556252,.8,.45),sand:mat(0xafa483,.85,.1),amber:mat(0xdfa95b,.6,.5),light:mat(0x9bdccd,.3,.2,{emissive:0x68ccb3,emissiveIntensity:2}),red:mat(0x663735,.9,.1),coral:mat(0xce6749,.6,.25,{emissive:0x6a2416,emissiveIntensity:.7}),ore:mat(0x84e2c5,.3,.6,{emissive:0x347c6d,emissiveIntensity:.9})};

// Asset clones and palette materials are shared; generated entity geometry is owned.

const sharedMaterials=new Set(Object.values(materials));

function disposeOwned(root){

 root.userData.alienRig?.dispose();root.userData.artilleryRig?.dispose();root.userData.dropPadArt?.dispose();

 gatlingAudio?.stop(root.userData.entityId);

 root.userData.hiveArt?.dispose();root.userData.foundryArt?.dispose();root.userData.economyArt?.dispose();root.userData.serviceArt?.dispose();

 root.userData.mixer?.stopAllAction();if(root.userData.mixer)root.userData.mixer.uncacheRoot(root.userData.mixer.getRoot());

 const skeletons=new Set();

 root.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton&&!skeletons.has(o.skeleton)){skeletons.add(o.skeleton);o.skeleton.dispose();}if(o.userData.sharedAsset)return;o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m&&!sharedMaterials.has(m))m.dispose();});

}

function mesh(geo,m,pos=[0,0,0],parent=scene){const o=new THREE.Mesh(geo,m);o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}

function box(w,h,d,m,p,parent){return mesh(new THREE.BoxGeometry(w,h,d),m,p,parent);}

function cylinder(r1,r2,h,m,p,parent,segments=8){return mesh(new THREE.CylinderGeometry(r1,r2,h,segments),m,p,parent);}

function ring(radius,color,opacity=.9){const m=new THREE.Mesh(new THREE.RingGeometry(radius-.09,radius,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.y=.12;return m;}

let seed=9046;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};

const groundMaterial=new THREE.ShaderMaterial({uniforms:{color:{value:new THREE.Color(0x45514a)}},vertexShader:`varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 v;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){float n=h(floor(v*800.));float n2=h(floor(v*80.));vec3 a=mix(vec3(.12,.17,.16),vec3(.26,.30,.25),n*.35+n2*.25);float road=1.-smoothstep(.03,.09,abs(v.x+v.y-.95));a=mix(a,vec3(.30,.31,.25),road*.22);vec2 grid=abs(fract(v*16.-.5)-.5)/fwidth(v*16.);float g=1.-min(min(grid.x,grid.y),1.);a+=g*.015;float edge=smoothstep(.0,.025,min(min(v.x,v.y),min(1.-v.x,1.-v.y)));gl_FragColor=vec4(a*mix(.45,1.,edge),1.);}`});

const ground=mesh(new THREE.PlaneGeometry(160,160),groundMaterial,[80,-.03,80]);ground.rotation.x=-Math.PI/2;ground.castShadow=false;

const basePlate=box(182,3,182,mat(0x17282a),[80,-2,80]);basePlate.receiveShadow=true;

const shadowReceiver=mesh(new THREE.PlaneGeometry(160,160),new THREE.ShadowMaterial({opacity:.32,color:0x071316}),[80,.005,80]);shadowReceiver.rotation.x=-Math.PI/2;shadowReceiver.receiveShadow=true;shadowReceiver.castShadow=false;

const grid=new THREE.GridHelper(160,16,0x839583,0x536b60);grid.position.set(80,.02,80);grid.material.transparent=true;grid.material.opacity=.075;scene.add(grid);

// Terrain is intentionally decorative, not invisible pathfinding obstacles.

const rockGeo=new THREE.DodecahedronGeometry(1,0),rockMat=mat(0x3d4943,1,.1);

const rockInstances=new THREE.InstancedMesh(rockGeo,rockMat,230);const treeInstances=new THREE.InstancedMesh(new THREE.CylinderGeometry(.07,.25,1,5),materials.dark,110);const transform=new THREE.Object3D();let rockCount=0,treeCount=0;const rockRecords=[],treeRecords=[];

for(let i=0;i<230;i++){const x=random()*174-7,z=random()*174-7;if(x>15&&x<46&&z>97&&z<142)continue;if(Math.hypot(x-132,z-30)<17)continue;transform.position.set(x,.2,z);transform.scale.set(1+random()*3,.5+random()*2,1+random()*3);transform.rotation.set(random(),random()*6,random());transform.updateMatrix();rockInstances.setMatrixAt(rockCount++,transform.matrix);rockRecords.push({matrix:transform.matrix.clone(),x,z,rx:Math.max(transform.scale.x,transform.scale.y,transform.scale.z)*1.75,rz:Math.max(transform.scale.x,transform.scale.y,transform.scale.z)*1.75});}

for(let i=0;i<110;i++){const x=random()*160,z=random()*160;if(x>10&&x<50&&z>90&&z<145)continue;transform.position.set(x,.6,z);transform.scale.set(1,1+random()*2,1);transform.rotation.set(0,0,(random()-.5)*.5);transform.updateMatrix();treeInstances.setMatrixAt(treeCount++,transform.matrix);treeRecords.push({matrix:transform.matrix.clone(),x,z,rx:1,rz:1});}rockInstances.count=rockCount;treeInstances.count=treeCount;for(const i of [rockInstances,treeInstances]){i.castShadow=true;i.receiveShadow=true;scene.add(i);}

let terrainSignature='';const hiddenTerrainMatrix=new THREE.Matrix4().makeScale(0,0,0);

function clearStructureTerrain(){

 const buildings=state.entities.filter(e=>e.hp>0&&!['mech','worker','enemy','hive','wire'].includes(e.type)),signature=buildings.map(e=>`${e.id}:${e.type}:${e.x}:${e.z}`).join('|');if(signature===terrainSignature)return;terrainSignature=signature;

 const zones=structureTerrainZones(buildings);basinTerrain.clearZones(zones,terrainIntersectsZones);for(const [mesh,records] of [[rockInstances,rockRecords],[treeInstances,treeRecords]]){let hidden=0;records.forEach((item,i)=>{const covered=terrainIntersectsZones(item,zones);mesh.setMatrixAt(i,covered?hiddenTerrainMatrix:item.matrix);if(covered)hidden++;});mesh.instanceMatrix.needsUpdate=true;mesh.userData.clearedInstances=hidden;}

}

const basinTerrain=createBasinTerrain(THREE,scene,FRONTIER_MAP);basinTerrain.setVisible(false);
let visualWorldSize=160;
const mapSize=()=>state?.worldSize||160;
function syncMapPresentation(){const size=mapSize();basinTerrain.setVisible(size===768);rockInstances.visible=treeInstances.visible=size===160;grid.visible=size===160;if(size===visualWorldSize)return;visualWorldSize=size;for(const p of [ground,shadowReceiver,fogPlane]){p.scale.set(size/160,size/160,1);p.position.x=p.position.z=size/2;}basePlate.scale.set(size/160,1,size/160);basePlate.position.x=basePlate.position.z=size/2;}

const objectiveMarker=ring(7,0xffbf69,.55);objectiveMarker.visible=false;scene.add(objectiveMarker);

const crater=new THREE.Mesh(new THREE.RingGeometry(11,17,40),new THREE.MeshBasicMaterial({color:0x102b29,transparent:true,opacity:.5,side:2}));crater.rotation.x=-Math.PI/2;crater.position.set(30,.05,120);scene.add(crater);

// Small landing-pad marks and approach beacons orient the opening, with no hidden obstacles.

const servicePad=ring(8.8,0x91dac2,.28);servicePad.position.set(30,.1,120);scene.add(servicePad);

for(const [x,z] of [[46,105],[62,88]]){const marker=ring(4,0xb1a77f,.22);marker.position.set(x,.09,z);scene.add(marker);for(const side of [-1,1]){cylinder(.13,.2,1.2,materials.steel,[x+side*4,.6,z],scene);box(.22,.2,.22,materials.light,[x+side*4,1.25,z],scene);}}

// Fog texture: unexplored dark, explored dim, current shared team vision clear.

const fogCanvas=document.createElement('canvas');fogCanvas.width=fogCanvas.height=256;const fogCtx=fogCanvas.getContext('2d');const exploredCanvas=document.createElement('canvas');exploredCanvas.width=exploredCanvas.height=256;const exploredCtx=exploredCanvas.getContext('2d');const fogTexture=new THREE.CanvasTexture(fogCanvas);fogTexture.minFilter=THREE.LinearFilter;

const fogPlane=mesh(new THREE.PlaneGeometry(160,160),new THREE.MeshBasicMaterial({map:fogTexture,transparent:true,depthWrite:false,side:2}),[80,13,80]);fogPlane.rotation.x=-Math.PI/2;fogPlane.castShadow=false;fogPlane.receiveShadow=false;fogPlane.renderOrder=5;

const alienAssets={};

let state=null,room=null,playerId=0,socket,token=null,artilleryAsset=null,modelAsset=null,podAsset=null,workerAsset=null,extractorAsset=null,turretAsset=null,selected=new Set(),placement=null,lastEvent=0,lastTime=0,gameStarted=false,connected=false;

const presentation=new SnapshotTimeline(WebSocket.snapshotInterval||.05);let newSession=false;

const introPresentation=new SnapshotTimeline(.25),landingScene=createLandingScene(THREE,scene,{lowGraphics:true});

const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;let introWasActive=false,introSoundTime=0;

function introActive(){return !!(room?.started&&room.intro&&!room.intro.complete);}

function skipIntro(){if(introActive()&&playerId!==2)send('skip_intro');}

function applyIntro(){

 const active=introActive(),elapsed=room?.intro?.elapsed||0,now=performance.now()/1000;

 if(newSession||elapsed<introPresentation.latest||active&&!introWasActive){introPresentation.reset(elapsed,now);introSoundTime=elapsed;}else introPresentation.receive(elapsed,now);

 if(active!==introWasActive){keys.clear();pointerDown=null;setPlacement(null);closeControllerUI();$('help-modal').hidden=true;$('economy-modal').hidden=true;$('code-keyboard').hidden=true;

  if(!active){focus.set(TACTICAL_CAMERA.focusX,0,TACTICAL_CAMERA.focusZ);zoom=TACTICAL_CAMERA.defaultZoom;cameraFocus.copy(focus);cameraZoom=zoom;rawInputArmed=false;readGamepad([]);}

 }

 introWasActive=active;document.body.classList.toggle('cinematic',active);$('landing-intro').hidden=!active;

 $('intro-skip').disabled=playerId===2;$('intro-skip').textContent=playerId===2?'HOST CONTROLS SKIP':'SKIP INTRO · B / ESC';

 $('intro-pause').disabled=playerId===2;$('intro-pause').textContent=room?.paused?'RESUME · MENU / P':'PAUSE · MENU / P';

 $('intro-state').textContent=!connected?'CONNECTION LOST':room?.paused?'LANDING PAUSED':room?.mode==='coop'?'SYNCHRONIZED CO-OP INSERTION':'KESTREL BASIN // FIRST LANDING';

}

const entities=new Map(),deposits=new Map(),effects=[],pendingEffects=[],gatlingShots=new GatlingShots();let frameNumber=0;const rotorQuaternion=new THREE.Quaternion();let aimPoint=new THREE.Vector3(30,0,100),toastTimer;

let audioContext=null,gatlingAudio=null,soundEnabled=true,lastSoundAt=0,audioWasAllowed=false;

let musicStorage=null;try{musicStorage=window.localStorage;}catch{}
const musicPlayer=new MusicPlayer({storage:musicStorage,createAudio:()=>new window.Audio(),onChange:updateMusicUI});
function musicActive(){return !document.hidden&&gameStarted&&connected&&!room?.paused&&state?.phase==='running';}
function updateMusicUI(d=musicPlayer.diagnostics()){
 const percent=Math.round(d.volume*100),label=d.enabled&&percent>0?`${percent}%`:'OFF';
 $('music').textContent=d.status==='blocked'?'MUSIC · CLICK':`MUSIC ${label}`;
 $('music').setAttribute('aria-label',`Music settings, ${label.toLowerCase()}`);
 $('music-toggle').textContent=d.enabled?'MUSIC ON':'MUSIC OFF';$('music-toggle').setAttribute('aria-pressed',String(d.enabled));
 $('music-volume').value=String(percent);$('music-volume-value').textContent=`${percent}%`;
 $('music-status').textContent=d.status==='blocked'?'Browser waiting: click START / RETRY MUSIC.':d.status==='error'?'Music unavailable. Click START / RETRY MUSIC to try again.':!d.masterEnabled?'All audio muted by SOUND OFF.':!d.enabled||!percent?'Music muted.':!d.active?'Music resumes during deployment and active play.':`${d.status==='playing'?'Playing':'Ready'}: ${d.track}`;
}
function unlockAudio(){
 musicPlayer.unlock();

 try{if(!audioContext){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;audioContext=new Audio();gatlingAudio=new GatlingAudio(audioContext,{sampleOnly:true});gatlingAudio.setEnabled(soundEnabled);gatlingAudio.loadRecording(new URL("../assets/audio/mech-twin-chainguns-v4.mp3",import.meta.url).href).catch(error=>{console.warn('Provided Gatling recording could not load:',error.message);toast('The provided gun sound could not load. Reload this page to retry.');});}if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}catch(error){console.warn('Audio unavailable:',error.message);}

}

function audioAllowed(){return !!audioContext&&soundEnabled&&audioContext.state==='running'&&!document.hidden&&gameStarted&&connected&&!room?.paused&&state?.phase==='running';}

function gunMix(group){const p=group.position.clone().project(camera);return {pan:THREE.MathUtils.clamp(p.x*.65,-.75,.75),level:THREE.MathUtils.clamp(100/(60+camera.position.distanceTo(group.position)),.35,.85)};}

function sound(kind){if(!audioAllowed())return;const now=audioContext.currentTime;if(kind==='shot'&&now-lastSoundAt<.04)return;lastSoundAt=now;const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.type=kind==='wave'?'sine':'triangle';const freq=kind==='wave'?330:kind==='hvd'?80:kind==='explosion'?55:180;const duration=kind==='wave'?.45:kind==='hvd'?.5:kind==='explosion'?.25:.07;oscillator.frequency.setValueAtTime(freq,now);oscillator.frequency.exponentialRampToValueAtTime(freq*.35,now+duration);gain.gain.setValueAtTime(kind==='wave'?.07:.035,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};oscillator.start(now);oscillator.stop(now+duration);}

window.addEventListener('pointerdown',unlockAudio,{passive:true});

window.addEventListener('keydown',unlockAudio,{passive:true});

document.addEventListener('visibilitychange',()=>{if(document.hidden)gatlingAudio?.stopAll({immediate:true});musicPlayer.setActive(musicActive());});

window.addEventListener('pagehide',()=>{gatlingAudio?.stopAll({immediate:true});musicPlayer.setActive(false);});

function toast(message){$('toast').textContent=message;$('toast').style.opacity=1;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.opacity=0,4500);}

function formatTime(t){t=Math.max(0,Math.ceil(t||0));return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;}

function controlled(e){return e.owner===0||playerId===0||e.owner===playerId;}

function visionAt(x,z){return !!state&&teamVisible(state,{x,z});}

function send(type,extra={}){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type,...extra}));else toast('Connection is not ready.');}

function command(cmd){if(introActive())return;if(room?.paused){toast('Mission paused. The host can resume.');return;}if(cmd.ids){const ids=cmd.ids.filter(id=>!state?.entities.find(e=>e.id===id)?.launch);if(!ids.length){toast('Mech rollout in progress. Orders unlock when it clears the foundry.');return;}cmd={...cmd,ids};}if(['mech','cancel-production'].includes(cmd.type)&&state?.entities.find(e=>e.id===cmd.factoryId)?.launchId){toast('Foundry is launching its completed mech. Keep the apron clear.');return;}send('command',{command:cmd});}

function connect(action){

 if(socket){socket.intentionalClose=true;socket.close();}socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}`);

 socket.addEventListener('open',()=>{connected=true;send(action.type,action);});

 socket.addEventListener('message',event=>{if(event.target.intentionalClose||event.target!==socket)return;const data=JSON.parse(event.data);

  if(data.type==='error'){toast(data.message);return;}

  if(data.type==='welcome'){newSession=true;lastEvent=0;playerId=data.playerId;token=data.token;room=data.room;sessionStorage.setItem('mech-rts-pages-session-v1',JSON.stringify({code:room.code,token}));$('setup-actions').hidden=true;$('ready-panel').hidden=false;applyRoom();}

  if(data.type==='room'){room=data.room;applyRoom();}

  if(data.type==='state'){const oldTime=state?.time;state=data.state;syncMapPresentation();const resetting=newSession||(oldTime!==undefined&&state.time<oldTime);if(resetting){$('economy-modal').hidden=true;keys.clear();const joining=newSession;newSession=false;presentation.reset(state.time,performance.now()/1000);clearEffects();lastEvent=joining&&state.time>0?state.eventId:0;exploredCtx.clearRect(0,0,256,256);for(const o of entities.values()){disposeOwned(o);scene.remove(o)};entities.clear();selected.clear();$('end-screen').hidden=true;}presentation.receive(state.time,performance.now()/1000);reconcile();if(resetting&&room?.started&&selected.size===0)selectIds([playerId===2?'mech-2':'mech-1']);updateHUD();}

 });

 socket.addEventListener('close',event=>{if(event.target.intentionalClose)return;connected=false;applyIntro();$('network-label').textContent='DISCONNECTED · RELOAD TO REJOIN';toast('Connection lost. Mission paused; reload this tab to reconnect.');});

 socket.addEventListener('error',()=>toast('Cannot reach the game server. Check your connection and reload this page.'));

}

function leaveRoom(){musicPlayer.setActive(false);$('economy-modal').hidden=true;introWasActive=false;introPresentation.reset(0,performance.now()/1000);document.body.classList.remove('cinematic');$('landing-intro').hidden=true;landingScene.update(0);presentation.reset(0,performance.now()/1000);clearEffects();if(socket){socket.intentionalClose=true;socket.close();socket=null;}sessionStorage.removeItem('mech-rts-pages-session-v1');room=null;token=null;connected=false;gameStarted=false;lastEvent=0;selected.clear();exploredCtx.clearRect(0,0,256,256);for(const g of entities.values()){disposeOwned(g);scene.remove(g)};entities.clear();state=createGame();$('lobby').hidden=false;$('setup-actions').hidden=false;$('ready-panel').hidden=true;$('bottom-hud').hidden=true;$('cursor-controls').hidden=true;cursorOrderMode=false;$('cursor-order').textContent='CURSOR: SELECT';$('cursor-order').setAttribute('aria-pressed','false');$('pause').textContent='PAUSE';$('help-modal').hidden=true;$('end-screen').hidden=true;$('network-label').textContent='ONLINE PROTOTYPE';setPlacement(null);reconcile();updateHUD();}

function applyRoom(){

 if(gameStarted&&!room.started)newSession=true;

 if(!room.started){if(!$('economy-modal').hidden)closeEconomy();setPlacement(null);keys.clear();pointerDown=null;}

 $('room-name').textContent=room.code;$('pilot-count').textContent=`${room.players.filter(p=>p.connected).length} / ${room.mode==='coop'?2:1} PILOTS CONNECTED`;

 $('room-note').textContent=room.mode==='coop'?'Share this room code with the other browser on this same hosted demo. Each pilot owns one mech; economy and workers are shared.':'Solo field test: you control both mechs and the shared economy.';

 $('launch').disabled=playerId===2||(room.mode==='coop'&&room.players.filter(p=>p.connected).length<2);$('launch').textContent=playerId===2?'WAITING FOR HOST':'DEPLOY TO BASIN ↗';

 $('lobby').hidden=room.started;$('bottom-hud').hidden=!room.started;$('cursor-controls').hidden=!room.started;gameStarted=room.started;

 $('network-label').textContent=`${room.mode==='solo'?'SOLO FIELD TEST':`CO-OP / PILOT ${playerId}`} · ${room.code}${room.paused?' · PAUSED':''}`;

 $('pause').textContent=room.paused?'RESUME':'PAUSE';$('pause').disabled=playerId===2;

 $('pilot-label').textContent=playerId===0?'ALL UNITS':`PILOT ${playerId}`;applyIntro();

 if(room.started&&selected.size===0)selectIds([playerId===2?'mech-2':'mech-1']);

}

function makeFallbackMech(e){const g=new THREE.Group();g.userData.fallback=true;

 box(3.3,2.4,1.9,materials.armor,[0,5.3,0],g);box(1.2,.9,1.2,materials.dark,[0,7.1,.15],g);box(.9,.15,.1,materials.light,[0,7.2,.8],g);

 for(const s of [-1,1]){box(1.4,1.6,1.5,materials.steel,[s*2.25,5.8,0],g);box(.8,2.4,.9,materials.armor,[s*2.7,4.1,0],g);box(1.1,3,1.2,materials.dark,[s*.95,2.5,0],g);box(1.5,.8,2,materials.armor,[s*.95,.7,.35],g);}const bounds=new THREE.Box3().setFromObject(g),factor=WORLD_SCALE.mechHeight/bounds.getSize(new THREE.Vector3()).y;g.scale.setScalar(factor);g.position.y=-bounds.min.y*factor;return g;}

function addMechModel(g,e){

 if(e?.role==='artillery'){if(!artilleryAsset)return;for(const c of [...g.children])if(c.userData.art){disposeOwned(c);g.remove(c);}g.userData.artilleryRig?.dispose();const rig=createArtilleryRig(THREE,cloneSkeleton,artilleryAsset);rig.root.userData.art=true;g.add(rig.root);g.userData.artilleryRig=rig;return;}

 if(!modelAsset)return;

 if(g.userData.mixer){g.userData.mixer.stopAllAction();g.userData.mixer.uncacheRoot(g.userData.mixer.getRoot());}

 for(const c of [...g.children])if(c.userData.art){disposeOwned(c);g.remove(c);}

 const art=cloneSkeleton(modelAsset.scene);art.userData.art=true;

 const bound=new THREE.Box3().setFromObject(art),scale=WORLD_SCALE.mechHeight/bound.getSize(new THREE.Vector3()).y;

 art.scale.setScalar(scale);art.position.y=-bound.min.y*scale;

 art.traverse(o=>{o.userData.sharedAsset=true;if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});g.add(art);

 g.userData.art=art;g.userData.landingRig=createMechLandingRig(THREE,art);g.userData.landingPoseActive=false;

 g.userData.mixer=new THREE.AnimationMixer(art);g.userData.actions={};

 for(const clip of modelAsset.animations)g.userData.actions[clip.name]=g.userData.mixer.clipAction(clip);

 // Keep both cyclic clips alive, preserving gait phase through start/stop transitions.

 for(const name of ['Idle','Walk']){const action=g.userData.actions[name];if(action){action.setEffectiveWeight(name==='Idle'?1:0).play();action.time=(e?.owner===2 ? .5 : 0)*action.getClip().duration;}}

 g.userData.locomotion=new LocomotionBlend((modelAsset.scene.userData.nominalWalkSpeed||7.272727)*scale);

 g.userData.gatlingRotors=new GatlingRotors();g.userData.rotorBindings={};g.userData.muzzles={};g.userData.rotorBlurs={};

 for(const side of ['L','R']){

  const rotor=art.getObjectByName(`GATLING_ROTOR_${side}`),muzzle=art.getObjectByName(`MUZZLE_GATLING_${side}`);

  if(rotor)g.userData.rotorBindings[side]={bone:rotor,rest:rotor.quaternion.clone(),axis:new THREE.Vector3(...(modelAsset.scene.userData.rotorLocalAxis||[0,1,0]))};

  if(rotor){

   // A faint annular exposure streak communicates high rotor speed without

   // lowering the actual angular velocity to avoid frame-rate aliasing.

   const blur=new THREE.Mesh(new THREE.RingGeometry(.55,1.02,48),new THREE.MeshBasicMaterial({color:0x9aa9ad,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));

   blur.rotation.x=Math.PI/2;blur.position.y=4.69;blur.visible=false;rotor.add(blur);g.userData.rotorBlurs[side]=blur;

  }

  if(muzzle)g.userData.muzzles[side]=muzzle;

 }

 g.userData.lastPresentedShot=null;

}

function addRiggedArt(g,asset,type){

 if(!asset)return;

 g.userData.mixer?.stopAllAction();

 if(g.userData.mixer)g.userData.mixer.uncacheRoot(g.userData.mixer.getRoot());

 for(const c of [...g.children])if(!c.userData.selection){disposeOwned(c);g.remove(c);}

 const art=cloneSkeleton(asset.scene);art.userData.art=true;g.userData.assetScale=type==='extractor'?.65:type==='turret'?.8:1;art.scale.setScalar(g.userData.assetScale);

 // Asset contract: glTF Y-up, metres, +Z front. Do not normalize moving bounds.

 art.traverse(o=>{o.userData.sharedAsset=true;if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(type==='pod')o.frustumCulled=false;}});g.add(art);

 const mixer=new THREE.AnimationMixer(art);g.userData.mixer=mixer;g.userData.actions={};g.userData.art=art;

 for(const original of asset.animations){const clip=type==='turret'?new THREE.AnimationClip(original.name,original.duration,original.tracks.filter(t=>t.name.includes('rotary_barrel_spin_')).map(t=>t.clone())):original;g.userData.actions[clip.name]=mixer.clipAction(clip);}

 if(type==='turret')g.userData.turretYaw=art.getObjectByName('turret_yaw');

 g.userData.clip=null;

 if(type==='worker'){

  const socket=art.getObjectByName('PayloadSocket');

  if(socket){const payload=box(.3,.22,.28,materials.ore,[0,0,0],socket);payload.visible=false;g.userData.payload=payload;}

  g.userData.bootUntil=gameStarted&&state?.time<2?1.6:0;

 }

 if(type==='pod'){

  const action=g.userData.actions.Landing_Deploy||Object.values(g.userData.actions)[0];

  if(action){action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();g.userData.deployAction=action;}

 }else if(type!=='worker'){

  const action=Object.values(g.userData.actions)[0];if(action)action.play();

 }

}

function addPodModel(g){addRiggedArt(g,podAsset,'pod');}

function addWorkerModel(g){addRiggedArt(g,workerAsset,'worker');}

function playWorker(g,name,dt,speed){

 const actions=g.userData.actions;if(!actions)return;

 const action=actions[name]||actions.Idle;if(!action)return;

 if(g.userData.clip!==name){

  const old=actions[g.userData.clip];old?.fadeOut(.16);

  action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).fadeIn(.16);

  const single=['PickUp','PutDown','HitReact','Shutdown','BootUp'].includes(name);

  action.setLoop(single?THREE.LoopOnce:THREE.LoopRepeat,single?1:Infinity);action.clampWhenFinished=single;action.play();g.userData.clip=name;

 }

 // Distance-based cadence avoids a walk-in-place pose during authoritative pauses.

 if(name==='Walk'||name==='CarryWalk'){const nominal=name==='CarryWalk'?(workerAsset.scene.children[0]?.userData.nominalCarrySpeed||.423529):(workerAsset.scene.children[0]?.userData.nominalWalkSpeed||.88);action.setEffectiveTimeScale(Math.max(.1,Math.min(3,speed/nominal)));}

 if(name==='PickUp'||name==='PutDown')action.setEffectiveTimeScale(action.getClip().duration/1.2);

 g.userData.mixer.update(dt);

}

function addAlienModel(g,e){

 const asset=alienAssets[e.role==='heavy'?'heavy':'runner'];if(!asset||g.userData.alienRig)return;

 const rig=createAlienRig(THREE,cloneSkeleton,asset,{heavy:e.role==='heavy',phase:e.x*.17+e.z*.13});

 for(const c of [...g.children])if(!c.userData.selection){disposeOwned(c);g.remove(c);}

 g.userData.legs=[];g.userData.alienRig=rig;g.add(rig.root);

}

function makeEntity(e){const g=new THREE.Group();g.userData.entityId=e.id;g.userData.type=e.type;g.position.set(e.x,0,e.z);g.rotation.y=e.angle||0;g.userData.motion=new SnapshotTrack();

 if(e.type==='mech'){const f=makeFallbackMech(e);f.userData.art=true;g.add(f);addMechModel(g,e);const band=ring(6.3,e.owner===1?0xffc06b:0x7fe2d2,.45);band.userData.teamBand=true;g.add(band);}

 if(e.type==='pod'){cylinder(8.2,9.5,.6,materials.dark,[0,.2,0],g,12);cylinder(4.8,6.3,7.8,materials.steel,[0,4.4,0],g,8);cylinder(3.8,4.7,2,materials.armor,[0,9,0],g,8);cylinder(2.4,3.5,.5,materials.sand,[0,10.2,0],g,8);for(let i=0;i<4;i++){const a=i*Math.PI/2;const foot=box(3,1.2,6,materials.armor,[Math.sin(a)*6,1,Math.cos(a)*6],g);foot.rotation.y=a;const light=box(.5,4,.3,materials.light,[Math.sin(a)*5.3,5,Math.cos(a)*5.3],g);light.rotation.y=a;}const r=ring(11,0x759b8b,.4);g.add(r);}

 if(e.type==='worker'){box(.46,.62,.25,materials.sand,[0,1.35,0],g);box(.25,.3,.24,materials.sand,[0,1.85,0],g);box(.18,.08,.03,materials.dark,[0,1.9,.13],g);for(const side of [-1,1]){box(.14,.75,.16,materials.dark,[side*.13,.53,0],g);box(.18,.15,.3,materials.sand,[side*.13,.075,.06],g);box(.13,.68,.14,materials.sand,[side*.32,1.24,0],g);}}

 if(e.type==='turret'){cylinder(2.4,3,.8,materials.dark,[0,.5,0],g);cylinder(.9,1,2.3,materials.steel,[0,1.7,0],g);box(2.5,1.8,2,materials.armor,[0,3.2,0],g);box(.5,.5,4,materials.dark,[-.6,3.4,2],g);box(.5,.5,4,materials.dark,[.6,3.4,2],g);box(1,.2,.1,materials.light,[0,3.6,1.05],g);}

 if(e.type==='extractor'){cylinder(3,4,.5,materials.dark,[0,.25,0],g);box(3,3,3,materials.steel,[0,2,0],g);cylinder(.35,.6,5,materials.amber,[0,3.5,0],g);box(4,.4,3,materials.armor,[0,4,0],g);}

 if(e.type==='drop-pad'){const art=createDropPad(THREE);g.add(art.root);g.userData.dropPadArt=art;}

 if(e.type==='mech-factory'){const art=createMechFactory(THREE);g.add(art.root);g.userData.foundryArt=art;}

 if(e.type==='repair-station'){const art=createServiceBay(THREE);g.add(art.root);g.userData.serviceArt=art;}

 if(e.type==='wire'){for(const x of [-4,0,4])box(.2,1.7,.2,materials.steel,[x,.85,0],g);const points=[];for(let i=0;i<110;i++){const a=i*.7;points.push(new THREE.Vector3(-4.3+i/109*8.6,.9+Math.sin(a)*.6,Math.cos(a)*.6));}g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xaaa98d})));}

 if(e.type==='hive'){const art=createHiveArt(THREE);g.add(art.root);g.userData.hiveArt=art;}

 if(e.type==='enemy'){const heavy=e.role==='heavy';const body=mesh(new THREE.IcosahedronGeometry(heavy?2:1.35,1),materials.red,[0,1.3,0],g);body.scale.set(1,.8,1.3);box(.6,.15,.2,materials.coral,[0,1.5,1.3],g);g.userData.legs=[];for(const s of [-1,1])for(const z of [-.9,.9]){const leg=box(2,.2,.3,materials.dark,[s*1.4,.6,z],g);leg.rotation.z=s*.5;g.userData.legs.push(leg);}}

 if(['generator','reactor','relay','battery','worker-factory','upgrade-station'].includes(e.type)){const art=createEconomyBuilding(THREE,e.type);g.add(art.root);g.userData.economyArt=art;}

 const radius={'drop-pad':14,'mech-factory':17,mech:6.5,worker:1,turret:3.3,extractor:5,'repair-station':10.7,'upgrade-station':10.7,pod:10,hive:14,enemy:2.6,wire:4.5}[e.type]||5;const selection=ring(radius,0xffc06b);selection.visible=false;selection.userData.selection=true;g.add(selection);if(e.type==='pod'&&podAsset)addPodModel(g);if(e.type==='worker'&&workerAsset)addWorkerModel(g);if(e.type==='extractor'&&extractorAsset)addRiggedArt(g,extractorAsset,'extractor');if(e.type==='turret'&&turretAsset)addRiggedArt(g,turretAsset,'turret');if(e.type==='enemy')addAlienModel(g,e);scene.add(g);entities.set(e.id,g);return g;

}

function makeDeposit(d){const g=new THREE.Group();g.userData.resourceType=resourceKind(d);const oreMaterial=mat(RESOURCE_COLORS[resourceKind(d)]||RESOURCE_COLORS.alloy,.3,.6,{emissive:RESOURCE_COLORS[resourceKind(d)]||RESOURCE_COLORS.alloy,emissiveIntensity:.25});g.position.set(d.x,0,d.z);for(let i=0;i<11;i++){const a=i*2.4,r=1+random()*3;const c=mesh(new THREE.ConeGeometry(.7+random()*.8,2+random()*3,5),oreMaterial,[Math.sin(a)*r,1,Math.cos(a)*r],g);c.rotation.x=(random()-.5)*.6;c.rotation.z=(random()-.5)*.6;}cylinder(4.6,5,.3,materials.dark,[0,.1,0],g,10);g.add(ring(6,RESOURCE_COLORS[resourceKind(d)]||RESOURCE_COLORS.alloy,.4));scene.add(g);deposits.set(d.id,g);return g;}

function reconcile(){if(!state)return;clearStructureTerrain();

 for(const [id,g] of deposits)if(!state.deposits.some(d=>d.id===id&&resourceKind(d)===g.userData.resourceType)){disposeOwned(g);scene.remove(g);deposits.delete(id);}

 for(const d of state.deposits){const g=deposits.get(d.id)||makeDeposit(d);g.visible=d.remaining>0;}

 for(const e of state.entities){const g=entities.get(e.id)||makeEntity(e);if(e.type==='worker'&&g.userData.data&&e.hp<g.userData.data.hp)g.userData.hitUntil=state.time+.8;if(e.type==='enemy'&&e.lastShotAt!==undefined&&e.lastShotAt!==g.userData.lastAlienShotAt){if(state.time-e.lastShotAt<.5)g.userData.alienRig?.attack();g.userData.lastAlienShotAt=e.lastShotAt;}g.userData.data=e;g.userData.motion.push(e,state.time);g.visible=(e.hp>0||e.type==='hive'||(e.type==='worker'&&state.time-(e.deadAt??-99)<1.6))&&(!(e.type==='enemy'||e.type==='hive')||visionAt(e.x,e.z)||!gameStarted);if(e.hp<=0)selected.delete(e.id);}

 for(const [id,g] of entities)if(!state.entities.some(e=>e.id===id)){disposeOwned(g);scene.remove(g);entities.delete(id);}

 updateFog();

 for(const event of state.events){if(event.id<=lastEvent)continue;lastEvent=event.id;if(event.type==='notice'||event.type==='wave')toast(event.text);if(event.type==='wave')sound('wave');if(['shot','enemy-shot','hvd','explosion','impact','build'].includes(event.type)&&visionAt(event.x,event.z))pendingEffects.push(event);}

 if(state.phase!=='running'&&gameStarted){if(!$('economy-modal').hidden)closeEconomy();$('end-screen').hidden=false;$('end-title').textContent=state.phase==='won'?(state.productionVersion?'Hive neutralized.':state.economyVersion?'Powered frontier established.':state.mission?'Foothold established.':'Hive neutralized.'):state.endReason==='army_unrecoverable'?'Assault force exhausted.':state.endReason==='mechs_destroyed'?'Both mechs lost.':'Drop pod lost.';$('end-text').textContent=`${state.phase==='won'?(state.mission?state.productionVersion?'The hive has fallen. Your foothold survives.':state.economyVersion?'The landing zone is secure, the outpost is powered, and upgraded mechs have opened the crystal frontier.':'The ground-anchor HQ is secure, mining is online, and the first swarm has been stopped.':'The landing zone is secure.'):state.endReason==='army_unrecoverable'?'No mechs remain and the team cannot fund or gather replacement materials. Restart to try another expansion route.':state.endReason==='mechs_destroyed'?'The assault force is gone. Retreat for repairs before a mech is destroyed.':'Regroup and protect the shared base.'} Mission ${formatTime(state.time)} · ${state.kills} hostiles neutralized.`;$('restart').disabled=playerId===2;}

}

function updateFog(){if(!state)return;const scale=256/mapSize();exploredCtx.fillStyle='white';for(const e of state.entities){if(e.hp<=0||!['pod','mech','worker','turret'].includes(e.type))continue;const r=e.type==='pod'?34:e.type==='worker'?18:28;exploredCtx.beginPath();exploredCtx.arc(e.x*scale,e.z*scale,r*scale,0,Math.PI*2);exploredCtx.fill();}

 fogCtx.globalCompositeOperation='source-over';fogCtx.clearRect(0,0,256,256);fogCtx.fillStyle='rgba(5,14,19,.94)';fogCtx.fillRect(0,0,256,256);fogCtx.globalCompositeOperation='destination-out';fogCtx.globalAlpha=.36;fogCtx.drawImage(exploredCanvas,0,0);fogCtx.globalAlpha=1;

 for(const e of state.entities){if(e.hp<=0||!['pod','mech','worker','turret'].includes(e.type))continue;const r=(e.type==='pod'?34:e.type==='worker'?18:28)*scale;const grad=fogCtx.createRadialGradient(e.x*scale,e.z*scale,r*.8,e.x*scale,e.z*scale,r);grad.addColorStop(0,'rgba(0,0,0,1)');grad.addColorStop(1,'rgba(0,0,0,0)');fogCtx.fillStyle=grad;fogCtx.beginPath();fogCtx.arc(e.x*scale,e.z*scale,r,0,Math.PI*2);fogCtx.fill();}fogCtx.globalCompositeOperation='source-over';fogTexture.needsUpdate=true;fogPlane.visible=gameStarted;}

function clearEffects(){gatlingAudio?.stopAll({immediate:true});pendingEffects.length=0;gatlingShots.clear();for(const fx of effects){scene.remove(fx.object);fx.object.geometry?.dispose();fx.object.material?.dispose();}effects.length=0;}

function pushEffect(object,ttl){scene.add(object);effects.push({object,ttl,max:ttl,bornFrame:frameNumber});}

function presentGatlingShot(event,renderTime){

 const shot=gatlingShots.accept(event,renderTime);if(!shot)return null;

 const group=entities.get(shot.sourceId);if(!group)return null;

 // One authoritative pair starts both unilateral recoil clips in the same frame.

 for(const side of shot.sides){const action=group.userData.actions?.[`Fire_${side}`];if(action&&shot.age<action.getClip().duration){action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=false;action.reset().setEffectiveWeight(1).play();action.time=shot.age;}}

 group.userData.mixer?.update(0);group.userData.gatlingRotors?.shot(shot.side,event.time);group.userData.lastPresentedShot={serial:shot.serial,side:shot.side,sides:shot.sides,time:shot.time};

 group.updateWorldMatrix(true,true);

 const origins=shot.sides.map(side=>{const origin=new THREE.Vector3(),muzzle=group.userData.muzzles?.[side];if(muzzle)muzzle.getWorldPosition(origin);else origin.set(side==='L'?-2.7:2.7,4.7,2.1).applyMatrix4(group.matrixWorld);const flash=new THREE.Mesh(new THREE.SphereGeometry(.34,8,6),new THREE.MeshBasicMaterial({color:0xffe3a3,transparent:true,opacity:1,depthWrite:false}));flash.position.copy(origin);pushEffect(flash,.055);return origin;});

 if(audioAllowed()){if(shot.side==='LR')gatlingAudio?.shotPair(shot.sourceId,gunMix(group));else gatlingAudio?.shot(shot.sourceId,shot.side,gunMix(group));}return origins;

}

function addEffect(e,renderTime=presentation.time){

 if(e.type==='impact'&&e.shotSerial&&renderTime-e.time>.35)return;

 const artillery=entities.get(e.sourceId)?.userData.artilleryRig;const isGatling=e.weapon!=='artillery'&&!artillery&&!!authoritativeSide(e);let origins;if(artillery&&e.type==='shot'){artillery.fire(e.muzzleSide||'L');sound('explosion');}

 if(isGatling){origins=presentGatlingShot(e,renderTime);if(!origins)return;}else if(['shot','hvd','explosion'].includes(e.type))sound(e.type);

 let object,ttl=.3;

 if(e.tx!==undefined){const target=state.entities.find(x=>x.id===e.targetId),height=target?.type==='hive'?5:2;const targetPoint=new THREE.Vector3(e.tx,height,e.tz),points=(origins||[new THREE.Vector3(e.x,e.type==='hvd'?5:3,e.z)]).flatMap(origin=>[origin,targetPoint]);object=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:e.type==='enemy-shot'?0xe47755:e.type==='hvd'?0x83f7f1:0xffd38c,transparent:true,opacity:1,depthWrite:false}));ttl=e.type==='hvd'?1:isGatling?.075:.2;}

 else{object=new THREE.Mesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial({color:e.type==='build'?0x85e8c2:0xffb170,transparent:true,opacity:.85,depthWrite:false}));object.position.set(e.x,1,e.z);ttl=e.type==='explosion'?.9:e.shotSerial?.09:.25;object.userData.expand=e.type==='explosion'?12:e.shotSerial?1.6:3;}

 pushEffect(object,ttl);

}

function updateObjectives(){

 const target=objectiveTarget(state),mission=state.mission;

 $('objective-title').textContent=target.title;$('objective-hint').textContent=state.productionVersion&&!state.entities.some(e=>e.type==='mech'&&e.hp>0)?'ASSAULT FORCE LOST. Keep HQ alive. FIELD COMMAND → BUILD: assemble replacement mechs. Mining and production can continue.':mission?objectiveHint(target.id,controllerActive):'Secure alloy. Hold the pod. Bring both pilots home.';

 const list=$('objective-checklist');list.replaceChildren();

 for(const [i,item] of (mission?.objectives||[]).entries()){if(mission.objectives.length>7&&(i<Math.max(0,mission.objectives.findIndex(o=>!o.complete)-1)||i>Math.max(0,mission.objectives.findIndex(o=>!o.complete))+3))continue;const li=document.createElement('li');li.textContent=`${item.complete?'✓':String(i+1).padStart(2,'0')} ${item.label}`;li.className=item.complete?'done':item.id===target.id?'current':'';list.appendChild(li);}

 document.querySelector('[data-build=wire]').hidden=!!mission;$('hvd').hidden=!!mission;

 $('objective-count').textContent=mission?`${mission.objectives.filter(o=>o.complete).length} / ${mission.objectives.length} COMPLETE`:'PRIMARY OBJECTIVE';

 $('focus-objective').hidden=!mission;objectiveMarker.visible=!!mission&&gameStarted&&target.id!=='complete';objectiveMarker.position.set(target.x,.15,target.z);

}

function focusObjective(){const target=objectiveTarget(state);focus.set(target.x,0,target.z);aimPoint.copy(focus);if(target.id==='harvest')selectWorkers();else if(target.id==='repair')selectIds([playerId===2?'mech-2':'mech-1']);}

function updateHUD(){if(!state)return;$('resources').textContent=displayAmount(state.resources);const pod=state.entities.find(e=>e.type==='pod');$('base-health').textContent=`${Math.ceil(pod.hp/pod.maxHp*100)}%`;$('base-health').style.color=pod.hp/pod.maxHp<.35?'#f28a70':'';$('wave-timer').textContent=state.nextWaveAt?formatTime(state.nextWaveAt-state.time):'CLEAR';$('mission-time').textContent=formatTime(state.time);$('wave-label').textContent=state.productionVersion?`HIVE ASSAULT · ${state.kills} HOSTILES DOWN`:state.mission?`FIRST CONTACT ${state.mission.swarmDefeated?'CLEAR':state.wave?'ACTIVE':'PENDING'}`:`WAVE ${state.wave} / 3`;$('hvd-status').textContent=state.time>=state.hvdReadyAt?'PROTOTYPE / READY':formatTime(state.hvdReadyAt-state.time);

 updateObjectives();$('repair-bay-cost').textContent=state.mission?.repairStationFreeUsed?'50 ALLOY':'FIRST BAY FREE';

 const mechs=state.entities.filter(e=>e.type==='mech');const list=$('unit-list');for(const b of [...list.children])if(!mechs.some(e=>b.id==='select-'+e.id))list.removeChild(b);for(const e of mechs)if(!$('select-'+e.id)){const b=document.createElement('button');b.id=`select-${e.id}`;b.onclick=()=>selectIds([e.id]);list.appendChild(b);}for(const e of mechs){const b=$(`select-${e.id}`);b.textContent=`${mechLabel(e)} ${Math.ceil(e.hp/e.maxHp*100)}%`;b.classList.toggle('selected',selected.has(e.id));b.disabled=e.hp<=0||!controlled(e);}

 const units=state.entities.filter(e=>selected.has(e.id)&&e.hp>0);if(units.length===1){const e=units[0];$('selected-name').textContent=e.type==='mech'?`${e.role==='artillery'?'V5 / ORBITAL ARTILLERY':e.role==='combat'?'M06 / VANGUARD':'M06 / LANCER'}`:buildingLabel(e.type).toUpperCase();$('selected-info').textContent=`${Math.ceil(e.hp)} / ${e.maxHp} HP · ${e.status.toUpperCase()}${e.type==='worker'?` · ${displayAmount(e.cargo)} ${shortResource(e.cargoType).toUpperCase()} CARRIED`:e.powerDemand!==undefined?` · ${e.powered?'POWERED':e.powerConnected?'NO SUPPLY':'OUT OF GRID'}`:e.upgradeJob?` · REFIT ${Math.floor(e.upgradeJob.progress*100)}%`:''}`;}else{$('selected-name').textContent=units.length?`${units.length} UNITS SELECTED`:'Select a unit';$('selected-info').textContent=units.length?'Workers haul typed resources back to HQ.':'Left click to select. Right click to give an order.';}

 if(units.length===1&&units[0].production)$('selected-info').textContent+=' · '+productionText(units[0]);if(units.length===1&&units[0].type==='relay')$('selected-info').textContent+=' · 30m POWER RADIUS';$('repair').disabled=!units.some(e=>e.type==='mech'&&!e.launch);renderEconomy();renderSelectionActions();drawMinimap();

}

function selectIds(ids,add=false){if(!add)selected.clear();for(const id of ids){const e=state?.entities.find(e=>e.id===id);if(e?.hp>0&&controlled(e)&&e.owner!==-1)selected.add(id);}updateHUD();}

const overlay=$('overlay'),ctx=overlay.getContext('2d'),minimap=$('minimap'),mini=minimap.getContext('2d');

function project(x,y,z){const p=new THREE.Vector3(x,y,z).project(camera);return {x:(p.x*.5+.5)*innerWidth,y:(-.5*p.y+.5)*innerHeight,z:p.z};}

function drawOverlay(){ctx.clearRect(0,0,innerWidth,innerHeight);if(!state||!gameStarted||introActive())return;

 if(controllerActive){const p=project(aimPoint.x,.4,aimPoint.z);ctx.strokeStyle='#ffe1a2';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.moveTo(p.x-20,p.y);ctx.lineTo(p.x+20,p.y);ctx.moveTo(p.x,p.y-20);ctx.lineTo(p.x,p.y+20);ctx.stroke();}

 const labelRects=[];const hovered=controllerActive?controllerTarget():state.entities.find(e=>e.hp>0&&Math.hypot(e.x-aimPoint.x,e.z-aimPoint.z)<6);
 function claimLabel(p,width,height=26){if(p.z>1||p.x<width/2+8||p.x>innerWidth-width/2-8||p.y<110||p.y>innerHeight-174)return false;const r={x:p.x-width/2,y:p.y-height,w:width,h:height+8};if(labelRects.some(a=>r.x<a.x+a.w&&r.x+r.w>a.x&&r.y<a.y+a.h&&r.y+r.h>a.y))return false;labelRects.push(r);return true;}
 // Selected objects have first claim; healthy incidental objects need no HUD label.
 const annotated=[...state.entities].sort((a,b)=>Number(selected.has(b.id))-Number(selected.has(a.id)));
 for(const e of annotated){if(e.hp<=0||!entities.get(e.id)?.visible||e.type==='wire')continue;const focused=selected.has(e.id)||hovered?.id===e.id;if(!focused&&e.hp>=e.maxHp)continue;const v=entities.get(e.id).position,p=project(v.x,{mech:13.3,pod:13,hive:14,worker:3.5,turret:6,extractor:10,'repair-station':10.5,'upgrade-station':15,'worker-factory':5.2,'mech-factory':19,enemy:3.5}[e.type]||8,v.z);if(!claimLabel(p,focused?140:56))continue;const w=focused?54:30;ctx.fillStyle='#071416da';ctx.fillRect(p.x-w/2-1,p.y-1,w+2,5);ctx.fillStyle=e.owner===-1?'#db7960':selected.has(e.id)?'#ffd38b':'#8dc8b1';ctx.fillRect(p.x-w/2,p.y,w*Math.max(0,e.hp/e.maxHp),3);if(focused){ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillStyle='#e3eee7';ctx.fillText(e.type==='mech'?(e.role==='artillery'?'ARTILLERY':e.role==='combat'?'VANGUARD':'LANCER'):e.type==='pod'?'ANCHOR HQ':e.type==='hive'?'HIVE':buildingLabel(e.type).toUpperCase(),p.x,p.y-7);}}
 for(const d of state.deposits){if(!visionAt(d.x,d.z)||d.remaining<=0)continue;const near=Math.hypot(d.x-aimPoint.x,d.z-aimPoint.z)<8,rig=state.entities.find(e=>e.type==='extractor'&&e.depositId===d.id&&e.hp>0);if(!near&&placement!=='extractor'&&!selected.has(rig?.id))continue;const p=project(d.x,6,d.z);if(!claimLabel(p,140))continue;ctx.font='11px sans-serif';ctx.fillStyle='#'+(RESOURCE_COLORS[resourceKind(d)]||RESOURCE_COLORS.alloy).toString(16);ctx.textAlign='center';ctx.fillText(rig?`EXTRACTOR ${rig.progress<1?Math.round(rig.progress*100)+'%':rig.powered===false?'NO POWER':'ONLINE'}`:`${shortResource(resourceKind(d)).toUpperCase()} ${displayAmount(d.remaining)}`,p.x,p.y);}
 if(placement){const p=project(aimPoint.x,1,aimPoint.z);ctx.font='10px monospace';ctx.fillStyle='#ffce86';ctx.textAlign='center';ctx.fillText(placement==='hvd'?'HVD TARGET / LEFT CLICK':`PLACE ${placement.toUpperCase()} / ${controllerActive?'A':'LEFT CLICK'}`,p.x,p.y-25);}

}

function drawMinimap(){
 const size=mapSize(),sx=190/size,sz=160/size;mini.fillStyle='#0b181c';mini.fillRect(0,0,190,160);
 if(size===768){for(const b of FRONTIER_MAP.obstacles){mini.fillStyle=b.type==='water'?'#244b53':'#51574c';mini.fillRect((b.x-b.width/2)*sx,(b.z-b.depth/2)*sz,b.width*sx,b.depth*sz);}mini.strokeStyle='#ad96784d';for(const l of FRONTIER_MAP.lanes){mini.beginPath();l.points.forEach((p,i)=>i?mini.lineTo(p.x*sx,p.z*sz):mini.moveTo(p.x*sx,p.z*sz));mini.stroke();}}
 mini.strokeStyle='#3b514b66';mini.lineWidth=.5;for(let i=0;i<9;i++){mini.beginPath();mini.moveTo(i*190/8,0);mini.lineTo(i*190/8,160);mini.stroke();mini.beginPath();mini.moveTo(0,i*20);mini.lineTo(190,i*20);mini.stroke();}
 for(const d of state.deposits){mini.fillStyle='#'+(RESOURCE_COLORS[resourceKind(d)]||RESOURCE_COLORS.alloy).toString(16);mini.fillRect(d.x*sx-2,d.z*sz-2,4,4);}
 for(const e of state.entities){if(e.hp<=0||(e.owner===-1&&!visionAt(e.x,e.z)))continue;mini.fillStyle=e.owner===-1?'#df795d':e.type==='mech'?e.owner===1?'#ffca7c':'#9bdfcf':'#6eaf99';mini.beginPath();mini.arc(e.x*sx,e.z*sz,e.type==='pod'?4:e.type==='hive'?6:e.type==='mech'?3:1.5,0,Math.PI*2);mini.fill();}
 const contact=size===768?{...FRONTIER_MAP.hive,label:'HIVE'}:state.mission?{x:70,z:80,label:'APPROACH'}:{x:132,z:30,label:'HIVE'};mini.strokeStyle='#de9162';mini.beginPath();mini.arc(contact.x*sx,contact.z*sz,7,0,Math.PI*2);mini.stroke();mini.fillStyle='#d0dfd0';mini.font='7px monospace';mini.fillText(contact.label,contact.x*sx+8,contact.z*sz+2);mini.strokeStyle='#f1d3a299';mini.strokeRect((focus.x-zoom*.4)*sx,(focus.z-zoom*.34)*sz,zoom*.8*sx,zoom*.68*sz);
}

const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);let pointerDown=null,dragging=false,keys=new Set(),cursorOrderMode=false;

function pointerGround(event){pointer.set(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);const p=new THREE.Vector3();raycaster.ray.intersectPlane(groundPlane,p);p.x=THREE.MathUtils.clamp(p.x,0,mapSize());p.z=THREE.MathUtils.clamp(p.z,0,mapSize());return p;}

function pickEntity(event){let best=null,score=Infinity;for(const e of state?.entities||[]){if(e.hp<=0||!entities.get(e.id)?.visible)continue;const v=entities.get(e.id).position,p=project(v.x,e.type==='mech'?6:e.type==='pod'?5:1,v.z);let rx=e.type==='mech'?34:e.type==='pod'||e.type==='hive'?45:22,ry=rx;

 if(e.type==='mech'){const top=project(v.x,12,v.z),bottom=project(v.x,0,v.z),left=project(v.x-6,6,v.z),right=project(v.x+6,6,v.z);rx=Math.max(rx,Math.abs(right.x-left.x)*.55);ry=Math.max(ry,Math.abs(top.y-bottom.y)*.55);}

 const d=Math.hypot((p.x-event.clientX)/rx,(p.y-event.clientY)/ry);if(d<1&&d<score){best=e;score=d;}}return best;}

function selectedUnits(){return state?.entities.filter(e=>selected.has(e.id)&&e.hp>0&&controlled(e)&&['mech','worker'].includes(e.type))||[];}

function issueContext(target,p){const result=contextualOrder(selectedUnits(),target,p,state?.deposits||[]);if(!result)return false;command(result);addMoveMarker(p.x,p.z);return true;}

function orderAt(event){if(!gameStarted||introActive())return;const p=pointerGround(event);if(!issueContext(pickEntity(event),p))toast('Select a mech or worker first.');}

function primaryAt(target,p,inspect=false){if(!inspect&&selectedUnits().length&&(!target||!['mech','worker'].includes(target.type))&&issueContext(target,p))return;if(target)selectIds([target.id]);else selectIds([]);}

function addMoveMarker(x,z){const o=ring(2,0xffd395);o.position.set(x,.3,z);scene.add(o);effects.push({object:o,ttl:.8,max:.8});}

const ghost=ring(3,0xffbf69);scene.add(ghost);ghost.visible=false;const placementFootprint=new THREE.Line(new THREE.BufferGeometry().setFromPoints([[-8,0,-7],[8,0,-7],[8,0,7],[-8,0,7],[-8,0,-7]].map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:0xffbf69}));scene.add(placementFootprint);placementFootprint.visible=false;const launchPreview=new THREE.Line(new THREE.BufferGeometry().setFromPoints([[-7,0,0],[-7,0,26.5],[7,0,26.5],[7,0,0]].map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:0x9bdfb9}));scene.add(launchPreview);launchPreview.visible=false;const launchMarker=ring(2,0x9bdfb9,.6);scene.add(launchMarker);launchMarker.visible=false;const powerPreview=ring(1,0x9bdfb9,.28);scene.add(powerPreview);powerPreview.name='Selected power radius';powerPreview.visible=false;

function setPlacement(kind){if(kind==='wire'&&state?.mission)return;placement=kind;document.querySelectorAll('[data-build]').forEach(b=>b.classList.toggle('active',b.dataset.build===kind));$('hvd').classList.toggle('active',kind==='hvd');$('action-hint').textContent=kind?`${kind==='hvd'?'Target within 65m of your mech':kind==='extractor'?'Place on any mineral deposit; a worker assembles it':'Place within sight and 36m of HQ or your mech'}. ${controllerActive?'A confirms; B cancels':'Click confirms; ESC cancels'}.`:'Right click a deposit to mine. Right click an enemy to attack.';ghost.visible=!!kind;placementFootprint.visible=false;powerPreview.visible=false;ghost.scale.setScalar(kind==='hvd'?4:kind==='wire'?1.5:['repair-station','upgrade-station'].includes(kind)?3.6:1);}

renderer.domElement.addEventListener('pointerdown',e=>{if(introActive()||!$('economy-modal').hidden)return;pointerDown={x:e.clientX,y:e.clientY,button:e.button};dragging=false;});

renderer.domElement.addEventListener('pointermove',e=>{if(introActive()||!$('economy-modal').hidden)return;aimPoint=pointerGround(e);ghost.position.set(aimPoint.x,.2,aimPoint.z);if(pointerDown&&(e.buttons===4||e.buttons===1&&e.altKey)){const dx=e.clientX-pointerDown.x,dy=e.clientY-pointerDown.y;const panScale=zoom/94;focus.x-=(dx*.09+dy*.07)*panScale;focus.z+=(dx*.06-dy*.1)*panScale;pointerDown.x=e.clientX;pointerDown.y=e.clientY;dragging=true;}});

renderer.domElement.addEventListener('pointerup',e=>{if(introActive()||!$('economy-modal').hidden||!pointerDown)return;const moved=Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)>8;pointerDown=null;if(dragging||moved)return;if(e.button===2){setPlacement(null);orderAt(e);return;}if(e.button!==0||!gameStarted||!$('economy-modal').hidden)return;

 if(placement){const p=pointerGround(e);if(placement==='hvd')command({type:'hvd',x:p.x,z:p.z});else command({type:'build',kind:placement,x:p.x,z:p.z});if(!e.shiftKey)setPlacement(null);return;}

 if(cursorOrderMode){orderAt(e);return;}

 const entity=pickEntity(e);if(e.shiftKey&&entity)selectIds([entity.id],true);else primaryAt(entity,pointerGround(e),e.altKey);

});

renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());

renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();if(introActive()||!$('economy-modal').hidden)return;zoom=THREE.MathUtils.clamp(zoom+e.deltaY*.045,TACTICAL_CAMERA.minZoom,TACTICAL_CAMERA.maxZoom);},{passive:false});

window.addEventListener('keydown',e=>{if(e.target.matches('input')||e.ctrlKey||e.metaKey)return;if(introActive()){if(e.repeat)return;if(e.key==='Escape'){e.preventDefault();if(!$('help-modal').hidden)$('help-modal').hidden=true;else skipIntro();}if(e.key.toLowerCase()==='p'&&playerId!==2)send('pause');return;}keys.add(e.key.toLowerCase());if(e.key==='Escape'){setPlacement(null);$('help-modal').hidden=true;closeEconomy();return;}if(!$('economy-modal').hidden){keys.clear();const k=e.key.toLowerCase();if(k==='tab'){e.preventDefault();const controls=visibleControls($('economy-modal'));focusControl(controls[wrapIndex(controls.indexOf(document.activeElement),e.shiftKey?-1:1,controls.length)]);return;}e.preventDefault();if(e.repeat)return;if(k==='y'){closeEconomy();return;}if(k==='p'&&playerId!==2)send('pause');const controls=visibleControls($('economy-modal')),index=controls.indexOf(document.activeElement),delta=['arrowright','arrowdown'].includes(k)?1:['arrowleft','arrowup'].includes(k)?-1:0;if(delta)focusControl(controls[wrapIndex(index,delta,controls.length)]);if((k==='enter'||k===' ')&&controls.includes(document.activeElement))document.activeElement.click();return;}if(!gameStarted)return;

 const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(k==='y'){if(!e.repeat)openEconomy();return;}if(e.repeat&&['4','r','t','e','f','b','h','p'].includes(k))return;if(k==='1')selectIds(['mech-1']);if(k==='2')selectIds(['mech-2']);if(k==='3')selectWorkers();if(k==='4'){const producer=state.entities.find(e=>selected.has(e.id)&&['pod','worker-factory'].includes(e.type));if(producer)command(producer.type==='pod'?{type:'worker'}:{type:'worker',factoryId:producer.id});else toast('Select HQ or a worker factory to train workers.');}if(k==='r')repair();if(k==='t')setPlacement('turret');if(k==='e')setPlacement('extractor');if(k==='f')setPlacement('repair-station');if(k==='b'&&!state.mission)setPlacement('wire');if(k==='h')setPlacement('hvd');if(k===' ')focus.set(30,0,120);if(k==='p')send('pause');});

window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());

function selectWorkers(){selectIds(state?.entities.filter(e=>e.type==='worker').map(e=>e.id)||[]);}

function repair(){const ids=state?.entities.filter(e=>selected.has(e.id)&&e.type==='mech').map(e=>e.id)||[];if(ids.length)command({type:'repair',ids});}

$('leave-lobby').onclick=leaveRoom;$('leave-game').onclick=leaveRoom;

$('intro-leave').onclick=leaveRoom;$('intro-skip').onclick=skipIntro;$('intro-pause').onclick=()=>send('pause');

$('solo').onclick=()=>connect({type:'create',mode:'solo',map:$('map-choice').value||'frontier-768'});$('host').onclick=()=>connect({type:'create',mode:'coop',map:$('map-choice').value||'frontier-768'});$('join').onclick=()=>{const code=$('room-code').value.trim();if(code.length!==6){toast('Enter a six-character room code.');return;}connect({type:'join',code});};$('launch').onclick=()=>{unlockAudio();send('start');};$('quality').onclick=()=>{lowGraphics=!lowGraphics;renderer.shadowMap.enabled=!lowGraphics;resize();$('quality').textContent=lowGraphics?'LOW FX':'HIGH FX';};$('quality').textContent=lowGraphics?'LOW FX':'HIGH FX';$('sound').onclick=()=>{unlockAudio();soundEnabled=!soundEnabled;gatlingAudio?.setEnabled(soundEnabled);musicPlayer.setMasterEnabled(soundEnabled);$('sound').textContent=soundEnabled?'SOUND ON':'SOUND OFF';$('sound').setAttribute('aria-label',soundEnabled?'Mute sound':'Enable sound');};$('pause').onclick=()=>send('pause');$('help').onclick=()=>$('help-modal').hidden=false;$('close-help').onclick=()=>$('help-modal').hidden=true;$('repair').onclick=repair;$('select-workers').onclick=selectWorkers;$('center-base').onclick=()=>focus.set(30,0,120);document.querySelectorAll('[data-build]').forEach(b=>b.onclick=()=>setPlacement(b.dataset.build));$('add-worker').onclick=()=>command({type:'worker'});$('hvd').onclick=()=>setPlacement('hvd');$('focus-objective').onclick=focusObjective;$('restart').onclick=()=>{$('end-screen').hidden=true;send('restart');};

// Controller UI is separate from world input. A held button never repeats purchases.

const readGamepad=createGamepadReader();let controllerActive=false,controllerUI=false,padWasConnected=false,rawInputEnabled=true,rawInputArmed=true;

$('music').onclick=()=>{musicPlayer.unlock();$('help-modal').hidden=false;$('music-retry').focus();};
$('music-toggle').onclick=()=>{musicPlayer.setEnabled(!musicPlayer.enabled);musicPlayer.unlock();};
$('music-volume').oninput=()=>{musicPlayer.setVolume(Number($('music-volume').value)/100);musicPlayer.unlock();};
$('music-quieter').onclick=()=>{musicPlayer.setVolume(musicPlayer.volume-.1);musicPlayer.unlock();};
$('music-louder').onclick=()=>{musicPlayer.setVolume(musicPlayer.volume+.1);musicPlayer.unlock();};
$('music-next').onclick=()=>{musicPlayer.next();musicPlayer.unlock();};
$('music-retry').onclick=()=>musicPlayer.retry();
updateMusicUI();

function visibleControls(root){return [...root.querySelectorAll('button,input')].filter(e=>!e.disabled&&e.getClientRects().length);}

function focusControl(el){document.querySelectorAll('.pad-focus').forEach(e=>e.classList.remove('pad-focus'));if(el){el.classList.add('pad-focus');el.focus({preventScroll:true});el.scrollIntoView({block:'nearest'});}}

function closeControllerUI(){controllerUI=false;document.querySelectorAll('.pad-focus').forEach(e=>e.classList.remove('pad-focus'));document.activeElement?.blur();}

function openCodeKeyboard(){ $('code-keyboard').hidden=false;focusControl($('code-keys').firstElementChild);updateCodeDisplay(); }

function updateCodeDisplay(){$('code-preview').textContent=$('room-code').value.toUpperCase().padEnd(6,'_');}

for(const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'){const button=document.createElement('button');button.textContent=char;button.onclick=()=>{if($('room-code').value.length<6)$('room-code').value+=char;updateCodeDisplay();};$('code-keys').appendChild(button);}

$('code-delete').onclick=()=>{$('room-code').value=$('room-code').value.slice(0,-1);updateCodeDisplay();};

$('code-done').onclick=()=>{$('code-keyboard').hidden=true;focusControl($('join'));};

function cycleUnit(delta){const units=state.entities.filter(e=>e.hp>0&&controlled(e)&&['mech','worker'].includes(e.type));const current=units.findIndex(e=>selected.has(e.id));const unit=units[wrapIndex(current,delta,units.length)];if(unit){selectIds([unit.id]);aimPoint.set(unit.x,0,unit.z);focus.copy(aimPoint);}}

function controllerTarget(){let best=null,distance=Infinity;for(const e of state.entities){if(e.hp<=0||!entities.get(e.id)?.visible)continue;const v=entities.get(e.id).position,d=Math.hypot(v.x-aimPoint.x,v.z-aimPoint.z),radius=e.type==='pod'?10:e.type==='hive'?13:5;if(d<radius&&d<distance){best=e;distance=d;}}return best;}

function controllerOrder(){if(!issueContext(controllerTarget(),aimPoint))toast('Select a mech or worker first.');}

let controllerDiagnostic={code:'checking',message:'Checking controller access…'};

function checkController(){

 let pads=[],errorName=null,policyAllowed=null;

 const policy=document.permissionsPolicy||document.featurePolicy;

 policyAllowed=gamepadPolicyAllowed(policy);

 const supported=typeof navigator.getGamepads==='function';

 if(supported){try{pads=navigator.getGamepads();}catch(error){errorName=error?.name||'Error';}}

 const result=diagnoseController({supported,secure:window.isSecureContext,policyAllowed,errorName,pads});

 const message=result.code==='ready'&&!rawInputEnabled?'Standard controller detected; gamepad input is OFF for this page. Browser cursor remains available.':result.code==='ready'&&controllerActive?'Controller input active · Y actions · on-screen Help / Pause available.':result.message;

 if($('controller-status').textContent!==message){$('controller-status').textContent=message;$('controller-diagnostic').textContent=message;}

 controllerDiagnostic=result;return {pads:result.code==='ready'?pads:[],diagnostic:result};

}

$('check-controller').onclick=()=>{window.focus();checkController();$('controller-check-note').textContent='Checked this page. This button cannot switch Edge mode or change browser permissions.';};

function applyInputMode(mode){

 ({rawInputEnabled,cursorOrderMode}=setInputMode({rawInputEnabled,cursorOrderMode},mode));

 $('raw-controller').textContent=rawInputEnabled?'GAMEPAD INPUT: ON':'GAMEPAD INPUT: OFF';$('raw-controller').setAttribute('aria-pressed',String(rawInputEnabled));

 $('cursor-order').textContent=cursorOrderMode?'CURSOR: ORDER':'CURSOR: SELECT';$('cursor-order').setAttribute('aria-pressed',String(cursorOrderMode));

 controllerActive=false;rawInputArmed=!rawInputEnabled;closeControllerUI();readGamepad([]);setPlacement(null);checkController();

}

$('raw-controller').onclick=()=>{applyInputMode(rawInputEnabled?'gamepad-off':'gamepad-on');toast(rawInputEnabled?'Gamepad input on; cursor mode reset to SELECT. Edge browser mode is unchanged.':'Gamepad input off for this page. Browser-cursor controls remain available.');};

$('raw-controller-help').onclick=()=>$('raw-controller').click();

$('cursor-order').onclick=()=>{applyInputMode(cursorOrderMode?'cursor-select':'cursor-order');toast(cursorOrderMode?'Cursor orders on; raw gamepad input off to avoid duplicate commands. Click terrain, enemies or alloy.':'Click a mech or worker to select it.');};

for(const button of document.querySelectorAll('[data-pan]'))button.onclick=()=>{const [x,z]=({up:[-.65,-.85],down:[.65,.85],left:[-.85,.65],right:[.85,-.65]})[button.dataset.pan];focus.x=THREE.MathUtils.clamp(focus.x+x*12,0,mapSize());focus.z=THREE.MathUtils.clamp(focus.z+z*12,0,mapSize());};

$('zoom-in').onclick=()=>zoom=THREE.MathUtils.clamp(zoom-12,TACTICAL_CAMERA.minZoom,TACTICAL_CAMERA.maxZoom);

$('zoom-out').onclick=()=>zoom=THREE.MathUtils.clamp(zoom+12,TACTICAL_CAMERA.minZoom,TACTICAL_CAMERA.maxZoom);

function updateController(dt){

 const {pads}=checkController();const input=readGamepad(rawInputEnabled?pads:[]);

 if(input&&!rawInputArmed){if(!input.held.size&&!input.lx&&!input.ly&&!input.rx&&!input.ry&&!input.zoom)rawInputArmed=true;return;}

 if(!input){if(padWasConnected){controllerActive=false;closeControllerUI();}padWasConnected=false;return;}

 padWasConnected=true;

 if(!controllerActive&&!input.held.size&&!input.lx&&!input.ly&&!input.rx&&!input.ry&&!input.zoom)return;

 if(!controllerActive){controllerActive=true;if(!gameStarted)focusControl(visibleControls($('lobby'))[0]);}

 const p=input.pressed;

 if(introActive()&&$('help-modal').hidden&&!p.has('view')){

  const controls=visibleControls($('landing-intro')),index=controls.indexOf(document.activeElement),delta=p.has('right')||p.has('down')?1:p.has('left')||p.has('up')?-1:0;

  if(delta)focusControl(controls[index<0?0:wrapIndex(index,delta,controls.length)]);

  if(p.has('a')&&controls.includes(document.activeElement))document.activeElement.click();

  if(p.has('b'))skipIntro();if(p.has('menu')&&playerId!==2)send('pause');return;

 }

 if(p.has('view')){$('help-modal').hidden=!$('help-modal').hidden;if(!$('help-modal').hidden)focusControl($('close-help'));else closeControllerUI();return;}

 if(p.has('menu')&&gameStarted&&playerId!==2)send('pause');

 let modal=!$('code-keyboard').hidden?$('code-keyboard'):!$('help-modal').hidden?$('help-modal'):!$('economy-modal').hidden?$('economy-modal'):!$('end-screen').hidden?$('end-screen'):!$('lobby').hidden?$('lobby'):null;

 if(p.has('y')&&(!modal||modal===$('economy-modal'))){if(modal)closeEconomy();else {controllerUI=!controllerUI;if(controllerUI)focusControl(visibleControls($('selection-actions'))[0]);}return;}

 if(p.has('b')){if(!$('code-keyboard').hidden){$('code-done').click();return;}if(!$('help-modal').hidden){$('help-modal').hidden=true;closeControllerUI();return;}if(!$('economy-modal').hidden){closeEconomy();return;}if(placement)setPlacement(null);else if(controllerUI)closeControllerUI();else selectIds([]);return;}

 if(modal||controllerUI){

  const controls=visibleControls(modal||$('selection-actions'));let index=controls.indexOf(document.activeElement);if(index<0){index=0;focusControl(controls[0]);}

  const grid=modal===$('code-keyboard');const delta=p.has('right')||p.has('rb')?1:p.has('left')||p.has('lb')?-1:p.has('down')?(grid?6:1):p.has('up')?(grid?-6:-1):0;

  if(delta)focusControl(controls[wrapIndex(index,delta,controls.length)]);

  if(p.has('a')){const control=document.activeElement;if(control===$('room-code'))openCodeKeyboard();else if(controls.includes(control)){control.click();if(gameStarted&&controllerUI){closeControllerUI();}else if(modal&&!modal.hidden&&!modal.contains(document.activeElement))focusControl(visibleControls(modal)[0]);}}

  return;

 }

 if(!gameStarted)return;

 const speed=zoom*.48*dt;aimPoint.x=THREE.MathUtils.clamp(aimPoint.x+(input.lx*.85+input.ly*.65)*speed,0,mapSize());aimPoint.z=THREE.MathUtils.clamp(aimPoint.z+(-input.lx*.65+input.ly*.85)*speed,0,mapSize());

 focus.x+=(input.rx*.85+input.ry*.65)*speed;focus.z+=(-input.rx*.65+input.ry*.85)*speed;zoom=THREE.MathUtils.clamp(zoom+input.zoom*50*dt,TACTICAL_CAMERA.minZoom,TACTICAL_CAMERA.maxZoom);

 ghost.position.set(aimPoint.x,.2,aimPoint.z);

 if(p.has('lb'))cycleUnit(-1);if(p.has('rb'))cycleUnit(1);

 if(p.has('left'))selectIds(['mech-1']);if(p.has('right'))selectIds(['mech-2']);if(p.has('up'))selectWorkers();if(p.has('down')){focus.set(30,0,120);aimPoint.copy(focus);selectIds(['pod']);}

 if(p.has('a')){if(placement){command(placement==='hvd'?{type:'hvd',x:aimPoint.x,z:aimPoint.z}:{type:'build',kind:placement,x:aimPoint.x,z:aimPoint.z});setPlacement(null);}else{primaryAt(controllerTarget(),aimPoint);}}

 if(p.has('x')&&!placement)primaryAt(controllerTarget(),aimPoint,true);

}

let economyTab='build',structureSignature='',mechSignature='',factorySignature='';

let chosenMechFactory=null;

function mechLabel(e){return `${e.role==='artillery'?'Artillery':e.role==='combat'?'Vanguard':'Lancer'} · ${e.id} · ${e.owner===0?'shared':`pilot ${e.owner}`}`;}

function productionText(e){if(e?.launchId)return 'LAUNCHING MECH · clear apron · committed, cannot cancel';const j=e?.production;if(!j)return 'Idle';return `${j.kind||j.type||'worker'} ${Math.floor((j.progress||0)*100)}% · ${j.blocked||e.status==='production-blocked'?'EXIT BLOCKED: move units away':e.powered===false?'PAUSED: restore power':`${Math.ceil((1-(j.progress||0))*(j.duration||0))}s remaining`}`;}

function mechFactory(){const all=state.entities.filter(e=>e.hp>0&&e.type==='mech-factory');return all.find(e=>e.id===chosenMechFactory)||all.find(e=>selected.has(e.id))||all.find(e=>e.powered&&!e.production)||all[0];}

const economyBuildButtons=new Map(),economyUpgradeButtons=new Map();

const buildingNotes={'drop-pad':'One artillery reinforcement / 15s powered charge / 12 power','mech-factory':'12m mech assembly · 24×24m footprint · 16 power',extractor:'Boosts worker mining · 4 power',turret:'Defends automatically · 6 power','repair-station':'Free repairs · 16×14m pad · 6 power',generator:'18 generation · 34m coverage',reactor:'44 generation · 38m coverage',relay:'Extends a connected grid · 30m reach',battery:'Stores 180 energy · 12 power output','worker-factory':'2m worker production · 30 alloy / 12s · 8 power','upgrade-station':'12m mech refit bay · 16×14m footprint · 10 power'};

function economySelectedMech(){return state?.entities.find(e=>e.hp>0&&e.type==='mech'&&controlled(e)&&selected.has(e.id));}

function economyFactory(){const factories=state?.entities.filter(e=>e.hp>0&&e.type==='worker-factory')||[];return factories.find(e=>selected.has(e.id))||factories.find(e=>e.powered&&!e.production)||factories.find(e=>e.powered)||factories[0]||null;}

function closeEconomy(){ $('economy-modal').hidden=true;closeControllerUI();keys.clear(); }

function switchEconomyTab(tab){economyTab=tab;for(const name of ['build','upgrades','power']){$('economy-'+name).hidden=name!==tab;$('economy-tab-'+name).setAttribute('aria-selected',String(name===tab));}renderEconomy();}

function openEconomy(tab=economyTab){if(!gameStarted||introActive())return;setPlacement(null);keys.clear();controllerUI=false;$('economy-modal').hidden=false;switchEconomyTab(tab);focusControl($('economy-tab-'+tab));}

function chooseEconomyBuild(kind){const cost=buildingCost(state,kind);if(kind==='drop-pad'&&!artilleryAsset){toast('Artillery model is still loading. Please try again shortly.');return;}if(!affordable(state,cost)){toast('Need '+formatCost(cost)+'. Only delivered materials can be spent.');return;}closeEconomy();setPlacement(kind);}

for(const kind of ['extractor','repair-station','turret','generator','relay','battery','reactor','worker-factory','upgrade-station','mech-factory','drop-pad']){

 const button=document.createElement('button');button.id='economy-build-'+kind;button.onclick=()=>chooseEconomyBuild(kind);$('economy-build-list').appendChild(button);economyBuildButtons.set(kind,button);

}

for(const kind of ['mobility','armor','weapons']){

 const button=document.createElement('button');button.id='economy-upgrade-'+kind;button.onclick=()=>{const mech=economySelectedMech(),level=mech?.upgrades?.[kind]||0,spec=UPGRADES[kind].levels[level];if(!mech||!spec)return;if(!affordable(state,spec.cost)){toast('Need '+formatCost(spec.cost)+'.');return;}command({type:'upgrade',ids:[mech.id],kind});};$('economy-upgrade-list').appendChild(button);economyUpgradeButtons.set(kind,button);

}

for(const priority of ['defense','repair','production']){const button=document.createElement('button');button.id='economy-priority-'+priority;button.textContent=priority.toUpperCase()+' FIRST';button.onclick=()=>command({type:'power-priority',priority});$('economy-priorities').appendChild(button);}

for(const tab of ['build','upgrades','power'])$('economy-tab-'+tab).onclick=()=>switchEconomyTab(tab);

$('open-economy').onclick=()=>openEconomy();$('close-economy').onclick=closeEconomy;

$('economy-repair').onclick=()=>{repair();closeEconomy();};$('economy-hq-repair').onclick=()=>{const ids=state.entities.filter(e=>e.hp>0&&e.type==='mech'&&selected.has(e.id)&&controlled(e)).map(e=>e.id);if(ids.length)command({type:'repair',ids,targetId:'pod'});closeEconomy();};$('economy-select-workers').onclick=()=>{selectWorkers();closeEconomy();};$('economy-show-objective').onclick=()=>{focusObjective();closeEconomy();};



$('economy-cancel-upgrade').onclick=()=>{const mech=economySelectedMech();if(mech?.upgradeJob)command({type:'cancel-upgrade',ids:[mech.id]});};

$('economy-worker').onclick=()=>{const factory=economyFactory();if(factory)command({type:'worker',factoryId:factory.id});};$('economy-hq-worker').onclick=()=>command({type:'worker'});

for(const role of ['combat','long-range'])$('economy-produce-'+role).onclick=()=>{const f=mechFactory();if(f)command({type:'mech',factoryId:f.id,role});};

$('economy-cancel-production').onclick=()=>{const f=mechFactory();if(f)command({type:'cancel-production',factoryId:f.id});};

$('economy-cancel-worker').onclick=()=>{const f=economyFactory();if(f)command({type:'cancel-production',factoryId:f.id});};

$('economy-cancel-hq').onclick=()=>command({type:'cancel-production',factoryId:'pod'});

function renderEconomy(){

 if(!state)return;const stock=resourceBalance(state),power=state.power||{},enabled=!!state.economyVersion,mech=economySelectedMech();

 $('conductive').textContent=displayAmount(stock.conductive);$('crystals').textContent=displayAmount(stock.crystal);

 $('power-readout').textContent=enabled?`${Math.round(power.generation||0)} / ${Math.round(power.demand||0)}`:'—';

 $('power-state').textContent=!enabled?'LEGACY ROOM':power.unpowered?`${power.unpowered} OFFLINE · ${String(power.priority||'defense').toUpperCase()} FIRST`:`GRID ONLINE · ${displayAmount(power.stored)} STORED`;

 $('power-state').classList.toggle('power-warning',!!power.unpowered);

 $('economy-stock').textContent=enabled?`${displayAmount(stock.alloy)} alloy  ·  ${displayAmount(stock.conductive)} conductive  ·  ${displayAmount(stock.crystal)} crystals. Shared team stockpiles; delivered loads only.`:'Legacy room: the host must RESTART to activate the new economy. Existing mission rules are unchanged.';

 for(const [kind,button] of economyBuildButtons){if(!BUILDINGS[kind]){button.hidden=true;continue;}button.hidden=false;const cost=buildingCost(state,kind);button.textContent=`${BUILDINGS[kind].label.toUpperCase()}\n${formatCost(cost)}\n${buildingNotes[kind]}`;button.disabled=(!enabled&&!['extractor','repair-station','turret'].includes(kind))||(['mech-factory','drop-pad'].includes(kind)&&!state.productionVersion);button.classList.toggle('unaffordable',!affordable(state,cost));}

 const factory=economyFactory();$('economy-repair').disabled=!state.entities.some(e=>e.hp>0&&e.type==='mech'&&!e.launch&&selected.has(e.id));$('economy-hq-repair').disabled=$('economy-repair').disabled;$('economy-worker').textContent=factory?`TRAIN AT FACTORY · 30 ALLOY${factory.production?' · QUEUE BUSY':''}`:'FACTORY PRODUCTION · BUILD A FACTORY';$('economy-worker').disabled=!factory||!!factory.production||!factory.powered;$('economy-hq-worker').textContent=!state.entities.some(e=>e.hp>0&&e.type==='worker')&&state.resources<40?'HQ RESCUE WORKER · FREE':'TRAIN AT HQ · 40 ALLOY';

 $('economy-production-note').textContent=factory?`${buildingLabel(factory.type)}: ${factory.powered?'powered':'waiting for power'}. Production takes 12 seconds and pauses during an outage.`:'HQ emergency production is always available. If every worker is lost and you cannot afford one, the HQ supplies a rescue worker.';

 const mechs=state.entities.filter(e=>e.type==='mech'),ms=mechs.map(e=>e.id).join('|');

 if(ms!==mechSignature){mechSignature=ms;const list=$('economy-mech-list');list.replaceChildren();for(const e of mechs){const b=document.createElement('button');b.id='economy-'+e.id;b.onclick=()=>selectIds([e.id]);list.appendChild(b);}}

 for(const e of mechs){const b=$('economy-'+e.id);b.textContent=mechLabel(e)+(e.hp<=0?' · LOST':'');b.disabled=e.hp<=0||!controlled(e);b.classList.toggle('selected',e.id===mech?.id);}

 const factories=state.entities.filter(e=>e.type==='mech-factory'&&e.hp>0),fs=factories.map(e=>e.id).join('|');

 if(fs!==factorySignature){factorySignature=fs;const list=$('economy-foundries');list.replaceChildren();for(const e of factories){const b=document.createElement('button');b.id='economy-foundry-'+e.id;b.onclick=()=>{chosenMechFactory=e.id;renderEconomy();};list.appendChild(b);}}

 const foundry=mechFactory(),pending=foundry?.production,live=mechs.filter(e=>e.hp>0&&e.role!=='artillery').length,queued=factories.filter(e=>e.production).length;

 for(const e of factories){const b=$('economy-foundry-'+e.id);b.textContent=`${e.id} · ${Math.round(e.x)}, ${Math.round(e.z)} · ${productionText(e)}`;b.classList.toggle('selected',e.id===foundry?.id);}

 $('economy-mech-production').hidden=!state.productionVersion;

 $('economy-mech-status').textContent=!foundry?'Build a mech foundry in power coverage. Its assembly lane must remain clear.':`${productionText(foundry)}. ${live} active + ${queued} queued / ${PRODUCTION_RULES.mechCap} team mechs. New mechs belong to the pilot ordering them. ${pending?'Cancel refunds unused work.':''}`;

 for(const role of ['combat','long-range']){const b=$('economy-produce-'+role);b.textContent=`BUILD ${role==='combat'?'VANGUARD':'LANCER'} · ${formatCost(PRODUCTION_RULES.mechCost).toUpperCase()} · ${PRODUCTION_RULES.mechDuration}s`;b.disabled=!state.productionVersion||!foundry||!!pending||!!foundry.launchId||!foundry.powered||live+queued>=PRODUCTION_RULES.mechCap;b.classList.toggle('unaffordable',!affordable(state,PRODUCTION_RULES.mechCost));}

 $('economy-cancel-production').hidden=!pending;$('economy-cancel-production').disabled=!pending||!(playerId===0||pending.owner===playerId);

 const hq=state.entities.find(e=>e.type==='pod'&&e.hp>0);

 $('economy-hq-worker').disabled=!!hq?.production;

 if(state.productionVersion)$('economy-hq-worker').textContent=hq?.production?`HQ · ${productionText(hq)}`:$('economy-hq-worker').textContent+' · 30s';

 $('economy-cancel-worker').hidden=!state.productionVersion||!factory?.production;$('economy-cancel-hq').hidden=!state.productionVersion||!hq?.production;

 if(state.productionVersion)$('economy-production-note').textContent=`HQ: 40 alloy / 30s. Worker factory: 30 alloy / 12s. ${factory?productionText(factory)+'. ':''}Factory production pauses without power. If all workers are lost and funds are below 40 alloy, the HQ gives an immediate free rescue worker. Lost mechs can be replaced while HQ survives.`;

 if(enabled&&!state.productionVersion)$('economy-stock').textContent+=' This saved room uses the earlier mission. Host: RESTART for mech production and the hive campaign.';

 const stats=mech?mechStats(mech):null,job=mech?.upgradeJob;

 $('economy-upgrade-context').textContent=!enabled?'Restart this legacy room to unlock refits.':!mech?'Select your mech above. It will travel to an available powered upgrade station.':`${mechLabel(mech)} · ${stats.speed.toFixed(2)} m/s · ${Math.round(mech.maxHp)} hull · ${Math.round(stats.damageMultiplier*100)}% weapon output${mech.launch?' · LAUNCHING: refits and orders unlock after rollout':job?` · ${UPGRADES[job.kind]?.label||job.kind} ${Math.floor((job.progress||0)*100)}% (${mech.status})`:'. Select a refit. Travel and installation are server-controlled.'}`;

 for(const [kind,button] of economyUpgradeButtons){const level=mech?.upgrades?.[kind]||0,spec=UPGRADES[kind].levels[level];button.textContent=`${UPGRADES[kind].label.toUpperCase()} · ${spec?'TIER '+(level+1):'MAX TIER'}\n${spec?formatCost(spec.cost)+' · '+spec.duration+'s':'Installed'}\n${UPGRADES[kind].description}`;button.disabled=!enabled||!mech||!!mech.launch||!!job||!spec;button.classList.toggle('unaffordable',!!spec&&!affordable(state,spec.cost));}

 $('economy-cancel-upgrade').hidden=!job;$('economy-cancel-upgrade').disabled=!job;$('economy-cancel-upgrade').textContent='CANCEL REFIT · REFUND UNUSED WORK';

 $('economy-power-summary').textContent=enabled?`${Math.round(power.generation||0)} generation · ${Math.round(power.demand||0)} demand · ${Math.round(power.supplied||0)} supplied. Battery ${displayAmount(power.stored)} / ${power.capacity||0}. ${power.discharging?'Discharging '+Math.round(power.discharging)+' power.':power.charging?'Charging '+Math.round(power.charging)+' power.':''} ${power.unpowered||0} structure(s) offline.`:'Legacy room: power is not simulated. Restart to activate it.';

 for(const priority of ['defense','repair','production']){const button=$('economy-priority-'+priority);button.disabled=!enabled;button.setAttribute('aria-pressed',String(power.priority===priority));}

 const structures=state.entities.filter(e=>e.hp>0&&(BUILDINGS[e.type]||e.type==='pod')),signature=structures.map(e=>e.id).join('|');

 if(signature!==structureSignature){structureSignature=signature;const list=$('economy-structures');list.replaceChildren();for(const e of structures){const button=document.createElement('button');button.id='economy-structure-'+e.id;button.onclick=()=>{selectIds([e.id]);focus.set(e.x,0,e.z);aimPoint.copy(focus);};list.appendChild(button);}}

 for(const e of structures){const button=$('economy-structure-'+e.id);button.textContent=`${buildingLabel(e.type).toUpperCase()} · ${Math.round(e.x)}, ${Math.round(e.z)}\n${e.type==='pod'?'24 generation + emergency support':!enabled?'Legacy rules':e.powered?'ONLINE':e.powerConnected?'WAITING FOR POWER':'OUT OF GRID'}${e.powerDemand?' · '+e.powerDemand+' demand':''}${e.type==='battery'?' · '+displayAmount(e.energy)+' stored':''}${e.dropJob?' / CHARGING '+Math.floor(e.dropJob.progress*100)+'%':''}${e.summonedId?' / DELIVERED':''}${e.production?' · '+productionText(e):''}`;button.classList.toggle('selected',selected.has(e.id));}

 const inspected=structures.find(e=>selected.has(e.id));$('economy-inspect').textContent=inspected?`${buildingLabel(inspected.type)} selected. ${Math.ceil(inspected.hp)} / ${inspected.maxHp} HP. ${inspected.powerConnected===false?'Connect a relay chain or build a local generator.':inspected.powered===false?'Increase supply or change priority.':'Select a structure below to inspect and center it.'}`:'Select a structure to inspect its power state and center the camera.';

}



minimap.onclick=e=>{const r=minimap.getBoundingClientRect();focus.set((e.clientX-r.left)/r.width*mapSize(),0,(e.clientY-r.top)/r.height*mapSize());};

function resize(){renderer.setPixelRatio(Math.min(1,Math.sqrt((lowGraphics?1280*720:1920*1080)/(innerWidth*innerHeight))));renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();const overlayRatio=Math.min(1,Math.sqrt(1920*1080/(innerWidth*innerHeight)));overlay.width=Math.floor(innerWidth*overlayRatio);overlay.height=Math.floor(innerHeight*overlayRatio);ctx.setTransform(overlayRatio,0,0,overlayRatio,0,0);}window.addEventListener('resize',resize);resize();

const loader=new GLTFLoader();for(const [kind,url] of Object.entries(ALIEN_ASSETS))loader.load(url,asset=>{alienAssets[kind]=asset;for(const g of entities.values()){const e=g.userData.data;if(e?.type==='enemy'&&(e.role==='heavy'?'heavy':'runner')===kind)addAlienModel(g,e);}},undefined,error=>{console.warn('Alien model failed to load',kind,error);toast('Alien art failed to load: geometry fallback remains. Reload to retry.');});loader.load(new URL("../assets/artillery-v5-1-console.glb?v=5.1",import.meta.url).href,asset=>{artilleryAsset=asset;for(const g of entities.values())if(g.userData.data?.role==='artillery')addMechModel(g,g.userData.data);},undefined,()=>toast('Artillery art failed to load. Reload before testing the drop.'));loader.load(new URL("../assets/m06-console.glb?v=slower-walk-6",import.meta.url).href,gltf=>{modelAsset=gltf;for(const [id,g] of entities)if(g.userData.type==='mech')addMechModel(g,g.userData.data);console.info('M06 runtime loaded',gltf.animations.map(c=>c.name));},undefined,error=>{console.warn('Runtime mech asset not available; using clearly identified geometry proxy.',error);document.querySelector('.prototype-note').textContent='Early playable build · geometry proxy active · mech art not loaded';});

loader.load(new URL("../assets/ground-anchor-hq.glb?v=first-landing-1",import.meta.url).href,gltf=>{podAsset=gltf;for(const g of entities.values())if(g.userData.type==='pod')addPodModel(g);console.info('ANCHOR runtime loaded');},undefined,()=>console.info('ANCHOR geometry proxy active'));

loader.load(new URL("../assets/worker-rigged.glb?v=worker-remodel-2",import.meta.url).href,gltf=>{workerAsset=gltf;for(const g of entities.values())if(g.userData.type==='worker')addWorkerModel(g);},undefined,()=>toast('Worker art could not load. Reload to retry.'));

loader.load(new URL("../assets/alloy-extractor-console.glb?v=first-landing-1",import.meta.url).href,gltf=>{extractorAsset=gltf;for(const g of entities.values())if(g.userData.type==='extractor')addRiggedArt(g,gltf,'extractor');},undefined,()=>console.warn('Extractor asset unavailable; geometry fallback active.'));

loader.load(new URL("../assets/autocannon-sentry-console.glb?v=first-landing-1",import.meta.url).href,gltf=>{turretAsset=gltf;for(const g of entities.values())if(g.userData.type==='turret')addRiggedArt(g,gltf,'turret');},undefined,()=>console.warn('Sentry asset unavailable; geometry fallback active.'));

// An initial local scene is only a briefing backdrop. Gameplay is always server-authoritative.

state=createGame();syncMapPresentation();reconcile();updateHUD();

const clock=new THREE.Clock();function animate(){requestAnimationFrame(animate);frameNumber++;const rawDt=clock.getDelta(),dt=Math.min(rawDt,.1),now=clock.elapsedTime,paused=!!room?.paused,animationDt=paused?0:Math.min(rawDt,.5),renderTime=presentation.advance(rawDt,performance.now()/1000,paused);updateController(dt);

 musicPlayer.setActive(musicActive());
 const audible=audioAllowed();if(audioWasAllowed&&!audible)gatlingAudio?.stopAll({immediate:true});audioWasAllowed=audible;

 if(gameStarted&&!introActive()){const speed=zoom*.3*dt;if(keys.has('w')||keys.has('arrowup')){focus.x-=speed*.65;focus.z-=speed*.85;}if(keys.has('s')||keys.has('arrowdown')){focus.x+=speed*.65;focus.z+=speed*.85;}if(keys.has('a')||keys.has('arrowleft')){focus.x-=speed*.85;focus.z+=speed*.65;}if(keys.has('d')||keys.has('arrowright')){focus.x+=speed*.85;focus.z-=speed*.65;}}

 focus.x=THREE.MathUtils.clamp(focus.x,0,mapSize());focus.z=THREE.MathUtils.clamp(focus.z,0,mapSize());const cameraEase=cameraDampingAlpha(dt,{reducedMotion});cameraFocus.lerp(focus,cameraEase);cameraZoom+=(zoom-cameraZoom)*cameraEase;sampleTacticalCamera(cameraFocus.x,cameraFocus.z,cameraZoom,tacticalPose);camera.position.fromArray(tacticalPose.position);camera.lookAt(...tacticalPose.lookAt);

 if(placement&&state?.economyVersion&&BUILDINGS[placement]){const coverage=coverageStatus(state,placement,aimPoint,BUILDINGS);ghost.material.color.setHex(coverage.connected?0x9bdfb9:0xffa36f);powerPreview.visible=!!coverage.radius;powerPreview.position.set(aimPoint.x,.16,aimPoint.z);powerPreview.scale.setScalar(coverage.radius||1);$('action-hint').textContent=coverage.label+' '+(controllerActive?'A places · B cancels':'Click places · Esc cancels');}else{const node=state?.entities.find(e=>selected.has(e.id)&&e.hp>0&&(e.type==='pod'||BUILDINGS[e.type]?.radius));powerPreview.visible=!!node;if(node){powerPreview.position.set(node.x,.16,node.z);powerPreview.scale.setScalar(node.type==='pod'?36:BUILDINGS[node.type].radius);powerPreview.material.color.setHex(node.powerConnected===false?0xffa36f:0x9bdfb9);}ghost.material.color.setHex(0xffbf69);}

 const foundryPlacement=placement==='mech-factory',largePad=['repair-station','upgrade-station','mech-factory','drop-pad'].includes(placement);launchPreview.visible=launchMarker.visible=foundryPlacement&&!introActive();launchPreview.position.set(aimPoint.x,.19,aimPoint.z);launchMarker.position.set(aimPoint.x,.2,aimPoint.z+20);placementFootprint.scale.set(foundryPlacement?1.5:placement==='drop-pad'?22/16:1,1,foundryPlacement?24/14:placement==='drop-pad'?22/14:1);placementFootprint.visible=largePad&&!introActive();if(largePad){placementFootprint.position.set(aimPoint.x,.19,aimPoint.z);const clear=servicePlacementClear(state,placement,aimPoint);placementFootprint.material.color.setHex(clear?0xffbf69:0xef785d);ghost.visible=false;if(!clear)$('action-hint').textContent=foundryPlacement?'Keep the 24 × 24m foundry and its marked front launch lane clear.':'The full 16 × 14m pad and front access must stay clear of structures and deposits.';}else ghost.visible=!!placement;

 const landingActive=introActive(),introTime=landingActive?introPresentation.advance(rawDt,performance.now()/1000,paused||!connected):INTRO_DURATION,landing=sampleLanding(introTime,{reducedMotion});

 landingScene.update(introTime,{active:landingActive,settled:gameStarted&&!landingActive,reducedMotion});fogPlane.visible=gameStarted&&!landingActive;objectiveMarker.visible=gameStarted&&!landingActive&&!!state?.mission&&objectiveTarget(state).id!=='complete';

 if(landingActive){camera.position.fromArray(landing.camera.position);camera.lookAt(...landing.camera.lookAt);$('intro-caption').textContent=landing.caption;$('intro-progress').style.transform=`scaleX(${introTime/INTRO_DURATION})`;

  if(!paused&&connected&&introTime>=introSoundTime)for(const impact of LANDING_IMPACTS)if(impact>introSoundTime&&impact<=introTime)sound('explosion');introSoundTime=introTime;

 }

 for(const [id,g] of entities){

 const e=g.userData.data;if(!e)continue;const pose=g.userData.motion.sample(renderTime);if(!pose)continue;

 const distance=Math.hypot(pose.x-g.position.x,pose.z-g.position.z),speed=rawDt>0?distance/rawDt:0,oldAngle=g.rotation.y;

 if(!paused){g.position.x=pose.x;g.position.z=pose.z;if(g.userData.turretYaw){g.rotation.y=0;g.userData.turretYaw.rotation.z=dampAngle(g.userData.turretYaw.rotation.z,pose.angle,animationDt,{response:7,maxSpeed:3});}else if(!['pod','hive','wire'].includes(e.type))g.rotation.y=dampAngle(g.rotation.y,pose.angle,animationDt,{response:7,maxSpeed:e.type==='mech'?2.6:6});}

 if(e.type==='worker')g.visible=(e.hp>0||state.time-(e.deadAt??-99)<1.6)&&(!landingActive||landing.crewVisible);

 if(e.type==='mech')g.visible=(e.hp>0||(e.role==='artillery'&&state.time-(e.deadAt??-99)<5))&&(!landingActive||!['mech-1','mech-2'].includes(e.id)||sampleMechLanding(introTime,{impactTime:e.id==='mech-2'?11.2:10.5}).visible);

 g.position.y=e.type==='pod'&&landingActive?landing.hqOffsetY+(g.userData.deployAction?0:landing.hqProxyOffsetY):0;

 const selection=g.children.find(c=>c.userData.selection);if(selection)selection.visible=!landingActive&&selected.has(id)&&e.hp>0;

 if(e.type==='mech'&&e.role!=='artillery'){

  const teamBand=g.children.find(c=>c.userData.teamBand);if(teamBand)teamBand.visible=!landingActive;

  if(g.userData.landingPoseActive){g.userData.landingRig?.restorePlaybackPose();g.userData.landingPoseActive=false;}

  const blend=g.userData.locomotion?.update(paused?0:speed,animationDt),actions=g.userData.actions;

  if(blend){actions.Idle?.setEffectiveWeight(blend.idleWeight);actions.Walk?.setEffectiveWeight(blend.walkWeight).setEffectiveTimeScale(blend.timeScale);}

  g.userData.mixer?.update(animationDt);

  if(landingActive&&['mech-1','mech-2'].includes(e.id)){g.userData.landingRig?.capturePlaybackPose();const options={impactTime:e.id==='mech-2'?11.2:10.5},drop=g.userData.landingRig?g.userData.landingRig.apply(introTime,options):sampleMechLanding(introTime,options);g.position.y=drop.altitude;g.userData.landingPoseActive=true;}

  const motorOn=state.phase==='running'&&e.hp>0&&gameStarted&&connected&&Number.isFinite(e.gatlingStartedAt)&&renderTime>=e.gatlingStartedAt&&(e.gatlingEngaged||renderTime<(e.gatlingStoppedAt??-Infinity));

  if(motorOn){const spin=THREE.MathUtils.clamp((renderTime-e.gatlingStartedAt)/.55,0,1);g.userData.gatlingRotors?.start(renderTime,spin);if(audioAllowed())gatlingAudio?.start(id,{...gunMix(g),spin});else gatlingAudio?.stop(id);}

  else {g.userData.gatlingRotors?.stop();gatlingAudio?.stop(id);}

  const rotors=g.userData.gatlingRotors?.update(animationDt,renderTime);

  if(rotors)for(const side of ['L','R']){const blur=g.userData.rotorBlurs?.[side];if(blur){blur.material.opacity=rotorBlurOpacity(rotors[side].speed);blur.visible=blur.material.opacity>.001;}const binding=g.userData.rotorBindings?.[side];if(binding)binding.bone.quaternion.copy(binding.rest).multiply(rotorQuaternion.setFromAxisAngle(binding.axis,rotors[side].phase));}

 }

 if(g.userData.artilleryRig){const age=renderTime-(e.dropAt??-999),duration=e.dropDuration||6,dropping=age<duration;g.position.y=dropping?Math.pow(1-Math.max(0,age)/duration,2)*85:0;g.userData.artilleryRig.update({speed:paused?0:speed,dt:animationDt,time:renderTime,dead:e.hp<=0,dropping});}

 if(g.userData.dropPadArt){const arriving=state.entities.find(m=>m.id===e.summonedId);g.userData.dropPadArt.update({...e,landingAt:arriving?arriving.dropAt+(arriving.dropDuration||6):undefined},renderTime);}

 if(g.userData.foundryArt){const art=g.userData.foundryArt,job=e.production,producing=job?.kind==='mech'&&!e.launchId;

  if(producing&&modelAsset&&!g.userData.assemblyMech){const model=cloneSkeleton(modelAsset.scene),bounds=new THREE.Box3().setFromObject(model),scale=WORLD_SCALE.mechHeight/bounds.getSize(new THREE.Vector3()).y;model.scale.setScalar(scale);model.position.y=-bounds.min.y*scale;model.traverse(o=>{o.userData.sharedAsset=true;if(o.isMesh){o.castShadow=!lowGraphics;o.receiveShadow=true;}});const mixer=new THREE.AnimationMixer(model),idle=modelAsset.animations.find(c=>c.name==='Idle');if(idle){mixer.clipAction(idle).play();mixer.update(0);}mixer.stopAllAction();mixer.uncacheRoot(model);art.assemblySocket.add(model);g.userData.assemblyMech=model;}

  // A single cached, independent skeleton; authoritative progress drives tools, never wall time.

  art.update({producing,progress:job?.progress||0,powered:e.powered!==false});

 }

 if(g.userData.economyArt){const job=state.entities.find(m=>m.upgradeJob?.stationId===e.id)?.upgradeJob;g.userData.economyArt.update({...e,upgradeProgress:job?.progress},renderTime);}

 if(e.type==='worker'&&g.userData.mixer){g.position.y=0;const turnRate=animationDt?Math.atan2(Math.sin(g.rotation.y-oldAngle),Math.cos(g.rotation.y-oldAngle))/animationDt:0;const clip=e.hp<=0?'Shutdown':renderTime<(g.userData.hitUntil||0)?'HitReact':e.status==='idle'&&renderTime<(g.userData.bootUntil||0)?'BootUp':workerClip({...e,speed,turnRate});playWorker(g,clip,animationDt,speed);if(g.userData.payload)g.userData.payload.visible=e.cargo>.05&&e.hp>0;}

 if(e.type==='pod'&&g.userData.deployAction){const action=g.userData.deployAction;action.paused=false;g.userData.mixer.setTime(landingActive?landing.hqClipTime:action.getClip().duration);}

 if(g.userData.serviceArt){const active=state.entities.some(m=>m.type==='mech'&&m.hp>0&&m.status==='repairing'&&Math.hypot(m.x-e.x,m.z-e.z)<.5);g.userData.serviceArt.update(e,renderTime,active);}

 if(['extractor','turret'].includes(e.type)&&g.userData.mixer){g.userData.mixer.update(e.type==='extractor'&&e.progress<1?0:animationDt);if(g.userData.art)g.userData.art.scale.setScalar((g.userData.assetScale||1)*(e.type==='extractor'?Math.max(.15,e.progress??1):1));}

 g.userData.hiveArt?.update(e,state.phase==='won'?Math.max(renderTime,(e.deadAt||0)+3):renderTime,!paused||state.phase==='won');

 g.userData.alienRig?.update({speed,dt:animationDt,dead:e.hp<=0});

 if(!paused){if(e.type==='enemy')for(const [i,leg] of (g.userData.legs||[]).entries())leg.rotation.y=Math.sin(renderTime*9+i*2)*.4;}

 }

 if(!paused)while(pendingEffects.length&&pendingEffects[0].time<=renderTime)addEffect(pendingEffects.shift(),renderTime);

 for(let i=effects.length-1;i>=0;i--){const fx=effects[i];if(fx.bornFrame!==frameNumber)fx.ttl-=animationDt;if(fx.ttl<=0){scene.remove(fx.object);fx.object.geometry?.dispose();fx.object.material?.dispose();effects.splice(i,1);continue;}fx.object.material.opacity=Math.max(0,fx.ttl/fx.max);if(fx.object.userData.expand)fx.object.scale.setScalar((1-fx.ttl/fx.max)*fx.object.userData.expand+.1);}

 renderer.render(scene,camera);drawOverlay();}

animate();

const saved=sessionStorage.getItem('mech-rts-pages-session-v1');if(saved){try{const {code,token}=JSON.parse(saved);connect({type:'join',code,token});}catch{sessionStorage.removeItem('mech-rts-pages-session-v1');}}

// Inspection hook has no mutation or debug commands; used by browser integration checks.

window.frontierDemo={getState:()=>state,getRoom:()=>room,getSelection:()=>[...selected],getDiagnostics:()=>({mapId:state?.mapId||'training-160',mapSize:mapSize(),terrain:basinTerrain.diagnostics(),artilleryLoaded:!!artilleryAsset,artillery:[...entities.values()].filter(g=>g.userData.artilleryRig).map(g=>({id:g.userData.entityId,y:g.position.y,...g.userData.artilleryRig.diagnostics()})),productionBuild:'orbital-artillery-1',foundries:[...entities.values()].filter(g=>g.userData.foundryArt).map(g=>({id:g.userData.entityId,...g.userData.foundryArt.diagnostics(),assemblyModel:!!g.userData.assemblyMech})),economyBuild:'powered-frontier-1',scaleBuild:'twelve-metre-2',terrainCleared:{rocks:rockInstances.userData.clearedInstances||0,trees:treeInstances.userData.clearedInstances||0},worldScale:WORLD_SCALE,camera:{zoom:cameraZoom,targetZoom:zoom,position:camera.position.toArray(),lookAt:[...tacticalPose.lookAt]},economyMenuOpen:!$('economy-modal').hidden,introBuild:'formation-and-mech-drop-2',introActive:introActive(),introTime:introPresentation.time,introEffects:landingScene.diagnostics(),reducedMotion,animationBuild:'slower-walk-6',weaponBuild:'user-recording-gatlings-3',audio:gatlingAudio?.getDiagnostics()||null,music:musicPlayer.diagnostics(),modelLoaded:!!modelAsset,podLoaded:!!podAsset,workerLoaded:!!workerAsset,extractorLoaded:!!extractorAsset,turretLoaded:!!turretAsset,missionBuild:'first-landing-1',workerBuild:'reference-remodel-2',workerClips:workerAsset?.animations.map(c=>c.name)||[],workerAnimation:[...entities.values()].filter(g=>g.userData.type==='worker').map(g=>({id:g.userData.entityId,clip:g.userData.clip})),lowGraphics,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,connected,controllerActive,presentationTime:presentation.time,presentationDelay:presentation.delay,animation: [...entities.values()].filter(g=>g.userData.type==='mech').map(g=>({id:g.userData.entityId,x:g.position.x,z:g.position.z,angle:g.rotation.y,walkWeight:g.userData.locomotion?.weight,walkRate:g.userData.locomotion?.rate,mixerTime:g.userData.mixer?.time,fireActive:['Fire_L','Fire_R'].some(n=>g.userData.actions?.[n]?.isRunning()),fireLeft:g.userData.actions?.Fire_L?.isRunning(),fireRight:g.userData.actions?.Fire_R?.isRunning(),lastPresentedShot:g.userData.lastPresentedShot,rotorSpeeds:g.userData.gatlingRotors?{L:g.userData.gatlingRotors.sides.L.speed,R:g.userData.gatlingRotors.sides.R.speed}:null})),presentedShots:gatlingShots.history.map(s=>({...s})),controllerDiagnostic:{...controllerDiagnostic},cursorOrderMode,rawInputEnabled,pixelRatio:renderer.getPixelRatio(),geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,consoleProfile:graphicsProfile.console})};



var selectionSignature;

function renderSelectionActions(){

 const chosen=state.entities.filter(e=>selected.has(e.id)&&e.hp>0),single=chosen.length===1?chosen[0]:null;

 const actions=selectionActions(chosen);if(chosen.length||placement)actions.push('clear');const signature=actions.join('|')+':'+(single?.id||'')+':'+(placement||'');

 if(signature!==selectionSignature){selectionSignature=signature;const box=$('selection-actions');box.replaceChildren();

 for(const action of actions){const b=document.createElement('button');b.dataset.action=action;b.id='context-'+action;const labels={clear:placement?'CANCEL':'CLEAR',build:'BUILD',worker:'TRAIN WORKER',combat:'BUILD VANGUARD','long-range':'BUILD LANCER',cancel:'CANCEL QUEUE',repair:'REPAIR',upgrades:'UPGRADES',power:'POWER',objective:'MISSION',hq:'HQ'};b.textContent=labels[action];b.onclick=()=>{

 if(action==='clear'){setPlacement(null);selectIds([]);closeControllerUI();}else if(action==='build')openEconomy('build');else if(action==='power')openEconomy('power');else if(action==='upgrades')openEconomy('upgrades');else if(action==='repair')repair();else if(action==='objective'){$('objective').classList.toggle('expanded');focusObjective();}else if(action==='hq')selectIds(['pod']);else if(single){if(action==='worker')command(single.type==='pod'?{type:'worker'}:{type:'worker',factoryId:single.id});else if(action==='cancel')command({type:'cancel-production',factoryId:single.id});else command({type:'mech',factoryId:single.id,role:action});}};box.appendChild(b);}}

 for(const b of $('selection-actions').children){const a=b.dataset.action;b.disabled=['worker','combat','long-range'].includes(a)&&!!(single?.production||single?.launchId||single?.powered===false);if(a==='cancel')b.disabled=!single?.production||(playerId&&single.production.owner!==0&&single.production.owner!==playerId);if(a==='worker'){b.title=single?.type==='pod'?$('economy-hq-worker').textContent:$('economy-worker').textContent;b.textContent=b.title.includes('FREE')?'WORKER · FREE':`WORKER · ${single?.type==='pod'?40:30}A`;}if(a==='combat'||a==='long-range'){b.title=$('economy-produce-'+a).textContent;b.textContent=a==='combat'?'VANGUARD':'LANCER';}}

 document.body.classList.toggle('controller-playing',controllerActive);$('context-hint').textContent=placement?'A / click: place · B / Esc: cancel':selectedUnits().length?'A: order  ·  X: inspect  ·  Y: actions  ·  B: clear':'A: select  ·  Y: actions  ·  D-pad: units';if($('selection-actions').contains(document.activeElement)&&document.activeElement.title)$('context-hint').textContent=document.activeElement.title;

}

$('objective').onclick=()=>$('objective').classList.toggle('expanded');



}



