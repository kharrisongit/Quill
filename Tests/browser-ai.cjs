// Regression checks for worker cancellation and model-update rollback. Requires Playwright.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.QUILL_CHROME?{executablePath:process.env.QUILL_CHROME}:{})});
  try{
    const page=await browser.newPage();
    await page.addInitScript(()=>{
      Object.defineProperty(navigator,'gpu',{value:{requestAdapter:async()=>({features:new Set(['shader-f16'])})}});
      window.Worker=class extends EventTarget{terminate(){window.workerStopped=true;}};
    });
    let sha='a'.repeat(40);
    await page.route('https://huggingface.co/api/models/**',route=>route.fulfill({json:{sha}}));
    await page.route('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm',route=>route.fulfill({contentType:'text/javascript',body:`
      export const prebuiltAppConfig={model_list:[{model_id:'Qwen3-0.6B-q4f16_1-MLC'}]};
      export async function CreateWebWorkerMLCEngine(){
        if(window.failLoad)throw Error('Download failed');
        return {resetChat:async()=>{},chat:{completions:{create:async()=>({[Symbol.asyncIterator](){return {next(){window.pendingToken=true;return new Promise(()=>{});}};}})}}};
      }
    `}));
    await page.goto(process.env.QUILL_TEST_URL||'http://127.0.0.1:8088');
    const cancelled=await page.evaluate(async()=>{
      const runtime=await import('./ai-runtime.js');const controller=new AbortController();
      const writer=await runtime.createWriter('qwen-0.6',{signal:controller.signal,onStatus:()=>{}});
      const pending=writer.request({instructions:'Write prose.',prompt:'A map.',maxTokens:100}).then(()=>false,e=>e.name==='AbortError');
      while(!window.pendingToken)await new Promise(r=>setTimeout(r,5));
      controller.abort();
      const stopped=await Promise.race([pending,new Promise(r=>setTimeout(()=>r(false),2000))]);writer.close();
      return stopped&&window.workerStopped;
    });assert.equal(cancelled,true,'Stop must settle a pending token read after terminating the worker');
    sha='b'.repeat(40);
    const rollback=await page.evaluate(async()=>{
      window.failLoad=true;const {updateQwen}=await import('./ai-runtime.js');
      try{await updateQwen('qwen-0.6',{signal:new AbortController().signal,onStatus:()=>{}});}catch{}
      return JSON.parse(localStorage.getItem('quill-qwen-revision-qwen-0.6')).sha;
    });assert.equal(rollback,'a'.repeat(40),'Failed update must retain the installed model revision');
    console.log('PASS: browser worker cancellation settles pending generation; failed updates keep the installed revision.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
