import {manuscriptText,findText,replaceText,spellingWords,spellingEngine,personalWords,rememberWord} from './editing.js';
import {sectionTypes,sectionLabel,sectionGroup,sectionOrder,sectionTemplate,manuscriptBeats,joinBeats,planLines,applyBeatPlan,parseAnalysis,normalizedName} from './writing.js';
import {controlIcons,actionIcons,buttonIconName} from './icons.js';
import {draftKind,draftMatches,downloadProgress} from './drafts.js';
import {characterFields,characterContext,parseCharacter,portraitPrompt} from './codex.js';
import {localModels,isLocalModel} from './models.js';
import {loadConnections,connections,saveConnection,deleteConnection} from './connections.js';
import {uuid,union,heads,documents,revise,countWords,backup,fromBackup,purgeDraft,draftStorage,escapeXML as esc} from './core.js';
import * as storage from './storage.js';
import {sanitize,plain,manuscriptHTML,epub,docx} from './export.js';
import {chapterLengths,textToHTML,canUseDraft,buildChapterContext,generateChapter,generateChapterOutline,generateCodex,outlineLimit,generateBeat,revisePassage,analyzeManuscript} from './ai.js';
import {modelChoices,checkModel,createWriter,checkQwenUpdate,updateQwen,modelStorage,deleteModel} from './ai-runtime.js';
const $=s=>document.querySelector(s), app=$('#app'), modal=$('#modal');
const icons={book:'M3 3h6a3 3 0 0 1 3 3v15a4 4 0 0 0-4-2H3z M21 3h-6a3 3 0 0 0-3 3v15a4 4 0 0 1 4-2h5z',write:'m16 3 5 5-12 12-6 1 1-6z M14 5l5 5',grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',plus:'M12 5v14 M5 12h14',search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',focus:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',export:'M12 15V2 M7 7l5-5 5 5 M4 13v8h16v-8',back:'M15 4l-8 8 8 8',menu:'M4 6h16 M4 12h16 M4 18h16',clock:'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',note:'M5 2h14v20H5z M8 7h8 M8 11h8 M8 15h5',trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',sync:'M20 6v5h-5 M4 18v-5h5 M5 8a8 8 0 0 1 14-3l1 6 M19 16A8 8 0 0 1 5 19l-1-6',info:'M12 11v6 M12 7v.1 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',check:'m5 12 4 4L19 6'};
const icon=n=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${controlIcons[n]||icons[n]||controlIcons.info}"/></svg>`;
const btn=(action,label,i='',classes='',extra='')=>`<button type="button" class="btn ${classes}" data-action="${action}" ${extra}>${icon(actionIcons[action]||i||'info')}${label}</button>`;
const art=(name,classes='')=>`<img class="art ${classes}" src="art/${name}.webp" width="64" height="64" alt="" aria-hidden="true">`;
const brand=`<span class="brand">${art('quill','brand-art')}Quill<span class="brand-star" aria-hidden="true">✦</span></span>`;
const illustratedHead=(name,title,kicker,description='')=>`<header class="illustrated-heading">${art(name,'heading-art')}<div><span class="eyebrow">${kicker}</span><h2 id="modal-title" class="modal-title">${title}</h2>${description?`<p class="modal-desc">${description}</p>`:''}</div></header>`;
const buttonArt={'new-book':'quill','write-ai':'quill','ai-write':'quill','next-beat':'quill','generate-codex':'quill','manage-models':'models','manage-drafts':'drafts','ai-plot':'codex','generate-portrait':'models'};
let revisions=[],bookId=null,entryId=null,view='write',draft=null,timer,saveChain=Promise.resolve(),syncing=false,connected=false,saveError=false;
let currentSave='Saved on this device',sessionStart=0,toastTimer;
let libraryScreen='start',bookLanding=false,sceneBusy=false,coverEdit=null;
const format=n=>Number(n).toLocaleString();
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),6000);}
function fail(e){console.error(e);toast(e.message||'Something went wrong. Your existing drafts have been kept.');}
const all=(deleted=false)=>documents(revisions,deleted);
const find=id=>all().find(d=>d.id===id)||all(true).find(d=>d.id===id);
const book=()=>find(bookId);
const chapters=()=>all().filter(d=>d.type==='chapter'&&d.book===bookId).sort((a,b)=>(a.order||0)-(b.order||0)||a.id.localeCompare(b.id));
const cards=()=>all().filter(d=>d.type==='card'&&d.book===bookId&&!['Generated draft','Codex suggestion','Book cover','Plot hole'].includes(d.category));
const words=d=>countWords(plain(d?.html||''));
const total=()=>chapters().reduce((n,c)=>n+words(c),0);
const bodyOf=d=>{const {id,revision,conflicts,...body}=d;return body;};
function setSaved(text,error=false){currentSave=text;saveError=error;document.querySelectorAll('.saved').forEach(e=>{e.textContent=text;e.classList.toggle('error',error);});}
async function persist(records){const merged=union(revisions,records);await storage.put(records);revisions=merged;channel?.postMessage('changed');}
async function change(id,patch,resolve=false){await flush();const d=find(id);if(!d)throw Error('Document not found.');const next={...bodyOf(d),...patch};if(d.type==='chapter'&&Object.hasOwn(patch,'html')&&!Object.hasOwn(patch,'beats'))delete next.beats;const r=revise(id,next,resolve?heads(revisions,id).map(h=>h.id):[d.revision.id]);await persist([r]);return r;}
async function changeFromBase(id,base,patch){await flush();const old=revisions.find(r=>r.id===base&&r.entity===id);if(!old)throw Error('The original draft is unavailable. Reopen it and try again.');const next={...old.body,...patch};if(old.body.type==='chapter'&&Object.hasOwn(patch,'html')&&!Object.hasOwn(patch,'beats'))delete next.beats;await persist([revise(id,next,[base])]);}
async function create(body){const id=uuid();await persist([revise(id,{deleted:false,...body})]);return id;}
function queueSave(){setSaved('Saving…');clearTimeout(timer);timer=setTimeout(()=>flush().catch(fail),1400);}
function capture(){if(!draft||!$('#editor'))return;const beats=readEditorBeats();draft.body.beats=beats;draft.body.html=joinBeats(beats);draft.body.manuscriptEditedAt=Date.now();draft.body.title=$('#chapter-title').value;draft.edits++;queueSave();updateCounts();}
function flushManuscript(){clearTimeout(timer);saveChain=saveChain.catch(()=>{}).then(async()=>{if(!draft||draft.edits===draft.saved)return;const d=draft,edit=d.edits;const body={...d.body,title:d.body.title||'Untitled'};if(body.type==='chapter'){body.html=sanitize(d.body.html);if(body.beats){body.beats=body.beats.map(b=>({...b,html:sanitize(b.html)}));body.html=joinBeats(body.beats);}}const r=revise(d.id,body,[d.base]);try{await persist([r]);d.base=r.id;d.saved=edit;setSaved(d.edits===edit?'Saved on this device':'Saving…');if(d.edits!==edit)queueSave();}catch(e){setSaved('Save failed · export a backup',true);throw e;}});return saveChain;}
async function flush(){saveWritingPosition();await flushManuscript();await flushAI();await flushCharacter();await flushWorkshop();}
function updateCounts(){const chapterDraft=draft?.body.type==='chapter'?draft:null;const count=chapterDraft?words(chapterDraft.body):words(find(entryId));document.querySelectorAll('[data-chapter-words]').forEach(e=>e.textContent=format(count));const amount=total()+(chapterDraft?count-words(find(chapterDraft.id)):0);document.querySelectorAll('[data-total-words]').forEach(e=>e.textContent=format(amount));const goal=book()?.goal||80000;document.querySelectorAll('[data-progress]').forEach(e=>e.style.width=Math.min(100,amount/goal*100)+'%');document.querySelectorAll('[data-session]').forEach(e=>e.textContent=format(Math.max(0,amount-sessionStart)));}
function closePanels(){document.body.classList.remove('sidebar-open');}
function showModal(html){hideSelectionAction();modal.classList.remove('manager-modal');modal.innerHTML=`<button type="button" aria-label="Close dialog" class="close-dialog round" data-action="close">✕</button>${html}`;modal.setAttribute('aria-labelledby','modal-title');if(!modal.open)modal.showModal();}
const modalHead=(title,desc='')=>`<h2 id="modal-title" class="modal-title">${title}</h2><p class="modal-desc">${desc}</p>`;
function sample(){const rows=[
 ['sample-book',{type:'book',title:'The Cartographer’s House',author:'A Quill sample',goal:80000,dailyGoal:500,color:'#61566f',synopsis:'A sample workspace. Explore its chapters and notes, or create a new book of your own.'}],
 ['sample-chapter-1',{type:'chapter',book:'sample-book',title:'A map of somewhere else',order:1000,status:'Drafting',synopsis:'Mara returns to the house her father left behind and finds a map that changes overnight.',html:'<p>The house at the end of the lane had been waiting for her. Mara knew this before she found the key, before she pushed through the ivy and saw the small brass number hanging crookedly beside the door.</p><p>It was the windows. Every other house in the village reflected the pale October sky. These held something warmer, as though someone had lit a candle in each room and forgotten to put it out.</p><p>She set her suitcase on the step.</p><p>“Well,” she said to the house. “Here we are.”</p><p>Inside, the hall smelled of cedar and rain. Her father’s coat still hung on its hook. His boots waited underneath it, toes pointing toward the door, ready for a walk he would never take.</p><p>On the kitchen table lay a map.</p><p>Not the village, or the county, or any country she had ever seen. A coastline curved around a city of impossible bridges. Someone had drawn a small red circle near its center. Beneath it, in her father’s careful handwriting, were four words:</p><p><em>Start where you are.</em></p>'}],
 ['sample-chapter-2',{type:'chapter',book:'sample-book',title:'The room without a door',order:2000,status:'To write',synopsis:'Behind the study wall, Mara hears the tide. The map shows a room that the house does not have.',html:''}],
 ['sample-chapter-3',{type:'chapter',book:'sample-book',title:'What the tide remembers',order:3000,status:'To write',synopsis:'A stranger arrives with a letter addressed to a person who has never existed.',html:''}],
 ['sample-card-1',{type:'card',book:'sample-book',title:'Mara Ellery',category:'Character',html:'<p>A restorer of old books, thirty-two. Notices what other people leave behind. She has spent ten years telling herself that leaving was the right thing to do.</p><p><b>Wants:</b> To settle her father’s estate and return to her own life.</p><p><b>Needs:</b> To make peace with a story she does not know the ending of.</p>'}],
 ['sample-card-2',{type:'card',book:'sample-book',title:'The house on Briar Lane',category:'Place',html:'<p>A narrow house with sea-green shutters, miles from any sea. Its rooms feel a little larger on the inside. Every map in the study contains the same tiny lighthouse.</p>'}]
 ];return rows.map(([entity,body])=>({schema:1,id:entity+'-initial',entity,parents:[],time:1791820800000,body:{deleted:false,...body}}));}
function render(){hideSelectionAction();draft=null;if(bookId&&!book()){bookId=null;}syncAppearance();document.body.classList.toggle('in-book',!!bookId&&!bookLanding);document.body.classList.toggle('at-book-door',!!bookId&&bookLanding);bookId?(bookLanding?renderBookDoor():renderWorkspace()):(libraryScreen==='start'?renderStart():renderLibrary());}
function coverCard(b){return all().find(c=>c.type==='card'&&c.book===b.id&&c.category==='Book cover');}
function coverFace(b,classes=''){const image=coverCard(b)?.portrait;return `<div class="cover ${classes} ${image?'custom-cover':''}" style="--cover:${['#285e63','#49766c','#385974','#a37049','#797849','#61566f','#3b625d','#596782','#997563','#6f734c'].includes(b.color)?b.color:'#285e63'}">${image?`<img class="book-cover-image" src="${esc(image)}" alt="Cover of ${esc(b.title)}">`:`<span class="eyebrow">A WORK IN PROGRESS</span><span class="book-title">${esc(b.title)}</span><span class="author">${esc(b.author||'Your next novel')}</span>`}</div>`;}
function renderStart(){app.innerHTML=`<main class="start-screen"><div class="start-brand">${brand}<span class="eyebrow">A LITTLE INK. A WORLD OF YOUR OWN.</span></div><div class="start-content"><span class="eyebrow">WELCOME TO YOUR WRITING DESK</span><h1>Every story<br>begins with <em>you.</em></h1><p>Open a book. Follow a spark.<br>See where the words take you.</p><nav class="start-choices" aria-label="Start"><button data-action="bookshelf" class="start-choice"><span class="start-symbol">${icon('shelf')}</span><span>BOOKSHELF<small>Your stories live here</small></span><b aria-hidden="true">→</b></button><button data-action="settings" class="start-choice"><span class="start-symbol">${icon('settings')}</span><span>SETTINGS<small>Models, appearance & backup</small></span><b aria-hidden="true">→</b></button></nav></div><div class="hero-sparks" aria-hidden="true"><i>✦</i><i>✧</i><i>✦</i></div></main>`;}
function renderLibrary(){const books=all().filter(d=>d.type==='book');app.innerHTML=`<header class="library-nav">${btn('start-screen','Writing desk','back','subtle')}<div class="row">${btn('settings','Settings','settings','subtle')}${btn('trash','', 'trash','subtle','aria-label="Recently deleted"')}</div></header><main class="library bookshelf-room"><div class="shelf-heading"><div><span class="eyebrow">WORLDS WAITING TO BE OPENED</span><h1>Your bookshelf.</h1><p class="muted">${books.length} ${books.length===1?'story':'stories'} · a place for every possibility.</p></div>${btn('new-book','New book','plus','primary')}</div><div class="shelf physical-shelf">${books.map((b,index)=>{const cs=all().filter(c=>c.book===b.id&&c.type==='chapter');return `<button class="book-card shelf-book" data-action="open-book" data-id="${b.id}" style="--book-delay:${Math.min(index,8)*40}ms">${coverFace(b)}<h3>${esc(b.title)}</h3><div class="row spread meta"><span>${cs.length} sections</span><span>${format(cs.reduce((n,c)=>n+words(c),0))} words</span></div>${b.conflicts?'<p class="conflict">Parallel book drafts · review in history</p>':''}</button>`;}).join('')}<button class="new-book shelf-new" data-action="new-book">${art('quill','new-book-art')}<span>A new beginning</span><small>Add a book to your shelf</small></button></div><div class="library-foot"><span>${icon('check')} Saved on this device. Open a book to change its cover.</span><button data-action="settings">Settings & backup →</button></div></main>`;}
function syncAppearance(){
  const desk=!bookId&&libraryScreen==='start',dark=document.body.classList.contains('dark');document.documentElement.classList.toggle('desk-open',desk);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#10212d':'#f1ecdf');
  if(storage.native)storage.bridge('appearance',{desk,dark}).catch(()=>{});
}
function lastEditedSection(){
  const cs=chapters(),byRevision=new Map(revisions.map(r=>[r.id,r])),times=new Map(cs.map(c=>[c.id,c.manuscriptEditedAt||0]));
  for(const r of revisions)if(times.has(r.entity)&&r.body.html&&(!r.parents.length||r.parents.some(id=>byRevision.get(id)?.body.html!==r.body.html)))times.set(r.entity,Math.max(times.get(r.entity),r.time));
  return [...cs].sort((a,b)=>times.get(b.id)-times.get(a.id)||cs.indexOf(a)-cs.indexOf(b))[0];
}
function saveWritingPosition(){
  if(!bookId||bookLanding||view!=='write'||!entryId||!$('#editor'))return;
  try{localStorage.setItem('quill-position-'+bookId+'-'+entryId,String($('#main-content').scrollTop));}catch{}
}
function restoreWritingPosition(){
  let top=0;try{top=Math.max(0,Number(localStorage.getItem('quill-position-'+bookId+'-'+entryId))||0);}catch{}
  requestAnimationFrame(()=>{const main=$('#main-content');if(main)main.scrollTop=top;});
}
function renderBookDoor(){
  const b=book(),resume=lastEditedSection();app.innerHTML=`<header class="library-nav">${btn('home','Bookshelf','back','subtle')}${btn('book-settings','Book details & cover','settings','subtle')}</header><main class="book-door"><div class="book-spread"><section class="book-leaf title-leaf"><div class="book-door-cover">${coverFace(b)}</div><span class="eyebrow">A WORLD BETWEEN THE COVERS</span><h1>${esc(b.title)}</h1><p>${esc(b.author||'Your story starts here.')}</p><span class="page-ornament" aria-hidden="true">✦</span></section><section class="book-leaf menu-leaf book-door-content"><span class="eyebrow">WHERE SHALL WE TURN?</span><nav class="book-choices" aria-label="Open book section"><button class="book-choice" data-action="enter-codex">${art('codex')}<span>CODEX<small>Turn to the front.<br>Your world and characters.</small></span><b aria-hidden="true">→</b></button><button class="book-choice write-choice" data-action="enter-write">${art('quill')}<span>WRITE!<small>${resume?`Return to ${esc(resume.title)}`:'Begin your story.'}</small></span><b aria-hidden="true">→</b></button></nav><div class="book-door-tools">${btn('manage-drafts','DRAFTS','','',`aria-label="Manage drafts for ${esc(b.title)}"`)}${btn('book-settings',coverCard(b)?.portrait?'Change cover':'Add a book cover','plus','subtle cover-link')}</div><span class="page-ornament" aria-hidden="true">✦</span></section></div></main>`;
}
async function transitionScene(kind,change,source){
  if(sceneBusy)return;sceneBusy=true;closePanels();const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduce-motion');let overlay,changed=false;
  try{
    if(!reduced){
      const cover=source?.querySelector('.cover')?.outerHTML;
      if(kind==='opening-book'){await change();changed=true;}
      overlay=document.createElement('div');overlay.className='scene-curtain '+kind;overlay.setAttribute('aria-hidden','true');overlay.inert=true;
      if(['opening-book','to-codex','to-writing'].includes(kind)&&$('.book-spread')){
        const spread=$('.book-spread').cloneNode(true);spread.querySelectorAll('[data-action]').forEach(el=>{el.removeAttribute('data-action');el.tabIndex=-1;});
        const frame=document.createElement('div');frame.className='animated-spread';frame.append(spread);
        if(kind==='opening-book'){const lid=document.createElement('div');lid.className='opening-cover';lid.innerHTML=cover||coverFace(book());frame.append(lid);}
        else for(let i=0;i<4;i++){const leaf=document.createElement('div');leaf.className='flipping-leaf';leaf.style.setProperty('--leaf',i);leaf.innerHTML='<span>✦</span>';frame.append(leaf);}
        overlay.append(frame);
      }else overlay.innerHTML='<span>✦</span>';
      document.body.append(overlay);await new Promise(r=>setTimeout(r,['opening-book','to-codex','to-writing'].includes(kind)?920:220));
    }
    if(!changed)await change();
    if(overlay){overlay.classList.add('revealing');await new Promise(r=>setTimeout(r,280));}
  }finally{overlay?.remove();sceneBusy=false;}
}
function renderWorkspace(){const b=book(),cs=chapters();if(!cs.find(c=>c.id===entryId))entryId=cs[0]?.id||null;const c=find(entryId);app.innerHTML=`<div class="workspace"><header class="topbar"><button class="round mobile-only" data-action="sidebar" aria-label="Show chapters">${icon('menu')}</button><button data-action="book-door" aria-label="Back to book menu">${brand}</button><div class="breadcrumb"><button data-action="home">My books</button><span>/</span><strong>${esc(b.title)}</strong></div><div class="topbar-actions"><span class="saved ${saveError?'error':''}">${esc(currentSave)}</span><button class="round" data-action="search" aria-label="Search manuscript">${icon('search')}</button><button class="round" data-action="focus" aria-label="Toggle focus mode">${icon('focus')}</button><button class="round details-button" data-action="inspector" aria-label="Chapter details" aria-haspopup="dialog">${icon('info')}</button>${btn('export','Export','export','subtle')}</div></header><aside class="sidebar"><div class="book-label">${art('codex','book-emblem')}<span class="eyebrow">THE MANUSCRIPT</span><h3>${esc(b.title)}</h3><small>${esc(b.author||'Your story, in your words')}</small></div><div class="section-label"><span class="eyebrow">BOOK SECTIONS</span><button class="round" data-action="add-section" aria-label="Add book section">${icon('plus')}</button></div>${cs.map((ch,i)=>`<div class="chapter-item ${ch.id===entryId&&view==='write'?'active':''}"><button class="chapter-open" data-action="open-chapter" data-id="${ch.id}"><span class="chapter-num">${ch.sectionType&&ch.sectionType!=='chapter'?icon('note'):String(cs.slice(0,i+1).filter(c=>!c.sectionType||c.sectionType==='chapter').length).padStart(2,'0')}</span><span class="chapter-text"><strong>${esc(ch.title)}${ch.conflicts?' ⚑':''}</strong><small><span class="dot ${ch.status==='Complete'?'done':''}"></span>${format(words(ch))} words</small></span></button><div class="chapter-arrows"><button data-action="move" data-id="${ch.id}" data-direction="-1" aria-label="Move ${esc(ch.title)} up" ${i===0?'disabled':''}>▲</button><button data-action="move" data-id="${ch.id}" data-direction="1" aria-label="Move ${esc(ch.title)} down" ${i===cs.length-1?'disabled':''}>▼</button></div></div>`).join('')}<div class="sidebar-bottom"><button class="nav-item" data-action="view" data-view="board">${icon('note')}Story notes</button><button class="nav-item" data-action="manage-drafts">${icon('clock')}Manage drafts</button><button class="nav-item" data-action="manage-models">${icon('model')}Manage Models</button><button class="nav-item" data-action="book-settings">${icon('settings')}Book details & goals</button><button class="nav-item" data-action="settings">${icon('sync')}Backup & sync</button><button class="nav-item" data-action="trash">${icon('trash')}Recently deleted</button></div></aside><main class="main" id="main-content">${view==='write'?writer(c,cs.findIndex(ch=>ch.id===entryId)+1):view==='outline'?outline(cs):view==='plot'?plotPage(b):board()}</main><aside class="inspector">${inspector(c,b)}</aside><footer class="statusbar"><span><span data-chapter-words>${format(words(c))}</span> words <span class="desktop-wide">· ${Math.max(1,Math.ceil(words(c)/250))} min read</span></span><span><span data-total-words>${format(total())}</span> / ${format(b.goal||80000)} words</span><span class="desktop-wide">English · spell check on</span></footer></div>`;
  if(view==='plot'){draft={id:b.id,base:b.revision.id,body:bodyOf(b),edits:0,saved:0};}
  if(view==='write'&&c){draft={id:c.id,base:c.revision.id,body:bodyOf(c),edits:0,saved:0};mountBeatEditor(c);$('#editor').addEventListener('input',capture);$('#chapter-title').addEventListener('input',capture);$('#editor').addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));capture();});$('#editor').addEventListener('drop',e=>e.preventDefault());}
}
function writer(c,number){if(!c)return `<div class="empty"><h2>A blank page is a beginning.</h2><p>Add a chapter or another book section.</p>${btn('add-section','Add a section','plus','primary')}</div>`;return `${c.conflicts?`<div class="conflict">${c.conflicts+1} parallel drafts are safe in history. ${btn('history','Review drafts','clock','',`data-id="${c.id}"`)}</div>`:''}<div class="toolbar" aria-label="Formatting"><select id="paragraph-style" aria-label="Paragraph style"><option value="p">Paragraph</option><option value="h2">Heading</option><option value="h3">Subheading</option><option value="blockquote">Quotation</option></select>${['bold','italic','underline','insertUnorderedList','insertHorizontalRule','undo','redo'].map(f=>`<button data-format="${f}" aria-label="${{insertUnorderedList:'Bulleted list',insertHorizontalRule:'Scene break'}[f]||f}">${icon({insertUnorderedList:'list',insertHorizontalRule:'rule'}[f]||f)}</button>`).join('')}</div><div class="writing-tools" aria-label="Writing tools">${btn('open-codex','Codex','book','subtle')}${btn('spell-check','Spell Check','spell','subtle')}${btn('search','Find & Replace','search','subtle')}${btn('page-break','Page break','page','subtle')}</div><div class="chapter-ai-bar"><div class="row wrap">${btn('toggle-beats',beatHighlights?'Hide beats':'Show beats','eye','subtle',`aria-pressed="${beatHighlights}"`)}</div>${btn('write-ai','Generate','beats','primary')}</div><div class="paper-wrap"><article class="paper"><div class="chapter-ornament" aria-hidden="true">✦</div><div class="chapter-kicker">${esc(sectionLabel(c).toUpperCase())}${!c.sectionType||c.sectionType==='chapter'?' '+String(chapters().slice(0,number).filter(c=>!c.sectionType||c.sectionType==='chapter').length).padStart(2,'0'):''}</div><input id="chapter-title" class="title-input" aria-label="Chapter title" value="${esc(c.title)}" maxlength="1000"><div id="editor" class="editor ${beatHighlights?'show-beats':''}" contenteditable="${!beatHighlights}" role="textbox" aria-label="Chapter text" aria-multiline="true" spellcheck="true" autocapitalize="sentences" data-placeholder="Let the story begin…"></div></article><section class="inline-next"><span class="eyebrow">ONE BEAT AT A TIME</span><h3>What happens next?</h3><div id="inline-next-controls"><label for="next-writing-prompt">Next beat description · optional</label><textarea id="next-writing-prompt" rows="3" maxlength="2000" placeholder="Leave blank to let the AI continue your story, or describe what happens next…"></textarea><div class="row wrap">${btn('generate-inline','Generate next beat','spark','primary')}${btn('split-beat','Start a blank beat','plus','subtle')}</div></div><div id="inline-generation"></div><p class="small muted">Review each suggestion before adding it. Keep writing by hand whenever you like.</p></section></div>`;}

function inspector(c,b){if(view==='plot')return `<h3>Book Codex</h3><p class="small muted">Summary, plot beats, writing style and characters guide every writing model.</p><hr class="rule"><h3>Your cast</h3><div class="stat-large">${cards().filter(c=>c.category==='Character').length}</div><small>characters in this book</small><hr class="rule"><h3>Writing model</h3><p class="small">${esc(modelChoices().find(([id])=>id===preferredModel())?.[1]||'Choose a model')}</p><p class="small muted">Choose a model from Manage Models in the sidebar.</p>`;return `<h3>Chapter details</h3>${c?`<span class="eyebrow">STATUS</span><select aria-label="Chapter status" id="chapter-status">${['To write','Drafting','Revising','Complete'].map(s=>`<option ${c.status===s?'selected':''}>${s}</option>`).join('')}</select><label for="synopsis">Synopsis</label><textarea id="synopsis" placeholder="What happens in this chapter?">${esc(c.synopsis||'')}</textarea><button class="nav-item" data-action="history" data-id="${c.id}" style="padding-left:0">${icon('clock')}Version history</button>`:'<p class="muted">Select a chapter to edit its details.</p>'}<hr class="rule"><h3>Manuscript goal</h3><div class="stat-large" data-total-words>${format(total())}</div><small>of ${format(b.goal||80000)} words</small><div class="progress"><span data-progress style="width:${Math.min(100,total()/(b.goal||80000)*100)}%"></span></div><small>${Math.min(100,Math.round(total()/(b.goal||80000)*100))}% of your story</small><hr class="rule"><h3>This writing session</h3><div class="stat-large" data-session>${format(Math.max(0,total()-sessionStart))}</div><small>net new words · goal ${format(b.dailyGoal||500)}</small><p class="quote">“A word after a word<br>after a word is power.”</p><small>— Margaret Atwood</small>`;}
function chapterDetails(){const c=find(entryId);closePanels();if(!c){showModal(modalHead('Chapter details','Add a chapter to edit its details.'));return;}showModal(modalHead('Chapter details',esc(c.title))+`<form id="chapter-form" data-id="${c.id}" data-base="${c.revision.id}"><div class="chapter-dialog-actions">${btn('delete','Delete chapter','trash','danger',`data-id="${c.id}"`)}${btn('history','Version history','clock','subtle',`data-id="${c.id}"`)}</div><label for="details-status">Chapter status</label><select id="details-status">${['To write','Drafting','Revising','Complete'].map(s=>`<option ${c.status===s?'selected':''}>${s}</option>`).join('')}</select><label for="details-synopsis">Synopsis</label><textarea id="details-synopsis" rows="4" placeholder="What happens in this chapter?">${esc(c.synopsis||'')}</textarea><div class="modal-actions">${btn('close','Cancel','','subtle')}<button class="btn primary" type="submit">Save details</button></div></form>`);}
function outline(cs){return `<div class="content-page"><div class="page-heading row spread"><div><span class="eyebrow">THE BIG PICTURE</span><h1>Your story, chapter by chapter.</h1><p class="muted">Give every chapter a place and a purpose.</p></div>${btn('add-section','Add section','plus','primary')}</div><div class="outline">${cs.map((c,i)=>`<div class="outline-card"><span class="chapter-num">${String(i+1).padStart(2,'0')}</span><button class="body" data-action="open-chapter" data-id="${c.id}" style="text-align:left"><h3>${esc(c.title)}</h3><p>${esc(c.synopsis||'Add a synopsis in chapter details.')}</p><small>${format(words(c))} words</small></button><span class="badge">${esc(c.status||'Drafting')}</span><div class="row"><button data-action="move" data-id="${c.id}" data-direction="-1" aria-label="Move ${esc(c.title)} up" ${i===0?'disabled':''}>↑</button><button data-action="move" data-id="${c.id}" data-direction="1" aria-label="Move ${esc(c.title)} down" ${i===cs.length-1?'disabled':''}>↓</button></div></div>`).join('')||'<p class="empty">Your outline will appear here as you add chapters.</p>'}</div></div>`;}
function board(){return `<div class="content-page"><div class="page-heading row spread"><div><span class="eyebrow">BEHIND THE STORY</span><h1>A world worth getting lost in.</h1><p class="muted">Keep your characters, places, and sparks of inspiration close.</p></div>${btn('new-card','','plus','primary','aria-label="Add story note"')}</div><div class="board">${cards().map(c=>`<button class="note-card" data-action="edit-card" data-id="${c.id}"><span class="eyebrow">${esc(c.category||'Idea')}</span><h3>${esc(c.title)}${c.conflicts?' ⚑':''}</h3><p>${esc(plain(c.html))}</p></button>`).join('')}<button class="new-book" style="min-height:200px" data-action="new-card"><span class="plus">+</span>Add a story note</button></div></div>`;}
function bookForm(isNew){const b=isNew?{}:book();const existing=isNew?null:coverCard(b);coverEdit={id:existing?.id,base:existing?.revision.id,portrait:existing?.portrait||'',changed:false};showModal(modalHead(isNew?'Begin a new story.':'Make this book yours.','A working title is all you need. You can change everything later.')+`<form id="book-form" data-new="${isNew}" data-base="${b.revision?.id||''}"><div class="cover-editor"><div id="cover-preview">${coverEdit.portrait?`<img src="${esc(coverEdit.portrait)}" alt="Book cover preview">`:art('codex')}</div><div><label for="cover-file" class="btn">Choose cover image</label><input id="cover-file" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only">${btn('remove-cover','Remove cover','','subtle','id="remove-cover"')}<p class="small muted">JPEG, PNG or WebP · up to 15 MB<br>Portrait images fit best.</p><p id="cover-status" class="small" role="status"></p></div></div><label for="book-title">Book title</label><input id="book-title" required maxlength="1000" placeholder="Untitled novel" value="${esc(b.title||'')}"><label for="book-author">Author</label><input id="book-author" maxlength="200" placeholder="Your name or pen name" value="${esc(b.author||'')}"><div class="row"><div><label for="book-goal">Manuscript word goal</label><input id="book-goal" type="number" min="1" max="10000000" value="${b.goal||80000}"></div><div><label for="daily-goal">Session word goal</label><input id="daily-goal" type="number" min="1" max="1000000" value="${b.dailyGoal||500}"></div></div><label for="book-color">Cover color</label><select id="book-color">${[['#61566f','Lavender dusk'],['#3b625d','Forest'],['#596782','Blue hour'],['#997563','Terracotta'],['#6f734c','Olive']].map(([v,l])=>`<option value="${v}" ${b.color===v?'selected':''}>${l}</option>`).join('')}</select>${!isNew?`<div class="row" style="margin-top:15px">${btn('history','History','clock','subtle',`data-id="${b.id}"`)}${btn('delete','Move book to trash','trash','subtle danger',`data-id="${b.id}"`)}</div>`:''}<div class="modal-actions">${btn('close','Cancel','','subtle')}<button class="btn primary" type="submit">${isNew?'Create book':'Save details'}</button></div></form>`);}
function cardForm(id){const c=id?find(id):null;if(c?.category==='Character'){showCharacter(id);return;}showModal(modalHead(c?'Story note':'Catch an idea.','Characters, places, research, and the details you don’t want to lose.')+`<form id="card-form" data-id="${id||''}" data-base="${c?.revision.id||''}"><label for="card-title">Title</label><input id="card-title" required maxlength="1000" value="${esc(c?.title||'')}"><label for="card-category">Type</label><select id="card-category">${['Character','Place','Idea','Research'].map(s=>`<option ${c?.category===s?'selected':''}>${s}</option>`).join('')}</select><label for="card-text">Notes</label><textarea id="card-text" rows="9">${esc(plain(c?.html||''))}</textarea>${c?`<div class="row">${btn('history','History','clock','subtle',`data-id="${id}"`)}${btn('delete','Trash','trash','subtle danger',`data-id="${id}"`)}</div>`:''}<div class="modal-actions">${btn('close','Cancel','','subtle')}<button class="btn primary">Save note</button></div></form>`);}
function settings(){showModal(modalHead('Your writing, everywhere.','Quill saves on this device as you write. Keep a backup somewhere safe.')+`<section class="settings-section"><h3>Cloud folder sync</h3><p>On iPhone, choose a folder in iCloud Drive. On desktop Chrome or Edge, choose that same folder in your synced iCloud Drive. Use the same folder on every device. Sync runs while Quill is open.</p><p>Safari and mobile browsers support backup import and export instead of live folder sync.</p><div class="row wrap">${btn('connect','Connect folder','sync')}${btn('sync','Sync now','','subtle')}${btn('disconnect','Disconnect','','subtle')}</div><p id="sync-status">${connected?'Connected for this session.':'Choose your folder, or sync an existing iPhone connection.'}</p></section><section class="settings-section"><h3>Backups & recovery</h3><p>Backups include all books, notes, deleted items, and saved versions. Import merges drafts; it does not replace your library.</p><div class="row wrap">${btn('backup','Export backup','export')}${btn('import','Import backup','','subtle')}</div></section><section class="settings-section"><h3>Writing models</h3><p>Download local models, reclaim space, or connect your own model API.</p>${btn('manage-models','Manage Models','settings')}</section><section class="settings-section"><h3>Appearance</h3>${btn('theme','Toggle light / dark','','subtle')}${btn('motion',document.body.classList.contains('reduce-motion')?'Turn animations on':'Reduce animations','','subtle')}</section><p class="muted" style="font-size:11px">Quill · Local models process story text on this device without usage fees. Optional API connections send story context to your chosen server and may have provider charges. Clearing browser data or deleting the app removes local writing. Your cloud folder is managed by its provider; “saved to folder” does not confirm delivery to another device.</p>`);}
async function doSync(){if(syncing)return;syncing=true;try{await flush();const merged=await storage.sync(revisions);revisions=union(revisions,merged);connected=true;setSaved('Saved to sync folder');const status=$('#sync-status');if(status)status.textContent='Saved to your folder at '+new Date().toLocaleTimeString()+'. Your cloud provider handles delivery.';if(!modal.open&&!draft){render();}toast('Folder sync complete. Your writing and draft deletions are up to date.');}finally{syncing=false;}}
function history(id){const d=find(id),h=heads(revisions,id);showModal(modalHead('Every draft has a place.',esc(d?.title||'Version history'))+`<p class="muted" style="font-size:12px">Restore makes a new current version. Earlier writing stays in this history. Parallel drafts can be compared here before you choose.</p>${revisions.filter(r=>r.entity===id).sort((a,b)=>b.time-a.time||b.id.localeCompare(a.id)).map(r=>`<div class="history-row"><div class="row spread"><time>${new Date(r.time).toLocaleString()}</time>${h.some(x=>x.id===r.id)?'<span class="badge">CURRENT DRAFT</span>':''}</div><strong>${esc(r.body.title)}</strong><p>${esc(plain(r.body.html||'')||r.body.plotBeats||r.body.synopsis||r.body.author||'(Empty draft)')}</p>${btn('restore-revision','Make this current','','subtle',`data-id="${r.id}"`)}</div>`).join('')}`);}
function trash(){const deleted=all(true).filter(d=>!bookId||d.id===bookId||d.book===bookId);showModal(modalHead('Recently deleted','Nothing here is permanently removed. Restore it whenever you’re ready.')+deleted.map(d=>`<div class="history-row row spread"><div><strong>${esc(d.title)}</strong><br><small>${d.type}</small></div>${btn('restore-item','Restore','','subtle',`data-id="${d.id}"`)}</div>`).join('')+(deleted.length?'':'<p class="empty">Your trash is empty.</p>'));}
function exportMenu(){showModal(modalHead('From draft to manuscript.','Exports include all front matter, story sections, and back matter in manuscript order.')+`<div class="export-list">${[['docx','Word document','Editable .docx with headings and formatting'],['epub','Ebook','An EPUB for reading apps'],['html','Formatted manuscript','An HTML document, ready to read or print'],['txt','Plain text','Your words in a simple .txt file'],['print','Print / save as PDF',storage.native?'Print or save through the iPhone print sheet':'Opens the browser print dialog']].map(([v,l,d])=>btn('export-file',`<span>${l}<small>${d}</small></span>`,'export','',`data-type="${v}"`)).join('')}</div>`);}
async function exportFile(type){await flush();const b=book(),cs=chapters(),name=(b.title||'Manuscript').replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,90)||'Manuscript';if(type==='print'){const html=manuscriptHTML(b,cs);if(storage.native)await storage.bridge('print',{html});else{let frame=document.createElement('iframe');frame.style.cssText='position:fixed;width:1px;height:1px;left:-9999px';frame.srcdoc=html;frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print();setTimeout(()=>frame.remove(),60000);};document.body.append(frame);}return;}
const content=type==='epub'?epub(b,cs):type==='docx'?docx(b,cs):type==='html'?manuscriptHTML(b,cs):[...(cs.some(c=>c.sectionType==='title-page')?[]:[b.title,b.author||'']),...cs.map(c=>(c.sectionType==='title-page'?'':c.title+'\n\n')+plain(c.html))].join('\n\n\n');const mime={epub:'application/epub+zip',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',html:'text/html',txt:'text/plain'};await storage.download(name+'.'+type,mime[type],content);toast('Manuscript export is ready.');}
let textReview=null,spellReview=null,reviewEpoch=0,savedCaret=null,textReplaceBusy=false;
function reviewSections(scope){return chapters().filter(c=>scope==='book'||c.id===entryId);}
function collectMatches(query,scope,options){
  return reviewSections(scope).flatMap(c=>manuscriptBeats(c).flatMap((beat,beatIndex)=>findText(beat.html,query,options).map(m=>({...m,chapter:c.id,base:c.revision.id,title:c.title,beatIndex}))));
}
function search(){
  if(!$('#search-input'))showModal(modalHead('Find & Replace','Search manuscript text. Replacements keep formatting and beat boundaries; previous versions stay in history.')+`<label for="search-input">Find</label><input id="search-input" type="search" maxlength="1000" placeholder="Word or phrase"><label for="replace-input">Replace with</label><input id="replace-input" maxlength="10000" placeholder="Leave empty to remove matches"><label for="search-scope">Search in</label><select id="search-scope"><option value="section">Current section</option><option value="book">Entire book</option></select><div class="review-options"><label><input type="checkbox" id="search-case">Match case</label><label><input type="checkbox" id="search-word" checked>Whole words</label></div><div id="search-count" role="status"></div><div class="row wrap">${btn('replace-all','Replace all','replace','primary','id="replace-all" disabled')}</div><div id="search-results"></div>`);
  const query=$('#search-input').value,matches=collectMatches(query,$('#search-scope').value,{matchCase:$('#search-case').checked,wholeWord:$('#search-word').checked});textReview={matches};
  $('#search-count').textContent=query?`${format(matches.length)} matches${matches.length>100?' · showing the first 100':''}`:'Enter a word or phrase to find.';
  $('#replace-all').disabled=!matches.length;$('#replace-all').innerHTML=icon('replace')+`Replace all${matches.length?' '+format(matches.length):''}`;
  $('#search-results').innerHTML=matches.slice(0,100).map((m,i)=>`<article class="search-match"><strong>${esc(m.title)}</strong><p>${esc(m.before)}<mark>${esc(m.text)}</mark>${esc(m.after)}</p>${btn('replace-one','Replace this match','replace','subtle',`data-index="${i}"`)}</article>`).join('');
}
async function applyTextReplacements(matches,replacement){
  if(!matches.length)return;if(textReplaceBusy)throw Error('The current replacement is still saving.');textReplaceBusy=true;try{await flush();revisions=union(revisions,await storage.load());const ids=[...new Set(matches.map(m=>m.chapter))],records=[];
  for(const id of ids){const c=find(id),changes=matches.filter(m=>m.chapter===id);if(!c||c.deleted||c.conflicts||changes.some(m=>m.base!==c.revision.id))throw Error('The manuscript changed. Search or scan again before replacing text.');
    const beats=manuscriptBeats(c);for(const index of new Set(changes.map(m=>m.beatIndex))){if(!beats[index])throw Error('This beat changed. Search or scan again.');beats[index].html=replaceText(beats[index].html,changes.filter(m=>m.beatIndex===index),replacement);}
    records.push(revise(id,{...bodyOf(c),beats,html:joinBeats(beats),manuscriptEditedAt:Date.now()},[c.revision.id]));
  }
  await persist(records);const top=$('#main-content')?.scrollTop;render();if($('#main-content'))$('#main-content').scrollTop=top||0;toast(`Replaced ${format(matches.length)} ${matches.length===1?'match':'matches'}. Earlier writing is in history.`);
  }finally{textReplaceBusy=false;}
}
async function replaceSearch(index){
  const matches=index===undefined?textReview?.matches:textReview?.matches.slice(index,index+1),replacement=$('#replace-input').value;
  await applyTextReplacements(matches||[],replacement);search();
}
async function spellCheck(){
  await flush();showModal(modalHead('Spell Check','Offline English spelling with correction suggestions. Remember character names and invented words on this device.')+`<label for="spell-scope">Check</label><select id="spell-scope"><option value="section">Current section</option><option value="book">Entire book</option></select>${btn('spell-scan','Scan again','refresh','subtle')}<p id="spell-status" role="status">Opening the spelling dictionary…</p><div id="spell-result"></div>`);
  spellReview={ignored:new Set(),issues:[]};await scanSpelling();
}
async function scanSpelling(){
  const epoch=++reviewEpoch,scope=$('#spell-scope').value,state=spellReview||{ignored:new Set(),issues:[]};spellReview=state;state.issues=[];$('#spell-result').replaceChildren();$('#spell-status').textContent='Checking spelling…';
  await new Promise(r=>setTimeout(r,0));if(epoch!==reviewEpoch||!$('#spell-result'))return;
  const engine=spellingEngine(),accepted=new Set(personalWords().map(w=>w.toLocaleLowerCase())),cache=new Map();let checked=0;
  for(const c of reviewSections(scope))for(const [beatIndex,beat] of manuscriptBeats(c).entries()){
    const {text}=manuscriptText(beat.html);
    for(const token of spellingWords(text)){
      const word=token.word.replaceAll('’',"'"),key=word.toLocaleLowerCase();
      if(!cache.has(word))cache.set(word,accepted.has(key)||state.ignored.has(key)||engine.correct(word));
      if(!cache.get(word))state.issues.push({chapter:c.id,base:c.revision.id,title:c.title,beatIndex,start:token.start,end:token.end,text:token.word,before:text.slice(Math.max(0,token.start-55),token.start),after:text.slice(token.end,token.end+80)});
      if(++checked%400===0){await new Promise(r=>setTimeout(r,0));if(epoch!==reviewEpoch||!$('#spell-result'))return;}
    }
  }
  if(epoch===reviewEpoch&&$('#spell-result'))paintSpelling();
}
function paintSpelling(){
  const m=spellReview?.issues[0];$('#spell-status').textContent=m?`${format(spellReview.issues.length)} words to review`:'Spelling review complete. No unrecognized words remain.';
  if(!m){$('#spell-result').innerHTML='<p class="muted">Spelling suggestions do not check grammar or story meaning.</p>';return;}
  const suggestions=m.text.length>40?[]:spellingEngine().suggest(m.text.replaceAll('’',"'")).slice(0,6);
  $('#spell-result').innerHTML=`<article class="spelling-issue"><span class="eyebrow">${esc(m.title)}</span><h3>${esc(m.text)}</h3><p>${esc(m.before)}<mark>${esc(m.text)}</mark>${esc(m.after)}</p><div class="row wrap spelling-suggestions">${suggestions.map(w=>btn('spell-suggestion',esc(w),'spell','subtle',`data-word="${esc(w)}"`)).join('')||'<p class="muted small">No suggestions. Enter your own correction or remember this word.</p>'}</div><label for="spell-replacement">Correction</label><input id="spell-replacement" maxlength="80" value="${esc(suggestions[0]||m.text)}"><div class="row wrap">${btn('spell-replace','Replace','check','primary')}${btn('spell-ignore','Ignore for this scan','next','subtle')}${btn('spell-remember','Remember word','save','subtle')}</div></article>`;
}
function captureCaret(){
  const selection=getSelection();if(!selection?.rangeCount)return;const range=selection.getRangeAt(0),node=range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement,editor=$('#editor');
  if(editor?.contains(node)&&(!beatHighlights||node.closest('.beat-text')))savedCaret={chapter:entryId,range:range.cloneRange()};
}
function insertPageBreak(){
  const editor=$('#editor');if(!editor)return;let range=savedCaret?.chapter===entryId&&editor.contains(savedCaret.range.endContainer)?savedCaret.range.cloneRange():null;
  const field=beatHighlights?range?(range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement).closest('.beat-text'):[...editor.querySelectorAll('.beat-text')].at(-1):editor;
  if(!field)return;field.focus();if(!range){range=document.createRange();range.selectNodeContents(field);}range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);
  if(!document.execCommand('insertHTML',false,'<hr data-page-break="true"><p><br></p>')){const marker=document.createElement('hr');marker.dataset.pageBreak='true';const p=document.createElement('p');p.append(document.createElement('br'));const fragment=document.createDocumentFragment();fragment.append(marker,p);range.insertNode(fragment);range.setStart(p,0);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);}
  capture();captureCaret();toast('Page break inserted. Exports start a new page here.');
}
const editingActions={
  'page-break':insertPageBreak,'spell-check':spellCheck,'replace-one':el=>replaceSearch(Number(el.dataset.index)),'replace-all':()=>replaceSearch(),
  'spell-scan':scanSpelling,'spell-suggestion':el=>{$('#spell-replacement').value=el.dataset.word;},
  'spell-replace':async()=>{const m=spellReview?.issues[0];if(m){await applyTextReplacements([m],$('#spell-replacement').value);await scanSpelling();}},
  'spell-ignore':()=>{const m=spellReview.issues[0];if(m){spellReview.ignored.add(m.text.replaceAll('’',"'").toLocaleLowerCase());scanSpelling().catch(fail);}},
  'spell-remember':()=>{const m=spellReview.issues[0];if(m){rememberWord(m.text.replaceAll('’',"'"));scanSpelling().catch(fail);}}
};
document.addEventListener('selectionchange',captureCaret);
document.addEventListener('pointerdown',e=>{if(e.target.closest('[data-action="page-break"]'))e.preventDefault();});
document.addEventListener('change',e=>{if(['search-scope','search-case','search-word'].includes(e.target.id))search();if(e.target.id==='spell-scope')scanSpelling().catch(fail);});
modal.addEventListener('close',()=>{if(!modal.open){reviewEpoch++;textReview=null;spellReview=null;}});
function plotPage(b){return `<div class="content-page plot-page codex-page">${btn('back-writing','Back to writing','back','subtle')}<div class="page-heading codex-banner">${art('codex','banner-art')}<span class="eyebrow">YOUR STORY’S SOURCE OF TRUTH</span><h1>The Codex</h1><p class="muted">Your story, its people, and the details that hold everything together. Every writing model references this book’s Codex.</p></div><div class="codex-scan-tools">${btn('scan-codex','Update from manuscript','scan')}</div><nav class="codex-tabs" aria-label="Codex sections">${[['summary','Story summary'],['beats','Plot beats'],['style','Writing style'],['characters','Characters'],['holes','Plot holes']].map(([key,label])=>btn('codex-tab',label,'',codexTab===key?'primary':'subtle',`data-tab="${key}" aria-pressed="${codexTab===key}"`)).join('')}</nav><section ${codexTab==='summary'?'':'hidden'}><label for="story-summary">Story summary</label><p class="small muted">Premise, setting, central conflict, and the ending you’re working toward.</p><textarea id="story-summary" rows="12" maxlength="300000" placeholder="What is this story about?">${esc(b.synopsis||'')}</textarea></section><section ${codexTab==='beats'?'':'hidden'}><div class="row spread wrap"><label for="plot-beats">Plot beats</label>${btn('next-beat','Generate next beat','write')}</div><p class="small muted">Plan the full story, including future reveals. Suggestions are yours to review and edit.</p><textarea id="plot-beats" class="plot-editor" maxlength="300000" placeholder="Opening: …\nInciting incident: …\nTurning points: …\nClimax: …\nEnding: …">${esc(b.plotBeats||'')}</textarea></section><section ${codexTab==='style'?'':'hidden'}><label for="writing-style">Writing style</label><textarea id="writing-style" rows="10" maxlength="6000" placeholder="Viewpoint, tense, tone, pacing, dialogue, and things to avoid…">${esc(b.writingStyle||'')}</textarea></section><section ${codexTab==='characters'?'':'hidden'}><div class="row spread wrap"><div><h2>Your cast</h2><p class="small muted">Build a character from scratch or let your writing model suggest one.</p></div>${btn('new-character','Create character','plus','primary')}</div><div class="board">${cards().filter(c=>c.category==='Character').map(c=>`<button class="note-card character-card" data-action="edit-character" data-id="${c.id}">${c.portrait?`<img src="${esc(c.portrait)}" alt="Portrait of ${esc(c.title)}">`:'<div class="portrait-placeholder" aria-hidden="true">✦</div>'}<span class="eyebrow">${esc(c.role||'Character')}</span><h3>${esc(c.title)}${c.conflicts?' ⚑':''}</h3><p>${esc(c.personality||plain(c.html||''))}</p></button>`).join('')||'<p class="muted">Every story starts with someone. Create your first character.</p>'}</div></section><section ${codexTab==='holes'?'':'hidden'}>${plotHolesPanel()}</section><div class="row spread wrap codex-footer"><span class="saved">${esc(currentSave)}</span>${btn('history','Codex history','clock','subtle',`data-id="${b.id}"`)}</div><p class="muted small">Saved with your book, backups and sync. Long Codex entries are condensed for each request; your originals remain intact.</p></div>`;}
let codexTab='summary';
let aiJob=null,aiReviewId=null,aiCheck=0,aiAvailable=false,aiEdit=null,aiTimer,aiSaveChain=Promise.resolve();
const generations=()=>all().filter(d=>d.type==='card'&&d.category==='Generated draft'&&d.book===bookId&&d.chapter===entryId).sort((a,b)=>b.revision.time-a.revision.time||b.id.localeCompare(a.id));
function aiStatus(text){const el=$('#ai-progress');if(el)el.textContent=text;paintModelProgress($('#ai-model')?.value,text);}
function updateAIControls(){
  const outline=$('#ai-outline');if(!outline)return;
  const length=outline.value.length,valid=!!outline.value.trim()&&length<=outlineLimit;
  $('#ai-outline-count').textContent=`${format(length)} / ${format(outlineLimit)} characters${length>outlineLimit?' · shorten the outline before writing':''}`;
  $('#ai-outline-count').classList.toggle('error',length>outlineLimit);
  outline.setAttribute('aria-invalid',String(length>outlineLimit));
  $('#ai-write').disabled=!!aiJob||!aiAvailable||!valid||!$('#ai-prompt').value.trim();
  $('#ai-generate').disabled=!!aiJob||!aiAvailable;
}
function captureAI(){
  if(!aiEdit||aiJob||!$('#ai-prompt'))return;
  const patch={prompt:$('#ai-prompt').value,outline:$('#ai-outline').value,model:$('#ai-model').value,targetWords:Number($('#ai-length').value)};
  if(Object.entries(patch).every(([k,v])=>aiEdit.body[k]===v))return;
  // Editing the plan for another attempt never changes the inputs attached to a finished draft.
  if(aiEdit.body.html){const c=find(entryId);aiEdit={id:uuid(),base:null,body:{...aiEdit.body,html:'',sourceRevision:c.revision.id},edits:0,saved:0};aiReviewId=null;$('#ai-review').hidden=true;}
  Object.assign(aiEdit.body,patch,{status:'Outline draft',issue:''});aiEdit.edits++;
  $('#ai-outline-saved').textContent='Saving…';clearTimeout(aiTimer);aiTimer=setTimeout(()=>flushAI().catch(fail),800);updateAIControls();
}
function flushAI(){
  clearTimeout(aiTimer);
  aiSaveChain=aiSaveChain.catch(()=>{}).then(async()=>{
    const d=aiEdit;if(!d||d.edits===d.saved)return;
    const edit=d.edits,r=revise(d.id,d.body,d.base?[d.base]:[]);
    try{await persist([r]);d.base=r.id;d.saved=edit;aiReviewId=d.id;if(aiEdit===d&&$('#ai-outline-saved'))$('#ai-outline-saved').textContent=d.edits===edit?'Saved on this device':'Saving…';}
    catch(e){if($('#ai-outline-saved'))$('#ai-outline-saved').textContent='Save failed · keep this screen open and copy your outline';throw e;}
  });return aiSaveChain;
}
async function showAI(id){
  if(aiJob)return;await flushAI();
  const c=find(entryId);if(!c||c.deleted)throw Error('Choose a chapter first.');
  const saved=generations(),g=saved.find(g=>g.id===id)||saved[0];aiReviewId=g?.id||null;
  let preferred=storage.native?'apple':'qwen-1.7';try{preferred=localStorage.getItem('quill-ai-model')||preferred;}catch{}
  if(g?.model&&!localStorage.getItem('quill-ai-model'))preferred=g.model;
  if(!modelChoices().some(([key])=>key===preferred))preferred=storage.native?'apple':'qwen-1.7';
  const body=g?bodyOf(g):{type:'card',category:'Generated draft',book:bookId,chapter:c.id,sourceRevision:c.revision.id,title:c.title,prompt:c.synopsis||'',targetWords:1500,model:preferred,outline:'',html:'',status:'Outline draft',issue:'',deleted:false};
  aiEdit={id:g?.id||uuid(),base:g?.revision.id||null,body:{...body,outline:body.outline||'',model:preferred},edits:0,saved:0};aiAvailable=false;
  modal.classList.add('ai-modal');
  showModal(`<header class="ai-header"><div class="row spread">${btn('close','Manuscript','back','subtle','aria-label="Back to manuscript"')}<span class="badge">YOUR MODEL · YOUR STORY</span></div><div class="ai-heading">${art('quill','ai-heading-art')}<h1 id="modal-title">Chapter writer</h1><p>${esc(c.title)}</p></div><ol class="ai-steps" aria-label="Writing steps"><li>1 <span>Outline & review</span></li><li>2 <span>Write chapter</span></li></ol></header><main class="ai-content"><div ${saved.length?'':'hidden'}><div class="row spread wrap"><label for="ai-saved-drafts">Saved outlines & drafts</label>${btn('manage-drafts','Manage drafts','','subtle')}</div><select id="ai-saved-drafts">${saved.map(d=>`<option value="${d.id}" ${d.id===g?.id?'selected':''}>${new Date(d.revision.time).toLocaleString()} · ${esc(d.status)}${d.html?' · '+format(words(d))+' words':''}</option>`).join('')}</select></div><form id="ai-form"><section class="ai-section"><div class="row spread wrap"><h2>Your chapter brief</h2>${btn('ai-plot','Codex','note','subtle')}</div><label for="ai-model">Writing model</label><select id="ai-model">${modelChoices().map(([key,label])=>`<option value="${key}" ${preferred===key?'selected':''}>${esc(label)}</option>`).join('')}</select><p id="ai-availability" class="small muted" role="status">Checking this device…</p><div id="writer-download">${progressPanel(preferred)}</div>${btn('ai-check','Check again','','subtle')}${btn('manage-models','Manage Models','settings','subtle')}<div id="qwen-updates" ${!isLocalModel(preferred)?'hidden':''}>${btn('qwen-check-update','Check model updates','','subtle')}${btn('qwen-update','Download update','','subtle','id="qwen-download-update" hidden')}<p id="qwen-update-status" class="small muted">Checks for newer files for the selected downloadable model.</p></div><label for="ai-prompt">What happens in this chapter?</label><textarea id="ai-prompt" required maxlength="6000" rows="4" placeholder="Describe the events, viewpoint, and where this chapter should end…">${esc(body.prompt||'')}</textarea><label for="ai-length">Approximate chapter length</label><select id="ai-length">${chapterLengths.map(n=>`<option value="${n}" ${n===(body.targetWords||1500)?'selected':''}>${format(n)} words</option>`).join('')}</select><p class="small muted">Uses your Codex summary, plot beats, writing style, characters, story notes, earlier chapter synopses and the previous chapter’s ending. First, we’ll suggest an outline for you to review.</p><div class="modal-actions"><button id="ai-generate" class="btn" type="submit" disabled>${body.outline?'Generate a new outline':'Generate outline'}</button></div></section></form><section id="ai-outline-section" class="ai-section"><span class="eyebrow">STEP 1 · YOU SHAPE THE STORY</span><h2>Review your outline</h2><p class="small muted">Change the events, add details, or write your own outline. Chapter writing starts only when you approve this version.</p><label for="ai-outline">Chapter outline</label><textarea id="ai-outline" rows="9" aria-describedby="ai-outline-count" placeholder="Generate an outline above, or write the beats you want the chapter to follow…">${esc(body.outline||'')}</textarea><div class="row spread wrap small muted"><span id="ai-outline-count"></span><span id="ai-outline-saved">${g?'Saved on this device':'Changes save automatically'}</span></div><div class="modal-actions">${btn('ai-write','Approve outline & write chapter','write','primary','id="ai-write" disabled')}</div><p class="small muted">Keep Quill open during generation. You can stop and keep any text written so far.</p></section><div class="ai-job-status"><div id="ai-progress" class="ai-progress" role="status" aria-live="polite"></div>${btn('ai-stop','Stop & keep draft','','subtle','id="ai-stop" hidden')}</div><section id="ai-review" class="ai-section" ${body.html?'':'hidden'}><span class="eyebrow">STEP 2 · YOUR CHAPTER DRAFT</span><h2>Read your chapter</h2><p id="ai-issue" class="small muted">${esc(body.issue||'Review the draft before adding it to your manuscript.')}</p><textarea id="ai-draft-text" class="ai-draft-preview" aria-label="Generated chapter draft" readonly>${esc(plain(body.html||''))}</textarea><div class="modal-actions">${btn('ai-use','Use draft & edit','write','primary',`id="ai-use" ${body.html?'':'disabled'}`)}</div><p class="small muted">Your previous writing stays in version history. Use the manuscript editor to make further changes.</p></section></main>`);
  modal.querySelector('.close-dialog').remove();modal.scrollTop=0;await checkAIModel();
}
async function checkAIModel(){
  const select=$('#ai-model');if(!select||aiJob)return;
  const token=++aiCheck,model=select.value;aiAvailable=false;updateAIControls();$('#qwen-updates').hidden=!isLocalModel(model);$('#qwen-download-update').hidden=true;$('#writer-download').innerHTML=progressPanel(model);
  try{const result=await checkModel(model);if(token!==aiCheck||aiJob||!$('#ai-model')||$('#ai-model').value!==model)return;$('#ai-availability').textContent=result.message;aiAvailable=result.available;updateAIControls();}
  catch(e){if(token===aiCheck&&$('#ai-availability'))$('#ai-availability').textContent=e.message;}
}
async function checkAIUpdate(){
  if(aiJob)return;const model=$('#ai-model').value,token=aiCheck;$('#qwen-update-status').textContent='Checking model updates…';
  try{const result=await checkQwenUpdate(model);if(token!==aiCheck||!$('#ai-model')||$('#ai-model').value!==model)return;$('#qwen-update-status').textContent=result.message;$('#qwen-download-update').hidden=!result.available;}
  catch(e){if(token===aiCheck&&$('#qwen-update-status'))$('#qwen-update-status').textContent=e.message;}
}
async function downloadAIUpdate(){
  if(aiJob)return;const model=$('#ai-model').value,controller=new AbortController();aiJob={controller,kind:'update'};setAIBusy(true);
  let message;
  try{message=await updateQwen(model,{signal:controller.signal,onStatus:aiStatus});}
  catch(e){message=controller.signal.aborted?'Download stopped. Your installed version is kept.':e.message;}
  finally{aiJob=null;setAIBusy(false);await checkAIModel();aiStatus(message);}
}
function setAIBusy(busy){
  if(busy)aiCheck++;
  for(const e of modal.querySelectorAll('input,textarea,select,button'))e.disabled=busy;
  // Generated prose stays selectable so it can be copied even during generation or a save failure.
  if($('#ai-draft-text'))$('#ai-draft-text').disabled=false;
  const stop=$('#ai-stop');if(stop){stop.hidden=!busy;stop.disabled=false;}
  modal.setAttribute('aria-busy',String(busy));updateAIControls();
}
function checkpointAI(job){
  const body={...job.body,...(job.kind==='outline'?{outline:job.text}:{html:textToHTML(job.text)})};
  job.saves=job.saves.catch(()=>{}).then(async()=>{
    const r=revise(job.id,body,[job.base]);await persist([r]);job.base=r.id;
  }).catch(e=>{job.saveError=e;job.controller.abort();throw e;});return job.saves;
}
async function startAI(kind='outline'){
  if(aiJob)return;captureAI();
  const prompt=$('#ai-prompt').value.trim(),model=$('#ai-model').value,targetWords=Number($('#ai-length').value),outline=$('#ai-outline').value;
  if(!prompt)throw Error('Describe what should happen in this chapter.');
  if(kind==='chapter'&&(!outline.trim()||outline.length>outlineLimit))throw Error('Review the chapter outline and keep it within the character limit before writing.');
  const sourceRevision=aiEdit.body.sourceRevision;
  const controller=new AbortController();aiJob={controller,kind};setAIBusy(true);
  let c,b,id;
  try{
    await flush();c=find(entryId);b=book();
    id=await create({type:'card',category:'Generated draft',book:b.id,chapter:c.id,sourceRevision:kind==='chapter'?sourceRevision:c.revision.id,title:c.title,prompt,targetWords,model,outline:kind==='chapter'?outline:'',html:'',status:kind==='outline'?'Planning':'Writing',issue:''});
  }catch(e){aiJob=null;setAIBusy(false);await checkAIModel();throw e;}
  const g=find(id),job={id,kind,base:g.revision.id,body:bodyOf(g),text:'',controller,saves:Promise.resolve(),lastSave:0};aiJob=job;aiEdit=null;aiReviewId=id;
  $('#ai-review').hidden=kind==='outline';$('#ai-draft-text').value='';$('#ai-issue').textContent='Your original chapter stays unchanged until you choose Use draft & edit.';
  if(kind==='outline')$('#ai-outline').value='';
  setAIBusy(true);aiStatus(kind==='outline'?'Preparing your outline…':'Preparing the chapter writer…');let writer;
  $('#ai-progress').scrollIntoView({block:'center'});
  try{
    writer=await createWriter(model,{signal:controller.signal,onStatus:aiStatus});
    const generate=kind==='outline'?generateChapterOutline:generateChapter;
    await generate({...buildChapterContext(b,c,chapters(),cards(),plain),prompt,targetWords,outline},{
      request:writer.request,signal:controller.signal,onStatus:aiStatus,
      onText:text=>{if(controller.signal.aborted)return;job.text=text;const field=$(kind==='outline'?'#ai-outline':'#ai-draft-text');if(field)field.value=text;if(Date.now()-job.lastSave>5000){job.lastSave=Date.now();checkpointAI(job).catch(fail);}}
    });
    job.body.status=kind==='outline'?'Outline ready':'Ready';
  }catch(e){job.body.status=controller.signal.aborted?'Stopped':'Failed';job.body.issue=controller.signal.aborted?'Writing stopped. Any generated text is saved for review.':e.message;}
  finally{
    writer?.close();
    try{await checkpointAI(job);await job.saves;}catch(e){job.saveError=e;fail(e);}
    aiJob=null;modal.setAttribute('aria-busy','false');
    if(job.saveError){aiEdit={id:job.id,base:job.base,body:{...job.body,...(kind==='outline'?{outline:job.text}:{html:textToHTML(job.text)})},edits:1,saved:0};setAIBusy(false);$('#ai-outline-saved').textContent='Save failed · copy your outline or retry closing to save';$('#ai-generate').disabled=true;$('#ai-write').disabled=true;$('#ai-use').disabled=true;aiStatus('Draft could not be saved. Copy the text before closing.');}
    else{await showAI(id);aiStatus(job.body.status==='Outline ready'?'Outline ready · review and edit, then approve it to write.':job.body.status==='Ready'?`Draft ready · ${format(countWords(job.text))} words`:job.body.issue);$(kind==='outline'?'#ai-outline-section':'#ai-review').scrollIntoView({block:'start'});}
  }
}
function stopAI(){if(!aiJob)return;aiStatus('Stopping · keeping the draft…');aiJob.controller.abort();}
async function useGeneratedDraft(){
  if(aiJob)return;await flush();
  const g=find(aiReviewId),c=g?find(g.chapter):null;
  if(!g?.html)throw Error('There is no generated text to use yet.');
  if(!canUseDraft(g,c)){
    // A chapter edited, deleted or synced during generation must never be replaced from an old snapshot.
    entryId=await create({type:'chapter',book:g.book,title:g.title+' — generated draft',html:g.html,synopsis:g.prompt,status:'Drafting',order:Math.max(0,...chapters().map(c=>c.order||0))+1000});
    toast('The original chapter changed. Added this draft as a separate chapter so both are kept.');
  }else{await changeFromBase(c.id,c.revision.id,{html:g.html,beats:undefined,status:'Drafting',synopsis:c.synopsis||g.prompt});entryId=c.id;toast('Draft added. Your previous chapter is in version history.');}
  await change(g.id,{status:'Used'});aiEdit=null;modal.close();view='write';closePanels();render();
}
async function dismissModal(){if(extraJob){toast('Wait for this operation to finish, or use Stop.');return;}if(aiJob){aiStatus('The writer stays open until generation finishes. Use Stop & keep draft to end it early.');return;}await flushAI();await flushCharacter();await flushWorkshop();modal.close();}
modal.addEventListener('cancel',e=>{e.preventDefault();dismissModal().catch(fail);});
modal.addEventListener('click',e=>{if(e.target!==modal)return;const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismissModal().catch(fail);});
document.addEventListener('pointerdown',e=>{if(document.body.classList.contains('sidebar-open')&&!e.target.closest('.sidebar,[data-action="sidebar"]'))closePanels();});
modal.addEventListener('close',()=>{if(modal.open)return;modal.classList.remove('ai-modal','manager-modal','work-modal');if(!workshopInline)workshopEdit=null;workshopDirty=false;modal.removeAttribute('aria-busy');aiEdit=null;const characterWasOpen=!!characterEdit;characterEdit=null;aiCheck++;if(characterWasOpen&&bookId)render();});

let extraJob=null,characterEdit=null,characterTimer,characterSaveChain=Promise.resolve(),suggestionId=null;
function preferredModel(){let value;try{value=localStorage.getItem('quill-ai-model');}catch{}return modelChoices().some(([id])=>id===value)?value:storage.native?'apple':'qwen-1.7';}
function modelSelect(id='codex-model'){return `<label for="${id}">Writing model</label><select id="${id}">${modelChoices().map(([key,label])=>`<option value="${key}" ${key===preferredModel()?'selected':''}>${esc(label)}</option>`).join('')}</select><p id="codex-model-status" class="small muted" role="status"></p>${progressPanel(preferredModel())}`;}
async function codexModelStatus(){const select=$('#codex-model');if(!select)return;const value=select.value;const state=await checkModel(value);if($('#codex-model')?.value===value)$('#codex-model-status').textContent=state.message;}
function extraStatus(text){const status=$('#extra-status');if(status)status.textContent=text;paintModelProgress(extraJob?.model||$('#codex-model')?.value,text);}
function lockExtra(busy){const scope=workshopInline?$('#inline-generation')||modal:modal;for(const el of scope.querySelectorAll('button,input,textarea,select'))el.disabled=busy;const stop=$('#extra-stop');if(stop){stop.hidden=!busy;stop.disabled=false;}if($('#codex-suggestion'))$('#codex-suggestion').disabled=false;modal.setAttribute('aria-busy',String(busy));}
function suggestionControls(kind){return `<label for="codex-prompt">${kind==='character'?'Character idea · optional':'Direction for the next beat · optional'}</label><textarea id="codex-prompt" rows="2" maxlength="6000" placeholder="${kind==='character'?'A reluctant guide with something to hide…':'What thread should the story follow next?'}"></textarea><div class="row wrap">${btn('generate-codex',kind==='character'?'Generate character':'Suggest next beat','write','primary',`data-kind="${kind}"`)}${btn('extra-stop','Stop','','subtle','id="extra-stop" hidden')}</div><p id="extra-status" class="small" role="status"></p><section id="codex-suggestion-section" hidden><label for="codex-suggestion">AI suggestion · review and edit</label><textarea id="codex-suggestion" rows="8"></textarea>${btn(kind==='character'?'apply-character':'apply-beat',kind==='character'?'Apply character details':'Add beat to plot','check','primary')}</section>`;}
async function showCharacter(id){
  await flush();modal.classList.remove('ai-modal');aiEdit=null;
  const card=id?find(id):null;
  characterEdit={id:card?.id||uuid(),base:card?.revision.id||null,body:card?bodyOf(card):{type:'card',category:'Character',book:bookId,title:'',html:'',portrait:'',deleted:false},edits:0,saved:0};
  const c=characterEdit.body;suggestionId=null;
  showModal(modalHead('Character builder','Create someone from the ground up, or ask your writing model for a starting point.')+`<div id="character-form"><div class="character-portrait"><img id="character-portrait" ${c.portrait?`src="${esc(c.portrait)}"`:'hidden'} alt="Character portrait"><div class="row wrap">${btn('generate-portrait','Generate portrait','write')}${btn('upload-portrait','Upload image','','subtle')}${btn('remove-portrait','Remove image','','subtle')}</div><input id="portrait-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><p id="portrait-availability" class="small muted">Checking image creation…</p></div><label for="character-title">Name</label><input id="character-title" maxlength="1000" value="${esc(c.title)}">${characterFields.map(([key,label])=>`<label for="character-${key}">${label}</label><textarea id="character-${key}" data-character-field="${key}" rows="${['role','age'].includes(key)?1:3}" maxlength="6000">${esc(c[key]||'')}</textarea>`).join('')}<label for="character-notes">Other notes</label><textarea id="character-notes" rows="4" maxlength="100000">${esc(plain(c.html||''))}</textarea><p id="character-saved" class="small saved">${card?'Saved on this device':'Details save as you write'}</p><div class="row wrap">${btn('close','Done','check','primary')}${card?btn('history','History','clock','subtle',`data-id="${card.id}"`)+btn('delete','Trash','trash','subtle danger',`data-id="${card.id}"`):''}</div></div><details class="character-ai"><summary>Build with AI</summary>${modelSelect()}${storage.native?'<label class="check-label"><input type="checkbox" id="character-auto-portrait"> Open portrait creator after applying character</label>':''}${suggestionControls('character')}</details>`);
  const aiPanel=modal.querySelector('.character-ai');modal.insertBefore(aiPanel,$('#character-form'));aiPanel.open=!card;
  const previous=all().filter(d=>d.book===bookId&&d.category==='Codex suggestion'&&d.status==='character').sort((a,b)=>b.revision.time-a.revision.time)[0];
  if(previous){suggestionId=previous.id;$('#codex-suggestion').value=plain(previous.html);$('#codex-suggestion-section').hidden=false;}
  await codexModelStatus();let available=false;try{available=storage.native&&await storage.bridge('portraitStatus');}catch{}
  if(!$('#portrait-availability'))return;
  $('#portrait-availability').textContent=available?'Uses Apple Image Playground. Preview and choose the image; Apple’s availability and usage limits apply.':'Image Playground needs a supported iPhone/iPad with Apple Intelligence. You can upload a portrait created elsewhere.';
  $('[data-action="generate-portrait"]').disabled=!available;
}
function captureCharacter(){
  if(!characterEdit||!$('#character-title')||extraJob)return;
  const patch={title:$('#character-title').value,html:textToHTML($('#character-notes').value)};
  for(const [key] of characterFields)patch[key]=$('#character-'+key).value;
  if(Object.entries(patch).every(([k,v])=>characterEdit.body[k]===v))return;
  Object.assign(characterEdit.body,patch);characterEdit.edits++;$('#character-saved').textContent='Saving…';clearTimeout(characterTimer);characterTimer=setTimeout(()=>flushCharacter().catch(fail),1000);
}
function flushCharacter(){
  clearTimeout(characterTimer);characterSaveChain=characterSaveChain.catch(()=>{}).then(async()=>{
    const d=characterEdit;if(!d||d.edits===d.saved)return;
    const edit=d.edits,r=revise(d.id,{...d.body,title:d.body.title.trim()||'Unnamed character'},d.base?[d.base]:[]);
    try{await persist([r]);d.base=r.id;d.saved=edit;if($('#character-saved'))$('#character-saved').textContent=d.edits===edit?'Saved on this device':'Saving…';}
    catch(e){if($('#character-saved'))$('#character-saved').textContent='Save failed · keep this screen open';throw e;}
  });return characterSaveChain;
}
async function setPortrait(data){if(!characterEdit||!$('#character-portrait'))return;characterEdit.body.portrait=data||'';characterEdit.edits++;const image=$('#character-portrait');image.hidden=!data;if(data)image.src=data;else image.removeAttribute('src');await flushCharacter();}
async function generatePortrait(){
  if(extraJob)return;captureCharacter();await flushCharacter();extraJob={kind:'portrait'};lockExtra(true);extraStatus('Choose a portrait in Image Playground…');
  try{const image=await storage.bridge('portraitGenerate',{prompt:portraitPrompt(characterEdit.body)},{timeout:1800000});if(image)await setPortrait(image);extraStatus(image?'Portrait saved.':'Portrait creation cancelled.');}
  finally{extraJob=null;lockExtra(false);if($('#extra-stop'))$('#extra-stop').hidden=true;}
}
async function importPortrait(file){
  if(!file)return;if(file.size>15000000||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPEG, PNG or WebP under 15 MB.');
  const url=URL.createObjectURL(file);
  try{const image=new Image();image.src=url;await image.decode();const scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);await setPortrait(canvas.toDataURL('image/jpeg',0.82));}finally{URL.revokeObjectURL(url);}
}
async function importCover(file){
  if(!file||!coverEdit)return;
  if(file.size>15000000||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPEG, PNG or WebP under 15 MB.');
  const edit=coverEdit,url=URL.createObjectURL(file);extraJob={kind:'cover'};lockExtra(true);$('#cover-status').textContent='Preparing your cover…';
  try{
    const image=new Image();image.src=url;await image.decode();
    const scale=Math.min(1,900/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fffdf8';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    let data=canvas.toDataURL('image/jpeg',.82);if(data.length>650000)data=canvas.toDataURL('image/jpeg',.6);if(data.length>700000)throw Error('This cover is too detailed. Try a smaller image.');
    if(coverEdit!==edit||!$('#cover-preview'))return;edit.portrait=data;edit.changed=true;$('#cover-preview').innerHTML=`<img src="${data}" alt="Book cover preview">`;$('#cover-status').textContent='Ready. Save the book to keep this cover.';
  }catch(e){if($('#cover-status'))$('#cover-status').textContent='The image could not be used. Choose another cover.';throw e;}
  finally{URL.revokeObjectURL(url);extraJob=null;lockExtra(false);}
}
async function saveCover(){
  if(!coverEdit?.changed)return;
  // Store cover bytes separately so routine Codex edits don't duplicate the image.
  const body={type:'card',book:bookId,category:'Book cover',title:'Book cover',portrait:coverEdit.portrait,html:'',deleted:false};
  if(coverEdit.id)await changeFromBase(coverEdit.id,coverEdit.base,body);else coverEdit.id=await create(body);
  coverEdit.changed=false;
}
async function showNextBeat(){
  await flush();modal.classList.remove('ai-modal');aiEdit=null;suggestionId=null;
  showModal(modalHead('The next story beat','Follow the threads already in your Codex. Nothing is added to the plot until you choose it.')+modelSelect()+suggestionControls('beat'));
  const saved=all().filter(d=>d.book===bookId&&d.category==='Codex suggestion'&&d.status==='beat').sort((a,b)=>b.revision.time-a.revision.time)[0];
  if(saved){suggestionId=saved.id;$('#codex-suggestion').value=plain(saved.html);$('#codex-suggestion-section').hidden=false;}
  await codexModelStatus();
}
async function runCodex(kind){
  if(extraJob||aiJob)return;captureCharacter();await flush();
  const model=$('#codex-model').value,request=$('#codex-prompt').value,controller=new AbortController();
  const b=book(),cs=chapters(),c=cs.at(-1)||{id:'codex',title:'Codex'};
  const context=buildChapterContext(b,c,cs.length?cs:[c],cards(),plain);
  context.earlier=cs.map(c=>c.title+': '+(c.synopsis||'')).join('\n');
  context.prompt=request||(kind==='character'?'Invent a new character who belongs in this story.':'Suggest the next beat after the last listed plot event.');
  if(kind==='character')context.prompt+='\nPreserve these details already supplied for this character:\n'+characterContext(characterEdit.body,plain);
  const id=await create({type:'card',book:bookId,category:'Codex suggestion',title:kind==='character'?'Character suggestion':'Next plot beat',status:kind,html:'',prompt:request,model});suggestionId=id;
  const record=find(id),job={id,base:record.revision.id,body:bodyOf(record),kind:'codex',controller,text:'',saves:Promise.resolve(),lastSave:0};extraJob={controller,kind};lockExtra(true);$('#codex-suggestion-section').hidden=false;$('#codex-suggestion').value='';extraStatus('Reading the Codex…');let writer;
  try{writer=await createWriter(model,{signal:controller.signal,onStatus:extraStatus});const text=await generateCodex(kind,context,{request:writer.request,signal:controller.signal,onStatus:extraStatus,onText:text=>{if(!controller.signal.aborted){$('#codex-suggestion').value=text;job.text=text;if(Date.now()-job.lastSave>5000){job.lastSave=Date.now();checkpointAI(job).catch(fail);}}}});$('#codex-suggestion').value=text;extraStatus('Suggestion ready. Review and edit it before applying.');}
  catch(e){extraStatus(controller.signal.aborted?'Stopped. Any suggestion so far is kept.':e.message);}
  finally{writer?.close();job.text=$('#codex-suggestion').value;try{await checkpointAI(job);}catch(e){extraStatus('Suggestion could not be saved. Copy the text before closing.');throw e;}finally{extraJob=null;lockExtra(false);}}
}
async function applyCharacter(){
  if(extraJob)return;const data=parseCharacter($('#codex-suggestion').value),portrait=$('#character-auto-portrait')?.checked;
  $('#character-title').value=data.title;for(const [key] of characterFields)$('#character-'+key).value=data[key];captureCharacter();await flushCharacter();if(suggestionId)await change(suggestionId,{status:'Used character',html:textToHTML($('#codex-suggestion').value)});extraStatus('Character details saved. You can edit every field.');if(portrait)await generatePortrait();
}
async function applyBeat(){
  if(extraJob)return;const text=$('#codex-suggestion').value.trim();if(!text)throw Error('Write or generate a beat first.');await flush();const b=book();await change(b.id,{plotBeats:[b.plotBeats||'',text].filter(Boolean).join('\n\n')});if(suggestionId)await change(suggestionId,{status:'Used beat',html:textToHTML(text)});modal.close();codexTab='beats';view='plot';render();toast('Beat added to your Codex.');
}
const sizeLabel=bytes=>bytes>=1e9?(bytes/1e9).toFixed(2)+' GB':(bytes/1e6).toFixed(1)+' MB';
async function manageModels(){
  if(aiJob||extraJob)return;await flush();aiEdit=null;characterEdit=null;modal.classList.remove('ai-modal');
  showModal(illustratedHead('models','Manage Models','A little help with the next chapter.','Choose how Quill writes. Downloaded models stay on this device; API connections use your chosen server.')+`<p id="extra-status" class="small" role="status">Checking model storage…</p>${btn('extra-stop','Stop download','','subtle','id="extra-stop" hidden')}<div id="model-list"></div><section class="settings-section"><h3>Your API connections</h3><p>Connect a model through an OpenAI-compatible chat API (including compatible local servers), or an Anthropic Messages API. Your provider’s model ID determines which model runs. Other API formats need an adapter.</p><div id="api-list">${connections().map(p=>`<div class="model-row"><div><strong>${esc(p.name)}</strong><p>${esc(p.model)} · ${esc(new URL(p.endpoint).host)}</p></div><div class="row wrap">${btn('use-model','Use','','subtle',`data-id="${p.id}"`)}${btn('edit-api','Edit','','subtle',`data-id="${p.id}"`)}${btn('delete-api','Remove','','subtle danger',`data-id="${p.id}"`)}</div></div>`).join('')}</div>${btn('new-api','Connect a model API','plus')}<p class="small muted">API generation sends your prompt and relevant Codex context to that server. Provider charges may apply. Keys and model downloads are excluded from book backups.</p></section><p class="small muted">Apple Intelligence storage is managed by iOS. Deleting a downloaded model removes its weights, older copies and partial downloads; your books and drafts remain.</p>`);
  modal.classList.add('manager-modal');const rows=await modelStorage();if(!$('#model-list'))return;
  $('#model-list').innerHTML=`<div class="model-row"><div><strong>Apple Intelligence</strong><p>Built into supported iPhone/iPad devices · managed in iOS Settings</p></div>${storage.native?btn('use-model','Use','','subtle','data-id="apple"'):''}</div>`+localModels.filter(m=>storage.native?m.native!==false:!!m.web).map(m=>{const r=rows.find(r=>r.id===m.id)||{};return `<div class="model-row" data-model-row="${m.id}"><div>${progressPanel(m.id,true)}<p>${r.installed?'Downloaded':r.partial?'Partial download':'Not downloaded'} · ${r.bytes?sizeLabel(r.bytes)+(r.estimated?' measured · some files unreported':' used'):r.estimated?'Cached · size unavailable':'about '+m.size+' download'}<br>${esc(m.description)}${m.id.startsWith('llama-')?' · Built with Llama':''}</p></div><div class="row wrap">${btn('use-model',preferredModel()===m.id?'Selected':'Use','','subtle',`data-id="${m.id}" aria-pressed="${preferredModel()===m.id}"`)}${btn('install-model',r.installed?'Check & update':'Download','','',`data-id="${m.id}"`)}${r.bytes||r.installed||r.partial||r.estimated?btn('delete-model','Delete','','subtle danger',`data-id="${m.id}"`):''}</div></div>`;}).join('');extraStatus('Selected: '+(modelChoices().find(([id])=>id===preferredModel())?.[1]||''));
}
async function installModel(id){
  if(extraJob)return;const controller=new AbortController();extraJob={controller,kind:'model',model:id};lockExtra(true);paintModelProgress(id,'Downloading model · preparing…');modal.querySelector(`[data-model-row="${id}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'});
  try{const state=await checkModel(id);if(!state.available)throw Error(state.message);await updateQwen(id,{signal:controller.signal,onStatus:extraStatus});extraStatus('Download complete.');toast('Model installed.');}
  catch(e){toast(controller.signal.aborted?'Download stopped. Existing installed models are kept.':e.message);}
  finally{extraJob=null;lockExtra(false);await manageModels();}
}
function apiForm(id){
  const p=connections().find(p=>p.id===id)||{format:'openai'};
  showModal(modalHead(p.id?'Edit API connection':'Connect a model API','Use the API base URL supplied by your provider, including its version path, and the exact model ID.')+`<form id="api-form" data-id="${p.id||''}"><label for="api-name">Connection name</label><input id="api-name" required maxlength="100" value="${esc(p.name||'')}" placeholder="My writing model"><label for="api-format">API format</label><select id="api-format"><option value="openai" ${p.format==='openai'?'selected':''}>OpenAI-compatible chat completions</option><option value="anthropic" ${p.format==='anthropic'?'selected':''}>Anthropic Messages</option></select><label for="api-endpoint">API base URL</label><input id="api-endpoint" type="url" required value="${esc(p.endpoint||'')}" placeholder="https://your-provider.example/v1" autocapitalize="none" spellcheck="false"><label for="api-model-id">Model ID</label><input id="api-model-id" required maxlength="200" value="${esc(p.model||'')}" placeholder="Provider’s exact model ID" autocapitalize="none" spellcheck="false"><label for="api-key">API key · optional for unauthenticated servers</label><input id="api-key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${p.hasKey?'Saved in Keychain · leave blank to keep':'Paste your key'}"><label class="check-label"><input type="checkbox" id="api-clear-key"> Remove saved key</label><p class="small muted">${storage.native?'Keys are saved in this iPhone’s Keychain. HTTPS is required.':'Keys remain in this tab’s session only. Paste them again after closing it. Your server must allow browser requests (CORS).'} Changing the server URL clears the old key unless you enter a new one.</p><div class="row wrap"><button class="btn primary" type="submit">Save connection</button>${btn('test-api','Save & test','','subtle')}${btn('manage-models','Back','','subtle')}</div><p id="extra-status" class="small" role="status"></p></form>`);
}
async function saveAPI(test=false){
  if(extraJob)return;const p=await saveConnection({id:$('#api-form').dataset.id||undefined,name:$('#api-name').value,endpoint:$('#api-endpoint').value,model:$('#api-model-id').value,format:$('#api-format').value},$('#api-key').value,$('#api-clear-key').checked);
  $('#api-form').dataset.id=p.id;$('#api-key').value='';$('#api-clear-key').checked=false;
  if(!test){await manageModels();toast('API connection saved. Choose Use to select it.');return;}
  const controller=new AbortController();extraJob={controller,kind:'test'};lockExtra(true);let writer;
  try{writer=await createWriter(p.id,{signal:controller.signal,onStatus:extraStatus});await writer.request({instructions:'Reply briefly.',prompt:'Reply with OK.',maxTokens:100});extraStatus('Connected successfully. This test sent only “Reply with OK,” without book content.');}
  catch(e){extraStatus(e.message);}finally{writer?.close();extraJob=null;lockExtra(false);}
}
function progressPanel(id,inline=false){return `<div class="download-panel ${inline?'inline-progress':''}" data-model-progress="${esc(id)}" ${inline?'':'hidden'}><div class="model-heading"><strong>${esc(modelChoices().find(([key])=>key===id)?.[1]||'Writing model')}</strong><span class="download-percent"></span></div><div class="download-track" ${inline?'hidden':''} role="progressbar" aria-label="Model download progress" aria-valuemin="0" aria-valuemax="100"><span></span></div><p class="download-detail small" ${inline?'hidden':''}></p></div>`;}
function paintModelProgress(id,text){
  const progress=downloadProgress(text);if(!id||!progress)return;
  for(const panel of document.querySelectorAll('[data-model-progress]')){
    if(panel.dataset.modelProgress!==id)continue;panel.hidden=false;
    panel.querySelector('.download-percent').textContent=progress.label;
    const bar=panel.querySelector('[role="progressbar"]');bar.hidden=false;bar.classList.toggle('indeterminate',progress.value===null);
    if(progress.value===null)bar.removeAttribute('aria-valuenow');else bar.setAttribute('aria-valuenow',String(progress.value));
    bar.setAttribute('aria-valuetext',progress.label);bar.firstElementChild.style.width=(progress.value??35)+'%';
    panel.querySelector('.download-detail').hidden=false;panel.querySelector('.download-detail').textContent=text;
  }
}
let draftScope=null,draftFilter='all',draftQuery='',draftSelection=new Set(),pendingDraftDeletion=[];
const draftRows=()=>draftStorage(revisions,draftScope).filter(d=>draftMatches(d,draftFilter,draftQuery));
async function manageDrafts(scope=bookId){
  if(aiJob||extraJob||!bookId)return;await flush();aiEdit=null;characterEdit=null;aiReviewId=null;
  draftScope=bookId;draftSelection.clear();modal.classList.remove('ai-modal');
  showModal(`<div class="draft-manager">${illustratedHead('drafts','Manage drafts','Make room for the next idea.','Review saved beat maps, writing attempts, edits and Codex suggestions. Your manuscript and characters stay separate.')}<div class="draft-summary" id="draft-summary"></div><p class="draft-book-name small muted">For ${esc(book().title)}</p><div class="draft-filters"><div><label for="draft-filter">Show</label><select id="draft-filter">${[['all','All drafts'],['outlines','Outlines'],['chapters','Chapter drafts'],['suggestions','Codex suggestions'],['used','Already used'],['unfinished','Stopped or unfinished']].map(([v,l])=>`<option value="${v}" ${v===draftFilter?'selected':''}>${l}</option>`).join('')}</select></div></div><label for="draft-search" class="sr-only">Search drafts</label><input id="draft-search" type="search" placeholder="Find a draft…" value="${esc(draftQuery)}"><div class="draft-selection row spread wrap"><label class="check-label"><input id="draft-select-all" type="checkbox"> Select shown drafts</label>${btn('delete-drafts','Delete selected','trash','danger','id="delete-selected-drafts" disabled')}</div><div id="draft-list"></div><p class="small muted">Storage estimates include saved revisions. Permanent deletion removes their text and keeps a tiny deletion record for sync. Existing exported backups keep their copies.</p></div>`);
  modal.classList.add('manager-modal');renderDraftList();modal.scrollTop=0;
}
function renderDraftList(){
  const rows=draftRows(),allRows=draftStorage(revisions,draftScope),bytes=allRows.reduce((n,d)=>n+d.bytes,0);
  $('#draft-summary').innerHTML=`<div><strong>${allRows.length}</strong><span>saved drafts</span></div><div><strong>${sizeLabel(bytes)}</strong><span>text & saved revisions</span></div>`;
  $('#draft-list').innerHTML=rows.map(d=>`<article class="draft-row"><label class="draft-check"><input type="checkbox" data-draft-select="${d.id}" aria-label="Select ${esc(d.title)}" ${draftSelection.has(d.id)?'checked':''}></label><div class="draft-body"><div class="row spread wrap"><span class="badge">${draftKind(d)}</span><span class="small muted">${sizeLabel(d.bytes)}</span></div><h3>${esc(d.title)}</h3><p class="small muted">${esc(find(d.book)?.title||'Deleted book')} · ${esc(d.status||'Saved')}${d.deleted?' · in trash':''}</p><p class="draft-excerpt">${esc(plain(d.html||'')||d.outline||d.prompt||'No generated text yet.')}</p><div class="row spread wrap"><time>${new Date(d.revision.time).toLocaleDateString()}</time><div class="row">${btn('review-draft','Review','','subtle',`data-id="${d.id}"`)}${btn('delete-one-draft','Delete','trash','subtle danger',`data-id="${d.id}"`)}</div></div></div></article>`).join('')||`<div class="draft-empty">${art('drafts')}<h3>${allRows.length?'No matching drafts.':'A little room to dream.'}</h3><p>${allRows.length?'Try a different filter or search.':'Your saved outlines and AI suggestions will appear here.'}</p></div>`;
  updateDraftSelection();
}
function updateDraftSelection(){
  const rows=draftRows(),ids=new Set(rows.map(d=>d.id));draftSelection=new Set([...draftSelection].filter(id=>ids.has(id)));
  const all=$('#draft-select-all');all.checked=!!rows.length&&rows.every(d=>draftSelection.has(d.id));all.indeterminate=!!draftSelection.size&&!all.checked;all.disabled=!rows.length;
  const button=$('#delete-selected-drafts');button.disabled=!draftSelection.size;button.innerHTML=icon('trash')+`Delete selected${draftSelection.size?' ('+draftSelection.size+')':''}`;
}
function reviewDraft(id){
  const d=find(id);if(!d)throw Error('This draft was deleted.');
  showModal(illustratedHead('drafts',esc(d.title),draftKind(d),`${esc(d.status||'Saved')} · ${new Date(d.revision.time).toLocaleString()}`)+`<div class="draft-review">${d.prompt?`<h3>Brief</h3><p>${esc(d.prompt)}</p>`:''}${d.outline?`<h3>Outline</h3><p>${esc(d.outline)}</p>`:''}${d.html?`<h3>${d.category==='Codex suggestion'?'Suggestion':d.operation?'Writing suggestion':'Chapter draft'}</h3><p>${esc(plain(d.html))}</p>`:''}${!d.prompt&&!d.outline&&!d.html?'<p>No generated text was saved.</p>':''}</div><div class="row wrap">${d.category==='Generated draft'&&!d.deleted&&find(d.chapter)&&!find(d.chapter).deleted&&find(d.book)&&!find(d.book).deleted?btn('open-saved-draft','Open saved writing task','write','primary',`data-id="${id}"`):''}${btn('export-draft','Export text','export','',`data-id="${id}"`)}${btn('back-drafts','Back to drafts','','subtle')}</div>`);modal.classList.add('manager-modal');modal.scrollTop=0;
}
function confirmDraftDeletion(ids){
  const items=draftStorage(revisions).filter(d=>ids.includes(d.id));pendingDraftDeletion=items.map(d=>d.id);
  if(!items.length)return manageDrafts(draftScope);
  showModal(modalHead(`Permanently delete ${items.length===1?'this draft':items.length+' drafts'}?`,`This removes the selected outlines, generated text or suggestions and all their saved revisions (${sizeLabel(items.reduce((n,d)=>n+d.bytes,0))} estimated). It cannot be undone in Quill. Text already added to your manuscript or Codex stays saved.`)+`<ul class="delete-list">${items.slice(0,5).map(d=>`<li>${esc(d.title)} · ${draftKind(d)}</li>`).join('')}${items.length>5?`<li>and ${items.length-5} more</li>`:''}</ul><p class="small muted">The deletion also applies to your connected sync folder when you next sync. Older exported backups remain unchanged.</p><div class="modal-actions">${btn('back-drafts','Keep drafts','','subtle')}${btn('confirm-draft-delete','Delete permanently','trash','danger')}</div>`);
}
const draftActions={
  'manage-drafts':()=>manageDrafts(bookId),'back-drafts':()=>manageDrafts(draftScope),
  'review-draft':el=>reviewDraft(el.dataset.id),'delete-one-draft':el=>confirmDraftDeletion([el.dataset.id]),'delete-drafts':()=>confirmDraftDeletion([...draftSelection]),
  'confirm-draft-delete':async()=>{
    if(extraJob)return;const ids=[...pendingDraftDeletion];await flush();const records=ids.filter(id=>find(id)).map(id=>purgeDraft(revisions,id));
    extraJob={kind:'cleanup'};lockExtra(true);
    try{await persist(records);pendingDraftDeletion=[];draftSelection.clear();render();toast(`${records.length} draft${records.length===1?'':'s'} permanently deleted. ${connected?'Syncing the deletion…':''}`);}
    finally{extraJob=null;lockExtra(false);}
    await manageDrafts(draftScope);
    if(connected)try{await doSync();}catch{toast('Drafts deleted on this device. Sync is paused; sync again to clean up the folder.');}
  },
  'export-draft':async el=>{const d=find(el.dataset.id);if(!d)return;const content=[d.title,d.prompt&&'BRIEF\n'+d.prompt,d.outline&&'OUTLINE\n'+d.outline,d.html&&plain(d.html)].filter(Boolean).join('\n\n');await storage.download((d.title.replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,80)||'Draft')+'.txt','text/plain',content);toast('Draft export is ready.');},
  'open-saved-draft':async el=>{const d=find(el.dataset.id);if(!d||d.deleted)return;bookId=d.book;bookLanding=false;entryId=d.chapter;view='write';render();if(d.operation)await openWritingProposal(d.id);else await showAI(d.id);}
};
document.addEventListener('change',e=>{
  if(e.target.id==='draft-filter'){draftFilter=$('#draft-filter').value;draftSelection.clear();renderDraftList();}
  if(e.target.dataset.draftSelect){e.target.checked?draftSelection.add(e.target.dataset.draftSelect):draftSelection.delete(e.target.dataset.draftSelect);updateDraftSelection();}
  if(e.target.id==='draft-select-all'){draftSelection=e.target.checked?new Set(draftRows().map(d=>d.id)):new Set();renderDraftList();}
});
document.addEventListener('input',e=>{if(e.target.id==='draft-search'){draftQuery=e.target.value;draftSelection.clear();renderDraftList();}});
const codexActions={
  'codex-tab':async el=>{await flush();codexTab=el.dataset.tab;render();},
  'new-character':()=>showCharacter(),'edit-character':el=>showCharacter(el.dataset.id),
  'next-beat':showNextBeat,'generate-codex':el=>runCodex(el.dataset.kind),'apply-character':applyCharacter,'apply-beat':applyBeat,
  'generate-portrait':generatePortrait,'upload-portrait':()=>$('#portrait-file').click(),'remove-portrait':()=>setPortrait(''),
  'remove-cover':()=>{if(!coverEdit)return;coverEdit.portrait='';coverEdit.changed=true;$('#cover-preview').innerHTML=art('codex');$('#cover-status').textContent='Cover will be removed when you save.';},
  'manage-models':manageModels,'install-model':el=>installModel(el.dataset.id),
  'extra-stop':()=>{extraJob?.controller?.abort();extraStatus('Stopping…');},
  'use-model':el=>{localStorage.setItem('quill-ai-model',el.dataset.id);extraStatus('Selected: '+modelChoices().find(([id])=>id===el.dataset.id)?.[1]);document.querySelectorAll('[data-action="use-model"]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.id===el.dataset.id));b.textContent=b.dataset.id===el.dataset.id?'Selected':'Use';});toast('Writing model selected.');},
  'delete-model':el=>{showModal(modalHead('Delete downloaded model?','This removes all downloaded versions and partial files for this model. Your books, Codex and generated drafts stay saved.')+`<div class="row wrap">${btn('confirm-model-delete','Delete model','trash','danger',`data-id="${el.dataset.id}"`)}${btn('manage-models','Keep model','','primary')}</div>`);},
  'confirm-model-delete':async el=>{await deleteModel(el.dataset.id);if(preferredModel()===el.dataset.id)localStorage.removeItem('quill-ai-model');await manageModels();toast('Model files deleted. You can download it again later.');},
  'new-api':()=>apiForm(),'edit-api':el=>apiForm(el.dataset.id),'test-api':()=>saveAPI(true),
  'delete-api':el=>{showModal(modalHead('Remove API connection?','The connection and its saved key will be removed from this device. Writing stays saved.')+`<div class="row wrap">${btn('confirm-api-delete','Remove connection','','danger',`data-id="${el.dataset.id}"`)}${btn('manage-models','Keep connection','','primary')}</div>`);},
  'confirm-api-delete':async el=>{await deleteConnection(el.dataset.id);await manageModels();}
};
document.addEventListener('input',e=>{if(e.target.closest('#character-form'))captureCharacter();});
document.addEventListener('change',e=>{if(e.target.id==='codex-model'){const panel=modal.querySelector('.download-panel');if(panel)panel.outerHTML=progressPanel(e.target.value);localStorage.setItem('quill-ai-model',e.target.value);codexModelStatus().catch(fail);}if(e.target.id==='portrait-file')importPortrait(e.target.files[0]).catch(fail);if(e.target.id==='cover-file')importCover(e.target.files[0]).catch(fail);});
document.addEventListener('submit',e=>{if(e.target.id==='api-form'){e.preventDefault();saveAPI().catch(fail);}});

// Beat editing uses the same immutable chapter revisions as ordinary manuscript text.
let beatHighlights=false,selectedPassage=null,workshopInline=false,workshopEdit=null,workshopDirty=false,workshopTimer,workshopSave=Promise.resolve();
function mountBeatEditor(c){
  const editor=$('#editor');selectedPassage=null;editor.innerHTML=manuscriptBeats(c).map((b,i)=>beatHighlights?`<section class="beat-block" data-beat-id="${b.id}" contenteditable="false"><header><span><b>BEAT ${i+1}</b> ${esc(b.title)}</span><div class="row wrap">${btn('edit-beat-plan','Details','note','subtle',`data-id="${b.id}"`)}${btn(b.html?'edit-beat-ai':'generate-beat',b.html?'Revise with AI':'Generate beat',b.html?'write':'spark','subtle',`data-id="${b.id}"`)}</div></header>${b.prompt?`<p class="beat-direction">${esc(b.prompt)}</p>`:''}<div class="beat-text" contenteditable="true" spellcheck="true" role="textbox" aria-label="Beat ${i+1} text" data-placeholder="Write this beat here…">${sanitize(b.html)}</div></section>`:`<div data-beat-id="${b.id}">${sanitize(b.html)}</div>`).join('');
}
function readEditorBeats(){
  const c=draft?.body||find(entryId),prior=manuscriptBeats({...c,id:entryId}),byId=new Map(prior.map(b=>[b.id,b])),result=[];
  for(const node of $('#editor').childNodes){
    const id=node.nodeType===1?node.dataset.beatId:null,old=byId.get(id);
    if(old){const html=sanitize(beatHighlights?node.querySelector('.beat-text')?.innerHTML||'':node.innerHTML),existing=result.find(b=>b.id===id);if(existing)existing.html+=html;else result.push({...old,html});}
    else{const html=sanitize(node.nodeType===3?esc(node.textContent):node.outerHTML||'');if(!html)continue;if(!result.length)result.push({id:entryId+'-loose',title:'Opening writing',prompt:'',html:''});result.at(-1).html+=html;}
  }
  for(const b of prior)if(!b.html&&!result.some(x=>x.id===b.id))result.push(b);
  return result.length?result:[{id:entryId+'-body',title:'Opening beat',prompt:'',html:''}];
}
function hideSelectionAction(){const button=$('#selection-ai');if(button){button.hidden=true;button.disabled=true;}selectedPassage=null;}
function captureSelection(){
  const button=$('#selection-ai'),s=getSelection(),editor=$('#editor');if(!button)return;
  if(!editor||modal.open||!s?.rangeCount||s.isCollapsed||!editor.contains(s.anchorNode)||!editor.contains(s.focusNode)){hideSelectionAction();return;}
  const r=s.getRangeAt(0),element=n=>n.nodeType===1?n:n.parentElement,block=element(r.startContainer)?.closest('[data-beat-id]'),end=element(r.endContainer)?.closest('[data-beat-id]');
  if(!block||block!==end){hideSelectionAction();return;}
  const textRoot=beatHighlights?block.querySelector('.beat-text'):block;
  if(!textRoot?.contains(r.startContainer)||!textRoot.contains(r.endContainer)||!r.toString().trim()){hideSelectionAction();return;}
  const prefix=document.createRange();prefix.selectNodeContents(textRoot);prefix.setEnd(r.startContainer,r.startOffset);
  selectedPassage={chapter:entryId,beatId:block.dataset.beatId,start:prefix.toString().length,end:prefix.toString().length+r.toString().length,text:r.toString(),html:sanitize(textRoot.innerHTML)};
  const viewport=window.visualViewport,top=(viewport?.offsetTop||0),bottom=top+(viewport?.height||innerHeight),left=viewport?.offsetLeft||0,width=viewport?.width||innerWidth,header=$('.topbar')?.getBoundingClientRect().bottom||top;
  const rect=[...r.getClientRects()].find(r=>r.width&&r.height&&r.bottom>Math.max(top,header)&&r.top<bottom)||r.getBoundingClientRect();
  if(rect.bottom<Math.max(top,header)||rect.top>bottom){button.hidden=true;return;}
  button.disabled=false;button.hidden=false;
  const box=button.getBoundingClientRect(),x=Math.min(left+width-box.width-8,Math.max(left+8,rect.left+rect.width/2-box.width/2));
  let y=rect.top-box.height-12;if(y<Math.max(top,header)+6)y=Math.min(bottom-box.height-8,rect.bottom+12);
  button.style.left=x+'px';button.style.top=Math.max(top+6,y)+'px';
}
function replacePassageHTML(html,start,end,expected,replacement){
  const root=document.createElement('div');root.innerHTML=sanitize(html);const nodes=[];const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode())nodes.push(n);
  if(root.textContent.slice(start,end)!==expected)throw Error('The selected text changed. Your suggestion is saved; select the passage again.');
  const point=offset=>{for(const node of nodes){if(offset<=node.length)return [node,offset];offset-=node.length;}throw Error('The selection is no longer available.');};
  const [sn,so]=point(start),[en,eo]=point(end),range=document.createRange();range.setStart(sn,so);range.setEnd(en,eo);range.deleteContents();
  const fragment=document.createDocumentFragment();String(replacement).split('\n').forEach((line,i)=>{if(i)fragment.append(document.createElement('br'));fragment.append(document.createTextNode(line));});range.insertNode(fragment);return sanitize(root.innerHTML);
}
function sectionPicker(){
  showModal(modalHead('Add a book section','Front matter, story chapters, and back matter all belong to this manuscript. You can rename and reorder them.')+`<form id="section-form"><label for="section-type">Section type</label><select id="section-type">${sectionTypes.map(([id,name,group])=>`<option value="${id}" ${id==='chapter'?'selected':''}>${esc(name)} · ${group==='front'?'front matter':group==='back'?'back matter':'story'}</option>`).join('')}</select><label for="section-title">Section title · optional</label><input id="section-title" maxlength="1000" placeholder="Use the section type as its title"><p class="small muted">Contents starts with your current section titles. Edit it before exporting, or add a new Contents section when your outline changes.</p><div class="modal-actions">${btn('close','Cancel','close','subtle')}<button class="btn primary" type="submit">${icon('plus')}Add section</button></div></form>`);
}
async function createSection(){
  await flush();const type=$('#section-type').value,title=$('#section-title').value.trim()||sectionTypes.find(([id])=>id===type)?.[1]||'Section';
  entryId=await create({type:'chapter',book:bookId,sectionType:type,title,html:sectionTemplate(type,book(),chapters()),synopsis:'',status:'To write',order:sectionOrder(type,chapters())});view='write';bookLanding=false;modal.close();closePanels();render();
}
function workshopContext(c=find(entryId)){return buildChapterContext(book(),c,chapters(),cards(),plain);}
function workStatus(text){const el=$('#work-status');if(el)el.textContent=text;paintModelProgress(extraJob?.model||$('#codex-model')?.value,text);}
function workRecord(body,id,base){workshopEdit={id:id||uuid(),base:base||null,body,edits:0,saved:0};workshopDirty=false;}
function captureWorkshop(){
  if(!workshopEdit||extraJob)return;const patch={};
  if($('#beat-plan-lines')){patch.outline=$('#beat-plan-lines').value;patch.prompt=$('#beat-brief').value;}
  if($('#work-prompt'))patch.prompt=$('#work-prompt').value;
  if($('#work-result'))patch.html=textToHTML($('#work-result').value);
  if($('#codex-model'))patch.model=$('#codex-model').value;
  if(Object.entries(patch).every(([k,v])=>workshopEdit.body[k]===v))return;
  Object.assign(workshopEdit.body,patch);workshopEdit.edits++;workshopDirty=true;clearTimeout(workshopTimer);workshopTimer=setTimeout(()=>flushWorkshop().catch(fail),800);
}
function flushWorkshop(){
  clearTimeout(workshopTimer);workshopSave=workshopSave.catch(()=>{}).then(async()=>{
    const d=workshopEdit;if(!d||d.edits===d.saved)return;const edit=d.edits,r=revise(d.id,d.body,d.base?[d.base]:[]);
    try{await persist([r]);d.base=r.id;d.saved=edit;workshopDirty=d.edits!==edit;}
    catch(e){workStatus('Save failed. Keep this screen open; copy your plan or suggestion before leaving.');throw e;}
  });return workshopSave;
}
function taskBody(c,operation,patch={}){return {type:'card',category:'Generated draft',book:bookId,chapter:c.id,sourceRevision:c.revision.id,title:c.title,deleted:false,operation,model:preferredModel(),status:'Draft',html:'',prompt:'',...patch};}
async function showBeatPlanner(id){
  if(extraJob)return;await flush();const c=find(entryId),saved=id?find(id):generations().find(g=>g.operation==='plan'&&g.status!=='Used'&&canUseDraft(g,c));
  const body=saved?bodyOf(saved):taskBody(c,'plan',{prompt:c.synopsis||'',outline:''});workRecord(body,saved?.id,saved?.revision.id);characterEdit=null;aiEdit=null;
  showModal(`<div class="workshop"><div class="row spread">${btn('close','Manuscript','back','subtle','aria-label="Back to manuscript"')}<span class="badge">PLAN → WRITE → REFINE</span></div>${illustratedHead('quill','Map this chapter','ONE BEAT AT A TIME',esc(c.title))}<p>Map the beats first. Save the plan, then generate or write each beat on the manuscript page. Existing prose stays in place.</p>${modelSelect()}<label for="beat-brief">What should happen in this chapter?</label><textarea id="beat-brief" rows="3" maxlength="6000">${esc(body.prompt||'')}</textarea><label for="beat-plan-size">Approximate chapter length for planning</label><select id="beat-plan-size">${chapterLengths.map(n=>`<option ${n===1500?'selected':''} value="${n}">${format(n)} words</option>`).join('')}</select>${btn('suggest-plan','Suggest chapter beats','spark')}<label for="beat-plan-lines">Beat map · one beat per line</label><textarea id="beat-plan-lines" rows="10" maxlength="48000" placeholder="Mara discovers the map.\nThe coastline moves under her hand.\nSomeone knocks at the locked door.">${esc(body.outline||'')}</textarea><p class="small muted">Add, remove, or rewrite the proposed beats. Saving adds empty beats after your existing writing; it does not generate a whole chapter.</p><div class="row wrap">${btn('save-plan','Save plan & write beats','check','primary')}${btn('work-stop','Stop & keep plan','stop','subtle','id="work-stop" hidden')}</div><p id="work-status" role="status"></p></div>`);modal.classList.add('ai-modal');if($('#codex-model'))$('#codex-model').value=body.model;await codexModelStatus();
}
async function suggestBeatPlan(){
  if(extraJob)return;captureWorkshop();await flushWorkshop();if(!$('#beat-brief').value.trim())throw Error('Describe what happens in this chapter, or write your beat map by hand.');
  const input={...workshopContext(),prompt:$('#beat-brief').value,targetWords:Number($('#beat-plan-size').value)},model=$('#codex-model').value;
  await runWorkshopJob('plan',model,async options=>generateChapterOutline(input,options),'#beat-plan-lines');
}
async function saveBeatPlan(){
  captureWorkshop();await flush();const g=workshopEdit.body,c=find(g.chapter);if(!canUseDraft(g,c))throw Error('The manuscript changed since this plan began. Your plan is saved in Drafts. Reopen Generate from the current manuscript before applying it.');
  const beats=applyBeatPlan(c,planLines($('#beat-plan-lines').value));await changeFromBase(c.id,c.revision.id,{beats,html:joinBeats(beats)});await change(workshopEdit.id,{status:'Used'});workshopEdit=null;workshopDirty=false;beatHighlights=true;modal.close();render();toast('Beat map saved. Write or generate one beat at a time.');
}
async function showWritingTask(operation,beatId,selection){
  if(extraJob)return;await flush();const c=find(entryId),beats=manuscriptBeats(c),beat=beats.find(b=>b.id===beatId);
  if(operation==='selection'&&(!selection?.text||selection.chapter!==c.id))throw Error('Select a word, sentence, or paragraph in this manuscript first.');
  const body=taskBody(c,operation,{beatId:beatId||'',prompt:operation==='append'?$('#next-writing-prompt')?.value||'':operation==='beat'?beat?.prompt||'':'',selectedText:operation==='selection'?selection.text:operation==='edit-beat'?plain(beat?.html||''):'',...(selection?{selectionStart:selection.start,selectionEnd:selection.end}:{})});
  if(body.selectedText.length>4000)throw Error('This beat is large. Select a passage of up to 4,000 characters and use Edit selection with AI.');
  workshopInline=operation==='append';workRecord(body);await writingTaskDialog();if(workshopInline)await generateWritingTask();
}
async function openWritingProposal(id){
  workshopInline=false;const g=find(id);if(g.operation==='plan')return showBeatPlanner(id);workRecord(bodyOf(g),g.id,g.revision.id);await writingTaskDialog();
}
async function writingTaskDialog(){
  const d=workshopEdit.body,isEdit=['selection','edit-beat'].includes(d.operation);aiEdit=null;characterEdit=null;
  const html=`<div class="workshop">${modalHead(isEdit?'Refine this passage':'Write one beat',isEdit?'Review the replacement before applying it. Everything outside this selection stays in place.':'Generate only this beat, review it, then return to your manuscript.')}${modelSelect()}${isEdit?`<label>Selected writing</label><blockquote class="selection-excerpt">${esc(d.selectedText)}</blockquote>`:''}<label for="work-prompt">${isEdit?'What should the AI change or fix?':'What happens in this beat? · optional'}</label><textarea id="work-prompt" rows="4" maxlength="2000" placeholder="${isEdit?'Make the dialogue more hesitant without changing the facts…':'Leave blank to continue from your manuscript and Codex…'}">${esc(d.prompt)}</textarea>${!isEdit?`<label for="work-length">Approximate beat length</label><select id="work-length">${[100,200,300,500].map(n=>`<option value="${n}" ${n===300?'selected':''}>${n} words</option>`).join('')}</select>`:''}<div class="row wrap">${btn('work-generate',isEdit?'Suggest revision':'Generate this beat','spark','primary')}${btn('work-stop','Stop & keep suggestion','stop','subtle','id="work-stop" hidden')}</div><p id="work-status" role="status">${d.status==='Stopped'?'Stopped draft · review before using.':''}</p><label for="work-result">Suggestion · review and edit</label><textarea id="work-result" rows="10" placeholder="The suggestion will appear here…">${esc(plain(d.html||''))}</textarea><div class="row wrap">${btn('work-apply',isEdit?'Replace selected writing':d.operation==='append'?'Add this beat':'Use this beat','check','primary')}${btn(workshopInline?'work-inline-close':'close','Back to writing','back','subtle')}</div><p class="small muted">The earlier version stays in manuscript history. Suggestions are also saved in this book’s Drafts.</p></div>`;if(workshopInline){modal.replaceChildren();$('#inline-next-controls').hidden=true;$('#inline-generation').innerHTML=html;$('#inline-generation').scrollIntoView({block:'start'});}else{showModal(html);modal.classList.add('work-modal');}$('#codex-model').value=d.model;await codexModelStatus();
}
async function runWorkshopJob(kind,model,generate,field){
  if(extraJob)return;captureWorkshop();await flushWorkshop();
  // Every new attempt is a separate draft, so retrying never erases the last suggestion.
  const source=workshopEdit.body,body={...source,model,status:'Writing',issue:'',...(kind==='plan'?{outline:''}:{html:''})},id=await create(body),g=find(id),controller=new AbortController();
  const job={id,base:g.revision.id,body:bodyOf(g),kind:kind==='plan'?'outline':'prose',controller,text:'',saves:Promise.resolve(),lastSave:0};
  extraJob={controller,kind:workshopInline?'inline':kind,model};lockExtra(true);$('#work-stop').hidden=false;$('#work-stop').disabled=false;$(field).disabled=false;$(field).readOnly=true;$(field).value='';let writer;
  try{writer=await createWriter(model,{signal:controller.signal,onStatus:workStatus});job.text=await generate({request:writer.request,signal:controller.signal,onStatus:workStatus,onText:text=>{if(controller.signal.aborted)return;job.text=text;$(field).value=text;if(Date.now()-job.lastSave>5000){job.lastSave=Date.now();checkpointAI(job).catch(()=>{});}}});job.body.status='Ready';workStatus(kind==='plan'?'Beat map ready. Review it, then save the plan.':'Suggestion ready. Review and edit before applying.');}
  catch(e){job.body.status=controller.signal.aborted?'Stopped':'Failed';job.body.issue=controller.signal.aborted?'Stopped. The generated text so far is kept.':e.message;workStatus(job.body.issue);}
  finally{
    writer?.close();try{await checkpointAI(job);await job.saves;}catch(e){job.saveError=e;workStatus('Save failed. Copy this text, or close the dialog to retry saving.');}
    workRecord({...job.body,...(kind==='plan'?{outline:job.text}:{html:textToHTML(job.text)})},job.id,job.base);
    if(job.saveError){workshopEdit.edits=1;workshopDirty=true;}
    extraJob=null;lockExtra(false);$('#work-stop').hidden=true;$(field).readOnly=false;$(field).value=job.text;
  }
}
async function generateWritingTask(){
  captureWorkshop();await flushWorkshop();const d=workshopEdit.body,c=find(d.chapter);if(!c||c.deleted)throw Error('This manuscript section is no longer available.');
  const beats=manuscriptBeats(c),at=beats.findIndex(b=>b.id===d.beatId),input={...workshopContext(c),beatPrompt:d.prompt,beatWords:Number($('#work-length')?.value||300),currentProse:plain(joinBeats(d.operation==='append'?beats:beats.slice(0,Math.max(0,at)))),plan:beats.map((b,i)=>`${i+1}. ${b.prompt||b.title}`).join('\n'),selectedText:d.selectedText,editPrompt:d.prompt,surrounding:plain(beats[at]?.html||'')};
  if(['selection','edit-beat'].includes(d.operation)&&!d.prompt.trim())throw Error('Describe what the AI should change in this passage.');
  await runWorkshopJob('writing',$('#codex-model').value,options=>['selection','edit-beat'].includes(d.operation)?revisePassage(input,options):generateBeat(input,options),'#work-result');
}
async function applyWritingTask(){
  captureWorkshop();await flush();const d=workshopEdit.body,c=find(d.chapter),text=$('#work-result').value.trim();if(!text)throw Error('Generate or write a suggestion first.');
  if(!canUseDraft(d,c))throw Error('This manuscript changed while the suggestion was open. Your suggestion is kept in Drafts; reopen it from the current writing to make a fresh edit.');
  const beats=manuscriptBeats(c),i=beats.findIndex(b=>b.id===d.beatId);
  if(d.operation==='append')beats.push({id:uuid(),title:'Beat '+(beats.length+1),prompt:d.prompt,html:textToHTML(text)});
  else{if(i<0)throw Error('That beat no longer exists. Your suggestion is saved in Drafts.');beats[i].html=d.operation==='selection'?replacePassageHTML(beats[i].html,d.selectionStart,d.selectionEnd,d.selectedText,text):textToHTML(text);}
  await changeFromBase(c.id,c.revision.id,{beats,html:joinBeats(beats),status:'Drafting',manuscriptEditedAt:Date.now()});await change(workshopEdit.id,{status:'Used'});workshopEdit=null;workshopDirty=false;workshopInline=false;modal.close();render();toast('Writing updated. The previous version is in history.');
}
async function addBlankBeat(){await flush();const c=find(entryId),beats=manuscriptBeats(c);beats.push({id:uuid(),title:'Beat '+(beats.length+1),prompt:'',html:''});await change(c.id,{beats,html:joinBeats(beats)});beatHighlights=true;render();const fields=document.querySelectorAll('.beat-text');fields[fields.length-1]?.focus();}
async function editBeatDetails(id){await flush();const c=find(entryId),b=manuscriptBeats(c).find(b=>b.id===id);showModal(modalHead('Beat details','Give this beat a purpose, then write it yourself or generate it.')+`<form id="beat-details-form" data-id="${id}" data-base="${c.revision.id}"><label for="beat-title">Beat title</label><input id="beat-title" maxlength="1000" value="${esc(b.title)}"><label for="beat-direction">What happens here?</label><textarea id="beat-direction" rows="4" maxlength="6000">${esc(b.prompt)}</textarea><button class="btn primary" type="submit">${icon('save')}Save beat details</button></form>`);}
function plotHolesPanel(){const holes=all().filter(d=>d.book===bookId&&d.category==='Plot hole');return `<div class="row spread wrap"><div><h2>Plot holes & continuity</h2><p class="muted small">Possible issues to investigate, not established facts. A scan can miss things or misread an intentional mystery.</p></div>${btn('scan-holes','Check manuscript','search','primary')}</div><div class="plot-hole-list">${holes.map(h=>`<article class="plot-hole"><div class="row spread"><h3>${esc(h.title)}</h3><span class="badge">${esc(h.status||'Open')}</span></div><div>${sanitize(h.html)}</div>${h.evidence?`<blockquote>${esc(h.evidence)}</blockquote>`:''}<p><strong>Question:</strong> ${esc(h.question||'')}</p><p><strong>Possible fix:</strong> ${esc(h.suggestion||'')}</p><div class="row wrap">${btn('hole-status',h.status==='Resolved'?'Reopen':'Mark resolved','check','subtle',`data-id="${h.id}" data-status="${h.status==='Resolved'?'Open':'Resolved'}"`)}${btn('hole-status','Dismiss','close','subtle',`data-id="${h.id}" data-status="Dismissed"`)}</div></article>`).join('')||'<p class="empty">Run a manuscript check to look for contradictions, chronology problems, and missing causal links.</p>'}</div>`;}
let manuscriptReview=null;
function reviewSources(){return JSON.stringify([book(),...chapters(),...cards()].map(d=>[d.id,d.revision.id]).sort((a,b)=>a[0].localeCompare(b[0])));}
async function showManuscriptScan(kind){
  await flush();workshopEdit=null;workshopDirty=false;manuscriptReview=null;aiEdit=null;characterEdit=null;
  showModal(modalHead(kind==='holes'?'Look for plot holes':'Update the Codex from your writing','Reads every nonempty manuscript section in passages, then compares it with your existing Codex. Review all suggestions before saving.')+modelSelect()+`<p class="small muted">${format(total())} manuscript words · ${chapters().filter(c=>plain(c.html).trim()).length} nonempty sections. Long manuscripts take several requests. API connections send this story text to your chosen provider.</p><div class="row wrap">${btn('scan-run',kind==='holes'?'Scan for plot holes':'Read manuscript','scan','primary',`data-kind="${kind}"`)}${btn('extra-stop','Stop','stop','subtle','id="extra-stop" hidden')}</div><p id="extra-status" role="status"></p><div id="scan-review"></div>`);modal.classList.add('manager-modal');await codexModelStatus();
}
function renderManuscriptReview(){
  const r=manuscriptReview,data=r.data;
  $('#scan-review').innerHTML=r.kind==='holes'?`<h3>Possible issues · choose what to keep</h3>${data.issues.map((x,i)=>`<article class="scan-finding"><label class="check-label"><input type="checkbox" data-keep-issue="${i}" checked> ${esc(x.title)}</label><p>${esc(x.detail)}</p><blockquote>${esc(x.evidence)}</blockquote><p>${esc(x.question)}</p><p><strong>Possible fix:</strong> ${esc(x.suggestion)}</p></article>`).join('')||'<p>No supported issues were returned. This does not guarantee the story has no plot holes.</p>'}${data.issues.length?btn('scan-apply','Save selected findings','check','primary'):''}`:`<h3>Missing context · review and edit</h3><label for="scan-summary">Add to story summary</label><textarea id="scan-summary" rows="4" maxlength="12000">${esc(data.summaryAdditions)}</textarea><label for="scan-developments">Add written developments to plot beats</label><textarea id="scan-developments" rows="4" maxlength="12000">${esc(data.developments)}</textarea><label for="scan-notes">Other established context</label><textarea id="scan-notes" rows="3" maxlength="12000">${esc(data.notes)}</textarea><h3>Characters</h3><p class="small muted">Existing fields stay intact. New details are added to character notes; blank fields can be filled.</p>${data.characters.map((c,i)=>{const existing=cards().find(x=>x.category==='Character'&&normalizedName(x.title)===normalizedName(c.name));return `<article class="scan-finding"><label class="check-label"><input type="checkbox" data-keep-character="${i}" checked> ${esc(c.name)} · ${existing?'update existing':'new character'}</label><p>${esc(c.evidence)}</p><details><summary>Review character details</summary>${characterFields.map(([key,label])=>`<label for="scan-character-${i}-${key}">${label}</label><textarea id="scan-character-${i}-${key}" rows="2" maxlength="6000">${esc(c[key])}</textarea>`).join('')}</details></article>`;}).join('')}${btn('scan-apply','Apply reviewed additions','check','primary')}`;
}
async function runManuscriptScan(kind){
  if(extraJob)return;await flush();const b=book(),cs=chapters(),c=cs[0];if(!c)throw Error('Add manuscript text before scanning.');
  const sources=reviewSources(),model=$('#codex-model').value,controller=new AbortController(),id=await create({type:'card',category:'Codex suggestion',book:bookId,title:kind==='holes'?'Plot-hole review':'Codex manuscript update',status:kind==='holes'?'Plot-hole review':'Codex update',analysisKind:kind,html:'',model,reviewSources:sources});
  const g=find(id),job={id,base:g.revision.id,body:bodyOf(g),kind:'review',controller,text:'',saves:Promise.resolve(),lastSave:0};extraJob={controller,kind:'scan',model};lockExtra(true);$('#scan-review').innerHTML='';manuscriptReview=null;let writer;
  try{writer=await createWriter(model,{signal:controller.signal,onStatus:extraStatus});const input={...workshopContext(c),sections:cs.map(c=>({title:c.title,text:plain(c.html)}))};job.text=await analyzeManuscript(kind,input,{request:writer.request,signal:controller.signal,onStatus:extraStatus,onText:text=>{if(controller.signal.aborted)return;job.text=text;}});const data=parseAnalysis(kind,job.text);manuscriptReview={kind,data,id,sources};renderManuscriptReview();extraStatus('Review ready. Nothing has been added to your Codex yet.');}
  catch(e){extraStatus(controller.signal.aborted?'Scan stopped. The manuscript and Codex are unchanged.':e.message);job.body.issue=e.message;}
  finally{writer?.close();try{await checkpointAI(job);}catch(e){extraStatus('Review could not be saved. Keep this screen open and retry the scan.');manuscriptReview=null;}extraJob=null;lockExtra(false);}
}
async function applyManuscriptReview(){
  if(!manuscriptReview||extraJob)return;await flush();const r=manuscriptReview;
  if(reviewSources()!==r.sources)throw Error('The manuscript or Codex changed during this review. Run the scan again so newer writing is not overwritten. The old suggestion is kept in Drafts.');
  const records=[],make=body=>records.push(revise(uuid(),{deleted:false,...body})),b=book();
  if(r.kind==='holes'){
    for(const box of modal.querySelectorAll('[data-keep-issue]:checked')){const h=r.data.issues[Number(box.dataset.keepIssue)];make({type:'card',book:bookId,category:'Plot hole',title:h.title,html:textToHTML(h.detail),evidence:h.evidence,question:h.question,suggestion:h.suggestion,status:'Open'});}
  }else{
    const summary=$('#scan-summary').value.trim(),developments=$('#scan-developments').value.trim(),notes=$('#scan-notes').value.trim();
    if(summary||developments)records.push(revise(b.id,{...bodyOf(b),synopsis:[b.synopsis,summary].filter(Boolean).join('\n\n'),plotBeats:[b.plotBeats,developments].filter(Boolean).join('\n\n')},[b.revision.id]));
    if(notes)make({type:'card',book:bookId,category:'Research',title:'Context from manuscript',html:textToHTML(notes)});
    const seen=new Set();for(const box of modal.querySelectorAll('[data-keep-character]:checked')){
      const i=Number(box.dataset.keepCharacter),c=r.data.characters[i],name=normalizedName(c.name);if(seen.has(name))throw Error('The review contains duplicate character names. Uncheck a duplicate before applying.');seen.add(name);
      const matches=cards().filter(x=>x.category==='Character'&&normalizedName(x.title)===name);if(matches.length>1)throw Error('More than one character has the name '+c.name+'. Uncheck this update and resolve the duplicate names first.');
      const existing=matches[0],fields=Object.fromEntries(characterFields.map(([key])=>[key,$('#scan-character-'+i+'-'+key).value.trim()]));
      if(existing){const patch={...bodyOf(existing)},additions=[];for(const [key,label] of characterFields)if(fields[key]){if(!patch[key])patch[key]=fields[key];else if(patch[key]!==fields[key])additions.push(label+': '+fields[key]);}if(additions.length)patch.html=(patch.html||'')+textToHTML('Manuscript update:\n'+additions.join('\n')+(c.evidence?'\nSource: '+c.evidence:''));records.push(revise(existing.id,patch,[existing.revision.id]));}
      else make({type:'card',book:bookId,category:'Character',title:c.name,...fields,html:textToHTML(c.evidence?'Source: '+c.evidence:'')});
    }
  }
  const suggestion=find(r.id);if(suggestion)records.push(revise(suggestion.id,{...bodyOf(suggestion),status:'Used '+(r.kind==='holes'?'plot-hole review':'Codex update')},[suggestion.revision.id]));
  await persist(records);manuscriptReview=null;modal.close();view='plot';codexTab=r.kind==='holes'?'holes':'summary';render();toast('Reviewed additions saved to this book’s Codex.');
}
async function dismissInlineWriting(){await flushWorkshop();workshopEdit=null;workshopDirty=false;workshopInline=false;$('#inline-generation')?.replaceChildren();if($('#inline-next-controls'))$('#inline-next-controls').hidden=false;}
const workshopActions={
  'work-inline-close':dismissInlineWriting,
  'add-section':sectionPicker,'toggle-beats':async()=>{await flush();beatHighlights=!beatHighlights;render();},
  'split-beat':addBlankBeat,'beat-plan':showBeatPlanner,'save-plan':saveBeatPlan,'suggest-plan':suggestBeatPlan,
  'generate-inline':()=>showWritingTask('append'),'generate-beat':el=>showWritingTask('beat',el.dataset.id),'edit-beat-ai':el=>showWritingTask('edit-beat',el.dataset.id),
  'edit-beat-plan':el=>editBeatDetails(el.dataset.id),'edit-selection':()=>showWritingTask('selection',selectedPassage?.beatId,selectedPassage),
  'work-generate':generateWritingTask,'work-apply':applyWritingTask,'work-stop':()=>{extraJob?.controller?.abort();workStatus('Stopping…');},
  'scan-codex':()=>showManuscriptScan('codex'),'scan-holes':()=>showManuscriptScan('holes'),'scan-run':el=>runManuscriptScan(el.dataset.kind),'scan-apply':applyManuscriptReview,
  'hole-status':async el=>{await change(el.dataset.id,{status:el.dataset.status});render();}
};
function decorateButtons(){
  for(const b of document.querySelectorAll('button,label.btn')){
    const name=(b.tagName==='LABEL'?'upload':buttonIconName(b))||'info';
    if(b.querySelector('.brand-art'))b.querySelector('.brand-art').outerHTML=icon(name);
    if(b.classList.contains('close-dialog')||b.dataset.action==='move')for(const n of [...b.childNodes])if(n.nodeType===3)n.remove();
    const svg=b.querySelector('svg.icon');if(svg){if(name!=='info'&&svg.querySelector('path')?.getAttribute('d')!==(controlIcons[name]||icons[name]))svg.outerHTML=icon(name);}else b.insertAdjacentHTML('afterbegin',icon(name));
  }
}
new MutationObserver(decorateButtons).observe(document.body,{childList:true,subtree:true});
document.addEventListener('selectionchange',captureSelection);
document.addEventListener('scroll',captureSelection,true);
window.addEventListener('resize',captureSelection);
window.visualViewport?.addEventListener('resize',captureSelection);
window.visualViewport?.addEventListener('scroll',captureSelection);
document.addEventListener('pointerdown',e=>{if(e.target.closest('[data-action="edit-selection"]'))e.preventDefault();});
document.addEventListener('input',e=>{if(['beat-plan-lines','beat-brief','work-prompt','work-result'].includes(e.target.id))captureWorkshop();});
document.addEventListener('change',e=>{if(e.target.id==='codex-model')captureWorkshop();});
document.addEventListener('submit',async e=>{try{if(e.target.id==='section-form'){e.preventDefault();await createSection();}if(e.target.id==='beat-details-form'){e.preventDefault();await flush();const c=find(entryId);if(c.revision.id!==e.target.dataset.base)throw Error('This chapter changed. Reopen the beat details.');const beats=manuscriptBeats(c),b=beats.find(b=>b.id===e.target.dataset.id);b.title=$('#beat-title').value||'Beat';b.prompt=$('#beat-direction').value;await change(c.id,{beats,html:joinBeats(beats)});modal.close();render();}}catch(err){fail(err);}});

const actions={
  ...editingActions,
  'open-codex':async()=>{await flush();view='plot';codexTab='summary';closePanels();render();},
  'back-writing':async()=>{await flush();view='write';render();restoreWritingPosition();},
  ...codexActions,...draftActions,...workshopActions,
  'qwen-check-update':checkAIUpdate,'qwen-update':downloadAIUpdate,
  'write-ai':async()=>{await flush();await showBeatPlanner();},'ai-check':checkAIModel,'ai-stop':stopAI,'ai-use':useGeneratedDraft,'ai-write':()=>startAI('chapter'),
  'ai-plot':async()=>{await flush();modal.close();view='plot';closePanels();render();},
  'ai-draft':el=>showAI(el.dataset.id),
  close:dismissModal,home:async()=>{await flush();await transitionScene('to-shelf',()=>{bookId=null;bookLanding=false;libraryScreen='shelf';document.body.classList.remove('focus');render();});},
  'open-book':async el=>{await flush();await transitionScene('opening-book',()=>{bookId=el.dataset.id;bookLanding=true;entryId=null;view='write';sessionStart=total();render();},el);},
  'book-door':async()=>{await flush();await transitionScene('to-section',()=>{bookLanding=true;document.body.classList.remove('focus');render();});},
  'bookshelf':()=>transitionScene('to-shelf',()=>{libraryScreen='shelf';bookId=null;render();}),
  'start-screen':()=>transitionScene('to-desk',()=>{libraryScreen='start';bookId=null;render();}),
  'enter-codex':()=>transitionScene('to-codex',()=>{bookLanding=false;view='plot';codexTab='summary';render();}),
  'enter-write':()=>transitionScene('to-writing',()=>{entryId=lastEditedSection()?.id||null;bookLanding=false;view='write';render();restoreWritingPosition();}),
  'new-book':()=>bookForm(true),'book-settings':()=>bookForm(false),
  'open-chapter':async el=>{await flush();entryId=el.dataset.id;view='write';modal.close();closePanels();render();},
  'new-chapter':async()=>{await flush();entryId=await create({type:'chapter',book:bookId,title:'Untitled chapter',html:'',synopsis:'',status:'To write',order:Math.max(0,...chapters().map(c=>c.order||0))+1000});view='write';closePanels();render();$('#chapter-title')?.focus();$('#chapter-title')?.select();},
  view:async el=>{await flush();view=el.dataset.view;closePanels();render();},
  sidebar:()=>document.body.classList.toggle('sidebar-open'),inspector:async()=>{await flush();chapterDetails();},focus:()=>{document.body.classList.toggle('focus');closePanels();},
  'new-card':async()=>{await flush();cardForm();},'edit-card':el=>cardForm(el.dataset.id),
  settings:async()=>{try{await flush();}catch{}settings();},connect:async()=>{const name=await storage.connectFolder();connected=true;toast('Connected to '+name);await doSync();},sync:doSync,disconnect:async()=>{await storage.disconnectFolder();connected=false;settings();toast('Sync folder disconnected. Local drafts are kept.');},
  backup:async()=>{try{await flush();}catch{}const emergency=draft&&draft.edits!==draft.saved?[revise(draft.id,{...draft.body,html:sanitize(draft.body.html)},[draft.base])]:[];await storage.download('Quill-backup-'+new Date().toISOString().slice(0,10)+'.json','application/json',backup(union(revisions,emergency)));toast('Complete backup is ready.');},
  import:async()=>{await flush();if(storage.native){const text=await storage.bridge('import');await importBackup(text);}else $('#import-file').click();},
  motion:()=>{document.body.classList.toggle('reduce-motion');localStorage.setItem('quill-motion',document.body.classList.contains('reduce-motion')?'reduced':'full');const el=$('[data-action="motion"]');if(el)el.textContent=document.body.classList.contains('reduce-motion')?'Turn animations on':'Reduce animations';},
  theme:()=>{document.body.classList.toggle('dark');syncAppearance();try{localStorage.setItem('quill-theme',document.body.classList.contains('dark')?'dark':'light');}catch{}},
  history:async el=>{await flush();history(el.dataset.id);},trash:async()=>{await flush();trash();},
  delete:async el=>{await flush();const d=find(el.dataset.id);showModal(modalHead('Move to recently deleted?',esc(d.title)+' will remain recoverable, with all saved versions.')+`<div class="modal-actions">${btn('close','Keep writing','','subtle')}${btn('confirm-delete','Move to trash','trash','primary',`data-id="${d.id}"`)}</div>`);},
  'confirm-delete':async el=>{const id=el.dataset.id;await change(id,{deleted:true});if(id===bookId)bookId=null;modal.close();closePanels();render();toast('Moved to recently deleted.');},
  'restore-item':async el=>{await change(el.dataset.id,{deleted:false});render();trash();toast('Restored.');},
  'restore-revision':async el=>{const r=revisions.find(r=>r.id===el.dataset.id);await change(r.entity,{...r.body,deleted:false},true);modal.close();render();toast('Restored as the current version. Other versions remain in history.');},
  move:async el=>{await flush();const cs=chapters(),i=cs.findIndex(c=>c.id===el.dataset.id),j=i+Number(el.dataset.direction);if(!cs[j])return;[cs[i],cs[j]]=[cs[j],cs[i]];const rs=cs.map((c,n)=>revise(c.id,{...bodyOf(c),order:(n+1)*1000},[c.revision.id]));await persist(rs);render();},
  export:async()=>{await flush();exportMenu();},'export-file':el=>exportFile(el.dataset.type),search:async()=>{await flush();search();$('#search-input').focus();}
};
async function importBackup(text){const incoming=fromBackup(text),merged=union(revisions,incoming),known=new Set(revisions.map(r=>r.id)),added=merged.filter(r=>!known.has(r.id));await persist(added);modal.close();render();toast(`Imported ${added.length} saved revisions. Existing writing is preserved.`);}
document.addEventListener('click',async e=>{if(sceneBusy)return;const el=e.target.closest('[data-action]');if(el){try{if(extraJob?.kind==='inline'&&el.dataset.action!=='work-stop'){toast('Finish or stop this beat before opening another tool.');return;}if(workshopInline&&!['work-generate','work-apply','work-stop','work-inline-close'].includes(el.dataset.action))await dismissInlineWriting();await actions[el.dataset.action]?.(el);}catch(err){fail(err);}}});
document.addEventListener('mousedown',e=>{if(e.target.closest('[data-format]'))e.preventDefault();});
document.addEventListener('click',e=>{const b=e.target.closest('[data-format]');if(!b||!$('#editor'))return;if(!beatHighlights)$('#editor').focus();document.execCommand(b.dataset.format,false);capture();});
document.addEventListener('change',async e=>{try{if(['ai-model','ai-length'].includes(e.target.id))captureAI();if(e.target.id==='ai-model'){try{localStorage.setItem('quill-ai-model',e.target.value);}catch{}await checkAIModel();}if(e.target.id==='ai-saved-drafts')await showAI(e.target.value);if(e.target.id==='paragraph-style'){ $('#editor').focus();document.execCommand('formatBlock',false,e.target.value);capture();}if(e.target.id==='chapter-status'){if(draft?.body.type==='chapter'){draft.body.status=e.target.value;draft.edits++;await flush();}else if(entryId){await change(entryId,{status:e.target.value});render();}}if(e.target.id==='synopsis'){if(draft?.body.type==='chapter'){draft.body.synopsis=e.target.value;draft.edits++;await flush();}else if(entryId){await change(entryId,{synopsis:e.target.value});render();}}if(e.target.id==='import-file'&&e.target.files[0]){const f=e.target.files[0];if(f.size>100000000)throw Error('This backup exceeds 100 MB.');await flush();await importBackup(await f.text());e.target.value='';}}catch(err){fail(err);}});
document.addEventListener('input',e=>{if(['ai-prompt','ai-outline'].includes(e.target.id))captureAI();if(['story-summary','plot-beats','writing-style'].includes(e.target.id)&&draft?.body.type==='book'){draft.body[e.target.id==='plot-beats'?'plotBeats':e.target.id==='story-summary'?'synopsis':'writingStyle']=e.target.value;draft.edits++;queueSave();}if(e.target.id==='search-input')search(e.target.value);if(e.target.id==='synopsis'&&draft?.body.type==='chapter'){draft.body.synopsis=e.target.value;draft.edits++;queueSave();}});
document.addEventListener('submit',async e=>{e.preventDefault();try{if(e.target.id==='ai-form'){await startAI();return;}if(e.target.id==='chapter-form'){await changeFromBase(e.target.dataset.id,e.target.dataset.base,{status:$('#details-status').value,synopsis:$('#details-synopsis').value});modal.close();render();}if(e.target.id==='book-form'){await flush();const isNew=e.target.dataset.new==='true',b={title:$('#book-title').value.trim()||'Untitled novel',author:$('#book-author').value.trim(),goal:Number($('#book-goal').value)||80000,dailyGoal:Number($('#daily-goal').value)||500,color:$('#book-color').value};if(isNew){bookId=await create({type:'book',...b});e.target.dataset.new='false';e.target.dataset.base=book().revision.id;entryId=await create({type:'chapter',book:bookId,title:'Chapter One',html:'',synopsis:'',status:'To write',order:1000});sessionStart=0;view='write';bookLanding=true;}else await changeFromBase(bookId,e.target.dataset.base,b);await saveCover();modal.close();render();}if(e.target.id==='card-form'){const id=e.target.dataset.id,b={title:$('#card-title').value.trim(),category:$('#card-category').value,html:$('#card-text').value.split('\n').map(p=>'<p>'+esc(p)+'</p>').join('')};if(id)await changeFromBase(id,e.target.dataset.base,b);else await create({type:'card',book:bookId,...b});modal.close();render();}}catch(err){fail(err);}});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();flush().then(()=>toast('Saved on this device.')).catch(fail);}if(e.key==='Escape'){document.body.classList.remove('focus');closePanels();}});
window.quillFlush=flush;
window.addEventListener('pagehide',()=>flush().catch(()=>{}));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){flush().catch(()=>{});if(aiJob)stopAI();if(extraJob?.controller)extraJob.controller.abort();}});
window.addEventListener('beforeunload',e=>{if(aiJob||extraJob||workshopDirty||(characterEdit&&characterEdit.edits!==characterEdit.saved)||(draft&&draft.edits!==draft.saved)||(aiEdit&&aiEdit.edits!==aiEdit.saved)){e.preventDefault();e.returnValue='';}});
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('quill-library'):null;
channel?.addEventListener('message',async()=>{try{await flush();revisions=union(revisions,await storage.load());if(!modal.open&&!draft)render();}catch(e){fail(e);}});
window.addEventListener('error',e=>{if(e.message)toast('Something interrupted the editor. Export a backup before reloading.');});
async function start(){try{await loadConnections();}catch(e){console.warn('API connections unavailable:',e.message);}try{if(localStorage.getItem('quill-motion')==='reduced')document.body.classList.add('reduce-motion');if(localStorage.getItem('quill-theme')==='dark')document.body.classList.add('dark');}catch{}try{await storage.openStorage();revisions=await storage.load();if(!revisions.length)await persist(sample());render();if(!storage.native&&'serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});if(storage.native)storage.bridge('ready').then(r=>{connected=!!r.connected;if(connected)doSync().catch(()=>setSaved('Sync paused · drafts saved locally'));}).catch(()=>{});}catch(e){app.innerHTML=`<div class="loading"><h1>Your drafts need attention.</h1><p>${esc(e.message)}</p><p>Please keep this app’s data. Opening failed; nothing has been replaced.</p></div>`;}}
setInterval(()=>{if(connected&&!modal.open)doSync().catch(e=>{setSaved('Sync paused · drafts saved locally');console.warn(e);});},60000);
start();
