/** Presentation-only counts. Pending orbital pads reserve a chassis slot. */
export function squadRoster(state){
 const es=(state?.entities||[]).filter(e=>e.hp>0);
 const active=es.filter(e=>e.type==='mech').length;
 const queued=es.filter(e=>e.type==='mech-factory'&&e.production?.kind==='mech').length+(state?.squadVersion?es.filter(e=>e.type==='drop-pad'&&e.dropJob&&!e.summonedId).length:0);
 return {active,queued};
}
export function squadRoleDescription(role){return ({combat:'FRONTLINE / ANTI-SWARM','long-range':'RANGED / ANTI-HEAVY',artillery:'SIEGE / 7m SPLASH / 12m DEAD ZONE'})[role]||'';}
