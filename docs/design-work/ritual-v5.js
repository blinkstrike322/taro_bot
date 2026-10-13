const SPREADS={
  "daily": {
    "id": "daily",
    "name": "карта дня",
    "aliases": [
      "день",
      "daily",
      "дневная",
      "карта"
    ],
    "cmd": "taro daily",
    "count": 1,
    "layout": "column1",
    "needsQuestion": false,
    "flipOrder": [
      "p1"
    ],
    "positions": [
      {
        "key": "p1",
        "name": "энергия дня",
        "desc": "главный сигнал сегодняшнего дня"
      }
    ],
    "about": "одна карта — сигнал на весь день"
  },
  "single": {
    "id": "single",
    "name": "одна карта",
    "aliases": [
      "одна",
      "one",
      "ask1"
    ],
    "cmd": "taro ask1",
    "count": 1,
    "layout": "column1",
    "needsQuestion": true,
    "flipOrder": [
      "p1"
    ],
    "positions": [
      {
        "key": "p1",
        "name": "суть ответа",
        "desc": "прямой ответ на вопрос"
      }
    ],
    "about": "точечный ответ на конкретный вопрос"
  },
  "yesno": {
    "id": "yesno",
    "name": "да / нет",
    "aliases": [
      "данет",
      "да-нет",
      "yesno"
    ],
    "cmd": "taro yesno",
    "count": 3,
    "layout": "trio",
    "needsQuestion": true,
    "flipOrder": [
      "p1",
      "p2",
      "p3"
    ],
    "positions": [
      {
        "key": "p1",
        "name": "за",
        "desc": "что говорит «да»"
      },
      {
        "key": "p2",
        "name": "против",
        "desc": "что говорит «нет»"
      },
      {
        "key": "p3",
        "name": "совет",
        "desc": "как поступить с этим"
      }
    ],
    "about": "вердикт: за · против · совет"
  },
  "three": {
    "id": "three",
    "name": "три карты",
    "aliases": [
      "три",
      "ask",
      "спроси"
    ],
    "cmd": "taro ask",
    "count": 3,
    "layout": "pyramid",
    "needsQuestion": false,
    "flipOrder": [
      "p1",
      "p2",
      "p3"
    ],
    "positions": [
      {
        "key": "p1",
        "name": "позиция 1",
        "desc": "вычисляется по вопросу"
      },
      {
        "key": "p2",
        "name": "позиция 2",
        "desc": "вычисляется по вопросу"
      },
      {
        "key": "p3",
        "name": "позиция 3",
        "desc": "вычисляется по вопросу"
      }
    ],
    "about": "динамический расклад — позиции подстраиваются под вопрос"
  },
  "mfd": {
    "id": "mfd",
    "name": "мысли · чувства · действия",
    "aliases": [
      "чувства",
      "мчд",
      "mfd"
    ],
    "cmd": "taro mfd",
    "count": 3,
    "layout": "trio",
    "needsQuestion": true,
    "flipOrder": [
      "p1",
      "p2",
      "p3"
    ],
    "positions": [
      {
        "key": "p1",
        "name": "мысли",
        "desc": "что этот человек думает — вслух и про себя"
      },
      {
        "key": "p2",
        "name": "чувства",
        "desc": "что он чувствует на самом деле, под словами"
      },
      {
        "key": "p3",
        "name": "действия",
        "desc": "как это выйдет наружу — что он будет делать"
      }
    ],
    "about": "что он думает · чувствует · сделает"
  },
  "shadow": {
    "id": "shadow",
    "name": "тень",
    "aliases": [
      "тень-расклад",
      "shadow-work",
      "shadow"
    ],
    "cmd": "taro shadow",
    "count": 6,
    "layout": "spine",
    "needsQuestion": false,
    "flipOrder": [
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6"
    ],
    "positions": [
      {
        "key": "p1",
        "name": "что я скрываю",
        "desc": "что во мне прячется за этой темой"
      },
      {
        "key": "p2",
        "name": "почему я это скрываю",
        "desc": "где и когда прятать стало безопаснее"
      },
      {
        "key": "p3",
        "name": "что скрывание защищает",
        "desc": "какую выгоду оно всё ещё даёт"
      },
      {
        "key": "p4",
        "name": "что оно стоит",
        "desc": "цена в энергии, честности, отношениях"
      },
      {
        "key": "p5",
        "name": "путь интеграции",
        "desc": "какое внутреннее разрешение вернёт это к свету"
      },
      {
        "key": "p6",
        "name": "следующий шаг",
        "desc": "одно маленькое конкретное действие на неделю"
      }
    ],
    "about": "шесть карт вглубь: от скрытого — к шагу"
  },
  "pentagram": {
    "id": "pentagram",
    "name": "пентаграмма",
    "aliases": [
      "пента",
      "пентаграмма",
      "pent"
    ],
    "cmd": "taro pentagram",
    "count": 6,
    "layout": "pentagram",
    "needsQuestion": true,
    "flipOrder": [
      "earth",
      "air",
      "water",
      "fire",
      "spirit",
      "center"
    ],
    "positions": [
      {
        "key": "center",
        "name": "сигнификатор",
        "desc": "суть ситуации; кто ты в ней"
      },
      {
        "key": "spirit",
        "name": "дух",
        "desc": "сквозная линия, объединяющая все элементы"
      },
      {
        "key": "fire",
        "name": "огонь",
        "desc": "воля, импульс, что рвётся вперёд"
      },
      {
        "key": "water",
        "name": "вода",
        "desc": "чувства, интуиция, невысказанное"
      },
      {
        "key": "earth",
        "name": "земля",
        "desc": "тело, деньги, дом, опора"
      },
      {
        "key": "air",
        "name": "воздух",
        "desc": "мысль, слово, ясность"
      }
    ],
    "about": "пять стихий вокруг сигнификатора"
  },
  "horseshoe": {
    "id": "horseshoe",
    "name": "подкова",
    "aliases": [
      "подкова",
      "shoe",
      "horseshoe"
    ],
    "cmd": "taro horseshoe",
    "count": 7,
    "layout": "arc",
    "needsQuestion": true,
    "flipOrder": [
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7"
    ],
    "positions": [
      {
        "key": "p1",
        "name": "ситуация",
        "desc": "что происходит сейчас, на чём стоишь"
      },
      {
        "key": "p2",
        "name": "скрытое",
        "desc": "чего не видно изнутри ситуации"
      },
      {
        "key": "p3",
        "name": "препятствие",
        "desc": "что встаёт на пути"
      },
      {
        "key": "p4",
        "name": "внешнее",
        "desc": "люди и обстоятельства со стороны"
      },
      {
        "key": "p5",
        "name": "твоя позиция",
        "desc": "твой ресурс и твоя роль в этом"
      },
      {
        "key": "p6",
        "name": "чужая позиция",
        "desc": "другая сторона: что у них на уме"
      },
      {
        "key": "p7",
        "name": "исход",
        "desc": "куда ведёт текущая линия, если ничего не менять"
      }
    ],
    "about": "семь карт дугой: от ситуации — к исходу"
  }
};
const GUIDES={keeper:{name:'Хранитель Руин',accent:'#C7A369',sigil:'nav-guide',sample:'Камень помнит то, что спешка стирает. Посмотри на вопрос медленно — у него уже есть опора.',note:'Не торопи решение. Отдели то, что ты знаешь, от того, чего боишься. На этом камне можно строить.'},shadow:{name:'Странница Теней',accent:'#ADA5D3',sigil:'shadow-sigil',sample:'Тихо. Иногда ответ ещё не стал словами. Останься рядом с тем, что чувствуешь, — и дай ему очертания.',note:'Побудь с тем, что пока неясно. Тень не требует немедленного ответа: она просит заметить то, от чего ты отворачиваешься.'},spark:{name:'Искра Хаоса',accent:'#C87879',sigil:'spark-sigil',sample:'А если не идти по старому кругу? Давай посмотрим, где твой вопрос слишком тесен для тебя.',note:'Проверь привычную версию событий. Что изменится, если сделать один честный шаг вместо ещё одного красивого объяснения?'}};
const CARDS=[{id:'the-moon',name:'Луна',roman:'XVIII',text:'Луна показывает промежуток между ощущением и ясностью. Пока картина неполна, знакомые страхи могут звучать убедительнее фактов. Не требуй от себя мгновенного решения: сначала назови то, что действительно чувствуешь.'},{id:'the-hermit',name:'Отшельник',roman:'IX',text:'Отшельник предлагает вернуть себе право на собственный темп. Отойди от чужих ожиданий настолько, чтобы услышать свой ответ. Небольшой ясный шаг сейчас важнее большой уверенности.'},{id:'the-star',name:'Звезда',roman:'XVII',text:'Звезда возвращает перспективу. Ты можешь не знать весь путь, но уже различать направление. Поддержи то, что даёт тебе силы: доверие растёт из маленьких действий, повторённых без спешки.'},{id:'strength',name:'Сила',roman:'VIII',text:'Сила говорит о контакте с собой, а не о давлении. Обрати внимание, где напряжение заменило заботу. Мягкая граница может защитить тебя точнее, чем попытка всё удержать.'},{id:'temperance',name:'Умеренность',roman:'XIV',text:'Умеренность ищет меру между противоположностями. Дай двум сторонам твоего вопроса место рядом. Ответ может появиться в сочетании, которое раньше казалось невозможным.'},{id:'the-high-priestess',name:'Жрица',roman:'II',text:'Жрица оставляет пространство для того, что ещё не сказано. Не всё требует немедленного объяснения. Прислушайся к повторяющемуся ощущению и проверь его спокойным наблюдением.'},{id:'the-fool',name:'Шут',roman:'0',text:'Шут приглашает к началу без обещания полной безопасности. Любопытство не отменяет осторожности. Выбери небольшой опыт, который позволит узнать больше, не отдавая всё сразу.'}];

CARDS.splice(2,0,CARDS.splice(CARDS.findIndex(c=>c.id==='the-fool'),1)[0]);
function geometry(id){let count=SPREADS[id].count;if(count===1)return {layout:'single',slots:[[50,47,43,0]]};if(count===3)return {layout:'trio',slots:[[19,46,25.5,-1.5],[50,45,27.5,0],[81,46,25.5,1.5]]};if(id==='shadow')return {layout:'spine',slots:[[28,17,25,0],[72,17,25,0],[28,49,25,0],[72,49,25,0],[28,81,25,0],[72,81,25,0]]};if(id==='pentagram')return {layout:'pentagram',slots:[[50,51,23,0],[50,15,18,0],[18,40,18,0],[72,82,18,0],[28,82,18,0],[82,40,18,0]]};return {layout:'arc',slots:[[12,20,19,-6],[15,53,19,-4],[28,80,19,-2],[50,89,19,0],[72,80,19,2],[85,53,19,4],[88,20,19,6]]}}
function diagram(id){let g=geometry(id);return `<svg viewBox="0 0 100 100" aria-hidden="true">${id==='pentagram'?'<path d="M50 15 18 40 72 82 82 40 28 82Z" fill="none" stroke="currentColor" stroke-width=".6" opacity=".4"/>':''}${g.slots.map(([x,y,w])=>`<rect x="${x-w*.28}" y="${y-w*.4}" width="${w*.56}" height="${w*.8}" rx="1" fill="none" stroke="currentColor" stroke-width="1"/>`).join('')}</svg>`}
function catalogRows(inSheet=false){return Object.values(SPREADS).map(s=>`<button class="catalog-row ${inSheet&&state.selected===s.id?'selected':''}" data-action="select-spread" data-id="${s.id}" ${inSheet&&state.selected===s.id?'aria-current="true"':''}><span class="diagram">${diagram(s.id)}</span><span><h2>${esc(title(s.name))}</h2><p>${esc(s.about)}</p><span class="count">${s.count} ${s.count===1?'карта':s.count<5?'карты':'карт'}</span></span><span class="chevron" aria-hidden="true">›</span></button>`).join('')}
function positions(s){const ps=SPREADS[s.spreadId].positions.map(p=>({...p})); if(s.spreadId==='three')ps.forEach((p,i)=>p.name=['Что привело сюда','Что происходит сейчас','Куда направить внимание'][i]); return ps;}
function guides(){let gd=GUIDES[state.guide];return `${topbar('home')}<div class="guides-content"><h1 class="guides-heading">Проводники</h1><div class="guide-focus"><h2>${esc(gd.name)}</h2><p>${esc(gd.sample)}</p></div><div class="guide-options">${Object.entries(GUIDES).map(([id,g])=>`<button class="guide-option" data-action="choose-guide" data-id="${id}" aria-pressed="${state.guide===id}" style="--local-guide:${g.accent}">${icon(g.sigil)}<strong>${g.name}</strong><span class="selection"></span></button>`).join('')}</div><p class="guide-context">Выбранный голос будет рядом в следующем чтении. Уже открытый расклад сохраняет своего проводника.</p></div>`}

// Disposable local fixtures only. No remote calls or production integration.
const KEY='arcanum-disposable-ritual-v5';
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title=value=>value.charAt(0).toUpperCase()+value.slice(1);
const icon=id=>`<svg aria-hidden="true"><use href="#${id}"></use></svg>`;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const finePointer=matchMedia('(hover:hover) and (pointer:fine)');
const freshState=()=>({version:5,guide:'keeper',draft:'',selected:'three',screen:'home',active:null,sessions:[],layers:{material:true,geometry:true,light:true,occlusion:true}});
let loaded;try{loaded=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}
let state=loaded?.version===5?loaded:freshState();
let sheetOpen=false,sheetKind=null,showOverview=false,returnFocus=null,deckTimer=null,scrollFrame=null,restoring=false,booting=true,phoneVisible=true;
const active=()=>state.sessions.find(s=>s.id===state.active);
const inSession=()=>['table','reading','deck'].includes(state.screen);
const guide=()=>GUIDES[inSession()&&active()?active().guide:state.guide];
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}};
const complete=s=>s.opened.length===SPREADS[s.spreadId].count;
const nextUnopened=s=>{const count=SPREADS[s.spreadId].count;for(let step=1;step<=count;step++){const i=((s.lastDetail??-1)+step)%count;if(!s.opened.includes(i))return i}return -1;};
const sourceFor=card=>({'the-moon':'moon-complete.v005.webp','the-hermit':'hermit-complete.v005.webp','the-fool':'fool-complete.v005.webp'}[card.id]);
function topbar(back='home'){return `<div class="topbar"><button data-action="back" data-to="${back}" aria-label="Назад">${icon('back-arrow')}</button><span class="miniword">АРКАНУМ</span><button class="close" data-action="close" aria-label="Закрыть сеанс и вернуться на главную">×</button></div>`}
function readingHeader(){return `<div class="topbar"><button data-action="return-table" aria-label="Вернуться к картам расклада">${icon('back-arrow')}</button><span class="miniword">АРКАНУМ</span><button class="close" data-action="close" aria-label="Закрыть чтение и вернуться на главную">×</button></div>`}
function cardFront(s,index,detail=false){const card=CARDS[s.cards[index]],newArt=sourceFor(card);return `<div class="card-object front${detail?' detail-card':''}"><img class="card-art" src="mockup-assets/${newArt||'cards/'+card.id+'.png'}" alt="${esc(card.roman+' — '+card.name)}" width="600" height="900" draggable="false">${newArt?'<img class="card-frame" src="mockup-assets/card-frame.v004b.png" alt="" aria-hidden="true" width="600" height="900" draggable="false">':''}</div>`}
function backCard(){return `<div class="card-object back">${icon('card-back')}</div>`}
function arrangement(s){const g=geometry(s.spreadId);return `<div class="table-space" data-layout="${g.layout}">${positions(s).map((p,i)=>{const [x,y,w,r]=g.slots[i];return `<button class="card-slot" style="--x:${x}%;--y:${y}%;--width:${w}%;--rotate:${r}deg" data-action="open-card" data-index="${i}" aria-label="${esc(title(p.name))}${s.opened.includes(i)?': '+esc(CARDS[s.cards[i]].name):', открыть карту'}">${s.opened.includes(i)?cardFront(s,i):backCard()}<span class="position-name">${esc(title(p.name))}</span></button>`}).join('')}</div>`}
function table(s){return `${topbar()}<div class="table-title"><h1>${esc(title(SPREADS[s.spreadId].name))}</h1><small>${s.daily?new Date(s.created).toLocaleDateString('ru-RU',{day:'numeric',month:'long'}):'Открой карту, которая зовёт первой'}</small></div>${arrangement(s)}<div class="table-actions"><button class="quiet" data-action="positions-sheet">Выбрать позицию</button>${s.opened.length?'<button class="quiet" data-action="continue-reading">Продолжить чтение</button>':''}</div><div class="table-question"><p>${esc(s.question||'Что во мне просит внимания сегодня?')}</p>${!s.daily?'<button class="quiet" data-action="new-question">Новый вопрос</button>':''}</div>`}
function positionBridge(s,i){const p=positions(s)[i];const three=['В том, что привело тебя сюда, эта карта предлагает заметить не только события, но и чувство, которое ты несёшь из них. Какая часть прежнего опыта всё ещё определяет твой взгляд?','В настоящем эта карта помогает отделить собственный голос от привычки отвечать на чужие ожидания. Оставь себе немного тишины, прежде чем выбирать направление.','Здесь карта говорит о направлении внимания. Попробуй маленький шаг, который даст новый опыт: он не обязан сразу становиться большим решением.'];if(s.spreadId==='three')return three[i];if(s.spreadId==='daily')return 'Сегодня посмотри, где это состояние уже проявляется в мелочах: в первом разговоре, выбранном темпе, желании согласиться или отступить. Одного честного наблюдения достаточно.';if(s.spreadId==='single')return 'Вернись к своему вопросу: какой его части эта мысль касается сильнее всего? Попробуй сформулировать ответ своими словами и проверить, какой небольшой шаг из него следует.';return `В позиции «${title(p.name)}» обрати внимание на ${p.desc.toLowerCase()}. Не переносить значение карты на всю ситуацию сразу — значит оставить место для остальных её сторон.`}
function chapter(s){const i=s.lastDetail??0,c=CARDS[s.cards[i]],p=positions(s)[i],gd=GUIDES[s.guide];return `<div class="detail-card-area">${cardFront(s,i,true)}</div><article class="detail-copy"><h1 class="position-heading" id="chapter-title" tabindex="-1">${esc(title(p.name))}</h1><div class="reading-text"><p>${esc(c.text)}</p><p class="position-bridge">${esc(positionBridge(s,i))}</p></div><div class="guide-note"><p class="guide-note-label">${icon(gd.sigil)}${esc(gd.name)}</p><p>${esc(gd.note)}</p></div>${!complete(s)?`<div class="chapter-end"><span class="end-line" aria-hidden="true"></span><button data-action="advance-card" aria-label="Открыть следующую карту: ${esc(title(positions(s)[nextUnopened(s)].name))}"><span>Продолжи вниз</span><svg viewBox="0 0 20 24" aria-hidden="true"><path d="M10 2v18m-5-5 5 5 5-5"/></svg></button></div>`:''}</article>`}
function summaryCopy(s){if(SPREADS[s.spreadId].count===1)return `<p>Заметь момент, когда ты начинаешь додумывать ответ за другого человека. Запиши отдельно то, что произошло, и то, что ты об этом предполагаешь.</p><p class="summary-takeaway">Один шаг на сегодня: уточнить один факт спокойным прямым вопросом. Затем посмотри, как изменилось твоё ощущение ситуации.</p>`;if(s.spreadId==='three')return `<p>Луна оставляет вопрос открытым, Отшельник возвращает тебе собственный темп, а Шут предлагает попробовать новое без требования заранее знать весь путь.</p><p>Эти образы соединяются в простую мысль: сначала различить чувство и догадку, затем услышать себя и только после этого сделать небольшой шаг. Неясность может остаться рядом — ей не обязательно управлять решением.</p><p class="summary-takeaway">Выбери один опыт, который можно завершить сегодня: задать вопрос, назвать границу или попробовать то, что давно откладывалось. Оцени его по тому, что он прояснил.</p>`;return `<p>Вопрос собирается из разных сторон: неясность просит внимания, собственный темп возвращает опору, а возможность нового шага появляется там, где не нужно заранее обещать себе весь результат.</p><p>Посмотри на различия между позициями. Где нужна проверка фактов, где — бережная граница, а где уже достаточно ясности, чтобы действовать? Одна карта не отменяет другую: вместе они дают более объёмный взгляд.</p><p class="summary-takeaway">Сформулируй одно наблюдение о себе и один выполнимый шаг. Вернись к ним после действия — так смысл расклада соединится с твоим опытом.</p>`}
function summarySection(s){const single=SPREADS[s.spreadId].count===1;return `<section id="summary" class="inline-summary" aria-labelledby="summary-title">${single?'':`<div class="compact-tableau" aria-label="Открытые карты расклада">${positions(s).map((p,i)=>`<button data-action="open-card" data-index="${i}" aria-label="${esc(title(p.name)+': '+CARDS[s.cards[i]].name)}">${cardFront(s,i)}</button>`).join('')}</div>`}<h2 id="summary-title">${single?'На что обратить внимание':'Нить расклада'}</h2><p class="synthesis-question">${esc(s.question||'Что во мне просит внимания сегодня?')}</p><div class="reading-text">${summaryCopy(s)}</div></section><section id="discussion" class="discussion-composer" aria-labelledby="discussion-title"><h2 id="discussion-title">Обсудить ${s.daily?'карту':'расклад'}</h2><div id="messages">${messages(s)}</div><form id="discussion-form"><textarea id="followup-input" placeholder="Что хочется понять глубже?" aria-label="Вопрос о раскладе">${esc(s.followupDraft||'')}</textarea><button class="primary" type="submit">Продолжить разговор ${icon('arrow')}</button></form></section>`}
function messages(s){const gd=GUIDES[s.guide];return (s.discussion||[]).map(m=>`<div class="message ${m.role}">${m.role==='reply'?`<span class="message-name">${esc(gd.name)}</span>`:''}${esc(m.text)}</div>`).join('')}
function journal(){return `${topbar()}<div class="journal-content"><h1>Журнал</h1>${state.sessions.length?state.sessions.slice().reverse().map(s=>`<button class="journal-row" data-action="restore-session" data-id="${s.id}"><time>${new Date(s.created).toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}</time><h2>${esc(title(SPREADS[s.spreadId].name))}</h2><p>${esc(s.question||'Что во мне просит внимания сегодня?')}</p><div class="journal-progress">${complete(s)?'Все карты открыты':'Открыто '+s.opened.length+' из '+SPREADS[s.spreadId].count}</div></button>`).join(''):`<div class="empty">${icon('nav-journal')}<h2>Здесь останется твой путь</h2><p>Начни с вопроса, к которому<br>хочется вернуться.</p><button class="primary" data-action="question">Задать вопрос</button></div>`}</div>`}
function paintScene(){const phone=$('#phone');phone.dataset.screen=state.screen;phone.style.setProperty('--guide',guide().accent);document.documentElement.style.setProperty('--guide',GUIDES[state.guide].accent);Object.entries(state.layers).forEach(([l,on])=>{phone.classList.toggle('without-'+l,!on);$(`[data-layer="${l}"]`)?.setAttribute('aria-pressed',String(on))});if(state.screen==='reading')resetParallax()}
function paintNav(){const resting=['home','catalog','journal','guides'].includes(state.screen);$('#nav').hidden=!resting;$('#nav').innerHTML=resting?[['home','Главная','sigil'],['catalog','Расклады','nav-cards'],['journal','Журнал','nav-journal'],['guides','Проводники','nav-guide']].map(([id,name,glyph])=>`<button data-action="navigate" data-to="${id}" ${state.screen===id?'aria-current="page"':''}>${icon(glyph)}${name}</button>`).join(''):'';$('#card-dots').hidden=state.screen!=='reading'}
function paintBoard(){document.querySelectorAll('[data-preview]').forEach(b=>b.classList.toggle('current',b.dataset.preview===state.screen));$('#session-count').textContent=state.sessions.length+' '+(state.sessions.length===1?'сеанс':state.sessions.length>1&&state.sessions.length<5?'сеанса':'сеансов')}
function render(){let s=active();if(inSession()&&!s)state.screen='home';paintScene();let html='';switch(state.screen){case 'home':html=`<div class="wordmark">АРКАНУМ</div><div class="home-content"><div class="home-actions"><p class="home-caption">Иногда ответ приходит<br>не в словах, а в образах.</p><button class="primary" data-action="question">${icon('sigil')}Задать вопрос ${icon('arrow')}</button><button class="quiet" data-action="daily">Карта дня</button></div></div>`;break;case 'question':html=`${topbar()}<div class="question-content"><h1>Что тебя занимает?</h1><p class="invitation">Оставь здесь то, что просит внимания.</p><textarea id="question-input" class="question-input" aria-label="Твой вопрос" placeholder="Напиши свой вопрос…">${esc(state.draft)}</textarea></div><div class="question-footer"><p class="error" id="question-error" hidden></p><button class="spread-change" data-action="spread-sheet"><strong>${esc(title(SPREADS[state.selected].name))}</strong><span>изменить</span></button><button class="primary" data-action="draw">Разложить карты ${icon('arrow')}</button></div>`;break;case 'deck':html=`<div class="deck-content"><div class="deck-stack">${backCard()}</div></div>`;break;case 'table':html=table(s);break;case 'reading':html=`<div class="reading-surface">${readingHeader()}<div id="chapter" class="chapter" data-index="${s.lastDetail}">${chapter(s)}</div><div id="continuation">${complete(s)?summarySection(s):''}</div></div>`;break;case 'catalog':html=`${topbar()}<div class="catalog-content"><h1>Расклады</h1>${catalogRows()}</div>`;break;case 'journal':html=journal();break;case 'guides':html=guides();break;default:state.screen='home';return render();}
$('#screen').innerHTML=html;$('#screen').scrollTop=0;paintNav();paintBoard();updateDots();syncInert();save()}
function elementY(el){const sc=$('#screen');return el.getBoundingClientRect().top-sc.getBoundingClientRect().top+sc.scrollTop}
function currentPlace(){if(state.screen!=='reading'||!$('#chapter'))return null;let anchor='chapter';for(const id of ['summary','discussion']){const el=$('#'+id);if(el&&elementY(el)<=$('#screen').scrollTop+60)anchor=id}return {anchor,offset:Math.max(0,$('#screen').scrollTop-(anchor==='chapter'?0:elementY($('#'+anchor))))};}
function rememberReading(){if(restoring||state.screen!=='reading'||!active())return;const s=active(),place=currentPlace();if(!place)return;s.place=place;s.lastView='reading';if(place.anchor==='chapter'){s.chapterPlaces||={};s.chapterPlaces[s.lastDetail]=place}save()}
function restorePlace(place){if(!place)return;const el=$('#'+place.anchor);if(!el)return;restoring=true;$('#screen').scrollTop=Math.max(0,(place.anchor==='chapter'?0:elementY(el))+(place.offset||0));requestAnimationFrame(()=>{restoring=false;updateDots()})}
function updateDots(){
  const rail=$('#card-dots'),s=active();if(state.screen!=='reading'||!s)return;
  const summary=$('#summary');rail.classList.toggle('reading-continuation',!!summary&&elementY(summary)-$('#screen').scrollTop<120);
  const key=[s.id,s.lastDetail,s.opened.join(',')].join('|');if(rail.dataset.key===key)return;rail.dataset.key=key;
  rail.innerHTML=positions(s).map((p,i)=>`<button class="card-dot ${s.opened.includes(i)?'opened':''}" data-action="open-card" data-index="${i}" ${s.lastDetail===i?'aria-current="step"':''} aria-label="Карта ${i+1} из ${SPREADS[s.spreadId].count}: ${esc(title(p.name))}, ${s.opened.includes(i)?'открыта':'открыть'}"><span aria-hidden="true"></span></button>`).join('');
}
function syncInert(){const blocked=booting||sheetOpen;$('#screen').inert=blocked;$('#nav').inert=blocked;$('#card-dots').inert=blocked}
function go(screen){resetReadingGesture();rememberReading();if(deckTimer){clearTimeout(deckTimer);deckTimer=null}closeSheet(false);state.screen=screen;if(active()&&screen==='table')active().lastView='table';render()}
function startQuestion(id=state.selected){state.selected=id;go('question')}
function newSession(id,question,daily=null){return {id:'s'+Date.now()+'-'+Math.random().toString(36).slice(2,5),spreadId:id,question,guide:state.guide,cards:Array.from({length:SPREADS[id].count},(_,i)=>i),opened:[],lastDetail:0,lastView:'table',created:new Date().toISOString(),daily,discussion:[],chapterPlaces:{},place:{anchor:'chapter',offset:0}}}
function draw(daily=false){if(state.screen==='deck')return;const id=daily?'daily':state.selected;if(!daily&&!state.draft.trim()&&SPREADS[id].needsQuestion){const e=$('#question-error');e.hidden=false;e.textContent='Сформулируй вопрос перед раскладом.';$('#question-input').focus();return}const today=new Date().toLocaleDateString('en-CA');if(daily){const existing=state.sessions.find(s=>s.daily===today);if(existing){restore(existing.id);return}}const s=newSession(id,daily?'':state.draft.trim(),daily?today:null);state.sessions.push(s);state.active=s.id;go('deck');deckTimer=setTimeout(()=>{deckTimer=null;go('table')},reduced.matches?0:600)}
function openCard(index){resetReadingGesture();const s=active();if(!s||index<0||index>=SPREADS[s.spreadId].count)return;rememberReading();const oldPlace=s.place;if(state.screen==='reading'&&['summary','discussion'].includes(oldPlace?.anchor))s.returnSummary={...oldPlace};const prior=s.opened.includes(index);if(!prior)s.opened.push(index);s.lastDetail=index;s.lastView='reading';closeSheet(false);const place=prior?s.chapterPlaces?.[index]||{anchor:'chapter',offset:0}:{anchor:'chapter',offset:0};if(state.screen!=='reading'){state.screen='reading';render()}else{$('#chapter').innerHTML=chapter(s);$('#chapter').dataset.index=index;$('#chapter').classList.remove('changed','from-below');if(!reduced.matches){void $('#chapter').offsetWidth;$('#chapter').classList.add('changed')}if(complete(s)&&!$('#summary'))$('#continuation').innerHTML=summarySection(s);paintScene();paintBoard();updateDots();syncInert()}s.place=place;restorePlace(place);save();$('#chapter-title')?.focus({preventScroll:true})}
function restore(id){resetReadingGesture();rememberReading();state.active=id;const s=active();if(!s)return;closeSheet(false);state.screen=s.lastView==='reading'?'reading':'table';render();if(state.screen==='reading')restorePlace(s.place||s.chapterPlaces?.[s.lastDetail]);save()}
function jumpTo(anchor,focus=false){const s=active(),el=$('#'+anchor);if(!el)return;let offset=0;if(anchor==='summary'&&s.returnSummary){const place=s.returnSummary;s.returnSummary=null;const target=$('#'+place.anchor);if(target){$('#screen').scrollTo({top:elementY(target)+place.offset,behavior:reduced.matches?'auto':'smooth'});save();return}}$('#screen').scrollTo({top:Math.max(0,elementY(el)-18+offset),behavior:reduced.matches?'auto':'smooth'});if(focus)$('#followup-input')?.focus({preventScroll:true})}
function positionsSheet(){const s=active();return `<div class="sheet-head"><h2>Позиции расклада</h2><button data-action="close-sheet" aria-label="Закрыть позиции">×</button></div>${positions(s).map((p,i)=>`<button class="position-row ${s.opened.includes(i)?'opened':''}" data-action="open-card" data-index="${i}" ${s.lastDetail===i&&state.screen==='reading'?'aria-current="true"':''}><span class="status-dot" aria-hidden="true"></span><span><strong>${esc(title(p.name))}</strong><small>${s.opened.includes(i)?esc(CARDS[s.cards[i]].name):esc(p.desc)}</small></span><span class="status-word">${s.opened.includes(i)?'Открыта':'Открыть'}</span></button>`).join('')}<button class="overview-toggle" data-action="toggle-overview" aria-expanded="${showOverview}">${showOverview?'Скрыть расположение':'Весь расклад'}</button>${showOverview?`<div class="sheet-overview">${arrangement(s)}</div>`:''}`}
function renderSheet(){if(!sheetOpen){$('#overlay-root').innerHTML='';syncInert();return}$('#overlay-root').innerHTML=`<div class="overlay" id="sheet-overlay"><section class="sheet" role="dialog" aria-modal="true" aria-label="${sheetKind==='positions'?'Позиции расклада':'Выбор расклада'}">${sheetKind==='positions'?positionsSheet():`<div class="sheet-head"><h2>Как посмотреть на вопрос?</h2><button data-action="close-sheet" aria-label="Закрыть выбор расклада">×</button></div>${catalogRows(true)}`}</section></div>`;syncInert()}
function openSheet(kind,button){rememberReading();returnFocus=button||document.activeElement;sheetOpen=true;sheetKind=kind;showOverview=false;renderSheet();$('#overlay-root [data-action="close-sheet"]')?.focus({preventScroll:true})}
function closeSheet(focus=true){if(!sheetOpen)return;sheetOpen=false;sheetKind=null;showOverview=false;renderSheet();if(focus&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});returnFocus=null}
function preview(screen){if(screen==='question'){startQuestion();return}if(['home','catalog','journal','guides'].includes(screen)){go(screen);return}if(!active()){const s=newSession('three','Как услышать себя в момент перемен?');state.sessions.push(s);state.active=s.id}if(screen==='table'){go('table');return}if(screen==='reading'){openCard(active().lastDetail||0);return}if(['summary','discussion'].includes(screen)){const s=active();s.opened=positions(s).map((_,i)=>i);s.lastDetail=s.lastDetail??0;state.screen='reading';render();jumpTo(screen);save()}}
function resetParallax(){$('#scene').style.setProperty('--px',0);$('#scene').style.setProperty('--py',0)}
function setActivity(){const inactive=document.hidden||!phoneVisible;$('#phone').toggleAttribute('data-inactive',inactive);if(inactive)resetParallax()}


// The quiet rail is functional, not decoration. Gestures have button/keyboard equivalents.
let readingGesture=null,gestureUntil=0,wheelLast=0,wheelEligible=false,wheelDistance=0,suppressWheelUntil=0;
const readingViewport=$('#screen');
const atReadingEnd=()=>readingViewport.scrollHeight-readingViewport.clientHeight-readingViewport.scrollTop<=6;
const readingCanAdvance=()=>!booting&&!sheetOpen&&state.screen==='reading'&&active()&&!complete(active())&&Date.now()>=gestureUntil;
const gestureExcluded=target=>!!target.closest('button,textarea,input,select,a,[contenteditable]');
function resetReadingGesture(){readingGesture=null;wheelEligible=false;wheelDistance=0;gestureUntil=Date.now()+650;$('#phone')?.classList.remove('gesture-ready')}
function advanceCard(){if(state.screen!=='reading'||!active())return;const next=nextUnopened(active());if(next<0)return;openCard(next);$('#chapter').classList.add('from-below')}
function returnToTable(){if(state.screen!=='reading')return;const index=active().lastDetail;go('table');$(`#screen .card-slot[data-index="${index}"]`)?.focus({preventScroll:true})}
readingViewport.addEventListener('pointerdown',event=>{
  if(state.screen!=='reading'||booting||sheetOpen||gestureExcluded(event.target)||!event.isPrimary||event.button>0)return;
  if(event.pointerType==='mouse'&&!event.target.closest('.detail-card-area'))return;
  readingGesture={id:event.pointerId,x:event.clientX,y:event.clientY,startedAtEnd:atReadingEnd()&&readingCanAdvance(),time:Date.now(),left:false};
},{passive:true});
readingViewport.addEventListener('pointermove',event=>{
  const g=readingGesture;if(!g||g.id!==event.pointerId)return;
  const dx=event.clientX-g.x,dy=event.clientY-g.y;
  if(dx<-24&&Math.abs(dx)>Math.abs(dy)*1.6){g.left=true;if(event.cancelable)event.preventDefault()}
  if(g.startedAtEnd&&dy<-24&&Math.abs(dy)>Math.abs(dx)*1.6)$('#phone').classList.add('gesture-ready');
},{passive:false});
readingViewport.addEventListener('pointerup',event=>{
  const g=readingGesture;readingGesture=null;$('#phone').classList.remove('gesture-ready');if(!g||g.id!==event.pointerId||state.screen!=='reading')return;
  const dx=event.clientX-g.x,dy=event.clientY-g.y;
  if(dx<-64&&Math.abs(dx)>Math.abs(dy)*1.6&&Date.now()-g.time<1800){returnToTable();return}
  if(g.startedAtEnd&&atReadingEnd()&&dy<-64&&Math.abs(dy)>Math.abs(dx)*1.6&&Date.now()-g.time<1800&&readingCanAdvance())advanceCard();
},{passive:true});
readingViewport.addEventListener('pointercancel',()=>{readingGesture=null;$('#phone').classList.remove('gesture-ready')},{passive:true});
// Touch vertical panning is browser-owned and may cancel pointer events. Track only a
// fresh touch begun at the boundary; never prevent ordinary text scrolling.
let endTouch=null;
readingViewport.addEventListener('touchstart',event=>{
  endTouch=null;if(event.touches.length!==1||gestureExcluded(event.target)||!readingCanAdvance()||!atReadingEnd())return;
  const t=event.touches[0];endTouch={x:t.clientX,y:t.clientY,time:Date.now()};
},{passive:true});
readingViewport.addEventListener('touchend',event=>{
  const g=endTouch;endTouch=null;if(!g||event.changedTouches.length!==1||!readingCanAdvance()||!atReadingEnd())return;
  const t=event.changedTouches[0],dx=t.clientX-g.x,dy=t.clientY-g.y;
  if(dy<-64&&Math.abs(dy)>Math.abs(dx)*1.6&&Date.now()-g.time<1800)advanceCard();
},{passive:true});
readingViewport.addEventListener('touchcancel',()=>{endTouch=null},{passive:true});
readingViewport.addEventListener('wheel',event=>{
  if(state.screen!=='reading'||sheetOpen||booting||gestureExcluded(event.target)||event.ctrlKey)return;
  const now=Date.now(),newGesture=now-wheelLast>240;wheelLast=now;
  if(newGesture){wheelEligible=atReadingEnd()&&readingCanAdvance();wheelDistance=0;suppressWheelUntil=0}
  if(now<suppressWheelUntil){if(event.cancelable)event.preventDefault();return}
  if(!wheelEligible||!atReadingEnd()||!readingCanAdvance()||event.deltaY<=0||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
  if(event.cancelable)event.preventDefault();
  wheelDistance+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?readingViewport.clientHeight:1);
  if(wheelDistance>=90){wheelEligible=false;advanceCard();suppressWheelUntil=now+900}
},{passive:false});
readingViewport.addEventListener('keydown',event=>{
  if(state.screen!=='reading'||sheetOpen||gestureExcluded(event.target))return;
  if(event.key==='ArrowLeft'&&event.altKey){event.preventDefault();returnToTable()}
  if((event.key==='PageDown'||event.key==='ArrowDown')&&atReadingEnd()&&readingCanAdvance()){event.preventDefault();advanceCard()}
});

// A new deliberate gesture at the end may reveal one next card. Native reading scroll never does.
document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b){if(event.target.id==='sheet-overlay')closeSheet();return}if(b.dataset.layer){const l=b.dataset.layer;state.layers[l]=!state.layers[l];paintScene();save();return}if(b.id==='depth-toggle'){const expanded=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(expanded));b.textContent=expanded?'Собрать сцену':'Показать планы';$('#depth-study').classList.toggle('exploded',expanded);return}if(b.dataset.preview){preview(b.dataset.preview);return}if(b.id==='reset-prototype'){closeSheet(false);if(deckTimer)clearTimeout(deckTimer);const oldGuide=state.guide;state=freshState();state.guide=oldGuide;render();return}if(booting)return;switch(b.dataset.action){case 'navigate':go(b.dataset.to);break;case 'close':go('home');break;case 'return-table':returnToTable();break;case 'advance-card':advanceCard();break;case 'back':go(b.dataset.to||'home');break;case 'question':startQuestion();break;case 'daily':draw(true);break;case 'draw':draw();break;case 'spread-sheet':openSheet('spread',b);break;case 'positions-sheet':openSheet('positions',b);break;case 'close-sheet':closeSheet();break;case 'select-spread':if(sheetOpen){state.selected=b.dataset.id;closeSheet(false);render();$('.spread-change')?.focus({preventScroll:true})}else if(b.dataset.id==='daily')draw(true);else startQuestion(b.dataset.id);break;case 'open-card':case 'next-card':openCard(Number(b.dataset.index));break;case 'summary':jumpTo('summary');break;case 'discussion':jumpTo('discussion',true);break;case 'continue-reading':openCard(active().lastDetail);break;case 'new-question':state.draft=active().question;startQuestion(active().spreadId);break;case 'restore-session':restore(b.dataset.id);break;case 'choose-guide':state.guide=b.dataset.id;render();break;case 'toggle-overview':showOverview=!showOverview;renderSheet();$('#overlay-root [data-action="toggle-overview"]')?.focus({preventScroll:true});break;}});
document.addEventListener('input',event=>{if(event.target.id==='question-input'){state.draft=event.target.value;save();$('#question-error').hidden=true}if(event.target.id==='followup-input'&&active()){active().followupDraft=event.target.value;save()}});
document.addEventListener('submit',event=>{if(event.target.id!=='discussion-form')return;event.preventDefault();const s=active(),text=$('#followup-input').value.trim();if(!text)return;s.discussion.push({role:'user',text},{role:'reply',text:s.guide==='shadow'?'Попробуй назвать чувство без объяснения его причины. Где оно ощущается? Рядом с этим чувством может быть потребность, которой ты ещё не дала места.':s.guide==='spark'?'Выбери один факт, который можно проверить сегодня. Не всю историю сразу. Что ты спросишь прямо, если на минуту перестанешь угадывать чужой ответ?':'Начни с устойчивого: запиши, что тебе уже известно. Рядом оставь место для того, что ещё требует разговора. Один спокойный вопрос может дать больше опоры, чем долгие догадки.'});s.followupDraft='';$('#messages').innerHTML=messages(s);$('#followup-input').value='';$('#followup-input').blur();save();requestAnimationFrame(()=>{$('#messages').lastElementChild?.scrollIntoView({block:'nearest',behavior:reduced.matches?'auto':'smooth'})})});
$('#screen').addEventListener('scroll',()=>{if(scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=null;rememberReading();updateDots()})},{passive:true});
document.addEventListener('focusin',event=>{if(event.target.id==='followup-input')$('#phone').classList.add('composing')});
document.addEventListener('focusout',event=>{if(event.target.id==='followup-input')$('#phone').classList.remove('composing')});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&sheetOpen){event.preventDefault();closeSheet()}if(event.key==='Tab'&&sheetOpen){const targets=[...$('#overlay-root').querySelectorAll('button,textarea')],first=targets[0],last=targets.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});
$('#phone').addEventListener('pointermove',event=>{if(!finePointer.matches||reduced.matches||document.hidden||!phoneVisible||!['home','question','table','guides'].includes(state.screen))return;const rect=$('#phone').getBoundingClientRect();$('#scene').style.setProperty('--px',((event.clientX-rect.left)/rect.width-.5)*2);$('#scene').style.setProperty('--py',((event.clientY-rect.top)/rect.height-.5)*2)},{passive:true});
$('#phone').addEventListener('pointerleave',resetParallax,{passive:true});
document.addEventListener('visibilitychange',()=>{rememberReading();setActivity()});
window.addEventListener('pagehide',rememberReading);
new IntersectionObserver(entries=>{phoneVisible=entries[0].isIntersecting;setActivity()},{threshold:.05}).observe($('#phone'));
reduced.addEventListener('change',resetParallax);

// Restore the actual target before the entrance dissolves; this code runs once per document.
if(state.screen==='deck')state.screen='table';
if(!SPREADS[state.selected])state.selected='three';
if(!GUIDES[state.guide])state.guide='keeper';
const initialPlace=active()?.place;
render();
if(state.screen==='reading'){restorePlace(initialPlace);requestAnimationFrame(()=>restorePlace(initialPlace));document.fonts.ready.then(()=>{if(booting&&state.screen==='reading')restorePlace(initialPlace)})}
function finishIntro(){if(!booting)return;booting=false;$('#intro')?.remove();$('#phone').classList.remove('booting');syncInert()}
setTimeout(finishIntro,1000);
