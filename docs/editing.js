import {sanitize} from './export.js';

// Text offsets include block separators, so words cannot match across paragraphs.
export function manuscriptText(html){
  const root=document.createElement('div');root.innerHTML=sanitize(html);const nodes=[];let text='';
  const boundary=()=>{if(text&&!text.endsWith('\n'))text+='\n';};
  function walk(node){
    if(node.nodeType===3){nodes.push({node,start:text.length,end:text.length+node.length});text+=node.data;return;}
    if(node.nodeType!==1)return;
    if(['BR','HR'].includes(node.tagName)){text+='\n';return;}
    const block=['P','DIV','H1','H2','H3','BLOCKQUOTE','LI','UL','OL'].includes(node.tagName);if(block)boundary();
    for(const child of node.childNodes)walk(child);if(block)boundary();
  }
  for(const child of root.childNodes)walk(child);
  return {root,text,nodes};
}
export function findText(html,query,{matchCase=false,wholeWord=true}={}){
  if(!query)return [];const {text}=manuscriptText(html),matches=[];
  const pattern=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),matchCase?'gu':'giu');
  const word=c=>c&&/[\p{L}\p{N}\p{M}_'’]/u.test(c);
  for(const m of text.matchAll(pattern)){
    const start=m.index,end=start+m[0].length;
    if(wholeWord&&(word([...text.slice(Math.max(0,start-2),start)].at(-1))||word(String.fromCodePoint(text.codePointAt(end)||32))))continue;
    matches.push({start,end,text:m[0],before:text.slice(Math.max(0,start-45),start),after:text.slice(end,end+65)});
  }
  return matches;
}
export function replaceText(html,matches,replacement){
  const {root,text,nodes}=manuscriptText(html);let limit=text.length;
  const point=(offset,end=false)=>{
    const entry=nodes.find(n=>end?offset>n.start&&offset<=n.end:offset>=n.start&&offset<n.end);
    if(!entry)throw Error('This passage changed. Search again before replacing it.');
    return [entry.node,offset-entry.start];
  };
  for(const m of [...matches].sort((a,b)=>b.start-a.start)){
    if(m.start<0||m.end>limit||m.end<=m.start||text.slice(m.start,m.end)!==m.text)throw Error('This passage changed. Search again before replacing it.');
    const [sn,so]=point(m.start),[en,eo]=point(m.end,true),r=document.createRange();r.setStart(sn,so);r.setEnd(en,eo);const insertion=r.cloneRange();insertion.collapse(true);r.deleteContents();insertion.insertNode(document.createTextNode(replacement));limit=m.start;
  }
  return sanitize(root.innerHTML);
}
export function spellingWords(text){return [...String(text).matchAll(/\p{L}[\p{L}\p{M}]*(?:['’][\p{L}\p{M}]+)*/gu)].map(m=>({word:m[0],start:m.index,end:m.index+m[0].length}));}
let speller;
export function spellingEngine(){
  if(!speller){if(typeof globalThis.quillCreateSpeller!=='function')throw Error('The offline spelling dictionary is unavailable. Reopen Quill after updating it.');speller=globalThis.quillCreateSpeller();}
  return speller;
}
export function personalWords(){try{const saved=JSON.parse(localStorage.getItem('quill-personal-dictionary')||'[]');return Array.isArray(saved)?saved.filter(w=>typeof w==='string'&&/^[\p{L}\p{M}'’]{1,80}$/u.test(w)).slice(0,5000):[];}catch{return [];}}
export function rememberWord(word){
  if(!/^[\p{L}\p{M}'’]{1,80}$/u.test(word))throw Error('Choose a word of up to 80 letters.');
  const saved=personalWords();if(!saved.includes(word)){if(saved.length>=5000)throw Error('Your personal dictionary has reached its 5,000-word limit.');saved.push(word);localStorage.setItem('quill-personal-dictionary',JSON.stringify(saved));}
}
