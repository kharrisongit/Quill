import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestAlternatives,parseAlternatives} from '../docs/ai.js';
import {isSingleWord} from '../docs/editing.js';
test('Single-word actions handle Unicode and contractions without classifying a sentence as a word',()=>{for(const s of ['  café ','isn’t','blue-green'])assert(isSingleWord(s));for(const s of ['Hello world','One.','', '123'])assert(!isSingleWord(s));});
test('Suggestion parsing accepts short phrases and ignores duplicates and malformed entries',()=>{assert.deepEqual(parseAlternatives('```json\n["found","discovered","DISCOVERED",3,"came across","located"]\n```','found','synonyms'),['discovered','came across','located']);assert.deepEqual(parseAlternatives('{"suggestions":["She paused.","She waited."]}','She stopped.','rephrase'),['She paused.','She waited.']);assert.throws(()=>parseAlternatives('An explanation','found','synonyms'));assert.throws(()=>parseAlternatives('["found"]','found','synonyms'));});
test('Suggestions use exact selected text and local context in one bounded request, with no manuscript write',async()=>{const calls=[];const result=await suggestAlternatives('rephrase',{selectedText:'She ran.',surrounding:'A door opened. She ran. It slammed.',style:'Past tense.'},{request:async p=>{calls.push(p);return '["She sprinted.","She dashed away."]';}});assert.equal(calls.length,1);assert.match(calls[0].prompt,/SELECTED TEXT:\nShe ran\./);assert.match(calls[0].prompt,/It slammed/);assert.match(calls[0].instructions,/Preserve its meaning/);assert(calls[0].maxTokens<=1200);assert.equal(result.length,2);});
test('Stopping a suggestion request never offers incomplete output for replacement',async()=>{const controller=new AbortController();await assert.rejects(suggestAlternatives('synonyms',{selectedText:'found'},{signal:controller.signal,request:async()=>{controller.abort();return '["discovered"]';}}),{name:'AbortError'});});

const synonymCases=[
 ['Here are some alternatives:\n```json\n["discovered", "located"]\n```\nChoose whichever fits.', ['discovered','located']],
 ['<think>I could suggest imagined.</think>\n{"synonyms":[{"word":"discovered","definition":"found something"},{"replacement":"came across"}]}', ['discovered','came across']],
 ['1. **discovered** — found for the first time\n2. located: found the position\n3. came across (encountered unexpectedly)', ['discovered','located','came across']],
 ['Synonyms: discovered, located, came across', ['discovered','located','came across']],
 ['discovered\nlocated\ncame across', ['discovered','located','came across']],
 ['discovered', ['discovered']],
 ['- “discovered”\n- \x60located\x60\n- **came across**', ['discovered','located','came across']],
];
for(const [response,expected] of synonymCases)test('Recover usable synonym response: '+response.slice(0,60),()=>assert.deepEqual(parseAlternatives(response,'found','synonyms'),expected));
test('Refusals, explanations, original-only answers and incomplete thinking are never replacement buttons',()=>{
 for(const response of ['I cannot find a replacement word.', 'No suitable alternatives.', 'No.', 'Sorry, no synonyms found.', '[]','{"synonyms":[]}', '["found", "FOUND"]', '["No synonyms found", "I cannot help", "none"]', '<think>["invented"]', 'The word could be replaced with discovered.'])assert.throws(()=>parseAlternatives(response,'found','synonyms'),{name:'AlternativesError'});
});
test('Synonyms preserve capitals, Unicode, contractions and hyphens and cap the list',()=>{
 assert.deepEqual(parseAlternatives('["discovered","came across"]','Found','synonyms'),['Discovered','Came across']);
 assert.deepEqual(parseAlternatives('["discovered"]','FOUND','synonyms'),['DISCOVERED']);
 assert.deepEqual(parseAlternatives('["café", "well-known", "isn’t", "one", "two", "three"]','word','synonyms'),['café','well-known','isn’t','one','two']);
 assert.throws(()=>parseAlternatives('["café"]','café','synonyms'));
});
test('Rephrasing accepts wrapped JSON and numbered sentences without truncating their punctuation',()=>{
 assert.deepEqual(parseAlternatives('Options: '+JSON.stringify({alternatives:[{text:'She said, "Wait [here]."'}]})+' End.','She waited.','rephrase'),['She said, "Wait [here]."']);
 assert.deepEqual(parseAlternatives('Here are alternatives:\n1. She paused — then ran.\n2. She stopped (briefly).','She waited.','rephrase'),['She paused — then ran.','She stopped (briefly).']);
});
test('An empty or malformed answer gets one simpler request with the exact selection and context',async()=>{
 for(const initial of ['[]','No suitable replacements found.','{"suggestions":["found"]}']){
  const calls=[],statuses=[];
  const result=await suggestAlternatives('synonyms',{selectedText:'found',surrounding:'She found the map under the door.',style:'Never change my words.'},{onStatus:s=>statuses.push(s),request:async p=>{calls.push(p);return calls.length===1?initial:'discovered\nlocated\ncame across';}});
  assert.deepEqual(result,['discovered','located','came across']);assert.equal(calls.length,2);
  for(const call of calls){assert.match(call.prompt,/SELECTED TEXT:\nfound/);assert.match(call.prompt,/map under the door/);assert.doesNotMatch(call.prompt,/Never change/);assert(call.maxTokens<=400);assert(Buffer.byteLength(call.instructions)<=4000);}
  assert.match(calls[1].instructions,/one per line/);assert(statuses.some(s=>s.includes('simpler')));
 }
});
test('No usable alternatives stops after two requests without inventing a replacement',async()=>{
 let count=0;await assert.rejects(suggestAlternatives('synonyms',{selectedText:'Neri'},{request:async()=>{count++;return '[]';}}),/no usable alternatives/);assert.equal(count,2);
});
test('Provider errors are preserved and do not trigger a retry',async()=>{
 let count=0;await assert.rejects(suggestAlternatives('synonyms',{selectedText:'found'},{request:async()=>{count++;throw Error('API unavailable');}}),/API unavailable/);assert.equal(count,1);
});
test('Stop during recovery never offers the second response or makes another request',async()=>{
 const controller=new AbortController();let count=0;
 await assert.rejects(suggestAlternatives('synonyms',{selectedText:'found'},{signal:controller.signal,request:async()=>{if(++count===1)return '[]';controller.abort();return 'discovered\nlocated';}}),{name:'AbortError'});assert.equal(count,2);
});
test('Rephrase preserves dialogue quotation marks as manuscript content',()=>{
 assert.deepEqual(parseAlternatives(JSON.stringify(['"Wait here," she said.', '"Stay."']), 'Wait.', 'rephrase'),['"Wait here," she said.', '"Stay."']);
});
