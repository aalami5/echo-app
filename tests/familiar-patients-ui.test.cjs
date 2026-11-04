const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const values=new Map(),reads=[],writes=[],routes=[],alerts=[],listeners=[];let failed=false,localFailed=false,serverFailed=false;
const old={id:'old-synthetic',name:'Archived Synthetic',mrn:'OLD-TEST',hospital:'SEQ',callDayId:'day',room:'OLD',chiefComplaint:'Synthetic old complaint'};
const dataset={patients:{[old.id]:old},callDays:{day:{id:'day',date:'2026-11-03',patientIds:[old.id]}},callDayOrder:['day']};
const storage={getItem:async k=>{reads.push(k);assert.match(k,/^echo-(patient-view|new-patient-case)/);return values.get(k)??null;},setItem:async(k,v)=>{assert.match(k,/^echo-(patient-view|new-patient-case)/);if(failed)throw Error('full');writes.push(k);values.set(k,v);}};
const original=Module._load;
Module._load=function(id,...args){
 if(/\/(LegacyPatientsScreen|patientsStore|patientDictationsStore|clinicalRestore|patientSync|dictationSync|emailReceiptsStore|chatStore)$/.test(id))assert.fail('screen must not import '+id);
 if(id==='@react-native-async-storage/async-storage')return {__esModule:true,default:storage};
 if(id==='expo-secure-store')return {getItemAsync:async k=>{assert.equal(k,'echo-patients');if(localFailed)throw Error('private-error');return JSON.stringify({version:0,state:dataset});}};
 if(id==='expo-crypto')return {randomUUID:require('node:crypto').randomUUID};
 if(id==='expo-router')return {useRouter:()=>({push:r=>routes.push(r)})};
 if(id==='@react-navigation/native')return {useIsFocused:()=>true,usePreventRemove:()=>{}};
 if(id==='react-native-keyboard-aware-scroll-view')return {KeyboardAwareScrollView:'ScrollView'};
 if(id==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView'};
 if(id==='@expo/vector-icons')return {Ionicons:'Icon'};
 if(id==='react-native')return {View:'View',Text:'Text',TextInput:'TextInput',TouchableOpacity:'TouchableOpacity',ActivityIndicator:'ActivityIndicator',StyleSheet:{create:x=>x},
  AppState:{currentState:'active',addEventListener:(_,fn)=>{listeners.push(fn);return {remove:()=>listeners.splice(listeners.indexOf(fn),1)};}},Alert:{alert:(...a)=>alerts.push(a)},
  FlatList:p=>React.createElement('FlatList',{initialNumToRender:p.initialNumToRender},p.data.length?p.data.map((item,index)=>React.createElement('Row',{key:item.key||item.id},p.renderItem({item,index}))):p.ListEmptyComponent),
  Modal:({visible,children})=>visible?React.createElement('Modal',{},children):null};
 if(id.endsWith('/settingsStore'))return {useSettingsStore:s=>s({gatewayUrl:'https://test.invalid',gatewayToken:'synthetic'})};
 if(id.endsWith('/usePatientScan'))return {usePatientScan:()=>({clearScan:()=>{},scanFromCamera:async()=>({room:'SCANNED-ROOM'}),scanFromLibrary:async()=>({dob:'01/02/1970'})})};
 if(id.endsWith('/usePatientVoiceInput'))return {usePatientVoiceInput:()=>({cancelRecording:async()=>{}})};
 return original.call(this,id,...args);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,f);
global.XMLHttpRequest=class{status=200;responseText=JSON.stringify(dataset);open(method,url){assert.equal(method,'GET');assert.equal(url,'https://test.invalid/patients/list');}setRequestHeader(){}abort(){this.onabort?.();}send(){queueMicrotask(()=>serverFailed?this.onerror():this.onload());}};
const Screen=require('../app/(tabs)/patients.tsx').default;
const {useNewPatientCasesStore:store}=require('../src/stores/newPatientCasesStore.ts');
const content=t=>JSON.stringify(t.toJSON());
const byLabel=(t,label)=>t.root.findAllByType('TouchableOpacity').find(n=>n.props.accessibilityLabel===label);
const button=(t,label)=>t.root.findAllByType('TouchableOpacity').find(n=>n.findAllByType('Text').some(x=>x.props.children===label));
const change=async(t,label,value)=>act(async()=>t.root.findByProps({accessibilityLabel:label}).props.onChangeText(value));
let newPatientId,reportId;
test('familiar add sheet saves a patient first, scans into editable fields, preserves retry identity and returns to grouped card without creating a report',async()=>{
 let tree;await act(async()=>{tree=create(React.createElement(Screen));});
 await act(async()=>byLabel(tree,'Add patient').props.onPress());
 await act(async()=>button(tree,'Save').props.onPress());assert.match(content(tree),/Enter a patient name/);
 await change(tree,'Patient Name *','New Synthetic');await change(tree,'MRN *','NEW-TEST');await change(tree,'Visit date *','2026-11-03');await change(tree,'Room','R12');await change(tree,'Chief complaint','Synthetic complaint');
 await act(async()=>byLabel(tree,'Scan patient details').props.onPress());await act(async()=>alerts.at(-1)[2].find(x=>x.text==='Take Photo').onPress());
 assert.equal(tree.root.findByProps({accessibilityLabel:'Room'}).props.value,'SCANNED-ROOM');
 failed=true;await act(async()=>button(tree,'Save').props.onPress());assert.match(content(tree),/Patient not saved/);assert.equal(tree.root.findAllByType('Modal').length,1);
 failed=false;await act(async()=>{const save=button(tree,'Save').props.onPress;await Promise.all([save(),save()]);});
 assert.equal(tree.root.findAllByType('Modal').length,0);assert.equal(routes.length,0);assert.equal(writes.length,1);assert.equal(writes[0],'echo-patient-view-v1');
 const saved=JSON.parse(values.get(writes[0])).patients;assert.equal(saved.length,1);newPatientId=saved[0].id;
 assert.match(content(tree),/New Synthetic/);assert.match(content(tree),/SCANNED-ROOM/);assert.match(content(tree),/Sequoia Hospital/);assert.ok(byLabel(tree,'Op Report for New Synthetic'));
 assert.equal(tree.root.findByType('FlatList').props.initialNumToRender,12);
 await act(async()=>tree.unmount());
});
test('reopen lists patient metadata only; explicit Op Report uses current patient and chosen operation date',async()=>{
 reads.length=0;let tree;await act(async()=>{tree=create(React.createElement(Screen));});
 assert.match(content(tree),/New Synthetic/);assert.deepEqual(reads.sort(),['echo-new-patient-cases-v1','echo-patient-view-v1'].sort());
 await act(async()=>byLabel(tree,'Op Report for New Synthetic').props.onPress());
 await act(async()=>button(tree,'Start dictation').props.onPress());assert.match(content(tree),/Enter the date of operation/);assert.equal(routes.length,0);
 await change(tree,'Operation date','2026-10-30');await act(async()=>button(tree,'Start dictation').props.onPress());await act(async()=>store.getState().flush());
 const route=routes.at(-1);assert.equal(route.params.patientId,newPatientId);reportId=route.params.dictationId;
 assert.equal(store.getState().dictations[reportId].dateOfOperation,'2026-10-30');assert.match(store.getState().dictations[reportId].transcriptParts[0].content,/October 30, 2026/);
 assert.deepEqual(store.getState().dictations[reportId].selectedProcedures,[]);
 await act(async()=>tree.unmount());
});
test('draft/final actions reopen exact saved report; patient edits do not rewrite report identity or contents',async()=>{
 store.getState().updateDictation(reportId,{generatedReport:'Synthetic manual draft'});await store.getState().flush();
 let tree;await act(async()=>{tree=create(React.createElement(Screen));});
 await act(async()=>byLabel(tree,'Continue Report for New Synthetic').props.onPress());assert.equal(routes.at(-1).params.dictationId,reportId);
 const before=values.get('echo-new-patient-case-v1-'+reportId);
 await act(async()=>byLabel(tree,'Edit patient New Synthetic').props.onPress());await change(tree,'Room','EDITED-ROOM');await act(async()=>button(tree,'Save').props.onPress());
 assert.equal(values.get('echo-new-patient-case-v1-'+reportId),before);assert.match(content(tree),/EDITED-ROOM/);
 await act(async()=>tree.unmount());store.getState().finalizeDictation(reportId);await store.getState().flush();
 await act(async()=>{tree=create(React.createElement(Screen));});await act(async()=>byLabel(tree,'View Report for New Synthetic').props.onPress());assert.equal(routes.at(-1).params.mode,'view');assert.equal(routes.at(-1).params.dictationId,reportId);
 await act(async()=>tree.unmount());
});
test('date collapse, search, source failures and background clearing preserve metadata and never hydrate old reports',async()=>{
 let tree;await act(async()=>{tree=create(React.createElement(Screen));});
 await act(async()=>byLabel(tree,'Patients for 2026-11-03').props.onPress());assert.doesNotMatch(content(tree),/Edit patient New Synthetic/);
 await act(async()=>byLabel(tree,'Search patients').props.onPress());await change(tree,'Search by name or MRN','NEW-TEST');assert.ok(byLabel(tree,'Edit patient New Synthetic'));
 await act(async()=>listeners[0]('background'));assert.doesNotMatch(content(tree),/New Synthetic/);
 await act(async()=>listeners[0]('active'));assert.ok(byLabel(tree,'Edit patient New Synthetic'));await act(async()=>tree.unmount());
 localFailed=true;await act(async()=>{tree=create(React.createElement(Screen));});assert.match(content(tree),/Server copy only/);await act(async()=>tree.unmount());
 serverFailed=true;await act(async()=>{tree=create(React.createElement(Screen));});assert.match(content(tree),/Older patients could not be loaded/);assert.match(content(tree),/New Synthetic/);assert.doesNotMatch(content(tree),/private-error/);await act(async()=>tree.unmount());
});
