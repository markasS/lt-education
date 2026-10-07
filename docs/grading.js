/* Pure grading: reviewed keys, exact Lithuanian spelling, no inferred causes. */
(function(root){
 'use strict';
 const CODES=['V.','K.','N.','G.','Įn.','Vt.','Š.'];
 const ENDINGS={'-as':{sg:['as','o','ui','ą','u','e','e'],pl:['ai','ų','ams','us','ais','uose','ai']},'-a':{sg:['a','os','ai','ą','a','oje','a'],pl:['os','ų','oms','as','omis','ose','os']}};
 const normalize=s=>String(s??'').normalize('NFC').trim().toLocaleLowerCase('lt');
 const form=(word,model,number,code)=>word.slice(0,-(model.length-1))+ENDINGS[model][number][CODES.indexOf(code)];
 const caseName=(code,cases)=>{const c=cases.find(c=>c.code===code);return c?`${c.code} ${c.lt} / ${c.ru.toLowerCase()}`:String(code||'не выбран');};
 function formFeedback(answer,expected,cases,words){
  const actual=normalize(answer.value),correct=normalize(expected.value);
  if(!actual)return {type:'missing',text:'Форма не записана.'};
  // Only describe a recognizable form; never label the learner's intent.
  const other=[];
  for(const number of ['sg','pl'])for(const code of CODES)if(form(expected.word,expected.model,number,code)===actual)other.push(`${caseName(code,cases)}, ${number==='sg'?'единственное':'множественное'} число`);
  if(other.length)return {type:'different-form',text:`Написанная форма соответствует: ${other.join('; ')}.`};
  for(const [word,translation] of Object.entries(words||{}))if(word!==expected.word&&word.endsWith(expected.model.slice(1))&&form(word,expected.model,expected.number,expected.case)===actual)return {type:'different-word',text:`Это форма слова ${word} (${translation}); в задании требуется ${expected.word}.`};
  const differences=[...correct].map((c,i)=>[c,[...actual][i]]).filter(([a,b])=>a!==b);
  if(actual.length===correct.length&&differences.length&&differences.every(([a,b])=>a==='y'&&b==='i'))return {type:'spelling',text:`В слове ${expected.word} сохраняется буква y. Окончание сравните с правильным ответом.`};
  const bare=s=>s.normalize('NFD').replace(/\p{M}/gu,'');
  if(bare(actual)===bare(correct))return {type:'spelling',text:'Литовские буквы с диакритикой отличаются от обычных: сохраните их в правильной форме.'};
  return {type:'form',text:'Написание не совпадает с требуемой формой. Сравните основу и окончание с правильным ответом.'};
 }
 function evaluate(attempt,key,cases,words,ids){
  if(!key||key.lessonId!==attempt.lesson.id||key.lessonVersion!==attempt.lesson.version)throw Error('Нет ключа для этой версии занятия.');
  const expectedIds=ids||Object.keys(key.answers),answers=new Map(attempt.answers.map(a=>[a.id,a]));
  if(answers.size!==attempt.answers.length||answers.size!==expectedIds.length||expectedIds.some(id=>!answers.has(id)||!key.answers[id]))throw Error('Набор заданий не совпадает с проверочным ключом.');
  const groups={};
  const checks=expectedIds.map(id=>{
   const a=answers.get(id),e=key.answers[id],formCorrect=normalize(a.value)===normalize(e.value),caseCorrect=e.chooseCase?a.selectedCase===e.case:null;
   const feedback=formCorrect?null:formFeedback(a,e,cases,words);
   const groupId=`${e.model}:${e.number}`;groups[groupId]||={model:e.model,number:e.number,correct:0,total:0};groups[groupId].total++;groups[groupId].correct+=Number(formCorrect);
   return {id,prompt:a.prompt,section:e.section,word:e.word,number:e.number,model:e.model,actual:a.value,expected:e.value,formCorrect,selectedCase:a.selectedCase||null,expectedCase:e.case,caseCorrect,chooseCase:e.chooseCase,ending:e.ending,rule:e.rule,feedback};
  });
  return {evaluatorVersion:1,keyRevision:key.revision,formScore:{correct:checks.filter(c=>c.formCorrect).length,total:checks.length},caseScore:{correct:checks.filter(c=>c.caseCorrect===true).length,total:checks.filter(c=>c.chooseCase).length},fullyCorrect:checks.filter(c=>c.formCorrect&&c.caseCorrect!==false).length,incorrectIds:checks.filter(c=>!c.formCorrect||c.caseCorrect===false).map(c=>c.id),groups:Object.values(groups),checks};
 }
 const api={evaluate,normalize,caseName,form};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LTGrading=api;
})(typeof globalThis!=='undefined'?globalThis:this);
