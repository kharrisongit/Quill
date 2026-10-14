import {test} from 'node:test';
import assert from 'node:assert/strict';
import {characterContext,parseCharacter,portraitPrompt} from '../docs/codex.js';
import {buildChapterContext,generateCodex,generateChapterOutline} from '../docs/ai.js';
import {validateConnection,apiRequest,apiText} from '../docs/models.js';
import {revise,validate,backup,fromBackup,union,documents} from '../docs/core.js';
const character={type:'card',category:'Character',book:'book',title:'Neri',appearance:'Silver eyes',motivation:'Find her brother',relationships:'Distrusts the captain',html:'Old character note',portrait:'data:image/jpeg;base64,YQ==',deleted:false};
const book={type:'book',title:'Harbor',synopsis:'A city built on a sleeping whale',plotBeats:'The harbor disappears.',writingStyle:'First person, present tense',deleted:false};
const chapter={id:'chapter',title:'Low tide',synopsis:'Departure',html:''};
const context=buildChapterContext(book,chapter,[chapter],[character],x=>x);
test('Every AI task receives summary, style, plot and structured character facts without image bytes',async()=>{
  const calls=[],request=async p=>{calls.push(p);return 'A suggestion.';};
  await generateChapterOutline({...context,prompt:'Find the ship.',targetWords:500},{request});
  await generateCodex('beat',{...context,prompt:'Follow the captain.'},{request});
  await generateCodex('character',{...context,prompt:'A shipwright.'},{request});
  assert.equal(calls.length,3);
  for(const p of calls){for(const text of ['sleeping whale','harbor disappears','First person','Silver eyes','Find her brother','Distrusts the captain','Old character note'])assert(p.prompt.includes(text),text);assert(!p.prompt.includes('base64'));}
});
test('Legacy character notes and new Codex details round trip through backups and revisions',()=>{
  const a=revise('book',book),b=revise('neri',character);const result=documents(union([],fromBackup(backup([a,b]))));
  assert.equal(result.find(x=>x.id==='book').synopsis,book.synopsis);assert.equal(result.find(x=>x.id==='neri').portrait,character.portrait);
  assert.match(characterContext(character,x=>x),/Old character note/);
  assert.throws(()=>validate({...b,body:{...character,portrait:'https://tracker.example/image'}}),/portrait/);
  assert.throws(()=>validate({...b,body:{...character,role:{bad:true}}}),/text/);
});
test('Character suggestions are validated before replacing editable fields',()=>{
  assert.equal(parseCharacter('```json\n{"name":"Neri","role":"Navigator"}\n```').title,'Neri');
  assert.throws(()=>parseCharacter('Some prose, not JSON'),/unstructured/);
  assert.throws(()=>parseCharacter('{"name":"Neri","appearance":["eyes"]}'),/invalid/);
  assert.match(portraitPrompt(character),/Silver eyes/);assert(!portraitPrompt(character).includes('base64'));
});
test('API endpoints reject embedded credentials, unsafe transports and query keys',()=>{
  const profile={name:'Mine',model:'writer',endpoint:'https://model.example/v1/chat/completions',format:'openai'};
  const p=validateConnection(profile);assert.equal(p.endpoint,'https://model.example/v1');
  for(const endpoint of ['http://remote.example/v1','https://secret@remote.example/v1','https://remote.example/v1?key=secret','javascript:bad'])assert.throws(()=>validateConnection({...profile,endpoint}));
  assert.equal(validateConnection({...profile,endpoint:'http://localhost:11434/v1'}).endpoint,'http://localhost:11434/v1');
  assert.throws(()=>validateConnection({...profile,format:'unknown'}));
});
test('Custom API adapters preserve model ID and translate both supported response formats',()=>{
  const payload={instructions:'Style',prompt:'Story',maxTokens:400},p=validateConnection({name:'Mine',model:'my-model',endpoint:'https://host.example/v1',format:'openai'});
  assert.deepEqual(apiRequest(p,payload).body.messages,[{role:'system',content:'Style'},{role:'user',content:'Story'}]);
  assert.equal(apiRequest(p,payload).body.model,'my-model');assert.equal(apiText(p,{choices:[{message:{content:'Words'}}]}),'Words');
  const anthropic={...p,format:'anthropic'};assert.equal(apiRequest(anthropic,payload).body.system,'Style');assert.equal(apiText(anthropic,{content:[{type:'thinking',text:'hidden'},{type:'text',text:'Visible'}]}),'Visible');assert.throws(()=>apiText(p,{choices:[]}));
});
