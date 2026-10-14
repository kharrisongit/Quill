const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.QUILL_CHROME?{executablePath:process.env.QUILL_CHROME}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.requests=[];window.cancelled=false;
   window.webkit={messageHandlers:{quill:{postMessage:({id,action,payload})=>{
    const reply=(result,error)=>setTimeout(()=>window.quillReply({id,result,error}),5);
    const records=JSON.parse(localStorage.getItem('workshop-records')||'[]');
    if(action==='apiProfiles'||action==='aiModels')return reply([]);
    if(action==='load')return reply(records);
    if(action==='save'){if(window.failSave)return reply(null,'Storage unavailable');for(const r of payload.records)if(!records.some(x=>x.id===r.id))records.push(r);localStorage.setItem('workshop-records',JSON.stringify(records));return reply(true);}
    if(action==='ready')return reply({connected:false});
    if(action==='aiStatus')return reply({available:true,message:'Test model ready'});
    if(action==='aiCancel'){window.cancelled=true;return reply(true);}
    if(action==='aiGenerate'){
     if(payload.maxTokens>1200)return reply(null,'Native request limit exceeded');
     window.requests.push(payload);window.cancelled=false;let text;
     if(payload.instructions.startsWith('Plan a single'))text='1. Discover the blue map.\n2. Trace its coastline.';
     else if(payload.instructions.startsWith('Write exactly one'))text='Mara unfolded the blue map. The ink shimmered.';
     else if(payload.instructions.startsWith('Revise only'))text='Neri';
     else if(payload.instructions.startsWith('Read a manuscript'))text='Mara found a map. Neri joined as a guide. In A map of somewhere else, the house held warm light.';
     else if(payload.instructions.startsWith('You condense'))text='Mara found a map and met Neri, a guide. The lighthouse was locked.';
     else if(payload.instructions.startsWith('Review a novel'))text=JSON.stringify({issues:[{title:'The locked lighthouse',detail:'It may be unclear how Mara entered.',evidence:'A map of somewhere else: “the locked door”',question:'Where did the key come from?',suggestion:'Establish the key before entry.'}]});
     else if(payload.instructions.startsWith('Update a novelist'))text=JSON.stringify({summaryAdditions:'Neri joins the journey.',developments:'The blue map begins to glow.',notes:'The lighthouse is locked.',characters:[{name:'Mara Ellery',role:'Restorer',evidence:'Opening chapter'},{name:'Neri',role:'Guide',appearance:'Silver eyes',evidence:'A map of somewhere else'}]});
     else text='A suggestion.';
     setTimeout(()=>{if(!window.cancelled)window.quillProgress({id,text})},30);
     return setTimeout(()=>reply(window.cancelled?null:text,window.cancelled?'Stopped':undefined),300);
    }
    reply(true);
   }}}};
  });
  const open=async()=>{await page.locator('[data-action="bookshelf"]').waitFor();await page.locator('[data-action="bookshelf"]').click();await page.locator('[data-action="open-book"]').first().click();await page.locator('[data-action="enter-write"]').click();};
  const close=async()=>{await page.locator('#modal [data-action="close"]').last().click();await page.waitForFunction(()=>!document.querySelector('#modal').open)};
  const ready=()=>page.waitForFunction(()=>document.querySelector('#work-status')?.textContent.startsWith('Suggestion ready')&&!document.querySelector('#work-stop')?.checkVisibility());
  const icons=async()=>assert.equal(await page.locator('button').evaluateAll(bs=>bs.filter(b=>!b.querySelector('svg.icon')).map(b=>b.textContent)).then(x=>x.length),0);
  await page.goto(process.env.QUILL_TEST_URL||'http://127.0.0.1:8088',{waitUntil:'domcontentloaded'});await open();
  assert(await page.locator('#editor').isVisible());assert.equal(await page.locator('.beat-block').count(),0);await icons();
  const original=await page.locator('#editor').innerText();
  await page.locator('[data-action="write-ai"]').click();await page.locator('#beat-brief').fill('Find the map, then study it.');
  await page.locator('[data-action="suggest-plan"]').click();await page.locator('#work-stop').waitFor({state:'visible'});await page.keyboard.press('Escape');assert(await page.locator('#modal').evaluate(e=>e.open));
  await page.waitForFunction(()=>document.querySelector('#work-status').textContent.startsWith('Beat map ready'));
  assert.equal(await page.evaluate(()=>window.requests.filter(r=>r.instructions.startsWith('Write exactly one')).length),0);
  await page.locator('#beat-plan-lines').fill('1. Discover a BLUE map.\n2. Trace its moving coastline.');
  await page.evaluate(()=>window.failSave=true);await page.locator('[aria-label="Back to manuscript"]').click();await page.waitForFunction(()=>document.querySelector('#work-status').textContent.startsWith('Save failed'));assert(await page.locator('#modal').evaluate(e=>e.open));
  await page.evaluate(()=>window.failSave=false);await page.locator('[aria-label="Back to manuscript"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
  await page.reload();await open();await page.locator('[data-action="write-ai"]').click();assert.match(await page.locator('#beat-plan-lines').inputValue(),/BLUE/);
  await page.locator('[data-action="save-plan"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.equal(await page.locator('.beat-block').count(),3);assert.equal(await page.locator('.beat-text').first().innerText(),original);
  await page.locator('[data-action="generate-beat"]').first().click();assert.match(await page.locator('#work-prompt').inputValue(),/BLUE/);await page.locator('[data-action="work-generate"]').click();await ready();assert.equal(await page.locator('.beat-text').nth(1).innerText(),'');
  assert.equal(await page.evaluate(()=>window.requests.filter(r=>r.instructions.startsWith('Write exactly one')).length),1);await page.locator('[data-action="work-apply"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.match(await page.locator('.beat-text').nth(1).innerText(),/unfolded/);assert.equal(await page.locator('.beat-text').nth(2).innerText(),'');
  await page.screenshot({path:'/tmp/quill-beats-test.png'});
  // Manual beat edits persist independently; selecting one word produces a scoped replacement.
  await page.locator('.beat-text').nth(1).fill('Mara found the blue map. Nothing else changed.');await page.evaluate(()=>window.quillFlush());
  await page.evaluate(()=>{const t=document.createTreeWalker(document.querySelectorAll('.beat-text')[1],NodeFilter.SHOW_TEXT).nextNode(),r=document.createRange();r.setStart(t,0);r.setEnd(t,4);getSelection().removeAllRanges();getSelection().addRange(r);});
  await page.locator('#selection-ai').waitFor();await page.waitForFunction(()=>!document.querySelector('#selection-ai').disabled);await page.locator('#selection-ai').click();assert.equal(await page.locator('.selection-excerpt').innerText(),'Mara');
  await page.locator('#work-prompt').fill('Replace the name with Neri.');await page.locator('[data-action="work-generate"]').click();await ready();await page.locator('[data-action="work-apply"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.equal(await page.locator('.beat-text').nth(1).innerText(),'Neri found the blue map. Nothing else changed.');assert.equal(await page.locator('.beat-text').first().innerText(),original);
  await page.locator('[data-action="toggle-beats"]').click();await page.locator('#next-writing-prompt').fill('She folds the map without leaving the room.');await page.locator('[data-action="generate-inline"]').click();await page.locator('[data-action="work-generate"]').click();await ready();
  // A concurrent revision prevents a stale replacement and retains its generated suggestion.
  await page.evaluate(async()=>{const {documents,revise}=await import('./core.js');const records=JSON.parse(localStorage.getItem('workshop-records'));const c=documents(records).find(d=>d.id==='sample-chapter-1');records.push(revise(c.id,{...c.revision.body,synopsis:'Changed on another device'},[c.revision.id]));localStorage.setItem('workshop-records',JSON.stringify(records));const channel=new BroadcastChannel('quill-library');channel.postMessage('changed');channel.close();});
  await page.waitForTimeout(80);await page.locator('[data-action="work-apply"]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('manuscript changed'));assert(await page.locator('#modal').evaluate(e=>e.open));await close();
  // Stop retains the streamed beat; no subsequent beat request starts.
  await page.locator('#next-writing-prompt').fill('A bell sounds.');await page.locator('[data-action="generate-inline"]').click();await page.locator('[data-action="work-generate"]').click();await page.waitForFunction(()=>document.querySelector('#work-result').value.includes('unfolded'));await page.locator('#work-stop').click();await page.waitForFunction(()=>document.querySelector('#work-status').textContent.startsWith('Stopped.'));assert.match(await page.locator('#work-result').inputValue(),/unfolded/);await close();
  // Add front/back matter; exports include it without a duplicate automatic title page.
  for(const type of ['dedication','prologue','epilogue','title-page']){await page.locator('[data-action="sidebar"]').click();await page.locator('[data-action="add-section"]').click();await page.locator('#section-type').selectOption(type);await page.locator('#section-form [type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);if(type==='dedication'){await page.locator('#editor').fill('For the patient reader.');await page.evaluate(()=>window.quillFlush());}}
  const exported=await page.evaluate(async()=>{const {documents}=await import('./core.js'),{manuscriptHTML,epub,docx}=await import('./export.js');const ds=documents(JSON.parse(localStorage.getItem('workshop-records'))),b=ds.find(d=>d.id==='sample-book'),cs=ds.filter(d=>d.type==='chapter').sort((a,b)=>a.order-b.order);return {order:cs.map(c=>c.sectionType||'chapter'),html:manuscriptHTML(b,cs),epub:new TextDecoder().decode(epub(b,cs)),docx:new TextDecoder().decode(docx(b,cs))};});
  assert(exported.order.indexOf('dedication')<exported.order.indexOf('chapter'));assert(exported.order.indexOf('epilogue')>exported.order.lastIndexOf('chapter'));assert.match(exported.html,/For the patient reader/);assert(!exported.epub.includes('title.xhtml'));assert.match(exported.docx,/For the patient reader/);assert(!exported.html.includes('data-beat-id'));
  await page.locator('[data-action="sidebar"]').click();await page.locator('[data-view="plot"]').click();const summaryBefore=await page.locator('#story-summary').inputValue();
  await page.locator('[data-action="scan-codex"]').click();await page.locator('[data-action="scan-run"]').click();await page.waitForFunction(()=>document.querySelector('#extra-status').textContent.startsWith('Review ready'));assert.equal(await page.locator('#story-summary').inputValue(),summaryBefore);assert.match(await page.locator('#scan-summary').inputValue(),/Neri/);await page.locator('#scan-summary').fill('Neri joins as a cautious guide.');await icons();await page.screenshot({path:'/tmp/quill-codex-review-test.png'});await page.locator('[data-action="scan-apply"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.equal(await page.locator('#story-summary').inputValue(),summaryBefore+'\n\nNeri joins as a cautious guide.');
  await page.locator('[data-tab="characters"]').click();assert.equal(await page.locator('.character-card').count(),2);await page.locator('.character-card').filter({hasText:'Mara Ellery'}).click();assert.match(await page.locator('#character-notes').inputValue(),/restorer of old books/);await page.locator('#character-form [data-action="close"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
  await page.locator('[data-tab="holes"]').click();await page.locator('[data-action="scan-holes"]').click();await page.locator('[data-action="scan-run"]').click();await page.waitForFunction(()=>document.querySelector('#extra-status').textContent.startsWith('Review ready'));assert.equal(await page.locator('.plot-hole').count(),0);await page.locator('[data-action="scan-apply"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.equal(await page.locator('.plot-hole').count(),1);await page.locator('[data-action="hole-status"][data-status="Resolved"]').click();await page.waitForFunction(()=>document.querySelector('.plot-hole .badge').textContent==='Resolved');await icons();
  await page.reload();await open();await page.locator('[data-action="sidebar"]').click();await page.locator('[data-view="plot"]').click();await page.locator('[data-tab="holes"]').click();assert.equal(await page.locator('.plot-hole .badge').innerText(),'Resolved');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  console.log('PASS: planned single-beat generation, no implicit chapter generation, manual beat and selected-word edits, unchanged adjacent text, plan persistence and failed-save retry, concurrent edit protection, stopped-text recovery, front/back sections and exports, reviewed Codex additions with character deduplication, plot-hole review and resolution, every button has an icon.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
