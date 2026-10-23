// Version-pinned, reversible local integration; --check never mutates the gateway.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dist='/opt/homebrew/lib/node_modules/openclaw/dist';
function replaceOnce(text,needle,replacement){
  if(text.split(needle).length!==2)throw Error('Gateway version changed: expected one integration anchor: '+needle.slice(0,75));
  return text.replace(needle,replacement);
}
function patches(){
  const outputs=[];
  const edit=(name,fn)=>{const file=path.join(dist,name),old=fs.readFileSync(file,'utf8');
    if(old.includes('// Echo spoken-recap v1'))return;
    outputs.push({file,old,next:fn(old)+'\n// Echo spoken-recap v1\n'});};
  const module=JSON.stringify(path.join(root,'gateway/voice-recap.mjs'));
  edit('talk-DLn5zMng.mjs',s=>{
    s=`import { prepareBrowserRecap as echoPrepareBrowserRecap } from ${module};\n`+s;
    s=replaceOnce(s,'const browserSessionRequest = {\n\t\t\t\tcfg: runtimeConfig,','const browserSessionRequest = {\n\t\t\t\techoVoiceSessionId: activeVoiceSessionId,\n\t\t\t\tcfg: runtimeConfig,');
    return replaceOnce(s,'\t\t\t\t\t\tvoiceSessionId,\n\t\t\t\t\t\t...clientControl ?', '\t\t\t\t\t\tvoiceSessionId,\n\t\t\t\t\t\t...(!ownsProvider && resolution.provider.id === "openai" && session.transport === "webrtc" ? { echoRecap: await echoPrepareBrowserRecap(providerInstructions, resolveAgentWorkspaceDir(runtimeConfig, agentId), voiceSessionId) } : {}),\n\t\t\t\t\t\t...clientControl ?');
  });
  edit('realtime-voice-provider-factory-DsynvJjn.mjs',s=>{
    s=`import { attachVoiceRecap as echoAttachVoiceRecap } from ${module};\n`+s;
    return replaceOnce(s,'\t\t\t\treturn bridge;','\t\t\t\techoAttachVoiceRecap(bridge, req);\n\t\t\t\treturn bridge;');
  });
  edit('realtime-quicksilver-session-BWooKpPG.mjs',s=>{
    s=replaceOnce(s,'\t\tif (req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/sdp") {',
      '\t\tif (req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() === "application/vnd.echo.recap-ready+json") {\n\t\t\tconst active = activeSessions.get(readOfferBearerToken(req));\n\t\t\treq.resume();\n\t\t\tif (!active?.echoRecap) { respondRealtimeOffer(res, 404, "Recap unavailable"); return true; }\n\t\t\tactive.echoRecap.ready();\n\t\t\trespondRealtimeOffer(res, 200, "Ready"); return true;\n\t\t}\n\t\tif (req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/sdp") {');
    return replaceOnce(s,'\t\t\t\tactive.retire = () => bridge.close();','\t\t\t\tactive.echoRecap = bridge.echoRecap;\n\t\t\t\tactive.retire = () => bridge.close();');
  });
  edit('control-ui/assets/control-ui-boot-shared-Bhb-1aO7.js',s=>{
    s='import {armBrowserRecap as echoArmBrowserRecap} from "./echo-browser-recap-v1.js";\n'+s;
    return replaceOnce(s,'this.channel=n,n.addEventListener(`open`,()=>{this.ctx.callbacks.onStatus?.(`listening`)',
      'this.channel=n,echoArmBrowserRecap({channel:n,peer:e,session:this.session,isCurrent:()=>this.isCurrentPeer(e)}),n.addEventListener(`open`,()=>{this.ctx.callbacks.onStatus?.(`listening`)');
  });
  const file=path.join(dist,'control-ui/assets/echo-browser-recap-v1.js');
  outputs.push({file,old:fs.existsSync(file)?fs.readFileSync(file,'utf8'):null,next:fs.readFileSync(path.join(root,'gateway/browser-recap.mjs'),'utf8')});
  return outputs.filter(p=>p.next!==p.old);
}
if(require.main===module){
  const outputs=patches();
  if(process.argv.includes('--check'))console.log(JSON.stringify({checked:outputs.map(p=>path.basename(p.file)),writes:0}));
  else{
    const backup=path.join(process.env.HOME,'.openclaw/backups/echo-spoken-recap-'+new Date().toISOString().replace(/[:.]/g,'-'));
    fs.mkdirSync(backup,{recursive:true,mode:0o700});
    for(const p of outputs){if(p.old!==null)fs.writeFileSync(path.join(backup,path.basename(p.file)),p.old,{mode:0o600,flag:'wx'});fs.writeFileSync(p.file,p.next);}
    fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(outputs.map(p=>({file:p.file,existed:p.old!==null,sha256:crypto.createHash('sha256').update(p.next).digest('hex')})),null,2));
    console.log(JSON.stringify({backup,changed:outputs.length}));
  }
}
module.exports={patches};
