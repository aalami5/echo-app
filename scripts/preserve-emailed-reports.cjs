// Read-only recovery of verified Sent messages. No mail is sent and no patient
// records are inferred. Bodies are stored only in an encrypted recovery archive.
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const {readClinical,preserveAndWrite}=require('../server/clinical-preservation');
const {reportHash}=require('../server/email-receipts');
const dir=process.argv[2];if(!dir)throw Error('Usage: preserve-emailed-reports.cjs DATA_DIR');
const ledger=readClinical(path.join(dir,'operative-email-receipts.json'));
const known=new Map(ledger.receipts.map(r=>[r.messageId,r]));
const saved=readClinical(path.join(dir,'dictations.json')).dictations;
const hashes=new Set(Object.values(saved).filter(r=>r.generatedReport).map(r=>reportHash(r.generatedReport)));
try {
 const result=JSON.parse(execFileSync('gog',['gmail','messages','search','in:sent from:aalami@gmail.com subject:"Operative Report" after:2026/02/01','--all','--max','100','--include-body','--account','aalami@gmail.com','--json','--no-input','--gmail-no-send'],{encoding:'utf8',maxBuffer:40*1024*1024,timeout:120000,stdio:['ignore','pipe','pipe']}));
 const messages=[];let unverified=0;
 for(const m of result.messages||[]){
   const receipt=known.get(m.id);
   if(!receipt || typeof m.body!=='string' || reportHash(m.body)!==receipt.reportHash){unverified++;continue;}
   messages.push({messageId:m.id,sentAt:receipt.sentAt,recipients:receipt.recipients,reportHash:receipt.reportHash,body:m.body,matchedSavedReport:hashes.has(receipt.reportHash)});
 }
 preserveAndWrite(path.join(dir,'emailed-report-recovery.json'),{messages});
 console.log(JSON.stringify({verifiedArchivedEmails:messages.length,distinctArchivedVersions:new Set(messages.map(m=>m.reportHash)).size,distinctVersionsNotInSavedReports:new Set(messages.filter(m=>!m.matchedSavedReport).map(m=>m.reportHash)).size,unverifiedCandidates:unverified,sentEmails:0}));
}catch{
 console.error('Could not complete sent-report preservation; no email sent or patient data changed.');process.exitCode=1;
}
