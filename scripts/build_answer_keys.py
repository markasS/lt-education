"""Build reviewed, browser-side answer keys from local teaching materials."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'docs/lessons.json').read_text());out=json.loads((ROOT/'docs/answer-keys.json').read_text()) if (ROOT/'docs/answer-keys.json').exists() else {'schemaVersion':1,'keys':{}}
ends={'-as':{'sg':['as','o','ui','ą','u','e','e'],'pl':['ai','ų','ams','us','ais','uose','ai']},'-a':{'sg':['a','os','ai','ą','a','oje','a'],'pl':['os','ų','oms','as','omis','ose','os']}}
for lesson in data['lessons']:
 codes=[c['code'] for c in lesson['cases']];qs=[]
 for s in lesson['sections']:
  if s['kind']=='table':
   qs += [dict(id=f"{s['prefix']}.{i+1}.{w}",word=w,case=c,number=s['number'],model=s['model'],chooseCase=False,section=s['id']) for i,c in enumerate(s['caseCodes']) for w in s['words']]
  else:qs += [dict(q,section=s['id']) for q in s.get('questions',[])]
 if lesson['id']=='W01-AS-SG-MON':
  review=json.loads((ROOT/'results/week01/Monday_review.json').read_text());private={c['id']:dict(value=c['expected'],case=c['expectedCase'],number='sg',model='-as') for c in review['checks']}
 else:
  source=json.loads((ROOT/f"materials/week01/{lesson['id']}_key.json").read_text());assert source['version']==lesson['version'];private=source['answers']
 assert set(private)=={q['id'] for q in qs}
 answers={}
 for q in qs:
  e=private[q['id']];w=q.get('word')
  if not w:
   candidates=q.get('wordOptions') or list(lesson['words'])
   w=next(w for w in candidates if w.endswith(e['model'][1:]) and w[:-len(e['model'])+1]+ends[e['model']][e['number']][codes.index(e['case'])]==e['value'])
  assert w[:-len(e['model'])+1]+ends[e['model']][e['number']][codes.index(e['case'])]==e['value'], q['id']
  assert q.get('case',e['case'])==e['case'], q['id']
  prompt=q.get('sentence') or q.get('prompt') or w
  c=next(c for c in lesson['cases'] if c['code']==e['case']);n='множественное' if e['number']=='pl' else 'единственное'
  if not q['chooseCase']:rule=f"В задании указан {c['ru'].lower()} падеж, {n} число."
  elif q.get('panel'):
   rule={'F6.1':'В кадре A дочь получает подарок: получает что? Винительный падеж.','F6.2':'В кадре A мама даёт подарок дочери: получатель выражается дательным падежом.','F6.3':'В кадре B кот сидит на книгах. Предлог ant требует родительного; книг несколько.','F6.4':'В кадре B книги лежат на столе. После ant нужен родительный падеж.','F6.5':'В кадре C друзья идут в парк. Направление: į + винительный.','F6.6':'В кадре C друзья путешествуют с чемоданами. Su требует творительного; чемоданов несколько.','F6.7':'В кадре D дочь сидит в машине. Место выражается местным падежом.','F6.8':'В кадре D дочь радуется билетам. Džiaugtis требует творительного; билетов несколько.'}[q['id']]
  else:
   rules=[('džiaug','Džiaugtis (радоваться) требует Įn. Įnagininkas / творительного: kuo?'),('dėko','Dėkoti (благодарить) требует N. Naudininkas / дательного: kam?'),('paded','Padėti (помогать) требует N. Naudininkas / дательного: kam?'),('iešk','Ieškoti (искать) требует K. Kilmininkas / родительного: ko?'),('neturi','При отрицании turėti (иметь) объект ставится в K. Kilmininkas / родительный.'),('nėra','Отсутствие после nėra выражается K. Kilmininkas / родительным.'),(' su ','После su нужен Įn. Įnagininkas / творительный: с кем или с чем?'),(' iš ','После iš нужен K. Kilmininkas / родительный: из чего, откуда?'),(' ant ','После ant нужен K. Kilmininkas / родительный: на чём?'),(' prie ','После prie нужен K. Kilmininkas / родительный: возле чего?'),(' į ','Направление с į выражается G. Galininkas / винительным.')]
   rule=next((r for trigger,r in rules if trigger in prompt.casefold()),None)
   if not rule:rule={'V.':'Существительное называет предмет или действующее лицо: V. Vardininkas / именительный, kas?','K.':'Здесь нужен K. Kilmininkas / родительный: ko? Существительное обозначает принадлежность или зависимый предмет.','N.':'Получатель или тот, кому адресовано действие: N. Naudininkas / дательный, kam?','G.':'Объект действия: G. Galininkas / винительный, ką?','Įn.':'Средство или способ действия: Įn. Įnagininkas / творительный, kuo?','Vt.':'Место действия: Vt. Vietininkas / местный, kur?','Š.':'Обращение к собеседнику: Š. Šauksmininkas / звательный.'}[e['case']]
  ending='-'+ends[e['model']][e['number']][codes.index(e['case'])]
  answers[q['id']]=dict(e,word=w,chooseCase=q['chooseCase'],ending=ending,rule=rule,section=q['section'])
 slot=f"{lesson['id']}:v{lesson['version']}"
 prior=out['keys'].get(slot);revision=prior['revision'] if prior else 1
 if prior and prior['answers']!=answers:revision+=1
 out['keys'][slot]=dict(lessonId=lesson['id'],lessonVersion=lesson['version'],revision=revision,answers=answers)
(ROOT/'docs/answer-keys.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print('Built',sum(len(k['answers']) for k in out['keys'].values()),'reviewed answers across',len(out['keys']),'lessons.')
