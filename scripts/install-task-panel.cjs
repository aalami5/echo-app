// Version-checked, reversible browser integration. --check never writes.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const dist='/opt/homebrew/lib/node_modules/openclaw/dist/control-ui/assets';
const file=path.join(dist,'control-ui-boot-shared-Bhb-1aO7.js'),old=fs.readFileSync(file,'utf8');
const anchor='this.channel=n,echoArmBrowserRecap({channel:n,peer:e,session:this.session,isCurrent:()=>this.isCurrentPeer(e)}),';
let next=old;
if(!old.includes('// Echo tasks v1')){if(old.split(anchor).length!==2)throw Error('Browser version changed; inspect integration anchor');next='import {attachBrowserTasks as echoAttachTasks} from "./echo-browser-tasks-v1.js";\n'+old.replace(anchor,anchor+'echoAttachTasks({client:this.ctx.client,isCurrent:()=>this.isCurrentPeer(e)}),')+'\n// Echo tasks v1\n';}
if(process.argv.includes('--check')){console.log('Browser integration anchor verified');process.exit(0);}
const backup=path.join(process.env.HOME,'.openclaw/backups/echo-tasks-'+Date.now());fs.mkdirSync(backup,{recursive:true,mode:0o700});
for(const [target,content] of [[file,next],[path.join(dist,'echo-browser-tasks-v1.js'),fs.readFileSync(path.resolve(__dirname,'../gateway/browser-tasks.mjs'),'utf8')]]){
 for(const suffix of ['', '.gz','.br'])if(fs.existsSync(target+suffix))fs.copyFileSync(target+suffix,path.join(backup,path.basename(target)+suffix));
 fs.writeFileSync(target,content);fs.writeFileSync(target+'.gz',zlib.gzipSync(content));fs.writeFileSync(target+'.br',zlib.brotliCompressSync(content));
}
console.log(JSON.stringify({backup,browserIntegration:true}));
