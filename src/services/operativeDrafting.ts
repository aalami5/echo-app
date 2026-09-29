import { ensureGatewayConfig, refreshGatewayConfig } from './gatewayBootstrap';
import { useSettingsStore } from '../stores/settingsStore';
import type { TranscriptPart } from '../stores/dictationStore';

export interface TechniqueSuggestion { procedure:string; profileId:string|null; version:number; origin:string; steps:string[] }
export interface CaseFact { id:string; field:string; value:string; sourceId:string; quote:string }
export interface CaseAnalysis { id:string; caseId:string; procedures:string[]; facts:CaseFact[]; review:string[]; suggestions:TechniqueSuggestion[]; policyVersion:string }
export interface DraftResult { facts:CaseFact[]; report:string; review:string[]; statements:{section:string;text:string;evidence:string[]}[]; confirmedSteps:{id:string;text:string;procedure:string;profileId?:string;version:number}[]; sessionId:string; policyVersion:string; createdAt:string }
export interface ReportReview { facts?:CaseFact[]; sourceFingerprint?:string; manuallyEdited?:boolean; sessionId:string; policyVersion:string; review:string[]; statements:DraftResult['statements']; confirmedSteps:DraftResult['confirmedSteps']; reviewedAt?:string }

type Progress = (stage:string)=>void;
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
class RequestFailure extends Error { constructor(message:string,public status:number){super(message);} }
async function transport<T>(path:string,body?:unknown):Promise<T>{
  if(!await ensureGatewayConfig())throw Error('Connect Echo in Settings before drafting.');
  for(let attempt=0;attempt<3;attempt++){
    const {gatewayUrl,gatewayToken}=useSettingsStore.getState();
    if(!gatewayUrl||!gatewayToken)throw Error('Connect Echo in Settings before drafting.');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
    try{
      const r=await fetch(`${gatewayUrl.replace(/\/+$/,'')}/patients/operative${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${gatewayToken}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
      if((r.status===401||r.status===403)&&attempt===0&&await refreshGatewayConfig())continue;
      const result=await r.json().catch(()=>null);
      if(!r.ok)throw new RequestFailure(result?.error||'Report service is temporarily unreachable. Your notes are saved.',r.status);
      if(!result)throw new RequestFailure('The report response could not be read.',502);
      return result;
    }catch(e){
      // Only GET and content-addressed job submissions can be replayed safely.
      const replayable=body===undefined||path==='/jobs';
      const transient=!(e instanceof RequestFailure)||[502,503,504].includes(e.status);
      if(replayable&&transient&&attempt<2){await wait(500*(attempt+1));continue;}
      if(controller.signal.aborted)throw Error('Connection interrupted. Your notes are saved. Retry to reconnect to this job.');
      throw e;
    }finally{clearTimeout(timer);}
  }
  throw Error('Reconnect Echo in Settings and try again.');
}
export async function operativeRequest<T>(path:string,body?:unknown,onProgress?:Progress):Promise<T>{
  if(body===undefined||!['/ocr','/analyze','/draft','/profiles/suggest'].includes(path))return transport<T>(path,body);
  type Job={id:string;status:'running'|'completed'|'failed';stage:string;result?:T;error?:string};
  let job=await transport<Job>('/jobs',{operation:path,input:body,retry:true});
  const started=Date.now();
  while(job.status==='running'){
    onProgress?.(job.stage);
    if(Date.now()-started>110000)throw Error('This job is still processing. Your notes are saved; retry to reconnect without starting over.');
    await wait(1000);
    job=await transport<Job>(`/jobs/${job.id}`);
  }
  if(job.status==='failed')throw Error(job.error||'Report processing failed. Your original notes are unchanged.');
  if(job.result===undefined)throw Error('The saved result could not be read. Retry to reconnect.');
  return job.result;
}
export function sourceFingerprint(parts:TranscriptPart[]):string{
  return JSON.stringify(parts.map(p=>[p.id,p.type,p.content,p.timestamp,p.sourceKind,p.ocrText,p.ocrWarnings]));
}
export async function extractCaseImages(parts:TranscriptPart[],onExtracted?:(part:TranscriptPart)=>void,onProgress?:Progress):Promise<TranscriptPart[]>{
  const out=[...parts];
  const pending=parts.map((part,index)=>({part,index})).filter(({part})=>part.type==='image'&&!part.ocrText);
  for(const {part} of pending)if(!part.imageBase64||!part.imageMimeType)throw Error('This screenshot has no saved extracted text or image. Reattach it before generating.');
  let next=0,done=0;let failure:unknown;
  const reportProgress=()=>onProgress?.(`ocr:${done}/${pending.length}`);
  const worker=async()=>{
    while(!failure&&next<pending.length){
      const {part,index}=pending[next++];
      try {
        reportProgress();
        const result=await operativeRequest<{text:string;warnings:string[]}>('/ocr',{imageBase64:part.imageBase64,mimeType:part.imageMimeType},reportProgress);
        if(!result.text?.trim())throw Error('No readable text in screenshot. Reattach a clearer image.');
        const extracted={...part,ocrText:result.text,ocrWarnings:result.warnings};
        onExtracted?.(extracted);out[index]=extracted;done++;reportProgress();
      }catch(e){failure=e;}
    }
  };
  await Promise.all(Array.from({length:Math.min(2,pending.length)},worker));
  if(failure)throw failure;
  return out;
}
export function caseSources(parts:TranscriptPart[]){
  return parts.map(p=>({id:p.id,kind:p.sourceKind==='historical'||p.id.endsWith('-copy')?'historical':p.id.endsWith('-header')?'header':p.sourceKind==='correction'?'correction':p.type==='image'?'ocr':p.type,text:p.type==='image'?`${p.content}\n${p.ocrText||''}`:p.content,warnings:p.ocrWarnings||[]}));
}
export async function analyzeCase(caseId:string,parts:TranscriptPart[],selectedProcedures:string[],customProcedures:string[],onProgress?:Progress){
  return operativeRequest<CaseAnalysis>('/analyze',{caseId,sources:caseSources(parts),selectedProcedures,customProcedures},onProgress);
}
