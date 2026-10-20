const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),Module=require('module');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const load=Module._load;let permission,createRecording,hook;const ownershipPath='../src/services/audioOwnership.ts';
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const ownership=require(ownershipPath);
Module._load=function(id,...args){
 if(id.endsWith('/clinicalAudioHandoff'))return {beginClinicalAudio:async(owner)=>{ownership.claimClinicalAudio(owner);return true;}};
 if(id==='expo-av')return {Audio:{requestPermissionsAsync:()=>permission(),setAudioModeAsync:async()=>{},Recording:{createAsync:()=>createRecording()},RecordingOptionsPresets:{HIGH_QUALITY:{}}}};
 if(id==='expo-haptics')return {impactAsync:async()=>{},notificationAsync:async()=>{},ImpactFeedbackStyle:{Heavy:'heavy',Medium:'medium'},NotificationFeedbackType:{Warning:'warning'}};
 return load.call(this,id,...args);
};
const {useVoiceRecording}=require('../src/hooks/useVoiceRecording.ts');Module._load=load;
function Screen(){hook=useVoiceRecording();return null;}
test('leaving during microphone permission keeps lease until cancellation is resolved',async()=>{
 let resolve,ui,pending;permission=()=>new Promise(r=>resolve=r);createRecording=()=>{throw Error('Must not record after navigation');};
 await act(async()=>{ui=create(React.createElement(Screen));});
 await act(async()=>{pending=hook.startRecording();await Promise.resolve();});assert.equal(ownership.hasClinicalAudioLease(),true);
 await act(async()=>ui.unmount());assert.equal(ownership.hasClinicalAudioLease(),true);
 await act(async()=>{resolve({status:'granted'});await pending;});assert.equal(ownership.hasClinicalAudioLease(),false);
});
test('late native recorder is stopped after unmount, before releasing its lease',async()=>{
 let resolve,ui,pending,stopped=false;permission=async()=>({status:'granted'});createRecording=()=>new Promise(r=>resolve=r);
 await act(async()=>{ui=create(React.createElement(Screen));});
 await act(async()=>{pending=hook.startRecording();await new Promise(r=>setImmediate(r));});
 await act(async()=>ui.unmount());assert.equal(ownership.hasClinicalAudioLease(),true);
 await act(async()=>{resolve({recording:{stopAndUnloadAsync:async()=>{stopped=true;}}});await pending;});assert.equal(stopped,true);assert.equal(ownership.hasClinicalAudioLease(),false);
});
