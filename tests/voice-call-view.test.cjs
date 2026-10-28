const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),Module=require('module');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const load=Module._load, animation=()=>({start(){},stop(){}});
Module._load=function(id,...args){
 if(id==='react-native')return {AccessibilityInfo:{isReduceMotionEnabled:async()=>true,addEventListener:()=>({remove(){}})},AppState:{currentState:'active',addEventListener:()=>({remove(){}})},Animated:{Value:class{setValue(){} interpolate(config){return config.outputRange[0]}},View:'AnimatedView',timing:animation,sequence:animation,loop:animation},Modal:'Modal',ScrollView:'ScrollView',StyleSheet:{create:x=>x},Text:'Text',TouchableOpacity:'Button',View:'View'};
 if(id==='@expo/vector-icons/Ionicons')return {__esModule:true,default:'Icon'};
 if(id==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:47,bottom:34})};
 return load.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,f);
const {VoiceCallView,voicePresentation}=require('../src/components/VoiceCallView.tsx');Module._load=load;
const base={status:'connected',isActive:true,isConnected:true,isSupported:true,muted:false,speaking:false,level:0,stop(){},start(){},resume(){},toggleMute(){}};
test('voice-first connection failure exposes Retry rather than trapping user behind disabled Start',async()=>{
 let ui,retried=0;await act(async()=>{ui=create(React.createElement(VoiceCallView,{visible:true,title:'Home',voice:{...base,status:'idle',isActive:false,isConnected:false},ready:false,connectionError:'Server unavailable',onRetry:()=>retried++,onText(){},onMore(){}}));});
 const retry=ui.root.findAllByType('Button').find(b=>b.props.accessibilityLabel==='Retry connection');assert.ok(retry);retry.props.onPress();assert.equal(retried,1);
 assert.equal(ui.root.findAllByType('Button').some(b=>b.props.accessibilityLabel==='Connect to Echo'),false);
 await act(async()=>ui.unmount());
});
test('muted control uses mic-slash and accessible action; view switch does not call End',async()=>{
 let ui,toggled=0,text=0,stopped=0;await act(async()=>{ui=create(React.createElement(VoiceCallView,{visible:true,title:'Home',voice:{...base,muted:true,toggleMute:()=>toggled++,stop:()=>stopped++},ready:true,onRetry(){},onText:()=>text++,onMore(){}}));});
 const buttons=ui.root.findAllByType('Button'),mic=buttons.find(b=>b.props.accessibilityLabel==='Unmute microphone');assert.ok(mic);assert.equal(mic.findByType('Icon').props.name,'mic-off');assert.equal(mic.props.accessibilityState.selected,true);mic.props.onPress();assert.equal(toggled,1);
 buttons.find(b=>b.props.accessibilityLabel==='Switch to chat; keep connection active').props.onPress();assert.equal(text,1);assert.equal(stopped,0);
 assert.match(voicePresentation({...base,speaking:true,muted:true},false).label,/mic muted/);
 await act(async()=>ui.unmount());
});
test('voice view stays inline with media actions separate from explicit Hang up',async()=>{
 let ui,attachments=0,stops=0;await act(async()=>{ui=create(React.createElement(VoiceCallView,{visible:true,title:'Home',voice:{...base,stop:()=>stops++},working:false,ready:true,onRetry(){},onText(){},onMore(){},onAttach:()=>attachments++}));});
 assert.equal(ui.root.findAllByType('Modal').length,0);assert.ok(ui.root.findByProps({testID:'voice-inline-view'}));
 const buttons=ui.root.findAllByType('Button');const attach=buttons.find(b=>b.props.accessibilityLabel==='Add attachment');assert.equal(attach.findByType('Icon').props.name,'add');attach.props.onPress();assert.equal(attachments,1);assert.equal(buttons.some(b=>['Add photos','Open live camera'].includes(b.props.accessibilityLabel)),false);assert.equal(stops,0);
 buttons.find(b=>b.props.accessibilityLabel==='Hang up').props.onPress();assert.equal(stops,1);await act(async()=>ui.unmount());
});
test('muted microphone has a faded red bubble distinct from hangup red',async()=>{
 let ui;await act(async()=>{ui=create(React.createElement(VoiceCallView,{visible:true,title:'Home',voice:{...base,muted:true},ready:true,onRetry(){},onText(){},onMore(){}}));});
 const buttons=ui.root.findAllByType('Button'),mic=buttons.find(b=>b.props.accessibilityLabel==='Unmute microphone'),end=buttons.find(b=>b.props.accessibilityLabel==='Hang up');
 const color=b=>Object.assign({},...b.props.style.filter(Boolean)).backgroundColor;
 assert.equal(color(mic),'#663F49');assert.equal(color(end),'#9F2835');await act(async()=>ui.unmount());
});
