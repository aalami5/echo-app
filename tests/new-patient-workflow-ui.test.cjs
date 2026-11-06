const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const values=new Map(),writes=[],routes=[],alerts=[],draftCalls=[],guards=[],liveGuards=new Map();let blockedExits=0;let params={},failed=false,recordings=0,transcriptions=0;
const storage={getItem:async k=>values.get(k)??null,setItem:async(k,v)=>{assert.match(k,/^echo-new-patient-case/);if(failed)throw Error('disk full');writes.push(k);values.set(k,v);}};
const navigateBack=()=>{const guard=[...liveGuards.values()].find(g=>g.blocked);if(guard){blockedExits++;guard.callback({data:{action:{type:'GO_BACK'}}});}else routes.push('back');};
const router={push:r=>routes.push(r),replace:r=>{routes.push(r);params=r.params;},back:navigateBack};
const settings={gatewayUrl:'https://test.invalid',gatewayToken:'synthetic',elevenlabsApiKey:'synthetic'};
const clips=[],examples=[],sends=[],tts=[],aiEdits=[];
const emptyDictation={customProcedures:[],stylePreferences:[],saveAsExample:(...args)=>examples.push(args),addCustomProcedure:p=>emptyDictation.customProcedures.push(p),updateCustomProcedure:()=>{},removeCustomProcedure:()=>{}};
const settingsHook=selector=>selector?selector(settings):settings;settingsHook.getState=()=>settings;
const prefHook=()=>emptyDictation;prefHook.getState=()=>emptyDictation;
const original=Module._load;
Module._load=function(id,...args){
 if(id==='@react-native-async-storage/async-storage')return {__esModule:true,default:storage};
 if(id==='react-native-keyboard-aware-scroll-view')return {KeyboardAwareScrollView:'ScrollView'};
 if(id.endsWith('/usePatientScan'))return {usePatientScan:()=>({clearScan:()=>{},scanFromCamera:async()=>null,scanFromLibrary:async()=>null})};
 if(id.endsWith('/usePatientVoiceInput'))return {usePatientVoiceInput:()=>({cancelRecording:async()=>{}})};
 if(id.endsWith('/newCasePersistence'))return {caseRepository:require('../src/services/newPatientCases.ts').createCaseRepository(storage),caseSaveMessage:e=>'Not saved: '+e.message};
 if(id==='expo-crypto')return {randomUUID:require('node:crypto').randomUUID};
 if(id==='expo-router')return {useRouter:()=>router,useLocalSearchParams:()=>params};
 if(id==='@react-navigation/native')return {usePreventRemove:(blocked,callback)=>{const key=React.useId();liveGuards.set(key,{blocked,callback});guards.push({blocked,callback});React.useEffect(()=>()=>liveGuards.delete(key),[]);},useIsFocused:()=>true,useNavigation:()=>({dispatch:a=>a.type==='GO_BACK'?navigateBack():routes.push(a)})};
 if(id==='expo-secure-store')return {getItemAsync:async()=>null};
 if(id==='react-native')return {
   View:'View',Text:'Text',ScrollView:'ScrollView',TextInput:'TextInput',TouchableOpacity:'TouchableOpacity',ActivityIndicator:'ActivityIndicator',KeyboardAvoidingView:'KeyboardAvoidingView',
   FlatList:props=>React.createElement('FlatList',{},props.data.length?props.data.map((item,index)=>React.createElement('Row',{key:item.key||item.id},props.renderItem({item,index}))):props.ListEmptyComponent),
   SectionList:props=>React.createElement('SectionList',{},props.ListEmptyComponent),
   Modal:({visible=true,children})=>visible?React.createElement('Modal',{},children):null,
   StyleSheet:{create:x=>x},Platform:{OS:'ios'},Alert:{alert:(...a)=>alerts.push(a)},AppState:{currentState:'active',addEventListener:()=>({remove(){}})},
 };
 if(id==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:0,bottom:0})};
 if(id==='@expo/vector-icons')return {Ionicons:'Icon'};
 if(id==='expo-blur')return {BlurView:'BlurView'};
 if(id==='expo-clipboard')return {setStringAsync:async text=>clips.push(text)};
 if(id==='@react-native-community/datetimepicker')return {__esModule:true,default:'DatePicker'};
 if(id==='expo-haptics')return {impactAsync:async()=>{},notificationAsync:async()=>{},ImpactFeedbackStyle:{Light:1,Medium:2},NotificationFeedbackType:{Success:1}};
 if(id==='expo-av')return {Audio:{requestPermissionsAsync:async()=>({granted:true}),setAudioModeAsync:async()=>{},RecordingOptionsPresets:{HIGH_QUALITY:{}},Recording:{createAsync:async()=>{recordings++;return {recording:{stopAndUnloadAsync:async()=>{},getURI:()=> 'file:///synthetic.m4a'}};}}}};
 if(id.endsWith('/settingsStore'))return {useSettingsStore:settingsHook};
 if(id.endsWith('/dictationStore'))return {useDictationStore:prefHook};
 if(id.endsWith('/patientsStore'))return {usePatientsStore:()=>assert.fail('must not use old patients'),HOSPITAL_NAMES:{SEQ:'Sequoia Hospital'}};
 if(id.endsWith('/patientDictationsStore'))return {usePatientDictationsStore:()=>assert.fail('must not use old reports'),buildPatientDictationHeader:()=>assert.fail('must use new header'),formatPatientDictationDate:d=>d};
 if(id.endsWith('/emailReceiptsStore'))return {useEmailReceiptsStore:select=>select({receipts:[]})};
 if(id.endsWith('/emailReceipts'))return {refreshEmailReceipts:async()=>{},sendReportWithReceipt:async(...args)=>sends.push(args)};
 if(id.endsWith('/clinicalAudioHandoff'))return {beginClinicalAudio:async()=>true};
 if(id.endsWith('/audioOwnership'))return {releaseClinicalAudio:()=>{}};
 if(id.endsWith('/whisper'))return {transcribeAudio:async()=>{transcriptions++;return {text:'Synthetic left arm procedure with 7 mm graft. No complications documented.'};}};
 if(id.endsWith('/gateway'))return {GatewayService:class {}};
 if(id.endsWith('/elevenlabs'))return {ElevenLabsService:class {async generateAudio(args){tts.push(['generate',args.text]);return 'file:///synthetic-readback.mp3';}async playAudioFile(){tts.push(['play']);}async pause(){tts.push(['pause']);}async resume(){tts.push(['resume']);}async stop(){tts.push(['stop']);}async cleanup(){}}};
 if(id.endsWith('/dictationService'))return {generateReport:async(g,parts,procedures,options)=>{draftCalls.push({parts,procedures});return 'Synthetic operative draft with 7 mm graft.';},regenerateWithCorrections:async(g,report,correction)=>{aiEdits.push({report,correction});return report+' Verified AI revision.';}};
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
 await act(async()=>tree.root.findByProps({accessibilityLabel:'Add patient'}).props.onPress());assert.match(content(tree),/Add Patient/);assert.equal(routes.length,0);
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

test('original full input view opens without a date gate; typed notes, photos, calendar and custom/combined procedures survive',async()=>{
 const patient=Object.values(store.getState().patients)[0];
 const id=await store.getState().startForPatient(patient,'');await store.getState().flush();
 params={patientId:patient.id,dictationId:id,mode:'new'};
 let tree;await act(async()=>{tree=create(React.createElement(Dictation));});
 assert.doesNotMatch(content(tree),/Choose date|Start dictation/);assert.equal(tree.root.findAllByType('DatePicker').length,0);
 assert.ok(tree.root.findByProps({accessibilityLabel:'Record dictation'}));
 await act(async()=>tree.root.findByProps({accessibilityLabel:'Type or paste operative notes'}).props.onPress());
 await act(async()=>tree.root.findByType('TextInput').props.onChangeText('Synthetic combined procedure notes.'));
 await act(async()=>tree.root.findByProps({accessibilityLabel:'Add typed operative notes'}).props.onPress());
 await act(async()=>tree.root.findByProps({accessibilityLabel:'Add operative note photos'}).props.onPress());
 await act(async()=>tree.root.findByType('ImagePickerModal').props.onImageSelected('file:///synthetic.png','dGVzdA==','image/png','Synthetic operative photo'));
 assert.equal(store.getState().dictations[id].transcriptParts.length,3);
 await act(async()=>tree.root.findByProps({accessibilityLabel:'Date of operation'}).props.onPress());
 await act(async()=>tree.root.findByType('DatePicker').props.onChange({},new Date(2026,10,5,12)));
 await act(async()=>button(tree,'Done').props.onPress());
 assert.equal(store.getState().dictations[id].dateOfOperation,'2026-11-05');assert.match(store.getState().dictations[id].transcriptParts[0].content,/November 5, 2026/);
 await act(async()=>button(tree,'Add Procedure').props.onPress());
 await act(async()=>tree.root.findByProps({placeholder:'Procedure name'}).props.onChangeText('Synthetic combined custom procedure'));
 const addButton=button(tree,'Add');assert.ok(addButton);await act(async()=>addButton.props.onPress());
 assert.ok(emptyDictation.customProcedures.some(p=>p.name==='Synthetic combined custom procedure'));
 await act(async()=>button(tree,'Synthetic combined custom procedure').props.onPress());
 assert.ok(store.getState().dictations[id].selectedProcedures.includes('Synthetic combined custom procedure'));
 await act(async()=>button(tree,'Generate draft').props.onPress());await act(async()=>store.getState().flush());
 assert.equal(draftCalls.at(-1).parts.length,3);assert.deepEqual(draftCalls.at(-1).procedures,['Synthetic combined custom procedure']);
 assert.equal(sends.length,0);await act(async()=>tree.unmount());
});
test('original report actions: AI edits, readback play/pause/resume, copy, encounter export, examples and explicit email',async()=>{
 let tree;await act(async()=>{tree=create(React.createElement(Dictation));});
 await act(async()=>button(tree,'Edit').props.onPress());await act(async()=>alerts.at(-1)[2].find(b=>b.text==='Edit with AI').onPress());
 await act(async()=>tree.root.findByType('TextInput').props.onChangeText('Synthetic verified correction'));
 await act(async()=>button(tree,'Apply AI edits').props.onPress());await act(async()=>store.getState().flush());
 assert.equal(aiEdits.at(-1).correction,'Synthetic verified correction');assert.match(content(tree),/Verified AI revision/);
 for(const label of ['Read Back','Play','Pause','Resume'])await act(async()=>button(tree,label).props.onPress());
 assert.deepEqual(tts.map(x=>x[0]),['generate','play','pause','resume']);
 await act(async()=>button(tree,'Copy').props.onPress());assert.match(clips.at(-1),/Verified AI revision/);
 await act(async()=>button(tree,'Export Encounter').props.onPress());assert.match(clips.at(-1),/MRN: UI-TEST/);assert.match(clips.at(-1),/CPT Codes:/);
 await act(async()=>button(tree,'Save as Example').props.onPress());assert.equal(examples.length,1);
 assert.equal(sends.length,0);await act(async()=>button(tree,'Email').props.onPress());assert.equal(sends.length,1);assert.equal(sends[0][2],params.dictationId);
 await act(async()=>tree.unmount());
});
test('New Report keeps the same patient, preserves prior report and routes to full dictation instead of patient creation',async()=>{
 const oldId=params.dictationId;
 let tree;await act(async()=>{tree=create(React.createElement(Dictation));await store.getState().flush();});
 const old=JSON.parse(values.get('echo-new-patient-case-v1-'+oldId));
 await act(async()=>button(tree,'New Report').props.onPress());
 await act(async()=>{const fn=button(tree,'Start from Previous').props.onPress;await Promise.all([fn(),fn()]);});
 const route=routes.at(-1);assert.equal(route.pathname,'/patient-dictation');assert.equal(route.params.patientId,old.patient.id);assert.notEqual(route.params.dictationId,oldId);
 let d=store.getState().dictations[route.params.dictationId];assert.equal(d.dateOfOperation,require('../src/services/newPatientCases.ts').localOperationDate(d.createdAt));assert.equal(d.generatedReport,null);assert.deepEqual(d.selectedProcedures,[]);
 assert.doesNotMatch(d.transcriptParts[0].content,/not specified/);assert.equal(d.transcriptParts[1].sourceKind,'historical');assert.equal(d.transcriptParts[1].content,old.dictation.generatedReport);
 assert.deepEqual(JSON.parse(values.get('echo-new-patient-case-v1-'+oldId)),old);
 await act(async()=>tree.unmount());await act(async()=>{tree=create(React.createElement(Dictation));});assert.doesNotMatch(content(tree),/Choose date/);assert.ok(tree.root.findByType('Avatar'));
 await act(async()=>tree.unmount());
});

test('finalize saves reviewed report before closing; Start Fresh stays patient-linked without copying prior content',async()=>{
 const id=params.dictationId;store.getState().updateDictation(id,{dateOfOperation:'2026-11-05',generatedReport:'Synthetic reviewed final draft'});await store.getState().flush();
 let tree;await act(async()=>{tree=create(React.createElement(Dictation));});
 await act(async()=>button(tree,'Finalize Report').props.onPress());
 await act(async()=>alerts.at(-1)[2].find(b=>b.text==='Confirm & finalize').onPress());
 assert.equal(routes.at(-1),'back');assert.equal(JSON.parse(values.get('echo-new-patient-case-v1-'+id)).dictation.status,'final');
 await act(async()=>button(tree,'New Report').props.onPress());
 await act(async()=>button(tree,'Start Fresh').props.onPress());
 assert.equal(routes.at(-1).pathname,'/patient-dictation');
 const next=store.getState().dictations[params.dictationId];assert.equal(next.transcriptParts.length,1);assert.equal(next.generatedReport,null);assert.equal(next.dateOfOperation,require('../src/services/newPatientCases.ts').localOperationDate(next.createdAt));
 await act(async()=>tree.unmount());
});

test('Save & Close retries a failed save and exits only after committed guards are clear',async()=>{
 let tree;await act(async()=>{tree=create(React.createElement(Dictation));});
 const id=params.dictationId;failed=true;
 await act(async()=>{store.getState().updateDictation(id,{generatedReport:'Synthetic unsaved report'});await store.getState().flush().catch(()=>{});});
 assert.match(content(tree),/Not saved/);assert.ok(button(tree,'Save & Close'));
 const before=routes.length;await act(async()=>button(tree,'Save & Close').props.onPress());assert.equal(routes.length,before);
 failed=false;const blocks=blockedExits;await act(async()=>button(tree,'Save & Close').props.onPress());
 assert.equal(routes.at(-1),'back');assert.equal(blockedExits,blocks);assert.equal(store.getState().saveError,null);
 await act(async()=>tree.unmount());
});
