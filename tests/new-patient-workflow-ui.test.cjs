const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const values=new Map(),writes=[],routes=[],alerts=[],draftCalls=[],guards=[];let params={},failed=false,recordings=0,transcriptions=0;
const storage={getItem:async k=>values.get(k)??null,setItem:async(k,v)=>{assert.match(k,/^echo-new-patient-case/);if(failed)throw Error('disk full');writes.push(k);values.set(k,v);}};
const router={push:r=>routes.push(r),replace:r=>{routes.push(r);params=r.params;},back:()=>routes.push('back')};
const settings={gatewayUrl:'https://test.invalid',gatewayToken:'synthetic'};
const emptyDictation={customProcedures:[],stylePreferences:[],saveAsExample:()=>{},addCustomProcedure:()=>{},updateCustomProcedure:()=>{},removeCustomProcedure:()=>{}};
const settingsHook=selector=>selector?selector(settings):settings;settingsHook.getState=()=>settings;
const prefHook=()=>emptyDictation;prefHook.getState=()=>emptyDictation;
const original=Module._load;
Module._load=function(id,...args){
 if(id==='@react-native-async-storage/async-storage')return {__esModule:true,default:storage};
 if(id==='expo-crypto')return {randomUUID:require('node:crypto').randomUUID};
 if(id==='expo-router')return {useRouter:()=>router,useLocalSearchParams:()=>params};
 if(id==='@react-navigation/native')return {usePreventRemove:(blocked,callback)=>guards.push({blocked,callback}),useIsFocused:()=>true};
 if(id==='expo-secure-store')return {getItemAsync:async()=>null};
 if(id==='react-native')return {
   View:'View',Text:'Text',ScrollView:'ScrollView',TextInput:'TextInput',TouchableOpacity:'TouchableOpacity',ActivityIndicator:'ActivityIndicator',KeyboardAvoidingView:'KeyboardAvoidingView',
   FlatList:props=>React.createElement('FlatList',{},props.data.length?props.data.map(item=>React.createElement('Row',{key:item.id},props.renderItem({item}))):props.ListEmptyComponent),
   SectionList:props=>React.createElement('SectionList',{},props.ListEmptyComponent),
   Modal:({visible,children})=>visible?React.createElement('Modal',{},children):null,
   StyleSheet:{create:x=>x},Platform:{OS:'ios'},Alert:{alert:(...a)=>alerts.push(a)},AppState:{currentState:'active',addEventListener:()=>({remove(){}})},
 };
 if(id==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:0,bottom:0})};
 if(id==='@expo/vector-icons')return {Ionicons:'Icon'};
 if(id==='expo-blur')return {BlurView:'BlurView'};
 if(id==='expo-clipboard')return {setStringAsync:async()=>{}};
 if(id==='@react-native-community/datetimepicker')return {__esModule:true,default:'DatePicker'};
 if(id==='expo-haptics')return {impactAsync:async()=>{},notificationAsync:async()=>{},ImpactFeedbackStyle:{Light:1,Medium:2},NotificationFeedbackType:{Success:1}};
 if(id==='expo-av')return {Audio:{requestPermissionsAsync:async()=>({granted:true}),setAudioModeAsync:async()=>{},RecordingOptionsPresets:{HIGH_QUALITY:{}},Recording:{createAsync:async()=>{recordings++;return {recording:{stopAndUnloadAsync:async()=>{},getURI:()=> 'file:///synthetic.m4a'}};}}}};
 if(id.endsWith('/settingsStore'))return {useSettingsStore:settingsHook};
 if(id.endsWith('/dictationStore'))return {useDictationStore:prefHook};
 if(id.endsWith('/patientsStore'))return {usePatientsStore:()=>assert.fail('must not use old patients'),HOSPITAL_NAMES:{SEQ:'Sequoia Hospital'}};
 if(id.endsWith('/patientDictationsStore'))return {usePatientDictationsStore:()=>assert.fail('must not use old reports'),buildPatientDictationHeader:()=>assert.fail('must use new header'),formatPatientDictationDate:d=>d};
 if(id.endsWith('/emailReceiptsStore'))return {useEmailReceiptsStore:select=>select({receipts:[]})};
 if(id.endsWith('/emailReceipts'))return {refreshEmailReceipts:async()=>{},sendReportWithReceipt:async()=>assert.fail('no automatic sends')};
 if(id.endsWith('/clinicalAudioHandoff'))return {beginClinicalAudio:async()=>true};
 if(id.endsWith('/audioOwnership'))return {releaseClinicalAudio:()=>{}};
 if(id.endsWith('/whisper'))return {transcribeAudio:async()=>{transcriptions++;return {text:'Synthetic left arm procedure with 7 mm graft. No complications documented.'};}};
 if(id.endsWith('/gateway'))return {GatewayService:class {}};
 if(id.endsWith('/elevenlabs'))return {ElevenLabsService:class {}};
 if(id.endsWith('/dictationService'))return {generateReport:async(g,parts,procedures,options)=>{draftCalls.push({parts,procedures});return 'Synthetic operative draft with 7 mm graft.';},regenerateWithCorrections:async()=>assert.fail('not requested')};
 if(id.endsWith('/operativeDrafting'))return {sourceFingerprint:parts=>JSON.stringify(parts)};
 if(id.endsWith('/Avatar'))return {Avatar:'Avatar'};
 if(id.endsWith('/ImagePicker'))return {ImagePickerModal:'ImagePickerModal'};
 if(id.endsWith('/ReportDraftNote'))return {ReportDraftNote:'ReportDraftNote'};
 if(id.endsWith('/ReportEmailStatus'))return {ReportEmailStatus:'ReportEmailStatus'};
 return original.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,f);
const {useNewPatientCasesStore:store}=require('../src/stores/newPatientCasesStore.ts');
const Patients=require('../app/(tabs)/patients.tsx').default,Form=require('../app/new-patient-case.tsx').default,Dictation=require('../app/patient-dictation.tsx').default;
const content=tree=>JSON.stringify(tree.toJSON());
const button=(tree,text)=>tree.root.findAllByType('TouchableOpacity').find(x=>x.findAllByType('Text').some(t=>t.props.children===text));
test('patient tab exposes add even when older sources are unavailable; form validates and opens one durable linked case',async()=>{
 let tree;await act(async()=>{tree=create(React.createElement(Patients));});
 await act(async()=>tree.root.findByProps({accessibilityLabel:'Add patient and dictate'}).props.onPress());assert.equal(routes.at(-1),'/new-patient-case');
 await act(async()=>tree.unmount());await act(async()=>{tree=create(React.createElement(Form));});
 await act(async()=>button(tree,'Start dictation').props.onPress());assert.match(content(tree),/Enter the patient name/);
 const change=async(label,value)=>act(async()=>tree.root.findByProps({accessibilityLabel:label}).props.onChangeText(value));
 await change('Patient name','Synthetic Patient UI');await change('Medical record number','UI-TEST');await change('Operation date','2026-10-29');
 await act(async()=>{const fn=button(tree,'Start dictation').props.onPress;await Promise.all([fn(),fn()]);});
 await store.getState().flush();assert.equal(Object.keys(store.getState().dictations).length,1);
 assert.equal(params.mode,'continue');assert.match(params.dictationId,/^newcase-/);assert.equal(store.getState().dictations[params.dictationId].dateOfOperation,'2026-10-29');
 await act(async()=>tree.unmount());
});
test('real new-case route records, transcribes, generates draft and reopens saved report without pre-draft prompts or automatic sends',async()=>{
 let tree;await act(async()=>{tree=create(React.createElement(Dictation));});
 assert.match(content(tree),/Synthetic Patient UI/);assert.match(content(tree),/Dr\. Oliver Aalami/);assert.match(content(tree),/October 29, 2026/);
 assert.match(content(tree),/Saved on this phone/);
 await act(async()=>{tree.root.findByType('Avatar').props.onPress();await new Promise(r=>setTimeout(r,130));});
 assert.equal(recordings,1);assert.equal(tree.root.findByType('Avatar').props.isRecording,true);assert.ok(guards.some(g=>g.blocked));
 await act(async()=>{tree.root.findByType('Avatar').props.onPress();await new Promise(r=>setImmediate(r));await store.getState().flush();});
 assert.equal(transcriptions,1);assert.match(content(tree),/7 mm graft/);
 await act(async()=>button(tree,'Generate draft').props.onPress());await act(async()=>store.getState().flush());
 assert.equal(draftCalls.length,1);assert.equal(draftCalls[0].parts.length,2);assert.deepEqual(draftCalls[0].procedures,[]);
 assert.match(content(tree),/Synthetic operative draft/);assert.ok(button(tree,'Edit'));assert.ok(button(tree,'Read Back'));
 await act(async()=>button(tree,'Edit').props.onPress());
 await act(async()=>alerts.at(-1)[2].find(b=>b.text==='Edit Text Directly').onPress());
 await act(async()=>tree.root.findByType('TextInput').props.onChangeText('Synthetic operative draft with manual correction: 8 mm graft.'));
 await act(async()=>button(tree,'Save').props.onPress());await act(async()=>store.getState().flush());
 assert.equal(store.getState().dictations[params.dictationId].generatedReport,'Synthetic operative draft with manual correction: 8 mm graft.');
 await act(async()=>tree.unmount());
 store.setState({patients:{},dictations:{},savedAt:null});
 await act(async()=>{tree=create(React.createElement(Dictation));});assert.match(content(tree),/manual correction: 8 mm graft/);
 await act(async()=>tree.unmount());
});
test('save error is visible, exit is guarded, Retry save preserves report, and saved-case list resumes exact ID',async()=>{
 let tree;await act(async()=>{tree=create(React.createElement(Dictation));});
 const id=params.dictationId;failed=true;
 await act(async()=>{store.getState().updateDictation(id,{generatedReport:'Manual revised synthetic draft'});await store.getState().flush().catch(()=>{});});
 assert.match(content(tree),/Not saved/);assert.ok(button(tree,'Retry save'));assert.ok(guards.some(g=>g.blocked));
 failed=false;await act(async()=>button(tree,'Retry save').props.onPress());await act(async()=>store.getState().flush());
 assert.match(content(tree),/Saved on this phone/);assert.match(content(tree),/Manual revised synthetic draft/);
 await act(async()=>tree.unmount());params={list:'1'};
 await act(async()=>{tree=create(React.createElement(Form));});assert.match(content(tree),/Synthetic Patient UI/);
 const row=tree.root.findByType('Row').findByType('TouchableOpacity');await act(async()=>row.props.onPress());assert.equal(routes.at(-1).params.dictationId,id);
 await act(async()=>tree.unmount());
});
test('legacy patient-dictation links remain paused and never open the archive',async()=>{
 params={patientId:'old-patient',dictationId:'old-report'};let tree;
 await act(async()=>{tree=create(React.createElement(Dictation));});assert.match(content(tree),/preserved/);await act(async()=>tree.unmount());
});
