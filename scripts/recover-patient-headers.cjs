// Restore only exact app-generated headers, keyed by the original patient UUID.
// Never infer DOB, hospital, room, or presenting concern from the clinical prose.
const { readClinical, mergePatients, preserveAndWrite } = require('../server/clinical-preservation');
const path=require('node:path');
const dir=process.argv[2];if(!dir)throw Error('Usage: node scripts/recover-patient-headers.cjs DATA_DIR [--apply]');
const patientsFile=path.join(dir,'patients.json');
const original=readClinical(patientsFile);
const reports=readClinical(path.join(dir,'dictations.json')).dictations;
const incoming={patients:{},callDays:{},callDayOrder:[]};
const grouped=new Map();
for(const report of Object.values(reports)){
 if(!grouped.has(report.patientId))grouped.set(report.patientId,[]);
 grouped.get(report.patientId).push(report);
}
let conflicts=0;
for(const [id,items] of grouped){
 if(original.patients[id])continue;
 const identities=[];
 for(const r of items){
   const text=(r.transcriptParts||[]).find(p=>p.type==='text' && /^This is Dr\. Aalami with a dictated operative report for /i.test(p.content||''))?.content||'';
   const m=text.match(/^This is Dr\. Aalami with a dictated operative report for (.+?), medical record number ([\w-]+)\./i);
   if(m)identities.push({name:m[1],mrn:m[2]});
 }
 if(identities.length!==items.length || new Set(identities.map(p=>JSON.stringify(p))).size!==1){conflicts++;continue;}
 const report=items.slice().sort((a,b)=>a.dateOfOperation.localeCompare(b.dateOfOperation))[0];
 const date=report.dateOfOperation;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){conflicts++;continue;}
 const dayId='recovered-'+date;
 const dayDate=new Date(date+'T12:00:00Z');
 incoming.callDays[dayId] ||= {id:dayId,date,displayDate:dayDate.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}),dayOfWeek:dayDate.toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}),patientIds:[]};
 incoming.callDays[dayId].patientIds.push(id);
 incoming.patients[id]={id,...identities[0],dob:'',room:'',hospital:'OTHER',chiefComplaint:'',timeSeen:date+'T12:00:00Z',callDayId:dayId,recoveredFromReport:true};
}
incoming.callDayOrder=Object.keys(incoming.callDays);
const merged=mergePatients(original,incoming);
console.log(JSON.stringify({existingPatients:Object.keys(original.patients).length,recoveredPatients:Object.keys(incoming.patients).length,sourceReports:Object.keys(reports).length,conflicts,apply:process.argv.includes('--apply')}));
if(process.argv.includes('--apply'))preserveAndWrite(patientsFile,merged);
