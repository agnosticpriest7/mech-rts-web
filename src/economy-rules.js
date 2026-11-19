/** Shared economy catalog and deterministic power allocation; no browser dependencies. */
export const PRODUCTION_RULES=Object.freeze({mechCost:Object.freeze({alloy:160,conductive:40}),mechDuration:50,mechCap:4,hqWorkerDuration:30,workerFactoryDuration:12});
// Squad play is opt-in per newly created room. An occupied or reserved chassis
// uses a team slot; one player's queue cannot crowd the other past the cap.
const chassis=(alloy,conductive,duration,cap)=>Object.freeze({cost:Object.freeze({alloy,conductive}),duration,cap});
const SQUAD_CHASSIS=Object.freeze({combat:chassis(105,25,32,12),'long-range':chassis(130,35,40,12)});
const CLASSIC_CHASSIS=chassis(160,40,50,4);
export const squadProduction=(s,role='combat')=>s?.squadVersion===1?(SQUAD_CHASSIS[role]||SQUAD_CHASSIS.combat):CLASSIC_CHASSIS;
// Paid, on-site worker time. Travel is additional; orbital beacons deliberately
// keep their separate charge/descent sequence instead of pretending to be built.
export const CONSTRUCTION_DURATIONS=Object.freeze({extractor:6,wire:4,relay:5,battery:7,generator:8,turret:8,reactor:12,'worker-factory':12,'repair-station':12,'upgrade-station':14,'mech-factory':20});
export const isUnderConstruction=e=>Number.isFinite(e?.progress)&&e.progress<1;
export const BUILDINGS=Object.freeze({
 generator:{label:'Generator',cost:{alloy:80},hp:420,cap:6,generation:18,radius:34},
 reactor:{label:'Reactor',cost:{alloy:110,conductive:40},hp:600,cap:4,generation:44,radius:38},
 relay:{label:'Power relay',cost:{alloy:25},hp:220,cap:10,radius:30},
 battery:{label:'Battery',cost:{alloy:60,conductive:20},hp:350,cap:6,radius:18,capacity:180,rate:12},
 'drop-pad':{label:'Artillery drop pad',cost:{alloy:240,conductive:60,crystal:20},hp:850,cap:1,demand:12,category:'production'},
 'mech-factory':{label:'Mech foundry',cost:{alloy:180,conductive:50},hp:950,cap:2,demand:16,category:'production'},
 'worker-factory':{label:'Worker factory',cost:{alloy:90,conductive:25},hp:500,cap:3,demand:8,category:'production'},
 'upgrade-station':{label:'Upgrade station',cost:{alloy:100,conductive:35},hp:600,cap:3,demand:10,category:'production'},
 extractor:{label:'Extractor',cost:{alloy:60},hp:400,cap:8,demand:4,category:'production'},
 turret:{label:'Sentry',cost:{alloy:70},hp:320,cap:8,demand:6,category:'defense'},
 'repair-station':{label:'Service bay',cost:{alloy:50},hp:450,cap:3,demand:6,category:'repair'},
});
export const UPGRADES=Object.freeze({
 mobility:{label:'Mobility servos',description:'+18% speed per tier',levels:[{cost:{alloy:60,conductive:20},duration:20},{cost:{alloy:100,conductive:40,crystal:20},duration:30}]},
 armor:{label:'Composite armor',description:'+25% hull, -7% speed per tier',levels:[{cost:{alloy:70,conductive:25},duration:25},{cost:{alloy:120,conductive:45,crystal:25},duration:35}]},
 weapons:{label:'Gatling accelerator',description:'+22% damage, -4% speed per tier',levels:[{cost:{alloy:80,conductive:30},duration:30},{cost:{alloy:130,conductive:50,crystal:30},duration:40}]},
});
export function resourceStockpile(s){return {alloy:s.resources||0,conductive:s.stockpiles?.conductive||0,crystal:s.stockpiles?.crystal||0};}
export function buildingCost(s,kind){return kind==='repair-station'&&s.mission&&!s.mission.repairStationFreeUsed?{alloy:0}:{...(BUILDINGS[kind]?.cost||{})};}
export function canAfford(s,cost){const stocks=resourceStockpile(s);return Object.entries(cost).every(([k,v])=>stocks[k]>=v-1e-8);}
export function spend(s,cost,multiplier=1){for(const [k,v] of Object.entries(cost)){if(k==='alloy')s.resources=Math.max(0,s.resources-v*multiplier);else {s.stockpiles??={conductive:0,crystal:0};s.stockpiles[k]=Math.max(0,(s.stockpiles[k]||0)-v*multiplier);}}}
export function costLabel(cost){return Object.entries(cost).filter(([,v])=>v>0).map(([k,v])=>`${v} ${k}`).join(' + ')||'free';}
export function mechStats(e){const u=e.upgrades||{},mobility=u.mobility||0,armor=u.armor||0,weapons=u.weapons||0;return {speed:(e.role==='artillery'?1.5:4.32)*(1+.18*mobility)*(1-.07*armor-.04*weapons),maxHp:(e.role==='artillery'?1600:e.role==='long-range'?460:650)*(1+.25*armor),damageMultiplier:1+.22*weapons};}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),alive=e=>e.hp>0;
const categoryOrder={defense:['defense','repair','production'],repair:['repair','defense','production'],production:['production','defense','repair']};
/** Connected components prevent a distant generator/battery from energizing an unrelated outpost. */
export function updatePower(s,dt=0){
 if(!s.economyVersion)return;
 const living=s.entities.filter(alive),all=living.filter(e=>!e.construction||!isUnderConstruction(e)),nodes=all.filter(e=>e.type==='pod'||BUILDINGS[e.type]?.radius),visited=new Set(),components=[];
 // Preserve old snapshots' extractor rules, but new foundations cannot supply,
 // relay, store or consume power before their worker has finished the structure.
 for(const e of living)if(e.construction&&isUnderConstruction(e)){e.powered=false;e.powerConnected=false;e.powerDemand=0;}
 const radius=e=>e.type==='pod'?36:BUILDINGS[e.type].radius;
 for(const node of nodes){if(visited.has(node.id))continue;const group=[],queue=[node];visited.add(node.id);while(queue.length){const n=queue.shift();group.push(n);for(const other of nodes)if(!visited.has(other.id)&&distance(n,other)<=Math.max(radius(n),radius(other))){visited.add(other.id);queue.push(other);}}components.push({nodes:group,loads:[]});}
 const priority=categoryOrder[s.powerPriority]?s.powerPriority:'defense',order=categoryOrder[priority];
 const summary={generation:0,demand:0,supplied:0,stored:0,capacity:0,priority,discharging:0,charging:0,unpowered:0};
 for(const e of all){const spec=BUILDINGS[e.type];if(!spec&&e.type!=='pod')continue;e.powerDemand=e.type==='drop-pad'&&e.summonedId?0:spec?.demand||0;e.powered=false;e.powerConnected=false;if(e.type==='battery'){e.energy=Math.max(0,Math.min(spec.capacity,Number.isFinite(e.energy)?e.energy:0));summary.stored+=e.energy;summary.capacity+=spec.capacity;}}
 for(const e of all.filter(e=>BUILDINGS[e.type]?.demand)){
  summary.demand+=e.powerDemand;
  const candidates=components.map((c,i)=>({i,live:c.nodes.some(n=>n.type==='pod'||BUILDINGS[n.type]?.generation>0||(n.type==='battery'&&n.energy>0)),d:Math.min(...c.nodes.map(n=>distance(n,e)<=radius(n)?distance(n,e):Infinity))})).filter(c=>Number.isFinite(c.d)).sort((a,b)=>Number(b.live)-Number(a.live)||a.d-b.d||a.i-b.i);
  if(candidates.length){components[candidates[0].i].loads.push(e);e.powerConnected=true;}
 }
 for(const c of components){
  const generation=c.nodes.reduce((sum,n)=>sum+(n.type==='pod'?24:BUILDINGS[n.type]?.generation||0),0),batteries=c.nodes.filter(n=>n.type==='battery').sort((a,b)=>a.id.localeCompare(b.id));
  const availableStorage=batteries.reduce((sum,n)=>sum+Math.min(BUILDINGS.battery.rate,n.energy/(dt||.05)),0);
  let budget=generation+availableStorage,used=0;
  c.loads.sort((a,b)=>order.indexOf(BUILDINGS[a.type].category)-order.indexOf(BUILDINGS[b.type].category)||a.id.localeCompare(b.id));
  for(const e of c.loads){if(e.powerDemand<=budget+1e-8){e.powered=true;budget-=e.powerDemand;used+=e.powerDemand;}}
  for(const n of c.nodes){n.powerConnected=generation>0||availableStorage>0;n.powered=n.powerConnected;}
  let deficit=Math.max(0,used-generation),spare=Math.max(0,generation-used);
  for(const b of batteries){const drain=Math.min(deficit,BUILDINGS.battery.rate,b.energy/(dt||.05));if(drain>0){b.energy=Math.max(0,b.energy-drain*dt);deficit-=drain;summary.discharging+=drain;}else if(spare>0){const charge=Math.min(spare,BUILDINGS.battery.rate,(BUILDINGS.battery.capacity-b.energy)/(dt||.05));b.energy=Math.min(BUILDINGS.battery.capacity,b.energy+charge*dt);spare-=charge;summary.charging+=charge;}}
  summary.generation+=generation;summary.supplied+=used;
 }
 summary.stored=all.filter(e=>e.type==='battery').reduce((sum,e)=>sum+e.energy,0);summary.unpowered=all.filter(e=>e.powerDemand>0&&!e.powered).length;s.power=summary;
}
