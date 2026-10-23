const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), ts = require('typescript'), Module = require('module');
const React = require('react'), { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const load = Module._load;
const requests = [], peers = [], nativeListeners = new Set(), appListeners = new Set();
let routes = 0, voiceCount = 0, currentVoice;
class Peer {
  connectionState = 'new'; iceGatheringState = 'complete'; localDescription = {sdp:'offer'};
  constructor() { peers.push(this); }
  addTransceiver(track) { this.track = track; }
  async createOffer() { return {sdp:'offer'}; }
  async setLocalDescription() {}
  async setRemoteDescription() { this.connectionState = 'connected'; this.onconnectionstatechange?.(); }
  close() { this.connectionState = 'closed'; this.onconnectionstatechange?.(); }
  async getStats() { return new Map(); }
}
const app = { currentState:'active', addEventListener(_,fn) { appListeners.add(fn); return {remove:()=>appListeners.delete(fn)}; } };
Module._load = function(id, ...args) {
  if (id === 'react-native') return {Platform:{OS:'ios'}, AppState:app, NativeModules:{EchoAudioSession:{}}, NativeEventEmitter:class { addListener(_,fn) {nativeListeners.add(fn);return {remove:()=>nativeListeners.delete(fn)};} }};
  if (id === '@react-native-async-storage/async-storage') return {getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{}};
  if (id.endsWith('/services/realtimeVoice')) return {hasWebRtcRuntime:()=>true, getWebRtcRuntime:()=>({RTCPeerConnection:Peer,mediaDevices:{getUserMedia:async()=>{
    const track={enabled:true,stopped:false,stop(){this.stopped=true;}};return {getTracks:()=>[track],getAudioTracks:()=>[track]};
  }}})};
  if (id.endsWith('/services/assistant')) return {ACTIVE_VOICE_KEY:'active',closeAbandonedVoice:async()=>{},assistantApi:async(path)=>{requests.push(path);return path.endsWith('/voice')?{voiceSessionId:`v${++voiceCount}`}:{answerSdp:'answer'};}};
  if (id.endsWith('/services/liveAudioRoute')) return {prepareLiveVoiceAudioRoute:async()=>{routes++;},releaseLiveVoiceAudioRoute:async()=>{routes--;}};
  return load.call(this,id,...args);
};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {useRealtimeVoice,liveVoiceSession} = require('../src/hooks/useRealtimeVoice.ts');
const ownership = require('../src/services/audioOwnership.ts');
Module._load = load;
function Screen(){currentVoice=useRealtimeVoice('project-a');return null;}
after(async()=>{await liveVoiceSession.stop();});
test('call survives UI unmount and backgrounding; mute changes only outgoing track',async()=>{
  let ui;await act(async()=>{ui=create(React.createElement(Screen));});
  await act(async()=>{await currentVoice.start();});
  const pc=peers.at(-1);assert.equal(currentVoice.status,'connected');
  await act(async()=>{currentVoice.toggleMute();});assert.equal(pc.track.enabled,false);assert.equal(pc.connectionState,'connected');
  await act(async()=>{ui.unmount();});
  app.currentState='background';appListeners.forEach(fn=>fn('background'));
  assert.equal(pc.track.stopped,false);assert.equal(liveVoiceSession.getSnapshot().status,'connected');
  await act(async()=>{ui=create(React.createElement(Screen));});assert.equal(currentVoice.muted,true);
  assert.equal(requests.filter(x=>x.endsWith('/voice')).length,1);
  assert.equal(requests.filter(x=>x.endsWith('/ready')).length,1);
  await act(async()=>{currentVoice.toggleMute();});assert.equal(pc.track.enabled,true);
  app.currentState='active';
  // Transient network loss keeps the existing session rather than replaying a request.
  await act(async()=>{pc.connectionState='disconnected';pc.onconnectionstatechange();});assert.equal(currentVoice.status,'reconnecting');
  await act(async()=>{pc.connectionState='connected';pc.onconnectionstatechange();});assert.equal(currentVoice.status,'connected');
  assert.equal(requests.filter(x=>x.endsWith('/voice')).length,1);
  assert.equal(requests.filter(x=>x.endsWith('/ready')).length,1,'transient reconnect must not request another recap');
  // Native interruption requires explicit resume and never silently unmutes.
  await act(async()=>{nativeListeners.forEach(fn=>fn({type:'interruption'}));});assert.equal(currentVoice.status,'paused');assert.equal(pc.track.enabled,false);
  await act(async()=>{currentVoice.toggleMute();});assert.equal(pc.track.enabled,false);
  await act(async()=>{await currentVoice.resume();});assert.equal(currentVoice.status,'connected');assert.equal(currentVoice.muted,true);
  await act(async()=>{await currentVoice.stop();});assert.equal(pc.track.stopped,true);assert.equal(currentVoice.status,'idle');
  assert.equal(nativeListeners.size,0);assert.equal(appListeners.size,0);
  await act(async()=>{ui.unmount();});
});
test('clinical lease blocks a personal call and terminal failure cleans up without action replay',async()=>{
  let ui;await act(async()=>{ui=create(React.createElement(Screen));});const owner={};ownership.claimClinicalAudio(owner);
  const count=peers.length;await act(async()=>{await currentVoice.start();});assert.equal(peers.length,count);assert.match(currentVoice.error,/dictation/);
  ownership.releaseClinicalAudio(owner);await act(async()=>{await currentVoice.start();});const pc=peers.at(-1);
  await act(async()=>{pc.connectionState='failed';pc.onconnectionstatechange();await Promise.resolve();});assert.equal(pc.track.stopped,true);assert.equal(currentVoice.status,'idle');
  assert.equal(requests.some(x=>x.includes('/messages')||x.includes('/stop')),false);
  await act(async()=>{ui.unmount();});
});
