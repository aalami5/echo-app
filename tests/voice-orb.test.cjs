const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),Module=require('module');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const load=Module._load,loops=[],values=[];
const animation=()=>({started:false,stopped:false,start(){this.started=true},stop(){this.stopped=true}});
Module._load=function(id,...args){
 if(id==='react-native')return {View:'View',StyleSheet:{create:x=>x},Easing:{sin:()=>{},inOut:x=>x},Animated:{
  View:'AnimatedView',Value:class{constructor(v){this.value=v;values.push(this)}setValue(v){this.value=v}interpolate(c){return c.outputRange[0]}},
  timing:animation,sequence:animation,stagger:animation,loop(){const a=animation();loops.push(a);return a},
 }};
 return load.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,f);
const {VoiceOrb}=require('../src/components/VoiceOrb.tsx');Module._load=load;
test('background/reduced motion stops loops and resets audio motion; paused never animates stale audio',async()=>{
 let ui;const render=props=>React.createElement(VoiceOrb,{color:'#B8DBFF',mode:'speaking',level:0.7,motionEnabled:true,...props});
 await act(async()=>{ui=create(render({}));});assert.equal(loops.length,1);assert.ok(loops[0].started);
 await act(async()=>ui.update(render({motionEnabled:false})));assert.ok(loops[0].stopped);assert.equal(loops.length,1);assert.ok(values.every(v=>v.value===0||v.value===1));
 await act(async()=>ui.update(render({mode:'paused'})));assert.equal(loops.length,1);
 await act(async()=>ui.update(render({mode:'listening'})));assert.equal(loops.length,2);assert.ok(loops[1].started);
 await act(async()=>ui.unmount());assert.ok(loops[1].stopped);
});
