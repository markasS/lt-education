'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let names = [];
const numberName = n => n === 'pl' ? 'Множественное число / daugiskaita' : 'Единственное число / vienaskaita';
const HISTORY_KEY = 'lt-grammar:attempts:v1';
const lessonNumber = l => l.number || lessons.findIndex(item=>item.id===l.id)+1;
const lessonLabel = l => lessonNumber(l)>0 ? `Занятие №${lessonNumber(l)}` : 'Занятие';
const caseTranslations = c => `${c.ru}${c.uk?' / '+c.uk:''}`;
const exportCases = () => lesson.cases.map(({code,lt,ru,uk})=>({code,lt,ru,...(uk?{uk}:{})}));
const sentenceTranslations = q => q.translationUk ? `<div class="sentence-translations"><p lang="ru"><span>RU</span> ${esc(q.translation)}</p><p lang="uk"><span>UA</span> ${esc(q.translationUk)}</p></div>` : q.translation ? `<p class="translation" lang="ru">${esc(q.translation)}</p>` : '';
let lessons = [], lesson, draft, step = 0, lastInput, openedAt, storageBlocked = false;
let answerKeys = {}, practice = null, shownReport = null;
function key() { return `lt-grammar:draft:${lesson.id}:v${lesson.version}`; }
function showError(text) { $('error').hidden = false; $('error').textContent = text; }
function readStorage(k, fallback) {
  try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : fallback; }
  catch { storageBlocked = true; showError('Не удалось прочитать сохранённые данные. Ответы можно скачать, но автосохранение недоступно. Не очищайте браузер до скачивания.'); return fallback; }
}
function elapsed() { return draft.completed ? draft.completedAttempt.elapsedSeconds : Math.round((draft.elapsedMs + Date.now() - openedAt) / 1000); }
function save() {
  draft.step = step;
  draft.updatedAt = new Date().toISOString();
  const copy = {...draft, elapsedMs: elapsed() * 1000};
  try {
    if (storageBlocked) throw new Error('blocked');
    localStorage.setItem(key(), JSON.stringify(copy));
    $('save-status').textContent = 'Черновик сохранён';
  } catch { $('save-status').textContent = 'Сохраните файл ответов'; showError('Автосохранение недоступно. На последнем шаге скачайте ответы перед закрытием страницы.'); }
}
function practicing() { return !!practice && step === lesson.sections.length + 1; }
function answerState(id) { return (practicing() ? practice.round.answers : draft.answers)[id] || {}; }
function value(id) { return answerState(id).value || ''; }
function locked() { return draft.completed && !practicing(); }
function setNames() { names=[...lesson.sections.map(s=>s.title),'Результат',...(practice ? ['Повторение ошибок'] : [])]; }
function practiceKey(id) { return `lt-grammar:practice:${id}:v1`; }
function practicePointer() { return `lt-grammar:practice-active:${lesson.id}:v${lesson.version}`; }
function savePractice() {
  try { if(storageBlocked) throw Error(); localStorage.setItem(practiceKey(practice.source.attemptId),JSON.stringify(practice));localStorage.setItem(practicePointer(),JSON.stringify(practice.source.attemptId)); $('save-status').textContent='Повторение сохранено'; }
  catch { showError('Не удалось сохранить повторение в браузере. Скачайте результаты перед закрытием страницы.'); }
}

function sectionQuestions(section) {
  if (section.kind === 'table') return section.caseCodes.flatMap((code,i) => section.words.map(word => ({id:`${section.prefix}.${i+1}.${word}`,word,case:code,number:section.number,model:section.model,chooseCase:false})));
  return section.questions || [];
}
function allQuestions() {
  return lesson.sections.flatMap(section => sectionQuestions(section).map(q => ({...q,section:section.id,prompt:q.sentence||q.prompt||q.word,requestedCase:q.case||null,instruction:section.instruction,imageContext:section.image||null})));
}
function count() { return allQuestions().filter(q => value(q.id).trim()).length; }
function input(id, label, cls='answer-field') {
  return `<input class="${cls}" id="answer-${esc(id)}" data-id="${esc(id)}" data-field="value" aria-label="${esc(label)}" value="${esc(value(id))}" autocomplete="off" autocapitalize="none" spellcheck="false" ${locked() ? 'disabled' : ''}>`;
}
function caseSelect(q, allowed) {
  return `<select class="case-field" data-id="${esc(q.id)}" data-field="case" aria-label="Падеж для задания ${esc(q.id)}" ${locked() ? 'disabled' : ''}><option value="">Выберите падеж</option>${lesson.cases.filter(c => !allowed || allowed.includes(c.code)).map(c => `<option value="${esc(c.code)}" ${answerState(q.id).case === c.code ? 'selected' : ''}>${esc(c.code)} ${esc(c.lt)} — ${esc(caseTranslations(c).toLowerCase())}</option>`).join('')}</select>`;
}
function answerControl(q) {
  if (!q.options) return input(q.id, `Форма для ${q.id}`);
  return `<select class="answer-field" id="answer-${esc(q.id)}" data-id="${esc(q.id)}" data-field="value" aria-label="Форма для ${esc(q.id)}" ${locked() ? 'disabled' : ''}><option value="">Выберите форму</option>${q.options.map(option=>`<option value="${esc(option)}" ${value(q.id)===option ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select>`;
}
function question(q, allowed) {
  const c = lesson.cases.find(c => c.code === q.case);
  const base = q.prompt || `${q.word} (${lesson.words[q.word]})`;
  const choices = q.wordOptions ? `<p class="word-options">Слова: ${q.wordOptions.map(w=>`<span lang="lt">${esc(w)}</span> — ${esc(lesson.words[w])}`).join(' / ')}</p>` : '';
  const prompt = q.chooseCase ? q.sentence : `${base} → ${caseTranslations(c)} / ${c.lt} (${c.code})`;
  const translations=sentenceTranslations(q);
  return `<div class="question"><label class="main-label" for="answer-${esc(q.id)}"><span class="id">${esc(q.id)}</span><span>${esc(prompt)}</span></label>${choices}<p class="translation">${esc(numberName(q.number))} · модель ${esc(q.model)}</p>${translations}<div class="answer-line">${answerControl(q)}${q.chooseCase ? caseSelect(q,allowed) : ''}</div></div>`;
}
function renderSection(section) {
  let html = intro(esc(section.title),`Около ${section.minutes} минут`,esc(section.instruction));
  if (section.kind === 'picture') {
    html += `<figure class="picture-task"><a href="${esc(section.image.src)}" target="_blank" rel="noopener" aria-label="Открыть комикс крупнее"><img src="${esc(section.image.src)}" alt="${esc(section.image.alt)}" width="1536" height="1024"></a><figcaption>Кадры A–D. Нажмите на картинку, чтобы открыть её крупнее.</figcaption></figure><details class="hint-details"><summary>Текстовое описание картинки</summary><p>${esc(section.image.description)}</p></details>`;
    html += section.questions.map(q=>question(q,section.caseCodes)).join('');
  } else if (section.kind === 'reference') {
    html += (section.cards||[]).map(card=>`<div class="rule-card"><h3>${esc(card.title)}</h3><p>${esc(card.text)}</p></div>`).join('');
    html += section.models.map(model => `<h3>${esc(model.label)}</h3><div class="table-scroll"><table class="reference-table"><thead><tr><th>Падеж</th><th>Вопрос</th><th>Окончание</th><th>Образец</th></tr></thead><tbody>${model.rows.map(c => `<tr><td><span lang="lt">${esc(c.code)} ${esc(c.lt)}</span><small lang="ru">${esc(c.ru)}</small>${c.uk?`<small lang="uk">${esc(c.uk)}</small>`:''}</td><td>${esc(c.question)}</td><td>${esc(c.ending)}</td><td lang="lt">${esc(c.example)}</td></tr>`).join('')}</tbody></table></div>`).join('');
    if(section.note) html += `<p>${esc(section.note)}</p>`;
  } else if (section.kind === 'table') {
    html += `<p class="translation">${esc(numberName(section.number))} · модель ${esc(section.model)}</p><div class="table-scroll"><table class="exercise-table"><thead><tr><th>Падеж</th>${section.words.map(w => `<th lang="lt">${esc(w)}<small lang="ru">${esc(lesson.words[w])}</small></th>`).join('')}</tr></thead><tbody>${section.caseCodes.map((code,i) => {const c=lesson.cases.find(c=>c.code===code);return `<tr><td>${i+1}. ${esc(c.code)} <span lang="lt">${esc(c.lt)}</span><small lang="ru">${esc(c.ru)}</small>${c.uk?`<small lang="uk">${esc(c.uk)}</small>`:''}</td>${section.words.map(w => `<td>${input(`${section.prefix}.${i+1}.${w}`,`${w}: ${caseTranslations(c)} / ${c.lt}`)}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div>`;
  } else html += section.questions.map(q=>question(q,section.caseCodes)).join('');
  return html;
}
function intro(title, min, text) { return `<div class="section-meta">${min}</div><h2 tabindex="-1" id="step-title">${title}</h2><p>${text}</p>`; }
function render() {
  $('steps').innerHTML = names.map((name,i) => `<button class="step-button" data-step="${i}" ${step === i ? 'aria-current="step"' : ''}><span class="number">${i+1}</span>${name}</button>`).join('');
  let html = '';
  const lockedNotice = draft.completed && step < lesson.sections.length ? '<p class="notice">Попытка завершена. Для новой попытки откройте шаг «Результат».</p>' : '';
  if (practicing()) html = renderPractice();
  else if (step < lesson.sections.length) html = renderSection(lesson.sections[step]);
  else if (draft.completed) html = renderReport(draft.completedAttempt);
  else {
    const total = allQuestions().length;
    html = intro('Проверить занятие','','Сначала сохраняются первоначальные ответы, затем появляется оценка и разбор. Исправления в повторении не меняют первоначальный результат.') + `<div class="summary"><div><strong>${count()} / ${total}</strong><span>форм заполнено</span></div></div><div class="finished-actions"><button id="finish">Завершить и проверить</button><button id="download-draft" class="secondary">Скачать черновик</button></div>`;
  }
  $('content').innerHTML = lockedNotice + html;
  $('previous').disabled = step === 0;
  $('next').hidden = step === names.length - 1;
  updateProgress(); renderHistory(); renderCourseProgress();
}
function updateProgress() {
  const total = practicing() ? practice.round.ids.length : allQuestions().length;
  const filled = practicing() ? practice.round.ids.filter(id=>value(id).trim()).length : count();
  $('progress').max = total; $('progress').value = filled;
  $('progress-text').textContent = `Заполнено ${filled} из ${total} форм`;
  $('step-count').textContent = `Шаг ${step+1} из ${names.length}`;
}
function history() {
  const h = readStorage(HISTORY_KEY, []);
  if (!Array.isArray(h)) { storageBlocked = true; showError('История имеет неизвестный формат. Скачайте текущие ответы; сохранённая история не будет перезаписана.'); return []; }
  return h;
}
function renderCourseProgress() {
  const completed=new Set(history().filter(a=>a.status==='completed').map(a=>a.lesson.id));
  const total=lessons.filter(l=>completed.has(l.id)).length;
  $('course-progress').innerHTML=`<p>Завершено занятий: <strong>${total} / ${lessons.length}</strong></p><div class="course-path">${lessons.map(l=>`<button class="${completed.has(l.id)?'done':''}" data-open-lesson="${esc(l.id)}" aria-label="${esc(lessonLabel(l))}${completed.has(l.id)?', завершено':''}" ${lesson.id===l.id?'aria-current="true"':''}>${lessonNumber(l)}${completed.has(l.id)?'<span aria-hidden="true">✓</span>':''}</button>`).join('')}</div>`;
}
function achievements(a,report,p) {
  const corrected=p?.rounds.some(round=>round.evaluation?.incorrectIds.length===0);
  return `<div class="achievements" aria-label="Отметки за занятие"><span>✓ Практика завершена</span>${report.incorrectIds.length===0?'<span>★ Все ответы верны</span>':''}${corrected?'<span>✓ Ошибки исправлены</span>':''}</div>`;
}
function renderHistory() {
  const h = history();
  $('history').innerHTML = h.length ? h.slice().reverse().map(a => {
    const report=reportFor(a);
    return `<div class="history-entry"><button class="secondary" data-view-attempt="${esc(a.attemptId)}">${esc(lessonLabel(a.lesson))} · ${esc(a.lesson.title)}<br>${new Date(a.completedAt).toLocaleDateString('ru-RU')}${report ? ` · ${report.formScore.correct}/${report.formScore.total} форм` : ''} · отчёт</button></div>`;
  }).join('') + '<button id="download-all" class="secondary">Скачать все результаты</button>' : '<p>Здесь появятся отчёты завершённых занятий.</p>';
}
function makeExport(completed=false) {
  return {schemaVersion:3,attemptId:draft.attemptId,lesson:{id:lesson.id,version:lesson.version,title:lesson.title,topic:lesson.topic,week:lesson.week,...(lesson.day?{day:lesson.day}:{}),number:lessonNumber(lesson)},status:completed?'completed':'draft',startedAt:draft.startedAt,completedAt:completed?new Date().toISOString():null,exportedAt:new Date().toISOString(),elapsedSeconds:elapsed(),durationNote:'Время открытой страницы, включая возможные паузы; не показатель скорости.',cases:exportCases(),answers:allQuestions().map(q=>({id:q.id,section:q.section,prompt:q.prompt,instruction:q.instruction,word:q.word||null,requestedCase:q.requestedCase,requestedNumber:q.number,model:q.model,caseSelectionRequired:q.chooseCase,...(q.translation?{translation:q.translation}:{}),...(q.translationUk?{translationUk:q.translationUk}:{}),...(q.options?{formOptions:q.options}:{}),...(q.wordOptions?{wordOptions:q.wordOptions}:{}),...(q.imageContext?{imageContext:q.imageContext,panel:q.panel}:{}),value:value(q.id),selectedCase:answerState(q.id).case||null})),filledForms:count(),totalForms:allQuestions().length,evaluation:null};
}
function download(data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));
  const link = document.createElement('a'); link.href=url; link.download=`${data.lesson.id}_${data.startedAt.slice(0,10)}_${data.attemptId.slice(-6)}${data.status==='draft'?'_draft':''}.json`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function switchLesson(id) {
  if (lesson && !draft.completed) save();
  lesson=lessons.find(l=>l.id===id); openedAt=Date.now();
  const active=readStorage(practicePointer(),null); practice=active ? readStorage(practiceKey(active),null) : null;
  if(practice && (!practice.round || !practice.source || practice.source.lesson.id!==lesson.id || practice.source.lesson.version!==lesson.version)) practice=null;
  setNames();
  const fresh = {attemptId:crypto.randomUUID(),startedAt:new Date().toISOString(),elapsedMs:0,answers:{},reflection:{},step:0,completed:false};
  draft=readStorage(key(),fresh);
  if (!draft || typeof draft.answers!=='object' || !draft.reflection || !Number.isFinite(draft.elapsedMs)) { storageBlocked=true; draft=fresh; showError('Черновик имеет неизвестный формат. Автосохранение отключено, чтобы не перезаписать старые данные. Можно скачать новые ответы.'); }
  step=Number.isInteger(draft.step)&&draft.step>=0&&draft.step<names.length?draft.step:0;
  $('lesson-title').textContent=lesson.title; $('lesson-subtitle').textContent=lesson.subtitle;
  $('lesson-meta').textContent=lessonLabel(lesson).toLocaleUpperCase('ru-RU');
  $('lesson-picker').value=id;
  $('duration-minutes').textContent=`≈ ${lesson.minutes} минут`;
  render(); if (!draft.completed) save();
}
function go(to) { if(practicing())savePractice(); save(); step=to; render(); save(); $('step-title').focus(); $('main').scrollIntoView({behavior:'auto',block:'start'}); }
function record(event) {
  if (draft.completed && !practicing()) return;
  const el=event.target;
  if (!el.dataset.id) return;
  const answers=practicing() ? practice.round.answers : draft.answers;
  answers[el.dataset.id] ||= {}; answers[el.dataset.id][el.dataset.field]=el.value;
  if(practicing())savePractice();else save(); updateProgress();
}
document.addEventListener('input',record);
document.addEventListener('change',e=>{ if(e.target.tagName==='SELECT'||e.target.type==='checkbox') record(e); });
document.addEventListener('focusin',e=>{if(e.target.matches('input[data-field="value"]')) lastInput=e.target;});
$('letters').innerHTML = [...'ąčęėįšųūž'].map(c=>`<button type="button" data-letter="${c}" aria-label="Вставить ${c}">${c}</button>`).join('');
$('letters').addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
document.addEventListener('click',e=>{
  const button=e.target.closest('button'); if(!button)return;
  if(button.dataset.step)go(Number(button.dataset.step));
  if(button.dataset.openLesson){switchLesson(button.dataset.openLesson);$('main').scrollIntoView({behavior:'auto',block:'start'});}
  if(button.id==='next')go(step+1);
  if(button.id==='previous')go(step-1);
  if(button.dataset.letter && lastInput?.isConnected && !lastInput.disabled){const start=lastInput.selectionStart,end=lastInput.selectionEnd; lastInput.setRangeText(button.dataset.letter,start,end,'end');lastInput.focus();lastInput.dispatchEvent(new Event('input',{bubbles:true}));}
  if(button.id==='download-draft')download(makeExport());
  if(button.id==='download')download(draft.completedAttempt);
  if(button.dataset.viewAttempt){shownReport=history().find(a=>a.attemptId===button.dataset.viewAttempt);if(shownReport){$('report-dialog-content').innerHTML=renderReport(shownReport,true);$('report-dialog').showModal();}}
  if(button.id==='close-report')$('report-dialog').close();
  if(button.dataset.reportAction) reportAction(button.dataset.reportAction,button.dataset.source);
  if(button.id==='download-all')downloadAll();
  if(button.id==='check-practice')checkPractice();
  if(button.id==='next-practice')nextPractice();
  if(button.id==='back-to-result')go(lesson.sections.length);
  if(button.id==='finish'){
    const incomplete=allQuestions().filter(q=>!value(q.id).trim() || q.chooseCase&&!answerState(q.id).case).length;
    $('finish-message').textContent=incomplete?`Есть ${incomplete} заданий без формы или выбранного падежа. Можно вернуться к ним или сохранить попытку с пропусками.`:'Все формы и необходимые падежи заполнены. Можно сохранить попытку.';
    $('finish-dialog').showModal();
  }
  if(button.id==='cancel-finish')$('finish-dialog').close();
  if(button.id==='confirm-finish'){
    const a=makeExport(true);
    try { a.evaluation=grade(a); } catch { showError('Для этой версии занятия нет полного проверочного ключа. Можно скачать черновик; ответы сохраняются.');$('finish-dialog').close();return; }
    const h=history();
    try{if(storageBlocked)throw Error();localStorage.setItem(HISTORY_KEY,JSON.stringify([...h,a]));}catch{showError('Не удалось сохранить историю в браузере. Скачайте ответы, чтобы сохранить результат.');}
    draft.completed=true;draft.completedAttempt=a;draft.elapsedMs=a.elapsedSeconds*1000;openedAt=Date.now();save();$('finish-dialog').close();render();$('step-title').focus();
  }
  if(button.id==='new-attempt'){
    practice=null;try{if(!storageBlocked)localStorage.removeItem(practicePointer());}catch{}setNames();
    draft={attemptId:crypto.randomUUID(),startedAt:new Date().toISOString(),elapsedMs:0,answers:{},reflection:{},step:0,completed:false};openedAt=Date.now();step=0;save();render();$('main').scrollIntoView();
  }
});
$('lesson-picker').addEventListener('change',e=>switchLesson(e.target.value));
window.addEventListener('pagehide',()=>{if(practicing())savePractice();if(draft&&!draft.completed)save();});
document.addEventListener('visibilitychange',()=>{if(practicing())savePractice();if(draft&&!draft.completed)save();});
window.addEventListener('storage',e=>{if(lesson&&(e.key===key() || practice&&e.key===practiceKey(practice.source.attemptId))){storageBlocked=true;showError('Занятие изменилось в другой вкладке. Здесь автосохранение остановлено. Скачайте черновик перед обновлением страницы.');}});
Promise.all(['./lessons.json','./answer-keys.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error();return r.json();}))).then(([data,keys])=>{
  answerKeys=keys.keys;
  lessons=data.lessons;if(!Array.isArray(lessons)||!lessons.length)throw Error();
  $('lesson-picker').innerHTML=lessons.map(l=>`<option value="${esc(l.id)}">${esc(lessonLabel(l))} · ${esc(l.title)}</option>`).join('');switchLesson(lessons[0].id);
}).catch(()=>{showError('Не удалось загрузить задания. Проверьте соединение и обновите страницу.');$('save-status').textContent='Занятие не загружено';$('next').disabled=true;});

function keyFor(a) { return answerKeys[`${a.lesson.id}:v${a.lesson.version}`]; }
function grade(a,ids) {
  const catalog=lessons.find(l=>l.id===a.lesson.id);
  return LTGrading.evaluate(a,keyFor(a),a.cases||catalog.cases,catalog.words,ids);
}
function reportFor(a) {
  if(a.evaluation?.evaluatorVersion===1)return a.evaluation;
  try{return grade(a);}catch{return null;}
}
function sourceAttempt(id) {
  return [draft?.completedAttempt,practice?.source,shownReport,...history()].find(a=>a?.attemptId===id);
}
function caseLabel(code,a) { return LTGrading.caseName(code,a.cases||lesson.cases); }
function errorCards(report,a) {
  return report.checks.filter(c=>!c.formCorrect||c.caseCorrect===false).map(c=>`<article class="feedback-card"><h3>${esc(c.id)} · ${esc(c.prompt)}</h3>${sentenceTranslations(a.answers.find(q=>q.id===c.id)||{})}<p class="translation">${esc(numberName(c.number))} · модель ${esc(c.model)}${c.chooseCase?'':` · ${esc(caseLabel(c.expectedCase,a))}`}</p><div class="answer-comparison"><div><small>Ваш ответ</small><strong lang="lt">${esc(c.actual||'—')}</strong></div><div><small>Правильно</small><strong lang="lt">${esc(c.expected)}</strong></div></div><p class="${c.formCorrect?'success-text':'error-text'}">${c.formCorrect?'Форма правильная.':esc(c.feedback.text)}</p>${c.chooseCase?`<p class="${c.caseCorrect?'success-text':'error-text'}">${c.caseCorrect?'Падеж выбран правильно: ':c.selectedCase?'Выбран '+esc(caseLabel(c.selectedCase,a))+'. Нужен: ':'Падеж не выбран. Нужен: '}${esc(caseLabel(c.expectedCase,a))}.</p>`:''}<p class="feedback-rule">${esc(c.rule)}<br>${esc(c.word)} → <strong lang="lt">${esc(c.expected)}</strong>; ${esc(caseLabel(c.expectedCase,a))}, ${c.number==='pl'?'множественное':'единственное'} число, окончание <strong>${esc(c.ending)}</strong>.</p></article>`).join('');
}
function practiceFor(a) { return practice?.source?.attemptId===a.attemptId ? practice : readStorage(practiceKey(a.attemptId),null); }
function recommendations(report,a) {
  const wrong=report.checks.filter(c=>!c.formCorrect||c.caseCorrect===false),tips=[];
  if(wrong.some(c=>c.feedback?.type==='different-word'))tips.push('Сохраняйте основу заданного слова: правильное окончание другого слова не подходит.');
  for(const c of wrong.filter(c=>c.feedback?.type==='spelling'))if(!tips.includes(c.feedback.text))tips.push(c.feedback.text);
  const forms=new Map();for(const c of wrong.filter(c=>c.feedback?.type!=='spelling'&&c.feedback?.type!=='different-word'))forms.set(`${c.model}:${c.number}:${c.expectedCase}`,`Модель ${c.model}, ${c.number==='pl'?'множественное':'единственное'} число: ${caseLabel(c.expectedCase,a)}, окончание ${c.ending}.`);
  tips.push(...forms.values());return tips.length?`<div class="repeat-topics"><h3>Что повторить</h3><ul>${tips.slice(0,6).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`:'';
}
function reportActions(a,report,inDialog=false) {
  const supported=!!keyFor(a)&&lessons.some(l=>l.id===a.lesson.id&&l.version===a.lesson.version);
  const next=lessons[lessons.findIndex(l=>l.id===a.lesson.id)+1];
  return `<div class="finished-actions">${report?.incorrectIds.length&&supported?`<button data-report-action="repeat" data-source="${esc(a.attemptId)}">Повторить ошибки (${report.incorrectIds.length})</button>`:''}${report?`<button class="secondary" data-report-action="copy" data-source="${esc(a.attemptId)}">Скопировать краткий отчёт</button><button class="secondary" data-report-action="text" data-source="${esc(a.attemptId)}">Скачать отчёт текстом</button>`:''}<button class="secondary" data-report-action="json" data-source="${esc(a.attemptId)}">Скачать ответы и оценку</button>${!inDialog&&a.attemptId===draft.completedAttempt?.attemptId?`<button id="new-attempt" class="secondary">Новая попытка</button>${next?`<button class="secondary" data-open-lesson="${esc(next.id)}">К занятию №${lessonNumber(next)}</button>`:''}`:''}</div><p class="report-action-status" role="status"></p>`;
}
function renderReport(a,inDialog=false) {
  const report=reportFor(a);
  const heading=`<div class="section-meta">Первоначальная попытка · ${new Date(a.completedAt).toLocaleDateString('ru-RU')}</div><h2 ${inDialog?'':'id="step-title" tabindex="-1"'}>${esc(a.lesson.title)}: результат</h2>`;
  if(!report)return heading+'<p>Для этой версии занятия нет проверочного ключа. Первоначальные ответы доступны для скачивания.</p>'+reportActions(a,null,inDialog);
  const p=practiceFor(a),rounds=p?.rounds||[];
  const extra=rounds.length?`<p class="practice-note">Повторение: ${rounds.map((r,i)=>`раунд ${i+1} — ${r.evaluation.fullyCorrect}/${r.evaluation.checks.length}`).join('; ')}. Первоначальная оценка сохранена.</p>`:'';
  return heading+achievements(a,report,p)+`<div class="summary"><div><strong>${report.formScore.correct} / ${report.formScore.total}</strong><span>правильных форм</span></div>${report.caseScore.total?`<div><strong>${report.caseScore.correct} / ${report.caseScore.total}</strong><span>правильно выбранных падежей</span></div>`:''}</div><p>${report.incorrectIds.length?`В ${report.incorrectIds.length} заданиях есть ошибка или пропуск. Форма и выбор падежа проверяются отдельно.`:'Все задания выполнены правильно.'}</p><div class="model-results">${report.groups.map(g=>`<span>${esc(g.model)} · ${g.number==='pl'?'мн. ч.':'ед. ч.'}: <strong>${g.correct}/${g.total}</strong></span>`).join('')}</div>${extra}${recommendations(report,a)}${errorCards(report,a)}<details class="all-answers"><summary>Все ответы (${report.checks.length})</summary><div class="table-scroll"><table class="reference-table"><thead><tr><th>№</th><th>Ваш ответ</th><th>Правильно</th><th>Падеж</th></tr></thead><tbody>${report.checks.map(c=>`<tr><td>${esc(c.id)}</td><td class="${c.formCorrect?'success-text':'error-text'}">${esc(c.actual||'—')}</td><td lang="lt">${esc(c.expected)}</td><td>${c.chooseCase?`${esc(c.selectedCase||'—')} → `:''}${esc(caseLabel(c.expectedCase,a))}</td></tr>`).join('')}</tbody></table></div></details>${reportActions(a,report,inDialog)}`;
}
function plainReport(a,full=false) {
  const r=reportFor(a);if(!r)return `${a.lesson.title}: автоматическая проверка этой версии недоступна.`;
  const lines=[`${lessonLabel(a.lesson)}: ${a.lesson.title}`,`Первоначальная попытка: ${r.formScore.correct}/${r.formScore.total} форм${r.caseScore.total?`; падежи ${r.caseScore.correct}/${r.caseScore.total}`:''}.`];
  for(const c of r.checks.filter(c=>!c.formCorrect||c.caseCorrect===false)){
    lines.push(`${c.id}. ${c.prompt}`,`Ответ: ${c.actual||'пропуск'} → ${c.expected}. ${c.chooseCase?`Падеж: ${c.selectedCase||'не выбран'} → ${c.expectedCase}.`:''}`);
    if(full){const q=a.answers.find(q=>q.id===c.id);if(q?.translation)lines.push('RU: '+q.translation);if(q?.translationUk)lines.push('UA: '+q.translationUk);lines.push(c.rule,`${caseLabel(c.expectedCase,a)}, ${c.number==='pl'?'множественное':'единственное'} число, окончание ${c.ending}.`,c.feedback?.text||'Форма верна.');}
  }
  if(!r.incorrectIds.length)lines.push('Ошибок нет.');
  const p=practiceFor(a);if(p?.rounds.length)lines.push('Повторение (отдельно от первоначального балла): '+p.rounds.map((r,i)=>`раунд ${i+1}: ${r.evaluation.fullyCorrect}/${r.evaluation.checks.length}`).join('; '));
  return lines.join('\n');
}
function downloadBlob(content,name,type) {
  const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function enrichedExport(a) {
  const p=practiceFor(a);return {...a,evaluation:reportFor(a),...(p?{practice:{sourceAttemptId:a.attemptId,rounds:p.rounds,unfinishedRound:p.round.checked?null:p.round}}:{})};
}
function downloadAll() {
  const attempts=history();if(!attempts.length)return;
  downloadBlob(JSON.stringify({schemaVersion:1,type:'lt-grammar-results-bundle',exportedAt:new Date().toISOString(),attempts:attempts.map(enrichedExport)},null,2),`LT_results_${new Date().toISOString().slice(0,10)}.json`,'application/json;charset=utf-8');
}
async function reportAction(action,id) {
  const a=sourceAttempt(id);if(!a)return;
  if(action==='repeat'){startPractice(a);return;}
  if(action==='json'){download(enrichedExport(a));return;}
  if(action==='text'){downloadBlob(plainReport(a,true),`${a.lesson.id}_${a.attemptId.slice(-6)}_report.txt`,'text/plain;charset=utf-8');return;}
  if(action==='copy'){
    try{await navigator.clipboard.writeText(plainReport(a));document.querySelectorAll('.report-action-status').forEach(e=>e.textContent='Отчёт скопирован. Можно вставить его в сообщение.');}
    catch{document.querySelectorAll('.report-action-status').forEach(e=>e.textContent='Не удалось скопировать. Используйте «Скачать отчёт текстом».');}
  }
}
function freshRound(ids) { return {roundId:crypto.randomUUID(),ids:[...ids],answers:{},startedAt:new Date().toISOString(),checked:false}; }
function startPractice(a) {
  const report=reportFor(a);if(!report?.incorrectIds.length)return;
  const matching=lessons.find(l=>l.id===a.lesson.id&&l.version===a.lesson.version);if(!matching)return;
  if($('report-dialog').open)$('report-dialog').close();
  if(lesson.id!==matching.id)switchLesson(matching.id);
  const existing=readStorage(practiceKey(a.attemptId),null);
  practice=existing?.source?.attemptId===a.attemptId&&existing.round?existing:{source:a,rounds:[],round:freshRound(report.incorrectIds)};
  setNames();savePractice();go(lesson.sections.length+1);
}
function practiceAttempt() {
  const ids=new Set(practice.round.ids);
  return {attemptId:practice.round.roundId,sourceAttemptId:practice.source.attemptId,lesson:{...practice.source.lesson},cases:exportCases(),status:'practice',startedAt:practice.round.startedAt,completedAt:new Date().toISOString(),answers:allQuestions().filter(q=>ids.has(q.id)).map(q=>({id:q.id,prompt:q.prompt,section:q.section,word:q.word||null,requestedCase:q.case||null,requestedNumber:q.number,model:q.model,caseSelectionRequired:q.chooseCase,...(q.translation?{translation:q.translation}:{}),...(q.translationUk?{translationUk:q.translationUk}:{}),...(q.imageContext?{imageContext:q.imageContext,panel:q.panel}:{}),...(q.wordOptions?{wordOptions:q.wordOptions}:{}),value:practice.round.answers[q.id]?.value||'',selectedCase:practice.round.answers[q.id]?.case||null}))};
}
function renderPractice() {
  const original=reportFor(practice.source),round=practice.round;
  let html=intro('Повторение ошибок','','Это отдельная тренировка. Первоначальный результат остаётся прежним. Запишите ответы ещё раз, затем проверьте их.')+`<p class="practice-note">Первоначально: ${original.formScore.correct}/${original.formScore.total} форм. Сейчас повторяем ${round.ids.length} заданий.</p>`;
  if(round.checked){
    const r=round.result.evaluation;
    return html+`<div class="summary"><div><strong>${r.fullyCorrect} / ${r.checks.length}</strong><span>заданий исправлено полностью</span></div></div>${r.incorrectIds.length?errorCards(r,practice.source):'<p class="success-text">Все задания этого раунда выполнены правильно.</p><div class="achievements"><span>✓ Ошибки исправлены</span></div>'}<div class="finished-actions">${r.incorrectIds.length?`<button id="next-practice">Повторить оставшиеся (${r.incorrectIds.length})</button>`:'<button id="restart-practice" class="secondary">Повторить ещё раз</button>'}<button id="back-to-result" class="secondary">К первоначальному результату</button></div>`;
  }
  const qs=allQuestions().filter(q=>round.ids.includes(q.id)),image=qs.find(q=>q.imageContext)?.imageContext;
  if(image)html+=`<figure class="picture-task"><a href="${esc(image.src)}" target="_blank" rel="noopener"><img src="${esc(image.src)}" alt="${esc(image.alt)}" width="1536" height="1024"></a><figcaption>Картинка для повторения. Нажмите, чтобы открыть крупнее.</figcaption></figure>`;
  return html+qs.map(q=>question(q,lesson.sections.find(s=>s.id===q.section)?.caseCodes)).join('')+'<div class="finished-actions"><button id="check-practice">Проверить повторение</button><button id="back-to-result" class="secondary">К результату</button></div>';
}
function checkPractice() {
  if(!practice||practice.round.checked)return;
  const ids=practice.round.ids,attempt=practiceAttempt();
  if(attempt.answers.some(a=>!a.value.trim()||a.caseSelectionRequired&&!a.selectedCase)){showError('В повторении заполните все формы и выберите падежи, затем проверьте ответы.');return;}
  attempt.evaluation=grade(attempt,ids);practice.round.checked=true;practice.round.result=attempt;practice.rounds.push(attempt);savePractice();render();$('step-title').focus();
}
function nextPractice(restart=false) {
  if(!practice?.round.checked)return;
  const ids=restart?reportFor(practice.source).incorrectIds:practice.round.result.evaluation.incorrectIds;
  if(!ids.length)return;practice.round=freshRound(ids);savePractice();render();$('step-title').focus();
}
document.addEventListener('click',e=>{if(e.target.closest('#restart-practice'))nextPractice(true);});
