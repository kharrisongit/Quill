export const characterFields=[['role','Story role'],['age','Age'],['appearance','Appearance'],['personality','Personality & voice'],['backstory','Backstory'],['motivation','Wants, needs & fears'],['arc','Character arc'],['relationships','Relationships']];
export function characterContext(card,plain){return [card.title,...characterFields.filter(([key])=>card[key]).map(([key,label])=>label+': '+card[key]),plain(card.html||'')].join('\n');}
export function parseCharacter(text){
  const cleaned=String(text).replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'').trim();
  const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');let data;
  try{data=JSON.parse(cleaned.slice(start,end+1));}catch{throw Error('The model returned an unstructured character. Your existing details are kept; copy the suggestion below or try again.');}
  if(!data||typeof data.name!=='string'||!data.name.trim())throw Error('The character needs a name. Edit the suggestion or try again.');
  const result={title:data.name.trim().slice(0,1000)};
  for(const [key] of characterFields){if(data[key]!==undefined&&typeof data[key]!=='string')throw Error('The model returned invalid character details. Try again.');result[key]=(data[key]||'').slice(0,6000);}
  return result;
}
export function portraitPrompt(card){return `Portrait of a fictional story character. ${card.title||''}. ${card.age?'Age: '+card.age+'. ':''}${card.appearance||''}. ${card.role||''}. ${card.personality||''}. Book illustration, no text.`.slice(0,1800);}
