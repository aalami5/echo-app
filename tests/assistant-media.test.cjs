const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),Module=require('module');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const load=Module._load;let seq=0,calls=[],copies=[],deletes=[],size=100,failUpload=false;
Module._load=function(id,...args){
 if(id==='expo-file-system/legacy')return {documentDirectory:'file:///private/',EncodingType:{Base64:'base64'},getInfoAsync:async()=>({exists:true,size}),makeDirectoryAsync:async()=>{},copyAsync:async o=>copies.push(o),deleteAsync:async p=>deletes.push(p),readAsStringAsync:async()=>Buffer.from('image').toString('base64')};
 if(id==='expo-image-manipulator')return {SaveFormat:{JPEG:'jpeg'},manipulateAsync:async(uri,actions,opts)=>{calls.push({uri,actions,opts});return {uri:'file:///normalized.jpg'};}};
 if(id==='./assistant')return {newSubmissionId:()=>`attachment_${++seq}`,assistantApi:async(path,body)=>{calls.push({path,body});if(failUpload)throw Error('offline');return {id:body.idempotencyKey};}};
 if(id==='react-native')return {ActivityIndicator:'Spinner',Image:'Image',Linking:{openSettings:async()=>{}},Platform:{OS:'ios'},StyleSheet:{create:x=>x},Text:'Text',TouchableOpacity:'Button',View:'View'};
 if(id==='expo-camera')return {CameraView:React.forwardRef((props,ref)=>{React.useImperativeHandle(ref,()=>({takePictureAsync:async()=>({uri:'file:///capture.jpg',width:100,height:100})}));return React.createElement('Camera',props);}),useCameraPermissions:()=>[{granted:true,canAskAgain:true},async()=>{}]};
 return load.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,f);
const media=require('../src/services/assistantMedia.ts'),{AssistantCamera}=require('../src/components/AssistantCamera.tsx');Module._load=load;
test('photo normalized, bounded in portrait, copied locally; choosing it does not upload',async()=>{
 calls=[];size=100;const a=await media.prepareAttachment({uri:'file:///original.heic',name:'image.heic',width:3000,height:4000},true);
 assert.equal(a.mimeType,'image/jpeg');assert.equal(a.fileName,'image.jpg');assert.match(a.uri,/private\/assistant-drafts/);
 assert.deepEqual(calls[0].actions,[{resize:{height:2200}}]);assert.equal(calls.some(c=>c.path),false);
});
test('uploads remain scoped, stable retry keys survive lost acknowledgments; reject oversized files',async()=>{
 calls=[];size=100;const a=await media.prepareAttachment({uri:'file:///doc.pdf',name:'document.pdf',mimeType:'application/pdf'});
 failUpload=true;await assert.rejects(media.uploadAttachments('projectA',[a],()=>{}),/offline/);
 failUpload=false;const progress=[];const ids=await media.uploadAttachments('projectA',[a],(d,t)=>progress.push([d,t]));
 assert.deepEqual(ids,[a.id]);const uploads=calls.filter(c=>c.path);assert.equal(uploads[0].body.idempotencyKey,uploads[1].body.idempotencyKey);assert.equal(uploads[1].body.conversationId,'projectA');assert.deepEqual(progress,[[0,1],[1,1]]);
 size=media.MAX_ATTACHMENT_BYTES+1;await assert.rejects(media.uploadAttachments('projectA',[a],()=>{}),/exceeds 6 MB/);size=100;
});
test('cleanup cannot delete unrelated clinical or source files',async()=>{
 deletes=[];await media.removeLocalAttachments([{uri:'file:///clinical/report.pdf'},{uri:'file:///private/assistant-drafts/a.jpg'}]);assert.deepEqual(deletes,['file:///private/assistant-drafts/a.jpg']);
});
test('live camera capture requires review and explicit Add; retake sends nothing',async()=>{
 let ui,added=0;await act(async()=>{ui=create(React.createElement(AssistantCamera,{busy:false,onCapture:async()=>{added++;},onClose(){}}));});
 const button=label=>ui.root.findAllByType('Button').find(b=>b.props.accessibilityLabel===label);
 assert.equal(button('Capture photo').props.disabled,true);
 await act(async()=>ui.root.findByType('Camera').props.onCameraReady());
 await act(async()=>button('Capture photo').props.onPress());
 assert.equal(added,0);assert.equal(ui.root.findAllByType('Camera').length,0);assert.equal(ui.root.findAllByType('Image').length,1);
 await act(async()=>button('Retake').props.onPress());assert.equal(added,0);
 await act(async()=>ui.root.findByType('Camera').props.onCameraReady());await act(async()=>button('Capture photo').props.onPress());await act(async()=>button('Add photo').props.onPress());assert.equal(added,1);await act(async()=>ui.unmount());
});
