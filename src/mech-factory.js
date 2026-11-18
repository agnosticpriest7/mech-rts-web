/** Dedicated 12m-mech foundry. Metres/Y-up/+Z launch. Cosmetic only.
 * Geometry is built once and material-batched; update allocates no scene objects.
 * Supply authoritative {producing, progress:0..1, powered}. Freeze progress on outage.
 * Parent may put its normalized M06 clone under assemblySocket; no fake mech supplied.
 */
export const MECH_FACTORY_CONTRACT=Object.freeze({footprint:[24,24],laneWidth:14,minimumOverhead:16.2,humanDoorHeight:2.2,railHeight:1.1,assemblyOrigin:[0,.035,0],launchOffset:[0,20],launchCorridor:[-7,7,0,26]});
const clamp=v=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
const ease=(p,a,b)=>{const t=clamp((p-a)/(b-a));return t*t*(3-2*t);};
export function createMechFactory(T){
 const root=new T.Group();root.name='ATLAS / Heavy chassis foundry';root.userData.clearance=MECH_FACTORY_CONTRACT;
 const assemblySocket=new T.Group();assemblySocket.name='AssemblySocket_12m_M06';assemblySocket.position.y=.035;root.add(assemblySocket);
 const materials=[new T.MeshStandardMaterial({vertexColors:true,roughness:.63,metalness:.65}),new T.MeshStandardMaterial({vertexColors:true,roughness:.3,metalness:.78}),new T.MeshStandardMaterial({vertexColors:true,roughness:.4,metalness:.35,emissive:0x36aeb3,emissiveIntensity:.6})];
 const C={armor:0x64766f,edge:0xc4c8ac,dark:0x16272d,steel:0x75838c,yellow:0xd4a344,glass:0x163f50,light:0x89e9e0};
 const batches=new Map(),meshes=[],geometries=[];let disposed=false;
 const matrix=new T.Matrix4(),q=new T.Quaternion(),scale=new T.Vector3(1,1,1),pos=new T.Vector3(),up=new T.Vector3(0,1,0),dir=new T.Vector3();
 function group(name){const g=new T.Group();g.name=name;root.add(g);return g;}
 function add(g,color,x,y,z,parent=root,mat=0,rotation=null){pos.set(x,y,z);q.identity();if(rotation)q.setFromEuler(new T.Euler(...rotation));matrix.compose(pos,q,scale);g.applyMatrix4(matrix);const n=g.index?g.toNonIndexed():g;if(n!==g)g.dispose();const colors=new Float32Array(n.attributes.position.count*3),c=new T.Color(color);for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}n.setAttribute('color',new T.BufferAttribute(colors,3));let m=batches.get(parent);if(!m)batches.set(parent,m=new Map());if(!m.has(mat))m.set(mat,[]);m.get(mat).push(n);}
 function box(c,x,y,z,w,h,d,p=root,m=0){add(new T.BoxGeometry(w,h,d),c,x,y,z,p,m);}
 function armor(c,x,y,z,w,h,d,p=root,b=.22){const s=new T.Shape(),a=w/2,k=h/2;{s.moveTo(-a+b,-k);s.lineTo(a-b,-k);s.lineTo(a,-k+b);s.lineTo(a,k-b);s.lineTo(a-b,k);s.lineTo(-a+b,k);s.lineTo(-a,k-b);s.lineTo(-a,-k+b);s.closePath();}const g=new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelThickness:.055,bevelSize:.055,bevelSegments:1,steps:1,curveSegments:1});g.translate(0,0,-d/2);add(g,c,x,y,z,p);}
 function rod(c,a,b,r=.06,p=root,m=0,r2=r){const v=new T.Vector3(...a),end=new T.Vector3(...b);dir.subVectors(end,v);const g=new T.CylinderGeometry(r2,r,dir.length(),8,1);q.setFromUnitVectors(up,dir.clone().normalize());g.applyQuaternion(q);add(g,c,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,p,m);}
 function pipe(c,x,y,z,r,h,p=root,m=0){add(new T.CylinderGeometry(r,r,h,12,1),c,x,y,z,p,m);}
 // A flush patterned launch deck avoids a false step under 12m vehicles.
 box(C.dark,0,.005,0,23.8,.01,23.8);
 for(const x of [-5.9,5.9]){box(C.steel,x,.022,0,.26,.018,22);for(let z=-10;z<11;z+=2)box(C.yellow,x+(x<0?-.35:.35),.027,z,.18,.018,.8);}
 for(let z=-10;z<11;z+=2.2)box(C.steel,0,.018,z,10,.008,.035);
 // Four chamfered buttresses, side machinery and exposed structural braces.
 for(const side of [-1,1]){
  const x=side*9.45;
  for(const z of [-8.8,8.8]){
   armor(C.dark,x,1.16,z,4.3,2.2,4.1,root,.4);
   armor(C.armor,x,8.2,z,2.7,14.2,2.7,root,.45);
   armor(C.edge,x,16.7,z,3.4,1.4,3.3,root,.3);
   armor(C.yellow,x,3.5,z+1.42,2.1,1.2,.12,root,.12);
   for(const dx of [-.78,.78])rod(C.steel,[x+dx,2.2,z+1.46],[x+dx,15.6,z+1.46],.11,root,1);
   for(let y=5;y<15;y+=2.2)box(C.dark,x,y,z+1.42,2.1,.10,.13);
   for(const dx of [-.82,.82])pipe(C.steel,x+dx,1.95,z+.9,.12,.18,root,1);
  }
  for(const y of [13.8,16.4])rod(C.steel,[x,y,-9],[x,y,9],.17);
  for(let z=-8;z<8;z+=4){rod(C.armor,[x,13.8,z],[x,16.4,z+4],.16);rod(C.armor,[x,16.4,z],[x,13.8,z+4],.16);}
  // Catwalk and proper 1.1m handrails, reached by 0.2m-rise stairs.
  box(C.dark,x,2.4,0,3,.18,12);
  for(const rx of [x-1.3,x+1.3]){for(let z=-5.5;z<6;z+=2)rod(C.yellow,[rx,2.49,z],[rx,3.59,z],.035);for(const y of [3.04,3.55])rod(C.yellow,[rx,y,-5.5],[rx,y,5.5],.035);}
  for(let i=0;i<12;i++)box(C.steel,x,.1+i*.2,6.2+i*.28,1.1,.15,.3);
  armor(C.armor,x,4.8,-5,2.8,4.6,3.4,root,.28);
  box(C.dark,x,3.59,-3.27,1.08,2.2,.08); // human-scale door above walkway
  box(C.yellow,x+.35,3.6,-3.2,.04,.25,.04);
  box(C.light,x,4.85,-3.2,.72,.09,.06,root,2);
  box(C.glass,x,5.8,-3.25,2.1,.7,.1,root,1);
  for(let y=4.8;y<6.5;y+=.25)box(C.dark,x,y,-6.75,2.2,.09,.08);
  // Twin coolant tanks, segmented pipework and insulated supply cables.
  for(const z of [-1.8,.6]){pipe(C.steel,x,4,z,.66,2.5,root,1);pipe(C.dark,x,5.28,z,.73,.2);pipe(C.yellow,x,3.8,z,.69,.13);rod(C.steel,[x,5.3,z],[x,6,z],.12);}
  for(let i=0;i<3;i++){const xx=x+side*(.6+i*.2);rod(C.dark,[xx,5.8,-1],[xx,11,-1],.07);rod(C.dark,[xx,11,-1],[xx,12,-3],.07);}
 }
 // Rear crossbeam is above the advertised unobstructed 16.2m clearance.
 armor(C.armor,0,17.5,-8.8,18.8,2.4,2,root,.35);
 for(const y of [16.5,18.5])rod(C.edge,[-9,y,-7.73],[9,y,-7.73],.10);
 for(let x=-8;x<8;x+=2)rod(C.yellow,[x,16.55,-7.7],[x+2,18.4,-7.7],.09);
 // Traveling bridge crane, monolithic batch; no hanging hook through the mech.
 const gantry=group('Traveling bridge and hoist');
 armor(C.yellow,0,17.35,0,18,1.9,1.65,gantry,.3);
 for(const y of [16.6,18.1])rod(C.dark,[-8.5,y,1],[8.5,y,1],.1,gantry);
 for(let x=-8;x<8;x+=2)rod(C.dark,[x,16.6,1],[x+2,18.1,1],.085,gantry);
 armor(C.dark,0,18.6,0,3,1.0,2.7,gantry,.2);pipe(C.steel,0,19.3,0,.65,.5,gantry);
 for(const x of [-8.8,8.8]){armor(C.edge,x,17,0,1.4,1.7,2.4,gantry,.2);}
 // Two multi-link tool manipulators. Arms retract fully beyond clear launch lane.
 const arms=[];
 for(const side of [-1,1]){
  const arm=group(`Fabrication arm ${side<0?'port':'starboard'}`);arm.position.set(side*8.5,6,0);arms.push(arm);
  pipe(C.dark,0,0,0,.66,1.3,arm);rod(C.steel,[0,0,0],[-side*1.8,1.8,-.3],.3,arm);
  rod(C.yellow,[0,.5,.25],[-side*1.8,1.8,-.05],.15,arm);
  pipe(C.steel,-side*1.8,1.8,-.3,.38,.75,arm);
  rod(C.armor,[-side*1.8,1.8,-.3],[-side*3.1,.9,.4],.24,arm);
  rod(C.dark,[-side*1.8,2.05,-.1],[-side*3.1,1.2,.6],.075,arm);
  armor(C.edge,-side*3.3,.9,.4,.7,.8,.9,arm,.1);
  for(const dz of [-.23,.23])rod(C.steel,[-side*3.3,.9,.4+dz],[-side*3.8,.9,.4+dz],.065,arm);
 }
 const clamps=[];
 for(const side of [-1,1]){const g=group(`Ground fixture ${side}`);g.position.x=side*9.5;clamps.push(g);for(const z of [-3.4,3.4]){armor(C.dark,0,.56,z,1.1,1,2,g,.12);rod(C.steel,[0,.5,z],[-side*1.7,.5,z],.16,g);armor(C.yellow,-side*1.6,.65,z,.35,1.1,1.2,g,.1);}}
 const status=group('Power and production indicators');for(const side of [-1,1])box(C.light,side*9.45,13.1,10.23,.38,1.5,.08,status,2);
 // Merge independently of the addon importer, retaining only render attributes.
 for(const [parent,byMaterial] of batches)for(const [mi,list] of byMaterial){const total=list.reduce((n,g)=>n+g.attributes.position.count,0),out=new T.BufferGeometry();for(const key of ['position','normal','color']){const arr=new Float32Array(total*3);let offset=0;for(const g of list){arr.set(g.attributes[key].array,offset);offset+=g.attributes[key].array.length;}out.setAttribute(key,new T.BufferAttribute(arr,3));}out.computeBoundingBox();out.computeBoundingSphere();const mesh=new T.Mesh(out,materials[mi]);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.sharedAsset=true;parent.add(mesh);meshes.push(mesh);geometries.push(out);for(const g of list)g.dispose();}
 let lastProgress=0;const state={phase:'idle',progress:0,clearForLaunch:true};
 function update(entity={}){const producing=!!entity.producing;const powered=entity.powered!==false;const p=clamp(entity.progress);lastProgress=p;const engaged=producing?(ease(p,0,.08)*(1-ease(p,.82,.96))):0;gantry.position.z=producing?-5+10*ease(p,.08,.75):5;for(let i=0;i<2;i++){const side=i===0?-1:1;arms[i].rotation.y=side*(1-engaged)*Math.PI/2;arms[i].position.y=6+(producing?Math.sin(p*Math.PI*6)*.55*engaged:0);clamps[i].position.x=side*(9.5-1.4*engaged);}materials[2].emissiveIntensity=powered?.65:.05;assemblySocket.visible=producing;state.progress=p;state.phase=!producing?'idle':p<.08?'fixture':p<.75?'fabrication':p<.96?'release':'ready';state.clearForLaunch=!producing||p>=.96;return state;}
 function diagnostics(){return {drawCalls:meshes.length,triangles:geometries.reduce((n,g)=>n+g.attributes.position.count/3,0),progress:lastProgress,disposed,contract:MECH_FACTORY_CONTRACT};}
 function dispose(){if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}
 update();return {root,assemblySocket,update,dispose,diagnostics};
}
