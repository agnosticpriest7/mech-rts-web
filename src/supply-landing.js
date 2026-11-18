/** Cosmetic support modules. All animation is sampled from the shared intro clock. */
export const SUPPLY_IMPACTS=Object.freeze([6.3,6.7]);
export const SUPPLY_SITES=Object.freeze([[18,136],[48,121]].map(Object.freeze));
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,u)=>a+(b-a)*u;
export function sampleSupplyLanding(time,index=0){
 const t=Number.isFinite(time)?clamp(time,0,18):0,m=index===1?1:0,impact=SUPPLY_IMPACTS[m],age=t-impact;
 // Starts moving immediately; no airborne hold before its turn in the camera.
 const altitude=t<4?90*(1-ease(t/4))+6:6*(1-ease((t-4)/(impact-4)));
 const legs=ease((t-(impact-2.1))/1.55);
 const compression=age>0&&age<1.1?-.25*Math.sin(Math.PI*age/1.1)*Math.exp(-age*1.8):0;
 return {time:t,impact,altitude,legs,compression,doors:ease((t-impact-1.95)/1.75),ramp:ease((t-impact-.35)/1.6),wings:ease((t-impact-.75)/2.5),mast:ease((t-impact-2)/2.7),thruster: t<impact?clamp(altitude/3)*(.45+.55*ease(t/2)):0};
}

export function createSupplyModules(THREE,parent){
 const root=new THREE.Group();root.name='Deploying support modules';parent.add(root);
 const geometry=new THREE.BoxGeometry(1,1,1);
 const materials=[
  new THREE.MeshStandardMaterial({color:0x73817b,roughness:.7,metalness:.5}),
  new THREE.MeshStandardMaterial({color:0x172a2e,roughness:.84,metalness:.3}),
  new THREE.MeshStandardMaterial({color:0xa1aba2,roughness:.5,metalness:.7}),
  new THREE.MeshStandardMaterial({color:0xe5a44d,emissive:0x6e3208,emissiveIntensity:.35,roughness:.6,metalness:.3}),
  new THREE.MeshStandardMaterial({color:0x68d8cd,emissive:0x276e67,emissiveIntensity:.6,roughness:.5,metalness:.3}),
  new THREE.MeshStandardMaterial({color:0x173e56,roughness:.38,metalness:.65}),
 ];
 const parts=materials.map(()=>[]),modules=[],meshes=[],v0=new THREE.Vector3(),v1=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
 const rootInverse=new THREE.Matrix4(),instanceMatrix=new THREE.Matrix4();
 let disposed=false,lastTime=0,lastActive=false,lastSettled=false;
 const group=(name,parent)=>{const g=new THREE.Group();g.name=name;parent.add(g);return g;};
 function part(material,parent,x,y,z,w,h,d,rz=0){const o=new THREE.Object3D();o.position.set(x,y,z);o.scale.set(w,h,d);o.rotation.z=rz;parent.add(o);parts[material].push(o);return o;}
 for(let m=0;m<2;m++){
  const anchor=group(m===0?'Cargo module':'Relay module',root);anchor.position.set(SUPPLY_SITES[m][0],0,SUPPLY_SITES[m][1]);
  const body=group('Suspended armored chassis',anchor),accent=m===0?3:4;
  part(1,body,0,.75,0,3.9,.35,3.65);part(0,body,0,3.95,0,3.7,.3,3.45);
  part(1,body,0,4.13,0,3.2,.12,3);part(0,body,0,2.35,-1.7,3.65,2.9,.22);
  for(const side of [-1,1]){
   part(0,body,side*1.82,2.35,0,.25,2.9,3.5);
   part(2,body,side*1.72,2.35,-1.62,.18,3.2,.18);
   part(2,body,side*1.72,2.35,1.62,.18,3.2,.18);
   part(accent,body,side*1.97,3.45,0,.08,.18,2.8);
   for(let k=0;k<5;k++)part(1,body,side*1.97,1.7+k*.23,-.6,.08,.09,1.35);
   part(1,body,side*1.3,.4,-.8,.65,.45,.65);
   part(2,body,side*1.3,.38,-.8,.82,.16,.82);
  }
  const legs=[];
  for(const sx of [-1,1])for(const sz of [-1,1]){
   const foot=part(2,anchor,sx*2.65,.13,sz*2.1,.95,.26,.85);
   const sole=part(1,anchor,sx*2.65,.045,sz*2.1,1.06,.09,.95);
   const link=part(2,anchor,0,0,0,.24,1,.24);
   const piston=part(1,anchor,0,0,0,.38,1,.38);
   legs.push({sx,sz,foot,sole,link,piston});
  }
  const doors=[],wings=[],hatches=[];
  let ramp=null,mast=null;
  if(m===0){
   // Cargo is actually exposed when the front doors and access ramp unfold.
   for(const side of [-1,1]){
    const hinge=group('Cargo door hinge',body);hinge.position.set(side*1.77,2.3,1.83);
    part(0,hinge,-side*.85,0,0,1.7,2.65,.18);part(1,hinge,-side*.85,0,.12,1.42,2.25,.08);
    part(accent,hinge,-side*.85,.8,.19,1.4,.17,.08);part(2,hinge,-side*.22,-.2,.2,.1,.5,.12);
    doors.push({hinge,side});
   }
   ramp=group('Cargo access ramp hinge',body);ramp.position.set(0,.78,2.04);
   part(2,ramp,0,0,1.14,3.45,.16,2.28);
   for(let k=0;k<7;k++)part(1,ramp,0,.105,.22+k*.31,3.1,.06,.1);
   for(const x of [-.95,.95])for(const z of [-.85,.45]){
    part(3,body,x,1.35,z,1.24,.9,1.05);part(1,body,x,1.35,z,1.3,.13,1.1);
    part(2,body,x,1.85,z,1.3,.12,1.1);
   }
   part(3,body,0,3.75,1.84,1.8,.2,.13);
  }else{
   part(0,body,0,2.3,1.78,3.5,2.9,.24);
   part(1,body,0,2.45,1.95,2.6,1.75,.16);part(4,body,0,2.8,2.05,1.8,.15,.07);
   for(const side of [-1,1]){
    part(2,body,side*1.98,3.65,0,.28,.22,.35);
    const hinge=group('Solar wing hinge',body);hinge.position.set(side*2.12,3.65,0);
    part(2,hinge,side*1.35,0,0,2.7,.15,3.25);part(5,hinge,side*1.35,.095,0,2.48,.04,3.02);
    for(let k=0;k<5;k++)part(2,hinge,side*(.2+k*.56),.13,0,.025,.018,3.02);
    for(let k=0;k<5;k++)part(2,hinge,side*1.35,.13,-1.4+k*.7,2.48,.018,.025);
    wings.push({hinge,side});
    const hatch=group('Mast hatch hinge',body);hatch.position.set(side*.65,4.15,0);
    part(0,hatch,-side*.32,0,0,.64,.15,1.4);hatches.push({hatch,side});
   }
   part(1,body,0,4.15,0,.55,.35,.55);
   mast=group('Telescoping relay mast',body);mast.position.set(0,3.3,0);
   part(2,mast,0,.75,0,.19,1.5,.19);part(1,mast,0,.05,0,.35,.55,.35);
   part(2,mast,0,1.6,0,1.55,.13,.13);part(4,mast,0,1.8,0,.12,.4,.12);
   for(const side of [-1,1])part(1,mast,side*.72,1.75,0,.12,.5,.3);
  }
  modules.push({anchor,body,legs,doors,ramp,wings,hatches,mast});
 }
 for(let material=0;material<parts.length;material++){
  const mesh=new THREE.InstancedMesh(geometry,materials[material],parts[material].length);
  mesh.name='Support module material '+material;mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);meshes.push(mesh);
 }
 function update(time,{active=false,settled=false}={}){
  if(disposed)return;lastTime=Number.isFinite(time)?clamp(time,0,18):0;lastActive=!!active;lastSettled=!!settled;root.visible=active||settled;
  modules.forEach((m,i)=>{
   const s=sampleSupplyLanding(settled?18:lastTime,i);
   m.anchor.position.y=s.altitude;m.body.position.y=s.compression;
   for(const leg of m.legs){
    const x=leg.sx*mix(1.3,2.65,s.legs),z=leg.sz*mix(1.1,2.1,s.legs),y=mix(1.15,.13,s.legs);
    leg.foot.position.set(x,y,z);leg.sole.position.set(x,y-.085,z);
    v0.set(leg.sx*1.5,1.5+s.compression,leg.sz*1.3);v1.set(x,y+.1,z);
    const length=v0.distanceTo(v1);leg.link.position.copy(v0).add(v1).multiplyScalar(.5);v1.sub(v0).normalize();leg.link.quaternion.setFromUnitVectors(up,v1);leg.link.scale.y=length;
    leg.piston.position.copy(v0).addScaledVector(v1,length*.22);leg.piston.quaternion.copy(leg.link.quaternion);leg.piston.scale.y=length*.44;
   }
   for(const {hinge,side} of m.doors)hinge.rotation.y=side*s.doors*1.85;
   if(m.ramp)m.ramp.rotation.x=mix(-Math.PI/2,Math.asin(.70/2.28),s.ramp);
   for(const {hinge,side} of m.wings)hinge.rotation.z=-side*Math.PI/2*(1-s.wings);
   for(const {hatch,side} of m.hatches)hatch.rotation.z=side*ease((s.time-SUPPLY_IMPACTS[i]-.9)/1.1)*1.85;
   if(m.mast)m.mast.position.y=mix(2,4.85,s.mast);
  });
  // Only transform nodes are articulated. Six material batches do all rendering.
  root.updateWorldMatrix(true,true);rootInverse.copy(root.matrixWorld).invert();
  for(let k=0;k<meshes.length;k++){parts[k].forEach((node,i)=>{meshes[k].setMatrixAt(i,instanceMatrix.multiplyMatrices(rootInverse,node.matrixWorld));});meshes[k].instanceMatrix.needsUpdate=true;}
 }
 update(0);
 return {update,dispose(){if(disposed)return;disposed=true;parent.remove(root);for(const mesh of meshes)mesh.dispose();geometry.dispose();for(const material of materials)material.dispose();},diagnostics(){return {disposed,time:lastTime,active:lastActive,settled:lastSettled,drawCallsUpperBound:meshes.length,partCount:parts.reduce((n,a)=>n+a.length,0),meshCount:meshes.length,geometryCount:1,materialCount:materials.length,rootVisible:root.visible};}};
}
