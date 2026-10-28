const fs=require('node:fs');const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {PROCEDURE_TEMPLATES}=require('../src/data/vascularProcedures.ts');
const samples=require('../src/data/templateContent.ts');
const catalog=PROCEDURE_TEMPLATES.map(p=>({id:p.id,name:p.name,category:p.category,steps:p.typicalSteps}));
for(const [category,list] of Object.entries(samples)) if(Array.isArray(list)) for(const t of list){
 if(!t.title || catalog.some(p=>p.name.toLowerCase()===t.title.toLowerCase()))continue;
 const related=PROCEDURE_TEMPLATES.find(p=>t.title.toLowerCase().startsWith(p.name.toLowerCase()+' ('));
 catalog.push({id:'sample-'+category.toLowerCase()+'-'+catalog.length,name:t.title,canonicalName:related?.name||t.title,category:category.toLowerCase().replace('_templates',''),steps:related?.typicalSteps||[]});
}
fs.writeFileSync('server/report-catalog.json',JSON.stringify(catalog,null,2)+'\n');
console.log('Procedure catalog entries:',catalog.length);
