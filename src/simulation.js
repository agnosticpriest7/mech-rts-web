import { FRONTIER_MAP, mapForState, terrainPointClear, terrainSegmentClear, findTerrainRoute } from './frontier-map.js';
import {PRODUCTION_RULES,BUILDINGS,UPGRADES,buildingCost,canAfford,spend,costLabel,mechStats,updatePower} from './economy-rules.js';
/** Deterministic host-authoritative simulation. Seconds, metres, x/z ground plane.
 * step accepts 0..60 seconds and advances in fixed 50ms ticks; snapshots are copies.
 * No wall clock, randomness, dependencies or client trust. */
export const RULES = Object.freeze({worldSize:160, tick:0.05, mechSpeed:4.32, workerSpeed:1.7, carrySpeed:1.0, workPhaseSeconds:1.2, workerApproachRadius:6.5, gatlingSpoolSeconds:0.55, turretCost:70, repairStationCost:50, repairStationCap:3, extractorCost:60, wireCost:20, workerCost:40, workerCap:8, turretCap:8, wireCap:16, hvdCooldown:90, waveTimes:[225]});
export const worldSize=s=>s?.worldSize||RULES.worldSize;
const bodyRadius=e=>e.type==='mech'?6:e.type==='worker'?1:1.5;
const clearSight=(s,a,b)=>terrainSegmentClear(mapForState(s),a,b,0);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const live=e=>!!e&&e.hp>0;
const dropping=(s,e)=>e.dropAt!==undefined&&s.time<e.dropAt+e.dropDuration-1e-9;
const hostile=e=>e.type==='enemy'||e.type==='hive';
// Ten synchronized paired volleys per second. The pair shares one damage budget,
// preserving existing sustained DPS (19/.60 and 38/1.50), not doubling balance.
const GATLING_INTERVAL=0.1;
const gatlingDamage=e=>(e.role==='long-range'?38/15:19/6)*mechStats(e).damageMultiplier;
const visionRadius=e=>e.type==='pod'?34:e.type==='worker'?18:['mech','turret'].includes(e.type)?28:0;
export function teamVisible(s,target){return s.entities.some(e=>live(e)&&!dropping(s,e)&&visionRadius(e)>0&&dist(e,target)<=visionRadius(e));}
// Presentation dimensions in metres. Only service-pad placements use the new
// rectangle clearance; legacy rooms and unrelated building rules stay unchanged.
export const SERVICE_FOOTPRINTS=Object.freeze({'drop-pad':Object.freeze([22,22]),'repair-station':Object.freeze([16,14]),'upgrade-station':Object.freeze([16,14]),'mech-factory':Object.freeze([24,24])});
const serviceType=type=>Object.hasOwn(SERVICE_FOOTPRINTS,type);
const footprint=type=>SERVICE_FOOTPRINTS[type]||({pod:[17.1,18.1],extractor:[10,10],turret:[7,7],generator:[7,6],reactor:[7,7],relay:[7.6,6],battery:[7,6],'worker-factory':[8,8],wire:[9,2],hive:[28,28]}[type]||[8,8]);
export function servicePlacementClear(s,kind,p){
 const map=mapForState(s);if(map){const [w,d]=footprint(kind);if(!terrainPointClear(map,p,Math.max(w,d)/2+1))return false;if(kind==='mech-factory'&&!terrainSegmentClear(map,p,{x:p.x,z:p.z+26.5},8))return false;}
 if(!s.economyVersion)return true;
 if(s.productionVersion){
  if(kind==='mech-factory'&&s.deposits.some(d=>Math.abs(d.x-p.x)<12.5&&d.z+5>p.z&&d.z-5<p.z+26.5))return false;
  const foundries=s.entities.filter(e=>live(e)&&e.type==='mech-factory');
  if(kind==='mech-factory'&&(p.z>worldSize(s)-26.5||p.x<12||p.x>worldSize(s)-12||p.z<12))return false;
  for(const f of [...foundries,...(kind==='mech-factory'?[{...p,id:null}]:[])])for(const b of [...s.entities.filter(e=>live(e)&&!['worker','mech','enemy'].includes(e.type)),{...p,type:kind,id:'placement'}]){
   if(b.id===f.id||(f.id===null&&b.id==='placement'))continue;
   const [bw,bd]=footprint(b.type);if(Math.abs(b.x-f.x)<7+bw/2+.5&&b.z+bd/2>f.z&&b.z-bd/2<f.z+26.5)return false;
  }
 }
 const [w,d]=footprint(kind),margin=.5;
 if(serviceType(kind)&&(p.x<w/2||p.x>worldSize(s)-w/2||p.z<d/2||p.z>worldSize(s)-22))return false;
 for(const e of s.entities){
  if(!live(e)||['worker','mech','enemy'].includes(e.type)||(!serviceType(kind)&&!serviceType(e.type)))continue;
  const [ew,ed]=footprint(e.type);
  if(Math.abs(p.x-e.x)<(w+ew)/2+margin&&Math.abs(p.z-e.z)<(d+ed)/2+margin)return false;
 }
 if(serviceType(kind)&&s.deposits.some(e=>Math.abs(p.x-e.x)<w/2+5+margin&&Math.abs(p.z-e.z)<d/2+5+margin))return false;
 return true;
}
const point=(s,c)=>Number.isFinite(c.x)&&Number.isFinite(c.z)&&c.x>=0&&c.x<=worldSize(s)&&c.z>=0&&c.z<=worldSize(s);
// Formation destinations, not collision/pathfinding physics. Move the whole
// formation at map edges so clamping cannot collapse two giant mechs together.
function economyMoveFormation(s,es,target){
 const mechs=es.filter(e=>e.type==='mech').sort((a,b)=>a.id.localeCompare(b.id));
 if(!mechs.length)return null;
 const slots=new Map(),workers=es.filter(e=>e.type==='worker');
 for(const [i,e] of mechs.entries())slots.set(e.id,{x:target.x+(i-(mechs.length-1)/2)*13,z:target.z,r:6});
 for(const [i,e] of workers.entries())slots.set(e.id,{x:target.x+(i%3-1)*3,z:target.z+12+Math.floor(i/3)*3,r:1.5});
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const p of slots.values()){minX=Math.min(minX,p.x-p.r);maxX=Math.max(maxX,p.x+p.r);minZ=Math.min(minZ,p.z-p.r);maxZ=Math.max(maxZ,p.z+p.r);}
 const dx=minX<0?-minX:maxX>worldSize(s)?worldSize(s)-maxX:0,dz=minZ<0?-minZ:maxZ>worldSize(s)?worldSize(s)-maxZ:0;
 for(const p of slots.values()){p.x+=dx;p.z+=dz;}
 return slots;
}
function unit(id,type,x,z,hp,owner=0,role=''){return {id,type,x,z,hp,maxHp:hp,owner,angle:0,role,status:'idle',cooldown:0,...(type==='mech'?{shotSerial:0,lastShotSide:null,gatlingEngaged:false,gatlingSpin:0}:{})};}
function event(s,type,x,z,text,extra={}){s.events.push({id:++s.eventId,type,x,z,text,time:s.time,...extra});if(s.events.length>100)s.events.splice(0,s.events.length-100);}
export function createGame({legacy=false,production=true,map=null}={}){
 const s={version:1,time:0,tick:0,remainder:0,phase:'running',endReason:null,resources:180,wave:0,nextWaveAt:225,hvdReadyAt:0,entities:[unit('pod','pod',30,120,1600),unit('hive','hive',132,30,2600,-1),unit('mech-1','mech',36,111,650,1,'combat'),unit('mech-2','mech',24,111,460,2,'long-range'),...Array.from({length:3},(_,i)=>({...unit(`worker-${i+1}`,'worker',25+i*5,132,100),cargo:0,approachSlot:i}))],deposits:[{id:'ore-safe',x:19,z:99,remaining:1600},{id:'ore-mid',x:72,z:92,remaining:2000},{id:'ore-risk',x:109,z:56,remaining:2400}],events:[],eventId:0,nextId:10,kills:0};
 s.mission={id:'first-landing',title:'Secure the landing zone',oreDelivered:0,oreTarget:60,extractorBuilt:false,repairStationBuilt:false,repairStationFreeUsed:false,repairStationFreeAvailable:true,repaired:false,turretBuilt:false,swarmDefeated:false,swarmAt:RULES.waveTimes[0],objectives:[],activeObjective:'harvest'};
 // Landing damage makes the free HQ repair lesson visible without jeopardizing the defense.
 s.entities.find(e=>e.id==='mech-1').hp-=120;
 if(!legacy){
  s.economyVersion=1;s.stockpiles={conductive:0,crystal:0};s.powerPriority='defense';
  s.deposits.forEach((d,i)=>{d.resourceType=['alloy','conductive','crystal'][i];});
  s.entities.push(...[[-1,78,87],[-1,82,96],[-2,103,50],[-2,114,52],[-2,104,64],[-2,116,63]].map(([tier,x,z],i)=>({...unit(`guard-${i}`,'enemy',x,z,tier===-1?140:185,-1,'guard'),resourceGuard:true})));
  s.mission.id='frontier-economy';s.mission.title='Establish the frontier economy';s.mission.conductiveDelivered=0;s.mission.crystalDelivered=0;updatePower(s);
 }
 if(!legacy&&production){
  s.productionVersion=1;s.expansion={stage:0,pendingAt:null};s.nextWaveAt=null;
  s.mission.id='frontier-hive';s.mission.title='Establish a base and destroy the hive';
  s.entities.find(e=>e.type==='hive').hp=3600;s.entities.find(e=>e.type==='hive').maxHp=3600;
  s.entities.push(...[[122,29],[141,38],[130,44]].map(([x,z],i)=>({...unit(`hive-guard-${i}`,'enemy',x,z,250,-1,'heavy'),stationaryGuard:true})));
 }
 if(map===FRONTIER_MAP.id&&!legacy){
  s.mapId=FRONTIER_MAP.id;s.worldSize=FRONTIER_MAP.size;s.mapName=FRONTIER_MAP.name;
  s.deposits=FRONTIER_MAP.deposits.map(d=>({...d}));
  Object.assign(s.entities.find(e=>e.type==='hive'),FRONTIER_MAP.hive);
  const guardPoints=[[183,150],[185,169],[329,308],[350,309],[330,332],[352,333]];
  s.entities.filter(e=>e.resourceGuard).forEach((e,i)=>Object.assign(e,{x:guardPoints[i][0],z:guardPoints[i][1]}));
  s.entities.filter(e=>e.stationaryGuard).forEach((e,i)=>Object.assign(e,{x:FRONTIER_MAP.hive.x+[-10,9,0][i],z:FRONTIER_MAP.hive.z+[-10,-8,15][i]}));
  for(const [i,d] of s.deposits.filter(d=>['conductive-north','conductive-rim','crystal-east'].includes(d.id)).entries()){
   s.entities.push({...unit(`frontier-guard-${i}`,'enemy',d.x+10,d.z-9,210,-1,'guard'),resourceGuard:true});
  }
  s.mission.title='Kestrel Basin: establish a foothold and defeat the hive';
 }
 updateObjectives(s);
 event(s,'notice',30,120,s.productionVersion?'Build your base, escort workers to conductive minerals, assemble reinforcements and destroy the occupied hive.':'Harvest 60 ore, build an extractor and service bay, repair for free, then prepare a turret for the first swarm.');return s;
}
function updateObjectives(s){
 const m=s.mission;if(!m)return;
 m.repairStationFreeAvailable=!m.repairStationFreeUsed;
 if(s.wave>=1&&!s.entities.some(e=>live(e)&&e.type==='enemy'&&e.openingSwarm))m.swarmDefeated=true;
 m.objectives=[
  {id:'harvest',label:`Deliver ${m.oreTarget} ore to HQ`,complete:m.oreDelivered>=m.oreTarget-1e-6},
  {id:'extractor',label:'Build an extractor on an ore deposit',complete:m.extractorBuilt},
  {id:'repair-station',label:'Place your first service bay for free',complete:!!m.repairStationBuilt},
  {id:'repair',label:'Repair a mech for free at the service bay',complete:m.repaired},
  {id:'turret',label:'Build a defensive turret',complete:m.turretBuilt},
  {id:'swarm',label:'Defeat the first swarm',complete:m.swarmDefeated}
 ];
 if(s.economyVersion){
  if(s.entities.some(e=>live(e)&&e.type==='extractor'&&e.depositId==='ore-mid'&&e.progress===1&&e.powered))m.outpostPowered=true;
  if(s.entities.some(e=>live(e)&&e.type==='upgrade-station'&&e.powered))m.upgradeStationBuilt=true;
  m.objectives.push({id:'conductive',label:'Deliver 40 conductive minerals to HQ',complete:(m.conductiveDelivered||0)>=40-1e-6},{id:'outpost',label:'Power an extractor at the conductive outpost',complete:!!m.outpostPowered},{id:'upgrade-station',label:'Build and power an upgrade station',complete:!!m.upgradeStationBuilt},{id:'upgrade',label:'Complete a mech upgrade at the station',complete:!!m.mechUpgraded},{id:'crystal',label:'Escort workers and deliver 20 energy crystals',complete:(m.crystalDelivered||0)>=20-1e-6},{id:'advanced-upgrade',label:'Complete a crystal-tier mech upgrade',complete:!!m.advancedUpgrade});
 }
 if(s.productionVersion){
  if(s.entities.some(e=>live(e)&&e.type==='mech-factory'&&e.powered))m.foundryBuilt=true;
  m.objectives=[
   {id:'harvest',label:'Deliver 60 alloy ore to HQ',complete:m.oreDelivered>=60-1e-6},
   {id:'extractor',label:'Build an extractor and establish your base',complete:!!m.extractorBuilt},
   {id:'conductive',label:'Secure and deliver 90 conductive minerals',complete:(m.conductiveDelivered||0)>=90-1e-6},
   {id:'foundry',label:'Build and power a mech foundry',complete:!!m.foundryBuilt},
   {id:'reinforcement',label:'Assemble a reinforcement mech',complete:(m.mechsProduced||0)>0},
   {id:'hive',label:'Destroy the alien hive',complete:s.entities.some(e=>e.type==='hive'&&!live(e))}
  ];
 }
 m.activeObjective=m.objectives.find(o=>!o.complete)?.id??'complete';
}
function chosen(s,p,c){if(!Array.isArray(c.ids)||!c.ids.length||c.ids.length>12||new Set(c.ids).size!==c.ids.length)return null;const es=c.ids.map(id=>s.entities.find(e=>e.id===id&&live(e)));return es.every(e=>e&&['mech','worker'].includes(e.type)&&(p===0||e.owner===0||e.owner===p))?es:null;}
function fail(error){return {ok:false,error};}
export function applyCommand(s,p,c){
 if(![0,1,2].includes(p))return fail('Unknown player.');
 if(s.phase!=='running')return fail('Mission has ended.');
 if(!c||typeof c!=='object')return fail('Invalid command.');
 const pod=s.entities.find(e=>e.type==='pod'&&live(e));
 if(s.economyVersion){const result=economyCommand(s,p,c);if(result)return result;}
 if(['move','attack','mine','repair'].includes(c.type)){
  const es=chosen(s,p,c);if(!es)return fail('Select living units you control.');
  if(es.some(e=>dropping(s,e)))return fail('Wait for the artillery mech to land.');
  if(es.some(e=>e.launch))return fail('Wait for the mech to clear the foundry launch lane.');
  if(es.some(e=>e.upgradeJob))return fail('Cancel the upgrade before giving this mech another order.');
  if(c.type==='move'&&!point(s,c))return fail('Destination is outside the map.');
  if(c.type==='move'&&es.some(e=>e.type==='worker')&&pod&&dist(pod,c)<9)return fail('Workers cannot enter the HQ hull.');
  if(c.type==='move'&&es.some(e=>e.type==='worker')&&s.entities.some(e=>live(e)&&e.type==='wire'&&dist(e,c)<7))return fail('Workers cannot enter razor wire.');
  if(c.type==='attack'&&(es.some(e=>e.type!=='mech')||!s.entities.some(e=>e.id===c.targetId&&live(e)&&hostile(e)&&teamVisible(s,e))))return fail('Choose a currently visible hostile target and mechs.');
  if(c.type==='mine'&&(es.some(e=>e.type!=='worker')||!s.deposits.some(d=>d.id===c.depositId&&d.remaining>0)))return fail('Choose workers and a deposit with ore.');
  if(c.type==='repair'&&(es.some(e=>e.type!=='mech')||!pod))return fail('Only mechs can repair at the pod.');
  if(c.type==='repair'&&c.targetId!==undefined&&!s.entities.some(e=>live(e)&&['repair-station','pod'].includes(e.type)&&e.id===c.targetId))return fail('Choose a living repair station or HQ.');
  const formation=c.type==='move'&&s.economyVersion?economyMoveFormation(s,es,c):null;
  if(c.type==='move'&&mapForState(s))for(const e of es){const goal=formation?.get(e.id)||c;if(!findTerrainRoute(mapForState(s),e,goal,bodyRadius(e)))return fail('Choose accessible terrain, clear of cliffs and water.');}
  for(const [i,e] of es.entries()){
   releaseService(s,e);
   delete e.detour;delete e.routeData;delete e.workTimer;e.order={type:c.type};e.status=c.type;
   if(c.type==='move'){const slot=formation?.get(e.id);e.order.x=slot?.x??Math.max(0,Math.min(worldSize(s),c.x+(es.length>1?(i%3-1)*3:0)));e.order.z=slot?.z??Math.max(0,Math.min(worldSize(s),c.z+(es.length>1?Math.floor(i/3)*3:0)));if(e.type==='worker'&&pod&&dist(e.order,pod)<9){const angle=Math.atan2(e.order.z-pod.z,e.order.x-pod.x);e.order.x=pod.x+Math.cos(angle)*9;e.order.z=pod.z+Math.sin(angle)*9;}}
   if(c.type==='repair'&&c.targetId!==undefined)e.order.targetId=c.targetId;
   if(c.type==='attack'){const target=s.entities.find(t=>t.id===c.targetId);e.order.targetId=c.targetId;e.order.x=target.x;e.order.z=target.z;}
   if(c.type==='mine'){e.order.depositId=c.depositId;const d=s.deposits.find(d=>d.id===c.depositId);e.status=e.cargo>=20||(e.cargo>0&&(e.cargoType||'alloy')!==(d.resourceType||'alloy'))?'returning':'mining';}
  }return {ok:true};
 }
 if(c.type==='worker'){
  if(!pod)return fail('No pod available.');if(s.entities.filter(e=>e.type==='worker'&&live(e)).length+s.entities.filter(e=>live(e)&&e.production).length>=RULES.workerCap)return fail('Worker cap reached (8).');
  const rescue=!s.entities.some(e=>e.type==='worker'&&live(e))&&s.resources<RULES.workerCost;
  if(!rescue&&s.resources<RULES.workerCost)return fail('Need 40 resources.');s.resources-=rescue?0:RULES.workerCost;const approachSlot=Array.from({length:RULES.workerCap},(_,i)=>i).find(i=>!s.entities.some(e=>live(e)&&e.type==='worker'&&e.approachSlot===i));s.entities.push({...unit(`worker-${s.nextId++}`,'worker',pod.x+6,pod.z+12,100),cargo:0,approachSlot});event(s,'build',pod.x+6,pod.z+12,'Worker ready');return {ok:true};
 }
 if(c.type==='build'&&c.kind==='extractor'){
  const deposit=s.deposits.find(d=>c.depositId?d.id===c.depositId:point(s,c)&&dist(d,c)<=6);
  if(!deposit||deposit.remaining<=0)return fail('Place an extractor on a deposit with resources.');
  if(!teamVisible(s,deposit)||!s.entities.some(e=>live(e)&&['pod','mech'].includes(e.type)&&(p===0||e.owner===0||e.owner===p)&&dist(e,deposit)<=36))return fail('Build on a visible deposit within 36m of HQ or your mech.');
  if(!servicePlacementClear(s,'extractor',deposit))return fail('Keep the service-pad footprint clear.');
  if(s.entities.some(e=>live(e)&&e.type==='extractor'&&e.depositId===deposit.id))return fail('This deposit already has an extractor.');
  if(s.entities.some(e=>live(e)&&!['worker','mech','enemy'].includes(e.type)&&dist(e,deposit)<8))return fail('Building position is occupied.');
  const worker=s.entities.filter(e=>live(e)&&e.type==='worker'&&e.order?.type!=='construct').sort((a,b)=>dist(a,deposit)-dist(b,deposit))[0];
  if(!worker)return fail('An available worker is needed to build an extractor.');
  if(s.resources<RULES.extractorCost)return fail(`Need ${RULES.extractorCost} resources.`);
  s.resources-=RULES.extractorCost;
  const building={...unit(`extractor-${s.nextId++}`,'extractor',deposit.x,deposit.z,400),depositId:deposit.id,progress:0,status:'building',builderId:worker.id};
  s.entities.push(building);worker.order={type:'construct',targetId:building.id};worker.status='building';delete worker.workTimer;
  event(s,'build',deposit.x,deposit.z,'Extractor construction started');updatePower(s);return {ok:true};
 }
 if(c.type==='build'){
  if(!['turret','wire','repair-station'].includes(c.kind)||!point(s,c))return fail('Invalid building or position.');
  const builders=s.entities.filter(e=>live(e)&&!dropping(s,e)&&(e.type==='pod'||e.type==='mech')&&(p===0||e.owner===0||e.owner===p));
  if(!builders.some(e=>dist(e,c)<=36))return fail('Build within 36m of the pod or your mech.');
  if(!teamVisible(s,c))return fail('Building position must be in team vision.');
  if(s.entities.some(e=>live(e)&&!['worker','mech','enemy'].includes(e.type)&&dist(e,c)<(c.kind==='wire'?7:8)))return fail('Building position is occupied.');
  if(s.deposits.some(d=>dist(d,c)<6))return fail('Keep mining deposits clear.');
  if(!servicePlacementClear(s,c.kind,c))return fail('Keep the full service-pad footprint clear.');
  const cap=c.kind==='repair-station'?RULES.repairStationCap:c.kind==='turret'?8:16,cost=c.kind==='repair-station'?(s.mission&&!s.mission.repairStationFreeUsed?0:RULES.repairStationCost):c.kind==='turret'?70:20;
  if(s.entities.filter(e=>live(e)&&e.type===c.kind).length>=cap)return fail('Building cap reached.');if(s.resources<cost)return fail(`Need ${cost} resources.`);
  s.resources-=cost;s.entities.push(unit(`${c.kind}-${s.nextId++}`,c.kind,c.x,c.z,c.kind==='repair-station'?450:c.kind==='turret'?320:180));event(s,'build',c.x,c.z,c.kind==='wire'?'Razor wire deployed':c.kind==='repair-station'?'Repair station online':'Turret online');if(s.mission&&c.kind==='turret')s.mission.turretBuilt=true;if(s.mission&&c.kind==='repair-station'){s.mission.repairStationBuilt=true;s.mission.repairStationFreeUsed=true;}updatePower(s);updateObjectives(s);finish(s);return {ok:true};
 }
 if(c.type==='hvd'){
  if(!point(s,c))return fail('Invalid strike position.');if(s.time<s.hvdReadyAt)return fail('Prototype HVD is cooling down.');
  const mechs=s.entities.filter(e=>live(e)&&e.type==='mech'&&!e.launch&&(p===0||e.owner===p)).sort((a,b)=>dist(a,c)-dist(b,c));const source=mechs[0];
  if(!source||dist(source,c)>65)return fail('Target must be within 65m of your mech.');
  s.hvdReadyAt=s.time+90;
  for(const e of s.entities)if(live(e)&&hostile(e)&&(segmentDistance(e,source,c)<5||dist(e,c)<12))damage(s,e,e.type==='hive'?220:260);
  event(s,'hvd',source.x,source.z,'PROTOTYPE HVD',{tx:c.x,tz:c.z});finish(s);return {ok:true};
 }
 return fail('Unknown command.');
}
const queuedWorkers=s=>s.entities.filter(e=>live(e)&&e.production&&e.production.kind!=='mech').length;
const workerCount=s=>s.entities.filter(e=>live(e)&&e.type==='worker').length+queuedWorkers(s);
export function mechCount(s){return s.entities.filter(e=>live(e)&&(e.type==='mech'||e.production?.kind==='mech')).length;}
function productionCommand(s,p,c){
 if(c.type==='cancel-production'){
  const factory=s.entities.find(e=>e.id===c.factoryId&&live(e));
  if(!factory?.production)return fail('Choose a building with an active production job.');
  if(factory.production.kind==='mech'&&p!==0&&factory.production.owner!==p)return fail('Only the ordering pilot can cancel this mech.');
  spend(s,factory.production.cost,-Math.max(0,1-factory.production.progress));delete factory.production;
  event(s,'notice',factory.x,factory.z,'Production cancelled; unfinished work refunded.');return {ok:true};
 }
 if(c.type==='mech'){
  const factory=s.entities.find(e=>e.id===c.factoryId&&live(e)&&e.type==='mech-factory');
  if(!factory)return fail('Choose a living mech foundry.');
  if(!['combat','long-range'].includes(c.role))return fail('Choose combat or long-range.');
  if(factory.production||s.entities.some(e=>e.id===factory.launchId&&live(e)&&e.launch))return fail('Foundry is already assembling or launching a mech.');
  if(!factory.powered)return fail('Foundry needs power.');
  if(mechCount(s)>=PRODUCTION_RULES.mechCap)return fail('Mech cap reached (4 including queued mechs).');
  if(!canAfford(s,PRODUCTION_RULES.mechCost))return fail('Need 160 alloy + 40 conductive.');
  spend(s,PRODUCTION_RULES.mechCost);factory.production={kind:'mech',owner:p,role:c.role,progress:0,duration:50,cost:{...PRODUCTION_RULES.mechCost},blocked:false};return {ok:true};
 }
 if(c.type==='worker'){
  const f=s.entities.find(e=>live(e)&&(c.factoryId===undefined?e.type==='pod':e.id===c.factoryId&&e.type==='worker-factory'));
  if(!f)return fail('Choose a living HQ or worker factory.');
  if(workerCount(s)>=RULES.workerCap)return fail('Worker cap reached (8 including queued workers).');
  if(f.production)return fail('This building is already producing.');
  const rescue=!s.entities.some(e=>live(e)&&e.type==='worker')&&!queuedWorkers(s)&&s.resources<40;
  if(rescue&&f.type==='pod'){const spawn=factorySpawn(s,f);if(!spawn)return fail('Clear space outside the worker factory.');s.entities.push({...unit(`worker-${s.nextId++}`,'worker',spawn.x,spawn.z,100),cargo:0,approachSlot:0});event(s,'notice',f.x,f.z,'Emergency worker restored.');return {ok:true};}
  if(f.type!=='pod'&&!f.powered)return fail('Worker factory needs power.');
  const cost={alloy:f.type==='pod'?40:30};if(!canAfford(s,cost))return fail(`Need ${cost.alloy} alloy.`);
  spend(s,cost);f.production={kind:'worker',owner:0,progress:0,duration:f.type==='pod'?30:12,cost,blocked:false};return {ok:true};
 }
 return null;
}
function economyCommand(s,p,c){
 if(s.productionVersion){const result=productionCommand(s,p,c);if(result)return result;}

 if(c.type==='power-priority'){
  if(!['defense','repair','production'].includes(c.priority))return fail('Choose defense, repair or production priority.');
  s.powerPriority=c.priority;updatePower(s);return {ok:true};
 }
 if(c.type==='upgrade'||c.type==='cancel-upgrade'){
  const es=chosen(s,p,c);if(!es||es.length!==1||es[0].type!=='mech')return fail('Select one living mech you control.');const mech=es[0];
  if(dropping(s,mech))return fail('Wait for the artillery mech to land.');
  if(mech.launch)return fail('Wait for the mech to clear the foundry launch lane.');
  if(c.type==='cancel-upgrade'){if(!mech.upgradeJob)return fail('This mech has no upgrade in progress.');cancelUpgrade(s,mech,'Upgrade cancelled; unfinished work refunded.');return {ok:true};}
  const definition=typeof c.kind==='string'&&Object.hasOwn(UPGRADES,c.kind)?UPGRADES[c.kind]:null;if(!definition)return fail('Choose mobility, armor or weapons.');
  if(mech.upgradeJob)return fail('This mech is already upgrading.');
  const level=(mech.upgrades?.[c.kind]||0)+1,spec=definition.levels[level-1];if(!spec)return fail('Upgrade is already at maximum tier.');
  const stations=s.entities.filter(e=>live(e)&&e.type==='upgrade-station'&&(!c.stationId||e.id===c.stationId));
  const station=stations.filter(e=>e.powered&&!stationOccupied(s,e)&&!s.entities.some(m=>m.upgradeJob?.stationId===e.id)).sort((a,b)=>dist(mech,a)-dist(mech,b)||a.id.localeCompare(b.id))[0];
  if(!station)return fail('A powered, unoccupied upgrade station is required.');
  if(!canAfford(s,spec.cost))return fail(`Need ${costLabel(spec.cost)}.`);
  spend(s,spec.cost);mech.upgradeJob={kind:c.kind,level,stationId:station.id,progress:0,duration:spec.duration,cost:{...spec.cost}};delete mech.order;mech.status='moving-to-upgrade';mech.gatlingEngaged=false;mech.gatlingSpin=0;return {ok:true};
 }
 if(c.type==='worker'&&c.factoryId!==undefined){
  const factory=s.entities.find(e=>live(e)&&e.type==='worker-factory'&&e.id===c.factoryId);if(!factory)return fail('Choose a living worker factory.');
  if(!factory.powered)return fail('Worker factory needs power.');if(factory.production)return fail('Worker factory is already producing a worker.');
  if(s.entities.filter(e=>live(e)&&e.type==='worker').length+s.entities.filter(e=>live(e)&&e.production).length>=RULES.workerCap)return fail('Worker cap reached (8 including queued workers).');
  if(s.resources<30)return fail('Need 30 alloy.');s.resources-=30;factory.production={progress:0,duration:12,cost:{alloy:30}};return {ok:true};
 }
 if(c.type==='build'&&['generator','reactor','relay','battery','worker-factory','upgrade-station',...(s.productionVersion?['mech-factory','drop-pad']:[])].includes(c.kind)){
  if(!point(s,c))return fail('Invalid building position.');const spec=BUILDINGS[c.kind];
  if(!s.entities.some(e=>live(e)&&!dropping(s,e)&&(e.type==='pod'||e.type==='mech')&&(p===0||e.owner===0||e.owner===p)&&dist(e,c)<=36))return fail('Build within 36m of HQ or your mech.');
  if(!teamVisible(s,c))return fail('Building position must be in team vision.');
  if(s.entities.some(e=>live(e)&&!['worker','mech','enemy'].includes(e.type)&&dist(e,c)<8)||s.deposits.some(d=>dist(d,c)<6))return fail('Keep buildings and mining deposits clear.');
  if(!servicePlacementClear(s,c.kind,c))return fail('Keep the full service-pad footprint clear.');
  if(c.kind==='drop-pad'&&s.entities.some(e=>live(e)&&(e.role==='artillery'||e.type==='drop-pad'&&!e.summonedId)))return fail('Only one artillery mech or pending drop is allowed.');
  if(s.entities.filter(e=>live(e)&&e.type===c.kind&&!(c.kind==='drop-pad'&&e.summonedId)).length>=spec.cap)return fail('Building cap reached.');
  const cost=buildingCost(s,c.kind);if(!canAfford(s,cost))return fail(`Need ${costLabel(cost)}.`);
  spend(s,cost);s.entities.push({...unit(`${c.kind}-${s.nextId++}`,c.kind,c.x,c.z,spec.hp,c.kind==='drop-pad'?p:0),status:c.kind==='drop-pad'?'charging':'online',...(c.kind==='drop-pad'?{dropJob:{progress:0,duration:15}}:{}),...(c.kind==='battery'?{energy:0}:{})});updatePower(s);updateObjectives(s);event(s,'build',c.x,c.z,`${spec.label} deployed`);return {ok:true};
 }
 return null;
}
function factorySpawn(s,factory){
 const blockers=s.entities.filter(e=>live(e)&&!['worker','mech','enemy'].includes(e.type));
 for(const radius of [7,10,14])for(let i=0;i<8;i++){const a=Math.PI/4+i*Math.PI/4,p={x:factory.x+Math.sin(a)*radius,z:factory.z+Math.cos(a)*radius};if(point(s,p)&&terrainPointClear(mapForState(s),p,1)&&blockers.every(b=>dist(b,p)>=(b.type==='pod'?10:5)))return p;}
 const fallback={x:Math.max(1,Math.min(worldSize(s)-1,factory.x+7)),z:Math.max(1,Math.min(worldSize(s)-1,factory.z+7))};
 if(!mapForState(s))return fallback;
 // A production job waits rather than creating a worker inside terrain.
 return terrainPointClear(mapForState(s),fallback,1)?fallback:null;
}
function repairSiteFor(s,e){
 return s.entities.find(b=>live(b)&&['repair-station','pod'].includes(b.type)&&b.id===e.order?.targetId)||s.entities.filter(b=>live(b)&&b.type==='repair-station').sort((a,b)=>(s.economyVersion?Number(!a.powered)-Number(!b.powered):0)||dist(e,a)-dist(e,b))[0]||s.entities.find(b=>live(b)&&b.type==='pod');
}
function stationOccupied(s,station){
 const occupant=s.entities.find(m=>m.id===station.serviceOccupantId&&live(m));
 if(occupant&&(occupant.upgradeJob?.stationId===station.id||occupant.order?.type==='service-exit'&&occupant.order.stationId===station.id||occupant.order?.type==='repair'&&repairSiteFor(s,occupant)?.id===station.id))return occupant;
 return null;
}
function dockAtStation(s,e,station,dt){
 const occupied=stationOccupied(s,station);
 if(occupied&&occupied.id!==e.id){
  const side=station.x<80?1:-1;
  travel(s,e,{x:station.x+side*12,z:station.z+16},mechStats(e).speed,dt,.2);return false;
 }
 station.serviceOccupantId=e.id;
 const job=e.upgradeJob||e.order;
 if(job.dockApproach===undefined)job.dockApproach=dist(e,station)>6;
 if(job.dockApproach){
  if(!travel(s,e,{x:station.x,z:station.z+12},mechStats(e).speed,dt,0))return false;
  job.dockApproach=false;
 }
 if(!travel(s,e,station,mechStats(e).speed,dt,0))return false;
 e.x=station.x;e.z=station.z;e.angle=0;return true;
}
function departStation(e,station){
 e.order={type:'service-exit',stationId:station.id,stage:'front',x:station.x,z:station.z+14,side:station.x<80?-1:1};e.status='leaving-service';
}
function releaseService(s,e){for(const b of s.entities)if(b.serviceOccupantId===e.id)delete b.serviceOccupantId;}
function cancelUpgrade(s,mech,message){const job=mech.upgradeJob;if(!job)return;const station=s.entities.find(b=>b.id===job.stationId&&live(b));releaseService(s,mech);spend(s,job.cost,-Math.max(0,1-job.progress));delete mech.upgradeJob;delete mech.order;if(live(mech)){mech.status='idle';if(station&&dist(mech,station)<.3){station.serviceOccupantId=mech.id;departStation(mech,station);}}event(s,'notice',mech.x,mech.z,message);}
function advanceEconomyJobs(s,dt){
 for(const e of s.entities){
  if(e.type==='drop-pad'&&e.dropJob&&!e.summonedId){
   if(!live(e)){delete e.dropJob;continue;}
   const job=e.dropJob;
   if(!e.powered){e.status='drop-paused';continue;}
   job.progress=Math.min(1,job.progress+dt/job.duration);e.status='charging';
   if(job.progress>=1-1e-9){
    job.blocked=s.entities.some(m=>live(m)&&['mech','worker','enemy'].includes(m.type)&&dist(m,e)<9);
    if(job.blocked){e.status='landing-zone-blocked';continue;}
    // Persist the consumed pad marker with the unit in the same authoritative tick.
    const id=`artillery-${s.nextId++}`;e.summonedId=id;delete e.dropJob;e.status='spent';
    s.entities.push({...unit(id,'mech',e.x,e.z,1600,e.owner,'artillery'),dropPadId:e.id,dropAt:s.time,dropDuration:6,status:'dropping'});
    event(s,'build',e.x,e.z,'Artillery mech incoming',{sourceId:id});
   }
  }
  if(e.upgradeJob){const job=e.upgradeJob,station=s.entities.find(b=>live(b)&&b.type==='upgrade-station'&&b.id===job.stationId);
   if(!live(e)||!station){cancelUpgrade(s,e,'Upgrade interrupted; unfinished work refunded.');continue;}
   if(!dockAtStation(s,e,station,dt)){e.status='moving-to-upgrade';continue;}
   if(!station.powered){e.status='upgrade-paused';continue;}
   e.status='upgrading';job.progress=Math.min(1,job.progress+dt/job.duration);
   if(job.progress>=1-1e-9){const oldMax=e.maxHp;e.upgrades??={};e.upgrades[job.kind]=job.level;e.maxHp=mechStats(e).maxHp;e.hp=Math.min(e.maxHp,e.hp+Math.max(0,e.maxHp-oldMax));delete e.upgradeJob;departStation(e,station);if(s.mission){s.mission.mechUpgraded=true;if(job.level===2)s.mission.advancedUpgrade=true;}event(s,'notice',e.x,e.z,`${UPGRADES[job.kind].label} tier ${job.level} complete`);}
  }
  if(e.production){const job=e.production;if(!live(e)){spend(s,job.cost,-Math.max(0,1-job.progress));delete e.production;continue;}
   if(!e.powered)continue;job.progress=Math.min(1,job.progress+dt/job.duration);
   if(job.progress>=1-1e-9&&job.kind==='mech'){
    const spawn={x:e.x,z:e.z};
    job.blocked=s.entities.some(b=>live(b)&&b.id!==e.id&&(Math.abs(b.x-e.x)<7+(b.type==='mech'?6:1)&&b.z>e.z-6&&b.z<e.z+26.5));
    if(job.blocked)continue;
    const mech={...unit(`mech-${s.nextId++}`,'mech',spawn.x,spawn.z,job.role==='long-range'?460:650,job.owner,job.role),producedAt:s.time,factoryId:e.id,launch:{factoryId:e.id,targetZ:e.z+20},status:'launching'};
    s.entities.push(mech);e.launchId=mech.id;delete e.production;s.mission.mechsProduced=(s.mission.mechsProduced||0)+1;event(s,'build',spawn.x,spawn.z,'Reinforcement mech launching');continue;
   }
   if(job.progress>=1-1e-9){const approachSlot=Array.from({length:RULES.workerCap},(_,i)=>i).find(i=>!s.entities.some(w=>live(w)&&w.type==='worker'&&w.approachSlot===i));
    const spawn=factorySpawn(s,e);if(!spawn){job.blocked=true;continue;}const x=spawn.x,z=spawn.z;s.entities.push({...unit(`worker-${s.nextId++}`,'worker',x,z,100),cargo:0,approachSlot});delete e.production;event(s,'build',x,z,'Factory worker ready');}
  }
 }
}

function segmentDistance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/l)):0;return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);}
function workerApproach(e,deposit){
 const angle=Math.PI/2+(e.approachSlot??0)*Math.PI/4;
 return {x:deposit.x+Math.cos(angle)*RULES.workerApproachRadius,z:deposit.z+Math.sin(angle)*RULES.workerApproachRadius};
}
function travel(s,e,dest,speed,dt,stop=0){
 let aim=dest;
 if(e.type==='worker'){
  if(e.detour&&dist(e,e.detour)<0.5)delete e.detour;
  if(!e.detour){const wire=s.entities.find(w=>w.type==='wire'&&live(w)&&segmentDistance(w,e,dest)<5&&dist(e,w)>0.1&&dist(w,dest)>1);if(wire){const dx=dest.x-e.x,dz=dest.z-e.z,l=Math.hypot(dx,dz)||1;const side=wire.x<80?1:-1;e.detour={x:Math.max(1,Math.min(worldSize(s)-1,wire.x-dz/l*9*side)),z:Math.max(1,Math.min(worldSize(s)-1,wire.z+dx/l*9*side))};}}
  if(e.detour)aim=e.detour;
  const hq=s.entities.find(b=>live(b)&&b.type==='pod');
  if(hq&&e.detour&&dist(e.detour,hq)<9){const angle=Math.atan2(e.detour.z-hq.z,e.detour.x-hq.x);e.detour={x:hq.x+Math.cos(angle)*10,z:hq.z+Math.sin(angle)*10};aim=e.detour;}
  // A short circular waypoint outside the 8m hull gives deterministic clearance.
  // It is recalculated each tick, so wire detours still work without stale routes.
  // HQ unloading aims at the center but stops at 10m and needs no circumvention.
  if(hq&&dist(aim,hq)>=8&&segmentDistance(hq,e,aim)<8.5){
   const angle=Math.atan2(e.z-hq.z,e.x-hq.x),goal=Math.atan2(aim.z-hq.z,aim.x-hq.x);
   const turn=Math.atan2(Math.sin(goal-angle),Math.cos(goal-angle));
   const next=angle+(turn<0?-1:1)*Math.min(Math.abs(turn),0.35);
   aim={x:hq.x+Math.cos(next)*9,z:hq.z+Math.sin(next)*9};
  }
 }
 const terrain=mapForState(s),radius=bodyRadius(e);
 if(terrain){
  if(terrainSegmentClear(terrain,e,aim,radius)){delete e.routeData;}
  else {
   let route=e.routeData;
   if(!route||dist(route.goal,aim)>.75||!route.points.length||!terrainSegmentClear(terrain,e,route.points[0],radius)){
    const points=findTerrainRoute(terrain,e,aim,radius);route=points?{goal:{x:aim.x,z:aim.z},points}:null;e.routeData=route;
   }
   if(!route){e.status='route-blocked';return false;}
   while(route.points.length>1&&dist(e,route.points[0])<.15)route.points.shift();
   aim=route.points[0];
  }
 }
 const dx=aim.x-e.x,dz=aim.z-e.z,d=Math.hypot(dx,dz);if(d<=stop&&aim===dest)return true;
 let move=Math.min(speed*dt,Math.max(0,d-(aim===dest?stop:0)));
 if(e.type==='enemy'&&s.entities.some(w=>w.type==='wire'&&live(w)&&dist(e,w)<6))move*=0.3;
 if(d){e.x+=dx/d*move;e.z+=dz/d*move;e.angle=Math.atan2(dx,dz);}return dist(e,dest)<=stop+0.1&&clearSight(s,e,dest);
}
function damage(s,e,amount){if(!live(e)||dropping(s,e))return;e.hp=Math.max(0,e.hp-amount);if(!live(e)){releaseService(s,e);e.status='destroyed';delete e.order;event(s,'explosion',e.x,e.z,`${e.type} destroyed`);if(e.type==='enemy'){s.kills++;s.resources+=3;}}}
function shoot(s,e,t,amount,interval){
 if(e.cooldown>0||!live(e)||!live(t))return;
 e.cooldown=interval;e.lastShotAt=s.time;e.target=t.id;e.angle=Math.atan2(t.x-e.x,t.z-e.z);
 let shot={};
 if(e.type==='mech'){
  // Persisted pre-Gatling rooms have no serial. Continue valid counters across
  // snapshots and pauses; restart naturally resets them through createGame().
  e.shotSerial=(Number.isSafeInteger(e.shotSerial)&&e.shotSerial>=0?e.shotSerial:0)+1;
  e.lastShotSide='LR';
  shot={sourceId:e.id,targetId:t.id,shotSerial:e.shotSerial,muzzleSide:e.lastShotSide,...(e.role==='artillery'?{weapon:'artillery'}:{})};
 }
 // Exactly one paired volley, one damage application and one impact. Never accumulate
 // missed shots while idle or issue a catch-up burst in a single simulation tick.
 event(s,e.type==='enemy'?'enemy-shot':'shot',e.x,e.z,'',{tx:t.x,tz:t.z,...shot});damage(s,t,amount);event(s,'impact',t.x,t.z,'',shot);
}
function finish(s){
 if(s.phase!=='running')return;
 updateObjectives(s);
 if(s.productionVersion&&s.entities.some(e=>e.type==='mech'&&live(e)))s.recoveryStatus=null;
 const pod=s.entities.find(e=>e.type==='pod'),hive=s.entities.find(e=>e.type==='hive');
 if(!live(pod)){s.phase='lost';s.endReason='pod_destroyed';event(s,'notice',pod.x,pod.z,'Pod lost. Mission failed.');}
 else if(s.productionVersion?!!hive&&!live(hive):(s.mission?s.mission.objectives.every(o=>o.complete):!live(hive))){s.phase='won';s.endReason=s.productionVersion?'hive_destroyed':s.economyVersion?'economy_established':s.mission?'landing_secured':'hive_destroyed';event(s,'notice',pod.x,pod.z,s.productionVersion?'Alien hive destroyed. Frontier mission complete.':s.economyVersion?'Frontier economy established. Crystal supply secured.':'Landing zone secured. Opening mission complete.');}
 else if(!s.entities.some(e=>e.type==='mech'&&live(e))&&(!s.productionVersion||!canRebuildArmy(s))){s.phase='lost';s.endReason=s.productionVersion?'army_unrecoverable':'mechs_destroyed';event(s,'notice',pod.x,pod.z,s.productionVersion?'Army lost and no safe replacement route remains. Restart to try again.':'Both mechs lost. Mission failed.');}
}
function canRebuildArmy(s){
 if(s.entities.some(e=>live(e)&&e.type==='drop-pad'&&e.dropJob&&!e.summonedId))return true;
 const pod=s.entities.find(e=>live(e)&&e.type==='pod');
 const stocks={alloy:s.resources,conductive:s.stockpiles?.conductive||0};
 for(const w of s.entities.filter(e=>live(e)&&e.type==='worker'))stocks[w.cargoType||'alloy']=(stocks[w.cargoType||'alloy']||0)+(w.cargo||0);
 // No army can clear defended deposits. Only presently safe deposits count.
 for(const d of s.deposits)if(!s.entities.some(e=>live(e)&&e.type==='enemy'&&dist(e,d)<32))stocks[d.resourceType||'alloy']=(stocks[d.resourceType||'alloy']||0)+d.remaining;
 const workerReserve=!s.entities.some(e=>live(e)&&e.type==='worker')&&!queuedWorkers(s)&&s.resources>=40?40:0;
 const trial=snapshot(s);trial.powerPriority='production';updatePower(trial);
 const foundries=trial.entities.filter(e=>live(e)&&e.type==='mech-factory');
 const restored=new Set(foundries.filter(e=>e.powered).map(e=>e.id));
 // Restoring a remote grid is not assumed free or remotely buildable. Test
 // deterministic legal HQ-area generator sites; workers do not grant build range.
 if(foundries.some(e=>!e.powered)&&pod){
  for(const radius of [15,25,33])for(let i=0;i<16;i++){
   const angle=i*Math.PI/8,p={x:pod.x+Math.sin(angle)*radius,z:pod.z+Math.cos(angle)*radius};
   if(!point(s,p)||!teamVisible(s,p)||s.deposits.some(d=>dist(d,p)<6)||s.entities.some(e=>live(e)&&!['worker','mech','enemy'].includes(e.type)&&dist(e,p)<8)||!servicePlacementClear(s,'generator',p))continue;
   const copy=snapshot(trial);copy.entities.push({...unit('recovery-generator','generator',p.x,p.z,420)});updatePower(copy);
   for(const f of copy.entities.filter(e=>live(e)&&e.type==='mech-factory'&&e.powered))restored.add(f.id);
  }
 }
 for(const factory of foundries){
  const powerCost=factory.powered?0:restored.has(factory.id)?80:Infinity;
  if(factory.production?.kind==='mech'&&stocks.alloy>=powerCost+workerReserve){s.recoveryStatus='assembly-pending';return true;}
  if(!factory.production&&stocks.alloy>=160+powerCost+workerReserve&&stocks.conductive>=40){s.recoveryStatus='rebuild-available';return true;}
 }
 // A stranded remote job may be cancelled; count only its unfinished refund.
 for(const f of foundries)if(f.production?.kind==='mech')for(const [kind,cost] of Object.entries(f.production.cost))stocks[kind]=(stocks[kind]||0)+cost*Math.max(0,1-f.production.progress);
 let possible=false;
 if(pod&&foundries.length<BUILDINGS['mech-factory'].cap&&stocks.conductive>=90&&stocks.alloy>=340+workerReserve){
  for(let x=Math.max(12,pod.x-36);x<=Math.min(worldSize(s)-12,pod.x+36)&&!possible;x+=4)for(let z=Math.max(12,pod.z-36);z<=Math.min(worldSize(s)-26.5,pod.z+36)&&!possible;z+=4){
   const p={x,z};if(dist(p,pod)>34||!servicePlacementClear(s,'mech-factory',p))continue;
   const copy=snapshot(trial);copy.entities.push({...unit('recovery-foundry','mech-factory',x,z,950)});updatePower(copy);
   // A powered HQ-side foundry is a concrete recoverable option. Do not
   // assume arbitrary remote construction or demolition is available.
   if(copy.entities.find(e=>e.id==='recovery-foundry').powered)possible=true;
  }
 }
 s.recoveryStatus=possible?'rebuild-available':'army-unrecoverable';return possible;
}
function expansionTick(s){
 const expansion=s.expansion;
 if(!expansion||expansion.stage>=2)return;
 const triggered=expansion.stage===0?(s.mission.conductiveDelivered>0||s.entities.some(e=>live(e)&&e.type==='extractor'&&e.depositId==='ore-mid')):(s.mission.mechsProduced>0||s.mission.crystalDelivered>0);
 if(triggered&&expansion.pendingAt===null){expansion.pendingAt=s.time+35;s.nextWaveAt=expansion.pendingAt;event(s,'notice',100,65,'Hive retaliation detected. Reinforce your frontier.');}
 if(expansion.pendingAt!==null&&s.time>=expansion.pendingAt){
  const tier=++expansion.stage;expansion.pendingAt=null;s.nextWaveAt=null;s.wave++;
  const waveSpawn=mapForState(s)?.retaliation[tier-1]||{x:102,z:70};
  for(let i=0;i<(tier===1?4:5);i++)s.entities.push({...unit(`enemy-${s.nextId++}`,'enemy',waveSpawn.x+i*3,waveSpawn.z,tier===1?120:175,-1,tier===2||i===0?'heavy':'raider'),expansionWave:tier});
  event(s,'wave',waveSpawn.x,waveSpawn.z,`Hive retaliation ${tier}/2: defend your outpost!`);
 }
}
function tick(s,dt){
 s.tick++;s.time=s.tick*RULES.tick;
 if(s.productionVersion)expansionTick(s);
 if(!s.productionVersion&&s.wave<RULES.waveTimes.length&&s.time>=RULES.waveTimes[s.wave]){
  s.wave++;for(let i=0;i<10;i++)s.entities.push({...unit(`enemy-${s.nextId++}`,'enemy',70+(i%5)*3,80-Math.floor(i/5)*4,105,-1,i%5===0?'heavy':'raider'),openingSwarm:true});
  s.nextWaveAt=null;event(s,'wave',70,80,'First swarm incoming. Defend the landing zone!');
 }
 const pod=s.entities.find(e=>e.type==='pod'&&live(e));
 updatePower(s,dt);if(s.economyVersion)advanceEconomyJobs(s,dt);
 for(const building of s.entities.filter(e=>live(e)&&e.type==='extractor'&&e.progress<1)){
  let worker=s.entities.find(e=>live(e)&&e.id===building.builderId&&e.order?.type==='construct'&&e.order.targetId===building.id);
  if(!worker){
   worker=s.entities.filter(e=>live(e)&&e.type==='worker'&&e.order?.type!=='construct').sort((a,b)=>dist(a,building)-dist(b,building))[0];
   if(worker){building.builderId=worker.id;worker.order={type:'construct',targetId:building.id};worker.status='building';}
   else {building.hp=0;building.status='cancelled';s.resources+=RULES.extractorCost;event(s,'notice',building.x,building.z,'Construction cancelled. Extractor cost refunded.');}
  }
 }
 for(const e of s.entities){
  if(!live(e))continue;e.cooldown=Math.max(0,e.cooldown-dt);
  if(e.type==='worker'){
   const o=e.order;if(!o)continue;
   const speed=e.cargo>0?RULES.carrySpeed:RULES.workerSpeed;
   if(o.type==='move'){if(travel(s,e,o,speed,dt,0.3)){delete e.order;e.status='idle';}continue;}
   if(o.type==='construct'){
    const b=s.entities.find(t=>t.id===o.targetId&&live(t)&&t.type==='extractor');
    if(!b){delete e.order;e.status='idle';continue;}
    e.status='building';
    if(travel(s,e,workerApproach(e,b),speed,dt,0.25)){
     b.progress=Math.min(1,b.progress+dt/4);
     if(b.progress>=1-1e-9){
      b.progress=1;b.status='online';delete b.builderId;
      e.order={type:'mine',depositId:b.depositId};e.status='mining';
      for(const worker of s.entities.filter(w=>live(w)&&w.type==='worker'&&!w.order)){worker.order={type:'mine',depositId:b.depositId};worker.status='mining';}
      if(s.mission)s.mission.extractorBuilt=true;
      event(s,'notice',b.x,b.z,'Extractor online. Workers mine twice as fast.');
     }
    }continue;
   }
   if(o.type==='mine'){
    const d=s.deposits.find(d=>d.id===o.depositId);
    if(e.cargo>=20-1e-6||['returning','unloading'].includes(e.status)||!d||d.remaining<=0||(e.cargo>0&&(e.cargoType||'alloy')!==(d.resourceType||'alloy'))){
     if(e.status!=='unloading')e.status='returning';
     const fieldDepot=mapForState(s)&&s.entities.find(b=>live(b)&&b.type==='extractor'&&b.progress===1&&b.powered&&b.depositId===d?.id);
     const delivery=fieldDepot||pod;
     if(delivery&&travel(s,e,delivery,speed,dt,fieldDepot?6:10)){
      if(e.status!=='unloading'){e.status='unloading';e.workTimer=0;}
      e.workTimer+=dt;
      if(e.workTimer>=RULES.workPhaseSeconds-1e-9){const kind=e.cargoType||'alloy';if(s.economyVersion&&kind!=='alloy'){s.stockpiles??={conductive:0,crystal:0};s.stockpiles[kind]=(s.stockpiles[kind]||0)+e.cargo;}else s.resources+=e.cargo;if(s.mission){if(kind==='alloy')s.mission.oreDelivered+=e.cargo;else if(kind==='conductive')s.mission.conductiveDelivered=(s.mission.conductiveDelivered||0)+e.cargo;else s.mission.crystalDelivered=(s.mission.crystalDelivered||0)+e.cargo;}event(s,'income',delivery.x,delivery.z,`+${Math.round(e.cargo)} ${kind}`);e.cargo=0;delete e.cargoType;e.status='mining';delete e.workTimer;if(!d||d.remaining<=0){delete e.order;e.status='idle';}}
     }
    }else if(travel(s,e,workerApproach(e,d),speed,dt,0.25)){
     if(e.status!=='picking_up'&&e.workTimer===undefined){e.status='picking_up';e.workTimer=0;}
     if(e.status==='picking_up'){e.workTimer+=dt;if(e.workTimer<RULES.workPhaseSeconds-1e-9)continue;}
     e.status='mining';const rate=s.entities.some(b=>live(b)&&b.type==='extractor'&&b.progress===1&&b.depositId===d.id&&(!s.economyVersion||b.powered))?8:4;const mined=Math.min(rate*dt,d.remaining,20-e.cargo);d.remaining-=mined;if(e.cargo===0)e.cargoType=d.resourceType||'alloy';e.cargo+=mined;}
   }continue;
  }
  if(e.type==='mech'||e.type==='turret'){
   if(dropping(s,e)){e.status='dropping';e.gatlingEngaged=false;e.gatlingSpin=0;continue;}
   if(e.status==='dropping'){e.status='idle';event(s,'notice',e.x,e.z,'Artillery mech landed');}
   if(e.type==='mech'&&e.launch){
    e.gatlingEngaged=false;e.gatlingSpin=0;e.status='launching';
    if(travel(s,e,{x:e.x,z:e.launch.targetZ},mechStats(e).speed,dt,0)){
     e.z=e.launch.targetZ;const factory=s.entities.find(b=>b.id===e.launch.factoryId);if(factory?.launchId===e.id)delete factory.launchId;
     delete e.launch;e.status='idle';event(s,'notice',e.x,e.z,'Reinforcement mech ready');
    }
    continue;
   }
   if(e.upgradeJob||(s.economyVersion&&e.type==='turret'&&!e.powered)){if(e.type==='mech'){e.gatlingEngaged=false;e.gatlingSpin=0;}continue;}
   const o=e.order;
   if(e.type==='mech'&&o?.type==='repair'){
    const repairSite=repairSiteFor(s,e),service=s.economyVersion&&repairSite?.type==='repair-station';
    e.status='repairing';
    const arrived=repairSite&&(service?dockAtStation(s,e,repairSite,dt):travel(s,e,repairSite,mechStats(e).speed,dt,repairSite.type==='repair-station'?2.5:8));
    if(service&&!arrived)e.status=stationOccupied(s,repairSite)?.id===e.id?'moving-to-repair':'waiting-for-repair';
    if(arrived){
     const gain=Math.min((s.economyVersion&&repairSite.type!=='pod'&&!repairSite.powered?0:26)*dt,e.maxHp-e.hp);e.hp+=gain;
     if(e.hp>=e.maxHp-0.001){e.hp=e.maxHp;if(s.mission&&repairSite.type==='repair-station')s.mission.repaired=true;delete e.order;e.status='idle';if(service)departStation(e,repairSite);}
     if(service){e.gatlingEngaged=false;e.gatlingSpin=0;continue;}
    }
   }else if(o?.type==='service-exit'){
    const station=s.entities.find(b=>b.id===o.stationId&&live(b));
    if(!station){delete e.order;e.status='idle';}
    else if(travel(s,e,o,mechStats(e).speed,dt,0)){
     if(o.stage==='front'){o.stage='clear';o.x=Math.max(6,Math.min(worldSize(s)-6,station.x+o.side*12));}
     else {if(station.serviceOccupantId===e.id)delete station.serviceOccupantId;delete e.order;e.status='idle';}
    }
   }else if(o?.type==='move'){if(travel(s,e,o,mechStats(e).speed,dt,0.4)){delete e.order;e.status='idle';}}
   const range=e.type==='turret'?27:e.role==='artillery'?34:e.role==='long-range'?38:23;
   let target=o?.type==='attack'?s.entities.find(t=>t.id===o.targetId&&live(t)):null;
   if(o?.type==='attack'&&!target){delete e.order;e.status='idle';}
   if(target){
    if(teamVisible(s,target)){o.x=target.x;o.z=target.z;if(dist(e,target)>range||!clearSight(s,e,target))travel(s,e,target,mechStats(e).speed,dt,range-1);}
    else {e.status='searching';travel(s,e,o,mechStats(e).speed,dt,0.5);target=null;}
   }
   if(!target||dist(e,target)>range)target=s.entities.filter(t=>live(t)&&hostile(t)&&dist(e,t)<=range&&teamVisible(s,t)&&clearSight(s,e,t)).sort((a,b)=>dist(e,a)-dist(e,b))[0];
   const engaged=!!target&&dist(e,target)<=range&&teamVisible(s,target)&&clearSight(s,e,target);
   if(e.type==='mech'&&e.role==='artillery'){
    e.gatlingEngaged=false;e.gatlingSpin=0;
    if(engaged){e.angle=Math.atan2(target.x-e.x,target.z-e.z);shoot(s,e,target,100*mechStats(e).damageMultiplier,2);}
   }else if(e.type==='mech'){
    // A real pre-fire wind-up. Only authoritative acquisition starts it; repeated
    // orders cannot reset it, skip it, choose a barrel, or bank extra rounds.
    if(engaged){
     if(!e.gatlingEngaged){e.gatlingStartedAt=s.time;e.gatlingEngaged=true;}
     e.gatlingSpin=Math.min(1,Math.max(0,(s.time-e.gatlingStartedAt)/RULES.gatlingSpoolSeconds));
     e.angle=Math.atan2(target.x-e.x,target.z-e.z);
     if(e.gatlingSpin>=1-1e-9)shoot(s,e,target,gatlingDamage(e),GATLING_INTERVAL);
    }else{
     if(e.gatlingEngaged)e.gatlingStoppedAt=s.time;
     e.gatlingEngaged=false;e.gatlingSpin=0;
    }
   }else if(engaged)shoot(s,e,target,12,0.7);
   continue;
  }
  if(e.type==='enemy'){
   let targets=s.entities.filter(t=>live(t)&&!dropping(s,t)&&(['mech','worker','turret','extractor','repair-station','pod'].includes(t.type)||!!BUILDINGS[t.type]));
   let target=targets.filter(t=>dist(t,e)<24).sort((a,b)=>dist(e,a)-dist(e,b))[0];
   if(!target&&(e.role==='guard'||e.stationaryGuard))continue;
   target=target||pod;if(!target)continue;e.target=target.id;e.status='attacking';
   if(travel(s,e,target,e.role==='heavy'?3.4:4.4,dt,5)&&clearSight(s,e,target))shoot(s,e,target,e.role==='heavy'?19:9,1.2);
  }
 }
 for(const f of s.entities)if(f.launchId&&!s.entities.some(e=>e.id===f.launchId&&live(e)&&e.launch))delete f.launchId;
 // Refund destroyed production before terminal-state evaluation, even if this tick ends the mission.
 if(s.productionVersion)for(const e of s.entities)if(!live(e)&&e.production){spend(s,e.production.cost,-Math.max(0,1-e.production.progress));delete e.production;}
 // Corpses are retained briefly for renderer effects, never allowed to grow without bound.
 for(const e of s.entities)if(!live(e)&&e.deadAt===undefined)e.deadAt=s.time;
 s.entities=s.entities.filter(e=>live(e)||['hive','pod','mech'].includes(e.type)||s.time-e.deadAt<8);
 updatePower(s);finish(s);
}
export function step(s,dt){if(!Number.isFinite(dt)||dt<0||dt>60)throw new RangeError('step dt must be between 0 and 60 seconds');if(s.phase!=='running')return s;s.remainder+=dt;while(s.remainder+1e-9>=RULES.tick&&s.phase==='running'){s.remainder-=RULES.tick;tick(s,RULES.tick);}s.remainder=Math.max(0,s.remainder);return s;}
export function snapshot(s){return JSON.parse(JSON.stringify(s));}
