/** Lightweight economy art. Metres, Y up, +Z entry. Cosmetic only: no game state writes.
 * Six material batches and one box geometry at most per building. No per-update allocation.
 * Caller positions root and calls update(entity, simulationTime); dispose when removed. */
export const ECONOMY_BUILDING_TYPES=Object.freeze(['generator','reactor','relay','battery','worker-factory','upgrade-station']);
export const ECONOMY_ART_FOOTPRINTS=Object.freeze({generator:[7,6],reactor:[7,7],relay:[7.6,6],battery:[7,6],'worker-factory':[8,8],'upgrade-station':[16,14]});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function createEconomyBuilding(T,type){
 if(!ECONOMY_BUILDING_TYPES.includes(type))throw new RangeError(`Unknown economy building: ${type}`);
 const root=new T.Group();root.name=`Economy ${type}`;root.userData.economyArt=true;
 if(type==='upgrade-station')root.userData.clearance={footprint:[16,14],laneWidth:13.2,minimumOverhead:13.2,vehicleHeight:12,maximumDockOffset:.3,humanDoorHeight:2.2,railHeight:1.1,openFront:true};
 const structure=new T.Group();structure.name='Commissioning structure';root.add(structure);
 const geometry=new T.BoxGeometry(1,1,1);
 const materials=[
  new T.MeshStandardMaterial({color:0x68736a,roughness:.72,metalness:.5}),
  new T.MeshStandardMaterial({color:0x172729,roughness:.8,metalness:.35}),
  new T.MeshStandardMaterial({color:0xbbc1a9,roughness:.53,metalness:.6}),
  new T.MeshStandardMaterial({color:0xd9a04a,roughness:.6,metalness:.4}),
  new T.MeshStandardMaterial({color:0x78e2cf,emissive:0x3cb8a5,emissiveIntensity:.7,roughness:.35,metalness:.3}),
  new T.MeshStandardMaterial({color:0x244451,roughness:.4,metalness:.7}),
 ];
 const parts=materials.map(()=>[]),meshes=[],rotors=[],arms=[],chargeBars=[];
 const inverse=new T.Matrix4(),matrix=new T.Matrix4();let disposed=false,lastTime=null,motionTime=0,lastPowered=true,lastConnected=true,lastProgress=1,lastCharge=0;
 const group=(name,parent=structure)=>{const g=new T.Group();g.name=name;parent.add(g);return g;};
 function box(m,x,y,z,w,h,d,parent=structure,ry=0){const n=new T.Object3D();n.position.set(x,y,z);n.scale.set(w,h,d);n.rotation.y=ry;parent.add(n);parts[m].push(n);return n;}
 const [width,depth]=ECONOMY_ART_FOOTPRINTS[type];
 box(1,0,type==='upgrade-station'?.005:.12,0,width,type==='upgrade-station'?.01:.24,depth,root);box(2,0,type==='upgrade-station'?.012:.28,0,width-.3,type==='upgrade-station'?.004:.08,depth-.3,root);
 for(const side of [-1,1]){
  box(3,side*(width/2-.3),.335,0,.15,.03,depth-.7,root);
  for(const z of [-depth/2+.5,depth/2-.5]){box(1,side*(width/2-.55),.2,z,.8,.4,.8,root);box(2,side*(width/2-.55),.42,z,.65,.08,.65,root);}
 }
 function vent(x,y,z,w=1.5){box(1,x,y,z,w,1,.12);for(let i=0;i<5;i++)box(2,x,y-.4+i*.2,z+.08,w-.15,.035,.06);}
 function panel(x,y,z){box(1,x,y,z,1.1,.8,.16);box(5,x,y+.1,z+.1,.9,.42,.05);box(4,x-.34,y-.23,z+.13,.16,.08,.05);box(3,x+.28,y-.23,z+.13,.25,.08,.05);}
 function lamp(x,y,z,w=1){box(1,x,y,z,w+.12,.22,.22);box(4,x,y,z+.13,w,.12,.05);}
 function humanDoor(x,z,floor=.35){
  const door=group('Human service door');door.position.set(x,floor,z);door.userData.clearance={width:1,height:2.2};
  box(1,0,1.1,0,1,2.2,.04,door);box(2,-.55,1.1,.04,.1,2.2,.08,door);box(2,.55,1.1,.04,.1,2.2,.08,door);box(2,0,2.25,.04,1.2,.1,.08,door);
  box(3,.31,1.05,.095,.035,.25,.035,door);box(4,0,2.39,.04,.7,.07,.04,door);
 }
 function rail(x,z,length,floor){
  const g=group('Human 1.1m guardrail');g.position.set(x,floor,z);g.userData.railHeight=1.1;
  for(let i=0;i<4;i++)box(3,0,.55,-length/2+i*length/3,.07,1.1,.07,g);
  for(const y of [.55,1.07])box(3,0,y,0,.07,.06,length,g);
 }
 if(type==='generator'){
  // Two compact turbine housings with exposed rotating cooling fans.
  for(const side of [-1,1]){
   const x=side*1.65;box(0,x,1.65,-.25,2.5,2.4,4.5);box(2,x,2.95,-.25,2.25,.2,4.3);
   box(1,x,1.65,2.04,1.95,1.95,.18);const fan=group('Generator cooling fan');fan.position.set(x,1.65,2.17);
   box(2,0,0,0,.3,.3,.15,fan);for(let i=0;i<2;i++){const blade=box(2,0,0,0,1.5,.18,.1,fan);blade.rotation.z=i*Math.PI/2+.25;}rotors.push({node:fan,axis:'z',speed:2.8});
   box(1,x,3.5,-1.65,.6,1.1,.7);box(2,x,4.1,-1.65,.85,.15,.9);lamp(x,2.7,2.08,1.35);
  }
  box(1,0,1,-.4,.6,1.35,3.7);panel(0,1,2.5);
 }else if(type==='reactor'){
  // An eight-sided armored core with tall separated radiator towers.
  box(1,0,.7,0,4.5,.7,4.5);box(5,0,2.8,0,2.4,4,2.4);
  for(let i=0;i<8;i++){const a=i*Math.PI/4,x=Math.sin(a)*1.8,z=Math.cos(a)*1.8;
   box(0,x,2.65,z,1.35,3.7,.35,structure,a);box(2,x,4.7,z,1.5,.3,.5,structure,a);
   box(4,Math.sin(a)*2.01,2.9,Math.cos(a)*2.01,.2,2.5,.08,structure,a);
  }
  box(2,0,4.95,0,3.6,.25,3.6);box(1,0,5.25,0,2.1,.4,2.1);box(4,0,5.5,0,1.7,.08,1.7);
  for(const sx of [-1,1])for(const sz of [-1,1]){box(1,sx*2.7,2.3,sz*2.7,.65,4,.65);for(let k=0;k<7;k++)box(2,sx*2.7,.7+k*.5,sz*2.7,1,.15,1);}
  panel(0,1.25,3.18);
 }else if(type==='relay'){
  box(0,0,1.15,0,2.3,1.6,2.5);box(2,0,2.05,0,2.6,.2,2.8);panel(0,1.3,1.34);
  for(const side of [-1,1]){box(2,side*.48,4.9,0,.2,5.6,.2);box(1,0,3.9+side*.7,0,1.2,.22,.4);}
  box(2,0,7.75,0,2.8,.2,.25);for(const side of [-1,1]){box(1,side*1.2,7.5,0,.4,1.3,.4);lamp(side*1.2,8.2,0,.18);}
  box(4,0,8.5,0,.15,.8,.15);
  for(const side of [-1,1]){box(2,side*2.45,2.35,0,2.65,.13,4.6);box(5,side*2.45,2.45,0,2.45,.05,4.35);for(let i=0;i<5;i++)box(2,side*2.45,2.49,-1.85+i*.92,2.45,.02,.025);}
 }else if(type==='battery'){
  // Six upright cartridge cells, with a readable five-segment charge column.
  for(const x of [-2.1,0,2.1])for(const z of [-1.15,1.15]){
   box(1,x,1.75,z,1.65,2.8,1.6);box(0,x,1.75,z,1.4,2.5,1.4);box(2,x,3.27,z,1.7,.25,1.65);box(3,x,3.48,z,.7,.16,.5);
   box(2,x,.8,z,1.7,.22,1.65);box(2,x,2.65,z,1.7,.22,1.65);
  }
  box(1,0,1.75,2.4,1,2.8,.35);for(let i=0;i<5;i++)chargeBars.push(box(4,0,.8+i*.45,2.61,.65,.24,.08));
  lamp(0,3.36,2.4,.65);
 }else if(type==='worker-factory'){
  // Open front assembly lane sized for the 2m worker, not a solid placeholder box.
  box(1,0,.45,0,4.2,.24,6.5);for(let i=0;i<12;i++)box(2,0,.6,-2.8+i*.5,3.8,.09,.2);
  for(const side of [-1,1]){box(0,side*3,2.15,-.6,1.45,3.6,5.8);box(2,side*3,4.1,-.6,1.6,.25,6);vent(side*3,2.5,2.35,1.05);lamp(side*3,3.6,2.4,.85);}
  box(0,0,2.3,-3.15,4.8,3.9,.65);box(2,0,4.4,-1.15,6.7,.35,4.6);box(5,0,4.62,-1.15,4.5,.08,2.6);
  for(const side of [-1,1]){const arm=group('Factory tool arm');arm.position.set(side*2.25,2.75,-1);box(3,-side*.45,0,0,.9,.25,.35,arm);box(1,-side*.85,-.3,0,.25,.65,.25,arm);box(4,-side*.85,-.65,0,.12,.12,.2,arm);arms.push({node:arm,side,kind:'factory'});}
  panel(3,1.35,2.48);humanDoor(-3,2.43);
  // Human-sized roof service railing, not an enlarged mech-production facade.
  rail(-2.8,-1.1,3.7,4.575);rail(2.8,-1.1,3.7,4.575);
  const ladder=group('Human maintenance ladder');ladder.position.set(-3.85,.35,-2.7);
  for(const z of [-.26,.26])box(2,0,2.15,z,.06,4.3,.06,ladder);
  for(let i=0;i<15;i++)box(2,0,.15+i*.28,0,.08,.04,.58,ladder);
 }else{
  // Reference-led open-front service pad. Its lane admits a 12m mech turning in place.
  // Human access stays outside |x|6.6, while independent crane booms clear the head.
  box(1,0,.018,0,13.2,.008,12.7);
  for(const side of [-1,1]){
   box(0,side*7.25,7.25,-4.6,.9,13.8,1.1);box(2,side*7.25,14.3,-4.6,1.1,.3,1.3);
   box(1,side*7.25,7.1,-3.97,.32,12.9,.18);box(2,side*7.25,7.1,-3.83,.12,12.3,.12);
   // Each boom stops before center rather than forming a low entrance lintel.
   box(0,side*5.55,13.6,-4.6,4.4,.8,1.05);box(2,side*5.55,14.05,-4.6,4.6,.1,1.1);box(4,side*5.55,13.23,-4.03,3.5,.06,.06);
   box(1,side*3.6,13.37,-4.6,.55,.3,.85);box(3,side*3.6,13.57,-4.6,.7,.45,.95);
   // Side equipment bunker and 2.2m personnel entrance establish the human datum.
   box(0,side*7.25,1.52,-4.35,1.2,2.34,2.2);box(2,side*7.25,2.75,-4.35,1.25,.12,2.3);humanDoor(side*7.25,-3.18);
   // Catwalk deck at 2.7m, with 1.1m rails and 180mm stair risers.
   box(1,side*7.25,2.61,0,1.3,.18,6);box(2,side*7.25,2.715,0,1.3,.03,6);
   rail(side*6.65,0,5.85,2.73);rail(side*7.85,0,5.85,2.73);
   for(let i=0;i<15;i++){const z=3.12+i*.24,top=2.7-i*.18;box(2,side*7.25,top-.045,z,1,.09,.25);}
   for(const edge of [-.55,.55]){
    for(let i=0;i<5;i++){const z=3.12+i*.84,floor=2.7-i*.63;box(3,side*7.25+edge,floor+.55,z,.055,1.1,.055);}
    const handrail=box(3,side*7.25+edge,2.54,4.8,.055,.06,4.2);handrail.rotation.x=Math.atan2(2.52,3.36);
   }
   for(let i=0;i<6;i++)box(3,side*7.25,3.9+i*1.7,-3.93,.85,.16,.06);
   // Heads travel vertically beside the vehicle, never through its turning envelope.
   const arm=group('Upgrade service head');arm.position.set(side*7.25,7.4,-2.65);
   box(2,0,0,0,.5,1.4,1.5,arm);box(3,-side*.25,-.3,.45,.5,.3,.4,arm);box(4,-side*.57,-.3,.45,.06,.2,.25,arm);arms.push({node:arm,side,kind:'upgrade'});
   lamp(side*7.25,.7,6.65,.7);
  }
  for(let i=0;i<10;i++)box(3,0,.026,-5+i*1.1,1.2,.008,.1);
  for(const side of [-1,1])for(let i=0;i<12;i++)box(3,side*6.35,.026,-5.8+i, .1,.008,.65);

 }
 for(let k=0;k<parts.length;k++)if(parts[k].length){const mesh=new T.InstancedMesh(geometry,materials[k],parts[k].length);mesh.name=`${type} material ${k}`;mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);meshes.push({mesh,parts:parts[k]});}
 function update(entity={},time=0){
  if(disposed)return;
  time=Number.isFinite(time)?Math.max(0,time):0;
  const powered=entity.powered!==false,connected=entity.powerConnected!==false;
  const active=powered&&connected&&(!!entity.active||['producing','upgrading','working'].includes(entity.status)||!!entity.production||!!entity.productionJob||!!entity.upgradeJob||Number.isFinite(entity.upgradeProgress));
  if(lastTime===null||time<lastTime)motionTime=time;else if(powered&&connected&&(rotors.length||active))motionTime+=time-lastTime;
  lastTime=time;lastPowered=powered;lastConnected=connected;
  const build=entity.buildProgress??entity.progress??1;lastProgress=Number.isFinite(build)?clamp(build):1;structure.scale.y=.15+.85*lastProgress;
  materials[4].color.setHex(powered&&connected?0x78e2cf:connected?0xd9a04a:0xc16b58);materials[4].emissive.copy(materials[4].color);materials[4].emissiveIntensity=powered&&connected?(active?.85:.45):.12;
  for(const {node,axis,speed} of rotors)node.rotation[axis]=motionTime*speed;
  if(active)for(const {node,side,kind} of arms){if(kind==='factory')node.rotation.y=side*Math.sin(motionTime*1.8)*.22;else node.position.y=7.4+Math.sin(motionTime*1.2)*.55;}
  const charge=entity.energy??entity.batteryCharge??entity.charge??entity.stored??0,capacity=entity.batteryCapacity??entity.capacity??180;lastCharge=clamp(Number.isFinite(charge)&&Number.isFinite(capacity)&&capacity>0?charge/capacity:0);
  for(let i=0;i<chargeBars.length;i++)chargeBars[i].scale.x=.65*(lastCharge>i/5?1:.12);
  root.updateWorldMatrix(true,true);inverse.copy(root.matrixWorld).invert();
  for(const batch of meshes){for(let i=0;i<batch.parts.length;i++)batch.mesh.setMatrixAt(i,matrix.multiplyMatrices(inverse,batch.parts[i].matrixWorld));batch.mesh.instanceMatrix.needsUpdate=true;}
 }
 root.traverse(node=>{node.userData.sharedAsset=true;});
 update({},0);
 return {root,update,dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const {mesh} of meshes)mesh.dispose();geometry.dispose();for(const material of materials)material.dispose();},diagnostics(){return {type,disposed,clearance:root.userData.clearance??null,drawCallsUpperBound:meshes.length,parts:parts.reduce((sum,p)=>sum+p.length,0),triangles:parts.reduce((sum,p)=>sum+p.length,0)*12,geometries:1,materials:materials.length,powered:lastPowered,connected:lastConnected,progress:lastProgress,charge:lastCharge,motionTime};}};
}
