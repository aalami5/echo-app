const {test,after}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const Module=require('module');const fs=require('fs');
const React=require('react');const {create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
let height=85,visible=false,os='ios';const listeners=new Map();const original=Module._load;
Module._load=function(id,...args){
 if(id==='react-native')return {View:'View',KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{get OS(){return os;}},StyleSheet:{create:x=>x},Keyboard:{isVisible:()=>visible,addListener:(name,fn)=>{listeners.set(name,fn);return {remove:()=>listeners.delete(name)}}}};
 if(id==='@react-navigation/bottom-tabs')return {useBottomTabBarHeight:()=>height};
 if(id==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:59,bottom:34})};
 return original.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,file);
const {ChatViewport}=require('../src/components/ChatViewport.tsx');
after(()=>{Module._load=original;});
const bottom=tree=>tree.root.findByProps({testID:'chat-viewport'}).props.style.at(-1).paddingBottom;
test('iPhone: measured tab bar space is reserved, released while typing, restored on dismissal',async()=>{
 let tree;await act(async()=>{tree=create(React.createElement(ChatViewport,null,React.createElement('Composer')))});
 assert.equal(bottom(tree),85);assert.equal(tree.root.findByType('KeyboardAvoidingView').props.behavior,'padding');
 await act(async()=>listeners.get('keyboardWillShow')());assert.equal(bottom(tree),0);
 await act(async()=>listeners.get('keyboardWillHide')());assert.equal(bottom(tree),85);
 height=99;await act(async()=>tree.update(React.createElement(ChatViewport,null,React.createElement('Composer'))));assert.equal(bottom(tree),99);
 await act(async()=>tree.unmount());assert.equal(listeners.size,0);
});
test('already-open keyboard does not reserve hidden tab bar; Android uses did events',async()=>{
 visible=true;os='android';height=65;let tree;await act(async()=>{tree=create(React.createElement(ChatViewport,null,React.createElement('Composer')))});
 assert.equal(bottom(tree),0);assert.ok(listeners.has('keyboardDidHide'));assert.equal(tree.root.findByType('KeyboardAvoidingView').props.behavior,undefined);
 await act(async()=>listeners.get('keyboardDidHide')());assert.equal(bottom(tree),65);await act(async()=>tree.unmount());
});
