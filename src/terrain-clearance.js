/** Terrain dressing is cosmetic. Clear its meshes around authored structures so
 * rocks do not protrude through pads. This does not add navigation/collision. */
const footprints={'drop-pad':[22,22],pod:[18,18],extractor:[10,10],turret:[7,7],generator:[7,6],reactor:[7,7],relay:[7.6,6],battery:[7,6],'worker-factory':[8,8],'mech-factory':[24,24],'repair-station':[16,14],'upgrade-station':[16,14]};
export function structureTerrainZones(entities){
 const zones=[];
 for(const e of entities){const size=footprints[e.type];if(!size||e.hp<=0)continue;
  zones.push({x:e.x,z:e.z,halfWidth:size[0]/2+.5,halfDepth:size[1]/2+.5});
  if(e.type==='mech-factory')zones.push({x:e.x,z:e.z+19.25,halfWidth:8,halfDepth:7.75});
  if(e.type==='repair-station'||e.type==='upgrade-station')zones.push({x:e.x,z:e.z+13,halfWidth:20,halfDepth:8});
 }
 return zones;
}
export function terrainIntersectsZones(item,zones){return zones.some(z=>Math.abs(item.x-z.x)<z.halfWidth+item.rx&&Math.abs(item.z-z.z)<z.halfDepth+item.rz);}
