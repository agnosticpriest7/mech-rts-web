/** Console derivatives of the approved AlienAnimation_20261112 skeletal art.
 * Simulation owns location, heading and damage; this module only presents it.
 */
export const ALIEN_ASSETS={runner:new URL("../assets/swarm_runner-console.glb",import.meta.url).href,heavy:new URL("../assets/heavy_crawler-console.glb",import.meta.url).href};
export function createAlienRig(T,cloneSkeleton,asset,{heavy=false,phase=0}={}){
 const root=cloneSkeleton(asset.scene);root.name=heavy?'Heavy crawler':'Swarm runner';root.userData.art=true;
 root.traverse(o=>{o.userData.sharedAsset=true;if(o.isMesh){o.castShadow=false;o.receiveShadow=true;o.frustumCulled=false;}});
 const mixer=new T.AnimationMixer(root),actions={};let current='',attackLeft=0,disposed=false;
 for(const clip of asset.animations)actions[clip.name]=mixer.clipAction(clip);
 function play(name){if(current===name||!actions[name])return;const prior=actions[current],next=actions[name];next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();if(name==='Attack'){next.setLoop(T.LoopOnce,1);next.clampWhenFinished=true;}else next.setLoop(T.LoopRepeat,Infinity);if(prior)next.crossFadeFrom(prior,.12,false);current=name;}
 play('Idle');if(actions.Idle)actions.Idle.time=Math.abs(phase)%actions.Idle.getClip().duration;
 function attack(){if(disposed)return;attackLeft=actions.Attack?.getClip().duration||0;current==='Attack'&&(current='');play('Attack');}
 function update({speed=0,dt=0,dead=false}={}){
  if(disposed||dead||dt<=0)return;
  attackLeft=Math.max(0,attackLeft-dt);const walking=speed>.12;
  play(attackLeft>0?'Attack':walking?'Walk':'Idle');
  if(current==='Walk')actions.Walk.setEffectiveTimeScale(T.MathUtils.clamp(speed/(heavy?.96:1.37),.35,3.2));
  mixer.update(dt);
 }
 return {root,mixer,update,attack,diagnostics:()=>({clip:current,clips:Object.keys(actions),disposed,heavy}),dispose(){if(disposed)return;disposed=true;mixer.stopAllAction();mixer.uncacheRoot(root);const bones=new Set();root.traverse(o=>{if(o.skeleton)bones.add(o.skeleton);});for(const skeleton of bones)skeleton.dispose();root.removeFromParent();}};
}
