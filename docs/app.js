'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = ['Начальная проверка','Памятка','Таблица склонения','Отдельные формы','Предложения','Исправление ошибок','Итоговая проверка','Завершение'];
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
function allQuestions() {
  return [
    ...lesson.baseline.map(q => ({...q,section:'baseline',prompt:q.word,requestedCase:q.case})),
    ...lesson.cases.flatMap((c,i) => lesson.tableWords.map(w => ({id:`1.${i+1}.${w}`,section:'table',word:w,prompt:w,requestedCase:c.code}))),
    ...lesson.forms.map(q => ({...q,section:'forms',prompt:q.word,requestedCase:q.case})),
    ...lesson.sentences.map(q => ({...q,section:'sentences',prompt:q.sentence})),
    ...lesson.corrections.map(q => ({...q,section:'corrections',prompt:q.sentence})),
    ...lesson.exit.map(q => ({...q,section:'exit',prompt:q.sentence}))
  ];
}
function count() { return allQuestions().filter(q => value(q.id).trim()).length; }
function input(id, label, cls='answer-field') {
  return `<input class="${cls}" id="answer-${esc(id)}" data-id="${esc(id)}" data-field="value" aria-label="${esc(label)}" value="${esc(value(id))}" autocomplete="off" autocapitalize="none" spellcheck="false" ${draft.completed ? 'disabled' : ''}>`;
}
function caseSelect(q) {
  return `<select class="case-field" data-id="${esc(q.id)}" data-field="case" aria-label="Падеж для задания ${esc(q.id)}" ${draft.completed ? 'disabled' : ''}><option value="">Выберите падеж</option>${lesson.cases.map(c => `<option value="${esc(c.code)}" ${draft.answers[q.id]?.case === c.code ? 'selected' : ''}>${esc(c.code)} ${esc(c.lt)} — ${esc(c.ru.toLowerCase())}</option>`).join('')}</select>`;
}
function marks(q, hints=true) {
  return `${hints ? `<label class="hint-label"><input type="checkbox" data-id="${q.id}" data-field="hintUsed" ${draft.answers[q.id]?.hintUsed ? 'checked' : ''} ${draft.completed ? 'disabled' : ''}>Смотрела подсказку</label>` : ''}<label class="hint-label"><input type="checkbox" data-id="${q.id}" data-field="uncertain" ${draft.answers[q.id]?.uncertain ? 'checked' : ''} ${draft.completed ? 'disabled' : ''}>Сомневаюсь</label>`;
}
function question(q, mode) {
  const c = lesson.cases.find(c => c.code === q.case);
  const prompt = mode === 'form' ? `${q.word} (${lesson.words[q.word]}) → ${c.ru} / ${c.lt} (${c.code})` : q.sentence;
  return `<div class="question"><label class="main-label" for="answer-${esc(q.id)}"><span class="id">${esc(q.id)}</span><span ${mode !== 'form' ? 'lang="lt"' : ''}>${esc(prompt)}</span></label>${q.translation ? `<p class="translation">${esc(q.translation)}</p>` : ''}<div class="answer-line">${input(q.id, `Форма для ${q.id}`)}${mode !== 'form' ? caseSelect(q) : ''}</div>${mode === 'correction' ? `<textarea class="answer-field reason" data-id="${q.id}" data-field="reason" aria-label="Причина исправления в ${q.id}" placeholder="Почему нужен этот падеж? Можно по-русски." ${draft.completed ? 'disabled' : ''}>${esc(draft.answers[q.id]?.reason || '')}</textarea>` : ''}${marks(q)}</div>`;
}
function intro(title, min, text) { return `<div class="section-meta">${min}</div><h2 tabindex="-1" id="step-title">${title}</h2><p>${text}</p>`; }
function render() {
  $('steps').innerHTML = names.map((name,i) => `<button class="step-button" data-step="${i}" ${step === i ? 'aria-current="step"' : ''}><span class="number">${i+1}</span>${name}</button>`).join('');
  let html = '';
  const locked = draft.completed ? '<p class="notice">Эта попытка завершена. Ответы сохранены; для новой попытки используйте кнопку на последнем шаге.</p>' : '';
  if (step === 0) html = intro('Что уже получается самостоятельно','Около 5 минут','Запишите заданные формы без памятки. Все слова — в единственном числе. Сохраняйте первые ответы: они помогут увидеть, какие окончания требуют тренировки.') + lesson.baseline.map(q => question(q,'form')).join('');
  if (step === 1) html = intro('Одна основа и семь окончаний','Около 5 минут','Образец: namas — дом, основа nam-. Здесь меняется только окончание. Во время тренировки можно возвращаться к памятке; отмечайте ответы с подсказкой.') + `<div class="table-scroll"><table class="reference-table"><thead><tr><th>Падеж</th><th>Вопрос</th><th>Окончание</th><th>Образец</th></tr></thead><tbody>${lesson.cases.map(c => `<tr><td><span lang="lt">${c.code} ${c.lt}</span><small>${c.ru}</small></td><td>${c.question}</td><td>${c.ending}</td><td lang="lt">${c.example}</td></tr>`).join('')}</tbody></table></div><p>Galininkas (G.) / винительный: пишите <strong>ą</strong>. Vietininkas (Vt.) / местный и Šauksmininkas (Š.) / звательный совпадают по форме, но отличаются по функции.</p><p>Работаем с регулярной моделью. Особые формы обращения, например Jonas → Jonai, отработаем отдельно.</p>`;
  if (step === 2) html = intro('Просклоняйте четыре слова','Около 12 минут','Заполните 28 клеток полными словами. Все формы — в единственном числе. Звательный неодушевлённых слов здесь нужен для тренировки формы.') + `<div class="table-scroll"><table class="exercise-table"><thead><tr><th>Падеж</th>${lesson.tableWords.map(w => `<th lang="lt">${w}<small lang="ru">${lesson.words[w]}</small></th>`).join('')}</tr></thead><tbody>${lesson.cases.map((c,i) => `<tr><td>${i+1}. ${c.code} <span lang="lt">${c.lt}</span><small>${c.ru}</small></td>${lesson.tableWords.map(w => `<td>${input(`1.${i+1}.${w}`,`${w}: ${c.ru} / ${c.lt}`)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><label class="hint-label"><input type="checkbox" id="table-hint" ${draft.tableHint ? 'checked' : ''} ${draft.completed ? 'disabled' : ''}>При заполнении таблицы пользовалась памяткой</label>`;
  if (step === 3) html = intro('Формы в перемешанном порядке','Около 8 минут','Образуйте указанную форму. Не переписывайте всю таблицу. Проверьте, сохранена ли основа и различены ли -o, -ui, -u и -ą.') + lesson.forms.map(q => question(q,'form')).join('');
  if (step === 4) html = intro('Выберите падеж в предложении','Около 15 минут','Запишите форму и выберите падеж. Перевод помогает понять смысл; оцениваются только форма существительного и падеж.') + `<details class="hint-details"><summary>Подсказки по выбору падежа</summary><p>į + G. — направление; iš + K. — откуда; ant + K. — на поверхности; su + Įn. — вместе с кем. Matau + G. — вижу что; neturiu + K. — не имею чего; džiaugiuosi + Įn. — радуюсь чему. Получатель — N.; место — Vt.; обращение — Š. Если открыли подсказки, отметьте соответствующие ответы.</p></details>` + lesson.sentences.map(q => question(q,'sentence')).join('');
  if (step === 5) html = intro('Найдите и объясните ошибку','Около 7 минут','В каждом предложении неверна форма существительного. Запишите правильную форму, выберите падеж и коротко объясните причину. Остальные слова менять не нужно.') + lesson.corrections.map(q => question(q,'correction')).join('');
  if (step === 6) html = intro('Проверка без подсказок','Около 5 минут','Теперь отвечайте самостоятельно, не возвращаясь к памятке. Выберите падеж и запишите форму. Если всё же посмотрели подсказку, отметьте это. Сомнения тоже полезно отметить.') + lesson.exit.map(q => question(q,'sentence')).join('');
  if (step === 7) {
    const total = allQuestions().length;
    html = intro(draft.completed ? 'Занятие завершено' : 'Как прошло занятие','Около 3 минут','Ответы будут проверены после отправки файла. Здесь считается заполнение, а не правильность.') + `<div class="summary"><div><strong>${count()} / ${total}</strong><span>форм заполнено</span></div><div><strong>${Math.max(1,Math.round(elapsed()/60))} мин</strong><span>страница была открыта</span></div></div><div class="reflection"><label for="felt-easy">Что было легче всего?</label><textarea class="answer-field" id="felt-easy" data-reflection="easy" ${draft.completed ? 'disabled' : ''}>${esc(draft.reflection.easy || '')}</textarea><label for="felt-hard">Что было труднее всего?</label><textarea class="answer-field" id="felt-hard" data-reflection="hard" ${draft.completed ? 'disabled' : ''}>${esc(draft.reflection.hard || '')}</textarea><label for="fatigue">Усталость после занятия</label><select id="fatigue" class="case-field" data-reflection="fatigue" ${draft.completed ? 'disabled' : ''}><option value="">Выберите</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${String(draft.reflection.fatigue) === String(n) ? 'selected' : ''}>${n}${n===1?' — почти не устала':n===5?' — очень устала':''}</option>`).join('')}</select></div><p style="margin-top:22px">Скачайте файл ответов и отправьте его в чат для проверки. В нём сохранятся тема, каждый ответ, отметки о подсказках и ваши заметки.</p><div class="finished-actions">${draft.completed ? '<button id="download">Скачать ответы</button><button id="new-attempt" class="secondary">Новая попытка</button>' : '<button id="finish">Завершить и скачать ответы</button><button id="download-draft" class="secondary">Скачать черновик</button>'}</div>`;
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
  return {schemaVersion:1,attemptId:draft.attemptId,lesson:{id:lesson.id,version:lesson.version,title:lesson.title,topic:'Регулярные существительные на -as в единственном числе',week:lesson.week,day:lesson.day},status:completed?'completed':'draft',startedAt:draft.startedAt,completedAt:completed?new Date().toISOString():null,exportedAt:new Date().toISOString(),elapsedSeconds:elapsed(),durationNote:'Время открытой страницы, включая возможные паузы; не показатель скорости.',cases:lesson.cases.map(({code,lt,ru})=>({code,lt,ru})),answers:allQuestions().map(q=>({id:q.id,section:q.section,prompt:q.prompt,word:q.word||null,requestedCase:q.requestedCase||null,value:value(q.id),selectedCase:draft.answers[q.id]?.case||null,hintUsed:!!(draft.answers[q.id]?.hintUsed || q.section==='table'&&draft.tableHint),uncertain:!!draft.answers[q.id]?.uncertain,reason:draft.answers[q.id]?.reason||null})),reflection:{...draft.reflection},filledForms:count(),totalForms:allQuestions().length,evaluation:null};
}
function download(data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));
  const link = document.createElement('a'); link.href=url; link.download=`${data.lesson.id}_${data.startedAt.slice(0,10)}_${data.attemptId.slice(-6)}${data.status==='draft'?'_draft':''}.json`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function switchLesson(id) {
  if (lesson && !draft.completed) save();
  lesson=lessons.find(l=>l.id===id); openedAt=Date.now();
  const fresh = {attemptId:crypto.randomUUID(),startedAt:new Date().toISOString(),elapsedMs:0,answers:{},reflection:{},step:0,completed:false};
  draft=readStorage(key(),fresh);
  if (!draft || typeof draft.answers!=='object' || !draft.reflection || !Number.isFinite(draft.elapsedMs)) { storageBlocked=true; draft=fresh; showError('Черновик имеет неизвестный формат. Автосохранение отключено, чтобы не перезаписать старые данные. Можно скачать новые ответы.'); }
  step=Number.isInteger(draft.step)&&draft.step>=0&&draft.step<names.length?draft.step:0;
  $('lesson-title').textContent=lesson.title; $('lesson-subtitle').textContent=lesson.subtitle;
  $('lesson-meta').textContent=`НЕДЕЛЯ ${lesson.week} · ${lesson.day.toLocaleUpperCase('ru-RU')}`;
  $('lesson-picker').value=id;
  render(); if (!draft.completed) save();
}
function go(to) { save(); step=to; render(); save(); $('step-title').focus(); $('main').scrollIntoView({behavior:'auto',block:'start'}); }
function record(event) {
  if (draft.completed) return;
  const el=event.target;
  if (el.dataset.id) { draft.answers[el.dataset.id] ||= {}; draft.answers[el.dataset.id][el.dataset.field] = el.type==='checkbox'?el.checked:el.value; }
  else if(el.dataset.reflection) draft.reflection[el.dataset.reflection]=el.value;
  else if(el.id==='table-hint') draft.tableHint=el.checked;
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
    const incomplete=allQuestions().filter(q=>!value(q.id).trim() || ['sentences','corrections','exit'].includes(q.section)&&!draft.answers[q.id]?.case).length;
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
