const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.QUILL_CHROME?{executablePath:process.env.QUILL_CHROME}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const settled=()=>page.locator('.scene-curtain').waitFor({state:'detached'});
  const click=async selector=>{await page.locator(selector).click();await settled();};
  const noOverflow=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.goto(process.env.QUILL_TEST_URL||'http://127.0.0.1:8088',{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="bookshelf"]').waitFor();await noOverflow();
  await page.screenshot({path:'/tmp/quill-start-test.png'});
  await click('[data-action="settings"]');assert.equal(await page.locator('#modal [data-action="manage-drafts"]').count(),0);
  assert(await page.locator('#modal [data-action="manage-models"]').isVisible());
  await page.locator('#modal [data-action="close"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
  await click('[data-action="bookshelf"]');assert.equal(await page.locator('.shelf-book').count(),1);
  await page.locator('[data-action="new-book"]').first().click();await page.locator('#book-title').fill('The Star Orchard');
  await page.locator('#cover-file').setInputFiles(path.join(__dirname,'../docs/art/codex.webp'));
  await page.waitForFunction(()=>document.querySelector('#cover-status').textContent.startsWith('Ready.'));
  await page.locator('#book-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
  assert(await page.locator('[data-action="enter-codex"]').isVisible());assert(await page.locator('[data-action="enter-write"]').isVisible());assert(await page.locator('.book-door-cover .book-cover-image').isVisible());
  await noOverflow();await page.screenshot({path:'/tmp/quill-book-door-test.png'});
  await click('[data-action="home"]');assert.equal(await page.locator('.shelf-book').count(),2);assert.equal(await page.locator('.shelf-book .book-cover-image').count(),1);await noOverflow();
  await page.screenshot({path:'/tmp/quill-bookshelf-test.png'});
  await click('.shelf-book:has-text("The Star Orchard")');await click('[data-action="enter-codex"]');
  await page.locator('#story-summary').fill('An orchard whose fruit remembers the stars.');await page.evaluate(()=>window.quillFlush());
  await click('[data-action="book-door"]');await click('[data-action="enter-write"]');
  await page.locator('#editor').fill('This manuscript must survive draft cleanup.');await page.evaluate(()=>window.quillFlush());
  const seeded=await page.evaluate(async()=>{
   const core=await import('./core.js'),s=await import('./storage.js');await s.openStorage();const records=await s.load(),docs=core.documents(records);
   const book=docs.find(d=>d.title==='The Star Orchard'),chapter=docs.find(d=>d.book===book.id&&d.type==='chapter');
   const body={type:'card',book:book.id,category:'Generated draft',chapter:chapter.id,sourceRevision:chapter.revision.id,title:'Used chapter draft',deleted:false,html:'<p>Obsolete text '.repeat(2000)+'</p>',outline:'Private outline',prompt:'Private brief',status:'Used'};
   const a=core.revise('cleanup-a',body),b=core.revise('cleanup-a',{...body,html:'<p>Used text</p>'},[a.id]);
   const outline=core.revise('cleanup-outline',{...body,title:'Keep this outline',html:'',status:'Outline ready'}),suggestion=core.revise('cleanup-suggestion',{type:'card',book:book.id,category:'Codex suggestion',title:'Used character suggestion',deleted:false,html:'<p>Discard this suggestion</p>',status:'Used character'});
   const other=core.revise('other-book-draft',{...body,book:'sample-book',title:'Other book draft'});
   await s.put([a,b,outline,suggestion,other]);window.originalDrafts=[a,b,suggestion];return {book:book.id,chapter:chapter.id};
  });
  await page.reload();await click('[data-action="bookshelf"]');await click('.shelf-book:has-text("The Star Orchard")');
  assert(await page.locator('.book-door-cover .book-cover-image').isVisible());await click('[data-action="manage-drafts"]');
  assert.equal(await page.locator('.draft-row').count(),3);assert(!await page.locator('#draft-list').innerText().then(t=>t.includes('Other book draft')));
  await page.locator('#draft-filter').selectOption('used');assert.equal(await page.locator('.draft-row').count(),2);
  await page.locator('[data-action="review-draft"]').first().click();assert(await page.locator('[data-action="export-draft"]').isVisible());
  await page.locator('[data-action="back-drafts"]').click();await page.locator('#draft-select-all').check();await page.locator('#delete-selected-drafts').click();
  assert.match(await page.locator('#modal-title').innerText(),/2 drafts/);
  await page.locator('[data-action="back-drafts"]').click();assert.equal(await page.locator('.draft-row').count(),2); // Confirmation can be cancelled.
  await page.locator('#draft-select-all').check();await page.locator('#delete-selected-drafts').click();await page.locator('[data-action="confirm-draft-delete"]').click();
  await page.waitForFunction(()=>document.querySelector('#draft-filter'));
  await page.locator('#draft-filter').selectOption('all');await page.waitForFunction(()=>document.querySelectorAll('.draft-row').length===1);
  assert.match(await page.locator('#draft-list').innerText(),/Keep this outline/);await noOverflow();await page.screenshot({path:'/tmp/quill-drafts-test.png'});
  const saved=await page.evaluate(async()=>{
   const s=await import('./storage.js'),core=await import('./core.js');await s.openStorage();
   const rows=await s.load(),marker=rows.find(r=>r.entity==='cleanup-a');
   // A stale tab attempts to write discarded data back into the real IndexedDB store.
   await s.put([core.revise('cleanup-a',{type:'card',book:marker.body.book,category:'Generated draft',chapter:marker.body.chapter,sourceRevision:marker.body.sourceRevision,title:'Late offline draft',deleted:false,html:'must not return'})]);
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('quill-writer',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
   return new Promise((resolve,reject)=>{const r=db.transaction('revisions').objectStore('revisions').getAll();r.onsuccess=()=>{resolve(r.result);db.close()};r.onerror=()=>reject(r.error)});
  });
  assert.equal(saved.filter(r=>r.entity==='cleanup-a').length,1);assert(saved.find(r=>r.entity==='cleanup-a').body.purged);assert(!JSON.stringify(saved.filter(r=>r.entity==='cleanup-a')).includes('Obsolete text'));assert(saved.some(r=>r.entity==='other-book-draft'));assert(saved.some(r=>r.entity===seeded.chapter&&r.body.html.includes('must survive')));assert(saved.some(r=>r.body.category==='Book cover'&&r.body.portrait));
  await page.evaluate(async()=>{
   const s=await import('./storage.js'),core=await import('./core.js');await s.openStorage();const local=await s.load(),marker=local.find(r=>r.entity==='cleanup-a');
   const stale=core.revise('cleanup-a',{type:'card',book:marker.body.book,category:'Generated draft',chapter:marker.body.chapter,sourceRevision:marker.body.sourceRevision,title:'Old synced text',deleted:false,html:'stale'}),other=local.find(r=>r.entity==='other-book-draft');
   const entries=new Map([[stale.id+'.json',JSON.stringify(stale)],[other.id+'.json',JSON.stringify(other)]]);let failWrite=true,removed=0;
   const dir={async *entries(){for(const [name,value] of entries)yield [name,{kind:'file',getFile:async()=>({size:value.length,text:async()=>value})}]},getFileHandle:async name=>({createWritable:async()=>({write:async value=>{if(failWrite)throw Error('Disk full');entries.set(name,value)},close:async()=>{}})}),removeEntry:async name=>{removed++;entries.delete(name)}};
   window.showDirectoryPicker=async()=>({name:'test',getDirectoryHandle:async()=>dir});await s.connectFolder();
   let failed=false;try{await s.sync(local)}catch{failed=true}if(!failed||removed)throw Error('Sync removed text before its marker was saved');
   failWrite=false;await s.sync(local);if(entries.has(stale.id+'.json')||!entries.has(marker.id+'.json')||!entries.has(other.id+'.json'))throw Error('Sync draft cleanup failed');await s.disconnectFolder();
  });
  await page.locator('#modal [data-action="close"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
  await click('[data-action="enter-write"]');assert.match(await page.locator('#editor').innerText(),/must survive/);
  await page.screenshot({path:'/tmp/quill-writing-test.png'});
  await page.setViewportSize({width:1280,height:900});await click('[data-action="home"]');await noOverflow();await page.screenshot({path:'/tmp/quill-desktop-test.png'});
  await page.emulateMedia({reducedMotion:'reduce'});await click('[data-action="start-screen"]');await click('[data-action="settings"]');await page.locator('[data-action="theme"]').click();assert(await page.locator('body').evaluate(e=>e.classList.contains('dark')));await page.locator('#modal [data-action="close"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);await click('[data-action="bookshelf"]');await noOverflow();
  assert.deepEqual(errors,[]);console.log('PASS: opening navigation, animated shelf and book menu, uploaded covers persist, book-scoped draft review/cancel/bulk cleanup, real IndexedDB byte removal and stale write suppression, manuscript and other-book protection, responsive layouts and dark/reduced-motion navigation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
