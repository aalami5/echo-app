// Encrypted, resumable jobs. A lost HTTP response must not repeat model work.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {AsyncLocalStorage} = require('node:async_hooks');
const {readClinical, preserveAndWrite} = require('./clinical-preservation');
const jobContext = new AsyncLocalStorage();

function installJobs(router, {dataDir, handlers, cacheVersion, maxActive=2}) {
  const dir = path.join(dataDir, 'operative-jobs');
  fs.mkdirSync(dir, {recursive:true, mode:0o700});
  const active = new Map();
  const file = id => path.join(dir, `${id}.json`);
  const save = job => preserveAndWrite(file(job.id), job);
  const publicJob = job => ({id:job.id, status:job.status, stage:job.stage,
    createdAt:job.createdAt, updatedAt:job.updatedAt,
    ...(job.status==='completed'?{result:job.result}:{}),
    ...(job.status==='failed'?{error:job.error}:{})});
  const read = id => {
    const job = active.get(id) || (fs.existsSync(file(id)) ? readClinical(file(id)) : null);
    if (job?.status==='running' && !active.has(id)) {
      job.status='failed'; job.error='The report service restarted. Retry to resume from your saved notes.';
      job.updatedAt=new Date().toISOString(); save(job);
    }
    return job;
  };
  router.post('/jobs', (req,res) => {
    try {
      const {operation,input,retry=false}=req.body||{};
      if (!handlers[operation] || !['/ocr','/analyze','/draft','/compose','/profiles/suggest'].includes(operation) || !input || typeof input!=='object' || Array.isArray(input))
        return res.status(400).json({error:'Invalid report operation.'});
      const id=crypto.createHash('sha256').update(JSON.stringify([cacheVersion(),operation,input])).digest('hex');
      const old=read(id);
      if(old && (old.status!=='failed'||!retry)) return res.status(old.status==='running'?202:200).json(publicJob(old));
      if(active.size>=maxActive) return res.status(429).json({error:'Two reports are already processing. Please retry shortly; your notes are saved.'});
      const now=new Date().toISOString();
      const job={id,operation,status:'running',stage:'starting',createdAt:now,updatedAt:now};
      save(job); active.set(id,job);
      // Persist before acknowledging. Results remain available across app/server restarts.
      res.status(202).json(publicJob(job));
      const update=stage=>{job.stage=stage;job.updatedAt=new Date().toISOString();save(job);};
      jobContext.run({update},async()=>{
        try {
          let result;
          await handlers[operation]({body:input},{json:value=>{result=value;}});
          if(result===undefined) throw new Error('Missing job result');
          job.status='completed';job.stage='complete';job.result=result;
        } catch(e) {
          job.status='failed';job.error=e.status?e.message:'Drafting could not complete. Your saved case is unchanged. Please retry.';
        } finally {
          job.updatedAt=new Date().toISOString();
          try {save(job);} catch {job.status='failed';delete job.result;job.error='Unable to save the draft securely. Your original notes are unchanged.';}
          active.delete(id);
        }
      }).catch(()=>{});
    } catch {res.status(500).json({error:'Unable to open a saved report job. Your notes are unchanged.'});}
  });
  router.get('/jobs/:id', (req,res)=>{
    try {
      if(!/^[a-f0-9]{64}$/.test(req.params.id)) return res.status(400).json({error:'Invalid report job.'});
      const job=read(req.params.id);
      if(!job)return res.status(404).json({error:'Report job not found. Retry using your saved notes.'});
      res.json(publicJob(job));
    }catch{res.status(500).json({error:'Unable to read the saved job securely.'});}
  });
}
module.exports={installJobs,jobContext};
