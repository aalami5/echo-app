// Read-only view using the already authenticated Talk RPC client. No token storage.
export function attachBrowserTasks({client,isCurrent}) {
 let all=false,collapsed=false,tasks=[],unavailable=false,busy=false,host,root,timer,selected;
 const find=(selector,parent=document)=>{const match=parent.querySelector(selector);if(match)return match;for(const e of parent.querySelectorAll('*'))if(e.shadowRoot){const nested=find(selector,e.shadowRoot);if(nested)return nested;}return null;};
 const el=(tag,text,fn)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(fn){e.type='button';e.onclick=fn;}return e;};
 const active=t=>!['completed','failed','cancelled','run_finished'].includes(t.status);
 const render=()=>{
  if(!root)return;root.replaceChildren();
  const style=el('style');style.textContent=':host{display:block;width:100%;max-width:600px;margin:12px auto;color:inherit;font:14px system-ui}button{font:inherit;color:inherit;background:transparent;border:0;min-height:44px;padding:6px 10px;cursor:pointer}header{display:flex;justify-content:space-between;border-top:1px solid #64748b55}.rows{max-height:180px;overflow:auto}.row{display:flex;justify-content:space-between;width:100%;gap:12px;text-align:left}.status{opacity:.7;font-size:12px}p{white-space:pre-wrap;overflow-wrap:anywhere}.detail{max-height:260px;overflow:auto;border-top:1px solid #64748b55;padding:8px}';root.append(style);
  const header=el('header');header.append(el('button',`${collapsed?'▸':'▾'} Tasks${unavailable?'':` · ${tasks.filter(active).length}`}`,()=>{collapsed=!collapsed;render();}),el('button',all?'Active only':'Show all',()=>{all=!all;collapsed=false;render();}));root.append(header);
  if(collapsed)return;
  if(unavailable)root.append(el('p','Status unavailable — showing last known records'));
  const rows=el('div');rows.className='rows';const shown=all?tasks:tasks.filter(active);
  if(!shown.length&&!unavailable)rows.append(el('p',all?'No task history yet':'No active tasks recorded'));
  const icons={running:'◌',waiting:'Ⅱ',queued:'◷',needs_review:'!',completed:'✓',failed:'×',cancelled:'−'};
  for(const task of shown){const b=el('button',null,()=>{selected=selected===task.id?null:task.id;render();});b.className='row';b.append(el('span',`${icons[task.status]||'?'} ${task.title}`),el('span',task.status.replaceAll('_',' ')));rows.append(b);}root.append(rows);
  const t=tasks.find(t=>t.id===selected);if(t){const detail=el('section');detail.className='detail';detail.append(el('strong',t.title),el('p',`${t.status.replaceAll('_',' ')} · ${new Date(t.updatedAt).toLocaleString()}`));for(const text of [t.goal,t.summary,t.nextStep,...(t.evidence||[]),...(t.notes||[]).map(n=>n.text)].filter(Boolean))detail.append(el('p',text));detail.append(el('p',`Task ${t.id}`));root.append(detail);}
 };
 const poll=async()=>{
  if(!isCurrent()){clearInterval(timer);host?.remove();return;}
  if(document.hidden||busy)return;
  if(!host?.isConnected){const anchor=find('.agent-chat__voice-activity');if(!anchor)return;host=el('echo-task-panel');root=host.attachShadow({mode:'open'});anchor.parentElement.insertAdjacentElement('afterend',host);}
  busy=true;try{const result=await client.request('echo.tasks.list',{});tasks=result.tasks||[];unavailable=!!result.partial;}catch{unavailable=true;}finally{busy=false;if(isCurrent())render();}
 };
 timer=setInterval(poll,4000);void poll();return ()=>{clearInterval(timer);host?.remove();};
}
