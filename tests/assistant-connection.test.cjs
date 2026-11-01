const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),Module=require('module');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const load=Module._load;let response,checks=0,current;
Module._load=function(id,...args){
 if(id==='expo-router')return {useFocusEffect:fn=>React.useEffect(fn,[fn])};
 if(id==='../services/assistant')return {assistantApi:async route=>{assert.equal(route,'/bootstrap');checks++;return response();}};
 return load.call(this,id,...args);
};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {useAssistantConnection}=require('../src/hooks/useAssistantConnection.ts');Module._load=load;
function Harness(){current=useAssistantConnection('https://example.invalid','synthetic');return null;}
test('Settings authenticates on focus; explicit Retry recovers a failed check',async()=>{
 response=async()=>{throw Error('unauthorized');};let ui;
 await act(async()=>{ui=create(React.createElement(Harness));});assert.equal(current.connectionStatus,'disconnected');
 response=async()=>({conversations:[]});await act(async()=>current.checkConnection());assert.equal(current.connectionStatus,'connected');assert.equal(checks,2);
 await act(async()=>ui.unmount());
});
test('a landing-page response is not online, and a late failed check cannot overwrite a newer success',async()=>{
 response=async()=>({html:'landing page'});let ui;
 await act(async()=>{ui=create(React.createElement(Harness));});assert.equal(current.connectionStatus,'disconnected');
 let reject;response=()=>new Promise((_r,j)=>{reject=j;});let pending;
 await act(async()=>{pending=current.checkConnection();});
 response=async()=>({conversations:[]});await act(async()=>current.checkConnection());
 await act(async()=>{reject(Error('stale failure'));await pending;});assert.equal(current.connectionStatus,'connected');
 await act(async()=>ui.unmount());
});
