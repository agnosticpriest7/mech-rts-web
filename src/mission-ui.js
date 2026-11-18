// Pure presentation contracts. No simulation mutation or authority lives here.
export function workerClip({hp=100,status='idle',speed=0,cargo=0,turnRate=0}={}){
 if(hp<=0)return 'Shutdown';
 if(status==='picking_up')return 'PickUp';
 if(status==='unloading')return 'PutDown';
 if(speed>.12)return cargo>.05?'CarryWalk':'Walk';
 if(status==='building'||status==='repairing')return 'BuildRepair';
 if(status==='mining'||status==='harvesting')return 'WorkHarvest';
 if(Math.abs(turnRate)>.65)return turnRate>0?'TurnLeft':'TurnRight';
 return 'Idle';
}
export function objectiveTarget(state){
 const next=(state?.mission?.objectives||[]).find(o=>!o.complete),id=next?.id||'complete';
 const entities=state?.entities||[],deposits=state?.deposits||[];
 const station=entities.find(e=>e.type==='repair-station'&&e.hp>0),upgrade=entities.find(e=>e.type==='upgrade-station'&&e.hp>0);
 const foundry=entities.find(e=>e.type==='mech-factory'&&e.hp>0),hive=entities.find(e=>e.type==='hive');
 const target=id==='hive'?hive:['foundry','reinforcement'].includes(id)?foundry:['harvest','extractor'].includes(id)?deposits.find(d=>d.id==='ore-safe'):['conductive','outpost'].includes(id)?deposits.find(d=>d.resourceType==='conductive'):id==='crystal'?deposits.find(d=>d.resourceType==='crystal'):['upgrade','advanced-upgrade'].includes(id)?upgrade:null;
 return {id,title:next?.label||(state?.mission?(state.productionVersion?'Hive neutralized':state.economyVersion?'Powered frontier established':'Landing zone secured'):'Break the hive'),x:target?.x??(['foundry','reinforcement'].includes(id)?48:id==='repair-station'?46:id==='repair'?(station?.x??30):id==='turret'?46:id==='swarm'?62:id==='upgrade-station'?39:30),z:target?.z??(['foundry','reinforcement'].includes(id)?82:id==='repair-station'?138:id==='repair'?(station?.z??120):id==='turret'?105:id==='swarm'?88:id==='upgrade-station'?88:120)};
}
export function objectiveHint(id,controller=false){
 const select=controller?'D-pad cycles to a worker and focuses the camera. Double-tap A for similar workers; A on alloy orders mining.':'Select WORKERS, then right-click cyan alloy. Loads return automatically.';
 const menu=controller?'Select a worker → hold LB/RB → BUILD':'FIELD COMMAND';
 const hints={foundry:`${menu}${controller?'':' → BUILD'} → MECH FOUNDRY. Expand north of HQ toward the conductive seam. Leave its front assembly lane clear. Supply 16 power using generators and relays.`,reinforcement:controller?'Inspect your foundry with X, then hold LB/RB for VANGUARD or LANCER. 160 alloy + 40 conductive, 50 powered seconds. D-pad finds each new mech.':'Select your foundry, then choose VANGUARD or LANCER. 160 alloy + 40 conductive, 50 powered seconds. Each new mech belongs to its ordering pilot.',hive:'Repair your force, then push into alien territory and destroy the hive core. Expansion attracts stronger resistance. Keep HQ alive: lost mechs can be replaced.',harvest:select,extractor:controller?'Select a worker → hold LB/RB → BUILD → EXTRACTOR, aim at alloy, then A.':'Choose EXTRACTOR, then click a cyan alloy deposit.','repair-station':controller?'Select a worker → hold LB/RB → BUILD → SERVICE BAY. Aim at the marked site, then A. First bay and repairs are free.':'Choose SERVICE BAY and place it near HQ. Your first bay is free to place and use.',repair:controller?'D-pad cycles to your Vanguard. Hold LB/RB → REPAIR returns it to a powered service bay.':'Select the damaged Vanguard, then FREE REPAIR. The service bay costs no alloy to use; it needs power.',turret:controller?'Select a worker → hold LB/RB → BUILD → SENTRY. Move cursor to the approach; A places it.':'Place a SENTRY on the marked approach to cover your foothold.',swarm:controller?'D-pad cycles to your mech and focuses the camera. A orders movement or attacks.':'Move mechs toward the approach. They fire automatically in range. Return to the service bay to repair.',conductive:'Escort workers to the amber seam. Clear its guards with mechs, then mine. Only loads returned to HQ count.',outpost:`${menu}${controller?'':' → BUILD'}: place a generator near the conductive seam, or connect a relay chain from HQ. Build an extractor there. Workers can always mine by hand.`,'upgrade-station':`${menu}${controller?'':' → BUILD'} → UPGRADE STATION. Place it within power coverage. Add a generator if demand exceeds supply.`,upgrade:`Select your mech, then ${controller?'hold LB/RB':'FIELD COMMAND'} → UPGRADES. Choose mobility, armor or weapons. The mech travels to a powered station and remains there during installation.`,'advanced-upgrade':`Select a mech with a tier-one upgrade, then ${controller?'hold LB/RB':'FIELD COMMAND'} → UPGRADES. Install tier two using delivered crystals to complete the mission.`,crystal:'Repair and escort workers to the violet crystal pocket. Clear the guards, then return 20 crystals to HQ. Rare materials enable tier-two upgrades.',complete:'Mission complete. Host can restart for another run.'};
 return hints[id]||select;
}
