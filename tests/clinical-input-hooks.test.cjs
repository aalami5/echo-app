const {test}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const Module=require('module');const fs=require('fs');
const React=require('react');const {create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
let hook,permission='granted',pickerOptions,conversion,deleted,scanFail=false,voiceKey;
const load=Module._load;Module._load=function(id,...args){
 if(id==='expo-image-picker')return {requestCameraPermissionsAsync:async()=>({status:permission}),requestMediaLibraryPermissionsAsync:async()=>({status:permission}),launchCameraAsync:async options=>{pickerOptions=options;return {assets:[{uri:'file:///synthetic.heic',width:4000}]};},launchImageLibraryAsync:async options=>{pickerOptions=options;return {assets:[{uri:'file:///synthetic.png',width:1200}]};}};
 if(id==='expo-image-manipulator')return {SaveFormat:{JPEG:'jpeg'},manipulateAsync:async(...args)=>{conversion=args;return {uri:'file:///converted.jpg',base64:'synthetic'};}};
 if(id==='expo-file-system/legacy')return {deleteAsync:async uri=>{deleted=uri;}};
 if(id.endsWith('/clinicalMedia'))return {clinicalMediaRequest:async(path,body)=>{assert.equal(path,'/scan');assert.equal(JSON.parse(body()).mimeType,'image/jpeg');if(scanFail)throw Error('Service unavailable');return {name:'SYNTHETIC, TEST',mrn:'000123',hospital:'Sequoia Hospital'};}};
 if(id.endsWith('/useVoiceRecording'))return {useVoiceRecording:()=>({startRecording:async()=>{},stopRecording:async()=>'file:///audio.m4a',cancelRecording:async()=>{}})};
 if(id.endsWith('/whisper'))return {createWhisperService:key=>{voiceKey=key;return {transcribe:async uri=>{assert.equal(uri,'file:///audio.m4a');return {text:'Left calf pain with walking.'};}};}};
 return load.call(this,id,...args);
};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {usePatientScan}=require('../src/hooks/usePatientScan.ts');const {usePatientVoiceInput}=require('../src/hooks/usePatientVoiceInput.ts');
async function mount(useHook){function Harness(){hook=useHook();return null;}let tree;await act(async()=>{tree=create(React.createElement(Harness));});return tree;}
test('camera/library OCR normalizes HEIC without cropping, populates exact MRN and cleans temporary conversion',async()=>{
 const tree=await mount(usePatientScan);let data;await act(async()=>{data=await hook.scanFromCamera();});
 assert.equal(data.mrn,'000123');assert.equal(data.hospital,'SEQ');assert.equal(pickerOptions.allowsEditing,false);assert.deepEqual(conversion[1],[{resize:{width:2200}}]);assert.equal(deleted,'file:///converted.jpg');assert.equal(hook.isProcessing,false);
 await act(async()=>hook.scanFromLibrary());assert.deepEqual(conversion[1],[]);await act(async()=>tree.unmount());
});
test('scan failure is exposed and permission denial does not upload',async()=>{
 const tree=await mount(usePatientScan);scanFail=true;await act(async()=>hook.scanFromCamera());assert.equal(hook.error,'Service unavailable');assert.equal(hook.isProcessing,false);
 scanFail=false;permission='denied';await act(async()=>hook.scanFromCamera());assert.equal(hook.error,'Camera permission required');assert.equal(hook.isScanning,false);permission='granted';await act(async()=>tree.unmount());
});
test('chief complaint recording transcribes without any phone-side provider credential',async()=>{
 const tree=await mount(usePatientVoiceInput);await act(async()=>hook.startRecording());let text;await act(async()=>{text=await hook.stopAndTranscribe();});assert.equal(text,'Left calf pain with walking.');assert.equal(voiceKey,undefined);assert.equal(hook.error,null);assert.equal(hook.isTranscribing,false);await act(async()=>tree.unmount());
});
