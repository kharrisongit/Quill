// Deterministic checks complement model review; none of these functions edit a manuscript.
export const defaultAvoidPhrases = 'mind racing\nweight of\na reminder\ncouldn’t shake\ncouldn’t help but\na sense of\nbreath she didn’t know she was holding\nbreath he didn’t know he was holding';
const tokens=text=>String(text).normalize('NFKC').toLocaleLowerCase().replaceAll('’',"'").match(/[\p{L}\p{M}\p{N}]+(?:'[\p{L}\p{M}]+)*/gu)||[];
export function avoidPhrases(value=defaultAvoidPhrases){
  if(typeof value!=='string'||value.length>1600)throw Error('Keep avoided phrases within 1,600 characters.');
  const phrases=[...new Set(value.split('\n').map(p=>p.trim()).filter(Boolean))];
  if(phrases.length>30||phrases.some(p=>p.length>80||!tokens(p).length))throw Error('Use up to 30 phrases, each no longer than 80 characters.');return phrases;
}
export function repeatedPhrases(text,previous=''){
  const words=tokens(text),prior=tokens(String(previous).slice(-40000)),known=new Set(),seen=new Set(),repeated=[];
  for(let i=0;i<=prior.length-8;i++)known.add(prior.slice(i,i+8).join(' '));
  for(let i=0;i<=words.length-8;i++){
    const phrase=words.slice(i,i+8).join(' ');
    if(known.has(phrase)||seen.has(phrase)){repeated.push(phrase);if(repeated.length===4)break;i+=7;}
    seen.add(phrase);
  }
  return repeated;
}
export function beatProblems(text,previous='',phrases=avoidPhrases()){
  const normalized=' '+tokens(text).join(' ')+' ',problems=[];
  for(const phrase of phrases)if(normalized.includes(' '+tokens(phrase).join(' ')+' '))problems.push('Avoided phrase: “'+phrase+'”.');
  for(const phrase of repeatedPhrases(text,previous))problems.push('Repeated wording from this draft or earlier writing: “'+phrase+'”.');
  return problems;
}
export function parseBeatReview(text){
  const data=JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
  if(!data||['repeatsIdeas','stalls','breaksContinuity','usesCliches'].some(k=>typeof data[k]!=='boolean')||typeof data.fix!=='string')throw Error('The model did not return a usable beat review.');
  const problems=[];
  if(data.repeatsIdeas)problems.push('Replays an established fact, action, description or thought, even with different wording.');
  if(data.stalls)problems.push('Leaves the scene in the same state without a meaningful action, consequence, discovery or decision put into practice.');
  if(data.breaksContinuity)problems.push('Contradicts the latest written actions or current scene state.');
  if(data.usesCliches)problems.push('Uses stock emotional shorthand, vague symbolic commentary or a cliché.');
  if(problems.length&&data.fix.trim())problems.push('Suggested correction: '+data.fix.trim().slice(0,600));
  return problems;
}
