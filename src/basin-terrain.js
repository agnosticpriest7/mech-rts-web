/** Hand-authored basin presentation. Simulation owns collision; no per-frame terrain allocations. */
export function createBasinTerrain(THREE,scene,map){
 const root=new THREE.Group();root.name='Kestrel768Terrain';scene.add(root);
 const materials={stone:new THREE.MeshStandardMaterial({color:0x616357,roughness:1}),dark:new THREE.MeshStandardMaterial({color:0x333f3a,roughness:1}),water:new THREE.MeshStandardMaterial({color:0x24575a,roughness:.3,metalness:.2}),trunk:new THREE.MeshStandardMaterial({color:0x4a4438,roughness:1}),leaf:new THREE.MeshStandardMaterial({color:0x536c57,roughness:1}),metal:new THREE.MeshStandardMaterial({color:0x97866a,roughness:.85,metalness:.3})};
 const put=(geo,mat,x,y,z)=>{const o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);o.receiveShadow=true;root.add(o);return o;};
 for(const b of map.obstacles){if(b.type==='landmark')continue;if(b.type==='water'){put(new THREE.BoxGeometry(b.width,.5,b.depth),materials.water,b.x,.12,b.z);continue;}
  // Raised buttresses match the navigational footprint exactly, softened by a sloping crown.
  put(new THREE.BoxGeometry(b.width,b.height*.65,b.depth),materials.dark,b.x,b.height*.325,b.z);
  const crown=put(new THREE.CylinderGeometry(.84,1,1,8),materials.stone,b.x,b.height*.7,b.z);crown.scale.set(b.width*.5,b.height*.6,b.depth*.5);
 }
 // Clear route ribbons. Sparse dashed survey markers make the human scale tangible.
 const routeMaterial=new THREE.MeshBasicMaterial({color:0x8d8260,transparent:true,opacity:.23,depthWrite:false});
 for(const lane of map.lanes)for(let i=1;i<lane.points.length;i++){
  const a=lane.points[i-1],b=lane.points[i],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);
  const road=put(new THREE.PlaneGeometry(12,l),routeMaterial,(a.x+b.x)/2,.025,(a.z+b.z)/2);road.rotation.set(-Math.PI/2,0,-Math.atan2(dx,dz));
 }
 // Low-detail repeated scenery stays in three instanced draw calls regardless of map area.
 let seed=19468;const rng=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const max=480,rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),materials.stone,max),trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.2,.45,1,5),materials.trunk,max),crowns=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,5),materials.leaf,max);const t=new THREE.Object3D(),rockRecords=[],trunkRecords=[],crownRecords=[];let nr=0,nt=0;
 const segmentDist=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,u=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-u*dx,p.z-a.z-u*dz);};
 const clear=p=>!map.obstacles.some(b=>Math.abs(p.x-b.x)<b.width/2+10&&Math.abs(p.z-b.z)<b.depth/2+10)&&!map.lanes.some(l=>l.points.some((b,i)=>i&&segmentDist(p,l.points[i-1],b)<l.width/2+10))&&!map.deposits.some(d=>Math.hypot(p.x-d.x,p.z-d.z)<25)&&Math.hypot(p.x-30,p.z-120)>65&&Math.hypot(p.x-map.hive.x,p.z-map.hive.z)>40;
 for(let i=0;i<1200&&nr<max;i++){const p={x:rng()*map.size,z:rng()*map.size};if(!clear(p))continue;const h=1+rng()*3;t.position.set(p.x,h*.4,p.z);t.rotation.set(rng()*.3,rng()*6,.1);t.scale.set(h*1.3,h,h);t.updateMatrix();rocks.setMatrixAt(nr++,t.matrix);rockRecords.push({matrix:t.matrix.clone(),x:p.x,z:p.z,rx:h*1.3,rz:h*1.3});if(nt<max&&rng()>.34){const height=8+rng()*10;t.rotation.set(0,rng()*6,0);t.scale.set(1,height*.65,1);t.position.set(p.x,height*.325,p.z);t.updateMatrix();trunks.setMatrixAt(nt,t.matrix);trunkRecords.push({matrix:t.matrix.clone(),x:p.x,z:p.z,rx:height*.23,rz:height*.23});t.scale.set(height*.23,height*.68,height*.23);t.position.y=height*.66;t.updateMatrix();crowns.setMatrixAt(nt++,t.matrix);crownRecords.push({matrix:t.matrix.clone(),x:p.x,z:p.z,rx:height*.23,rz:height*.23});}}
 rocks.count=nr;trunks.count=crowns.count=nt;root.add(rocks,trunks,crowns);
 for(const l of map.landmarks){
  const tower=put(new THREE.BoxGeometry(9,l.height,9),materials.metal,l.x,l.height/2,l.z);tower.rotation.y=.2;
  put(new THREE.BoxGeometry(13,3,13),materials.dark,l.x,l.height*.72,l.z);
  const marker=put(new THREE.BoxGeometry(2,3,2),new THREE.MeshBasicMaterial({color:0xe6b466}),l.x,l.height+1.5,l.z);
 }
 const hidden=new THREE.Matrix4().makeScale(0,0,0);
 const clearZones=(zones,intersects)=>{for(const [mesh,records] of [[rocks,rockRecords],[trunks,trunkRecords],[crowns,crownRecords]]){let n=0;records.forEach((r,i)=>{const hit=intersects(r,zones);mesh.setMatrixAt(i,hit?hidden:r.matrix);if(hit)n++;});mesh.instanceMatrix.needsUpdate=true;mesh.userData.clearedInstances=n;}};
 return {root,clearZones,setVisible:on=>{root.visible=on;},diagnostics:()=>({rocks:nr,trees:nt,obstacles:map.obstacles.length,instancedDrawCalls:3})};
}
