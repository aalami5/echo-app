const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),Module=require('node:module'),fs=require('fs');
const React=require('react'),{create,act}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
const original=Module._load;Module._load=function(id,...args){if(id==='react-native')return {View:'View',Text:'Text'};return original.call(this,id,...args);};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {ReportDraftNote}=require('../src/components/ReportDraftNote.tsx');
test('review note renders outside report and contains no approval controls',async()=>{
 let tree;await act(async()=>{tree=create(React.createElement(ReportDraftNote,{report:'**Complications:**\nNone.',defaults:[{section:'Complications',text:'None.'}]}));});
 const text=JSON.stringify(tree.toJSON());assert.match(text,/not read aloud/);assert.match(text,/Complications: None/);assert.doesNotMatch(text,/Suggested:|Touchable|Button|TextInput/);await act(async()=>tree.unmount());
});
test('no default metadata means no review note; old inline markers still disclose separately',async()=>{
 let tree;await act(async()=>{tree=create(React.createElement(ReportDraftNote,{report:'Documented no complications.'}));});assert.equal(tree.toJSON(),null);
 await act(async()=>tree.update(React.createElement(ReportDraftNote,{report:'**Complications:**\n[Suggested: None.]'})));assert.match(JSON.stringify(tree.toJSON()),/Complications: None/);await act(async()=>tree.unmount());
});
