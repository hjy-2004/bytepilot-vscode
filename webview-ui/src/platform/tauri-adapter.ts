/**
 * Tauri desktop platform adapter — handles config, chat, tools, sessions.
 * Uses @bytepilot/core's runAgentLoop with native tool calling.
 */
import type { IPlatformAdapter } from './types';
import type { ExtensionMessage, WebViewMessage } from '../types/ipc';
import { runAgentLoop, type AgentCallbacks } from '@bytepilot/core/ai/agent-loop';
import type { Message } from '@bytepilot/core/ai/message-types';
import { generateEnvBlock } from '@bytepilot/core/config/settings-manager';
import { getProviderPreset, detectApiFormat } from '@bytepilot/core/config/provider-presets';
import { parseClaudeConfig, stripAnsi, KNOWN_CONFIG_PATHS, resolveImportBaseURL } from '@bytepilot/core/config/importer';
import { check } from '@tauri-apps/plugin-updater';

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

// ── State ───────────────────────────────────────────────────────────

interface AppCfg { provider:string; chatModel:string; completionModel:string; baseURL:string; temperature:number; maxTokens:number; completionsEnabled:boolean; availableModels:Array<{id:string;name:string}>; initialized:boolean; displayProvider:string; }
interface ApiKey { pid:string; key:string; }
interface ProjEntry { name:string; path:string; is_dir:boolean; }

const DEF_CFG:AppCfg={provider:'',chatModel:'',completionModel:'',baseURL:'',temperature:0.7,maxTokens:4096,completionsEnabled:true,availableModels:[],initialized:false,displayProvider:''};

let cfg={...DEF_CFG};
let keys:ApiKey[]=[];
let sessions:Array<{id:string;title:string;messageCount:number;updatedAt:number}>=[];
let hist:Message[]=[];
let ac:AbortController|null=null;
let wsRoot='';
let projFiles:ProjEntry[]=[];
let rules='';
let sessionId='default';

async function saveChat(){
  if(!invoke)return;
  if(!wsRoot){console.warn('[Adapter] saveChat skipped: no workspace');return}
  try{
    const msgs=hist.map(m=>({role:m.role,content:m.content,tool_calls:m.toolCalls||null,tool_call_id:m.toolCallId||null}));
    await invoke('cmd_save_chat',{workspace:wsRoot,sessionId,messages:msgs});
    console.log(`[Adapter] Chat saved: ${sessionId}, ${msgs.length} msgs`);
    // Update session list
    const sid=sessionId;
    const ex=sessions.find(s=>s.id===sid);
    if(ex){ex.messageCount=msgs.length;ex.updatedAt=Date.now();ex.title=msgs.find(m=>m.role==='user')?.content?.substring(0,30)||'New Chat'}
    else{sessions.unshift({id:sid,title:msgs.find(m=>m.role==='user')?.content?.substring(0,30)||'New Chat',messageCount:msgs.length,updatedAt:Date.now()})}
    if(h)h({type:'session.list',payload:{sessions}});
  }catch(e){console.error('[Adapter] saveChat failed:',e)}
}

async function loadChat(){
  if(!invoke)return;
  try{
    if(!wsRoot)return;
    const data=await invoke('cmd_load_chat',{workspace:wsRoot,sessionId})as{messages:Array<{role:string;content:string;tool_calls?:any;tool_call_id?:string}>};
    if(data.messages?.length>0){
      // Load raw messages into hist for agent-loop compatibility
      hist=data.messages.map(m=>({role:m.role as Message['role'],content:m.content,toolCalls:m.tool_calls||undefined,toolCallId:m.tool_call_id||undefined}));
      // Build restore payload: pair tool calls with their results
      const toolResults=new Map<string,{result:string;success:boolean}>();
      for(const m of data.messages){
        if(m.role==='tool'&&m.tool_call_id&&typeof m.content==='string')
          toolResults.set(m.tool_call_id,{result:m.content,success:!m.content.startsWith('Error')});
      }
      const restored=data.messages
        .filter(m=>m.role==='user'||m.role==='assistant')
        .filter(m=>m.content!=null)
        .map(m=>{
          const tcs=(m.tool_calls as any[]|undefined)?.map(tc=>{
            const tr=toolResults.get(tc.id||tc.toolCallId);
            return{...tc,displayName:(tc.name||'').replace(/_/g,' '),result:tr?.result,success:tr?.success,status:(tr?'done':'error')as 'done'|'error'};
          })||[];
          return{id:crypto.randomUUID?.()||`r-${Date.now()}`,role:m.role as'user'|'assistant',content:typeof m.content==='string'?m.content:'',timestamp:Date.now(),toolCalls:tcs};
        });
      if(h)h({type:'chat.state',payload:{messages:restored}}as ExtensionMessage);
    }
  }catch(e){console.log('[Adapter] No saved chat to restore')}
}

async function listChatSessions(){
  if(!invoke)return;
  if(!wsRoot)return;
  try{const list=await invoke('cmd_list_sessions',{workspace:wsRoot})as Array<{id:string;title:string;message_count:number;updated_at:number}>;sessions=list.map(s=>({id:s.id,title:s.title||`Chat ${s.id.slice(0,8)}`,messageCount:s.message_count,updatedAt:s.updated_at}));if(h)h({type:'session.list',payload:{sessions}})}catch{}
}

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
    // Load config from ~/.bytepilot/settings.json (shared with VS Code extension)
    try{
      const prov=await invoke('cmd_get_config',{key:'provider'}) as string;
      console.log('[Adapter] Loaded provider from disk:',prov||'(none)');
      if(prov){
        cfg.provider=prov;
        cfg.chatModel=(await invoke('cmd_get_config',{key:'chatModel'})as string)||cfg.chatModel;
        cfg.baseURL=(await invoke('cmd_get_config',{key:'baseURL'})as string)||cfg.baseURL;
        const displayName = getProviderPreset(prov)?.name || prov;
        cfg.displayProvider=displayName+' (Desktop)';
        cfg.initialized=true;
      }
      // Load API key from settings.json env block (same source as VS Code extension)
      if(cfg.provider){try{const k=await invoke('cmd_get_config',{key:'apiKey'})as string;if(k)keys.push({pid:cfg.provider,key:k})}catch{}}
      // Also try the generic "apikey._last" key for backward compat
      if(keys.length===0){try{const k=await invoke('cmd_get_config',{key:'apikey._last'})as string;if(k)keys.push({pid:cfg.provider,key:k})}catch{}}
      console.log(`[Adapter] Config loaded: ${cfg.provider}/${cfg.chatModel}, ${keys.length} keys`);
    }catch(e){console.error('[Adapter] Config load error:',e)}
  }catch(e){console.log('[Adapter] No Rust backend:',e)}
}

async function ensureInvoke():Promise<boolean>{if(invoke)return true;await initTauri();return!!invoke}

let saveCfgTimer:ReturnType<typeof setTimeout>|undefined;
async function saveCfg(){
  // Debounce: rapid successive calls (e.g. config.set + config.setKey) only trigger one save
  if(saveCfgTimer)clearTimeout(saveCfgTimer);
  return new Promise<void>((resolve)=>{
    saveCfgTimer=setTimeout(async()=>{
      saveCfgTimer=undefined;
      if(!await ensureInvoke()){console.warn('[Adapter] Cannot save: no Rust backend');resolve();return}
      try{
    await invoke!('cmd_set_config',{key:'provider',value:cfg.provider});
    await invoke!('cmd_set_config',{key:'chatModel',value:cfg.chatModel});
    await invoke!('cmd_set_config',{key:'baseURL',value:cfg.baseURL});

    // Build settings using the same logic as the VS Code extension (from @bytepilot/core)
    const preset = getProviderPreset(cfg.provider);
    const apiKey = keys.find(k => k.pid === cfg.provider)?.key || '';
    const baseUrl = cfg.baseURL || preset?.baseURL || '';
    const apiFormat = detectApiFormat(cfg.provider, baseUrl);
    const env = generateEnvBlock(
      cfg.provider,
      baseUrl,
      apiKey,
      cfg.chatModel,
      cfg.completionModel || cfg.chatModel,
    );

    await invoke!('cmd_sync_provider', {
      provider: cfg.provider,
      providerName: preset?.name || cfg.provider,
      apiFormat,
      baseUrl,
      chatModel: cfg.chatModel,
      completionModel: cfg.completionModel || cfg.chatModel,
      env,
    });

    console.log('[Adapter] Config saved:',cfg.provider,cfg.chatModel,apiFormat);
  }catch(e){console.error('[Adapter] Save error:',e)}
      resolve();
    }, 100);
  });
}

// ── Workspace ────────────────────────────────────────────────────────

async function loadWS(){
  if(!invoke)return;
  try{wsRoot=(await invoke('cmd_get_workspace'))as string;const s=await invoke('cmd_scan_project')as{files:ProjEntry[]};projFiles=s.files||[];const r=await invoke('cmd_read_rules')as string|null;rules=r||''}catch{}
}

async function pickWS(){
  if(!await ensureInvoke()){alert('Folder picker requires the desktop app.');return}
  try{const f=await invoke!('cmd_pick_folder')as string|null;if(f){await invoke!('cmd_set_workspace',{path:f});wsRoot=f;await loadWS();hist=[];sessionId='default';await listChatSessions();if(h)h({type:'context.update',payload:{openFiles:[],projectFiles:projFiles.length,diagnosticsCount:0,hasRules:!!rules,workspaceRoot:wsRoot}})}}
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
      case'config.set':{const p=(msg as any).payload||{};if(p.provider){const pr=getProviderPreset(p.provider);cfg.provider=p.provider;cfg.chatModel=p.chatModel||pr?.defaultChatModel||cfg.chatModel;cfg.baseURL=p.baseURL!==undefined?p.baseURL:(pr?.baseURL||cfg.baseURL);if(invoke&&!keys.find(k=>k.pid===p.provider)){invoke('cmd_get_config',{key:'apiKey'}).then((k:any)=>{if(k&&typeof k==='string'&&k.trim())keys.push({pid:p.provider,key:k.trim()});}).catch(()=>{})}}else if(p.chatModel)cfg.chatModel=p.chatModel;if(p.baseURL!==undefined)cfg.baseURL=p.baseURL;const displayName=getProviderPreset(cfg.provider)?.name||cfg.provider;cfg.displayProvider=displayName+' (Desktop)';saveCfg();if(h)h({type:'config.state',payload:{...cfg}});break;}
      case'config.setKey':{const pk=(msg as any).payload||{};const ex=keys.find(k=>k.pid===pk.providerId);if(ex)ex.key=pk.apiKey;else keys.push({pid:pk.providerId,key:pk.apiKey});saveCfg();break;}
      case'models.fetch':(async()=>{const k=keys.find(x=>x.pid===cfg.provider)?.key||'';try{const r=await fetch(`${cfg.baseURL.replace(/\/+$/,'')}/models`,{headers:k?{Authorization:`Bearer ${k}`}:{},signal:AbortSignal.timeout(10000)});if(r.ok){const d=await r.json()as any;const list=(d.data||d.models||[]).map((m:any)=>({id:m.id||m.name?.replace('models/','')||'',name:m.name||m.id||''})).filter((m:any)=>m.id);if(h)h({type:'models.list',payload:{models:list,sourceUrl:cfg.baseURL}})}}catch{}})();break;
      case'config.scan':scanConfigs();break;
      case'config.import':pickConfigFile();break;
      case'config.importSpecific':importFromPayload((msg as any).payload);break;
      case'config.manualSetup':enterManualMode();break;
      case'session.list':listChatSessions();break;
      case'session.create':{const id=(globalThis.crypto?.randomUUID?.()||`s-${Date.now()}`);sessionId=id;hist=[];saveChat();sessions.unshift({id,title:'New Chat',messageCount:0,updatedAt:Date.now()});if(h)h({type:'session.list',payload:{sessions}});break;}
      case'session.switch':{const sid=(msg as any).payload?.sessionId;if(sid){sessionId=sid;hist=[];loadChat();}break;}
      case'session.delete':{const sid=(msg as any).payload?.sessionId;if(sid){sessions=sessions.filter(s=>s.id!==sid);if(wsRoot)invoke?.('cmd_delete_session',{workspace:wsRoot,sessionId:sid});if(sid===sessionId){const next=sessions[0];if(next){sessionId=next.id;hist=[];loadChat();}else{sessionId='default';hist=[];if(h)h({type:'chat.clear'}as ExtensionMessage);}}if(h)h({type:'session.list',payload:{sessions}})}break;}
      case'chat.send':doChat((msg as any).payload?.content||'');break;
      case'chat.cancel':ac?.abort();ac=null;break;
      case'chat.clear':hist=[];if(h)h({type:'chat.clear'}as ExtensionMessage);break;
      case'context.refresh':loadWS();break;
      case'update.download':downloadAndInstallUpdate();break;
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

let pendingUpdate: Awaited<ReturnType<typeof check>> = null;
let downloadingUpdate = false;

async function checkForUpdate(){
  try{
    pendingUpdate=await check();
    if(pendingUpdate&&h){
      h({type:'update.available',payload:{version:pendingUpdate.version,currentVersion:pendingUpdate.currentVersion,date:pendingUpdate.date,body:pendingUpdate.body,status:'available'}}as ExtensionMessage);
    }
  }catch(e){console.error('[Adapter] checkForUpdate failed:',e)}
}

const PROXY_LIST=[
  'https://gh-proxy.org/',
  'https://v4.gh-proxy.org/',
  'https://cdn.gh-proxy.org/',
];

async function downloadAndInstallUpdate(){
  if(!pendingUpdate||!h||downloadingUpdate)return;
  downloadingUpdate=true;
  const version=pendingUpdate.version;
  const filename=`BytePilot_${version}_x64_en-US.msi`;
  const githubUrl=`https://github.com/hjy-2004/bytepilot-vscode/releases/download/v${version}/${filename}`;
  const urls=[...PROXY_LIST.map(p=>p+githubUrl),githubUrl];
  let lastError='';
  try{
    for(const url of urls){
      try{
        console.log('[Adapter] Trying download:',url);
        const resp=await fetch(url,{signal:AbortSignal.timeout(300000)});
        if(!resp.ok){lastError=`HTTP ${resp.status}`;continue}
        const total=Number(resp.headers.get('content-length')||'0');
        const reader=resp.body!.getReader();
        const chunks:Uint8Array[]=[];
        let downloaded=0;
        h({type:'update.download-progress',payload:{downloaded:0,total:total||null}}as ExtensionMessage);
        while(true){
          const{value,done}=await reader.read();
          if(done)break;
          chunks.push(value);
          downloaded+=value.length;
          h({type:'update.download-progress',payload:{downloaded,total:total||null}}as ExtensionMessage);
        }
        // Combine chunks
        const buf=new Uint8Array(downloaded);
        let pos=0;
        for(const c of chunks){buf.set(c,pos);pos+=c.length}
        // Save to temp and install
        const tmpDir=await invoke('cmd_get_temp_dir')as string;
        const tmpFile=`${tmpDir}\\${filename}`;
        // Convert to base64 in chunks to avoid stack overflow on large files
        const CHUNK=0x8000;let b64='';
        for(let i=0;i<buf.length;i+=CHUNK){b64+=btoa(String.fromCharCode(...buf.subarray(i,i+CHUNK)))}
        await invoke('cmd_write_file_base64',{path:tmpFile,content:b64});
        h({type:'update.download-progress',payload:{downloaded:total||downloaded,total:total||downloaded}}as ExtensionMessage);
        // Install silently
        await invoke('cmd_execute_command',{command:`msiexec /i "${tmpFile}" /passive /norestart`,cwd:tmpDir,timeoutMs:120000});
        // Clean up temp file (best-effort)
        try{await invoke('cmd_remove_file_absolute',{path:tmpFile})}catch{}
        await new Promise(r=>setTimeout(r,1500));
        h({type:'update.done',payload:{success:true}}as ExtensionMessage);
        pendingUpdate=null;
        downloadingUpdate=false;
        return;
      }catch(e:any){
        lastError=e?.message||'Unknown';
        console.log('[Adapter] Mirror failed:',url,lastError);
      }
    }
    throw new Error(lastError||'All mirrors failed');
  }catch(e:any){
    downloadingUpdate=false;
    const msg=e?.message||e?.toString?.()||'Unknown error';
    console.error('[Adapter] Update download/install failed:',e);
    h({type:'update.done',payload:{success:false,error:msg}}as ExtensionMessage);
  }
}
function sendInit(dest:(m:ExtensionMessage)=>void){
  if(inited)return;inited=true;
  sendCfg();
  checkForUpdate();
  // loadWorkspace FIRST, then load chat + session list (both need wsRoot)
  loadWS().then(()=>{
    if(dest===h)dest({type:'context.update',payload:{openFiles:[],projectFiles:projFiles.length,diagnosticsCount:0,hasRules:!!rules,workspaceRoot:wsRoot}});
    return loadChat();
  }).then(()=>listChatSessions());
}
function sendCfg(){if(h)h({type:'config.state',payload:{...cfg}})}

// ── Config import helpers ─────────────────────────────────────────────

async function readHomeFile(relativePath: string): Promise<string | null> {
  if (!invoke) return null;
  try { return await invoke('cmd_read_home_file', { relativePath }) as string; }
  catch { return null; }
}

async function homeFileExists(relativePath: string): Promise<boolean> {
  if (!invoke) return false;
  try { return await invoke('cmd_home_file_exists', { relativePath }) as boolean; }
  catch { return false; }
}

async function scanConfigs() {
  if (!h) return;
  const found: Array<{ source: string; sourcePath: string; provider: string; chatModel?: string; baseURL?: string; hasApiKey: boolean }> = [];

  if (invoke) {
    // Scan known config locations using shared paths from @bytepilot/core
    for (const relPath of KNOWN_CONFIG_PATHS) {
      if (await homeFileExists(relPath)) {
        const content = await readHomeFile(relPath);
        if (content) {
          const parsed = parseClaudeConfig(content);
          if (parsed) {
            found.push({
              source: parsed.source,
              sourcePath: relPath,
              provider: parsed.provider,
              chatModel: parsed.chatModel,
              baseURL: parsed.baseURL,
              hasApiKey: !!parsed.apiKey,
            });
          }
        }
      }
    }

    // Also check existing BytePilot config
    try {
      const prov = await invoke('cmd_get_config', { key: 'provider' }) as string;
      if (prov && !found.some(f => f.source === 'BytePilot (saved)')) {
        const chatModel = await invoke('cmd_get_config', { key: 'chatModel' }) as string;
        const baseURL = await invoke('cmd_get_config', { key: 'baseURL' }) as string;
        const key = keys.find(k => k.pid === prov)?.key;
        found.push({
          source: 'BytePilot (saved)',
          sourcePath: '~/.bytepilot/settings.json',
          provider: prov,
          chatModel: chatModel || undefined,
          baseURL: baseURL || undefined,
          hasApiKey: !!key,
        });
      }
    } catch { /* ignore */ }
  }

  h({ type: 'config.found', payload: { configs: found } });
}

async function importFromPayload(payload: { provider?: string; chatModel?: string; baseURL?: string; apiKey?: string; sourcePath?: string }) {
  if (!h) return;
  if (payload.provider) {
    cfg.provider = payload.provider;
    cfg.chatModel = stripAnsi(payload.chatModel || '');
    cfg.baseURL = resolveImportBaseURL(payload.provider, payload.baseURL || '');

    // Re-read the source file to extract the actual API key
    const srcPath = payload.sourcePath || '';
    if (srcPath) {
      let content: string | null = null;
      try {
        if (srcPath.startsWith('.') || srcPath.startsWith('~')) {
          content = await readHomeFile(srcPath.replace(/^~\//, ''));
        } else {
          content = await invoke!('cmd_read_absolute_file', { path: srcPath }) as string;
        }
      } catch { /* ignore */ }
      if (content) {
        const parsed = parseClaudeConfig(content);
        if (parsed) {
          cfg.provider = parsed.provider;
          cfg.chatModel = stripAnsi(parsed.chatModel || cfg.chatModel);
          cfg.baseURL = resolveImportBaseURL(cfg.provider, parsed.baseURL || cfg.baseURL);
          // Store API key so saveCfg() can include it in env block
          if (parsed.apiKey) {
            const existing = keys.find(k => k.pid === cfg.provider);
            if (existing) existing.key = parsed.apiKey;
            else keys.push({ pid: cfg.provider, key: parsed.apiKey });
          }
        }
      }
    }

    cfg.initialized = true;
    const preset = getProviderPreset(cfg.provider);
    cfg.displayProvider = preset?.name || cfg.provider;
    saveCfg();
    sendCfg();
    listChatSessions();
  }
}

async function tryImportPath(sourcePath: string) {
  if (!h || !invoke) return;
  let content: string | null = null;
  try { content = await invoke('cmd_read_absolute_file', { path: sourcePath }) as string; }
  catch { return; }
  if (!content) return;

  const parsed = parseClaudeConfig(content);
  if (parsed) {
    cfg.provider = parsed.provider;
    cfg.chatModel = parsed.chatModel || cfg.chatModel;
    cfg.baseURL = resolveImportBaseURL(cfg.provider, parsed.baseURL || cfg.baseURL);
    // Store API key so saveCfg() can include it in env block
    if (parsed.apiKey) {
      const existing = keys.find(k => k.pid === cfg.provider);
      if (existing) existing.key = parsed.apiKey;
      else keys.push({ pid: cfg.provider, key: parsed.apiKey });
    }
    cfg.initialized = true;
    const preset = getProviderPreset(cfg.provider);
    cfg.displayProvider = preset?.name || cfg.provider;
    saveCfg();
    sendCfg();
  }
}

/** Skip the setup wizard and enter chat view with unconfigured state. */
function enterManualMode() {
  if (!h) return;
  cfg.initialized = true;
  sendCfg();
}

async function pickConfigFile() {
  if (!h || !invoke) return;
  try {
    const selected = await invoke('cmd_pick_file') as string | null;
    if (selected) {
      await tryImportPath(selected);
      await scanConfigs();
    }
  } catch (e) { console.error('[Adapter] pickConfigFile failed:', e); }
}

// ── Chat ─────────────────────────────────────────────────────────────

async function doChat(content: string) {
  if (!h) return;
  const key = keys.find(k => k.pid === cfg.provider)?.key || '';
  if (!key && cfg.provider !== 'ollama') {
    h({ type: 'chat.error', payload: { message: 'No API key configured.', code: 'NO_API_KEY' } } as ExtensionMessage);
    return;
  }
  hist.push({ role: 'user', content });
  ac = new AbortController();

  const toolDiffs = new Map<string, LocDiff>();
  let pendingToolId = '';

  const cb: AgentCallbacks = {
    onStarted: () => {
      h!({ type: 'chat.started', payload: {} } as ExtensionMessage);
    },
    onToken: (text) => {
      h!({ type: 'chat.token', payload: { text } } as ExtensionMessage);
    },
    onToolCall: (id, name, displayName, args) => {
      pendingToolId = id;
      h!({ type: 'chat.toolCall', payload: { id, name, displayName, args, needsApproval: false } } as ExtensionMessage);
    },
    onApprovalNeeded: async () => true,
    onToolResult: (id, name, result, success) => {
      const diff = toolDiffs.get(id);
      if (diff) toolDiffs.delete(id);
      h!({ type: 'chat.toolResult', payload: { id, name, result, success, diff: diff as any } } as ExtensionMessage);
    },
    getDisplayName: (name) => name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    executeTool: async (name, args) => {
      const sargs = args as Record<string, string>;
      const tid = pendingToolId;
      if ((name === 'write_file' || name === 'edit_file') && args.path && invoke) {
        const p = (args.path || (args as any).filePath || '') as string;

        // Read original for diff (write_file: may fail for new files; edit_file: must exist)
        let orig = '';
        try {
          orig = await invoke('cmd_read_file_workspace', { relativePath: p }) as string;
        } catch (e: any) {
          if (name === 'edit_file') {
            return { result: `Error: cannot read file — ${e?.message || e}`, success: false };
          }
          // write_file: file doesn't exist yet, that's fine
        }

        // Execute the write
        const r = await execTool(name, sargs);
        const ok = !r.startsWith('Error');

        // Re-read for diff (skip if write failed, or if file is outside workspace)
        if (ok) {
          try {
            const nc = await invoke('cmd_read_file_workspace', { relativePath: p }) as string;
            const diff = mkdiff(p, orig, nc);
            if (diff) toolDiffs.set(tid, diff);
          } catch { /* re-read failed, skip diff */ }
        }

        return { result: r, success: ok };
      }
      const r = await execTool(name, sargs);
      return { result: r, success: !r.startsWith('Error') };
    },
    isReadOnly: (name) => !['write_file', 'edit_file', 'execute_command'].includes(name),
    onHistoryChanged: () => { saveChat(); },
  };

  try {
    await runAgentLoop(
      { apiKey: key, baseURL: cfg.baseURL, model: cfg.chatModel, maxTokens: cfg.maxTokens || 4096, thinkingBudget: 0, provider: cfg.provider },
      hist,
      sysPrompt(),
      TOOLS,
      cb,
      500,
      ac.signal,
    );
    saveChat();
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    h({ type: 'chat.error', payload: { message: err?.message || 'Unknown error', code: 'CHAT_ERROR' } } as ExtensionMessage);
  } finally {
    ac = null;
    h({ type: 'chat.done', payload: { usage: { inputTokens: 0, outputTokens: 0 } } } as ExtensionMessage);
  }
}
