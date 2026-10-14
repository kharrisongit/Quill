const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.QUILL_CHROME?{executablePath:process.env.QUILL_CHROME}:{})});
 try{
  const page=await browser.newPage();await page.goto(process.env.QUILL_TEST_URL||'http://127.0.0.1:8088',{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
   const api=await import('./connections.js'),runtime=await import('./ai-runtime.js');
   const p=await api.saveConnection({name:'My server',model:'custom-id',endpoint:'https://models.example/v1',format:'openai'},'test-secret');
   let received;const original=window.fetch;window.fetch=async(url,opts)=>{received={url,body:JSON.parse(opts.body),authorization:opts.headers.Authorization};return new Response(JSON.stringify({choices:[{message:{content:'A story.'}}]}),{headers:{'Content-Type':'application/json'}});};
   const writer=await runtime.createWriter(p.id,{signal:new AbortController().signal,onStatus:()=>{}}),text=await writer.request({instructions:'Style',prompt:'Codex facts',maxTokens:100});writer.close();
   const secretNotStored=!localStorage.getItem('quill-api-connections').includes('test-secret');
   await api.saveConnection({...p,endpoint:'https://other.example/v1'},'');const cleared=!sessionStorage.getItem('quill-api-key-'+p.id);
   await api.deleteConnection(p.id);window.fetch=original;
   // Include old, current and partially cached versions plus unrelated app and model data.
   const cache=await caches.open('webllm/model');const prefix='https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC/resolve/';
   const selected=[prefix+'old/a.bin',prefix+'new/a.bin',prefix+'partial/a.bin'];
   for(const url of selected)await cache.put(url,new Response('weights',{headers:{'Content-Length':'7'}}));
   const other='https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/resolve/main/a.bin';await cache.put(other,new Response('keep'));
   const shell=await caches.open('quill-v10');await shell.put(location.origin+'/app.bundle.js',new Response('keep'));
   localStorage.setItem('quill-qwen-revision-qwen-0.6',JSON.stringify({sha:'a'.repeat(40)}));
   const before=await runtime.modelStorage();await runtime.deleteModel('qwen-0.6');
   return {text,received,secretNotStored,cleared,profiles:api.connections().length,bytes:before.find(x=>x.id==='qwen-0.6').bytes,remaining:(await cache.keys()).map(x=>x.url),shell:!!await shell.match(location.origin+'/app.bundle.js'),revision:localStorage.getItem('quill-qwen-revision-qwen-0.6')};
  });
  assert.equal(result.text,'A story.');assert.equal(result.received.body.model,'custom-id');assert.equal(result.received.authorization,'Bearer test-secret');assert(result.secretNotStored&&result.cleared);assert.equal(result.profiles,0);assert.equal(result.bytes,21);assert.equal(result.remaining.length,1);assert.match(result.remaining[0],/Llama/);assert(result.shell);assert.equal(result.revision,null);
  console.log('PASS: API routing, session-only browser keys, endpoint key clearing, connection deletion, per-model size and complete cache deletion preserve other models and app files.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
