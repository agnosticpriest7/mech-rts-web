/** Open-front field service pad. Geometry is metres, not normalized to mech size.
 * Human details stay human-sized while the vehicle lane clears a 12 m M06. */
export function createServiceBay(T){
 const root=new T.Group();root.name='Field service bay';
 root.userData.clearance={footprint:[16,14],laneWidth:13.2,overhead:null,doorHeight:2.2,railHeight:1.1};
 const geo=new T.BoxGeometry(1,1,1),materials=[
  new T.MeshStandardMaterial({color:0x18282b,roughness:.85,metalness:.4}),
  new T.MeshStandardMaterial({color:0x697467,roughness:.75,metalness:.5}),
  new T.MeshStandardMaterial({color:0xc5c6ab,roughness:.65,metalness:.6}),
  new T.MeshStandardMaterial({color:0xd9a04a,roughness:.7,metalness:.4}),
  new T.MeshStandardMaterial({color:0x86d9bf,emissive:0x4ba989,emissiveIntensity:.5,roughness:.5}),
 ];
 const parts=materials.map(()=>[]),arms=[],batches=[];let disposed=false;
 const matrix=new T.Matrix4(),inverse=new T.Matrix4();
 function box(m,x,y,z,w,h,d,parent=root){const p=new T.Object3D();p.position.set(x,y,z);p.scale.set(w,h,d);parent.add(p);parts[m].push(p);return p;}
 // Flush painted deck: feet remain on the simulation's y=0 ground datum.
 box(0,0,-.05,0,16,.1,14);box(1,0,.006,0,13.2,.012,13.8);
 for(const side of [-1,1]){
  box(3,side*6.5,.025,0,.12,.02,13.4);
  box(0,side*7.3,.3,-.2,1.1,.6,11.5);
  box(1,side*7.25,2.1,-4.4,1.2,3.6,3.2);box(2,side*7.25,4,-4.4,1.35,.2,3.4);
  // Personnel access: 2.2 m door and 1.1 m guardrail from the walkway floor.
  box(0,side*7.25,1.7,-2.78,.8,2.2,.08);box(4,side*7.25,2.9,-2.7,.7,.1,.06);
  for(const z of [-5,-2,1,4])box(3,side*7.85,1.15,z,.06,1.1,.06);
  box(3,side*7.85,1.7,-.5,.06,.06,9);box(3,side*7.85,1.15,-.5,.06,.05,9);
  for(let i=0;i<3;i++)box(2,side*7.25,.1+i*.2,5.1-i*.45,1.3,.2,.5);
  // Tall side cranes rather than the former 4.9 m crossbeam through the cockpit.
  box(1,side*7.3,5.1,-1.5,.75,9,.9);box(2,side*7.3,9.65,-1.5,.9,.25,1.1);
  const arm=new T.Group();arm.position.set(side*7.55,7.4,-1.5);root.add(arm);
  box(3,0,0,0,.7,1.2,1.2,arm);box(2,-side*.45,.35,.9,1.2,.4,2.8,arm);
  box(1,-side*.7,-.15,2.2,.4,1.1,.45,arm);box(4,-side*.7,-.75,2.2,.35,.12,.35,arm);arms.push({arm,side});
  for(let i=0;i<4;i++)box(3,side*7.3,2+i*1.8,-.99,.8,.16,.08);
 }
 // Human-height terminal and small metre marks make the vehicle's size readable.
 box(0,7.25,1.15,4.5,.9,1.1,.3);box(4,7.25,1.4,4.68,.65,.28,.05);
 for(let i=0;i<7;i++)box(3,0,.025,-5+i*1.5,1,.02,.12);
 for(let i=0;i<parts.length;i++){const mesh=new T.InstancedMesh(geo,materials[i],parts[i].length);mesh.name='Service material '+i;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;root.add(mesh);batches.push(mesh);}
 function update(entity={},time=0,active=false){if(disposed)return;const powered=entity.powered!==false&&entity.powerConnected!==false;
  materials[4].emissiveIntensity=powered?(active?.85:.4):.08;materials[4].color.setHex(powered?0x86d9bf:0xc88454);
  for(const {arm,side} of arms)arm.rotation.y=active&&powered?side*Math.sin(time*1.2)*.06:0;
  root.updateWorldMatrix(true,true);inverse.copy(root.matrixWorld).invert();
  for(let i=0;i<batches.length;i++){for(let j=0;j<parts[i].length;j++)batches[i].setMatrixAt(j,matrix.multiplyMatrices(inverse,parts[i][j].matrixWorld));batches[i].instanceMatrix.needsUpdate=true;}
 }
 root.traverse(o=>{o.userData.sharedAsset=true;});update();
 return {root,update,diagnostics:()=>({disposed,drawCallsUpperBound:5,triangles:parts.reduce((n,p)=>n+p.length,0)*12,...root.userData.clearance}),dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const m of batches)m.dispose();geo.dispose();for(const m of materials)m.dispose();}};
}
