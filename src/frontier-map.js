/** Shared deterministic map contract. Distances are metres; scenery and simulation
 * use these exact obstacle footprints. The 768m extent is a test size, not a balance claim. */
export const FRONTIER_MAP=Object.freeze({
 id:'frontier-768',name:'Kestrel Basin',size:768,gridSize:4,
 start:{x:30,z:120},hive:{x:560,z:550},
 obstacles:[
  {id:'comms-mast-base',type:'landmark',x:240,z:190,width:12,depth:12,height:26},
  {id:'broken-gantry-base',type:'landmark',x:260,z:375,width:12,depth:12,height:18},
  {id:'impact-spire-base',type:'landmark',x:482,z:480,width:12,depth:12,height:38},
  {id:'western-spine',type:'ridge',x:120,z:64,width:36,depth:92,height:18},
  {id:'flooded-quarry',type:'water',x:182,z:284,width:164,depth:108,height:0},
  {id:'split-ridge',type:'ridge',x:316,z:155,width:60,depth:156,height:24},
  {id:'crown-ridge',type:'ridge',x:440,z:350,width:84,depth:100,height:21},
  {id:'northern-reservoir',type:'water',x:550,z:150,width:172,depth:100,height:0},
  {id:'east-wall',type:'ridge',x:650,z:450,width:72,depth:190,height:28},
  {id:'old-mesa',type:'ridge',x:370,z:545,width:104,depth:96,height:25},
  {id:'southern-pool',type:'water',x:555,z:660,width:94,depth:68,height:0},
  {id:'basin-rim',type:'ridge',x:175,z:570,width:58,depth:150,height:19}
 ],
 lanes:[
  {id:'supply-road',name:'Supply Road',width:38,points:[{x:30,z:120},{x:92,z:160},{x:175,z:160},{x:245,z:195},{x:270,z:255},{x:340,z:320},{x:375,z:425},{x:455,z:460},{x:560,z:550}]},
  {id:'quarry-flank',name:'Quarry Flank',width:44,points:[{x:70,z:160},{x:72,z:345},{x:200,z:385},{x:300,z:385},{x:375,z:425}]},
  {id:'northern-pass',name:'North Pass',width:40,points:[{x:175,z:160},{x:245,z:195},{x:260,z:55},{x:390,z:45},{x:430,z:245},{x:535,z:280},{x:570,z:425},{x:560,z:550}]}
 ],
 landmarks:[{id:'comms-mast',name:'Relay Ruin',x:240,z:190,height:26},{id:'broken-gantry',name:'Old Quarry',x:260,z:375,height:18},{id:'impact-spire',name:'Impact Spire',x:482,z:480,height:38}],
 deposits:[
  {id:'ore-safe',x:19,z:99,remaining:1800,resourceType:'alloy'},
  {id:'ore-mid',x:175,z:160,remaining:1800,resourceType:'conductive'},
  {id:'ore-risk',x:340,z:320,remaining:2200,resourceType:'crystal'},
  {id:'alloy-quarry',x:85,z:365,remaining:2600,resourceType:'alloy'},
  {id:'alloy-crossing',x:300,z:385,remaining:2200,resourceType:'alloy'},
  {id:'conductive-north',x:405,z:245,remaining:1800,resourceType:'conductive'},
  {id:'conductive-rim',x:455,z:490,remaining:2200,resourceType:'conductive'},
  {id:'crystal-east',x:630,z:610,remaining:2600,resourceType:'crystal'}
 ],
 retaliation:[{x:215,z:190},{x:500,z:450}]
});
export const mapForState=s=>s?.mapId===FRONTIER_MAP.id?FRONTIER_MAP:null;
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
function bounds(o,r=0){return [o.x-o.width/2-r,o.z-o.depth/2-r,o.x+o.width/2+r,o.z+o.depth/2+r];}
export function terrainPointClear(map,p,radius=0){
 if(!finite(p))return false;if(!map)return true;
 if(p.x<radius||p.z<radius||p.x>map.size-radius||p.z>map.size-radius)return false;
 return !map.obstacles.some(o=>{const [x0,z0,x1,z1]=bounds(o,radius);return p.x>x0&&p.x<x1&&p.z>z0&&p.z<z1;});
}
/** Segment/expanded AABB intersection; tangent travel outside the inset is allowed. */
export function terrainSegmentClear(map,a,b,radius=0){
 if(!terrainPointClear(map,a,radius)||!terrainPointClear(map,b,radius))return false;
 if(!map)return true;
 return !map.obstacles.some(o=>{
  const box=bounds(o,radius);let lo=0,hi=1;
  for(const [p,d,min,max] of [[a.x,b.x-a.x,box[0]+1e-7,box[2]-1e-7],[a.z,b.z-a.z,box[1]+1e-7,box[3]-1e-7]]){
   if(Math.abs(d)<1e-10){if(p<=min||p>=max)return false;continue;}
   let t0=(min-p)/d,t1=(max-p)/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return false;
  }return hi>=0&&lo<=1;
 });
}
/** Finite visibility graph over obstacle corners: deterministic, no 768² per-unit
 * search grids. At most 50 nodes for this map. Cacheable static corner topology. */
const graphCache=new Map();
function cornerGraph(map,radius){
 const key=map.id+':'+radius; if(graphCache.has(key))return graphCache.get(key);
 const nodes=[];
 for(const o of map.obstacles){const [x0,z0,x1,z1]=bounds(o,radius+.35);for(const p of [{x:x0,z:z0},{x:x0,z:z1},{x:x1,z:z0},{x:x1,z:z1}])if(terrainPointClear(map,p,radius))nodes.push(p);}
 const edges=nodes.map(()=>[]);
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)if(terrainSegmentClear(map,nodes[i],nodes[j],radius)){const cost=Math.hypot(nodes[i].x-nodes[j].x,nodes[i].z-nodes[j].z);edges[i].push([j,cost]);edges[j].push([i,cost]);}
 const result={nodes,edges};graphCache.set(key,result);return result;
}
export function findTerrainRoute(map,start,end,radius=0){
 if(!terrainPointClear(map,start,radius)||!terrainPointClear(map,end,radius))return null;
 if(terrainSegmentClear(map,start,end,radius))return [{x:end.x,z:end.z}];
 const graph=cornerGraph(map,radius),nodes=[...graph.nodes,{x:start.x,z:start.z},{x:end.x,z:end.z}],n=nodes.length,from=n-2,to=n-1,edges=graph.edges.map(e=>e.slice());edges.push([],[]);
 for(const k of [from,to])for(let i=0;i<from;i++)if(terrainSegmentClear(map,nodes[k],nodes[i],radius)){const cost=Math.hypot(nodes[k].x-nodes[i].x,nodes[k].z-nodes[i].z);edges[k].push([i,cost]);edges[i].push([k,cost]);}
 const costs=Array(n).fill(Infinity),previous=Array(n).fill(-1),done=new Set();costs[from]=0;
 for(let iteration=0;iteration<n;iteration++){
  let u=-1;for(let i=0;i<n;i++)if(!done.has(i)&&(u<0||costs[i]<costs[u]))u=i;
  if(u<0||!Number.isFinite(costs[u]))break;if(u===to)break;done.add(u);
  for(const [v,cost] of edges[u])if(costs[u]+cost<costs[v]){costs[v]=costs[u]+cost;previous[v]=u;}
 }
 if(!Number.isFinite(costs[to]))return null;
 const route=[];for(let i=to;i!==from;i=previous[i]){if(i<0)return null;route.push({...nodes[i]});}return route.reverse();
}
export function routeLength(start,route){let total=0,prev=start;for(const p of route||[]){total+=Math.hypot(p.x-prev.x,p.z-prev.z);prev=p;}return total;}
