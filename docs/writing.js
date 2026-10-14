import {escapeXML,uuid} from './core.js';

// Sections share the existing revision/export format with chapters.
export const sectionTypes=[
  ['title-page','Title page','front'],['copyright','Copyright page','front'],['dedication','Dedication','front'],
  ['epigraph','Epigraph','front'],['contents','Contents','front'],['foreword','Foreword','front'],
  ['preface','Preface','front'],['introduction','Introduction','front'],['prologue','Prologue','front'],
  ['chapter','Chapter','body'],['interlude','Interlude','body'],['epilogue','Epilogue','back'],
  ['afterword','Afterword','back'],['acknowledgments','Acknowledgments','back'],['appendix','Appendix','back'],
  ['glossary','Glossary','back'],['bibliography','Bibliography','back'],['about-author','About the author','back'],['custom','Custom section','back']
];
export const sectionLabel=c=>sectionTypes.find(([id])=>id===(c.sectionType||'chapter'))?.[1]||'Section';
export const sectionGroup=c=>sectionTypes.find(([id])=>id===(c.sectionType||'chapter'))?.[2]||'body';
export function sectionOrder(type,sections){
  const rank=c=>sectionTypes.findIndex(([id])=>id===(c.sectionType||'chapter'));
  const next=sections.find(c=>rank(c)>rank({sectionType:type}));
  if(!next)return Math.max(0,...sections.map(c=>c.order||0))+1000;
  const i=sections.indexOf(next),before=i?sections[i-1].order||0:0;
  return (before+(next.order||1000))/2;
}
export function sectionTemplate(type,book,sections){
  const p=t=>'<p>'+escapeXML(t)+'</p>';
  if(type==='title-page')return '<h1>'+escapeXML(book.title)+'</h1>'+p(book.author||'Author name');
  if(type==='copyright')return p('© '+new Date().getFullYear()+' '+(book.author||'[Author name]')+'. All rights reserved.')+p('[Edition, publisher, ISBN and other publication details]');
  if(type==='contents')return sections.filter(c=>c.sectionType!=='contents').map(c=>p(c.title)).join('');
  return '';
}
export function manuscriptBeats(chapter){
  if(chapter.beats?.length&&joinBeats(chapter.beats)===(chapter.html||''))return structuredClone(chapter.beats);
  return [{id:chapter.id+'-body',title:'Opening beat',prompt:'',html:chapter.html||''}];
}
export const joinBeats=beats=>beats.map(b=>b.html||'').join('');
export function planLines(text){
  const lines=String(text).split(/\n+/).map(s=>s.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim()).filter(Boolean);
  if(!lines.length||lines.length>40||lines.some(s=>s.length>1200))throw Error('Use 1–40 beats, one per line, with up to 1,200 characters each.');
  return lines;
}
export function applyBeatPlan(chapter,lines){
  // A plan adds unwritten beats. Existing prose and boundaries always stay intact.
  const existing=manuscriptBeats(chapter).filter(b=>b.html?.trim());
  return [...existing,...lines.map((prompt,i)=>({id:uuid(),title:'Beat '+(existing.length+i+1),prompt,html:''}))];
}
export function parseAnalysis(kind,text){
  const raw=String(text).replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'').trim();
  let data;try{data=JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));}catch{throw Error('The model did not return a readable review. The response is saved in Drafts; try again with another model.');}
  const field=(v,max=12000)=>{if(v===undefined)return '';if(typeof v!=='string'||v.length>max)throw Error('The review contains invalid or oversized details. Your Codex is unchanged.');return v;};
  if(kind==='holes'){
    if(!Array.isArray(data.issues)||data.issues.length>30)throw Error('The plot-hole review has an invalid list of findings.');
    return {issues:data.issues.map(x=>({title:field(x.title,200),detail:field(x.detail),evidence:field(x.evidence),question:field(x.question),suggestion:field(x.suggestion)})).filter(x=>x.title&&x.detail)};
  }
  if(!Array.isArray(data.characters)||data.characters.length>30)throw Error('The Codex review has an invalid character list.');
  return {summaryAdditions:field(data.summaryAdditions),developments:field(data.developments),notes:field(data.notes),characters:data.characters.map(c=>{
    const result={name:field(c.name,200)};for(const key of ['role','age','appearance','personality','backstory','motivation','arc','relationships','evidence'])result[key]=field(c[key],6000);return result;
  }).filter(c=>c.name)};
}
export const normalizedName=name=>String(name).normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
