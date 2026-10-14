import {native,bridge} from './storage.js';

export const modelChoices = [
  ['apple','Apple Intelligence · on this iPhone/iPad'],
  ['qwen-1.7','Qwen 3 · 1.7B · balanced'],
  ['qwen-0.6','Qwen 3 · 0.6B · lighter']
];
const WEBLLM='https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';
let engine=null,worker=null,loadedKey=null;
export function releaseQwen(){worker?.terminate();worker=null;engine=null;loadedKey=null;}
const revisionKey=model=>'quill-qwen-revision-'+model;
function installed(model){try{return JSON.parse(localStorage.getItem(revisionKey(model))||'null');}catch{return null;}}
async function browserModel(model){
  if(!['qwen-0.6','qwen-1.7'].includes(model))throw Error('Choose a Qwen model.');
  const adapter=await navigator.gpu?.requestAdapter();if(!adapter)throw Error('Qwen needs a compatible WebGPU graphics device.');
  const precision=adapter.features.has('shader-f16')?'q4f16_1':'q4f32_1';
  const id=`Qwen3-${model==='qwen-0.6'?'0.6B':'1.7B'}-${precision}-MLC`;
  return {id,repo:'mlc-ai/'+id};
}
async function latestModel(model,signal){
  const spec=await browserModel(model);
  const response=await fetch('https://huggingface.co/api/models/'+spec.repo,{cache:'no-store',signal});
  if(!response.ok)throw Error('Could not check Qwen’s model repository. Your installed version is kept.');
  const info=await response.json();if(!/^[a-f0-9]{40}$/.test(info.sha))throw Error('The model repository returned an invalid version.');
  return {...spec,sha:info.sha};
}
export async function checkQwenUpdate(model){
  if(native)return bridge('aiCheckUpdate',{model});
  const latest=await latestModel(model,AbortSignal.timeout(30000)),old=installed(model);
  const available=old?.sha!==latest.sha||old?.id!==latest.id;
  return {available,message:available?(old?'A Qwen model update is available. Download it when you’re ready; the working version is kept until the new copy loads.':'Qwen is ready for its first download.'):`This Qwen model is up to date (${latest.sha.slice(0,8)}).`};
}
export async function checkModel(model){
  if(native)return bridge('aiStatus',{model});
  if(model==='apple')return {available:false,message:'Apple Intelligence runs in the Quill iPhone/iPad app. Choose Qwen to write in this browser.'};
  if(!modelChoices.some(([id])=>id===model))return {available:false,message:'Choose a writing model.'};
  if(!navigator.gpu)return {available:false,message:'Qwen needs a browser and device with WebGPU. Try an up-to-date Chrome or Edge on a supported computer or Android device. Ordinary editing still works here.'};
  try{
    await browserModel(model);
    return {available:true,message:`Qwen runs on this device. First use downloads roughly ${model==='qwen-0.6'?'0.5 GB':'1.2 GB'}; extra memory is needed while writing. Downloads are cached when browser storage allows. No account or usage charge.`};
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
  releaseQwen();onStatus('Loading Qwen · the first download can take several minutes…');
  const {CreateWebWorkerMLCEngine,prebuiltAppConfig}=await withAbort(import(WEBLLM),signal);
  const preset=prebuiltAppConfig.model_list.find(m=>m.model_id===selected.id);
  if(!preset)throw Error('This Qwen model needs a newer Quill app. Your installed copy is kept.');
  const config={...prebuiltAppConfig,model_list:[{...preset,model_id:key,model:`https://huggingface.co/${selected.repo}/resolve/${selected.sha}/`}]};
  worker=new Worker(new URL('qwen-worker.js',location.href),{type:'module'});
  const workerError=new Promise((_,reject)=>worker.addEventListener('error',()=>reject(Error('The Qwen worker could not load. Check your connection and reload Quill.')),{once:true}));
  engine=await withAbort(Promise.race([workerError,CreateWebWorkerMLCEngine(worker,key,{
    appConfig:config,initProgressCallback:report=>{if(!signal.aborted)onStatus(`Loading Qwen · ${Math.round(Math.max(0,Math.min(1,report.progress||0))*100)}% — ${report.text}`);}
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
  try{await loadBrowserQwen(model,{signal,onStatus,update:true});return 'Qwen is installed and up to date.';}
  catch(e){releaseQwen();throw e;}finally{signal.removeEventListener('abort',cancel);}
}
export async function createWriter(model,{signal,onStatus}){
  const status=await checkModel(model);if(!status.available)throw Error(status.message);if(signal.aborted)throw aborted();
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
          max_tokens:maxTokens,temperature:0.75,top_p:0.8,frequency_penalty:0.15,extra_body:{enable_thinking:false}
        }),signal);
        let text='';for await(const chunk of stream){if(signal.aborted)throw aborted();text+=chunk.choices[0]?.delta?.content||'';onProgress?.(text);}
        if(signal.aborted)throw aborted();return text;
      },close:()=>signal.removeEventListener('abort',cancel)
    };
  }catch(error){signal.removeEventListener('abort',cancel);releaseQwen();if(signal.aborted)throw aborted();throw Error(`Qwen could not start. Check your connection, free storage and GPU memory, or try the lighter model. ${error.message||''}`);}
}
