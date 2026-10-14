const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.QUILL_CHROME?{executablePath:process.env.QUILL_CHROME}:{})});
 let page;
 try{
  page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const click=async selector=>{await page.locator(selector).first().click();await page.locator('.scene-curtain').waitFor({state:'detached'});};
  const close=async()=>{await click('#modal [data-action="close"]');await page.waitForFunction(()=>!document.querySelector('#modal').open);};
  await page.goto(process.env.QUILL_TEST_URL||'http://127.0.0.1:8088',{waitUntil:'domcontentloaded'});await page.locator('.start-screen').waitFor();
  for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(size);assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
   const box=await page.locator('[data-action="settings"]').boundingBox();assert(box.y+box.height<=size.height-5);assert(!await page.locator('.start-screen').innerText().then(t=>t.includes('Your words stay yours')));
  }
  await page.setViewportSize({width:390,height:844});await click('[data-action="bookshelf"]');await click('[data-action="open-book"]');
  assert.equal(await page.locator('.menu-leaf [data-action="enter-write"]').count(),1);await click('[data-action="enter-write"]');
  assert.equal(await page.locator('.sidebar .side-nav').count(),0);assert.equal(await page.locator('.sidebar-bottom .art').count(),0);assert(await page.locator('.writing-tools [data-action="open-codex"]').isVisible());
  // The text engine matches split formatting, preserves structure, and rejects stale offsets.
  const engine=await page.evaluate(async()=>{
   const e=await import('./editing.js'),x=await import('./export.js');const html='<p>A <b>blue</b> <em>map</em>. Map maple map.</p><p>blue</p><p>map</p><hr data-page-break="true"><p>End.</p>';
   const matches=e.findText(html,'blue map'),all=e.findText(html,'map'),out=e.replaceText(html,matches,'red chart');let stale=false;try{e.replaceText(html,[{...matches[0],text:'wrong'}],'x')}catch{stale=true}
   const book={id:'test',title:'Test'},chapters=[{title:'Chapter',html:out}];
   return {matches:matches.length,all:all.length,case:e.findText(html,'map',{matchCase:true}).length,out,stale,adjacent:e.replaceText('<p>map map</p>',e.findText('<p>map map</p>','map'),'chart'),docx:new TextDecoder().decode(x.docx(book,chapters)),epub:new TextDecoder().decode(x.epub(book,chapters)),plain:x.plain(out),safe:x.sanitize('<hr data-page-break="true" onclick="bad()"><hr data-page-break="false">')};
  });
  assert.equal(engine.matches,1);assert.equal(engine.all,4);assert.equal(engine.case,3);assert(engine.stale);assert.match(engine.out,/<b>red chart<\/b>/);assert.match(engine.out,/data-page-break="true"/);assert.equal(engine.adjacent,'<p>chart chart</p>');assert.match(engine.docx,/<w:br w:type="page"/);assert.match(engine.epub,/page-break-after:always/);assert(engine.plain.includes('\f'));assert.equal(engine.safe,'<hr data-page-break="true"><hr>');
  await page.evaluate(()=>{const editor=document.querySelector('#editor');editor.innerHTML='<div data-beat-id="sample-chapter-1-body"><p>Mispeling by Zorvanya. A <b>blue</b> <em>map</em> and another map.</p></div>';editor.dispatchEvent(new Event('input',{bubbles:true}));});await page.evaluate(()=>window.quillFlush());
  await click('.writing-tools [data-action="search"]');await page.locator('#search-input').fill('blue map');assert.match(await page.locator('#search-count').innerText(),/1 matches/);await page.locator('#replace-input').fill('red chart');await click('[data-action="replace-all"]');await page.waitForFunction(()=>document.querySelector('#editor').textContent.includes('red chart and another map'));assert.match(await page.locator('#editor').innerText(),/red chart and another map/);assert.equal(await page.locator('#editor b').innerText(),'red chart');await close();
  await click('[data-action="spell-check"]');await page.waitForFunction(()=>document.querySelector('.spelling-issue h3')?.textContent==='Mispeling');await page.locator('#spell-replacement').fill('Misspelling');await click('[data-action="spell-replace"]');await page.waitForFunction(()=>document.querySelector('.spelling-issue h3')?.textContent==='Zorvanya');await click('[data-action="spell-remember"]');await page.waitForFunction(()=>document.querySelector('#spell-status').textContent.startsWith('Spelling review complete'));assert.match(await page.evaluate(()=>localStorage.getItem('quill-personal-dictionary')),/Zorvanya/);await close();
  await page.locator('#editor').click();await page.keyboard.press('End');await click('[data-action="page-break"]');assert.equal(await page.locator('#editor hr[data-page-break="true"]').count(),1);await page.evaluate(()=>window.quillFlush());
  // Last edited section and scroll position survive the book menu and a reload.
  await click('[data-action="sidebar"]');await click('[data-action="open-chapter"][data-id="sample-chapter-2"]');
  await page.locator('#editor').fill(Array.from({length:90},(_,i)=>`Paragraph ${i}. Mara follows the shoreline.\n`).join(''));await page.evaluate(()=>window.quillFlush());
  await page.evaluate(()=>{document.querySelector('#editor').blur();document.querySelector('#main-content').scrollTop=650;});await click('[data-action="book-door"]');await click('[data-action="enter-write"]');assert.equal(await page.locator('#chapter-title').inputValue(),'The room without a door');await page.waitForFunction(()=>document.querySelector('#main-content').scrollTop>=640);
  // Selection action floats with the highlighted text and hides when selection ends.
  // Select a visible paragraph after scrolling, independent of text layout and viewport wrapping.
  await page.evaluate(()=>{document.querySelector('#main-content').scrollTop=0;const root=document.querySelector('#editor [data-beat-id]'),node=document.createTreeWalker(root,NodeFilter.SHOW_TEXT).nextNode(),r=document.createRange();r.setStart(node,0);r.setEnd(node,9);getSelection().removeAllRanges();getSelection().addRange(r);});
  await page.locator('#selection-ai').waitFor({state:'visible'});const pop=await page.locator('#selection-ai').boundingBox();const rect=await page.evaluate(()=>getSelection().getRangeAt(0).getBoundingClientRect().toJSON());assert(pop.y+pop.height<=rect.y+1);assert(pop.x>=0&&pop.x+pop.width<=390);
  await page.evaluate(()=>getSelection().removeAllRanges());await page.locator('#selection-ai').waitFor({state:'hidden'});
  await page.reload();await click('[data-action="bookshelf"]');await click('[data-action="open-book"]');await click('[data-action="enter-write"]');assert.equal(await page.locator('#chapter-title').inputValue(),'The room without a door');
  // A changed section must not accept a stale replacement.
  await click('.writing-tools [data-action="search"]');await page.locator('#search-input').fill('Mara');await page.locator('#replace-input').fill('Neri');await page.evaluate(async()=>{const s=await import('./storage.js'),core=await import('./core.js');await s.openStorage();const c=core.documents(await s.load()).find(c=>c.id==='sample-chapter-2');await s.put([core.revise(c.id,{...c.revision.body,synopsis:'Changed elsewhere'},[c.revision.id])]);});await click('[data-action="replace-all"]');await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('manuscript changed'));assert(!await page.locator('#editor').innerText().then(t=>t.includes('Neri')));await close();
  assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/quill-editing-test.png'});console.log('Editing, spelling, page breaks, selection popover, navigation and desk layout passed');
 }catch(e){if(page){console.log(await page.evaluate(()=>({toast:document.querySelector('#toast')?.textContent,modal:document.querySelector('#modal')?.textContent,scroll:document.querySelector('#main-content')?.scrollTop})));await page.screenshot({path:'/tmp/quill-editing-failure-test.png'});}throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
