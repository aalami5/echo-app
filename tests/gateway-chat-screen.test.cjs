const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),Module=require('module');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
let focused=true,submitted=[],receipts=[],failSend=false,params={},photos=0,uploads=0;
const values=new Map(),load=Module._load;
const brief={id:'brief-third-page',role:'assistant',content:'Morning brief\n\nFull saved daily brief',timestamp:'2026-11-07T16:30:00Z'};
const reminder={id:'reminder',role:'assistant',content:'Remember your meeting',timestamp:'2026-11-07T17:00:00Z'};
const inbox={subscribe:()=>()=>{},snapshot:()=>0,page:async()=>({messages:[reminder],hasMore:false}),get:async()=>reminder,put:async()=>{}};
Module._load=function(id,...args){
 if(id==='react-native')return {ActivityIndicator:'Spinner',Alert:{alert(){}},AppState:{currentState:'active',addEventListener:()=>({remove(){}})},FlatList:'List',Keyboard:{dismiss(){},addListener:()=>({remove(){}})},StyleSheet:{create:x=>x,hairlineWidth:1},Text:'Text',TextInput:'Input',TouchableOpacity:'Button',View:'View'};
 if(id==='@react-navigation/native')return {useIsFocused:()=>focused};
 if(id==='expo-router')return {useLocalSearchParams:()=>params};
 if(id==='@expo/vector-icons')return {Ionicons:'Icon'};
 if(id==='@react-native-async-storage/async-storage')return {__esModule:true,default:{getItem:async k=>values.get(k)||null,setItem:async(k,v)=>values.set(k,v)}};
 if(id==='expo-image-picker')return {launchImageLibraryAsync:async()=>{photos++;return {canceled:false,assets:[{uri:'photo',fileName:'Photo.jpg'}]};}};
 if(id.endsWith('/Avatar'))return {Avatar:'Avatar'};
 if(id.endsWith('/NextMeeting'))return {NextMeeting:'NextMeeting'};
 if(id.endsWith('/ChatMessage'))return {ChatMessage:'Message'};
 if(id.endsWith('/ChatViewport'))return {ChatViewport:({children})=>React.createElement('Viewport',null,children)};
 if(id.endsWith('/AssistantAttachmentTray'))return {AssistantAttachmentTray:'AttachmentTray'};
 if(id.endsWith('/useCalendar'))return {useCalendar(){}};
 if(id.endsWith('/useVoiceChat'))return {useVoiceChat:()=>({isSpeaking:false,speak:async()=>{},stopSpeaking:async()=>{}})};
 if(id.endsWith('/useRealtimeVoice'))return {liveVoiceSession:{getSnapshot:()=>({status:'connected'})}};
 if(id.endsWith('/gatewayChat'))return {chatMessage:x=>x,notificationInbox:inbox,readGatewayUpdates:async()=>[brief],readLinkedMessage:async()=>brief,syncGatewayNotifications:async()=>{}};
 if(id.endsWith('/assistantMedia'))return {prepareAttachment:async()=>({id:'photo-1',fileName:'Photo.jpg',uri:'file:///draft.jpg'}),uploadAttachments:async(_,files)=>{uploads++;return files.map(f=>f.id);},removeLocalAttachments:async()=>{}};
 if(id.endsWith('/services/assistant'))return {assistantApi:async path=>path.endsWith('/activity')?{session:{},submissions:receipts.map(r=>({...r,receipt:{id:r.id}}))}:{messages:[{id:'reply',role:'assistant',content:'Ordinary conversation',timestamp:'2026-11-07T18:00:00Z'}],nextOffset:100,totalMessages:300,hasMore:true},visibleHistory:x=>x,loadSubmissions:async()=>receipts,saveSubmission:async()=>{},newSubmissionId:()=>`app_${Date.now()}_test`,submit:async row=>{submitted.push(row);receipts=[{...row,state:failSend?'uncertain':'accepted'}];if(failSend)throw Error('Connection lost after submission');}};
 return load.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,f);
const Screen=require('../src/screens/GatewayChatScreen.tsx').default;Module._load=load;
const button=(ui,label)=>ui.root.findAllByType('Button').find(b=>b.props.accessibilityLabel===label);
const press=async(ui,label)=>{const b=button(ui,label);assert.ok(b,label);assert.ok(!b.props.disabled,label+' enabled');await act(async()=>{await b.props.onPress();});};
test('original header and notifications share the default timeline, independent of Live',async()=>{
 let ui;await act(async()=>{ui=create(React.createElement(Screen));});
 assert.equal(ui.root.findAllByType('Avatar').length,1);assert.equal(ui.root.findAllByType('NextMeeting').length,1);
 const list=ui.root.findByProps({testID:'gateway-chat-timeline'});assert.deepEqual(list.props.data.map(r=>r.id),['reply','reminder','brief-third-page']);
 assert.equal(button(ui,'Updates'),undefined);assert.equal(button(ui,'Talk with Echo'),undefined);
 assert.ok(button(ui,'Photo'));assert.ok(button(ui,'Type'));await act(async()=>ui.unmount());
});
test('draft survives tab switch; uncertain send is never resent and clears after receipt reconciliation',async()=>{
 values.clear();receipts=[];submitted=[];failSend=true;let ui;await act(async()=>{ui=create(React.createElement(Screen));});
 await press(ui,'Type');await act(async()=>ui.root.findByType('Input').props.onChangeText('Please check my day'));
 focused=false;await act(async()=>ui.update(React.createElement(Screen)));focused=true;await act(async()=>ui.update(React.createElement(Screen)));
 assert.equal(ui.root.findByType('Input').props.value,'Please check my day');await press(ui,'Send');
 assert.equal(submitted.length,1);assert.equal(submitted[0].conversationId,'home');assert.equal(button(ui,'Send').props.disabled,true);
 await act(async()=>button(ui,'Send').props.onPress());assert.equal(submitted.length,1);
 receipts=receipts.map(r=>({...r,state:'accepted'}));await press(ui,'Check delivery');assert.equal(ui.root.findByType('Input').props.value,'');assert.equal(submitted.length,1);
 await act(async()=>ui.unmount());failSend=false;
});
test('selecting photo creates only a local draft; sending is explicit',async()=>{
 values.clear();receipts=[];submitted=[];uploads=0;let ui;await act(async()=>{ui=create(React.createElement(Screen));});
 await press(ui,'Photo');assert.equal(photos,1);assert.equal(uploads,0);assert.equal(submitted.length,0);
 await press(ui,'Send');assert.equal(submitted.length,1);assert.deepEqual(submitted[0].attachmentIds,['photo-1']);await act(async()=>ui.unmount());
});
test('notification tap opens exact saved body and closing it does not reopen on ordinary render',async()=>{
 params={briefMessageId:'brief-third-page'};let ui;await act(async()=>{ui=create(React.createElement(Screen));});
 assert.ok(button(ui,'Back to chat'));const opened=ui.root.findAllByType('List').find(l=>l.props.data?.[0]?.id==='brief-third-page');assert.equal(opened.props.data[0].content,brief.content);
 await press(ui,'Back to chat');await act(async()=>ui.update(React.createElement(Screen)));assert.equal(button(ui,'Back to chat'),undefined);
 await act(async()=>ui.unmount());params={};
});
