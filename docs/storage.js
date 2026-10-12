import {union,validate} from './core.js';
export const native = !!window.webkit?.messageHandlers?.quill;
let seq=0;const waiting=new Map();
window.quillReply = ({id,result,error}) => { const p=waiting.get(id);if(!p)return;waiting.delete(id);clearTimeout(p.timer);error?p.reject(Error(error)):p.resolve(result); };
export function bridge(action,payload={}) {return new Promise((resolve,reject)=>{const id=String(++seq);const timer=setTimeout(()=>{waiting.delete(id);reject(Error('The iPhone action did not finish. Please try again.'));},120000);waiting.set(id,{resolve,reject,timer});window.webkit.messageHandlers.quill.postMessage({id,action,payload});});}
let db;
export async function openStorage(){
  if(native)return;
  db=await new Promise((resolve,reject)=>{const r=indexedDB.open('quill-writer',1);r.onupgradeneeded=()=>r.result.createObjectStore('revisions',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  navigator.storage?.persist?.().catch(()=>{});
}
export async function load(){if(native)return union([],await bridge('load'));return new Promise((resolve,reject)=>{const t=db.transaction('revisions'),r=t.objectStore('revisions').getAll();r.onsuccess=()=>{try{resolve(union([],r.result));}catch(e){reject(e);}};r.onerror=()=>reject(r.error);});}
export async function put(records){records.forEach(validate);if(native){await bridge('save',{records});return;}await new Promise((resolve,reject)=>{const t=db.transaction('revisions','readwrite');for(const r of records)t.objectStore('revisions').put(r);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('Save cancelled.'));});}
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
  for(const r of revisions)if(!existing.has(r.id)){const h=await dir.getFileHandle(r.id+'.json',{create:true}),w=await h.createWritable();await w.write(JSON.stringify(r));await w.close();}
  await put(merged.filter(r=>!revisions.some(x=>x.id===r.id)));return merged;
}
export async function download(name,type,content){
  const bytes=typeof content==='string'?new TextEncoder().encode(content):content;
  if(native){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));await bridge('export',{name,data:btoa(s)});return;}
  const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
