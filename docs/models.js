// IDs remain stable across app updates and are separate from manuscript storage.
export const localModels = [
  {id:'qwen-1.7',name:'Qwen 3 · 1.7B',size:'1 GB',web:'Qwen3-1.7B',description:'Balanced local writing'},
  {id:'qwen-0.6',name:'Qwen 3 · 0.6B',size:'400 MB',web:'Qwen3-0.6B',description:'Smallest download'},
  {id:'llama-1b',name:'Llama 3.2 · 1B',size:'700 MB',web:'Llama-3.2-1B-Instruct',description:'Compact alternative'},
  {id:'llama-3b',name:'Llama 3.2 · 3B',size:'1.8 GB',web:'Llama-3.2-3B-Instruct',description:'Larger model · needs more memory'},
  {id:'smol-1.7',native:false,name:'SmolLM2 · 1.7B',size:'1 GB',web:'SmolLM2-1.7B-Instruct',description:'Available in compatible browsers'},
  {id:'gemma-1b',name:'Gemma 3 · 1B',size:'800 MB',web:null,description:'Available in the iPhone/iPad app'}
];
export function isLocalModel(id){return localModels.some(m=>m.id===id);}
export function validateConnection(raw){
  const name=String(raw.name||'').trim(),model=String(raw.model||'').trim();
  if(!name||name.length>100||!model||model.length>200)throw Error('Enter a connection name and model ID.');
  let url;try{url=new URL(String(raw.endpoint||'').trim());}catch{throw Error('Enter a complete API base URL.');}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(local&&url.protocol==='http:'))||url.username||url.password||url.search||url.hash)throw Error('Use an HTTPS API base URL without credentials or query parameters. Localhost may use HTTP.');
  if(!['openai','anthropic'].includes(raw.format))throw Error('Choose a supported API format.');
  const suffix=raw.format==='anthropic'?'/messages':'/chat/completions';
  let endpoint=url.href.replace(/\/+$/,'');if(endpoint.endsWith(suffix))endpoint=endpoint.slice(0,-suffix.length);
  const id=raw.id||'api-'+crypto.randomUUID();if(!/^api-[a-zA-Z0-9-]{1,80}$/.test(id))throw Error('Invalid connection ID.');
  return {id,name,model,endpoint,format:raw.format};
}
export function apiRequest(profile,{instructions,prompt,maxTokens}){
  const anthropic=profile.format==='anthropic';
  return {url:profile.endpoint+(anthropic?'/messages':'/chat/completions'),body:anthropic?
    {model:profile.model,system:instructions,messages:[{role:'user',content:prompt}],max_tokens:maxTokens,stream:false}:
    {model:profile.model,messages:[{role:'system',content:instructions},{role:'user',content:prompt}],max_tokens:maxTokens,stream:false}};
}
export function apiText(profile,data){
  const content=profile.format==='anthropic'?data.content:data.choices?.[0]?.message?.content;
  const text=Array.isArray(content)?content.filter(x=>x.type==='text').map(x=>x.text).join('\n'):content;
  if(typeof text!=='string'||!text.trim())throw Error('The API returned no text. Check the model ID and API format.');
  return text.trim();
}
