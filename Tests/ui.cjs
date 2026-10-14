// Run with Playwright installed and QUILL_TEST_URL pointing to the served docs/ directory.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.QUILL_CHROME?{executablePath:process.env.QUILL_CHROME}:{})});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const openBook=async()=>{await page.locator('[data-action="bookshelf"]').waitFor();await page.locator('[data-action="bookshelf"]').click();await page.locator('[data-action="open-book"]').first().click();await page.locator('[data-action="enter-write"]').click();};const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      // Exercise the real UI/storage bridge with deterministic inference, not model-quality assertions.
      window.quillTestRequests=[];
      window.webkit={messageHandlers:{quill:{postMessage:({id,action,payload})=>{
        const reply=(result,error)=>setTimeout(()=>window.quillReply({id,result,error}),10);
        let records=JSON.parse(localStorage.getItem('quill-test-records')||'[]');
        if(action==='apiProfiles')return reply(JSON.parse(localStorage.getItem('quill-test-api')||'[]'));
        if(action==='apiSave'){localStorage.setItem('quill-test-api',JSON.stringify([{...payload.profile,hasKey:!!payload.key}]));return reply(true);}
        if(action==='portraitStatus')return reply(true);
        if(action==='portraitGenerate')return reply('data:image/jpeg;base64,YQ==');
        if(action==='aiModels')return reply([{id:'qwen-0.6',installed:true,bytes:400000000}]);
        if(action==='aiDeleteModel'){window.quillDeletedModel=payload.model;return reply(true);}
        if(action==='load')return reply(records);
        if(action==='save'){if(window.quillTestFailSave)return reply(null,'Storage unavailable');for(const r of payload.records)if(!records.some(x=>x.id===r.id))records.push(r);localStorage.setItem('quill-test-records',JSON.stringify(records));return reply(true);}
        if(action==='ready')return reply({connected:false});
        if(action==='aiStatus')return reply({available:true,message:'Test device ready'});
        if(action==='aiCheckUpdate')return reply({available:true,message:'An update is available.'});
        if(action==='aiUpdate'){setTimeout(()=>window.quillProgress({id,status:'Downloading model · 42%'}),40);return setTimeout(()=>reply('Qwen is installed and up to date.'),450);}
        if(action==='aiCancel'){window.quillTestCancelled=true;return reply(true);}
        if(action==='aiGenerate'){
          window.quillTestRequests.push(payload);window.quillTestCancelled=false;
          const output=payload.instructions.startsWith('Create one fictional')?JSON.stringify({name:'Neri',role:'Navigator',appearance:'Silver eyes',motivation:'Find her brother'}):payload.instructions.startsWith('Help a novelist')?'Neri hears a whale sing.':payload.instructions.startsWith('Plan a single')?'1. Find a map.\n2. Read the map.':payload.prompt.includes('part 1 of')?'Mara found the map.':'She traced the moving coastline.';
          setTimeout(()=>{if(!window.quillTestCancelled)window.quillProgress({id,text:output});},50);
          return setTimeout(()=>reply(window.quillTestCancelled?null:output,window.quillTestCancelled?'Stopped':undefined),350);
        }
        reply(true);
      }}}};
    });
    await page.goto(process.env.QUILL_TEST_URL||'http://127.0.0.1:8088',{waitUntil:'domcontentloaded'});
    await openBook();
    await page.locator('[data-action="sidebar"]').click();
    assert(await page.locator('body').evaluate(el=>el.classList.contains('sidebar-open')));
    // Tap the exposed manuscript area, closing the sidebar without intercepting the text interaction.
    await page.mouse.click(375,430);
    assert(!await page.locator('body').evaluate(el=>el.classList.contains('sidebar-open')));
    await page.locator('[data-action="sidebar"]').click();
    await page.locator('[data-view="plot"]').click();
    await page.locator('[data-tab="beats"]').click();
    await page.locator('#plot-beats').fill('Opening: Mara finds a map.\nEnding: the lighthouse is her father’s home.');
    await page.locator('[data-tab="style"]').click();
    await page.locator('#writing-style').fill('Third person, past tense.');
    await page.evaluate(()=>window.quillFlush());
    await page.reload();await openBook();await page.locator('[data-action="sidebar"]').click();await page.locator('[data-view="plot"]').click();
    await page.locator('[data-tab="beats"]').click();
    assert.match(await page.locator('#plot-beats').inputValue(),/lighthouse/);
    await page.screenshot({path:process.env.QUILL_UI_SCREENSHOT||'/tmp/quill-plot-test.png'});
    await page.locator('[data-action="sidebar"]').click();await page.locator('[data-action="open-chapter"]').first().click();
    const original=await page.locator('#editor').innerText();
    await page.locator('[data-action="inspector"]').click();
    await page.mouse.click(1,1);await page.waitForFunction(()=>!document.querySelector('#modal').open);
    await page.locator('[data-action="write-ai"]').click();
    assert.match(await page.locator('#modal-title').innerText(),/Map this chapter/);
    const bounds=await page.locator('#modal').boundingBox();assert.deepEqual(bounds,{x:0,y:0,width:390,height:844});
    await page.locator('[aria-label="Back to manuscript"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
    // Codex migration, manual and generated characters, portrait persistence, and reviewed beats.
    await page.locator('[data-action="sidebar"]').click();await page.locator('[data-view="plot"]').click();await page.locator('[data-tab="summary"]').click();
    await page.locator('#story-summary').fill('A city built on a sleeping whale.');await page.locator('[data-tab="characters"]').click();
    assert.equal(await page.locator('.character-card').count(),1); // Existing Character cards appear immediately.
    await page.locator('[data-action="new-character"]').click();await page.locator('#character-title').fill('Neri');await page.locator('#character-appearance').fill('Silver eyes');await page.locator('#character-motivation').fill('Find her brother');
    await page.locator('[data-action="generate-portrait"]').click();await page.waitForFunction(()=>document.querySelector('#character-portrait').getAttribute('src')?.startsWith('data:image/jpeg'));
    await page.locator('#character-form [data-action="close"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
    await page.waitForFunction(()=>document.querySelectorAll('.character-card').length===2);
    assert.equal(await page.locator('.character-card').count(),2);
    await page.reload();await openBook();await page.locator('[data-action="sidebar"]').click();await page.locator('[data-view="plot"]').click();
    assert.equal(await page.locator('#story-summary').inputValue(),'A city built on a sleeping whale.');await page.locator('[data-tab="characters"]').click();
    await page.locator('.character-card').filter({hasText:'Neri'}).click();assert.equal(await page.locator('#character-appearance').inputValue(),'Silver eyes');assert(await page.locator('#character-portrait').isVisible());
    await page.locator('.character-ai summary').click();await page.locator('#codex-model').selectOption('llama-1b');await page.locator('[data-action="generate-codex"]').click();
    await page.waitForFunction(()=>document.querySelector('#extra-stop')&&!document.querySelector('#extra-stop').hidden);await page.keyboard.press('Escape');assert(await page.locator('#modal').evaluate(el=>el.open));
    await page.waitForFunction(()=>document.querySelector('#extra-status').textContent.startsWith('Suggestion ready'));
    assert.equal(await page.locator('#character-title').inputValue(),'Neri');await page.locator('[data-action="apply-character"]').click();await page.waitForFunction(()=>document.querySelector('#character-title').value==='Neri');
    assert.equal(await page.locator('#character-role').inputValue(),'Navigator');await page.locator('#character-form [data-action="close"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
    await page.locator('[data-tab="beats"]').click();const oldPlot=await page.locator('#plot-beats').inputValue();await page.locator('[data-action="next-beat"]').click();await page.locator('[data-action="generate-codex"]').click();await page.waitForFunction(()=>document.querySelector('#extra-status').textContent.startsWith('Suggestion ready'));
    assert.equal(await page.locator('#plot-beats').inputValue(),oldPlot);await page.locator('#codex-suggestion').fill('Neri follows the whale song.');await page.locator('[data-action="apply-beat"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.equal(await page.locator('#plot-beats').inputValue(),oldPlot+'\n\nNeri follows the whale song.');
    const codexRequests=await page.evaluate(()=>window.quillTestRequests);assert(codexRequests.some(r=>r.model==='llama-1b'&&r.prompt.includes('sleeping whale')&&r.prompt.includes('Find her brother')));
    await page.locator('[data-action="sidebar"]').click();await page.locator('[data-action="manage-models"]').click();await page.waitForFunction(()=>document.querySelector('#model-list').textContent.includes('Llama'));
    assert.match(await page.locator('#model-list').innerText(),/Gemma/);await page.locator('[data-action="install-model"][data-id="llama-1b"]').click();await page.waitForFunction(()=>document.querySelector('[data-model-row="llama-1b"] [role="progressbar"]')?.getAttribute('aria-valuenow')==='42');assert.equal(await page.locator('[data-model-row="llama-1b"] .download-percent').innerText(),'42%');await page.waitForFunction(()=>document.querySelector('#modal').getAttribute('aria-busy')==='false'&&document.querySelector('#model-list')?.textContent.includes('Llama')); await page.locator('[data-action="delete-model"][data-id="qwen-0.6"]').click();await page.locator('[data-action="confirm-model-delete"]').click();await page.waitForFunction(()=>window.quillDeletedModel==='qwen-0.6');
    await page.locator('[data-action="new-api"]').click();await page.locator('#api-name').fill('My provider');await page.locator('#api-endpoint').fill('https://provider.example/v1');await page.locator('#api-model-id').fill('my-model');await page.locator('#api-key').fill('test-key');await page.locator('#api-form [type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#api-list')?.textContent.includes('My provider'));
    await page.screenshot({path:'/tmp/quill-manage-models.png'});
    assert.deepEqual(errors,[]);console.log('PASS: full-screen beat planner entry, model switching/updates, Codex migration and context, character and portrait persistence, reviewed next beats, model deletion, API setup and manuscript protection.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
