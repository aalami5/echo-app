const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),Module=require('module');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
let permission={granted:true,canAskAgain:true},resolvePhoto,captures=0;
const Camera=React.forwardRef((props,ref)=>{React.useImperativeHandle(ref,()=>({takePictureAsync:()=>{captures++;return new Promise(r=>resolvePhoto=r)}}));return React.createElement('Preview',props)});
const load=Module._load;
Module._load=function(id,...args){
 if(id==='react-native')return {ActivityIndicator:'Spinner',Image:'Image',Linking:{openSettings:async()=>{}},Platform:{OS:'ios'},StyleSheet:{create:x=>x},Text:'Text',TouchableOpacity:'Button',View:'View'};
 if(id==='expo-camera')return {CameraView:Camera,useCameraPermissions:()=>[permission,async()=>{}]};
 if(id==='@expo/vector-icons/Ionicons')return {__esModule:true,default:'Icon'};
 return load.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,f);
const {AssistantCamera}=require('../src/components/AssistantCamera.tsx');Module._load=load;
const button=(ui,label)=>ui.root.findAllByType('Button').find(x=>x.props.accessibilityLabel===label);
test('shutter captures only on tap; review requires explicit Add; close stays available while capturing',async()=>{
 let ui,closed=0,added=0;await act(async()=>{ui=create(React.createElement(AssistantCamera,{busy:false,onClose:()=>closed++,onCapture:async()=>added++}));});
 assert.equal(button(ui,'Take photo').props.disabled,true);assert.equal(captures,0);
 await act(async()=>ui.root.findByType('Preview').props.onCameraReady());
 await act(async()=>button(ui,'Take photo').props.onPress());assert.equal(captures,1);assert.equal(added,0);
 assert.ok(!button(ui,'Close camera and return to conversation').props.disabled);
 await act(async()=>resolvePhoto({uri:'file:///photo',width:100,height:100}));
 assert.equal(ui.root.findAllByType('Preview').length,0);assert.equal(added,0);
 await act(async()=>button(ui,'Add photo').props.onPress());assert.equal(added,1);
 await act(async()=>button(ui,'Close camera and return to conversation').props.onPress());assert.equal(closed,1);
 await act(async()=>ui.unmount());
});
test('close during capture ignores late photo and does not add or send it',async()=>{
 let ui,added=0,closed=0;await act(async()=>{ui=create(React.createElement(AssistantCamera,{busy:false,onClose:()=>closed++,onCapture:async()=>added++}));});
 await act(async()=>ui.root.findByType('Preview').props.onCameraReady());await act(async()=>button(ui,'Take photo').props.onPress());
 await act(async()=>button(ui,'Close camera and return to conversation').props.onPress());assert.equal(closed,1);
 await act(async()=>resolvePhoto({uri:'file:///late',width:100,height:100}));assert.equal(added,0);assert.equal(ui.root.findAllByType('Image').length,0);
 await act(async()=>ui.unmount());
});
test('denied camera permission and busy state never block exit',async()=>{
 permission={granted:false,canAskAgain:false};let ui,closed=0;
 await act(async()=>{ui=create(React.createElement(AssistantCamera,{busy:true,onClose:()=>closed++,onCapture:async()=>{throw Error('must not capture')}}));});
 assert.equal(ui.root.findAllByType('Preview').length,0);assert.equal(button(ui,'Take photo').props.disabled,true);
 assert.ok(!button(ui,'Close camera and return to conversation').props.disabled);await act(async()=>button(ui,'Close camera and return to conversation').props.onPress());assert.equal(closed,1);
 await act(async()=>ui.unmount());
});
