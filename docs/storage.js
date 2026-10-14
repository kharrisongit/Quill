import {union,validate} from './core.js';
export const native = !!window.webkit?.messageHandlers?.quill;
let seq=0;const waiting=new Map();
window.quillReply = ({id,result,error}) => { const p=waiting.get(id);if(!p)return;waiting.delete(id);clearTimeout(p.timer);error?p.reject(Error(error)):p.resolve(result); };
window.quillProgress = ({id,text,status}) => { const p=waiting.get(id);if(text!==undefined)p?.onProgress?.(text);if(status!==undefined)p?.onStatus?.(status); };
export function bridge(action,payload={},options={}) {return new Promise((resolve,reject)=>{const id=String(++seq);const timer=setTimeout(()=>{waiting.delete(id);if(['aiGenerate','aiUpdate'].includes(action))bridge('aiCancel').catch(()=>{});reject(Error('The iPhone action did not finish. Your saved writing is kept.'));},options.timeout||120000);waiting.set(id,{resolve,reject,timer,onProgress:options.onProgress,onStatus:options.onStatus});try{window.webkit.messageHandlers.quill.postMessage({id,action,payload});}catch(e){clearTimeout(timer);waiting.delete(id);reject(e);}});}

let db;
export async function openStorage(){
  if(native)return;
  db=await new Promise((resolve,reject)=>{const r=indexedDB.open('quill-writer',1);r.onupgradeneeded=()=>r.result.createObjectStore('revisions',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  navigator.storage?.persist?.().catch(()=>{});
}
function updateRecords(records){return new Promise((resolve,reject)=>{
  const t=db.transaction('revisions','readwrite'),store=t.objectStore('revisions'),request=store.getAll();let merged,error;
  request.onsuccess=()=>{try{
    merged=union(request.result,records);const kept=new Set(merged.map(r=>r.id)),known=new Set(request.result.map(r=>r.id));
    // Marker and physical cleanup commit together; stale tabs cannot reinsert deleted drafts.
    for(const r of request.result)if(!kept.has(r.id))store.delete(r.id);
    for(const r of merged)if(!known.has(r.id))store.put(r);
  }catch(e){error=e;t.abort();}};
  t.oncomplete=()=>resolve(merged);t.onerror=()=>reject(error||t.error);t.onabort=()=>reject(error||t.error||Error('Save cancelled.'));
});}
export async function load(){if(native)return union([],await bridge('load'));return updateRecords([]);}
export async function put(records){records.forEach(validate);if(native){await bridge('save',{records});return;}await updateRecords(records);}
let folder=null;
export async function connectFolder(){
  if(native)return bridge('connect');
  if(!window.showDirectoryPicker)throw Error('Live folder sync needs desktop Chrome or Edge. In this browser, use backup export and import to move your writing.');
  folder=await window.showDirectoryPicker({id:'quill-sync',mode:'readwrite'});return folder.name;
}
export async function disconnectFolder(){folder=null;if(native)await bridge('disconnect');}
export async function sync(revisions){
  if(native){const result=await bridge('sync');const merged=union(revisions,result),known=new Set(revisions.map(r=>r.id));await put(merged.filter(r=>!known.has(r.id)));return merged;}
  if(!folder)throw Error('Connect your synced folder first.');
  const dir=await folder.getDirectoryHandle('Quill-revisions',{create:true}),incoming=[],existing=new Set();
  for await(const [name,handle] of dir.entries())if(handle.kind==='file'&&/^[\w-]+\.json$/.test(name)){const f=await handle.getFile();if(f.size>5000000)throw Error('An oversized sync file needs attention.');const r=validate(JSON.parse(await f.text()));if(name!==r.id+'.json')throw Error('Invalid sync filename.');incoming.push(r);existing.add(r.id);}
  const merged=union(revisions,incoming);
  // Check the entire incoming set before writing either side.
  for(const r of merged)if(!existing.has(r.id)){const h=await dir.getFileHandle(r.id+'.json',{create:true}),w=await h.createWritable();await w.write(JSON.stringify(r));await w.close();}
  // Publish the deletion marker successfully before removing any synced checkpoints.
  const kept=new Set(merged.map(r=>r.id));
  for(const r of incoming)if(!kept.has(r.id))await dir.removeEntry(r.id+'.json');
  await put(merged.filter(r=>!revisions.some(x=>x.id===r.id)));return merged;
}
export async function download(name,type,content){
  const bytes=typeof content==='string'?new TextEncoder().encode(content):content;
  if(native){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));await bridge('export',{name,data:btoa(s)});return;}
  const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
