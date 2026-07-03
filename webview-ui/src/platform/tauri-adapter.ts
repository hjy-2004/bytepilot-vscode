/**
 * Tauri desktop platform adapter — handles config, chat, tools, sessions.
 * Uses @bytepilot/core's streamChat with native tool calling.
 */
import type { IPlatformAdapter } from './types';
import type { ExtensionMessage, WebViewMessage } from '../types/ipc';
import { streamChat } from '@bytepilot/core/ai/api-client';
import type { Message } from '@bytepilot/core/ai/message-types';

// ── Tool definitions ─────────────────────────────────────────────────

const TOOLS = [
  { name:'read_file', description:'Read a file. Use startLine/endLine for large files.', parameters:{ type:'object', properties:{ path:{ type:'string', description:'File path relative to workspace' }, startLine:{ type:'number', description:'Start line (1-indexed, optional)' }, endLine:{ type:'number', description:'End line (1-indexed, optional)' } }, required:['path'] } },
  { name:'write_file', description:'Create or overwrite a file.', parameters:{ type:'object', properties:{ path:{ type:'string', description:'File path' }, content:{ type:'string', description:'Full content' } }, required:['path','content'] } },
  { name:'edit_file', description:'Exact string replacement. old_string must match once.', parameters:{ type:'object', properties:{ path:{ type:'string', description:'File path' }, old_string:{ type:'string', description:'Text to replace' }, new_string:{ type:'string', description:'Replacement' } }, required:['path','old_string','new_string'] } },
  { name:'list_directory', description:'List directory contents.', parameters:{ type:'object', properties:{ path:{ type:'string', description:'Dir path (optional)' } }, required:[] } },
  { name:'search_files', description:'Search file contents (grep).', parameters:{ type:'object', properties:{ pattern:{ type:'string', description:'Text to search' } }, required:['pattern'] } },
  { name:'execute_command', description:'Run a shell command (30s timeout).', parameters:{ type:'object', properties:{ command:{ type:'string', description:'Command' }, working_directory:{ type:'string', description:'Working dir (optional)' } }, required:['command'] } },
];

// ── Mini diff ────────────────────────────────────────────────────────

interface LocDiff { fileName:string; stats:{additions:number;deletions:number}; hunks:Array<{ oldStart:number; oldLines:number; newStart:number; newLines:number; lines:Array<{ type:'context'|'added'|'removed'; oldLineNumber?:number; newLineNumber?:number; content:string }> }> }
function mkdiff(fn:string, a:string, b:string):LocDiff|undefined {
  if(a===b) return undefined;
  const al=a.split('\n'), bl=b.split('\n'), mx=Math.max(al.length,bl.length);
  const ls:LocDiff['hunks'][0]['lines']=[]; let on=1,nn=1;
  for(let i=0;i<mx;i++){
    const o=i<al.length?al[i]:undefined, m=i<bl.length?bl[i]:undefined;
    if(o===m&&o!==undefined){ls.push({type:'context',oldLineNumber:on++,newLineNumber:nn++,content:o})}
    else{if(o!==undefined)ls.push({type:'removed',oldLineNumber:on++,content:o});if(m!==undefined)ls.push({type:'added',newLineNumber:nn++,content:m})}
  }
  return {fileName:fn,stats:{additions:bl.length-al.length,deletions:al.length-bl.length},hunks:[{oldStart:1,oldLines:al.length,newStart:1,newLines:bl.length,lines:ls}]};
}

// ── Provider presets ─────────────────────────────────────────────────

const PRESETS:Record<string,{id:string;name:string;url:string;model:string}> = {
  anthropic:{id:'anthropic',name:'Anthropic',url:'https://api.anthropic.com/v1',model:'claude-sonnet-4-6'},
  openai:{id:'openai',name:'OpenAI',url:'https://api.openai.com/v1',model:'gpt-4o'},
  deepseek:{id:'deepseek',name:'DeepSeek',url:'https://api.deepseek.com/v1',model:'deepseek-v4-pro'},
  google:{id:'google',name:'Google Gemini',url:'https://generativelanguage.googleapis.com/v1beta',model:'gemini-2.5-pro'},
  ollama:{id:'ollama',name:'Ollama',url:'http://localhost:11434/v1',model:'codellama'},
  'azure-openai':{id:'azure-openai',name:'Azure OpenAI',url:'',model:'gpt-4o'},
  moonshot:{id:'moonshot',name:'Kimi',url:'https://api.moonshot.cn/v1',model:'kimi-k2.7-code'},
  zhipu:{id:'zhipu',name:'GLM',url:'https://open.bigmodel.cn/api/paas/v4',model:'glm-5.1'},
  minimax:{id:'minimax',name:'MiniMax',url:'https://api.minimaxi.com/v1',model:'MiniMax-M2.7'},
  openrouter:{id:'openrouter',name:'OpenRouter',url:'https://openrouter.ai/api/v1',model:'openai/gpt-4o'},
  siliconflow:{id:'siliconflow',name:'SiliconFlow',url:'https://api.siliconflow.cn/v1',model:'deepseek-ai/DeepSeek-V3'},
};

// ── State ───────────────────────────────────────────────────────────

interface AppCfg { provider:string; chatModel:string; completionModel:string; baseURL:string; temperature:number; maxTokens:number; completionsEnabled:boolean; availableModels:Array<{id:string;name:string}>; initialized:boolean; displayProvider:string; }
interface ApiKey { pid:string; key:string; }
interface ProjEntry { name:string; path:string; is_dir:boolean; }

const DEF_CFG:AppCfg={provider:'anthropic',chatModel:'claude-sonnet-4-6',completionModel:'',baseURL:'https://api.anthropic.com/v1',temperature:0.7,maxTokens:4096,completionsEnabled:true,availableModels:[],initialized:true,displayProvider:'Anthropic (Desktop)'};

let cfg={...DEF_CFG};
let keys:ApiKey[]=[];
let sessions:Array<{id:string;title:string;messageCount:number;updatedAt:number}>=[];
let hist:Message[]=[];
let ac:AbortController|null=null;
let wsRoot='';
let projFiles:ProjEntry[]=[];
let rules='';

function sysPrompt():string{
  let p=`You are BytePilot, a desktop AI coding assistant. Use tools to read/write files and run commands. Be concise.\n\n## Workspace`;
  if(wsRoot){p+=`\nPath: ${wsRoot}`;if(projFiles.length>0)p+=`\n\n${projFiles.slice(0,80).map(f=>`- ${f.path}${f.is_dir?'/':''}`).join('\n')}`;if(rules)p+=`\n\n## Rules\n${rules}`}
  else p+='\n(No workspace open.)';
  return p;
}

// ── Tauri bridge ─────────────────────────────────────────────────────

let invoke:((cmd:string,args?:Record<string,unknown>)=>Promise<unknown>)|null=null;

async function initTauri(){
  const w=window as any;
  try{
    if(w.__TAURI_INTERNALS__){const i=w.__TAURI_INTERNALS__;invoke=async(c,a)=>i.invoke(c,a)}
    else{invoke=(await import('@tauri-apps/api/core')).invoke}
    if(!invoke)return;
    // Load config
    try{
      const prov=await invoke('cmd_get_config',{key:'provider'}) as string;
      console.log('[Adapter] Loaded provider from disk:',prov||'(none)');
      if(prov){cfg.provider=prov;cfg.chatModel=(await invoke('cmd_get_config',{key:'chatModel'})as string)||cfg.chatModel;cfg.baseURL=(await invoke('cmd_get_config',{key:'baseURL'})as string)||cfg.baseURL;cfg.displayProvider=prov+' (Desktop)';}
      for(const pid of Object.keys(PRESETS)){try{const k=await invoke('cmd_get_config',{key:`apikey.${pid}`})as string;if(k)keys.push({pid,key:k})}catch{}}
      if(keys.length===0){try{const k=await invoke('cmd_get_config',{key:'apikey._last'})as string;if(k)keys.push({pid:cfg.provider,key:k})}catch{}}
      console.log(`[Adapter] Config loaded: ${cfg.provider}/${cfg.chatModel}, ${keys.length} keys`);
    }catch(e){console.error('[Adapter] Config load error:',e)}
  }catch(e){console.log('[Adapter] No Rust backend:',e)}
}

async function ensureInvoke():Promise<boolean>{if(invoke)return true;await initTauri();return!!invoke}

async function saveCfg(){
  if(!await ensureInvoke()){console.warn('[Adapter] Cannot save: no Rust backend');return}
  try{
    await invoke!('cmd_set_config',{key:'provider',value:cfg.provider});
    await invoke!('cmd_set_config',{key:'chatModel',value:cfg.chatModel});
    await invoke!('cmd_set_config',{key:'baseURL',value:cfg.baseURL});
    console.log('[Adapter] Config saved:',cfg.provider,cfg.chatModel);
  }catch(e){console.error('[Adapter] Save error:',e)}
}

async function saveKey(pid:string,key:string){
  if(!await ensureInvoke())return;
  try{await invoke!('cmd_set_config',{key:`apikey.${pid}`,value:key});await invoke!('cmd_set_config',{key:'apikey._last',value:key});console.log('[Adapter] Key saved for',pid)}catch(e){console.error('[Adapter] Key save error:',e)}
}

// ── Workspace ────────────────────────────────────────────────────────

async function loadWS(){
  if(!invoke)return;
  try{wsRoot=(await invoke('cmd_get_workspace'))as string;const s=await invoke('cmd_scan_project')as{files:ProjEntry[]};projFiles=s.files||[];const r=await invoke('cmd_read_rules')as string|null;rules=r||''}catch{}
}

async function pickWS(){
  if(!await ensureInvoke()){alert('Folder picker requires the desktop app.');return}
  try{const f=await invoke!('cmd_pick_folder')as string|null;if(f){await invoke!('cmd_set_workspace',{path:f});wsRoot=f;await loadWS();hist=[];if(h)h({type:'context.update',payload:{openFiles:[],projectFiles:projFiles.length,diagnosticsCount:0,hasRules:!!rules,workspaceRoot:wsRoot}})}}
  catch(e:any){alert('Failed: '+(e?.message||e))}
}

// ── Tools ────────────────────────────────────────────────────────────

async function execTool(name:string,args:Record<string,string>):Promise<string>{
  if(!invoke)return 'Error: No workspace.';
  try{
    switch(name){
      case'read_file':{const p=args.path||args.filePath||'';if(!p)return'Error: path required.';let c=await invoke('cmd_read_file_workspace',{relativePath:p})as string;const sl=parseInt(args.startLine||'0'),el=parseInt(args.endLine||'0');if(sl&&el){const ls=c.split('\n');c=ls.slice(sl-1,el).join('\n');return`(L${sl}-${el}/${ls.length})\n${c}`}return c.length>50000?c.substring(0,50000)+`\n...(truncated ${c.length} chars)`:c;}
      case'write_file':{const p=args.path||args.filePath||'',c=args.content||'';if(!p)return'Error: path required.';await invoke('cmd_write_file_workspace',{relativePath:p,content:c});return`Wrote ${c.split('\n').length} lines to "${p}".`;}
      case'edit_file':{const p=args.path||args.filePath||'',o=args.old_string||args.oldString||'',n=args.new_string||args.newString||'';if(!p||!o)return'Error: path and old_string required.';const orig=await invoke('cmd_read_file_workspace',{relativePath:p})as string;const nor=(s:string)=>s.replace(/\r\n/g,'\n').replace(/\r/g,'\n');const no=nor(orig),noo=nor(o);let idx=orig.indexOf(o);if(idx===-1)idx=no.indexOf(noo);if(idx===-1){const fl=noo.split('\n')[0]||'';let hnt='';for(const l of no.split('\n')){if(l.trim()&&l.includes(fl.trim().substring(0,10))){hnt=` Did you mean: "${l.trim().substring(0,80)}"?`;break}}return`Error: old_string not found.${hnt}`}const al=noo.length;if(no.substring(idx+al).includes(noo))return'Error: old_string matches multiple locations.';const crlf=orig.includes('\r\n');const ed=no.substring(0,idx)+nor(n)+no.substring(idx+al);const fin=crlf?ed.replace(/\n/g,'\r\n'):ed;await invoke('cmd_write_file_workspace',{relativePath:p,content:fin});const cl=(fin.match(/\n/g)||[]).length-(orig.match(/\n/g)||[]).length;return`Edited "${p}": ${o.length}→${n.length} chars${cl!==0?` (${cl>0?'+':''}${cl} lines)`:''}.`;}
      case'list_directory':{const d=args.path||args.directoryPath||'';const e=await invoke('cmd_list_dir_workspace',{relativePath:d||null})as Array<[string,boolean]>;return e.length===0?'(empty)':e.map(([n,d])=>`${d?'📁':'📄'} ${n}${d?'/':''}`).join('\n');}
      case'search_files':{const p=args.pattern||'';if(!p)return'Error: pattern required.';const r=await invoke('cmd_search_content',{pattern:p,maxResults:20})as string[];return r.join('\n');}
      case'execute_command':{const c=args.command||'',wd=args.working_directory||args.workingDirectory||wsRoot;if(!c)return'Error: command required.';if(/rm\s+-rf\s+\/|sudo\s+rm|>\/dev\/sd/.test(c))return'Blocked.';const r=await invoke('cmd_execute_command',{command:c,cwd:wd,timeoutMs:30000})as{stdout:string;stderr:string;exit_code:number;killed:boolean};if(r.killed)return`Timed out.\n${r.stdout}`;return[r.stdout,r.stderr?'\n[stderr]\n'+r.stderr:''].filter(Boolean).join('').substring(0,5000)||'(no output)';}
      default:return`Unknown tool: ${name}`;
    }
  }catch(e:any){return`Error: ${e?.message||e}`}
}

// ── Adapter ──────────────────────────────────────────────────────────

let h:((m:ExtensionMessage)=>void)|null=null;
let inited=false;

export const tauriAdapter:IPlatformAdapter={
  postMessage(msg:WebViewMessage):void{
    console.log('[Adapter]',msg.type);
    switch(msg.type){
      case'config.get':if(inited)sendCfg();break; // Only respond AFTER initTauri loaded config
      case'config.set':{const p=(msg as any).payload||{};if(p.provider){const pr=PRESETS[p.provider];cfg.provider=p.provider;cfg.chatModel=p.chatModel||pr?.model||cfg.chatModel;cfg.baseURL=p.baseURL!==undefined?p.baseURL:(pr?.url||cfg.baseURL)}else if(p.chatModel)cfg.chatModel=p.chatModel;if(p.baseURL!==undefined)cfg.baseURL=p.baseURL;cfg.displayProvider=cfg.provider+' (Desktop)';saveCfg();if(h)h({type:'config.state',payload:{...cfg}});break;}
      case'config.setKey':{const pk=(msg as any).payload||{};const ex=keys.find(k=>k.pid===pk.providerId);if(ex)ex.key=pk.apiKey;else keys.push({pid:pk.providerId,key:pk.apiKey});saveKey(pk.providerId,pk.apiKey);break;}
      case'models.fetch':(async()=>{const k=keys.find(x=>x.pid===cfg.provider)?.key||'';try{const r=await fetch(`${cfg.baseURL.replace(/\/+$/,'')}/models`,{headers:k?{Authorization:`Bearer ${k}`}:{},signal:AbortSignal.timeout(10000)});if(r.ok){const d=await r.json()as any;const list=(d.data||d.models||[]).map((m:any)=>({id:m.id||m.name?.replace('models/','')||'',name:m.name||m.id||''})).filter((m:any)=>m.id);if(h)h({type:'models.list',payload:{models:list,sourceUrl:cfg.baseURL}})}}catch{}})();break;
      case'session.list':if(h)h({type:'session.list',payload:{sessions}});break;
      case'session.create':{const id=`d-${Date.now()}`;sessions.push({id,title:'New Chat',messageCount:0,updatedAt:Date.now()});if(h)h({type:'session.list',payload:{sessions}});break;}
      case'session.delete':{const sid=(msg as any).payload?.sessionId;if(sid)sessions=sessions.filter(s=>s.id!==sid);if(h)h({type:'session.list',payload:{sessions}});break;}
      case'chat.send':doChat((msg as any).payload?.content||'');break;
      case'chat.cancel':ac?.abort();ac=null;break;
      case'chat.clear':hist=[];if(h)h({type:'chat.clear'}as ExtensionMessage);break;
      case'context.refresh':loadWS();break;
      default:if((msg as any).type==='workspace.pick')pickWS();break;
    }
  },
  onMessage(handler:(m:ExtensionMessage)=>void):()=>void{
    h=handler;
    (async()=>{await initTauri();if(h===handler)sendInit(handler)})();
    return()=>{h=null};
  },
};

function enqueue(){if(h)sendInit(h)}
function sendInit(dest:(m:ExtensionMessage)=>void){
  if(inited)return;inited=true;
  sendCfg();
  dest({type:'session.list',payload:{sessions}});
  dest({type:'chat.state',payload:{messages:[]}});
  loadWS().then(()=>{if(dest===h)dest({type:'context.update',payload:{openFiles:[],projectFiles:projFiles.length,diagnosticsCount:0,hasRules:!!rules,workspaceRoot:wsRoot}})});
}
function sendCfg(){if(h)h({type:'config.state',payload:{...cfg}})}

// ── Chat ─────────────────────────────────────────────────────────────

async function doChat(content:string){
  if(!h)return;
  const key=keys.find(k=>k.pid===cfg.provider)?.key||'';
  if(!key&&cfg.provider!=='ollama'){h({type:'chat.error',payload:{message:'No API key configured.',code:'NO_API_KEY'}}as ExtensionMessage);return}
  hist.push({role:'user',content});
  h({type:'chat.started',payload:{}}as ExtensionMessage);
  ac=new AbortController();
  try{
    for(let t=0;t<5;t++){
      const msgs:Message[]=[{role:'system',content:sysPrompt()},...hist];
      let txt='';
      const res=await streamChat({apiKey:key,baseURL:cfg.baseURL,model:cfg.chatModel,maxTokens:cfg.maxTokens||4096,thinkingBudget:0,provider:cfg.provider},msgs,TOOLS,(tok)=>{txt+=tok;h!({type:'chat.token',payload:{text:tok}}as ExtensionMessage)},ac.signal);
      if(!res.toolCalls?.length){hist.push({role:'assistant',content:txt});h({type:'chat.done',payload:{usage:res.usage||{inputTokens:0,outputTokens:0}}}as ExtensionMessage);return}
      for(const tc of res.toolCalls){
        const tid=tc.id||`${Date.now()}-${Math.random()}`;
        const dn=tc.name.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
        const args=tc.args as Record<string,string>;
        h({type:'chat.toolCall',payload:{id:tid,name:tc.name,displayName:dn,args,needsApproval:false}}as ExtensionMessage);
        let diff:LocDiff|undefined;
        if((tc.name==='write_file'||tc.name==='edit_file')&&args.path){try{const orig=await invoke?.('cmd_read_file_workspace',{relativePath:args.path})as string;const r=await execTool(tc.name,args);const nc=await invoke?.('cmd_read_file_workspace',{relativePath:args.path})as string;diff=mkdiff(args.path,orig||'',nc||'');h({type:'chat.toolResult',payload:{id:tid,name:tc.name,result:r,success:!r.startsWith('Error'),diff:diff as any}}as ExtensionMessage);continue}catch{}}
        const r=await execTool(tc.name,args);
        h({type:'chat.toolResult',payload:{id:tid,name:tc.name,result:r,success:!r.startsWith('Error')}}as ExtensionMessage);
      }
      const tms:Message[]=res.toolCalls.map(tc=>({role:'tool'as const,content:'',toolCallId:tc.id||Date.now().toString()}));
      hist.push({role:'assistant',content:txt,toolCalls:res.toolCalls},...tms);
    }
  }catch(err:any){if(err?.name==='AbortError')return;h({type:'chat.error',payload:{message:err?.message||'Unknown error',code:'CHAT_ERROR'}}as ExtensionMessage)}
  finally{ac=null;h({type:'chat.done',payload:{usage:{inputTokens:0,outputTokens:0}}}as ExtensionMessage)}
}
