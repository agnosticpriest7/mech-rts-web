/** v5.1 browser presentation. Asset units are metres; never normalize animated bounds. */
export function createArtilleryRig(T,cloneSkeleton,asset){
 const root=cloneSkeleton(asset.scene);root.name='Artillery v5.1';root.userData.art=true;
 root.traverse(o=>{o.userData.sharedAsset=true;if(o.isMesh){o.castShadow=false;o.receiveShadow=true;o.frustumCulled=false;}});
 const mixer=new T.AnimationMixer(root),actions={};let disposed=false,current='',elapsed=0,deadState=false,fireRemaining=0;
 for(const source of asset.animations){
  const clip=source.clone();
  // Locomotion belongs to the authoritative simulation; preserve vertical weight shift.
  for(const track of clip.tracks)if(/^(root|MechRig)\.position$/.test(track.name))for(let i=0;i<track.values.length;i+=3){track.values[i]=track.values[0];track.values[i+2]=track.values[2];}
  if(clip.name==='Cannons_Fire')clip.tracks=clip.tracks.filter(t=>/^(barrel_|pod_pitch_|pod_yaw_)/.test(t.name));
  actions[clip.name]=mixer.clipAction(clip);
 }
 function play(name){if(current===name||!actions[name])return;const previous=actions[current],next=actions[name];previous?.fadeOut(.18);const one=['Idle_To_Walk','Walk_To_Stop','Death'].includes(name);next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).setLoop(one?T.LoopOnce:T.LoopRepeat,one?1:Infinity);next.clampWhenFinished=one;next.fadeIn(.18).play();current=name;elapsed=0;}
 play('Idle');mixer.update(0);
 function update({speed=0,dt=0,dead=false,dropping=false}={}){
  if(disposed||!(dt>0))return;dt=Math.min(.5,dt);elapsed+=dt;
  if(dead){if(!deadState){deadState=true;actions.Cannons_Fire?.stop();fireRemaining=0;play('Death');}}
  else if(!deadState){const moving=!dropping&&speed>.08;
   if(dropping){play('Idle');}
   else if(moving){if(current==='Idle'||current==='Walk_To_Stop')play(actions.Idle_To_Walk?'Idle_To_Walk':'Walk_Heavy');else if(current==='Idle_To_Walk'&&elapsed>=actions.Idle_To_Walk.getClip().duration-.08)play('Walk_Heavy');}
   else {if(current==='Walk_Heavy'||current==='Idle_To_Walk')play(actions.Walk_To_Stop?'Walk_To_Stop':'Idle');else if(current==='Walk_To_Stop'&&elapsed>=actions.Walk_To_Stop.getClip().duration-.08)play('Idle');}
   if(current==='Walk_Heavy')actions.Walk_Heavy.setEffectiveTimeScale(Math.min(2,Math.max(.1,speed/1.5)));
  }
  if(fireRemaining>0){fireRemaining-=dt;if(fireRemaining<=.12)actions.Cannons_Fire?.fadeOut(.12);}
  mixer.update(dt);
 }
 function fire(){if(disposed||deadState)return;const a=actions.Cannons_Fire;if(!a)return;a.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).setLoop(T.LoopOnce,1);a.clampWhenFinished=false;a.play();fireRemaining=a.getClip().duration;}
 return {root,update,fire,mixer,diagnostics:()=>({clip:current,fire:fireRemaining>0,disposed,clips:Object.keys(actions),nominalSpeed:1.5}),dispose(){if(disposed)return;disposed=true;mixer.stopAllAction();mixer.uncacheRoot(root);const skeletons=new Set();root.traverse(o=>{if(o.skeleton)skeletons.add(o.skeleton);});for(const s of skeletons)s.dispose();root.removeFromParent();}};
}

