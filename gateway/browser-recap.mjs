// Browser-owned OpenClaw Talk: the data channel is the sole response owner.
// This module never receives credentials or calls the agent.
export function armBrowserRecap({channel, peer, session, isCurrent, schedule=setTimeout, unschedule=clearTimeout}) {
  const recap=session?.echoRecap;
  if(recap?.version!==1 || !recap.response || Date.now()-recap.createdAt>90000) return;
  let state='waiting', timer;
  const stop=()=>{if(timer)unschedule(timer);timer=undefined;state='skipped';};
  const ready=()=>{
    if(state!=='waiting' || !isCurrent() || channel.readyState!=='open' || peer.connectionState!=='connected')return;
    state='armed'; timer=schedule(()=>{
      timer=undefined;
      if(state!=='armed' || !isCurrent() || channel.readyState!=='open' || peer.connectionState!=='connected')return stop();
      state='speaking';
      channel.send(JSON.stringify({type:'response.create',event_id:'echo-recap-'+session.voiceSessionId,response:recap.response}));
    },750);
  };
  channel.addEventListener('message',event=>{
    let e;try{e=JSON.parse(event.data);}catch{return;}
    if(e.type==='input_audio_buffer.speech_started' || e.type==='conversation.item.input_audio_transcription.delta')stop();
    if(e.type==='response.created' && state!=='speaking')stop();
    if(e.type==='response.done' && state==='speaking')state='done';
  });
  channel.addEventListener('close',stop);
  channel.addEventListener('open',ready);
  peer.addEventListener('connectionstatechange',()=>{
    if(peer.connectionState==='connected')ready();
    else if(state==='armed' || ['failed','closed'].includes(peer.connectionState))stop();
  });
  ready();
  return {get state(){return state;}};
}
