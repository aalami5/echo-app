const {test}=require('node:test'), assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),Module=require('module');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const {create:store}=require('zustand');const useUI=store(set=>({visible:false,open:()=>set({visible:true}),close:()=>set({visible:false})}));
const storage=new Map(),listeners=new Set(),calls=[];let peer,paired=true;
const row=()=>({id:'r1',status:'pending',expiresAtMs:Date.now()+60000,presentation:{kind:'exec',commandText:'read one inbox',allowedDecisions:['allow-once','deny']}});let request=row();
class Gateway {ready=false;scopes=[];deviceId='device-example';onChange=()=>{};constructor(){peer=this;} async connect(manage){calls.push(['connect',manage]);if(!paired)throw Error('Pair in dashboard');this.ready=true;this.scopes=manage?['operator.approvals','operator.admin']:['operator.approvals'];this.onChange();}close(){this.ready=false}async request(m,p){calls.push([m,p]);if(m==='exec.approval.list')return request.status==='pending'?[{id:request.id}]:[];if(m==='approval.get')return {approval:structuredClone(request)};if(m==='approval.resolve'){request.status=p.decision==='deny'?'denied':'allowed';request.decision=p.decision;return {ok:true}}if(m==='cron.list')return {jobs:[]};if(m==='exec.approval.grants.list')return {grants:[]};throw Error(m)}}
const load=Module._load;Module._load=function(id,...args){
 if(id==='react-native')return {AppState:{currentState:'active',addEventListener:(_,fn)=>{listeners.add(fn);return {remove:()=>listeners.delete(fn)}}},Modal:({visible,children})=>visible?React.createElement('Modal',null,children):null,ScrollView:'ScrollView',StyleSheet:{create:x=>x},Text:'Text',TextInput:'TextInput',TouchableOpacity:'Button',View:'View'};
 if(id==='@react-native-async-storage/async-storage')return {getItem:async k=>storage.get(k)||null,setItem:async(k,v)=>storage.set(k,v)};
 if(id==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:47,bottom:34})};
 if(id.endsWith('/approvalGateway'))return {ApprovalGateway:Gateway};
 if(id.endsWith('/approvalUiStore'))return {useApprovalUiStore:useUI};
 if(id.endsWith('/authStore'))return {useAuthStore:fn=>fn({isAuthenticated:true,user:{id:'owner'}})};
 if(id.endsWith('/settingsStore'))return {useSettingsStore:fn=>fn({gatewayUrl:'https://example.com',gatewayToken:'synthetic'})};
 return load.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,f);
const {ApprovalCenter}=require('../src/components/ApprovalCenter.tsx');Module._load=load;
const press=async(ui,label)=>{const b=ui.root.findAllByType('Button').find(b=>b.props.accessibilityLabel===label);assert.ok(b,label);assert.ok(!b.props.disabled);await act(async()=>b.props.onPress());};
test('user connects explicitly; pending action opens sheet; dismissal never approves; tap verifies receipt',async()=>{
 let ui;await act(async()=>ui=create(React.createElement(ApprovalCenter)));assert.equal(calls.length,0);
 await act(async()=>useUI.getState().open());await press(ui,'Connect approvals');assert.equal(ui.root.findAllByType('Modal').length,1);
 assert.ok(ui.root.findAllByType('Text').some(t=>t.children.includes('read one inbox')));assert.equal(calls.filter(x=>x[0]==='approval.resolve').length,0);
 await press(ui,'Not now');assert.equal(ui.root.findAllByType('Modal').length,0);assert.equal(calls.filter(x=>x[0]==='approval.resolve').length,0);
 await press(ui,'Review pending permission');await press(ui,'Approve once');assert.equal(calls.filter(x=>x[0]==='approval.resolve').length,1);
 assert.ok(ui.root.findAllByType('Text').some(t=>t.children.some(x=>typeof x==='string'&&x.includes('Permission recorded.'))));await act(async()=>ui.unmount());
});
test('changed action is rejected and error remains visible after refresh',async()=>{
 request=row();let ui;await act(async()=>ui=create(React.createElement(ApprovalCenter)));await act(async()=>useUI.getState().open());request.presentation.commandText='send to changed recipient';await press(ui,'Approve once');
 assert.equal(calls.filter(x=>x[0]==='approval.resolve').length,1);assert.ok(ui.root.findAllByType('Text').some(t=>t.children.some(x=>typeof x==='string'&&x.includes('request changed'))));
 await act(async()=>{for(const fn of listeners)fn('background')});assert.equal(ui.root.findAllByType('Modal').length,0);assert.equal(peer.ready,false);
 await act(async()=>{for(const fn of listeners)fn('active')});assert.equal(peer.ready,true);assert.equal(calls.filter(x=>x[0]==='approval.resolve').length,1);await act(async()=>ui.unmount());
});
test('pairing denial displays actionable error, never auto-approves the device or creates a schedule',async()=>{
 paired=false;let ui;await act(async()=>ui=create(React.createElement(ApprovalCenter)));await act(async()=>useUI.getState().open());assert.ok(ui.root.findAllByType('Text').some(t=>t.children.includes('Pair in dashboard')));assert.equal(calls.filter(x=>/device.*approve|cron.add/.test(x[0])).length,0);await act(async()=>ui.unmount());
});
