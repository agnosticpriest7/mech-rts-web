/** Rooted alien brood citadel, in metres. Entirely deterministic CPU-authored geometry.
 * Six opaque material batches, no textures, particles, allocations or clock reads in update.
 * update uses server-derived time (seconds); deadAt, if supplied, uses the same epoch.
 */
export function createHiveArt(T){
 const root=new T.Group();root.name='Rooted brood citadel';
 const body=new T.Group();root.add(body);
 const mats=[
  new T.MeshStandardMaterial({color:0x222b2a,roughness:.97}),
  new T.MeshStandardMaterial({color:0x503b39,roughness:.87,metalness:.12}),
  new T.MeshStandardMaterial({color:0x794a42,roughness:.74,metalness:.15}),
  new T.MeshStandardMaterial({color:0xa16e53,roughness:.75,metalness:.12}),
  new T.MeshStandardMaterial({color:0xc24b2c,emissive:0xb53717,emissiveIntensity:.65,roughness:.7}),
  new T.MeshStandardMaterial({color:0xf5a26c,emissive:0xf76c30,emissiveIntensity:1.2,roughness:.43})
 ];
 const bins=mats.map(()=>[]),meshes=[];let disposed=false;
 function add(k,g){bins[k].push(g);}
 function tube(k,points,radius,segments=12,sides=6,end=.06){
  const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),frames=curve.computeFrenetFrames(segments,false),p=[],idx=[];
  for(let i=0;i<=segments;i++){
   const v=curve.getPoint(i/segments),r=radius*(end+(1-end)*Math.pow(1-i/segments,.7));
   for(let j=0;j<=sides;j++){const a=j/sides*Math.PI*2,n=frames.normals[i],b=frames.binormals[i];p.push(v.x+r*(Math.cos(a)*n.x+Math.sin(a)*b.x),v.y+r*(Math.cos(a)*n.y+Math.sin(a)*b.y),v.z+r*(Math.cos(a)*n.z+Math.sin(a)*b.z));}
  }
  for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;idx.push(a,b,a+1,b,b+1,a+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();add(k,g);
 }
 function radial(a,r,y){return [Math.sin(a)*r,y,Math.cos(a)*r];}
 // Lobed rooted basal mantle: no floating foundation disc or regular primitive silhouette.
 const p=[],ix=[],rows=9,sides=64;
 for(let y=0;y<=rows;y++)for(let j=0;j<=sides;j++){
  const t=y/rows,a=j/sides*Math.PI*2,r=(9.4*(1-t)+2.8*t)*(1+.085*Math.cos(a*8)+.045*Math.sin(a*13));
  p.push(Math.sin(a)*r, .13+7.8*t,Math.cos(a)*r);
 }
 for(let y=0;y<rows;y++)for(let j=0;j<sides;j++){const a=y*(sides+1)+j,b=a+sides+1;ix.push(a,a+1,b,a+1,b+1,b);}
 const mantle=new T.BufferGeometry();mantle.setAttribute('position',new T.Float32BufferAttribute(p,3));mantle.setIndex(ix);mantle.computeVertexNormals();add(0,mantle);
 // Eight overlapping convex shell blades. Each has its own raised keel and uneven crown.
 for(let n=0;n<8;n++){
  const a=n/8*Math.PI*2+.18,verts=[],inds=[],nv=9,nu=8;
  for(let v=0;v<=nv;v++)for(let u=0;u<=nu;u++){
   const t=v/nv,s=u/nu*2-1,ang=a+s*(.43-.22*t),r=8.6-5.4*t+1.45*Math.sin(t*Math.PI)+.55*(1-s*s)*Math.sin(t*Math.PI),h=.45+10.9*t+(.8+.25*Math.sin(n*3))*Math.sin(t*Math.PI)-.7*s*s;
   verts.push(Math.sin(ang)*r,Math.max(.08,h),Math.cos(ang)*r);
  }
  for(let v=0;v<nv;v++)for(let u=0;u<nu;u++){const i=v*(nu+1)+u,j=i+nu+1;inds.push(i,i+1,j,i+1,j+1,j);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setIndex(inds);g.computeVertexNormals();add(n%2?1:2,g);
  // Chitin seam and reaching buttress, rooted in the soil rather than hovering spikes.
  tube(3,[radial(a,12.8,.18),radial(a,10,1.4),radial(a,8.6,5.2),radial(a,5.6,9.2),radial(a,3.4,12.1+(n%3)*.35)],.72,14,6,.09);
  tube(0,[radial(a+.1,7,.7),radial(a+.2,10,.65),radial(a+.34,12.5,.3),radial(a+.53,13.4,.12)],.52,10,5,.04);
  // Fine segmented shoulder ribbing, repeating with shell curvature rather than a torus stack.
  for(let k=0;k<4;k++){
   const h=2.2+k*1.65,r=9.1-k*.8;
   tube(3,[radial(a-.3,r,h),radial(a,r+.3,h+.25),radial(a+.3,r,h)],.13,7,5,.4);
  }
  tube(4,[radial(a+.36,8.4,1),radial(a+.3,8.3,4),radial(a+.27,6.4,7.1),radial(a+.2,4,9.7)],.09,10,5,.3);
 }
 // Deep-set front organ, held inside asymmetric mandibles, not a sphere glued on the shell.
 const heartGeo=new T.SphereGeometry(1,16,12);heartGeo.scale(1.55,2.45,.8);heartGeo.translate(0,5.1,8.7);add(5,heartGeo);
 for(const s of [-1,1]){
  tube(2,[[s*3.5,1,9],[s*3,3.5,9.5],[s*2.4,7,9],[s*.55,8.5,8.1]],.66,16,7,.06);
  for(let k=0;k<4;k++)tube(3,[[s*2.8,3+k*1.1,9.2],[s*1.7,3.1+k*1.1,9.7],[s*.9,3.35+k*1.1,9.45]],.17,6,5,.15);
 }
 // Merge once by material, keeping only position/normal: no runtime individual part nodes.
 let triangles=0;
 bins.forEach((geos,k)=>{
  const pos=[],norm=[];
  for(const source of geos){const g=source.index?source.toNonIndexed():source;pos.push(...g.attributes.position.array);norm.push(...g.attributes.normal.array);if(g!==source)g.dispose();source.dispose();}
  const g=new T.BufferGeometry();for(let i=1;i<pos.length;i+=3)pos[i]=Math.max(.02,pos[i]);g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(norm,3));g.computeBoundingBox();g.computeBoundingSphere();triangles+=pos.length/9;
  const mesh=new T.Mesh(g,mats[k]);mesh.name=['Root mantle','Oxide shell','Crown carapace','Chitin ribs','Living seams','Protected heart'][k];mesh.castShadow=k<4;mesh.receiveShadow=true;mesh.userData.sharedAsset=true;body.add(mesh);meshes.push(mesh);
 });
 const baseColors=mats.map(m=>m.color.clone()),char=new T.Color(0x252b2a);
 const diagnostics={drawCalls:6,triangles,footprintRadius:14,materialCount:6};
 function update(entity,time,active=true){
  if(disposed||!active)return;
  const t=Number.isFinite(time)?time:0,max=Number.isFinite(entity?.maxHp)&&entity.maxHp>0?entity.maxHp:2600,hp=Number.isFinite(entity?.hp)?entity.hp:max,health=Math.max(0,Math.min(1,hp/max));
  const dead=health===0,death=dead?(Number.isFinite(entity?.deadAt)?Math.max(0,Math.min(1,(t-entity.deadAt)/2.8)):1):0;
  const pulse=dead?0:(.5+.5*Math.sin(t*(1.5+(1-health)*1.8)));
  body.scale.y=(1-.47*death)*(1+(dead?0:.005*Math.sin(t*1.5)));
  body.rotation.z=.055*death;body.position.y=0;
  for(let i=0;i<4;i++)mats[i].color.copy(baseColors[i]).lerp(char,(1-health)*.36+death*.5);
  mats[4].emissiveIntensity=(.35+.55*pulse+(1-health)*.6)*(1-death);
  mats[5].emissiveIntensity=(.7+.8*pulse+(1-health))*(1-death);
  mats[5].color.copy(baseColors[5]).lerp(char,death);
 }
 function dispose(){if(disposed)return;disposed=true;for(const m of meshes)m.geometry.dispose();for(const m of mats)m.dispose();}
 return {root,update,diagnostics,dispose};
}
