export function contextualOrder(units,target,point,deposits){
 if(!units.length)return null;
 const mechs=units.filter(e=>e.type==='mech').map(e=>e.id),workers=units.filter(e=>e.type==='worker').map(e=>e.id);
 if(target?.owner===-1&&mechs.length)return {type:'attack',ids:mechs,targetId:target.id};
 if(['pod','repair-station'].includes(target?.type)&&mechs.length)return {type:'repair',ids:mechs,targetId:target.id};
 const deposit=target?.type==='extractor'?deposits.find(d=>d.id===target.depositId&&d.remaining>0):deposits.find(d=>d.remaining>0&&Math.hypot(d.x-point.x,d.z-point.z)<7);
 if(deposit&&workers.length)return {type:'mine',ids:workers,depositId:deposit.id};
 return {type:'move',ids:units.map(e=>e.id),x:point.x,z:point.z};
}
export function selectionActions(selected){
 const one=selected.length===1?selected[0]:null;
 if(one?.type==='pod')return ['worker','cancel','build','power','objective'];
 if(one?.type==='worker-factory')return ['worker','cancel','power'];
 if(one?.type==='mech-factory')return ['combat','long-range','cancel','power'];
 if(selected.some(e=>e.type==='worker'))return ['build','hq','objective'];
 if(selected.some(e=>e.type==='mech'))return ['repair','upgrades','hq','objective'];
 if(one?.type==='upgrade-station')return ['upgrades','power','hq'];
 if(one)return ['power','hq','objective'];
 return ['hq','objective'];
}
