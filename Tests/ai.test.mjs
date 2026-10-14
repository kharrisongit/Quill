import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateChapter,generateChapterOutline,outlineLimit,buildChapterContext,canUseDraft,textToHTML,chunkText} from '../docs/ai.js';
import {revise,validate,backup,fromBackup,union,documents} from '../docs/core.js';
const input={number:2,title:'A discovery',plot:'Opening: a map. Ending: a secret revealed.',notes:'Mara is a restorer.',earlier:'Mara found the house.',previousEnding:'She opened the door.',style:'Third person, past tense.',prompt:'Mara discovers a second map. End before she leaves the house.',targetWords:500,outline:'1. Discover a map.\n2. Read it.'};
test('Each chapter generation uses full plot context and only earlier chapters',()=>{const cs=[{id:'one',title:'One',synopsis:'Earlier',html:'Old ending'},{id:'two',title:'Two'},{id:'three',title:'Three',synopsis:'Future secret'}];const c=buildChapterContext({plotBeats:'The whole plot, including its ending'},cs[1],cs,[{title:'Mara',category:'Character',html:'Restorer'}],x=>x||'');assert.equal(c.plot,'The whole plot, including its ending');assert.match(c.earlier,/Earlier/);assert.doesNotMatch(c.earlier,/Future secret/);assert.equal(c.previousEnding,'Old ending');assert.match(c.notes,/Restorer/);});
test('Scenes form one chapter and later scenes get prior generated prose',async()=>{const calls=[],updates=[];const text=await generateChapter(input,{request:async(p,progress)=>{calls.push(p);const text=calls.length===1?'Mara found the map.':'The lines began to move.';progress?.(text);return text;},onText:t=>updates.push(t)});assert.equal(text,'Mara found the map.\n\nThe lines began to move.');assert.equal(calls.length,2);assert.match(calls[0].prompt,/Ending: a secret revealed/);assert.match(calls[1].prompt,/Mara found the map/);assert.match(calls[1].prompt,/part 2 of 2/);assert.equal(updates.at(-1),text);});
test('Long plot notes are all read, including final beats, before generation',async()=>{const plot=Array.from({length:40},(_,i)=>`Beat ${i}: `+'long story details '.repeat(12)).join('\n')+'\nFINAL SECRET';const chunks=[];await generateChapter({...input,plot},{request:async p=>{if(p.instructions.startsWith('You condense')){chunks.push(p.prompt);return 'Condensed plot.';}return 'A short scene.';}});assert(chunks.some(x=>x.includes('FINAL SECRET')));for(let i=0;i<40;i++)assert(chunks.some(x=>x.includes(`Beat ${i}:`)));});
test('Cancellation prevents subsequent scenes and preserves streamed text',async()=>{const c=new AbortController(),updates=[];let calls=0;await assert.rejects(generateChapter(input,{signal:c.signal,request:async(p,progress)=>{calls++;progress('An unfinished scene.');c.abort();return 'ignored';},onText:t=>updates.push(t)}),{name:'AbortError'});assert.equal(calls,1);assert.equal(updates.at(-1),'An unfinished scene.');});
test('Empty output is an error rather than a successful empty chapter',async()=>{await assert.rejects(generateChapter(input,{request:async()=>''}),/empty response/);});
test('A failed later scene retains the completed first scene',async()=>{let calls=0,saved='';await assert.rejects(generateChapter(input,{request:async(p,progress)=>{calls++;if(calls===1){progress('First scene.');return 'First scene.';}throw Error('GPU stopped');},onText:t=>saved=t}),/GPU stopped/);assert.equal(saved,'First scene.');});
test('Draft acceptance refuses changed, deleted or parallel manuscript versions',()=>{const generation={chapter:'c',sourceRevision:'r'};assert(canUseDraft(generation,{id:'c',revision:{id:'r'}}));assert(!canUseDraft(generation,{id:'c',revision:{id:'new'}}));assert(!canUseDraft(generation,{id:'c',revision:{id:'r'},deleted:true}));assert(!canUseDraft(generation,{id:'c',revision:{id:'r'},conflicts:1}));});
test('Plot beats and separate generation drafts survive backup and sync without replacing prose',()=>{const book=revise('b',{type:'book',title:'Book',plotBeats:'Full ending',deleted:false}),chapter=revise('c',{type:'chapter',book:'b',title:'Chapter',html:'Original',deleted:false}),gen=revise('g',{type:'card',category:'Generated draft',book:'b',chapter:'c',sourceRevision:chapter.id,title:'Chapter',html:'New draft',outline:'Author-approved events',prompt:'Write it',targetWords:500,deleted:false});const merged=union([],fromBackup(backup([book,chapter,gen])));assert.equal(documents(merged).find(d=>d.id==='c').html,'Original');assert.equal(documents(merged).find(d=>d.id==='b').plotBeats,'Full ending');assert.equal(documents(merged).find(d=>d.id==='g').html,'New draft');assert.equal(documents(merged).find(d=>d.id==='g').outline,'Author-approved events');assert.throws(()=>validate({...gen,body:{...gen.body,outline:123}}));assert.throws(()=>validate({...gen,body:{...gen.body,chapter:'../invalid'}}));});
test('Generated text is escaped before being used in the editor',()=>{assert.equal(textToHTML('<script>alert(1)</script>\n\nSecond line'),'\x3cp>&lt;script&gt;alert(1)&lt;/script&gt;</p><p>Second line</p>');});
test('Chunking preserves all long-outline content',()=>{const text='One '.repeat(1500)+'THE END';assert.equal(chunkText(text).join(' ').replace(/\s+/g,' ').trim(),text.replace(/\s+/g,' ').trim());});

const evanInput={number:1,title:'Chapter One',plot:'',notes:'',earlier:'',previousEnding:'',style:'',prompt:'Write a chapter from the POV of a teenage boy named Evan who discovers a dragon egg in an alley on his way home from school',targetWords:2000};
test('A short prompt with empty notes returns its outline for review without condensation or prose calls',async()=>{
  const verbose=Array.from({length:5},(_,i)=>`${i+1}. Evan follows the events. ${'Add some detail in his viewpoint. '.repeat(18)}`).join('\n');
  const calls=[];
  const outline=await generateChapterOutline(evanInput,{request:async p=>{calls.push(p);return verbose;}});
  assert.equal(calls.length,1);assert.match(calls[0].instructions,/^Plan a single/);
  assert.equal(outline,verbose.trim());assert(outline.length>outlineLimit); // Review it, never silently truncate or summarize it.
});
test('Chapter generation follows the edited outline exactly and never generates a replacement plan',async()=>{
  const outline='1. Evan finds a BLUE egg.\n2. He leaves it with his aunt. Do not bring it home.';
  const calls=[];
  const text=await generateChapter({...evanInput,outline},{request:async p=>{calls.push(p);return `Scene ${calls.length}.`;}});
  assert.equal(calls.length,5);assert.match(text,/Scene 5/);
  for(const call of calls){assert.match(call.instructions,/^Write polished/);assert(call.prompt.includes(outline));assert(call.prompt.includes(evanInput.prompt));assert.match(call.instructions,/outline takes priority/);}
});
test('Missing and oversized outlines require review before any model call',async()=>{
  let calls=0;const request=async()=>{calls++;return 'Should not run';};
  await assert.rejects(generateChapter(evanInput,{request}),/chapter outline/);
  await assert.rejects(generateChapter({...evanInput,outline:'x'.repeat(outlineLimit+1)},{request}),/outline is over/);
  assert.equal(calls,0);
});
test('Stopping outline creation retains streamed outline and never starts chapter writing',async()=>{
  const controller=new AbortController();let calls=0,saved='';
  await assert.rejects(generateChapterOutline(evanInput,{signal:controller.signal,onText:t=>saved=t,request:async(p,progress)=>{calls++;progress('1. Evan finds the egg.');controller.abort();return 'ignored';}}),{name:'AbortError'});
  assert.equal(calls,1);assert.equal(saved,'1. Evan finds the egg.');
});
test('A context condensation failure identifies the actual field, not empty plot beats',async()=>{
  await assert.rejects(generateChapterOutline({...evanInput,style:'Long writing preference. '.repeat(50)},{request:async()=>'Still a very long writing preference. '.repeat(50)}),e=>/writing preferences/.test(e.message)&&!/plot notes/.test(e.message));
});
