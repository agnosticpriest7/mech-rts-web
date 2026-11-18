// Presentation helpers only. The server is the sole authority for balances and jobs.
export const RESOURCE_LABELS=Object.freeze({alloy:'Alloy',conductive:'Conductive',crystal:'Crystal'});
export const RESOURCE_COLORS=Object.freeze({alloy:0x84e2c5,conductive:0xe9b66c,crystal:0xb491ed});
export const BUILD_LABELS=Object.freeze({'mech-factory':'Mech foundry',pod:'Anchor HQ',extractor:'Extractor','repair-station':'Service bay',turret:'Autocannon sentry',generator:'Generator',reactor:'Reactor',relay:'Power relay',battery:'Battery','worker-factory':'Worker factory','upgrade-station':'Upgrade station'});
export const UPGRADE_LABELS=Object.freeze({mobility:'Mobility',armor:'Armor',weapons:'Weapons',weapon:'Weapons'});
export function resourceKind(deposit){return deposit?.resource||deposit?.resourceType||deposit?.kind||'alloy';}
export function resourceBalance(state){return {alloy:Math.max(0,state?.resources||0),conductive:Math.max(0,state?.stockpiles?.conductive||0),crystal:Math.max(0,state?.stockpiles?.crystal||0)};}
export function formatCost(cost={}){const chunks=Object.entries(RESOURCE_LABELS).filter(([key])=>cost[key]>0).map(([key,label])=>`${cost[key]} ${label.toLowerCase()}`);return chunks.join(' · ')||'Free';}
export function affordable(state,cost={}){const stock=resourceBalance(state);return Object.keys(stock).every(key=>stock[key]+1e-8>=(cost[key]||0));}
export function shortResource(kind){return RESOURCE_LABELS[kind]||'Alloy';}
export function buildingLabel(kind){return BUILD_LABELS[kind]||String(kind||'Unit').replaceAll('-',' ');}
export function selectedUnitIds(state,selected){return (state?.entities||[]).filter(e=>e.hp>0&&selected.has(e.id)&&['mech','worker'].includes(e.type)).map(e=>e.id);}
export function coverageStatus(state,kind,point,catalog){
 const spec=catalog[kind]||{},nodes=(state?.entities||[]).filter(e=>e.hp>0&&(e.type==='pod'||catalog[e.type]?.radius));
 if(spec.generation)return {connected:true,radius:spec.radius,label:`Independent supply: +${spec.generation} power · ${spec.radius}m coverage`};
 const connected=nodes.some(e=>e.powerConnected!==false&&Math.hypot(e.x-point.x,e.z-point.z)<= (spec.radius?Math.max(spec.radius,e.type==='pod'?36:catalog[e.type].radius):(e.type==='pod'?36:catalog[e.type].radius)));
 return {connected,radius:spec.radius||0,label:connected?`Within grid reach${spec.demand?' · '+spec.demand+' power demand':''}. Supply is allocated after placement.`:'Outside the grid. Link relays to a powered node, or place a local generator.'};
}

export function displayAmount(value){return Math.floor(Math.max(0,Number.isFinite(value)?value:0)+1e-8);}
