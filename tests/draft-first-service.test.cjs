const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),Module=require('node:module'),fs=require('node:fs');
let parts=[],calls=[],result={report:'New draft'},duringRequest=()=>{};
const fp=p=>JSON.stringify(p);const original=Module._load;
Module._load=function(id,...args){
 if(id==='./operativeDrafting')return {sourceFingerprint:fp,caseSources:p=>p,extractCaseImages:async(p,save)=>p.map(v=>{if(v.type!=='image')return v;const o={...v,ocrText:'All screenshot facts'};save?.(o);return o;}),operativeRequest:async(path,body)=>{calls.push({path,body});duringRequest();return result;}};
 if(id.endsWith('/dictationStore'))return {useDictationStore:{getState:()=>({stylePreferences:[]})}};
 return original.call(this,id,...args);
};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {generateReport,regenerateWithCorrections}=require('../src/services/dictationService.ts');
const save=p=>{const i=parts.findIndex(x=>x.id===p.id);if(i<0)parts.push(p);else parts[i]=p;};
test('pictures go directly to one composition request, extracted text persists and fingerprint matches',async()=>{
 parts=[{id:'picture',type:'image'}];calls=[];duringRequest=()=>{};let fingerprint;
 const report=await generateReport({},parts,[],{onSource:save,getCurrentParts:()=>parts,onResult:(_,f)=>fingerprint=f});
 assert.equal(report,'New draft');assert.equal(calls.length,1);assert.equal(calls[0].path,'/compose');assert.equal(parts[0].ocrText,'All screenshot facts');assert.equal(fingerprint,fp(parts));
});
test('AI edit retains current draft and persists instructions, does not use analysis or technique gates',async()=>{
 parts=[{id:'note',type:'text',content:'Current case'}];calls=[];duringRequest=()=>{};
 await regenerateWithCorrections({},'My manually edited report','Shorten the indication only',parts,[],{onSource:save,getCurrentParts:()=>parts});
 assert.equal(calls.length,1);assert.equal(calls[0].body.previousReport,'My manually edited report');assert.equal(calls[0].body.editInstructions,'Shorten the indication only');assert.equal(parts.length,2);
});
test('concurrent source changes preserve previous report by rejecting replacement',async()=>{
 parts=[{id:'note',type:'text',content:'Original'}];let accepted=false;duringRequest=()=>parts.push({id:'added',type:'text',content:'New fact'});
 await assert.rejects(generateReport({},[...parts],[],{getCurrentParts:()=>parts,onResult:()=>accepted=true}),/notes changed/);assert.equal(accepted,false);
});
test('draft result hands default metadata to storage separately from clean report',async()=>{
 parts=[{id:'note',type:'text',content:'Current case'}];calls=[];duringRequest=()=>{};
 result={report:'**Complications:**\n[Suggested: None.]\n\n**Description of Procedure:**\nProcedure performed.'};let saved;
 const report=await generateReport({},parts,[],{onResult:r=>saved=r});
 assert.doesNotMatch(report,/Suggested/);assert.equal(saved.report,report);assert.deepEqual(saved.routineDefaults,[{section:'Complications',text:'None.'}]);
});
test('AI edit receives provenance while user-facing result stays clean and notes separate',async()=>{
 parts=[{id:'note',type:'text',content:'Current case'}];calls=[];duringRequest=()=>{};let saved;
 const report='**Complications:**\nNone.\n\n**Description of Procedure:**\nProcedure performed.';
 result={report:'**Complications:**\n[Suggested: None.]\n\n**Description of Procedure:**\nProcedure performed. Retained manual text.'};
 const edited=await regenerateWithCorrections({},report,'Shorten the indication only',parts,[],{previousRoutineDefaults:[{section:'Complications',text:'None.'}],onResult:r=>saved=r});
 assert.match(calls[0].body.previousReport,/\[Suggested: None\.\]/);assert.doesNotMatch(edited,/Suggested/);assert.match(edited,/Retained manual text/);assert.equal(saved.routineDefaults.length,1);
});
