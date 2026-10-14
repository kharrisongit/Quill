import {native,bridge} from './storage.js';

import {localModels,isLocalModel} from './models.js';
import {connections,remoteRequest} from './connections.js';
export function modelChoices(){return [['apple','Apple Intelligence · on this iPhone/iPad'],...localModels.filter(m=>native?m.native!==false:!!m.web).map(m=>[m.id,m.name]),...connections().map(p=>[p.id,p.name+' · API'])];}
const WEBLLM='https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';
let engine=null,worker=null,loadedKey=null;
export function releaseQwen(){worker?.terminate();worker=null;engine=null;loadedKey=null;}
const revisionKey=model=>'quill-qwen-revision-'+model;
function installed(model){try{return JSON.parse(localStorage.getItem(revisionKey(model))||'null');}catch{return null;}}
async function browserModel(model){
  const catalog=localModels.find(m=>m.id===model);if(!catalog?.web)throw Error('This model is available in the iPhone/iPad app only.');
  const adapter=await navigator.gpu?.requestAdapter();if(!adapter)throw Error('Local AI needs a compatible WebGPU graphics device.');
  const precision=adapter.features.has('shader-f16')?'q4f16_1':'q4f32_1';
  const id=`${catalog.web}-${precision}-MLC`;
  return {id,repo:'mlc-ai/'+id};
}
async function latestModel(model,signal){
  const spec=await browserModel(model);
  const response=await fetch('https://huggingface.co/api/models/'+spec.repo,{cache:'no-store',signal});
  if(!response.ok)throw Error('Could not check the model repository. Your installed version is kept.');
  const info=await response.json();if(!/^[a-f0-9]{40}$/.test(info.sha))throw Error('The model repository returned an invalid version.');
  return {...spec,sha:info.sha};
}
export async function checkQwenUpdate(model){
  if(native)return bridge('aiCheckUpdate',{model});
  const latest=await latestModel(model,AbortSignal.timeout(30000)),old=installed(model);
  const available=old?.sha!==latest.sha||old?.id!==latest.id;
  return {available,message:available?(old?'A local model update is available. Download it when you’re ready; the working version is kept until the new copy loads.':'The model is ready for its first download.'):`This local model is up to date (${latest.sha.slice(0,8)}).`};
}
export async function checkModel(model){
  const remote=connections().find(p=>p.id===model);if(remote)return {available:true,message:`Uses ${remote.name} (${new URL(remote.endpoint).host}). Story context is sent to this API. Provider charges may apply.`};
  if(native)return bridge('aiStatus',{model});
  if(model==='apple')return {available:false,message:'Apple Intelligence runs in the Quill iPhone/iPad app. Choose Qwen to write in this browser.'};
  if(!modelChoices().some(([id])=>id===model))return {available:false,message:'Choose a writing model.'};
  if(!navigator.gpu)return {available:false,message:'Local AI needs a browser and device with WebGPU. Try an up-to-date Chrome or Edge on a supported computer or Android device. Ordinary editing still works here.'};
  try{
    await browserModel(model);
    return {available:true,message:`${localModels.find(m=>m.id===model)?.name} runs on this device. First download is approximately ${localModels.find(m=>m.id===model)?.size} (browser files may be larger). Extra memory is needed while writing. No account or usage charge.`};
  }catch{return {available:false,message:'This browser could not access a compatible GPU. Check hardware acceleration or try another supported device.'};}
}
function aborted(){return new DOMException('Writing stopped.','AbortError');}
function withAbort(promise,signal){
  return new Promise((resolve,reject)=>{
    const stop=()=>reject(aborted());if(signal.aborted){reject(aborted());return;}
    signal.addEventListener('abort',stop,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));
  });
}
async function loadBrowserQwen(model,{signal,onStatus,update=false}){
  const spec=await browserModel(model),old=installed(model);
  // Installed revisions are pinned. A network check only occurs on first install or explicit update.
  const selected=!update&&old?.id===spec.id?old:await latestModel(model,signal);
  const key=selected.id+'-'+selected.sha;
  if(engine&&loadedKey===key)return engine;
  releaseQwen();onStatus('Loading model · the first download can take several minutes…');
  const {CreateWebWorkerMLCEngine,prebuiltAppConfig}=await withAbort(import(WEBLLM),signal);
  const preset=prebuiltAppConfig.model_list.find(m=>m.model_id===selected.id);
  if(!preset)throw Error('This local model needs a newer Quill app. Your installed copy is kept.');
  const config={...prebuiltAppConfig,model_list:[{...preset,model_id:key,model:`https://huggingface.co/${selected.repo}/resolve/${selected.sha}/`}]};
  const attempts=JSON.parse(localStorage.getItem('quill-model-attempts-'+model)||'[]');
  if(!attempts.some(x=>x.sha===selected.sha&&x.id===selected.id))localStorage.setItem('quill-model-attempts-'+model,JSON.stringify([...attempts,selected]));
  worker=new Worker(new URL('qwen-worker.js',location.href),{type:'module'});
  const workerError=new Promise((_,reject)=>worker.addEventListener('error',()=>reject(Error('The model worker could not load. Check your connection and reload Quill.')),{once:true}));
  engine=await withAbort(Promise.race([workerError,CreateWebWorkerMLCEngine(worker,key,{
    appConfig:config,initProgressCallback:report=>{if(!signal.aborted)onStatus(`Loading model · ${Math.round(Math.max(0,Math.min(1,report.progress||0))*100)}% — ${report.text}`);}
  },{context_window_size:4096})]),signal);
  if(signal.aborted){releaseQwen();throw aborted();}
  // Advance the installed pointer only after the new weights have loaded successfully.
  try{localStorage.setItem(revisionKey(model),JSON.stringify(selected));}catch{}
  loadedKey=key;navigator.storage?.persist?.().catch(()=>{});return engine;
}
export async function updateQwen(model,{signal,onStatus}){
  if(native){
    const cancel=()=>bridge('aiCancel').catch(()=>{});signal.addEventListener('abort',cancel,{once:true});
    try{return await withAbort(bridge('aiUpdate',{model},{timeout:1800000,onStatus}),signal);}finally{signal.removeEventListener('abort',cancel);}
  }
  const cancel=()=>releaseQwen();signal.addEventListener('abort',cancel,{once:true});
  try{await loadBrowserQwen(model,{signal,onStatus,update:true});return 'The model is installed and up to date.';}
  catch(e){releaseQwen();throw e;}finally{signal.removeEventListener('abort',cancel);}
}
export async function createWriter(model,{signal,onStatus}){
  const status=await checkModel(model);if(!status.available)throw Error(status.message);if(signal.aborted)throw aborted();
  if(model.startsWith('api-'))return {request:async(payload,onProgress)=>{const text=await withAbort(remoteRequest(model,payload,{signal,onStatus}),signal);onProgress?.(text);return text;},close:()=>{}};
  if(native){
    const cancel=()=>bridge('aiCancel').catch(()=>{});signal.addEventListener('abort',cancel,{once:true});
    return {request:(payload,onProgress)=>withAbort(bridge('aiGenerate',{...payload,model},{timeout:1800000,onProgress,onStatus}),signal),close:()=>signal.removeEventListener('abort',cancel)};
  }
  const cancel=()=>releaseQwen();signal.addEventListener('abort',cancel,{once:true});
  try{
    const active=await loadBrowserQwen(model,{signal,onStatus});
    return {
      request:async({instructions,prompt,maxTokens},onProgress)=>{
        if(signal.aborted)throw aborted();await withAbort(active.resetChat(),signal);
        const stream=await withAbort(active.chat.completions.create({
          messages:[{role:'system',content:instructions},{role:'user',content:prompt}],stream:true,
          max_tokens:maxTokens,temperature:0.75,top_p:0.8,frequency_penalty:0.15,...(model.startsWith('qwen-')?{extra_body:{enable_thinking:false}}:{})
        }),signal);
        // Terminating the worker can leave a pending iterator read unresolved; race each read with Stop.
        const iterator=stream[Symbol.asyncIterator]();let text='';
        while(true){const {value:chunk,done}=await withAbort(iterator.next(),signal);if(done)break;if(signal.aborted)throw aborted();text+=chunk.choices[0]?.delta?.content||'';onProgress?.(text);}
        if(signal.aborted)throw aborted();return text;
      },close:()=>signal.removeEventListener('abort',cancel)
    };
  }catch(error){signal.removeEventListener('abort',cancel);releaseQwen();if(signal.aborted)throw aborted();throw Error(`The local model could not start. Check your connection, free storage and GPU memory, or try the lighter model. ${error.message||''}`);}
}

// Inspect only the selected model's CacheStorage entries; never clear the manuscript database.
async function modelCacheEntries(model){
  const item=localModels.find(m=>m.id===model);if(!item?.web)return [];
  const entries=[];if(!globalThis.caches)return entries;
  for(const name of await caches.keys()){
    if(!name.startsWith('webllm/'))continue;
    const cache=await caches.open(name);
    for(const request of await cache.keys()){
      const url=new URL(request.url);
      const weights=url.hostname==='huggingface.co'&&url.pathname.startsWith('/mlc-ai/'+item.web+'-');
      const wasm=url.pathname.split('/').at(-1)?.startsWith(item.web+'-');
      if(weights||wasm)entries.push({cache,request});
    }
  }
  return entries;
}
export async function modelStorage(){
  if(native)return bridge('aiModels');
  return Promise.all(localModels.filter(m=>m.web).map(async m=>{
    const entries=await modelCacheEntries(m.id);let bytes=0,unknown=false;
    for(const {cache,request} of entries){const response=await cache.match(request),length=Number(response?.headers.get('content-length'));if(length)bytes+=length;else unknown=true;}
    return {id:m.id,installed:!!installed(m.id)&&entries.length>0,bytes,partial:entries.length>0&&!installed(m.id),estimated:unknown};
  }));
}
export async function deleteModel(model){
  if(!isLocalModel(model))throw Error('Choose a downloaded model. Apple Intelligence is managed in iOS Settings.');
  if(native)return bridge('aiDeleteModel',{model});
  releaseQwen();
  for(const {cache,request} of await modelCacheEntries(model))await cache.delete(request);
  localStorage.removeItem(revisionKey(model));localStorage.removeItem('quill-model-attempts-'+model);
  return true;
}
