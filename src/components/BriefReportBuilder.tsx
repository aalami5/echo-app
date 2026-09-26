import React,{useState,useRef} from 'react';
import {Modal,SafeAreaView,ScrollView,Text,TextInput,TouchableOpacity,View,StyleSheet,ActivityIndicator,Alert} from 'react-native';
import {TranscriptPart,useDictationStore} from '../stores/dictationStore';
import {analyzeCase,extractCaseImages,operativeRequest,CaseAnalysis,DraftResult,TechniqueSuggestion,sourceFingerprint} from '../services/operativeDrafting';

interface Props {caseId:string;parts:TranscriptPart[];procedures:string[];onSource:(part:TranscriptPart)=>void;onComplete:(r:DraftResult,procedures:string[],fingerprint:string)=>void}
export function BriefReportBuilder({caseId,parts,procedures,onSource,onComplete}:Props){
 const [visible,setVisible]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const [analysis,setAnalysis]=useState<CaseAnalysis|null>(null),[showFacts,setShowFacts]=useState(false),[showSources,setShowSources]=useState(false);
 const [techniques,setTechniques]=useState<TechniqueSuggestion[]>([]),[confirmed,setConfirmed]=useState<Record<number,boolean>>({});
 const [correction,setCorrection]=useState(''),[sources,setSources]=useState<TranscriptPart[]>([]),[exampleFor,setExampleFor]=useState<number|null>(null);
 const fingerprint=useRef('');const run=useRef(false);
 const savedExamples=useDictationStore(s=>s.savedExamples);
 const guarded=async(label:string,fn:()=>Promise<void>)=>{if(run.current)return;run.current=true;setBusy(label);setError('');try{await fn();}catch(e:any){setError(e.message||'Unable to continue. Your notes are saved.');}finally{run.current=false;setBusy('');}};
 const analyze=async(current:TranscriptPart[])=>{
   const extracted=await extractCaseImages(current,onSource);setSources(extracted);
   const result=await analyzeCase(caseId,extracted,procedures,useDictationStore.getState().customProcedures.map(p=>p.name));
   // Saved examples propose reusable technique only; they never supply case facts.
   const suggestions=[...result.suggestions];
   const examples=useDictationStore.getState().savedExamples;
   for(let i=0;i<suggestions.length;i++) {
     const t=suggestions[i];
     if(t.profileId) continue;
     const words=(v:string)=>v.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2);
     const target=words(t.procedure);
     const match=examples.map(e=>({e,score:target.filter(w=>words(e.procedureType).includes(w)).length/Math.max(1,target.length)})).filter(x=>x.score>=0.75).sort((a,b)=>b.score-a.score||b.e.timestamp.localeCompare(a.e.timestamp))[0];
     if(match) {
       try {
         const proposal=await operativeRequest<{steps:string[]}>('/profiles/suggest',{procedure:t.procedure,report:match.e.report});
         suggestions[i]={...t,steps:proposal.steps,origin:'Proposed from your saved example — review before using'};
       } catch { /* Explicit manual example selection remains available for retry. */ }
     }
   }
   setAnalysis(result);setTechniques(suggestions);setConfirmed({});fingerprint.current=sourceFingerprint(extracted);
 };
 const open=()=>{setVisible(true);setAnalysis(null);setCorrection('');setShowFacts(false);setShowSources(false);setExampleFor(null);guarded('Reading your case note…',()=>analyze(parts));};
 const revise=()=>guarded('Applying your case clarification…',async()=>{
   if(!correction.trim())return;
   const part:TranscriptPart={id:`correction-${Date.now()}`,type:'text',sourceKind:'correction',content:correction.trim(),timestamp:new Date().toISOString()};
   onSource(part);const next=[...sources,part];setSources(next);await analyze(next);setCorrection('');
 });
 const editTechnique=(index:number,value:string)=>{setTechniques(ts=>ts.map((t,i)=>i===index?{...t,steps:value.split('\n')}:t));setConfirmed(c=>({...c,[index]:false}));};
 const saveTechnique=(index:number)=>{
   const t=techniques[index];
   Alert.alert('Save as my usual technique?',`Save these displayed steps for ${t.procedure}? Use only reusable technique—no patient identifiers, case findings or outcomes. Future cases will still require confirmation.`,[{text:'Cancel',style:'cancel'},{text:'Approve & save',onPress:()=>guarded('Saving your technique…',async()=>{
     const p=await operativeRequest<{id:string;version:number}>('/profiles',{procedure:t.procedure,steps:t.steps,expectedVersion:t.version,approved:true});
     setTechniques(ts=>ts.map((v,i)=>i===index?{...v,profileId:p.id,version:p.version,origin:'Your approved technique'}:v));
   })}]);
 };
 const useExample=(index:number,report:string)=>guarded('Preparing a reusable technique proposal…',async()=>{
   const r=await operativeRequest<{steps:string[]}>('/profiles/suggest',{procedure:techniques[index].procedure,report});
   setTechniques(ts=>ts.map((t,i)=>i===index?{...t,steps:r.steps}:t));setConfirmed(c=>({...c,[index]:false}));setExampleFor(null);
 });
 const generate=()=>guarded('Writing and checking source support…',async()=>{
   if(!analysis)return;
   if(correction.trim())throw Error('Apply your clarification before generating so it is included.');
   const steps=techniques.flatMap((t,i)=>confirmed[i]?t.steps.filter(s=>s.trim()).map(text=>({text,procedure:t.procedure,profileId:t.profileId,version:t.version})):[]);
   const result=await operativeRequest<DraftResult>('/draft',{sessionId:analysis.id,confirmedSteps:steps,stylePreferences:useDictationStore.getState().stylePreferences});
   onComplete(result,analysis.procedures,fingerprint.current);setVisible(false);
 });
 const button=(label:string,fn:()=>void,secondary=false)=><TouchableOpacity accessibilityRole="button" disabled={!!busy} onPress={fn} style={[s.button,secondary&&s.secondary,!!busy&&{opacity:.5}]}><Text style={s.buttonText}>{label}</Text></TouchableOpacity>;
 return <>
  {button('Brief note → Full report',open)}
  <Text style={s.hint}>Paste, dictate or attach today’s brief note. Echo identifies the procedure and expands confirmed details.</Text>
  <Modal visible={visible} animationType="slide" onRequestClose={()=>{if(!busy)setVisible(false);}}>
   <SafeAreaView style={s.screen}><View style={s.top}><Text style={s.title}>Build operative report</Text>{button('Close',()=>setVisible(false),true)}</View>
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
     <Text style={s.text}>Your current case note takes precedence over every template. Confirm routine steps only if they applied to this operation.</Text>
     {!!busy&&<View style={s.card}><ActivityIndicator color="#4cc7c4"/><Text style={s.text}>{busy}</Text><Text style={s.hint}>Your case sources are retained. Keep this screen open.</Text></View>}
     {!!error&&<View style={s.card}><Text accessibilityRole="alert" style={s.error}>{error}</Text>{!analysis&&button('Retry analysis',()=>guarded('Reading your note…',()=>analyze(sources.length?sources:parts)))}</View>}
     {analysis&&<>
      <View style={s.card}><Text style={s.title}>Procedure match</Text><Text style={s.text}>{analysis.procedures.join(' + ')||'Not identified—clarify below'}</Text><Text style={s.hint}>Wrong or missing procedure? Add one clarification below; multiple procedures are supported.</Text></View>
      {analysis.review.length>0&&<View style={s.card}><Text style={s.title}>Case review</Text>{analysis.review.map((v,i)=><Text style={s.text} key={i}>• {v}</Text>)}</View>}
      {button(showFacts?'Hide case facts':`View ${analysis.facts.length} extracted facts`,()=>setShowFacts(!showFacts),true)}
      {showFacts&&analysis.facts.map(f=><View key={f.id} style={s.card}><Text style={s.label}>{f.field}: {f.value}</Text><Text style={s.hint}>Source: “{f.quote}”</Text></View>)}
      {button(showSources?'Hide source notes':'View original notes / screenshot text',()=>setShowSources(!showSources),true)}
      {showSources&&sources.filter(p=>p.sourceKind!=='historical').map(p=><View key={p.id} style={s.card}><Text style={s.label}>{p.type==='image'?'Screenshot text':p.sourceKind==='correction'?'Case clarification':'Case note'}</Text><Text selectable style={s.text}>{p.ocrText||p.content}</Text></View>)}
      <Text style={s.title}>Routine technique</Text><Text style={s.hint}>Optional. Without confirmation, Echo uses only the case note. Review, edit or omit steps; current-case exceptions always win. Do not include patient identifiers or case-specific outcomes in a reusable profile.</Text>
      {techniques.map((t,i)=><View key={`${t.procedure}-${i}`} style={s.card}>
        <Text style={s.label}>{t.procedure}</Text><Text style={s.hint}>{t.origin}{t.version?` · v${t.version}`:''}</Text>
        <TextInput accessibilityLabel={`Technique for ${t.procedure}`} editable={!busy} multiline style={s.input} value={t.steps.join('\n')} onChangeText={v=>editTechnique(i,v)} placeholder="Enter your usual sequence, wire, sheath or closure technique—one step per line." placeholderTextColor="#a4aebf"/>
        {button(confirmed[i]?'✓ These displayed steps applied to this case':'Confirm these steps applied to this case',()=>{if(!t.steps.some(s=>s.trim()))return;setConfirmed(c=>({...c,[i]:!c[i]}));},!confirmed[i])}
        {button('Save as my usual technique',()=>saveTechnique(i),true)}
        {!!savedExamples.length&&button('Propose technique from a saved example',()=>setExampleFor(exampleFor===i?null:i),true)}
        {exampleFor===i&&[...savedExamples].sort((a,b)=>Number(b.procedureType.toLowerCase().includes(t.procedure.toLowerCase()))-Number(a.procedureType.toLowerCase().includes(t.procedure.toLowerCase()))).map(e=><View key={e.id}>{button(`${e.procedureType} · ${e.timestamp.slice(0,10)}`,()=>useExample(i,e.report),true)}</View>)}
      </View>)}
      <Text style={s.title}>One clarification, if needed</Text>
      <TextInput accessibilityLabel="Case clarification" editable={!busy} multiline style={s.input} value={correction} onChangeText={setCorrection} placeholder="Clarify a conflict, correct OCR, or provide missing facts together. Example: side is left; EBL 10 mL; no complications." placeholderTextColor="#a4aebf"/>
      {!!correction.trim()&&button('Apply clarification & recheck',revise,true)}
      {button('Generate full draft',generate)}
      <Text style={s.hint}>Draft only. Nothing is finalized or emailed automatically. Remaining questions appear together at the end.</Text>
     </>}
    </ScrollView>
   </SafeAreaView>
  </Modal>
 </>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#0a1628'},top:{padding:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},body:{padding:18,paddingBottom:50,gap:12},title:{fontSize:20,fontWeight:'700',color:'#f5f7fb'},label:{fontSize:16,fontWeight:'600',color:'#f5f7fb'},text:{fontSize:16,color:'#e1e7f0',lineHeight:24},hint:{fontSize:14,color:'#afbed0',lineHeight:21,marginVertical:5},card:{backgroundColor:'#18263a',padding:16,borderRadius:14,gap:9},button:{backgroundColor:'#147b7b',padding:14,borderRadius:12,marginVertical:5},secondary:{backgroundColor:'#293c55'},buttonText:{fontSize:16,fontWeight:'600',color:'#fff',textAlign:'center'},input:{backgroundColor:'#101f33',borderWidth:1,borderColor:'#47637e',borderRadius:10,padding:14,color:'#fff',fontSize:16,minHeight:105,textAlignVertical:'top'},error:{color:'#ffb0ab',fontSize:16,lineHeight:23}});
