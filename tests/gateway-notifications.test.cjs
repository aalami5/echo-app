const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),Module=require('module');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const load=Module._load;let received,tapped,events=[],failSave=false,lastResponse=null;
Module._load=function(id,...args){
 if(id==='react-native')return {AppState:{addEventListener:()=>({remove(){}})}};
 if(id==='expo-router')return {useRouter:()=>router};
 if(id==='@react-native-async-storage/async-storage')return {__esModule:true,default:{getItem:async()=>null}};
 if(id==='expo-notifications')return {getLastNotificationResponseAsync:async()=>lastResponse,getPresentedNotificationsAsync:async()=>[],addNotificationReceivedListener:fn=>{received=fn;return{remove(){}}},addNotificationResponseReceivedListener:fn=>{tapped=fn;return{remove(){}}},dismissNotificationAsync:async id=>events.push(['dismiss',id])};
 if(id.endsWith('/services/notifications'))return {registerForPushNotifications:async()=>null,acknowledgeMeetingNotification:async id=>events.push(['meetingAck',id])};
 if(id.endsWith('/services/gatewayChat'))return {readLinkedMessage:async id=>{events.push(['read',id]);return {id,content:'Canonical full body'};},notificationInbox:{put:async row=>{events.push(['save',row.content]);if(failSave)throw Error('storage full');},get:async()=>({content:'Full queue body'})},syncGatewayNotifications:async()=>events.push(['sync'])};
 return load.call(this,id,...args);
};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {useNotifications}=require('../src/hooks/useNotifications.ts');Module._load=load;
const router={push:path=>events.push(['route',path])},Screen=()=>{useNotifications();return null;};
const linked={request:{identifier:'push-one',content:{data:{conversationId:'home',chatMessageId:'brief-id',messageContent:'truncated preview'}}}};
test('foreground linked notification is fetched and durably saved before dismissal',async()=>{
 let ui;await act(async()=>{ui=create(React.createElement(Screen));});events=[];await act(async()=>received(linked));
 assert.deepEqual(events.map(e=>e[0]),['read','save','dismiss']);assert.equal(events[1][1],'Canonical full body');await act(async()=>ui.unmount());
});
test('storage failure preserves notification and tap still routes to exact message for retry',async()=>{
 failSave=true;let ui;await act(async()=>{ui=create(React.createElement(Screen));});events=[];await act(async()=>tapped({notification:linked}));
 assert.equal(events.some(e=>e[0]==='dismiss'),false);assert.deepEqual(events[0],['route',{pathname:'/chat',params:{briefMessageId:'brief-id'}}]);await act(async()=>ui.unmount());failSave=false;
});
test('cold start opens saved identifier without waiting for paused legacy hydration',async()=>{
 lastResponse={notification:linked};events=[];let ui;await act(async()=>{ui=create(React.createElement(Screen));});assert.ok(events.some(e=>e[0]==='route'&&e[1].params.briefMessageId==='brief-id'));await act(async()=>ui.unmount());lastResponse=null;
});
test('legacy meeting push syncs full server body and preserves meeting tap acknowledgement',async()=>{
 let ui;await act(async()=>{ui=create(React.createElement(Screen));});events=[];
 await act(async()=>tapped({notification:{request:{identifier:'old-push',content:{data:{type:'meeting',eventId:'event-1',messageId:'queued-1',messageContent:'preview'}}}}}));
 assert.deepEqual(events.map(e=>e[0]),['route','sync','meetingAck','dismiss']);await act(async()=>ui.unmount());
});
