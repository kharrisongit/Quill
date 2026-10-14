import {native,bridge} from './storage.js';
import {validateConnection,apiRequest,apiText} from './models.js';
let profiles=[];
const KEY='quill-api-connections';
export async function loadConnections(){
  const raw=native?await bridge('apiProfiles'):JSON.parse(localStorage.getItem(KEY)||'[]');
  profiles=raw.map(p=>({...validateConnection(p),hasKey:!!p.hasKey}));return profiles;
}
export function connections(){return profiles;}
export async function saveConnection(raw,key,clearKey=false){
  const p=validateConnection(raw);
  if(native)await bridge('apiSave',{profile:p,key,clearKey});
  else{
    // Browser keys last only for this tab session, never in backups or localStorage.
    const keyName='quill-api-key-'+p.id;
    if(key)sessionStorage.setItem(keyName,key);else if(clearKey||profiles.find(x=>x.id===p.id)?.endpoint!==p.endpoint)sessionStorage.removeItem(keyName);
    const next=[...profiles.filter(x=>x.id!==p.id),p];localStorage.setItem(KEY,JSON.stringify(next));
  }
  await loadConnections();return p;
}
export async function deleteConnection(id){
  if(native)await bridge('apiDelete',{id});
  else{sessionStorage.removeItem('quill-api-key-'+id);localStorage.setItem(KEY,JSON.stringify(profiles.filter(p=>p.id!==id)));}
  await loadConnections();
}
export async function remoteRequest(id,payload,{signal,onStatus=()=>{}}){
  const p=profiles.find(p=>p.id===id);if(!p)throw Error('This API connection was removed. Choose another model in Manage Models.');
  if(signal.aborted)throw new DOMException('Writing stopped.','AbortError');
  onStatus('Waiting for '+p.name+'…');
  if(native){
    const cancel=()=>bridge('apiCancel',{id}).catch(()=>{});signal.addEventListener('abort',cancel,{once:true});
    try{return await bridge('apiGenerate',{id,...payload},{timeout:180000});}finally{signal.removeEventListener('abort',cancel);}
  }
  const {url,body}=apiRequest(p,payload),key=sessionStorage.getItem('quill-api-key-'+id),headers={'Content-Type':'application/json'};
  if(p.format==='anthropic'){headers['anthropic-version']='2023-06-01';headers['anthropic-dangerous-direct-browser-access']='true';if(key)headers['x-api-key']=key;}else if(key)headers.Authorization='Bearer '+key;
  const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,180000);signal.addEventListener('abort',abort,{once:true});
  try{
    const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal,redirect:'error',credentials:'omit'});
    if(!response.ok)throw Error(`API request failed (${response.status}). Check your key, model ID, quota and endpoint in Manage Models.`);
    return apiText(p,await response.json());
  }catch(e){if(signal.aborted)throw new DOMException('Writing stopped.','AbortError');if(e.name==='AbortError')throw Error('The API timed out. Try again or choose another model.');if(e instanceof TypeError)throw Error('Could not reach this API. Browser connections require CORS support; the iPhone app can connect directly.');throw e;}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
