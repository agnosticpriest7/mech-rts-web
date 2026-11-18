/** Ground beacon for one orbital reinforcement. 20 m art within 22 m reservation. */
export function createDropPad(T){
 const root=new T.Group();root.name='Orbital artillery drop pad';
 const geometry=new T.BoxGeometry(1,1,1),mats=[new T.MeshStandardMaterial({color:0x202e32,metalness:.6,roughness:.8}),new T.MeshStandardMaterial({color:0x687875,metalness:.65,roughness:.65}),new T.MeshStandardMaterial({color:0xcf9e4a,roughness:.7}),new T.MeshStandardMaterial({color:0x90e9d8,emissive:0x4dc7b8,emissiveIntensity:1})];
 const arrays=mats.map(()=>[]),batches=[];let disposed=false,lastState='idle';
 const pose=new T.Object3D();
 function box(m,x,y,z,w,h,d,angle=0){pose.position.set(x,y,z);pose.scale.set(w,h,d);pose.rotation.set(0,angle,0);pose.updateMatrix();arrays[m].push(pose.matrix.clone());}
 // Flush segmented deck, inset landing markings and broad corner armor shoulders.
 box(0,0,-.11,0,18,.2,18);box(1,0,.005,0,15,.01,15);
 for(const s of [-1,1]){box(0,s*8.8,.15,0,1.2,.3,15);box(0,0,.15,s*8.8,15,.3,1.2);box(2,s*6.8,.035,0,.12,.025,13);box(2,0,.035,s*6.8,13,.025,.12);
  for(const z of [-1,1]){box(1,s*8.4,.45,z*8.4,2.4,.9,2.4,Math.PI/4);box(0,s*8.6,1.8,z*8.6,.6,2.8,.6);box(3,s*8.6,3.27,z*8.6,.75,.18,.75);box(2,s*8.6,2.7,z*8.6,.65,.25,.65);}
  for(let i=0;i<7;i++){box(2,s*7.7,.04,-5.4+i*1.8,.45,.03,.8,Math.PI/4);box(3,s*9.1,.35,-5.4+i*1.8,.12,.12,.6);}
 }
 // Beacon target and power cabinet, all outside the central landing volume.
 box(2,0,.04,0,3,.025,.16);box(2,0,.04,0,.16,.025,3);box(0,0,.7,-9.2,3,1.4,1.1);box(1,0,1.45,-9.2,3.2,.12,1.2);box(3,0,1.05,-8.62,1.5,.35,.05);
 for(let i=0;i<arrays.length;i++){const mesh=new T.InstancedMesh(geometry,mats[i],arrays[i].length);for(let j=0;j<arrays[i].length;j++)mesh.setMatrixAt(j,arrays[i][j]);mesh.receiveShadow=true;mesh.frustumCulled=false;root.add(mesh);batches.push(mesh);}
 const dustGeometry=new T.IcosahedronGeometry(1,0),dustMaterial=new T.MeshBasicMaterial({color:0xa59274,transparent:true,opacity:0,depthWrite:false});
 const dust=new T.InstancedMesh(dustGeometry,dustMaterial,12);dust.frustumCulled=false;dust.visible=false;root.add(dust);
 root.traverse(o=>{o.userData.sharedAsset=true;});
 function update(entity={},time=0){if(disposed)return;const alive=entity.hp===undefined||entity.hp>0,powered=entity.powered!==false,progress=entity.dropJob?.progress||0,spent=!!entity.summonedId;
  lastState=!alive?'destroyed':spent?'spent':!powered?'offline':entity.dropJob?.blocked?'blocked':'charging';
  mats[3].color.setHex(!alive?0x323632:spent?0x66817c:powered?0x90e9d8:0xd58b45);mats[3].emissiveIntensity=!alive?0:spent?.16:powered?.3+progress*.7+Math.sin(time*4)*.12:.03;
  const elapsed=Number.isFinite(entity.landingAt)?time-entity.landingAt:-1;dust.visible=alive&&elapsed>=0&&elapsed<2.2;
  if(dust.visible){const p=elapsed/2.2;dustMaterial.opacity=.38*(1-p);for(let i=0;i<12;i++){const a=i*Math.PI/6,r=2+p*10,size=.6+p*2.5;pose.position.set(Math.sin(a)*r,.35+p*.9,Math.cos(a)*r);pose.scale.set(size,.4+size*.3,size);pose.rotation.set(0,a,0);pose.updateMatrix();dust.setMatrixAt(i,pose.matrix);}dust.instanceMatrix.needsUpdate=true;}
 }
 update();return {root,update,diagnostics:()=>({disposed,state:lastState,footprint:[20,20],drawCallsUpperBound:5,dustVisible:dust.visible,triangles:arrays.reduce((n,a)=>n+a.length*12,0)+240}),dispose(){if(disposed)return;disposed=true;for(const b of batches)b.dispose();dust.dispose();geometry.dispose();dustGeometry.dispose();for(const m of mats)m.dispose();dustMaterial.dispose();root.removeFromParent();}};
}
