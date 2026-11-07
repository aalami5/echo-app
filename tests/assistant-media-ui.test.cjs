const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),Module=require('module');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const load=Module._load;let focused=true,photos=0,files=0,uploads=[],submissions=[],stops=0,failUpload=false,haptics=0,holdSubmit=null;
const storage=new Map(),appListeners=new Set();const voice={status:'connected',isActive:true,isConnected:true,isSupported:true,muted:false,speaking:false,level:0,startedAt:1,stop:()=>stops++,start(){},resume(){},toggleMute(){}};
const animation=()=>({start(){},stop(){}});
Module._load=function(id,...args){
 if(id==='react-native')return {ActivityIndicator:'Spinner',Alert:{alert(){}},AppState:{currentState:'active',addEventListener:(_e,fn)=>{appListeners.add(fn);return {remove:()=>appListeners.delete(fn)}}},AccessibilityInfo:{isReduceMotionEnabled:async()=>true,addEventListener:()=>({remove(){}})},Animated:{Value:class{setValue(){} interpolate(config){return config.outputRange[0]}},View:'AnimatedView',timing:animation,sequence:animation,loop:animation},FlatList:'FlatList',Image:'Image',Linking:{},Modal:({visible,children})=>visible?React.createElement('Modal',null,children):null,Platform:{OS:'ios'},ScrollView:'ScrollView',Share:{},StyleSheet:{create:x=>x},Text:'Text',TextInput:'TextInput',TouchableOpacity:'Button',View:'View'};
 if(id==='@react-navigation/native')return {useIsFocused:()=>focused};
 if(id==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:47,bottom:34})};
 if(id==='@react-native-async-storage/async-storage')return {getItem:async k=>storage.get(k)||null,setItem:async(k,v)=>storage.set(k,v)};
 if(id==='expo-image-picker')return {launchImageLibraryAsync:async()=>{photos++;return {canceled:false,assets:[{uri:'file:///photo',width:100,height:100,fileName:'Picture.jpg'}]}}};
 if(id==='expo-document-picker')return {getDocumentAsync:async()=>{files++;return {canceled:true}}};
 if(id==='expo-file-system/legacy')return {documentDirectory:'file:///private/'};
 if(id==='expo-router')return {useLocalSearchParams:()=>({}),useRouter:()=>({replace(){}})};
 if(id==='expo-haptics')return {NotificationFeedbackType:{Success:'success'},notificationAsync:async()=>{haptics++;}};
 if(id.startsWith('expo-'))return {};
 if(id.includes('@expo/vector-icons'))return {__esModule:true,default:'Icon'};
 if(id.endsWith('/ChatViewport'))return {ChatViewport:({children})=>React.createElement('Viewport',null,children)};
 if(id.endsWith('/AssistantCamera'))return {AssistantCamera:'CameraPanel'};
 if(id.endsWith('/chatStore'))return {useChatStore:fn=>fn({messages:[],hasHydrated:true})};
 if(id.endsWith('/useRealtimeVoice'))return {useRealtimeVoice:()=>voice,liveVoiceSession:{getSnapshot:()=>voice}};
 if(id.endsWith('/services/assistantMedia'))return {MAX_ATTACHMENTS:5,prepareAttachment:async()=>({id:'photo1',fileName:'Picture.jpg',uri:'file:///private/assistant-drafts/photo1',image:true}),removeLocalAttachments:async()=>{},uploadAttachments:async(id,files,progress)=>{uploads.push({id,files});progress(0,files.length);if(failUpload)throw Error('Offline; retry');progress(files.length,files.length);return files.map(f=>f.id)}};
 if(id.endsWith('/services/assistant'))return {newSubmissionId:()=>`message${submissions.length}`,loadSubmissions:async()=>[],saveSubmission:async()=>{},submit:async x=>{submissions.push(x);if(holdSubmit)await holdSubmit;},visibleHistory:()=>[],assistantApi:async path=>path==='/bootstrap'?{conversations:[{id:'home',title:'Home'}]}:path.endsWith('/activity')?{session:{},tasks:[],artifacts:[]}:path.includes('/events')?{events:[],epoch:'e',cursor:0}:{messages:[]}};
 return load.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,f);
const Screen=require('../src/screens/AssistantScreen.tsx').default;Module._load=load;
const press=async(ui,label)=>{const b=ui.root.findAllByType('Button').find(b=>b.props.accessibilityLabel===label);assert.ok(b,label);assert.ok(!b.props.disabled,`${label} enabled`);await act(async()=>b.props.onPress());};
test('photo draft survives voice/text/tab switches and upload failure; explicit send shares same conversation',async()=>{
 let ui;await act(async()=>{ui=create(React.createElement(Screen));});await press(ui,'Return to Live Voice');
 assert.equal(ui.root.findAllByType('Modal').length,0);
 assert.equal(ui.root.findAllByType('Text').some(t=>t.children.some(v=>typeof v==='string'&&/^(Tasks(?: ·.*)?|Show all|Active only)$/.test(v))),false);
 for(const label of ['Show captions','Mute microphone','Hang up','Switch to chat; keep connection active'])assert.ok(ui.root.findAllByType('Button').some(b=>b.props.accessibilityLabel===label),label);
 await press(ui,'Add attachment');await press(ui,'Photo Library');assert.equal(photos,1);assert.equal(uploads.length,0);assert.equal(submissions.length,0);assert.ok(ui.root.findAllByType('Image').length);
 focused=false;await act(async()=>ui.update(React.createElement(Screen)));assert.equal(stops,0);
 focused=true;await act(async()=>ui.update(React.createElement(Screen)));assert.ok(ui.root.findAllByType('Image').length);
 await press(ui,'Switch to chat; keep connection active');await press(ui,'Add attachment');await press(ui,'Cancel');assert.equal(stops,0);
 await press(ui,'Return to Live Voice');failUpload=true;await press(ui,'Send to Echo');assert.equal(submissions.length,0);assert.ok(ui.root.findAllByType('Image').length);
 failUpload=false;await press(ui,'Send to Echo');assert.equal(submissions.length,1);assert.equal(submissions[0].conversationId,'home');assert.deepEqual(submissions[0].attachmentIds,['photo1']);assert.equal(stops,0);
 assert.equal(ui.root.findAllByType('Image').length,0);await act(async()=>ui.unmount());
});
test('camera closes on navigation away without hanging up or changing conversation',async()=>{
 let ui;await act(async()=>{ui=create(React.createElement(Screen));});await press(ui,'Return to Live Voice');await press(ui,'Add attachment');await press(ui,'Camera');assert.equal(ui.root.findAllByType('CameraPanel').length,1);
 focused=false;await act(async()=>ui.update(React.createElement(Screen)));assert.equal(ui.root.findAllByType('CameraPanel').length,0);
 focused=true;await act(async()=>ui.update(React.createElement(Screen)));assert.equal(ui.root.findAllByType('CameraPanel').length,0);assert.equal(stops,0);await act(async()=>ui.unmount());
});

test('Hang up also closes an open camera, but retains the conversation draft',async()=>{
 let ui;await act(async()=>{ui=create(React.createElement(Screen));});await press(ui,'Return to Live Voice');await press(ui,'Add attachment');await press(ui,'Photo Library');await press(ui,'Add attachment');await press(ui,'Camera');assert.equal(ui.root.findAllByType('CameraPanel').length,1);
 await press(ui,'Hang up');assert.equal(stops,1);assert.equal(ui.root.findAllByType('CameraPanel').length,0);assert.equal(ui.root.findAllByType('Image').length,1);await act(async()=>ui.unmount());
});

test('voice plus menu offers all sources; Files cancellation and menu cancellation do not send or disconnect',async()=>{
 const before={stops,uploads:uploads.length,submissions:submissions.length,files};let ui;
 await act(async()=>{ui=create(React.createElement(Screen));});await press(ui,'Return to Live Voice');
 assert.equal(ui.root.findAllByType('Button').filter(b=>b.props.accessibilityLabel==='Add attachment').length,1);
 await press(ui,'Add attachment');
 for(const label of ['Camera','Photo Library','Files','Cancel'])assert.ok(ui.root.findAllByType('Button').some(b=>b.props.accessibilityLabel===label));
 await press(ui,'Files');assert.equal(files,before.files+1);
 assert.equal(ui.root.findAllByType('Button').some(b=>b.props.accessibilityLabel==='Files'),false);
 await press(ui,'Add attachment');await press(ui,'Cancel');
 assert.equal(stops,before.stops);assert.equal(uploads.length,before.uploads);assert.equal(submissions.length,before.submissions);
 await act(async()=>ui.unmount());
});
test('receipt stays out of Live and remains visible in Chat; haptic still confirms upload',async()=>{
 storage.clear(); const before=haptics; let ui,release;
 holdSubmit=new Promise(resolve=>{release=resolve;});
 await act(async()=>{ui=create(React.createElement(Screen));});await press(ui,'Return to Live Voice');
 await press(ui,'Add attachment');await press(ui,'Photo Library');
 let sending;
 await act(async()=>{sending=ui.root.findAllByType('Button').find(b=>b.props.accessibilityLabel==='Send to Echo').props.onPress();await new Promise(r=>setImmediate(r));});
 const texts=()=>ui.root.findAllByType('Text').map(t=>t.children.filter(x=>typeof x==='string').join('')).join('\n');
 assert.doesNotMatch(texts(),/Received 1 attachment/);
 await press(ui,'Switch to chat; keep connection active');
 assert.match(texts(),/Received 1 attachment · Saved by Echo/);
 assert.doesNotMatch(texts(),/Review ready/);assert.equal(haptics,before+1);
 await act(async()=>{release();await new Promise(r=>setImmediate(r));});holdSubmit=null;
 assert.match(texts(),/Received 1 attachment · Review requested/);
 await act(async()=>ui.unmount());
});

test('controlled Live and Chat tabs keep one draft and never start or stop voice',async()=>{
 storage.clear();let ui;const before=stops;
 await act(async()=>{ui=create(React.createElement(Screen,{mode:'chat',workspaceFocused:true}));});
 await act(async()=>ui.root.findByType('TextInput').props.onChangeText('Keep this unsent draft'));
 await act(async()=>ui.update(React.createElement(Screen,{mode:'live',workspaceFocused:true})));
 assert.equal(ui.root.findAllByType('TextInput').length,0);
 await press(ui,'Add attachment');await press(ui,'Camera');assert.equal(ui.root.findAllByType('CameraPanel').length,1);
 await act(async()=>ui.update(React.createElement(Screen,{mode:'chat',workspaceFocused:true})));
 assert.equal(ui.root.findAllByType('CameraPanel').length,0);
 assert.equal(ui.root.findByType('TextInput').props.value,'Keep this unsent draft');assert.equal(stops,before);
 await act(async()=>ui.unmount());
});

test('standalone Chat sends text while voice is disconnected',async()=>{
 storage.clear();const priorActive=voice.isActive,priorConnected=voice.isConnected,priorStatus=voice.status;
 voice.isActive=false;voice.isConnected=false;voice.status='idle';const before={stops,sent:submissions.length};let ui;
 try {
  await act(async()=>{ui=create(React.createElement(Screen,{mode:'chat',workspaceFocused:true}));});
  await act(async()=>ui.root.findByType('TextInput').props.onChangeText('Synthetic text-only check'));
  await press(ui,'Send');assert.equal(submissions.length,before.sent+1);assert.equal(submissions.at(-1).message,'Synthetic text-only check');assert.equal(submissions.at(-1).conversationId,'home');assert.equal(stops,before.stops);assert.equal(voice.isActive,false);
 } finally {await act(async()=>ui?.unmount());voice.isActive=priorActive;voice.isConnected=priorConnected;voice.status=priorStatus;}
});
