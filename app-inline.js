// Vokabeltrainer – Auto-Repair Blocks + UX + Tippfehler-Diff + Lern-Hinweise (Beta)
const APP_VERSION = 'v28'; // <--- AKTUALISIERT AUF V12
const UNIT_META = [
// ... (UNIT_META bleibt unverändert) ...
// ... (Hilfsfunktionen bleiben unverändert) ...
  { id: 'u1', name: 'Unit 1' },
  { id: 'u2', name: 'Unit 2' },
  { id: 'u3', name: 'Unit 3' },
  { id: 'u4', name: 'Unit 4' },
  { id: 'u5', name: 'Unit 5' },
  { id: 'u6', name: 'Unit 6' }
];
const LS_VOCAB = 'vocab-data-v1';
const LS_STATS = 'vocab-trainer-stats-v4';
const LS_SYNC = 'vocab-central-meta';
const LS_PLAYER = 'english-coach-player-v1';
const LS_ACHIEVEMENTS =
    'english-coach-achievements-v1';
const CENTRAL_URL = './vocab/vocab.json';
const GRADE7_VOCAB_URL = './vocab/vocab_grade7.json';
const IRREGULAR_URL = './vocab/irregular_verbs_grade7.json';
const GRAMMAR_URL = './vocab/grammar_tasks.json';
const HINTS_URL = './vocab/hints.json';

const SENTENCES_URL = './vocab/sentences.json?v=28';
const BUILDER_URL =
    './vocab/sentence_builder.json';
let SENTENCES_DATA = {};
let BUILDER_DATA = [];
let IRREGULAR_DATA = [];
let GRAMMAR_DATA = [];
let grammarQueue = [];
let grammarQueueKey = '';
let grammarTestConsumed = false;
const ACHIEVEMENTS_URL =
    './vocab/achievements.json';

let ACHIEVEMENTS_DATA = {};
const CARDS_URL =
    './vocab/cards.json';

let CARDS_DATA = [];

let HINTS_DICT = {};
let deferredPrompt = null; 
let sessionTotalSize = 0; // NEU: Gesamtgröße der Session
let sessionCompleted = 0; // NEU: Bereits beantwortete Fragen (auch übersprungene)

function normalize(s){ return String(s||'').trim().toLowerCase(); }
function softNorm(s){ return normalize(s).replace(/[^a-zäöüß\-\s]/g,'').replace(/\s+/g,' ').trim(); }
function key(w){ return normalize(w.de)+'\n'+normalize(w.en); }

function answerNorm(value){
  return softNorm(value)
    .replace(/^\(to\)\s+/, '')
    .replace(/^to\s+/, '')
    .replace(/\bsth\b/g, 'something')
    .replace(/\bsb\b/g, 'somebody')
    .replace(/\bsb's\b/g, "somebody's")
    .replace(/\s+/g, ' ')
    .trim();
}

function acceptedAnswers(answer){
  const raw = String(answer || '').trim();
  const variants = new Set();

  const addVariant = value => {
    const normalized = answerNorm(value);
    if(normalized) variants.add(normalized);
  };

  addVariant(raw);
  raw.split(/\s*;\s*/).forEach(addVariant);

  return [...variants];
}

function isAcceptedAnswer(userInput, answer){
  const user = answerNorm(userInput);
  return acceptedAnswers(answer).includes(user);
}
function combineAcceptedAnswers(primary, alternatives){
  const values = [
    primary,
    ...(Array.isArray(alternatives) ? alternatives : [])
  ]
    .map(value => String(value || '').trim())
    .filter(Boolean);

  return [...new Set(values)].join('; ');
}

function displayAnswer(answer){
  return String(answer || '')
    .replace(/^\(to\)\s+/, 'to ')
    .replace(/\bsth\./g, 'something')
    .replace(/\bsb\./g, 'somebody');
}
function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }
function simpleDiffLine(a,b){
  const aa = softNorm(a), bb = softNorm(b);
  const L = Math.max(aa.length, bb.length);
  let ua = '', ub = '';
  for(let i=0;i<L;i++){
    const ca = aa[i]||''; const cb = bb[i]||'';
    if(ca===cb){ ua += ca; ub += cb; }
    else{
      ua += ca ? `<mark class="diff">${ca}</mark>` : `<mark class="diff">∅</mark>`;
      ub += cb ? `<mark class="diff">${cb}</mark>` : `<mark class="diff">∅</mark>`;
    }
  }
  return { ua, ub };
}
function aAn(word){ return /^[aeiou]/.test(word.toLowerCase()) ? 'an' : 'a'; }
function pickHint(en,de,mode){
  const base = en.toLowerCase();
  const entry = HINTS_DICT[base];
  if(!entry) return null; // kein generischer Hinweis mehr
  const { collocations=[], examples=[], note='' } = entry;
  const parts = [];
  if(collocations.length){ const c = collocations[Math.floor(Math.random()*collocations.length)]; parts.push(`Collocation: **${c}**`); }
  if(examples.length){ const ex = examples[Math.floor(Math.random()*examples.length)]; parts.push(`Beispiel: "${ex}"`); }
  if(note){ parts.push(`Hinweis: ${note}`); }
  return parts.length ? parts.join(' · ') : null;
}
const els = {};
let activeBlockIds = [], lastPrompts = [], sessionQueue = [], sentenceQueue = [], sentenceQueueKey = '', currentQ = null;
function $(id){ return document.getElementById(id); }
function ensureBlocksSection(){
  // ... (ensureBlocksSection bleibt unverändert) ...
  if($("blockChecklist") && $("currentBlocksLabel") && $("selectAllBtn") && $("clearAllBtn") && $("resetSelectedBtn") && $("resetAllBtn")) return;
  const root = document.querySelector('#app-root') || document.querySelector('main') || document.body;
  const sec = document.createElement('section'); sec.className = 'blocks';
sec.innerHTML = `
  <h2 id="blocksToggle" class="blocks-toggle">
    ⚙️ Lernbereiche ▼
  </h2>
  <div class="block-actions">
    <button id="selectAllBtn">Alle wählen</button>
    <button id="clearAllBtn">Auswahl leeren</button>
  </div>
  <div id="blockChecklist" class="checklist" aria-label="Blöcke"></div>
  <div class="stats">
    <div>Aktive Blöcke: <span id="currentBlocksLabel">–</span></div>
    <div>Richtig: <span id="statCorrect">0</span> · Falsch: <span id="statWrong">0</span></div>
    <div>Gewichtung: <span id="weightInfo">aktiv</span></div>
  </div>
  <div class="reset-actions">
    <button id="resetSelectedBtn">Aktive Blöcke zurücksetzen</button>
    <button id="resetAllBtn">Gesamte Statistik löschen</button>
  </div>`;
  root.prepend(sec);
}
function bindEls(){
  els.blockChecklist = $("blockChecklist"); els.selectAllBtn = $("selectAllBtn"); els.clearAllBtn = $("clearAllBtn");
els.presetSelect = $("presetSelect"); els.modeSelect = $("modeSelect"); els.gradeSelect = $("gradeSelect"); els.mcEnabled = $("mcEnabled");
els.sentenceDirectionSelect = $("sentenceDirectionSelect");

  els.weightedEnabled = $("weightedEnabled"); els.hintsEnabled = $("hintsEnabled");
  els.nextBtn = $("nextBtn"); els.checkBtn = $("checkBtn"); els.promptLabel = $("promptLabel"); els.exerciseType = $("exerciseType");
  els.exerciseDescription = $("exerciseDescription");
  els.promptText = $("promptText");
  els.optionsList = $("optionsList"); els.mcArea = $("mcArea"); els.feedback = $("feedback"); els.hintArea = $("hintArea");
  els.statCorrect = $("statCorrect"); els.statWrong = $("statWrong"); els.weightInfo = $("weightInfo"); els.currentBlocksLabel = $("currentBlocksLabel");
  els.resetSelectedBtn = $("resetSelectedBtn");
  els.resetAllBtn = $("resetAllBtn");
  els.installBtn = $("installBtn");
  els.exportSaveBtn =
    $("exportSaveBtn");

els.importSaveInput =
    $("importSaveInput");
  // NEUE ELEMENTE BINDEN
  els.showAnswerBtn = $("showAnswerBtn"); 
  els.sessionProgress = $("sessionProgress");
  els.achievementList =
    $("achievementList");
  els.achievementCounter =
    $("achievementCounter");
  els.cardPackCounter =
    $("cardPackCounter");
  els.openPackBtn =
    $("openPackBtn");
  els.showCollectionBtn =
    $("showCollectionBtn");

els.cardPackPopup =
    $("cardPackPopup");

els.cardResult =
    $("cardResult");
  els.closeCardPackBtn =
    $("closeCardPackBtn");
  els.collectionPopup =
    $("collectionPopup");

els.collectionContent =
    $("collectionContent");

  els.collectionCounter =
    $("collectionCounter");

els.closeCollectionBtn =
    $("closeCollectionBtn");

  els.achievementToggle =
    $("achievementToggle");

els.achievementListWrapper =
    $("achievementListWrapper");
  els.achievementPopup =
    $("achievementPopup");

els.achievementName =
    $("achievementName");

els.achievementDescription =
    $("achievementDescription");
}
function loadVocab(){ try{ return JSON.parse(localStorage.getItem(LS_VOCAB)||'{}'); }catch(e){ return {}; } }
function saveVocab(v){ localStorage.setItem(LS_VOCAB, JSON.stringify(v)); }
function loadStats(){ try{ return JSON.parse(localStorage.getItem(LS_STATS)||'{}'); }catch(e){ return {}; } }
function saveStats(s){ localStorage.setItem(LS_STATS, JSON.stringify(s)); }
function loadSync(){ try{ return JSON.parse(localStorage.getItem(LS_SYNC)||'{}'); }catch(e){ return {}; } }
function saveSync(m){
  localStorage.setItem(LS_SYNC, JSON.stringify(m)); }
function loadPlayer(){

    try{
        const player = JSON.parse(
            localStorage.getItem(LS_PLAYER) ||
            '{"xp":0,"correctAnswers":0,"cardPacks":0,"ownedCards":[]}'
        );

        player.xp = Number(player.xp) || 0;
        player.correctAnswers = Number(player.correctAnswers) || 0;
        player.cardPacks = Math.max(0, Number(player.cardPacks) || 0);
        player.ownedCards = Array.isArray(player.ownedCards)
            ? player.ownedCards
            : [];

        return player;

    }catch(e){
        return {
            xp: 0,
            correctAnswers: 0,
            cardPacks: 0,
            ownedCards: []
        };
    }
}

function savePlayer(player){

    localStorage.setItem(
        LS_PLAYER,
        JSON.stringify(player)
    );

}

function loadAchievements(){

    try{

        return JSON.parse(
            localStorage.getItem(
                LS_ACHIEVEMENTS
            ) || '{}'
        );

    }catch(e){

        return {};

    }

}

function saveAchievements(data){

    localStorage.setItem(
        LS_ACHIEVEMENTS,
        JSON.stringify(data)
    );

}
function exportSavegame(){

    const data = {

        version: APP_VERSION,

        exportedAt:
            new Date().toISOString(),

        player:
            loadPlayer(),

        achievements:
            loadAchievements(),

        stats:
            loadStats()

    };

    const blob =
        new Blob(
            [
                JSON.stringify(
                    data,
                    null,
                    2
                )
            ],
            {
                type: 'application/json'
            }
        );

    const url =
        URL.createObjectURL(
            blob
        );

    const a =
        document.createElement(
            'a'
        );

    a.href = url;

    a.download =
        'english-coach-savegame.json';

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    URL.revokeObjectURL(
        url
    );

}
function importSavegame(file){

    const reader =
        new FileReader();

    reader.onload =
        () => {

            try{

                const data =
                    JSON.parse(
                        reader.result
                    );

                if(data.player){

                    savePlayer(
                        data.player
                    );

                }

                if(data.achievements){

                    saveAchievements(
                        data.achievements
                    );

                }

                if(data.stats){

                    saveStats(
                        data.stats
                    );

                }

                updatePlayerUI();

                updateStatsUI();

                renderAchievements();

                alert(
                    'Spielstand wurde erfolgreich importiert.'
                );

            }catch(e){

                alert(
                    'Import fehlgeschlagen. Die Datei konnte nicht gelesen werden.'
                );

                console.error(
                    'Savegame Import Fehler:',
                    e
                );

            }

        };

    reader.readAsText(
        file
    );

}

    

function unlockAchievement(id){


    const unlocked =
        loadAchievements();

    if(unlocked[id])
        return;

    unlocked[id] = true;

    saveAchievements(unlocked);
  renderAchievements();


    const achievement =
        ACHIEVEMENTS_DATA[id];

    if(
        achievement &&
        els.achievementPopup
    ){

        els.achievementName.textContent =
            achievement.title;

        els.achievementDescription.textContent =
            achievement.description;

        els.achievementPopup.classList.remove(
            'hidden'
        );

    }

    console.log(
        'Achievement freigeschaltet:',
        id
    );

}
function showCollection(){

    const player =
        loadPlayer();

    const cards =
        player.ownedCards || [];

  if(
    els.collectionCounter
){

    els.collectionCounter.textContent =
        `(${cards.length}/${CARDS_DATA.length})`;

}

    if(
        !cards.length
    ){

        els.collectionContent.innerHTML =
            'Noch keine Karten gesammelt.';

    }else{

const html =
    CARDS_DATA.map(card => {

        const owned =
            cards.includes(
                card.id
            );

        if(!owned){

            return `
                <div>

                    ❔ Unbekannte Karte

                </div>

                <br>
            `;
        }

        return `
            <div
                class="rarity-${card.rarity}">

                <strong>
                    ${card.name}
                </strong>

                <br>

                <small>
                    ${card.rarity.toUpperCase()}
                </small>

            </div>

            <br>
        `;

    }).join('');

        els.collectionContent.innerHTML =
            html;

    }

    els.collectionPopup
        .classList.remove(
            'hidden'
        );

}

function openCardPack(){

    const player = loadPlayer();
    const availablePacks = Math.max(0, Number(player.cardPacks) || 0);

    if(availablePacks <= 0){
        updatePlayerUI();
        alert('Keine Kartenpacks vorhanden.');
        return;
    }

    if(!Array.isArray(CARDS_DATA) || !CARDS_DATA.length){
        alert('Die Kartendaten konnten nicht geladen werden.');
        return;
    }

    const randomCard =
        CARDS_DATA[
            Math.floor(
                Math.random() * CARDS_DATA.length
            )
        ];

    // Ein Pack wird dauerhaft verbraucht, bevor die Karte angezeigt wird.
    player.cardPacks = availablePacks - 1;

    if(!Array.isArray(player.ownedCards)){
        player.ownedCards = [];
    }

    if(!player.ownedCards.includes(randomCard.id)){
        player.ownedCards.push(randomCard.id);
    }

    savePlayer(player);
    updatePlayerUI();

    if(els.cardPackPopup && els.cardResult){
        els.cardResult.innerHTML =
        `
            <div class="rarity-${randomCard.rarity}">
                <h3>🎉 Neue Karte!</h3>
                <strong>${randomCard.name}</strong>
                <br><br>
                ${randomCard.rarity.toUpperCase()}
            </div>
        `;

        els.cardPackPopup.classList.remove('hidden');
    }
}
function renderAchievements(){

    if(!els.achievementList)
        return;

    const unlocked =
        loadAchievements();
  const unlockedCount =
    Object.keys(
        unlocked
    ).length;

const totalCount =
    Object.keys(
        ACHIEVEMENTS_DATA
    ).length;

if(
    els.achievementCounter
){
    els.achievementCounter.textContent =
        `${unlockedCount} / ${totalCount}`;
}

    els.achievementList.innerHTML = '';

    Object.entries(
        ACHIEVEMENTS_DATA
    ).forEach(([id,data]) => {

        const div =
            document.createElement(
                'div'
            );

        const isUnlocked =
            !!unlocked[id];

        div.className =
            'achievement-entry ' +
            (isUnlocked
                ? 'achievement-unlocked'
                : 'achievement-locked');

        div.textContent =
            (isUnlocked ? '✅ ' : '⬜ ') +
            data.title;

        els.achievementList.appendChild(
            div
        );

    });

}

async function fetchJSON(url){ try{ const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error('HTTP '+res.status); return await res.json(); } catch(e){ console.warn('Fetch fehlgeschlagen:', url, e); return null; } }
async function initCentralSync(){
  const central = await fetchJSON(CENTRAL_URL);
  const grade7 = await fetchJSON(GRADE7_VOCAB_URL);
  const out = {};

  if(central && central.units){
    Object.entries(central.units).forEach(([unit, list]) => {
      if(!Array.isArray(list)) return;
      out[unit] = list.map(word => ({...word, grade:6, unit}));
    });
  }

  if(Array.isArray(grade7)){
    grade7.forEach(word => {
      if(!word.unit) return;
      if(!out[word.unit]) out[word.unit] = [];
      out[word.unit].push({...word, grade:7});
    });
  }

  if(Object.keys(out).length){
    saveVocab(out);
    saveSync({
      version: central?.version || 'unknown',
      grade7Count: Array.isArray(grade7) ? grade7.length : 0
    });
  }

  const hints = await fetchJSON(HINTS_URL);
  if(hints) HINTS_DICT = hints;
  const sentences = await fetchJSON(SENTENCES_URL);
  if(sentences) SENTENCES_DATA = sentences;
  const builder = await fetchJSON(BUILDER_URL);
  if(builder) BUILDER_DATA = builder;

  const irregular = await fetchJSON(IRREGULAR_URL);
  if(Array.isArray(irregular)) IRREGULAR_DATA = irregular;
  const grammar = await fetchJSON(GRAMMAR_URL);
  if(Array.isArray(grammar)) GRAMMAR_DATA = grammar;
  const achievements = await fetchJSON(ACHIEVEMENTS_URL);
  if(achievements) ACHIEVEMENTS_DATA = achievements;
  const cards = await fetchJSON(CARDS_URL);
  if(cards) CARDS_DATA = cards;
}

function initStats(){ const stats=loadStats(); if(!stats.blocks) stats.blocks={}; if(!stats.words) stats.words={}; const vocab=loadVocab(); UNIT_META.forEach(u=>{ if(!stats.blocks[u.id]) stats.blocks[u.id]={correct:0,wrong:0}; if(!stats.words[u.id]) stats.words[u.id]={}; (vocab[u.id]||[]).forEach(w=>{ const k=key(w); if(!stats.words[u.id][k]) stats.words[u.id][k]={correct:0,wrong:0}; }); }); saveStats(stats); }
function updateStatsUI(){ els.weightInfo && (els.weightInfo.textContent = els.weightedEnabled?.checked ? 'aktiv' : 'aus'); if(!activeBlockIds.length){ els.statCorrect.textContent='0'; els.statWrong.textContent='0'; return; } const stats=loadStats(); const agg=activeBlockIds.reduce((acc,id)=>{ const s=stats.blocks[id]||{correct:0,wrong:0}; acc.correct+=s.correct; acc.wrong+=s.wrong; return acc; },{correct:0,wrong:0}); els.statCorrect.textContent=agg.correct; els.statWrong.textContent=agg.wrong; }
function record(originBlockId,item,ok){ const stats=loadStats(); const bs=stats.blocks[originBlockId]; const ws=stats.words[originBlockId][key(item)]; if(ok){ bs.correct++; ws.correct++; }else{ bs.wrong++; ws.wrong++; } saveStats(stats); updateStatsUI(); }
function resetBlock(blockId){ const stats=loadStats(); if(!stats.blocks[blockId]) return; stats.blocks[blockId]={correct:0,wrong:0}; Object.keys(stats.words[blockId]||{}).forEach(k=> stats.words[blockId][k]={correct:0,wrong:0}); saveStats(stats); updateStatsUI(); }
function resetSelected(){ 
  const confirmed = window.confirm("Möchten Sie die Statistik für die aktuell ausgewählten Blöcke wirklich zurücksetzen (Richtig/Falsch = 0)?");
  if(confirmed) { activeBlockIds.forEach(id=> resetBlock(id)); }
}
function resetAll(){ 
  const confirmed = window.confirm("ACHTUNG: Möchten Sie die gesamte Lernstatistik (alle Blöcke) wirklich löschen? Dieser Schritt kann nicht rückgängig gemacht werden.");
  if(confirmed) { UNIT_META.forEach(u=> resetBlock(u.id)); }
}
function renderChecklist(){ try{ els.blockChecklist.innerHTML=''; UNIT_META.forEach(u=>{ const stats=loadStats(); const blockStats=stats.blocks[u.id]||{correct:0,wrong:0}; const label=document.createElement('label'); const cb=document.createElement('input'); cb.type='checkbox'; cb.value=u.id; cb.checked=false; cb.addEventListener('change', syncActiveBlockIds); label.appendChild(cb); 
    // NEU: Statistische Anzeige neben dem Blocknamen (Punkt 1)
    const total = blockStats.correct + blockStats.wrong;
    const statText = total > 0 ? ` (${blockStats.wrong}/${total})` : '';
    label.appendChild(document.createTextNode(' '+u.name + statText)); 
    els.blockChecklist.appendChild(label); 
}); const first=els.blockChecklist.querySelector('input[value="u1"]'); if(first){ first.checked=true; syncActiveBlockIds(); } }catch(e){ console.error('[Blocks] renderChecklist fehlgeschlagen:', e); }}
function syncActiveBlockIds(){ grammarQueue = []; grammarQueueKey = ''; activeBlockIds = Array.from(els.blockChecklist.querySelectorAll('input[type=checkbox]:checked')).map(el=>el.value); const names = activeBlockIds.map(id=> UNIT_META.find(u=>u.id===id)?.name).filter(Boolean); els.currentBlocksLabel.textContent = names.length ? names.join(', ') : '–'; updateStatsUI(); resetSessionQueue(); els.presetSelect && (els.presetSelect.value='custom'); }
function getTestVocabId(){
  return new URLSearchParams(window.location.search).get('testVocab');
}
function findTestVocabQuestion(testId){
  if(!testId) return null;
  const vocab = loadVocab();
  for(const [unit, words] of Object.entries(vocab)){
    if(!Array.isArray(words)) continue;
    const item = words.find(word => word.id === testId);
    if(!item) continue;
    const mode = els.modeSelect ? els.modeSelect.value : 'de2en';
    const from = mode === 'en2de' ? 'en' : 'de';
    const to = mode === 'en2de' ? 'de' : 'en';
    return {origin:unit, from, to, prompt:item[from], answer:item[to], options:[item[to]], item, answered:false, isTestQuestion:true};
  }
  return null;
}
function buildPool(){
  const vocab = loadVocab();
  const selectedGrade = els.gradeSelect ? els.gradeSelect.value : 'all';
  const pool = [];
  activeBlockIds.forEach(id => {
    (vocab[id] || []).forEach(w => {
      const wordGrade = String(w.grade || 6);
      if(selectedGrade === 'all' || wordGrade === selectedGrade){
        pool.push({w, origin:id});
      }
    });
  });
  return pool;
}
function resetSessionQueue(){ 
  const base=buildPool(); 
  const weighted=[]; 
  const useW=!!els.weightedEnabled?.checked; 
  const stats=loadStats(); 
  base.forEach(({w,origin})=>{ 
      const ws=stats.words[origin]?.[key(w)]||{correct:0,wrong:0}; 
      let weight=1; 
      if(useW) weight=Math.max(1, Math.min(5, 1 + ws.wrong - Math.floor(ws.correct*0.5))); 
      for(let i=0;i<weight;i++) weighted.push({w,origin}); 
  }); 
  sessionQueue=shuffle(weighted); 
  sessionTotalSize = sessionQueue.length; // NEU: Gesamtgröße setzen
  sessionCompleted = 0; // NEU: Zähler zurücksetzen
  updateProgressUI(); // NEU: UI aktualisieren

}
  function updatePlayerUI(){

    const player = loadPlayer();
    const level = Math.floor(player.xp / 100) + 1;
    const totalPacksEarned = Math.floor(level / 5);

    /*
     * Migration für ältere Spielstände:
     * earnedCardPacks merkt sich dauerhaft, wie viele Packs insgesamt
     * bereits für erreichte Level vergeben wurden. Dadurch werden
     * geöffnete Packs nicht bei jedem UI-Update erneut gutgeschrieben.
     */
    if(!Number.isFinite(Number(player.earnedCardPacks))){
        player.earnedCardPacks = totalPacksEarned;
    }

    if(totalPacksEarned > player.earnedCardPacks){
        const newlyEarned = totalPacksEarned - player.earnedCardPacks;
        player.cardPacks = Math.max(0, Number(player.cardPacks) || 0) + newlyEarned;
        player.earnedCardPacks = totalPacksEarned;
    }

    player.cardPacks = Math.max(0, Number(player.cardPacks) || 0);
    savePlayer(player);

    if(level >= 2){
        unlockAchievement('rising_star');
    }

    const currentXP = player.xp % 100;
    const levelEl = document.querySelector('.player-level');
    const xpText = document.querySelector('.xp-text');
    const xpFill = document.querySelector('.xp-fill');

    if(levelEl){
        levelEl.textContent = `⭐ Level ${level}`;
    }

    if(xpText){
        xpText.textContent = `XP: ${currentXP} / 100`;
    }

    if(xpFill){
        xpFill.style.width = `${currentXP}%`;
    }

    if(els.cardPackCounter){
        els.cardPackCounter.textContent = player.cardPacks;
    }

    if(els.openPackBtn){
        els.openPackBtn.disabled = player.cardPacks <= 0;
        els.openPackBtn.textContent = player.cardPacks > 0
            ? `🎴 Kartenpack öffnen (${player.cardPacks})`
            : '🎴 Kein Kartenpack verfügbar';
        els.openPackBtn.setAttribute(
            'aria-disabled',
            String(player.cardPacks <= 0)
        );
    }
}
function recentlyAsked(text){ return lastPrompts.some(t=> normalize(t)===normalize(text)); }
function pushHistory(text){ lastPrompts.unshift(text); if(lastPrompts.length>2) lastPrompts.pop(); }
function getTestSentenceId(){
  return new URLSearchParams(window.location.search).get('testSentence');
}
function getTestIrregularId(){
  return new URLSearchParams(window.location.search).get('testIrregular');
}
function getTestVerbForm(){
  const form = new URLSearchParams(window.location.search).get('verbForm');
  return ['base','past','participle'].includes(form) ? form : null;
}
function makeIrregularQuestion(item, forcedForm=null){
  const forms = ['base','past','participle'];
  const target = forcedForm || forms[Math.floor(Math.random()*forms.length)];
  const labels = {
    base:'Grundform',
    past:'Simple Past',
    participle:'Past Participle'
  };
  let prompt = '';
  if(target === 'base'){
    prompt = `<strong>Deutsch:</strong><br>${item.de}<br><br><strong>Gesucht:</strong> ${labels[target]}`;
  }else{
    prompt = `<strong>Grundform:</strong><br>${item.base}<br><br><strong>Gesucht:</strong> ${labels[target]}`;
  }
  return {
    type:'irregular',
    origin:item.unit,
    from:'irregular',
    to:target,
    prompt,
    answer:item[target],
    item,
    verbForm:target,
    verbFormLabel:labels[target],
    answered:false,
    isTestQuestion:!!forcedForm || !!getTestIrregularId()
  };
}
function ensureIrregularSelection(){
  if(!IRREGULAR_DATA.length) return;

  const availableGrades = [...new Set(
    IRREGULAR_DATA.map(item => String(item.grade))
  )].sort();

  if(els.gradeSelect){
    const selectedGrade = els.gradeSelect.value;
    if(
      selectedGrade !== 'all' &&
      !availableGrades.includes(selectedGrade)
    ){
      els.gradeSelect.value = availableGrades[0];
    }
  }

  const effectiveGrade = els.gradeSelect
    ? els.gradeSelect.value
    : 'all';

  const availableUnits = [...new Set(
    IRREGULAR_DATA
      .filter(item =>
        effectiveGrade === 'all' ||
        String(item.grade) === effectiveGrade
      )
      .map(item => item.unit)
  )];

  const selectionHasTasks = activeBlockIds.some(unit =>
    availableUnits.includes(unit)
  );

  if(!selectionHasTasks && availableUnits.length && els.blockChecklist){
    els.blockChecklist
      .querySelectorAll('input[type=checkbox]')
      .forEach(cb => {
        cb.checked = cb.value === availableUnits[0];
      });
    syncActiveBlockIds();
  }
}
function pickIrregularQuestion(){
  const selectedGrade = els.gradeSelect ? els.gradeSelect.value : 'all';
  let pool = IRREGULAR_DATA.filter(item => {
    const gradeMatches =
      selectedGrade === 'all' ||
      String(item.grade) === selectedGrade;
    const unitMatches =
      !activeBlockIds.length ||
      activeBlockIds.includes(item.unit);
    return gradeMatches && unitMatches;
  });
  const testId = getTestIrregularId();
  if(testId){
    const testItem = IRREGULAR_DATA.find(item => item.id === testId);
    if(testItem) return makeIrregularQuestion(testItem, getTestVerbForm() || 'past');
  }
  if(!pool.length) return null;
  return makeIrregularQuestion(pool[Math.floor(Math.random()*pool.length)]);
}
function getTestGrammarId(){
  return new URLSearchParams(window.location.search).get('testGrammar');
}
function makeGrammarQuestion(item, isTestQuestion=false){
  const answers = [item.answer, ...(item.acceptedAnswers || [])]
    .filter(Boolean);
  return {
    type:'grammar',
    origin:item.unit,
    prompt:item.prompt,
    answer:answers.join('; '),
    options:Array.isArray(item.options) ? item.options : [],
    item,
    grammarType:item.type,
    instruction:item.instruction || item.question || '',
    tenseLabel:item.tenseLabel || '',
    explanation:item.explanation || '',
    answered:false,
    isTestQuestion
  };
}
function pickGrammarQuestion(){
  const selectedGrade = els.gradeSelect ? els.gradeSelect.value : 'all';
  const allowedUnits = activeBlockIds.length
    ? activeBlockIds.slice().sort()
    : UNIT_META.map(unit => unit.id);
  const testId = getTestGrammarId();

  if(testId && !grammarTestConsumed){
    const testItem = GRAMMAR_DATA.find(item => item.id === testId);
    if(testItem){
      grammarTestConsumed = true;
      return makeGrammarQuestion(testItem, true);
    }
  }

  const pool = GRAMMAR_DATA.filter(item => {
    const gradeMatches = selectedGrade === 'all' || String(item.grade) === selectedGrade;
    const unitMatches = allowedUnits.includes(item.unit);
    return gradeMatches && unitMatches;
  });
  if(!pool.length) return null;

  const queueKey = [selectedGrade, ...allowedUnits].join('|');
  if(grammarQueueKey !== queueKey || !grammarQueue.length){
    grammarQueue = shuffle([...pool]);
    grammarQueueKey = queueKey;
  }

  return makeGrammarQuestion(grammarQueue.shift(), false);
}

function pickQuestion(){ 
  const mode=els.modeSelect.value;
  if(mode === 'irregular'){
    currentQ = pickIrregularQuestion();
    return currentQ;
  }
  if(mode === 'grammar'){
    currentQ = pickGrammarQuestion();
    return currentQ;
  }
  if(mode === 'de2en' || mode === 'en2de'){ const t=findTestVocabQuestion(getTestVocabId()); if(t){ currentQ=t; return currentQ; } }
if(mode === 'sentences'){

    const selectedGrade =
        els.gradeSelect
            ? els.gradeSelect.value
            : 'all';

    const allowedUnits =
        activeBlockIds.length
            ? activeBlockIds
            : UNIT_META.map(unit => unit.id);

    let allSentences = [];

    if(Array.isArray(SENTENCES_DATA)){

        allSentences =
            SENTENCES_DATA;

    }else{

        Object.entries(
            SENTENCES_DATA || {}
        )
        .forEach(([unit, sentences]) => {

            if(!Array.isArray(sentences)){
                return;
            }

            sentences.forEach(sentence => {

                allSentences.push({

                    ...sentence,

                    grade:
                        sentence.grade || 6,

                    unit:
                        sentence.unit || unit

                });

            });

        });

    }

    const sentencePool =
        allSentences.filter(sentence => {

            const gradeMatches =
                selectedGrade === 'all' ||
                String(sentence.grade) ===
                    selectedGrade;

            const unitMatches =
                allowedUnits.includes(
                    sentence.unit
                );

            return (
                gradeMatches &&
                unitMatches
            );

        });

    const testSentenceId = getTestSentenceId();
    const testSentence = testSentenceId
        ? allSentences.find(sentence => sentence.id === testSentenceId)
        : null;

  if(!sentencePool.length && !testSentence){
    return null;
}

const currentSentenceQueueKey =
    [
        selectedGrade,
        ...allowedUnits.slice().sort()
    ].join('|');

if(
    sentenceQueueKey !== currentSentenceQueueKey ||
    !sentenceQueue.length
){

    sentenceQueue =
        shuffle(
            [...sentencePool]
        );

    sentenceQueueKey =
        currentSentenceQueueKey;

}

const randomSentence =
    testSentence || sentenceQueue.shift();

const selectedDirection =
    els.sentenceDirectionSelect
        ? els.sentenceDirectionSelect.value
        : 'en2de';

const actualDirection =
    selectedDirection === 'mixed'
        ? (
            Math.random() < 0.5
                ? 'en2de'
                : 'de2en'
        )
        : selectedDirection;

if(actualDirection === 'de2en'){

    currentQ = {
        type: 'sentence',
        from: 'de',
        to: 'en',
        prompt: randomSentence.de,
        answer: combineAcceptedAnswers(
            randomSentence.en,
            randomSentence.acceptedEn
        ),
        answered: false,
        isTestQuestion: !!testSentence
    };

}else{

    currentQ = {
        type: 'sentence',
        from: 'en',
        to: 'de',
        prompt: randomSentence.en,
        answer: combineAcceptedAnswers(
            randomSentence.de,
            randomSentence.acceptedDe
        ),
        answered: false,
        isTestQuestion: !!testSentence
    };

}

return currentQ;
}
if(mode === 'builder'){

    const selectedGrade =
        els.gradeSelect
        ? els.gradeSelect.value
        : 'all';

    const allowedUnits =
        activeBlockIds.length
        ? activeBlockIds
        : UNIT_META.map(u => u.id);

    const builderPool =
        BUILDER_DATA.filter(item => {

            const gradeMatches =
                selectedGrade === 'all' ||
                String(item.grade) === selectedGrade;

            const unitMatches =
                allowedUnits.includes(
                    item.unit
                );

            return gradeMatches && unitMatches;

        });

    if(!builderPool.length){
        return null;
    }

    const item =
        builderPool[
            Math.floor(
                Math.random() *
                builderPool.length
            )
        ];

    const words =
        item.sentence
            .replace('.', '')
            .split(' ');

    const shuffled =
        shuffle(
            [...words]
        );

  currentQ = {

    type: 'builder',

    prompt:
        shuffled,

    words:
        shuffled,

    answer:
        item.sentence,

    de:
        item.de || '',

    tense:
        item.tense || '',

    tenseLabel:
        item.tenseLabel || '',

    answered: false

};

    return currentQ;
}
  if(!activeBlockIds.length) return null; 
  if(!sessionQueue.length) { 
      resetSessionQueue(); 
      if (!sessionQueue.length) return null; // Falls Pool leer
  }
  let tries=Math.min(sessionQueue.length,5); 
  let cand=sessionQueue[0]; 
  const from=mode==='de2en'?'de':'en'; 
  const to=mode==='de2en'?'en':'de'; 
  while(tries>0 && cand && recentlyAsked(cand.w[from])){ 
    sessionQueue.push(sessionQueue.shift()); cand=sessionQueue[0]; tries--; 
  } 
  cand=sessionQueue.shift(); 
  if(!sessionQueue.length) resetSessionQueue(); 
  const item=cand.w, origin=cand.origin; 
  const prompt=item[from]; 
  const answer=item[to]; 
  const pool=buildPool(); 
  let options=[answer]; 
  const distract=shuffle(pool.filter(x=>x.w!==item).map(x=>x.w[to]).filter(x=> normalize(x)!==normalize(answer))); 
  while(options.length<4 && distract.length) options.push(distract.pop()); 
  options=shuffle(options); 
  currentQ={ origin, from, to, prompt, answer, options, item, answered:false }; 
  return currentQ; 
}
function diffFeedback(user, correct){ const {ua,ub} = simpleDiffLine(user, displayAnswer(correct)); return `Fast richtig – <strong>Schreibweise prüfen</strong>:<div class="diffline">Dein Wort: ${ua}</div><div class="diffline">Richtig: ${ub}</div>`; }
function disableInputsAfterAnswer(){ 

    els.optionsList.querySelectorAll('button.option-btn').forEach(btn=>{ btn.disabled=true; btn.classList.add('disabled'); }); 
    const free=document.getElementById('freeInput'); 
    if(free){ free.disabled=true; } 
    els.checkBtn && (els.checkBtn.disabled=true); 
    els.checkBtn && els.checkBtn.classList.add('hidden'); 
    els.showAnswerBtn && els.showAnswerBtn.classList.add('hidden'); // Lösung-Button ausblenden
  document
    .querySelectorAll(
        '#builderWords .builder-word, #builderSentence .builder-word'
    )
    .forEach(btn => {

        btn.disabled = true;

        btn.classList.add(
            'disabled'
        );

    });
    prepareNextUX(); 
}
function prepareNextUX(){ 
    if(!els.nextBtn) return; 
    els.nextBtn.textContent='Weiter zur nächsten Frage'; 
    els.nextBtn.classList.remove('hidden'); 
    els.nextBtn.classList.add('highlight'); 
    setTimeout(()=>{ try{ els.nextBtn.focus(); }catch(e){} },700); 
}
function showHint(ok){ if(!els.hintsEnabled?.checked){ els.hintArea && els.hintArea.classList.add('hidden'); return; } if(!els.hintArea) return; const mode=els.modeSelect.value; const ans=currentQ.answer; const de=currentQ.from==='de'?currentQ.prompt:ans; const en=currentQ.from==='de'?ans:currentQ.prompt; const content = pickHint(en,de,mode); if(!content){ els.hintArea.classList.add('hidden'); return; } els.hintArea.innerHTML = `<div class="meta">Lern‑Hinweis (Beta):</div><div>${content}</div>`; els.hintArea.classList.remove('hidden'); }
function onAnswerOnce(userInput){

    if(!currentQ || currentQ.answered) return;

    currentQ.answered = true;
    const isTestQuestion = !!currentQ.isTestQuestion;

    const exact =
        isAcceptedAnswer(
            userInput,
            currentQ.answer
        );

    let ok = exact;
    let msg = '';
    let xpEarned = 0;

    if(exact){

       if(currentQ.type === 'builder'){

    xpEarned = 15;

}else if(currentQ.type === 'sentence'){

    xpEarned = 10;

}else{

    xpEarned = 5;

}

        const player =
            loadPlayer();

        if(isTestQuestion){ xpEarned = 0; }
        player.xp += xpEarned;
      player.correctAnswers =
    (player.correctAnswers || 0) + 1;

        savePlayer(player);
      if(
    player.correctAnswers >= 10
){

    unlockAchievement(
        'getting_started'
    );

}

      unlockAchievement(
    'first_steps'
);

        updatePlayerUI();
     

        msg =
            `✅ Richtig! (+${xpEarned} XP)`;

    }else{

        msg =
            diffFeedback(
                userInput,
                currentQ.answer
            );

    }

    els.feedback.innerHTML = msg;
    if(currentQ.type === 'grammar' && currentQ.explanation){
        els.feedback.innerHTML += `<div class="grammar-explanation"><strong>Erklärung:</strong> ${currentQ.explanation}</div>`;
    }
if(
    !isTestQuestion &&
    currentQ.type !== 'sentence' &&
    currentQ.type !== 'builder' &&
    currentQ.type !== 'irregular' &&
    currentQ.type !== 'grammar'
){
    record(
        currentQ.origin,
        currentQ.item,
        ok
    );
}


    disableInputsAfterAnswer();

    showHint(ok);

    sessionCompleted++;

    updateProgressUI();

}
function updateProgressUI(){
    if(!els.sessionProgress) return;
    if(sessionTotalSize > 0){
        // Zeigt "Frage 5 von 45" oder "5 / 45"
        const currentNumber = Math.min(sessionCompleted + 1, sessionTotalSize);
        els.sessionProgress.textContent = `Frage ${currentNumber} von ${sessionTotalSize}`;
        els.sessionProgress.classList.remove('hidden');
    } else {
        els.sessionProgress.classList.add('hidden');
    }
}
function handleShowAnswer(){
    if(!currentQ || currentQ.answered) return;
    currentQ.answered = true;
    els.feedback.innerHTML = `Lösung: <strong>${displayAnswer(currentQ.answer)}</strong>`;
    
    // Keine Statistik-Änderung, da es ein Überspringen ist
    
    disableInputsAfterAnswer();
    showHint(true); // Hint zeigen, da die Lösung bekannt ist
    
    sessionCompleted++; // NEU: Fortschritt erhöhen (wurde übersprungen)
    updateProgressUI(); // NEU: UI aktualisieren
}
function renderQuestion(){ 
    if(!currentQ) return; 
  if(els.checkBtn){
        const cleanCheckBtn = els.checkBtn.cloneNode(true);
        els.checkBtn.replaceWith(cleanCheckBtn);
        els.checkBtn = cleanCheckBtn;
    }
  els.achievementPopup &&
    els.achievementPopup.classList.add(
        'hidden'
    );
    els.feedback.textContent=''; 
    els.hintArea && els.hintArea.classList.add('hidden'); 
    
    // Buttons steuern
    els.nextBtn && els.nextBtn.classList.add('hidden'); 
    els.checkBtn && (els.checkBtn.disabled=false); 
    els.showAnswerBtn && els.showAnswerBtn.classList.remove('hidden'); // Lösung-Button sichtbar

if(currentQ.type === 'grammar'){
    els.exerciseType.textContent = '🧠 Grammatiktrainer';
    els.exerciseType.style.color = '#7dc8ff';
    els.exerciseDescription.textContent = currentQ.instruction || 'Löse die Grammatikaufgabe.';
}else if(currentQ.type === 'irregular'){

    els.exerciseType.textContent = '🔄 Unregelmäßige Verben';
    els.exerciseType.style.color = '#c89cff';
    els.exerciseDescription.textContent =
        `Schreibe die verlangte Verbform: ${currentQ.verbFormLabel}.`;

}else if(currentQ.type === 'sentence'){

    els.exerciseType.textContent = '📖 Satztrainer';
    els.exerciseType.style.color = '#5dff9a';

    els.exerciseDescription.textContent =
        'Übersetze den kompletten Satz ins Deutsche.';
  }else if(
    currentQ.type === 'builder'
){

    els.exerciseType.textContent =
        '🧩 Satzbau';

    els.exerciseType.style.color =
        '#ffd966';

    els.exerciseDescription.textContent =
        'Ordne die Wörter zu einem korrekten Satz.';

}else{

    els.exerciseType.textContent = '📚 Vokabeltrainer';
    els.exerciseType.style.color = '#7dc8ff';

    if(currentQ.from === 'de'){
        els.exerciseDescription.textContent =
            'Übersetze das Wort ins Englische.';
    }else{
        els.exerciseDescription.textContent =
            'Übersetze das Wort ins Deutsche.';
    }

}

  
    els.promptLabel.textContent = '';
    els.promptText.textContent=currentQ.prompt; 
    pushHistory(currentQ.prompt); 

if(
    currentQ.type === 'builder'
){

    els.mcArea.classList.add(
        'hidden'
    );

    els.optionsList.innerHTML = '';

    els.checkBtn &&
        els.checkBtn.classList.remove(
            'hidden'
        );

els.promptText.innerHTML =
`
<div class="builder-translation">

    ${currentQ.tenseLabel
        ? `<div class="builder-tense"><strong>Zeitform:</strong> ${currentQ.tenseLabel}</div><br>`
        : ''}

    <strong>
        Deutsch:
    </strong>

    <br>

    ${currentQ.de}

</div>

<br>

<div>

    <strong>
        Verfügbare Wörter
    </strong>

</div>

<div id="builderWords"></div>

<br><br>

<div>

    <strong>
        Dein Satz
    </strong>

</div>

<br>

<div id="builderSentence"></div>

<br>

<button
    id="resetBuilderBtn"
    class="secondary">

    Satz zurücksetzen

</button>
`;

setTimeout(() => {

    const wordArea =
        document.getElementById(
            'builderWords'
        );

    const sentenceArea =
        document.getElementById(
            'builderSentence'
        );
  const resetBuilderBtn =
    document.getElementById(
        'resetBuilderBtn'
    );

    if(
        !wordArea ||
        !sentenceArea
    ){
        return;
    }
  if(resetBuilderBtn){

    resetBuilderBtn.addEventListener(
        'click',
        () => {

            if(
                !currentQ ||
                currentQ.answered
            ){
                return;
            }

            currentQ.builderWords = [];

            sentenceArea.innerHTML = '';

            wordArea
                .querySelectorAll(
                    '.builder-word'
                )
                .forEach(btn => {

                    btn.disabled = false;

                    btn.classList.remove(
                        'disabled'
                    );

                });

        }
    );

}
currentQ.builderWords = [];
    wordArea.innerHTML =
        currentQ.words
            .map(word =>
                `<button class="builder-word">${word}</button>`
            )
            .join('');

    wordArea
        .querySelectorAll(
            '.builder-word'
        )
        .forEach(btn => {

            btn.addEventListener(
                'click',
                () => {

                    const chip =
                        document.createElement(
                            'button'
                        );

                    chip.className =
                        'builder-word';

const selectedWord =
    btn.textContent.trim();

chip.textContent =
    selectedWord;

sentenceArea.appendChild(
    chip
);

currentQ.builderWords.push(
    selectedWord
);

btn.disabled = true;

chip.addEventListener(
    'click',
    () => {

        if(
            !currentQ ||
            currentQ.answered
        ){
            return;
        }

        btn.disabled = false;

const index =
    currentQ.builderWords.indexOf(
        selectedWord
    );

if(index > -1){

    currentQ.builderWords.splice(
        index,
        1
    );

}

chip.remove();

    }
);

                }
            );

        });

},0);
els.checkBtn.onclick =
    () => {

        const chips =
            document.querySelectorAll(
                '#builderSentence .builder-word'
            );

        const builtSentence =
            Array.from(chips)
                .map(chip =>
                    chip.textContent.trim()
                )
                .filter(Boolean)
                .join(' ');

        if(!builtSentence){

            els.feedback.textContent =
                'Baue zuerst einen Satz.';

            return;

        }

        onAnswerOnce(
            builtSentence
        );

    };

 
    return;
}
  
    if(els.mcEnabled?.checked && Array.isArray(currentQ.options) && currentQ.options.length > 0){ 
        els.mcArea.classList.remove('hidden'); 
        els.optionsList.innerHTML=''; 
        els.checkBtn && els.checkBtn.classList.add('hidden'); 
        currentQ.options.forEach(opt=>{ 
            const li=document.createElement('li'); 
            const btn=document.createElement('button'); 
            btn.className='option-btn'; 
            btn.textContent=opt; 
            btn.addEventListener('click',()=> onAnswerOnce(opt)); 
            li.appendChild(btn); 
            els.optionsList.appendChild(li); 
        }); 
    } else { 
        // Freitext-Eingabe (Free Input Mode)
        els.mcArea.classList.add('hidden'); 
        els.optionsList.innerHTML=''; 
        els.checkBtn && els.checkBtn.classList.remove('hidden'); 
        els.promptText.innerHTML = `${currentQ.prompt}<br/><input id="freeInput" class="option-btn" placeholder="Antwort hier eingeben" />`; 
        
        setTimeout(()=>{ 
            const input=document.getElementById('freeInput'); 

            if(input){ 
                const answerCheckHandler = (e) => {
                    if(e.type === 'keydown' && e.key !== 'Enter') return;
                    if(e.type === 'click' && input.disabled) return;
                    onAnswerOnce(input.value.trim()); 
                    if (e.preventDefault) e.preventDefault();
                };
                input.addEventListener('keydown', answerCheckHandler); 
                els.checkBtn.addEventListener('click', answerCheckHandler);
                input.focus();
            } 
        },0); 
    }
}

function bindControls(){ 
    // ... (Andere Controls bleiben unverändert) ...
  els.nextBtn &&
    els.nextBtn.addEventListener(
        'click',
        () => {

            if(
                !currentQ ||
                currentQ.answered
            ){

                const q =
                    pickQuestion();

                if(q){

                    renderQuestion();

                    return;

                }

                currentQ = null;

                els.feedback.textContent = '';

                els.hintArea &&
                    els.hintArea.classList.add(
                        'hidden'
                    );

                els.promptText.textContent =
                    'Für diese Auswahl sind noch keine Aufgaben vorhanden.';

                els.checkBtn &&
                    els.checkBtn.classList.add(
                        'hidden'
                    );

                els.showAnswerBtn &&
                    els.showAnswerBtn.classList.add(
                        'hidden'
                    );

                els.nextBtn.textContent =
                    'Start';

                updateProgressUI();

            }

        }
    );
    
    // NEU: Lösung anzeigen Button binden
    els.showAnswerBtn && els.showAnswerBtn.addEventListener('click', handleShowAnswer);
  els.exportSaveBtn &&
    els.exportSaveBtn.addEventListener(
        'click',
        exportSavegame
    );

els.importSaveInput &&
    els.importSaveInput.addEventListener(
        'change',
        (event) => {

            const file =
                event.target.files[0];

            if(!file){
                return;
            }

            importSavegame(
                file
            );

            event.target.value = '';

        }
    );
  document.addEventListener(
    'keydown',
    event => {
        if(event.key !== 'Enter') return;

        if(currentQ && currentQ.answered){
            event.preventDefault();
            event.stopPropagation();
            els.nextBtn && els.nextBtn.click();
            return;
        }

        if(!currentQ) return;

        if(els.modeSelect && els.modeSelect.value === 'builder'){
            event.preventDefault();
            event.stopPropagation();
            els.checkBtn && els.checkBtn.click();
            return;
        }

        const input = document.getElementById('freeInput');
        if(input && !input.disabled){
            event.preventDefault();
            event.stopPropagation();
            onAnswerOnce(input.value.trim());
        }
    },
    true
);
    els.resetSelectedBtn && els.resetSelectedBtn.addEventListener('click', ()=> resetSelected()); 
    els.resetAllBtn && els.resetAllBtn.addEventListener('click', ()=> resetAll()); 
    els.weightedEnabled && els.weightedEnabled.addEventListener('change', ()=>{ updateStatsUI(); resetSessionQueue(); }); 
    els.presetSelect && els.presetSelect.addEventListener('change', e=>{ if(e.target.value==='custom') return; applyPreset(e.target.value); }); 
    els.selectAllBtn && els.selectAllBtn.addEventListener('click', ()=>{ els.blockChecklist.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked=true ); syncActiveBlockIds(); }); 
    els.clearAllBtn && els.clearAllBtn.addEventListener('click', ()=>{ els.blockChecklist.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked=false ); syncActiveBlockIds(); }); 
els.modeSelect && els.modeSelect.addEventListener('change', () => {

    currentQ = null;
    grammarQueue = [];
    grammarQueueKey = '';
    grammarTestConsumed = false;

    if(els.modeSelect.value === 'irregular'){
        ensureIrregularSelection();
    }

    const q = pickQuestion();

    if(q){

        renderQuestion();

    }else{

        els.feedback.textContent = '';

        els.hintArea &&
            els.hintArea.classList.add(
                'hidden'
            );

        els.promptText.textContent =
            'Für diese Auswahl sind noch keine Aufgaben vorhanden.';

        els.checkBtn &&
            els.checkBtn.classList.add(
                'hidden'
            );

        els.showAnswerBtn &&
            els.showAnswerBtn.classList.add(
                'hidden'
            );

        els.nextBtn &&
            els.nextBtn.classList.remove(
                'hidden'
            );

        els.nextBtn.textContent =
            'Start';

        if(
            els.modeSelect.value === 'builder'
        ){

            els.exerciseType.textContent =
                '🧩 Satzbau';

            els.exerciseType.style.color =
                '#ffd966';

            els.exerciseDescription.textContent =
                'Ordne die Wörter zu einem korrekten Satz.';

        }

    }

});
  els.gradeSelect &&
    els.gradeSelect.addEventListener(
        'change',
        () => {

            currentQ = null;
            grammarQueue = [];
            grammarQueueKey = '';
            sentenceQueue = [];
            sentenceQueueKey = '';
            resetSessionQueue();

            if(
                els.modeSelect &&
                els.modeSelect.value === 'irregular'
            ){
                ensureIrregularSelection();
            }

            const q =
                pickQuestion();

            if(q){

                renderQuestion();

            }else{

                els.promptText.textContent =
                    'Für diese Auswahl sind noch keine Aufgaben vorhanden.';

            }

        }
    );
  els.sentenceDirectionSelect &&
    els.sentenceDirectionSelect.addEventListener(
        'change',
        () => {
            if(
                !els.modeSelect ||
                els.modeSelect.value !== 'sentences'
            ){
                return;
            }

            currentQ = null;
            sentenceQueue = [];
            sentenceQueueKey = '';

            const q = pickQuestion();

            if(q){
                renderQuestion();
            }else{
                els.promptText.textContent =
                    'Fuer diese Auswahl sind noch keine Aufgaben vorhanden.';
            }
        }
    );
els.achievementToggle &&
    els.achievementToggle.addEventListener(
        'click',
        () => {

            els.achievementListWrapper
                .classList.toggle(
                    'hidden'
                );

        }
    );

els.openPackBtn &&
    els.openPackBtn.addEventListener(
        'click',
        openCardPack
    );
  els.showCollectionBtn &&
    els.showCollectionBtn.addEventListener(
        'click',
        showCollection
    );
  els.closeCollectionBtn &&
    els.closeCollectionBtn.addEventListener(
        'click',
        () => {

            els.collectionPopup
                .classList.add(
                    'hidden'
                );

        }
    );
  els.closeCardPackBtn &&
    els.closeCardPackBtn.addEventListener(
        'click',
        () => {

            els.cardPackPopup
                .classList.add(
                    'hidden'
                );

        }
    );
        
    // Installations-Logik (unverändert)
    if (els.installBtn) {
        window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
        els.installBtn.addEventListener('click', (e) => {
            if (deferredPrompt) {
                els.installBtn.classList.add('hidden');
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') { console.log('App installiert'); } 
                    else { els.installBtn.classList.remove('hidden'); console.log('App Installation abgebrochen'); }
                    deferredPrompt = null;
                });
            } else {
                alert("Der Browser hat die automatische Installation noch nicht freigegeben. Bitte nutzen Sie das 3-Punkte-Menü (⋮) oben rechts und wählen Sie 'App installieren' oder 'Zum Startbildschirm hinzufügen'.");
            }
        });
        window.addEventListener('appinstalled', (e) => { els.installBtn.classList.add('hidden'); });
        if (window.matchMedia('(display-mode: standalone)').matches || document.referrer.includes('android-app://')) {
            els.installBtn.classList.add('hidden');
        } else {
            els.installBtn.classList.remove('hidden');
        }
    }
}
function applyPreset(val){ const ranges={ 'u1_2':['u1','u2'], 'u1_3':['u1','u2','u3'], 'u3_4':['u3','u4'], 'u1_6':['u1','u2','u3','u4','u5','u6'] }; els.blockChecklist.querySelectorAll('input[type=checkbox]').forEach(cb=> cb.checked=false ); (ranges[val]||[]).forEach(id=>{ const cb=els.blockChecklist.querySelector(`input[value=\"${id}\"]`); if(cb) cb.checked=true; }); syncActiveBlockIds(); }

function displayVersion() {
    const versionEl = document.getElementById('appVersion');
    if (versionEl) {
        versionEl.textContent = APP_VERSION;
    }
}

(async function init(){ try{ 
    ensureBlocksSection(); 
    bindEls(); 
    bindControls(); 
    await initCentralSync(); 
    renderChecklist(); 
    initStats(); 
    updateStatsUI(); 
    displayVersion(); 
    updateProgressUI(); // NEU: Initialen Fortschritt setzen
  updatePlayerUI();
  renderAchievements();

    // Initialen Zustand setzen
    els.promptText.textContent='Wähle mindestens einen Block und starte.';
    els.checkBtn && els.checkBtn.classList.add('hidden'); 
    els.showAnswerBtn && els.showAnswerBtn.classList.add('hidden'); // Lösung-Button initial verstecken
    
} catch(e){ console.error('[INIT] Fehler:', e); }})();
