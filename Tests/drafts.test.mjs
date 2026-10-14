import test from 'node:test';
import assert from 'node:assert/strict';
import {revise,union,documents,purgeDraft,draftStorage,validate,backup,fromBackup} from '../docs/core.js';
import {draftMatches,downloadProgress} from '../docs/drafts.js';
const body={type:'card',book:'book-a',category:'Generated draft',chapter:'chapter-a',sourceRevision:'chapter-original',title:'Chapter attempt',deleted:false,html:'<p>Discarded prose</p>',outline:'A secret outline',prompt:'A secret brief',status:'Used'};
test('Permanent cleanup removes all draft checkpoints and survives old backup and late sync in either order',()=>{
  const a=revise('draft-a',body),b=revise('draft-a',{...body,html:'<p>Longer prose</p>'},[a.id]),late=revise('draft-a',{...body,html:'Late offline prose'},[a.id]);
  const chapter=revise('chapter-a',{type:'chapter',book:'book-a',title:'Manuscript',deleted:false,html:b.body.html}),character=revise('character-a',{type:'card',book:'book-a',category:'Character',title:'Hero',deleted:false,portrait:'data:image/jpeg;base64,YQ=='});
  const before=[a,b,chapter,character],marker=purgeDraft(before,'draft-a'),cleaned=union(before,[marker]);
  assert.deepEqual(cleaned,[chapter,character,marker]);assert.equal(draftStorage(cleaned).length,0);assert.equal(documents(cleaned,true).length,0);
  assert(!JSON.stringify(marker).includes('secret'));assert(!JSON.stringify(marker).includes('Discarded'));
  for(const merged of [union(cleaned,[late,a,b]),union([late,a,b],cleaned),union(cleaned,fromBackup(backup(before)))]){assert.deepEqual(merged.filter(r=>r.entity==='draft-a'),[marker]);assert(merged.some(r=>r.id===chapter.id));}
});
test('Draft storage counts history, includes trashed drafts and keeps book boundaries',()=>{
  const a=revise('a',body),b=revise('a',{...body,deleted:true},[a.id]),other=revise('b',{...body,book:'book-b'}),cover=revise('cover-a',{type:'card',book:'book-a',title:'Book cover',category:'Book cover',deleted:false,portrait:'data:image/jpeg;base64,YQ=='});
  const rows=draftStorage([a,b,other,cover],'book-a');assert.equal(rows.length,1);assert(rows[0].deleted);assert.equal(rows[0].bytes,new TextEncoder().encode(JSON.stringify(a)+JSON.stringify(b)).length);
  assert.throws(()=>purgeDraft([cover],'cover-a'));assert.throws(()=>purgeDraft([a],'missing'));
});
test('Deletion markers cannot erase manuscripts or contain discarded payloads',()=>{
  const a=revise('a',body),marker=purgeDraft([a],'a');
  assert.throws(()=>validate({...marker,body:{...marker.body,html:'Should never survive'}}));
  assert.throws(()=>validate({...marker,body:{...marker.body,purged:false}}));
  assert.throws(()=>union([revise('a',{type:'chapter',book:'book-a',title:'Manuscript',deleted:false})],[marker]));
  assert.throws(()=>union([a],[{...marker,body:{...marker.body,book:'wrong-book'}}]));
});
test('Concurrent cleanup markers converge and do not grow draft storage',()=>{
  const a=revise('a',body),m1=purgeDraft([a],'a'),m2=purgeDraft([a],'a');
  assert.deepEqual(union([a,m1],[m2]),union([m2],[a,m1]));assert.equal(union([a,m1],[m2]).length,1);
});
test('Draft filters distinguish outlines, prose, suggestions and used attempts',()=>{
  assert(draftMatches(body,'chapters','discarded'));assert(!draftMatches(body,'outlines'));assert(draftMatches(body,'used'));
  assert(draftMatches({...body,html:'',status:'Stopped'},'unfinished'));assert(draftMatches({...body,html:''},'outlines'));
  assert(draftMatches({...body,category:'Codex suggestion'},'suggestions'));
});
test('Model progress reports determinate percentages and honest loading states',()=>{
  assert.deepEqual(downloadProgress('Downloading model · 37%'),{value:37,label:'37%'});
  assert.deepEqual(downloadProgress('Loading model · 62% — fetching weights'),{value:62,label:'62%'});
  assert.equal(downloadProgress('Loading installed local model…').value,null);
  assert.equal(downloadProgress('Model ready · version abcd').value,100);
  assert.equal(downloadProgress('Writing scene 2 of 3'),null);
});
