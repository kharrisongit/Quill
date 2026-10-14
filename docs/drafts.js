// Presentation helpers shared by the draft manager and its storage tests.
export function draftKind(d){return d.category==='Codex suggestion'?'Suggestion':d.html?'Chapter draft':'Outline';}
export function draftMatches(d,filter,query=''){
  const text=[d.title,d.status,d.prompt,d.outline,d.html].join(' ').toLocaleLowerCase();
  return text.includes(query.trim().toLocaleLowerCase()) && (filter==='all'||filter==='outlines'&&draftKind(d)==='Outline'||filter==='chapters'&&draftKind(d)==='Chapter draft'||filter==='suggestions'&&draftKind(d)==='Suggestion'||filter==='used'&&d.status?.startsWith('Used')||filter==='unfinished'&&['Stopped','Failed','Planning','Writing'].includes(d.status));
}
export function downloadProgress(text){
  if(!/^(Downloading model|Loading model|Loading installed local model|Model ready)/i.test(text))return null;
  const match=text.match(/(\d+(?:\.\d+)?)%/);
  const ready=/^Model ready/.test(text);
  return {value:ready?100:match?Math.max(0,Math.min(100,Number(match[1]))):null,label:ready?'Ready':match?Math.round(Number(match[1]))+'%':/^Downloading/.test(text)?'Starting…':'Loading…'};
}
