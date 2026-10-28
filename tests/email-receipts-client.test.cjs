const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const Module = require('module');
const storage = new Map();
const asyncStorage = { getItem: async (k) => storage.get(k) || null, setItem: async (k,v) => { storage.set(k,v); }, removeItem: async (k) => { storage.delete(k); } };
const load = Module._load;
Module._load = function(id, ...args) {
  if (id === '@react-native-async-storage/async-storage') return { __esModule:true, default:asyncStorage };
  if (id === 'react-native') return { View:'View', Text:'Text' };
  if (id.endsWith('/patientDictationsStore')) return { usePatientDictationsStore: { persist: { hasHydrated:()=>true }, getState:()=>({dictations:{}}) } };
  if (id.endsWith('/settingsStore')) return { useSettingsStore: { getState: () => ({ gatewayUrl: 'https://test.invalid', gatewayToken:'synthetic' }) } };
  return load.call(this,id,...args);
};
for (const ext of ['.ts','.tsx']) require.extensions[ext] = (mod, file) => mod._compile(ts.transpileModule(require('fs').readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,file);
const { emailReceiptStatus, reportHash } = require('../src/utils/emailReceiptStatus.ts');
const { reportHash: serverHash } = require('../server/email-receipts');
const receipt = { id:'receipt-a',reportId:'a',reportHash:reportHash('original'),sentAt:'2026-09-18T02:00:00Z',recipients:['test@example.invalid'],messageId:'synthetic',source:'gmail' };
test('client/server digest parity including Unicode and CRLF', () => {
 for (const text of ['a\r\nb\r\n',' Aalami – α 😊 \n',' original ']) assert.equal(reportHash(text),serverHash(text));
});
test('sent status survives edits and cannot bleed across report IDs', () => {
 assert.equal(emailReceiptStatus([receipt],'a','original').label,'✓ Sent');
 assert.equal(emailReceiptStatus([receipt],'a','revision').label,'Sent · Updated since last email');
 assert.equal(emailReceiptStatus([receipt],'b','original').sent,false);
 assert.equal(emailReceiptStatus([],'legacy','old').label,'Send history unknown');
 assert.equal(emailReceiptStatus([],'new','new',true).label,'Not sent');
 assert.equal(emailReceiptStatus([{...receipt,reportId:undefined}],'a','original').sent,true);
 assert.equal(emailReceiptStatus([{...receipt,reportId:undefined}],'a','revision').sent,false);
});
test('receipt cache persists and restores; refresh merge never deletes history', async () => {
 const file = require.resolve('../src/stores/emailReceiptsStore.ts');
 let store = require(file).useEmailReceiptsStore;
 await store.persist.rehydrate(); store.getState().merge([receipt]);
 await new Promise(r=>setImmediate(r)); delete require.cache[file];
 store=require(file).useEmailReceiptsStore; await store.persist.rehydrate();
 assert.equal(store.getState().receipts[0].id,receipt.id);
 store.getState().merge([]); store.getState().merge([receipt]);
 assert.equal(store.getState().receipts.length,1);
});
test('failed requests reuse persisted attempt ID; success caches receipt', async () => {
 global.fetch = async()=>({ok:true,json:async()=>({receipts:[]})});
 const { sendReportWithReceipt } = require('../src/services/emailReceipts.ts');
 const ids=[];
 const gw={sendOperativeReportEmail:async (report,subject,options)=>{ids.push(options.requestId);if(ids.length===1)throw Error('timeout');return {success:true,receipt};}};
 await assert.rejects(sendReportWithReceipt(gw,'original','a',true));
 await sendReportWithReceipt(gw,'original','a',true);
 assert.equal(ids[0],ids[1]);
 assert.equal(require('../src/stores/emailReceiptsStore.ts').useEmailReceiptsStore.getState().receipts.length,1);
 assert.equal(storage.has('operative-email-attempt:a:'+reportHash('original')),false);
});
test('rendered report status shows sent timestamp, recipients and edited state', async () => {
 global.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react');const {create,act}=require('react-test-renderer');
 const {ReportEmailStatus}=require('../src/components/ReportEmailStatus.tsx');
 let tree;await act(async()=>{tree=create(React.createElement(ReportEmailStatus,{reportId:'a',report:'revision',details:true}));});
 const text=JSON.stringify(tree.toJSON());
 assert.match(text,/Sent · Updated since last email/);assert.match(text,/Last emailed/);assert.match(text,/test@example.invalid/);
 await act(async()=>tree.unmount());
});
