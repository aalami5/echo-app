const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),Module=require('node:module'),fs=require('node:fs');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
let requests=[],analysisCalls=[],extracted=[],completions=[],failAnalyze=false,alerts=[];
const store={savedExamples:[],customProcedures:[],stylePreferences:[]};
const ds=selector=>selector(store);ds.getState=()=>store;
const fingerprint=parts=>JSON.stringify(parts.map(p=>[p.id,p.type,p.content,p.timestamp,p.sourceKind]));
const model={
 sourceFingerprint:fingerprint,
 extractCaseImages:async(parts,cb)=>parts.map(p=>{if(p.type==='image'&&!p.ocrText){const v={...p,ocrText:'Left AV fistula. EBL 10 mL.',ocrWarnings:[]};cb(v);extracted.push(v);return v;}return p;}),
 analyzeCase:async(id,parts)=>{analysisCalls.push(parts);if(failAnalyze)throw Error('OCR unreadable');return {id:'session',facts:[{id:'f1',field:'procedure',value:'Left AV fistula',quote:'Left AV fistula.'}],procedures:['AV Fistula Creation'],review:[],suggestions:[{procedure:'AV Fistula Creation',profileId:'p1',version:1,origin:'Your approved technique',steps:['Usual exposure','End-to-side anastomosis']}]}},
 operativeRequest:async(path,body)=>{requests.push({path,body});if(path==='/draft')return {report:'Draft',review:[],facts:[],statements:[],confirmedSteps:body.confirmedSteps,sessionId:'session',policyVersion:'test'};if(path==='/profiles/suggest')return {steps:['Proposed reusable step']};if(path==='/profiles')return {id:'p1',version:2};},
};
const original=Module._load;Module._load=function(id,...args){
 if(id==='react-native')return {Modal:({visible,children})=>visible?React.createElement('Modal',null,children):null,SafeAreaView:'SafeAreaView',ScrollView:'ScrollView',Text:'Text',TextInput:'TextInput',TouchableOpacity:'TouchableOpacity',View:'View',ActivityIndicator:'ActivityIndicator',StyleSheet:{create:x=>x},Alert:{alert:(...args)=>alerts.push(args)}};
 if(id.endsWith('/dictationStore'))return {useDictationStore:ds};
 if(id.endsWith('/operativeDrafting'))return model;
 return original.call(this,id,...args);
};
for(const extension of ['.ts','.tsx'])require.extensions[extension]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {BriefReportBuilder}=require('../src/components/BriefReportBuilder.tsx');
const label=node=>typeof node==='string'?node:node?.children?.map(label).join('')||'';
const press=async(tree,phrase)=>{const button=tree.root.findAllByType('TouchableOpacity').find(n=>label(n).includes(phrase));assert.ok(button,`button ${phrase}`);assert.ok(!button.props.disabled);await act(async()=>{await button.props.onPress();});};
async function mount(){requests=[];analysisCalls=[];extracted=[];completions=[];alerts=[];let tree;const parts=[{id:'image',type:'image',content:'Brief operative note',timestamp:'today',imageBase64:'image',imageMimeType:'image/jpeg'}];await act(async()=>{tree=create(React.createElement(BriefReportBuilder,{caseId:'case',parts,procedures:[],onSource:()=>{},onComplete:(...args)=>completions.push(args)}));});return tree;}
test('screenshot extraction precedes analysis; draft does not implicitly confirm approved routine steps',async()=>{
 const tree=await mount();await press(tree,'Brief note');assert.equal(extracted.length,1);assert.equal(analysisCalls[0][0].ocrText,'Left AV fistula. EBL 10 mL.');await press(tree,'Generate full draft');assert.deepEqual(requests.at(-1).body.confirmedSteps,[]);assert.equal(completions.length,1);await act(async()=>tree.unmount());
});
test('case confirmation sends displayed edited steps only; no library mutation without explicit save',async()=>{
 const tree=await mount();await press(tree,'Brief note');const input=tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel==='Technique for AV Fistula Creation');await act(async()=>input.props.onChangeText('Changed exposure\n'));assert.equal(tree.root.findAllByType('TextInput')[0].props.value,'Changed exposure\n');
 await press(tree,'Confirm these steps');await press(tree,'Generate full draft');assert.deepEqual(requests.at(-1).body.confirmedSteps.map(s=>s.text),['Changed exposure']);assert.ok(!requests.some(r=>r.path==='/profiles'));await act(async()=>tree.unmount());
});
test('clarification is retained, reanalyzed and clears old case-step confirmation',async()=>{
 const tree=await mount();await press(tree,'Brief note');await press(tree,'Confirm these steps');const input=tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel==='Case clarification');await act(async()=>input.props.onChangeText('Correct side to right.'));await press(tree,'Apply clarification');assert.equal(analysisCalls.length,2);assert.equal(analysisCalls[1].at(-1).sourceKind,'correction');await press(tree,'Generate full draft');assert.deepEqual(requests.at(-1).body.confirmedSteps,[]);await act(async()=>tree.unmount());
});
test('failed extraction cannot generate silently; explicit retry available',async()=>{
 failAnalyze=true;const tree=await mount();await press(tree,'Brief note');assert.ok(JSON.stringify(tree.toJSON()).includes('OCR unreadable'));assert.ok(!tree.root.findAllByType('TouchableOpacity').some(n=>label(n)==='Generate full draft'));failAnalyze=false;await press(tree,'Retry analysis');assert.equal(analysisCalls.length,2);await act(async()=>tree.unmount());
});
test('saving a reusable profile requires separate explicit approval and never confirms the current case',async()=>{
 const tree=await mount();await press(tree,'Brief note');await press(tree,'Save as my usual');assert.equal(requests.length,0);await act(async()=>alerts.at(-1)[2].find(a=>a.text==='Approve & save').onPress());assert.equal(requests[0].body.approved,true);assert.equal(requests[0].body.expectedVersion,1);await press(tree,'Generate full draft');assert.deepEqual(requests.at(-1).body.confirmedSteps,[]);await act(async()=>tree.unmount());
});
