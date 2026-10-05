'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let names = [];
const numberName = n => n === 'pl' ? 'Множественное число / daugiskaita' : 'Единственное число / vienaskaita';
const HISTORY_KEY = 'lt-grammar:attempts:v1';
let lessons = [], lesson, draft, step = 0, lastInput, openedAt, storageBlocked = false;
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
function value(id) { return draft.answers[id]?.value || ''; }
function sectionQuestions(section) {
  if (section.kind === 'table') return section.caseCodes.flatMap((code,i) => section.words.map(word => ({id:`${section.prefix}.${i+1}.${word}`,word,case:code,number:section.number,model:section.model,chooseCase:false})));
  return section.questions || [];
}
function allQuestions() {
  return lesson.sections.flatMap(section => sectionQuestions(section).map(q => ({...q,section:section.id,prompt:q.sentence||q.prompt||q.word,requestedCase:q.case||null,instruction:section.instruction})));
}
function count() { return allQuestions().filter(q => value(q.id).trim()).length; }
function input(id, label, cls='answer-field') {
  return `<input class="${cls}" id="answer-${esc(id)}" data-id="${esc(id)}" data-field="value" aria-label="${esc(label)}" value="${esc(value(id))}" autocomplete="off" autocapitalize="none" spellcheck="false" ${draft.completed ? 'disabled' : ''}>`;
}
function caseSelect(q, allowed) {
  return `<select class="case-field" data-id="${esc(q.id)}" data-field="case" aria-label="Падеж для задания ${esc(q.id)}" ${draft.completed ? 'disabled' : ''}><option value="">Выберите падеж</option>${lesson.cases.filter(c => !allowed || allowed.includes(c.code)).map(c => `<option value="${esc(c.code)}" ${draft.answers[q.id]?.case === c.code ? 'selected' : ''}>${esc(c.code)} ${esc(c.lt)} — ${esc(c.ru.toLowerCase())}</option>`).join('')}</select>`;
}
function question(q, allowed) {
  const c = lesson.cases.find(c => c.code === q.case);
  const base = q.prompt || `${q.word} (${lesson.words[q.word]})`;
  const prompt = q.chooseCase ? q.sentence : `${base} → ${c.ru} / ${c.lt} (${c.code})`;
  return `<div class="question"><label class="main-label" for="answer-${esc(q.id)}"><span class="id">${esc(q.id)}</span><span>${esc(prompt)}</span></label><p class="translation">${esc(numberName(q.number))} · модель ${esc(q.model)}${q.translation ? ' · '+esc(q.translation) : ''}</p><div class="answer-line">${input(q.id, `Форма для ${q.id}`)}${q.chooseCase ? caseSelect(q,allowed) : ''}</div></div>`;
}
function renderSection(section) {
  let html = intro(esc(section.title),`Около ${section.minutes} минут`,esc(section.instruction));
  if (section.kind === 'reference') {
    html += section.models.map(model => `<h3>${esc(model.label)}</h3><div class="table-scroll"><table class="reference-table"><thead><tr><th>Падеж</th><th>Вопрос</th><th>Окончание</th><th>Образец</th></tr></thead><tbody>${model.rows.map(c => `<tr><td><span lang="lt">${esc(c.code)} ${esc(c.lt)}</span><small>${esc(c.ru)}</small></td><td>${esc(c.question)}</td><td>${esc(c.ending)}</td><td lang="lt">${esc(c.example)}</td></tr>`).join('')}</tbody></table></div>`).join('');
    if(section.note) html += `<p>${esc(section.note)}</p>`;
  } else if (section.kind === 'table') {
    html += `<p class="translation">${esc(numberName(section.number))} · модель ${esc(section.model)}</p><div class="table-scroll"><table class="exercise-table"><thead><tr><th>Падеж</th>${section.words.map(w => `<th lang="lt">${esc(w)}<small lang="ru">${esc(lesson.words[w])}</small></th>`).join('')}</tr></thead><tbody>${section.caseCodes.map((code,i) => {const c=lesson.cases.find(c=>c.code===code);return `<tr><td>${i+1}. ${esc(c.code)} <span lang="lt">${esc(c.lt)}</span><small>${esc(c.ru)}</small></td>${section.words.map(w => `<td>${input(`${section.prefix}.${i+1}.${w}`,`${w}: ${c.ru} / ${c.lt}`)}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div>`;
  } else html += section.questions.map(q=>question(q,section.caseCodes)).join('');
  return html;
}
function intro(title, min, text) { return `<div class="section-meta">${min}</div><h2 tabindex="-1" id="step-title">${title}</h2><p>${text}</p>`; }
function render() {
  $('steps').innerHTML = names.map((name,i) => `<button class="step-button" data-step="${i}" ${step === i ? 'aria-current="step"' : ''}><span class="number">${i+1}</span>${name}</button>`).join('');
  let html = '';
  const locked = draft.completed ? '<p class="notice">Эта попытка завершена. Ответы сохранены; для новой попытки используйте кнопку на последнем шаге.</p>' : '';
  if (step < lesson.sections.length) html = renderSection(lesson.sections[step]);
  else {
    const total = allQuestions().length;
    html = intro(draft.completed ? 'Занятие завершено' : 'Сохранить ответы','', 'Ответы будут проверены после отправки файла. Здесь считается заполнение, а не правильность.') + `<div class="summary"><div><strong>${count()} / ${total}</strong><span>форм заполнено</span></div><div><strong>${Math.max(1,Math.round(elapsed()/60))} мин</strong><span>страница была открыта</span></div></div><p style="margin-top:22px">Скачайте файл ответов и отправьте его в чат для проверки. В нём сохранятся тема, задания, каждый ответ и выбранные падежи.</p><div class="finished-actions">${draft.completed ? '<button id="download">Скачать ответы</button><button id="new-attempt" class="secondary">Новая попытка</button>' : '<button id="finish">Завершить и скачать ответы</button><button id="download-draft" class="secondary">Скачать черновик</button>'}</div>`;
  }
  $('content').innerHTML = locked + html;
  $('previous').disabled = step === 0;
  $('next').hidden = step === names.length - 1;
  updateProgress(); renderHistory();
}
function updateProgress() {
  const total = allQuestions().length;
  $('progress').max = total; $('progress').value = count();
  $('progress-text').textContent = `Заполнено ${count()} из ${total} форм`;
  $('step-count').textContent = `Шаг ${step+1} из ${names.length}`;
}
function history() {
  const h = readStorage(HISTORY_KEY, []);
  if (!Array.isArray(h)) { storageBlocked = true; showError('История имеет неизвестный формат. Скачайте текущие ответы; сохранённая история не будет перезаписана.'); return []; }
  return h;
}
function renderHistory() {
  const h = history();
  $('history').innerHTML = h.length ? h.slice().reverse().map(a => `<button class="secondary" data-attempt="${esc(a.attemptId)}">${esc(a.lesson.title)}<br>${new Date(a.completedAt).toLocaleDateString('ru-RU')} · скачать</button>`).join('') : '<p>После завершения здесь появятся файлы ваших ответов.</p>';
}
function makeExport(completed=false) {
  return {schemaVersion:2,attemptId:draft.attemptId,lesson:{id:lesson.id,version:lesson.version,title:lesson.title,topic:lesson.topic,week:lesson.week,day:lesson.day},status:completed?'completed':'draft',startedAt:draft.startedAt,completedAt:completed?new Date().toISOString():null,exportedAt:new Date().toISOString(),elapsedSeconds:elapsed(),durationNote:'Время открытой страницы, включая возможные паузы; не показатель скорости.',cases:lesson.cases.map(({code,lt,ru})=>({code,lt,ru})),answers:allQuestions().map(q=>({id:q.id,section:q.section,prompt:q.prompt,instruction:q.instruction,word:q.word||null,requestedCase:q.requestedCase,requestedNumber:q.number,model:q.model,caseSelectionRequired:q.chooseCase,value:value(q.id),selectedCase:draft.answers[q.id]?.case||null})),filledForms:count(),totalForms:allQuestions().length,evaluation:null};
}
function download(data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));
  const link = document.createElement('a'); link.href=url; link.download=`${data.lesson.id}_${data.startedAt.slice(0,10)}_${data.attemptId.slice(-6)}${data.status==='draft'?'_draft':''}.json`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function switchLesson(id) {
  if (lesson && !draft.completed) save();
  lesson=lessons.find(l=>l.id===id); names=[...lesson.sections.map(s=>s.title),'Завершение']; openedAt=Date.now();
  const fresh = {attemptId:crypto.randomUUID(),startedAt:new Date().toISOString(),elapsedMs:0,answers:{},reflection:{},step:0,completed:false};
  draft=readStorage(key(),fresh);
  if (!draft || typeof draft.answers!=='object' || !draft.reflection || !Number.isFinite(draft.elapsedMs)) { storageBlocked=true; draft=fresh; showError('Черновик имеет неизвестный формат. Автосохранение отключено, чтобы не перезаписать старые данные. Можно скачать новые ответы.'); }
  step=Number.isInteger(draft.step)&&draft.step>=0&&draft.step<names.length?draft.step:0;
  $('lesson-title').textContent=lesson.title; $('lesson-subtitle').textContent=lesson.subtitle;
  $('lesson-meta').textContent=`НЕДЕЛЯ ${lesson.week} · ${lesson.day.toLocaleUpperCase('ru-RU')}`;
  $('lesson-picker').value=id;
  $('duration-minutes').textContent=`≈ ${lesson.minutes} минут`;
  render(); if (!draft.completed) save();
}
function go(to) { save(); step=to; render(); save(); $('step-title').focus(); $('main').scrollIntoView({behavior:'auto',block:'start'}); }
function record(event) {
  if (draft.completed) return;
  const el=event.target;
  if (el.dataset.id) { draft.answers[el.dataset.id] ||= {}; draft.answers[el.dataset.id][el.dataset.field] = el.type==='checkbox'?el.checked:el.value; }
  else return;
  save(); updateProgress();
}
document.addEventListener('input',record);
document.addEventListener('change',e=>{ if(e.target.tagName==='SELECT'||e.target.type==='checkbox') record(e); });
document.addEventListener('focusin',e=>{if(e.target.matches('input[data-field="value"]')) lastInput=e.target;});
$('letters').innerHTML = [...'ąčęėįšųūž'].map(c=>`<button type="button" data-letter="${c}" aria-label="Вставить ${c}">${c}</button>`).join('');
$('letters').addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});
document.addEventListener('click',e=>{
  const button=e.target.closest('button'); if(!button)return;
  if(button.dataset.step)go(Number(button.dataset.step));
  if(button.id==='next')go(step+1);
  if(button.id==='previous')go(step-1);
  if(button.dataset.letter && lastInput?.isConnected && !lastInput.disabled){const start=lastInput.selectionStart,end=lastInput.selectionEnd; lastInput.setRangeText(button.dataset.letter,start,end,'end');lastInput.focus();lastInput.dispatchEvent(new Event('input',{bubbles:true}));}
  if(button.id==='download-draft')download(makeExport());
  if(button.id==='download')download(draft.completedAttempt);
  if(button.dataset.attempt){const a=history().find(a=>a.attemptId===button.dataset.attempt);if(a)download(a);}
  if(button.id==='finish'){
    const incomplete=allQuestions().filter(q=>!value(q.id).trim() || q.chooseCase&&!draft.answers[q.id]?.case).length;
    $('finish-message').textContent=incomplete?`Есть ${incomplete} заданий без формы или выбранного падежа. Можно вернуться к ним или сохранить попытку с пропусками.`:'Все формы и необходимые падежи заполнены. Можно сохранить попытку.';
    $('finish-dialog').showModal();
  }
  if(button.id==='cancel-finish')$('finish-dialog').close();
  if(button.id==='confirm-finish'){
    const a=makeExport(true), h=history();
    try{if(storageBlocked)throw Error();localStorage.setItem(HISTORY_KEY,JSON.stringify([...h,a]));}catch{showError('Не удалось сохранить историю в браузере. Файл ответов скачан; сохраните его для проверки.');}
    draft.completed=true;draft.completedAttempt=a;draft.elapsedMs=a.elapsedSeconds*1000;openedAt=Date.now();save();$('finish-dialog').close();render();download(a);
  }
  if(button.id==='new-attempt'){
    draft={attemptId:crypto.randomUUID(),startedAt:new Date().toISOString(),elapsedMs:0,answers:{},reflection:{},step:0,completed:false};openedAt=Date.now();step=0;save();render();$('main').scrollIntoView();
  }
});
$('lesson-picker').addEventListener('change',e=>switchLesson(e.target.value));
window.addEventListener('pagehide',()=>{if(draft&&!draft.completed)save();});
document.addEventListener('visibilitychange',()=>{if(draft&&!draft.completed)save();});
window.addEventListener('storage',e=>{if(lesson&&e.key===key()){storageBlocked=true;showError('Занятие изменилось в другой вкладке. Здесь автосохранение остановлено. Скачайте черновик перед обновлением страницы.');}});
fetch('./lessons.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
  lessons=data.lessons;if(!Array.isArray(lessons)||!lessons.length)throw Error();
  $('lesson-picker').innerHTML=lessons.map(l=>`<option value="${esc(l.id)}">Неделя ${l.week} · ${esc(l.day)}</option>`).join('');switchLesson(lessons[0].id);
}).catch(()=>{showError('Не удалось загрузить задания. Проверьте соединение и обновите страницу.');$('save-status').textContent='Занятие не загружено';$('next').disabled=true;});
