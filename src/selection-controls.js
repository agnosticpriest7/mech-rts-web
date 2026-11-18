import {isUnderConstruction} from './economy-rules.js?v=field-playtest-1';

// Match the authoritative ownership boundary, including shared units. Dead,
// hostile and still-launching mechs are not currently playable.
export function playableUnits(entities,playerId=0){
 return entities.filter(e=>e.hp>0&&e.owner!==-1&&(playerId===0||e.owner===0||e.owner===playerId)&&!e.launch&&e.status!=='dropping'&&['mech','worker'].includes(e.type));
}
export function cyclePlayableUnit(entities,selected,delta,playerId=0){
 const units=playableUnits(entities,playerId);
 if(!units.length)return null;
 const current=units.findIndex(e=>selected.has(e.id));
 const index=current<0?(delta<0?units.length-1:0):(current+delta+units.length)%units.length;
 return units[index];
}
export function similarUnitIds(entities,target,playerId=0){
 const units=playableUnits(entities,playerId);
 if(!units.some(e=>e.id===target?.id))return [];
 return units.filter(e=>e.type===target.type&&(e.type!=='mech'||e.role===target.role)).map(e=>e.id);
}

export function contextualOrder(units,target,point,deposits){
 if(!units.length)return null;
 const mechs=units.filter(e=>e.type==='mech').map(e=>e.id),workers=units.filter(e=>e.type==='worker').map(e=>e.id);
 if(target?.owner!==-1&&target?.construction&&isUnderConstruction(target)&&workers.length)return {type:'construct',ids:[workers[0]],targetId:target.id};
 if(target?.owner===-1&&mechs.length)return {type:'attack',ids:mechs,targetId:target.id};
 if(['pod','repair-station'].includes(target?.type)&&mechs.length)return {type:'repair',ids:mechs,targetId:target.id};
 const deposit=target?.type==='extractor'?deposits.find(d=>d.id===target.depositId&&d.remaining>0):deposits.find(d=>d.remaining>0&&Math.hypot(d.x-point.x,d.z-point.z)<7);
 if(deposit&&workers.length)return {type:'mine',ids:workers,depositId:deposit.id};
 return {type:'move',ids:units.map(e=>e.id),x:point.x,z:point.z};
}
export function selectionActions(selected){
 const one=selected.length===1?selected[0]:null;
 if(one?.construction&&isUnderConstruction(one))return ['cancel-construction','hq','objective'];
 if(one?.type==='pod')return ['worker','cancel','build','power','objective'];
 if(one?.type==='worker-factory')return ['worker','cancel','power'];
 if(one?.type==='mech-factory')return ['combat','long-range','cancel','power'];
 if(selected.some(e=>e.type==='worker'))return ['build','hq','objective'];
 if(selected.some(e=>e.type==='mech'))return ['repair','upgrades','hq','objective'];
 if(one?.type==='upgrade-station')return ['upgrades','power','hq'];
 if(one)return ['power','hq','objective'];
 return ['hq','objective'];
}
