// Run with Playwright installed and QUILL_TEST_URL pointing to the served docs/ directory.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.QUILL_CHROME?{executablePath:process.env.QUILL_CHROME}:{})});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      // Exercise the real UI/storage bridge with deterministic inference, not model-quality assertions.
      window.quillTestRequests=[];
      window.webkit={messageHandlers:{quill:{postMessage:({id,action,payload})=>{
        const reply=(result,error)=>setTimeout(()=>window.quillReply({id,result,error}),10);
        let records=JSON.parse(localStorage.getItem('quill-test-records')||'[]');
        if(action==='load')return reply(records);
        if(action==='save'){if(window.quillTestFailSave)return reply(null,'Storage unavailable');for(const r of payload.records)if(!records.some(x=>x.id===r.id))records.push(r);localStorage.setItem('quill-test-records',JSON.stringify(records));return reply(true);}
        if(action==='ready')return reply({connected:false});
        if(action==='aiStatus')return reply({available:true,message:'Test device ready'});
        if(action==='aiCheckUpdate')return reply({available:true,message:'An update is available.'});
        if(action==='aiUpdate')return reply('Qwen is installed and up to date.');
        if(action==='aiCancel'){window.quillTestCancelled=true;return reply(true);}
        if(action==='aiGenerate'){
          window.quillTestRequests.push(payload);window.quillTestCancelled=false;
          const output=payload.instructions.startsWith('Plan a single')?'1. Find a map.\n2. Read the map.':payload.prompt.includes('part 1 of')?'Mara found the map.':'She traced the moving coastline.';
          setTimeout(()=>{if(!window.quillTestCancelled)window.quillProgress({id,text:output});},50);
          return setTimeout(()=>reply(window.quillTestCancelled?null:output,window.quillTestCancelled?'Stopped':undefined),350);
        }
        reply(true);
      }}}};
    });
    await page.goto(process.env.QUILL_TEST_URL||'http://127.0.0.1:8088');
    await page.locator('[data-action="open-book"]').first().click();
    await page.locator('[data-action="sidebar"]').click();
    assert(await page.locator('body').evaluate(el=>el.classList.contains('sidebar-open')));
    // Tap the exposed manuscript area, closing the sidebar without intercepting the text interaction.
    await page.mouse.click(375,430);
    assert(!await page.locator('body').evaluate(el=>el.classList.contains('sidebar-open')));
    await page.locator('[data-action="sidebar"]').click();
    await page.locator('[data-view="plot"]').click();
    await page.locator('#plot-beats').fill('Opening: Mara finds a map.\nEnding: the lighthouse is her father’s home.');
    await page.locator('#writing-style').fill('Third person, past tense.');
    await page.evaluate(()=>window.quillFlush());
    await page.reload();await page.locator('[data-action="open-book"]').first().click();await page.locator('[data-action="sidebar"]').click();await page.locator('[data-view="plot"]').click();
    assert.match(await page.locator('#plot-beats').inputValue(),/lighthouse/);
    await page.screenshot({path:process.env.QUILL_UI_SCREENSHOT||'/tmp/quill-plot-test.png'});
    await page.locator('[data-action="sidebar"]').click();await page.locator('[data-action="open-chapter"]').first().click();
    const original=await page.locator('#editor').innerText();
    await page.locator('[data-action="inspector"]').click();
    await page.mouse.click(1,1);await page.waitForFunction(()=>!document.querySelector('#modal').open);
    await page.locator('[data-action="write-ai"]').click();await page.locator('#ai-model').selectOption('qwen-0.6');
    await page.locator('[data-action="qwen-check-update"]').click();await page.locator('#qwen-download-update').waitFor({state:'visible'});
    await page.locator('#qwen-download-update').click();await page.waitForFunction(()=>document.querySelector('#ai-progress').textContent.includes('up to date'));
    const bounds=await page.locator('#modal').boundingBox();assert.deepEqual(bounds,{x:0,y:0,width:390,height:844});
    await page.locator('#ai-prompt').fill('Find the map. Do not reveal the lighthouse yet.');await page.locator('#ai-length').selectOption('500');await page.locator('#ai-generate').click();
    await page.locator('#ai-stop').waitFor({state:'visible'});await page.keyboard.press('Escape');assert(await page.locator('#modal').evaluate(el=>el.open));
    assert(await page.locator('[aria-label="Back to manuscript"]').isDisabled());
    await page.waitForFunction(()=>document.querySelector('#ai-progress')?.textContent.startsWith('Outline ready'));
    assert.equal(await page.locator('#editor').innerText(),original);
    assert(await page.locator('#ai-review').isHidden());
    assert.equal(await page.evaluate(()=>window.quillTestRequests.length),1); // No prose without approval.
    await page.locator('#ai-outline').fill('x'.repeat(2401));assert(await page.locator('#ai-write').isDisabled());
    const approved='1. Mara finds the map beneath a BLUE lantern.\n2. She traces it but stays inside.';
    await page.locator('#ai-outline').fill(approved);
    // A failed save keeps the outline screen open; retry saves the exact edits.
    await page.evaluate(()=>window.quillTestFailSave=true);
    await page.locator('[aria-label="Back to manuscript"]').click();
    await page.waitForFunction(()=>document.querySelector('#ai-outline-saved').textContent.startsWith('Save failed'));
    assert(await page.locator('#modal').evaluate(el=>el.open));assert.equal(await page.locator('#ai-outline').inputValue(),approved);
    await page.evaluate(()=>window.quillTestFailSave=false);
    await page.locator('[aria-label="Back to manuscript"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
    await page.reload();await page.locator('[data-action="open-book"]').first().click();await page.locator('[data-action="write-ai"]').click();
    assert.equal(await page.locator('#ai-outline').inputValue(),approved);assert.equal(await page.locator('#ai-model').inputValue(),'qwen-0.6');
    await page.locator('#ai-outline-section').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/quill-outline-review.png'});
    await page.locator('#ai-write').click();await page.locator('#ai-stop').waitFor({state:'visible'});await page.keyboard.press('Escape');assert(await page.locator('#modal').evaluate(el=>el.open));
    await page.waitForFunction(()=>document.querySelector('#ai-progress')?.textContent.startsWith('Draft ready'));
    assert.equal(await page.locator('#editor').innerText(),original);
    assert.match(await page.locator('#ai-draft-text').inputValue(),/Mara found the map/);
    const requests=await page.evaluate(()=>window.quillTestRequests);assert.equal(requests.length,2);assert(requests.every(r=>r.model==='qwen-0.6'&&r.prompt.includes(approved)&&r.instructions.startsWith('Write polished')));assert(requests.some(r=>r.prompt.includes('lighthouse is her father')));
    await page.locator('#ai-use').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.match(await page.locator('#editor').innerText(),/moving coastline/);
    const records=await page.evaluate(()=>JSON.parse(localStorage.getItem('quill-test-records')));assert(records.some(r=>r.body.html?.includes('The house at the end of the lane')));
    // A new outline can be stopped without touching the accepted manuscript or older drafts.
    await page.locator('[data-action="write-ai"]').click();await page.locator('#ai-generate').click();await page.locator('#ai-stop').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#ai-outline').value.includes('Find a map'));
    await page.locator('#ai-stop').click();await page.waitForFunction(()=>document.querySelector('#ai-progress')?.textContent.includes('Writing stopped'));
    assert.match(await page.locator('#ai-outline').inputValue(),/Find a map/);
    await page.locator('#ai-write').click();await page.locator('#ai-stop').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#ai-draft-text').value.includes('Mara found'));
    await page.locator('#ai-stop').click();await page.waitForFunction(()=>document.querySelector('#ai-progress')?.textContent.includes('Writing stopped'));
    assert.match(await page.locator('#ai-draft-text').inputValue(),/Mara found/);
    await page.locator('[aria-label="Back to manuscript"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
    await page.reload();await page.locator('[data-action="open-book"]').first().click();assert.match(await page.locator('#editor').innerText(),/moving coastline/);
    // Failed generation checkpoints keep the streamed outline recoverable and allow a save retry.
    await page.locator('[data-action="write-ai"]').click();await page.locator('#ai-generate').click();
    await page.waitForFunction(()=>window.quillTestRequests.length===1);await page.evaluate(()=>window.quillTestFailSave=true);
    await page.waitForFunction(()=>document.querySelector('#ai-progress')?.textContent.startsWith('Draft could not be saved'));
    assert.match(await page.locator('#ai-outline').inputValue(),/Find a map/);
    await page.evaluate(()=>window.quillTestFailSave=false);await page.locator('[aria-label="Back to manuscript"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
    await page.locator('[data-action="write-ai"]').click();assert.match(await page.locator('#ai-outline').inputValue(),/Find a map/);
    assert.deepEqual(errors,[]);console.log('PASS: full-screen outline review, explicit approval, exact edited outline, autosave/reload and failed-save recovery, locked generation, both-stage cancellation, model switching/updates and manuscript protection.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
