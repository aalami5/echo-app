const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('fs');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {separateRoutineDefaults,reportForAIEditing}=require('../src/utils/reportPresentation.ts');
const marked='**Specimens:**\nNone.\n\n**Drains:**\n[Suggested: None.]\n\n**Complications:**\n[Suggested: None.]\n\n**Description of Procedure:**\nLeft leg angiogram. [verify: operation date]. [Suggested: The patient was transferred to the PACU with stable vital signs.]';
test('routine markers leave report/readback text but retain section-specific provenance',()=>{
 const p=separateRoutineDefaults(marked);
 assert.doesNotMatch(p.report,/Suggested/);assert.match(p.report,/\[verify: operation date\]/);
 assert.deepEqual(p.routineDefaults.map(d=>d.section),['Drains','Complications','Description of Procedure']);
 assert.deepEqual(p.routineDefaults.map(d=>d.text),['None.','None.','The patient was transferred to the PACU with stable vital signs.']);
 assert.equal(reportForAIEditing(p.report,p.routineDefaults),marked);
});
test('changed or removed manual statements are not replaced by stale defaults',()=>{
 const p=separateRoutineDefaults(marked);const edited=p.report.replace('**Drains:**\nNone.','**Drains:**\nOne JP drain.').replace('The patient was transferred to the PACU with stable vital signs.','Transferred to ICU intubated.');
 const input=reportForAIEditing(edited,p.routineDefaults);
 assert.match(input,/One JP drain/);assert.match(input,/ICU intubated/);assert.doesNotMatch(input,/PACU/);
 assert.match(input,/\*\*Specimens:\*\*\nNone\./);assert.match(input,/\*\*Complications:\*\*\n\[Suggested: None\.\]/);
});
test('source uncertainty and already documented normal text remain unchanged',()=>{
 const report='**Complications:**\nNone.\n**Findings:**\n[unreadable]. [verify: side].\n**Description of Procedure:**\nPatient stable in recovery.';
 assert.deepEqual(separateRoutineDefaults(report),{report,routineDefaults:[]});
});
test('plain-heading legacy results supported; no nested markers or wrong-section annotation',()=>{
 const original='Drains\n[Suggested: None.]\nComplications\nNone.';const p=separateRoutineDefaults(original);
 assert.equal(p.routineDefaults[0].section,'Drains');assert.equal(reportForAIEditing(p.report,p.routineDefaults),original);
 assert.equal(reportForAIEditing(original,p.routineDefaults),original);
});
test('metadata persists separately through JSON serialization without entering report body',()=>{
 const p=separateRoutineDefaults(marked);const saved=JSON.parse(JSON.stringify({generatedReport:p.report,reportReview:{routineDefaults:p.routineDefaults}}));
 assert.doesNotMatch(saved.generatedReport,/Suggested|Drafting note/);assert.equal(saved.reportReview.routineDefaults.length,3);
});
