// Immutable revisions: concurrent edits remain available until explicitly resolved.
export const uuid = () => crypto.randomUUID();
const idOK = s => typeof s === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(s);
export function validate(r) {
  if (!r || r.schema !== 1 || !idOK(r.id) || !idOK(r.entity) || !Array.isArray(r.parents) || r.parents.length > 1000 || r.parents.some(p => !idOK(p) || p === r.id) || !Number.isFinite(r.time)) throw Error('Invalid Quill revision.');
  const b = r.body;
  if (!b || !['book','chapter','card'].includes(b.type) || typeof b.title !== 'string' || b.title.length > 1000 || typeof b.deleted !== 'boolean') throw Error('Invalid document.');
  if (b.type !== 'book' && !idOK(b.book)) throw Error('Invalid book reference.');
  for (const field of ['html','synopsis','author','category','status','color','plotBeats','writingStyle','prompt','outline','issue','model']) if (b[field] !== undefined && (typeof b[field] !== 'string' || b[field].length > 3000000)) throw Error('Invalid document text.');
  for (const field of ['order','goal','dailyGoal','targetWords']) if (b[field] !== undefined && (!Number.isFinite(b[field]) || b[field] < 0)) throw Error('Invalid document number.');
  if (b.type === 'card' && b.category === 'Generated draft' && (!idOK(b.chapter) || !idOK(b.sourceRevision))) throw Error('Invalid generated draft reference.');
  if (JSON.stringify(r).length > 4000000) throw Error('A chapter exceeds the 4 MB limit. Split it into smaller chapters.');
  return r;
}
function canonical(value) { return JSON.stringify(value, (k,v) => v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])) : v); }
export function union(existing, incoming) {
  if (!Array.isArray(incoming) || incoming.length > 200000) throw Error('Invalid backup.');
  const map = new Map(existing.map(r => [r.id, r]));
  for (const raw of incoming) {
    const r = validate(raw), previous = map.get(r.id);
    if (previous && canonical(previous) !== canonical(r)) throw Error('Conflicting revision identifier. No changes imported.');
    map.set(r.id, r);
  }
  // Imported parents may arrive later, but can never point to another entity or form a cycle.
  const done = new Set();
  for (const r of map.values()) {
    const stack = [[r,false]], visiting = new Set();
    while (stack.length) {
      const [item,exit] = stack.pop();
      if (exit) { visiting.delete(item.id); done.add(item.id); continue; }
      if (done.has(item.id)) continue;
      if (visiting.has(item.id)) throw Error('Invalid revision cycle.');
      visiting.add(item.id); stack.push([item,true]);
      for (const p of item.parents) if (map.has(p)) {
        const parent = map.get(p);
        if (parent.entity !== item.entity || parent.body.type !== item.body.type) throw Error('Invalid revision parent.');
        stack.push([parent,false]);
      }
    }
  }
  return [...map.values()];
}
export function heads(revisions, entity) {
  const items = revisions.filter(r => r.entity === entity);
  const superseded = new Set(items.flatMap(r => r.parents));
  return items.filter(r => !superseded.has(r.id)).sort((a,b) => b.time-a.time || b.id.localeCompare(a.id));
}
export function documents(revisions, deleted=false) {
  const grouped = new Map();
  for (const r of revisions) { if (!grouped.has(r.entity)) grouped.set(r.entity,[]); grouped.get(r.entity).push(r); }
  return [...grouped].map(([id,list]) => { const h=heads(list,id); return {...h[0].body,id,revision:h[0],conflicts:h.length-1}; }).filter(d=>d.deleted===deleted);
}
export function revise(entity, body, parents=[]) { return {schema:1,id:uuid(),entity,parents:[...new Set(parents)],time:Date.now(),body:structuredClone(body)}; }
export function countWords(text) { return (String(text).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)||[]).length; }
export const escapeXML = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function fromBackup(text) {
  const data=JSON.parse(text);
  if (data.format!=='quill-backup' || data.version!==1 || !Array.isArray(data.revisions)) throw Error('Choose a Quill .json backup.');
  return data.revisions;
}
export function backup(revisions) { return JSON.stringify({format:'quill-backup',version:1,exportedAt:new Date().toISOString(),revisions},null,2); }
// ZIP store method keeps exports self-contained, with no third-party CDN or dependency.
export function zip(files) {
  const enc=new TextEncoder(), parts=[], entries=[]; let offset=0;
  const crc32=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
  function header(size,values){const b=new Uint8Array(size),v=new DataView(b.buffer);for(const [at,num,width] of values)width===2?v.setUint16(at,num,true):v.setUint32(at,num,true);return b;}
  for(const [name,content] of files){const n=enc.encode(name),b=typeof content==='string'?enc.encode(content):content,crc=crc32(b);
    const h=header(30,[[0,0x04034b50,4],[4,20,2],[6,0x800,2],[10,0,2],[12,33,2],[14,crc,4],[18,b.length,4],[22,b.length,4],[26,n.length,2]]);
    parts.push(h,n,b); entries.push([n,b.length,crc,offset]);offset+=h.length+n.length+b.length;
  }
  const start=offset;
  for(const [n,size,crc,at] of entries){const h=header(46,[[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x800,2],[14,33,2],[16,crc,4],[20,size,4],[24,size,4],[28,n.length,2],[42,at,4]]);parts.push(h,n);offset+=h.length+n.length;}
  parts.push(header(22,[[0,0x06054b50,4],[8,entries.length,2],[10,entries.length,2],[12,offset-start,4],[16,start,4]]));
  const out=new Uint8Array(parts.reduce((n,b)=>n+b.length,0));let p=0;for(const part of parts){out.set(part,p);p+=part.length;}return out;
}
