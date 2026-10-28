const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),Module=require('module');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const nativeInterval=global.setInterval,nativeClear=global.clearInterval;const intervals=new Map();let tickId=0;global.setInterval=(fn,ms)=>{const id=++tickId;intervals.set(id,{fn,ms});return id;};global.clearInterval=id=>intervals.delete(id);const writes=[];const fixture=Array.from({length:100},(_,i)=>({id:'synthetic-'+i,role:i%2?'assistant':'user',content:'Synthetic test content. '.repeat(20)}));const load=Module._load;let focused=true,photos=0,files=0,uploads=[],submissions=[],stops=0,failUpload=false;
const storage=new Map(),appListeners=new Set();const voice={status:'connected',isActive:true,isConnected:true,isSupported:true,muted:false,speaking:false,level:0,startedAt:1,stop:()=>stops++,start(){},resume(){},toggleMute(){}};
const animation=()=>({start(){},stop(){}});
Module._load=function(id,...args){
 if(id==='react-native')return {ActivityIndicator:'Spinner',Alert:{alert(){}},AppState:{currentState:'active',addEventListener:(_e,fn)=>{appListeners.add(fn);return {remove:()=>appListeners.delete(fn)}}},AccessibilityInfo:{isReduceMotionEnabled:async()=>true,addEventListener:()=>({remove(){}})},Animated:{Value:class{setValue(){} interpolate(config){return config.outputRange[0]}},View:'AnimatedView',timing:animation,sequence:animation,loop:animation},FlatList:'FlatList',Image:'Image',Linking:{},Modal:({visible,children})=>visible?React.createElement('Modal',null,children):null,Platform:{OS:'ios'},ScrollView:'ScrollView',Share:{},StyleSheet:{create:x=>x},Text:'Text',TextInput:'TextInput',TouchableOpacity:'Button',View:'View'};
 if(id==='@react-navigation/native')return {useIsFocused:()=>focused};
 if(id==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:47,bottom:34})};
 if(id==='@react-native-async-storage/async-storage')return {getItem:async k=>storage.get(k)||null,setItem:async(k,v)=>{writes.push({key:k,bytes:Buffer.byteLength(v)});storage.set(k,v)}};
 if(id==='expo-image-picker')return {launchImageLibraryAsync:async()=>{photos++;return {canceled:false,assets:[{uri:'file:///photo',width:100,height:100,fileName:'Picture.jpg'}]}}};
 if(id==='expo-document-picker')return {getDocumentAsync:async()=>{files++;return {canceled:true}}};
 if(id==='expo-file-system/legacy')return {documentDirectory:'file:///private/'};
 if(id.startsWith('expo-'))return {};
 if(id.includes('@expo/vector-icons'))return {__esModule:true,default:'Icon'};
 if(id.endsWith('/ChatViewport'))return {ChatViewport:({children})=>React.createElement('Viewport',null,children)};
 if(id.endsWith('/AssistantCamera'))return {AssistantCamera:'CameraPanel'};
 if(id.endsWith('/chatStore'))return {useChatStore:fn=>fn({messages:[],hasHydrated:true})};
 if(id.endsWith('/useRealtimeVoice'))return {useRealtimeVoice:()=>voice,liveVoiceSession:{getSnapshot:()=>voice}};
 if(id.endsWith('/services/assistantMedia'))return {MAX_ATTACHMENTS:5,prepareAttachment:async()=>({id:'photo1',fileName:'Picture.jpg',uri:'file:///private/assistant-drafts/photo1',image:true}),removeLocalAttachments:async()=>{},uploadAttachments:async(id,files)=>{uploads.push({id,files});if(failUpload)throw Error('Offline; retry');return files.map(f=>f.id)}};
 if(id.endsWith('/services/assistant'))return {newSubmissionId:()=>`message${submissions.length}`,loadSubmissions:async()=>[],saveSubmission:async()=>{},submit:async x=>submissions.push(x),visibleHistory:()=>fixture,assistantApi:async path=>path==='/bootstrap'?{conversations:[{id:'home',title:'Home'}]}:path.endsWith('/activity')?{session:{},tasks:[],artifacts:[]}:path.includes('/events')?{events:[],epoch:'e',cursor:0}:{messages:[]}};
 return load.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,f);
const Screen=require('../src/screens/AssistantScreen.tsx').default;Module._load=load;

test('unchanged history across 100 actual screen refreshes causes only the initial cache write',async()=>{
 let ui;await act(async()=>{ui=create(React.createElement(Screen));});
 const interval=[...intervals.values()].find(x=>x.ms===1800);assert.ok(interval);
 const initial=writes.filter(x=>x.key==='echo-assistant-tail-home').length;
 for(let i=0;i<100;i++) await act(async()=>{await interval.fn();});
 const cacheWrites=writes.filter(x=>x.key==='echo-assistant-tail-home');
 console.log(JSON.stringify({synthetic:true,refreshes:100,initialWrites:initial,totalCacheWrites:cacheWrites.length,bytesWritten:cacheWrites.reduce((s,w)=>s+w.bytes,0),cachePayloadBytes:Buffer.byteLength(storage.get('echo-assistant-tail-home')),unchangedPayload:true}));
 assert.equal(initial,1);assert.equal(cacheWrites.length,1);
 await act(async()=>ui.unmount());global.setInterval=nativeInterval;global.clearInterval=nativeClear;
});
