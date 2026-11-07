'use strict';
const $ = id => document.getElementById(id);

/* ---------- Word helpers ---------- */
const LISTS = [
  { id: 'fourth2026', name: '4th Grade 2025–26', note: 'with definitions' },
  { id: 'fourth2024', name: '4th Grade 2023–24', note: 'with definitions' },
  { id: 'one_school', name: 'One Bee Study List', note: 'easier' },
  { id: 'two_school', name: 'Two Bee Study List', note: 'medium' },
  { id: 'three_school', name: 'Three Bee Study List', note: 'hard' },
  { id: 'one_champion', name: 'One Bee Champions', note: 'easier' },
  { id: 'two_champion', name: 'Two Bee Champions', note: 'medium' },
  { id: 'three_champion', name: 'Three Bee Champions', note: 'expert' },
];
const DIFFS = {
  practice: { name: 'Practice Bee', note: '5 shields · no clock · Backspace allowed', lives: 5, pace: 0, erase: true },
  school: { name: 'School Bee', note: '3 shields · on the clock · no changing letters', lives: 3, pace: 1, erase: false },
  champion: { name: 'Championship Bee', note: 'One miss and you are out · faster clock', lives: 1, pace: 0.65, erase: false },
};
const LENGTHS = [10, 20, 0];
const ROUND_SIZE = 5;

// Letters only, no accents: players type "deja vu" as DEJAVU; spaces and hyphens are filled in for them.
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const forms = e => [e.w, ...(e.alt || [])];
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Hide the answer when a definition happens to contain the word or a close relative of it.
function maskDef(text, e) {
  let out = text;
  for (const f of forms(e)) {
    const lower = f.toLowerCase();
    const stem = lower.length >= 5 ? lower.slice(0, lower.length - 2) : lower;
    out = out.replace(new RegExp('\\b' + stem.replace(/[^\p{L}' -]/gu, '') + '[a-z]*', 'gi'), '▢▢▢');
  }
  return out;
}

/* ---------- Saved progress (optional; game works without it) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('wb_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wb_' + k, JSON.stringify(v)); } catch { /* private window */ } },
};
let practice = store.get('practice', {}); // norm(word) -> entry, for words the player struggled with
const savePractice = () => store.set('practice', practice);

/* ---------- Commander's voice: pre-recorded clips, browser speech only if a clip fails ---------- */
const tts = window.speechSynthesis || null;
const voiceEl = new Audio();
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
let speakToken = 0, speaking = false, keepAlive = null;
const pick = (prefix, n) => prefix + (1 + Math.floor(Math.random() * n));
const line = id => ({ src: `audio/lines/${id}.mp3`, text: (window.VOICE_LINES || {})[id] || '' });
const wordClip = e => ({ src: `audio/words/w_${norm(e.w)}.mp3`, text: e.w });
const roundClip = n => line(n <= 20 ? 'round' + n : 'newround');
const letterClips = e => [...norm(e.w)].map(c => line('letter' + c));
const defClip = e => {
  const text = (window.VOICE_DEFS || {})[norm(e.w)];
  return text ? { src: `audio/defs/w_${norm(e.w)}.mp3`, text } : null;
};

function stopVoice() {
  speakToken++; speaking = false;
  voiceEl.onended = voiceEl.onerror = null;
  voiceEl.pause();
  if (tts) tts.cancel();
}

// Plays clips in order, then calls onDone exactly once.
function speak(clips, onDone) {
  stopVoice();
  const token = speakToken;
  speaking = true;
  const finish = () => { if (token !== speakToken) return; speaking = false; if (onDone) onDone(); };
  let fellBack = false;
  const fallback = i => {
    if (fellBack) return; // a failed clip reports through both the error event and play()
    fellBack = true;
    const text = clips.slice(i).map(c => c.text).join(' ');
    if (!tts || !text) return finish();
    keepAlive = new SpeechSynthesisUtterance(text);
    keepAlive.lang = 'en-US';
    keepAlive.rate = 0.85; keepAlive.pitch = 0.6;
    keepAlive.onend = keepAlive.onerror = finish;
    tts.speak(keepAlive);
    setTimeout(finish, 1500 + text.length * 130); // some browsers never fire the end event
  };
  const play = i => {
    if (token !== speakToken) return;
    if (i >= clips.length) return finish();
    voiceEl.onended = () => play(i + 1);
    voiceEl.onerror = () => { voiceEl.onerror = voiceEl.onended = null; fallback(i); };
    voiceEl.src = clips[i].src;
    const started = voiceEl.play();
    if (started) started.catch(err => { if (token === speakToken && err.name !== 'AbortError') fallback(i); });
  };
  play(0);
}

/* ---------- Sound effects ---------- */
let audio = null, soundOn = store.get('sound', true);
function tone(from, to, dur, type = 'square', vol = 0.06, delay = 0) {
  if (!audio || !soundOn || audio.state !== 'running') return; // while suspended, sounds would pile up and all play at once
  const t = audio.currentTime + delay, o = audio.createOscillator(), g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + dur);
}
function noise(dur, vol, cutoff, delay = 0) {
  if (!audio || !soundOn || audio.state !== 'running') return;
  const t = audio.currentTime + delay, len = Math.ceil(audio.sampleRate * dur);
  const buf = audio.createBuffer(1, len, audio.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
  src.buffer = buf;
  f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(audio.destination);
  src.start(t);
}
// Browsers only allow audio to start from a click or key press.
function unlockAudio() {
  if (!audio && (window.AudioContext || window.webkitAudioContext)) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    audio.onstatechange = startMusic;
  }
  // iPad Safari reports 'interrupted' after a phone call, Siri or switching apps.
  if (audio && audio.state !== 'running' && audio.state !== 'closed') audio.resume().catch(() => {});
  startMusic();
}
// iOS only counts a tap as permission for sound when the finger lifts, so retry on every tap.
addEventListener('touchend', () => { if (!audio || audio.state !== 'running') unlockAudio(); }, { passive: true });

/* ---------- Background music: composed live, so there are no music files ---------- */
let musicOn = store.get('music', true), musicBus = null, musicLevel = -1, musicNext = 0, musicStep = 0;
const STEP = 60 / 104 / 4; // sixteenth notes at 104 beats per minute
// [bass note, chord intervals]
const CHORDS = [[33, [0, 3, 7]], [29, [0, 4, 7]], [36, [0, 4, 7]], [31, [0, 4, 7]], [33, [0, 3, 7]], [29, [0, 4, 7]], [26, [0, 3, 7]], [28, [0, 4, 7]]];
const BASSLINE = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
const MELODY = [76, 0, 0, 72, 0, 0, 69, 0, 72, 0, 74, 0, 76, 0, 0, 0, 77, 0, 0, 76, 0, 0, 72, 0, 74, 0, 72, 0, 69, 0, 0, 0];
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

function musicNote(m, t, dur, type, vol, cutoff) {
  const o = audio.createOscillator(), f = audio.createBiquadFilter(), g = audio.createGain();
  o.type = type; o.frequency.value = hz(m);
  f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(musicBus);
  o.start(t); o.stop(t + dur + 0.02);
}
function musicDrum(t, kind) {
  if (kind === 'kick') {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(musicBus);
    o.start(t); o.stop(t + 0.22);
    return;
  }
  const dur = kind === 'snare' ? 0.16 : 0.04, len = Math.ceil(audio.sampleRate * dur);
  const buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
  src.buffer = buf;
  f.type = kind === 'snare' ? 'bandpass' : 'highpass';
  f.frequency.value = kind === 'snare' ? 1900 : 7000;
  g.gain.setValueAtTime(kind === 'snare' ? 0.2 : 0.06, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(musicBus);
  src.start(t);
}
function scheduleStep(n, t) {
  const inBar = n % 16, bar = Math.floor(n / 16), [root, chord] = CHORDS[bar % CHORDS.length];
  const section = Math.floor(bar / 8) % 4; // 0 sparse, 1 adds arpeggio, 2 adds melody, 3 full
  if (inBar === 0) for (const iv of chord) {
    musicNote(root + 24 + iv, t, STEP * 16, 'sawtooth', 0.035, 900);
    musicNote(root + 24 + iv + 12, t, STEP * 16, 'triangle', 0.02, 1600);
  }
  if (BASSLINE[inBar]) musicNote(root, t, STEP * 2.2, 'sawtooth', 0.2, 480);
  if (inBar % 8 === 0 || (inBar === 10 && bar % 2)) musicDrum(t, 'kick');
  if (inBar === 4 || inBar === 12) musicDrum(t, 'snare');
  if (inBar % 2 === 1) musicDrum(t, 'hat');
  if (section >= 1 && inBar % 2 === 0) musicNote(root + 36 + chord[(inBar / 2) % 3], t, STEP * 1.6, 'square', 0.035, 2000);
  if (section >= 2) {
    const m = MELODY[n % MELODY.length];
    if (m) musicNote(m, t, STEP * 3, 'sawtooth', 0.05, 2600);
  }
}
function musicTick() {
  if (!audio || audio.state !== 'running') return;
  if (musicNext < audio.currentTime) musicNext = audio.currentTime + 0.05; // recover after a throttled tab
  while (musicNext < audio.currentTime + 0.3) {
    if (musicOn) scheduleStep(musicStep, musicNext);
    musicStep++;
    musicNext += STEP;
  }
}
function startMusic() {
  if (musicBus || !audio || audio.state !== 'running') return;
  musicBus = audio.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(audio.destination);
  setInterval(musicTick, 100);
  musicTick();
}
// Sinks while the commander speaks so words stay easy to hear.
function setMusicLevel() {
  if (!musicBus) return;
  const level = !musicOn || document.hidden ? 0 : speaking ? 0.3 : G.screen === 'pause' ? 0.35 : 0.8;
  if (level !== musicLevel) {
    musicLevel = level;
    musicBus.gain.setTargetAtTime(level, audio.currentTime, speaking ? 0.06 : 0.3);
  }
}
function renderMusicButtons() {
  const label = musicOn ? 'Music on' : 'Music off';
  $('musicBtn').textContent = label;
  $('menuMusicBtn').textContent = '🎵 ' + label;
}
function toggleMusic(btn) {
  musicOn = !musicOn;
  store.set('music', musicOn);
  renderMusicButtons();
  btn.blur();
}
const sfx = {
  laser: () => { tone(1500, 170, 0.17, 'sawtooth', 0.075); tone(2600, 420, 0.09, 'square', 0.03); noise(0.05, 0.05, 5000); },
  ignite: () => noise(0.3, 0.1, 1400, 0.09), // letter catching fire just after the laser lands
  hit: () => tone(240, 70, 0.12, 'sawtooth', 0.07),
  wrong: () => tone(170, 60, 0.3, 'sawtooth', 0.11),
  bell: () => { tone(1320, 1320, 0.9, 'triangle', 0.16); tone(2640, 2640, 0.5, 'sine', 0.05); },
  key: () => tone(700, 900, 0.05, 'square', 0.025),
  boom: () => { tone(200, 30, 0.6, 'sawtooth', 0.14); tone(90, 25, 0.8, 'square', 0.08); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.14, 'triangle', 0.09, i * 0.09)),
  alarm: () => { tone(660, 660, 0.12, 'square', 0.05); tone(660, 660, 0.12, 'square', 0.05, 0.2); },
  missile: () => { noise(0.45, 0.06, 900); tone(300, 900, 0.3, 'sawtooth', 0.025); },
  powerup: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f * 1.01, 0.12, 'square', 0.05, 0.5 + i * 0.06)),
  splat: () => { noise(0.35, 0.14, 500); tone(120, 40, 0.4, 'sine', 0.12); },
};

/* ---------- Game state ---------- */
const G = {
  screen: 'menu', // menu | play | clearing | reveal | pause | over
  listId: store.get('list', 'fourth2026'), diff: DIFFS[store.get('diff', 'practice')] ? store.get('diff', 'practice') : 'practice', length: store.get('length', 10),
  queue: [], cur: null, typed: '', hitFrac: 0, wordNo: 0, total: 0,
  score: 0, streak: 0, lives: 3, cleared: 0, missed: [],
  t: 0, duration: 0, alarmed: false, pending: null, revealAt: 0,
};
const defCache = new Map();

function currentEntries() {
  if (G.listId === 'practice') return Object.values(practice);
  return window.WORD_LISTS[G.listId] || window.WORD_LISTS.fourth2026;
}

function startMission() {
  // Must run inside the click: mobile browsers only unlock audio and speech from a user gesture.
  unlockAudio();
  title.skipIntro();
  voiceEl.src = SILENCE; voiceEl.play().catch(() => {});

  const d = DIFFS[G.diff];
  const pool = shuffle([...currentEntries()]);
  const queue = G.length ? pool.slice(0, G.length) : pool;
  Object.assign(G, { queue, total: queue.length, wordNo: 0, score: 0, streak: 0, lives: d.lives, cleared: 0, missed: [] });
  $('eraseBtn').classList.toggle('hidden', !d.erase);
  show('play');
  renderHud();
  setTimeout(nextWord, 500);
}

const roundOf = n => Math.ceil(n / ROUND_SIZE);
// Every shout plays before any repeats; the two signature lines come first.
let barks = ['bark2', 'bark1', ...shuffle(['bark3', 'bark4', 'bark5', 'bark6', 'bark7', 'bark8'])];
function nextBark() {
  const id = barks.shift();
  barks.push(id);
  return line(id);
}

function nextWord() {
  if (!G.queue.length) return endMission(true);
  G.cur = G.queue.shift();
  G.wordNo++;
  G.typed = ''; G.hitFrac = 0; G.t = 0; G.alarmed = false;
  G.duration = (8 + 1.6 * norm(G.cur.w).length) * DIFFS[G.diff].pace;
  enemy.y = -120; enemy.scars = []; enemy.seed = hash(G.cur.w);
  Object.assign(enemy, makeBugParts(enemy.seed));
  lasers.length = 0; missiles.length = 0;
  player.racked = missileCount(); // reload the missile racks
  player.tx = W / 2; // squadron regroups at center
  $('defbox').textContent = '';
  G.screen = 'play';
  renderSlots(); renderHud();
  const newRound = (G.wordNo - 1) % ROUND_SIZE === 0;
  if (newRound) floaters.push({ x: W / 2, y: H * 0.42, text: `ROUND ${roundOf(G.wordNo)}`, life: 1.8 });
  // Battle shouts come before the word, never after it, so the word is always the last thing heard.
  const shout = G.wordNo === 1 || Math.random() < 0.5 ? [nextBark()] : [];
  speak([...(newRound ? [roundClip(roundOf(G.wordNo))] : []), ...shout, line(pick('intro', 4)), wordClip(G.cur)]);
}

const say = () => { if (G.screen === 'play' && G.cur) speak([wordClip(G.cur)]); };

// Bee rule: no feedback while spelling. Letters only load the weapon.
function pressLetter(raw) {
  if (G.screen !== 'play' || !G.cur) return;
  const c = norm(raw);
  if (c.length !== 1 || G.typed.length >= 40) return;
  G.typed += c;
  sfx.key();
  renderSlots();
}

function erase() {
  if (G.screen !== 'play' || !G.typed || !DIFFS[G.diff].erase) return;
  G.typed = G.typed.slice(0, -1);
  renderSlots();
}

const multiplier = () => Math.min(5, 1 + Math.floor(G.streak / 3));

/* ---------- Ship upgrades: every correct word in a bee makes the fighter stronger ---------- */
const MAX_POWER = 12;
const power = () => Math.min(MAX_POWER, G.cleared);
// Bigger with every word; a little smaller overall on short screens so the bug has room to fly.
const shipScale = () => Math.min(1, Math.max(0.7, H / 760)) * (1 + power() * 0.04);
const missileCount = () => power(); // one more missile per correct word
const wingmanCount = () => Math.min(6, Math.floor(power() / 2)); // a new escort pilot every second word
function upgradeMessage(p) {
  if (p === MAX_POWER) return 'MAXIMUM FIREPOWER!';
  if (p % 2 === 0) return `WINGMAN ${p / 2} JOINS! +1 MISSILE`;
  return 'SHIP UPGRADED! +1 MISSILE';
}
const commonPrefix = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };
// Judge against whichever accepted spelling the player came closest to.
const closestForm = (e, typed) => forms(e).map(norm).reduce((a, b) => (commonPrefix(typed, b) > commonPrefix(typed, a) ? b : a));

function submit() {
  if (G.screen !== 'play' || !G.cur || !G.typed) return;
  G.screen = 'firing';
  renderSlots();
  const e = G.cur, typed = G.typed, match = forms(e).find(f => norm(f) === typed);
  const closest = closestForm(e, typed);
  const good = commonPrefix(typed, closest);
  const shots = match ? typed.length : Math.min(good + 1, typed.length);
  for (let i = 0; i < shots; i++) {
    setTimeout(() => {
      fireLaser(i, shots, (i + 1) / closest.length, !match && i === good);
      sfx.laser();
    }, i * 110);
  }
  let wait = shots * 110 + 380;
  if (match) {
    // The whole squadron joins in on a correct word: wingmen fire, then every racked missile launches.
    wings.forEach((w, i) => setTimeout(() => {
      lasers.push({ x: w.x, y: w.y - 14, off: (Math.random() - 0.5) * hullHalf() * 1.4, frac: 0, bad: false });
      sfx.laser();
    }, 60 + i * 90));
    const n = player.racked;
    for (let i = 0; i < n; i++) setTimeout(() => launchMissile(i), 150 + i * 75);
    if (n) wait = Math.max(wait, 150 + n * 75 + 1100);
  }
  setTimeout(() => {
    if (match) wordCleared(e, match);
    else failWord('Ding! That is incorrect.', 'wrong');
  }, wait);
}

function launchMissile(i) {
  if (G.screen !== 'firing' || !player.racked) return;
  const k = shipScale(), side = i % 2 ? 1 : -1;
  player.racked--;
  missiles.push({
    x: player.x + side * 34 * k, y: player.y + 20 * k,
    vx: side * (170 + Math.random() * 90), vy: 40 + Math.random() * 40, speed: 160,
    off: (Math.random() - 0.5) * hullHalf() * 1.5,
  });
  sfx.missile();
}

function wordCleared(e, form) {
  G.cleared++; G.streak++;
  const timeBonus = G.duration ? Math.round(50 * Math.max(0, 1 - G.t / G.duration)) : 0;
  const gained = (100 + 10 * G.typed.length) * multiplier() + timeBonus;
  G.score += gained;
  G.screen = 'clearing';
  explode(enemy.x, enemy.y, 90, '#ffb347', true); explode(enemy.x, enemy.y, 40, '#ffe9b0');
  explode(enemy.x, enemy.y, 60, '#9cff4d'); // bug guts
  fx.shake = 8;
  floaters.push({ x: enemy.x, y: enemy.y, text: `CORRECT +${gained}`, life: 1.3 });
  sfx.boom(); sfx.win(); sfx.splat();
  enemy.y = -9999;
  if (G.cleared <= MAX_POWER) {
    floaters.push({ x: W / 2, y: player.y - 110 * shipScale(), text: upgradeMessage(G.cleared), life: 2.2, color: '#7dffa0' });
    player.glow = 1;
    sfx.powerup();
  }
  delete practice[norm(e.w)]; savePractice();
  if (G.streak % 5 === 0 && G.lives < DIFFS[G.diff].lives) {
    G.lives++;
    floaters.push({ x: player.x, y: player.y - 50, text: 'SHIELD RESTORED', life: 1.6 });
  }
  renderHud(); renderSlots();
  $('defbox').innerHTML = `<b style="color:var(--lime)">${esc(form)}</b>${e.def ? esc(' — ' + e.def) : ''}`;
  speak([line(pick('correct', 6))], () => setTimeout(nextWord, e.def ? 1200 : 500));
}

function failWord(title, lineId) {
  if (G.screen !== 'play' && G.screen !== 'firing') return;
  const e = G.cur, typed = G.typed;
  G.streak = 0; G.lives--;
  G.missed.push(e);
  practice[norm(e.w)] = e; savePractice();
  enemyShots.push({ x: enemy.x, y: enemy.y + 30, t: 0 });
  explode(player.x, player.y, 60, '#ffb347', true);
  sfx.bell(); sfx.boom();
  fx.shake = 22; fx.flash = 0.8;

  const good = commonPrefix(typed, closestForm(e, typed));
  $('revealTitle').textContent = title;
  $('revealSpell').innerHTML = typed ? 'You spelled: ' + [...typed.toUpperCase()].map((c, i) => `<span class="${i < good ? 'ok' : 'bad'}">${c}</span>`).join('') : '';
  $('revealWord').textContent = forms(e).join(' or ').toUpperCase();
  $('revealDef').textContent = e.def ? `${e.pos ? e.pos + ': ' : ''}${e.def}` : '';
  $('revealAgain').textContent = G.lives <= 0 ? 'You are out of this bee.' : `${G.lives} shield${G.lives > 1 ? 's' : ''} left. The bee continues.`;
  G.pending = G.lives > 0 ? nextWord : () => endMission(false);
  G.revealAt = performance.now();
  show('reveal');
  renderHud();
  speak([line(lineId), ...letterClips(e), wordClip(e)]);
}

function continueReveal() {
  if (G.screen !== 'reveal' || performance.now() - G.revealAt < 500) return;
  const go = G.pending; G.pending = null;
  stopVoice();
  show('play');
  go();
}

function endMission(won, quit) {
  G.cur = null;
  stopVoice();
  const key = 'best_' + G.listId + '_' + G.diff;
  const best = store.get(key, 0), isBest = G.score > best;
  if (isBest) store.set(key, G.score);
  $('overTitle').textContent = won ? 'You are the champion!' : quit ? 'Bee ended' : 'Eliminated!';
  $('overTag').textContent = isBest && G.score > 0 ? 'New high score for this list!' : `High score for this list: ${best}`;
  const attempted = G.cleared + G.missed.length;
  $('overStats').innerHTML = [['SCORE', G.score], ['ROUND REACHED', roundOf(Math.max(G.wordNo, 1))], ['WORDS CORRECT', `${G.cleared} / ${attempted}`]]
    .map(([k, v]) => `<div><small>${k}</small>${v}</div>`).join('');
  const missed = G.missed;
  $('missHead').classList.toggle('hidden', !missed.length);
  $('missList').innerHTML = missed.map((e, i) => `<li><button type="button" data-i="${i}" aria-label="Hear ${esc(e.w)}">🔊</button><b>${esc(e.w)}</b><span>${esc(e.def || '')}</span></li>`).join('');
  $('missList').onclick = ev => { const b = ev.target.closest('button'); if (b) speak([wordClip(missed[+b.dataset.i])]); };
  if (won) sfx.win();
  show('over');
  if (!quit) speak([line(won ? 'win' : 'out')]);
}

/* ---------- Definition hint ---------- */
async function showDefinition() {
  if (G.screen !== 'play' || !G.cur) return;
  const e = G.cur;
  let text = e.def, pos = e.pos;
  if (!text && defCache.has(e.w)) ({ text, pos } = defCache.get(e.w));
  if (!text && !defCache.has(e.w)) {
    $('defbox').textContent = 'Scanning dictionary…';
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4000);
      const res = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(e.w), { signal: ctl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const m = (await res.json())[0].meanings[0];
        text = m.definitions[0].definition; pos = m.partOfSpeech;
      }
    } catch { /* offline, or word not found */ }
    defCache.set(e.w, { text, pos });
    if (G.cur !== e) return; // the player moved on while waiting
  }
  if (!text) {
    $('defbox').textContent = 'No definition available for this word.';
    return;
  }
  const masked = maskDef(text, e);
  $('defbox').innerHTML = `${pos ? `<i>${esc(pos)}</i> · ` : ''}${esc(masked)}`;
  const clip = defClip(e); // words without a list definition are shown on screen only
  if (clip) speak([clip]);
}

/* ---------- Rendering: DOM ---------- */
function renderSlots() {
  const box = $('slots');
  if (!G.cur) { box.innerHTML = ''; return; }
  // No blanks: as in a real bee, the player isn't told how long the word is.
  const live = G.screen === 'play';
  const count = G.typed.length + (live ? 1 : 0);
  const size = Math.max(16, Math.min(46, (Math.min(innerWidth, 1000) - 32) / Math.max(count, 1) - 4));
  box.style.setProperty('--slot', size + 'px');
  box.style.setProperty('--gap', (size < 26 ? 2 : 6) + 'px');
  box.innerHTML = [...G.typed.toUpperCase()].map(c => `<div class="slot on">${c}</div>`).join('') + (live ? '<div class="slot next"></div>' : '');
  $('strikes').textContent = !live ? '' : G.typed ? 'Press Enter to fire when your spelling is final.' : 'Spell the word. You find out if it is right after you fire.';
}

function renderHud() {
  $('score').textContent = G.score;
  $('combo').textContent = '×' + multiplier();
  $('power').textContent = power() >= MAX_POWER ? 'MAX' : 'Lv ' + (power() + 1);
  $('left').textContent = `${roundOf(Math.max(G.wordNo, 1))} · word ${G.wordNo}/${G.total}`;
  $('shields').textContent = '◆'.repeat(Math.max(0, G.lives)) + '◇'.repeat(Math.max(0, DIFFS[G.diff].lives - G.lives));
  $('soundBtn').textContent = soundOn ? 'Sound on' : 'Sound off';
}

function show(name) {
  G.screen = name;
  for (const id of ['menu', 'reveal', 'pause', 'over']) $(id).classList.toggle('hidden', id !== name);
  const inGame = name === 'play' || name === 'firing' || name === 'clearing';
  $('hud').classList.toggle('hidden', !inGame);
  $('panel').classList.toggle('hidden', !inGame);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (name === 'menu') { buildMenu(); title.play(); } else title.stop();
}

function buildPicks(el, items, selected, onPick) {
  el.innerHTML = items.map(it => `<button type="button" class="pick" data-id="${esc(String(it.id))}" aria-pressed="${String(it.id) === String(selected)}"><b>${esc(it.name)}</b><span>${esc(it.note)}</span></button>`).join('');
  el.onclick = ev => { const b = ev.target.closest('.pick'); if (b) onPick(b.dataset.id); };
}

function buildMenu() {
  const W = window.WORD_LISTS;
  const practiceCount = Object.keys(practice).length;
  if (G.listId === 'practice' && !practiceCount) G.listId = 'fourth2026';
  const items = LISTS.map(l => ({ id: l.id, name: l.name, note: `${W[l.id].length} words · ${l.note}` }));
  if (practiceCount) items.unshift({ id: 'practice', name: 'Repair Bay', note: `${practiceCount} word${practiceCount > 1 ? 's' : ''} you missed` });
  buildPicks($('lists'), items, G.listId, id => { G.listId = id; store.set('list', id); buildMenu(); });
  buildPicks($('diffs'), Object.entries(DIFFS).map(([id, d]) => ({ id, name: d.name, note: d.note })), G.diff, id => { G.diff = id; store.set('diff', id); buildMenu(); });
  buildPicks($('lengths'), LENGTHS.map(n => ({ id: n, name: n ? `${n} words` : 'Full bee', note: n ? `${n / ROUND_SIZE} rounds, random words` : `${currentEntries().length} in this list` })), G.length, id => { G.length = +id; store.set('length', +id); buildMenu(); });
}

/* ---------- Rendering: canvas ---------- */
const cv = $('c'), ctx = cv.getContext('2d');
let W = 0, H = 0;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stars = Array.from({ length: 170 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8 }));
const player = { x: 0, y: 0, tx: 0, racked: 0, glow: 0 };
const enemy = { x: 0, y: -9999, seed: 0, scars: [], eyes: [], tents: [] };
const blasts = [];
const lasers = [], enemyShots = [], parts = [], floaters = [], missiles = [], wings = [];
const fx = { shake: 0, flash: 0 };

const hash = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

function resize() {
  const r = window.devicePixelRatio || 1;
  W = innerWidth; H = innerHeight;
  cv.width = W * r; cv.height = H * r;
  ctx.setTransform(r, 0, 0, r, 0, 0);
  sprites.clear();
  sky = null;
  player.tx = player.x = W / 2;
  if (G.cur) renderSlots();
}

const hullHalf = () => Math.min(W * 0.4, 190, Math.max(95, H * 0.24));
const CELLS = 10;
const panelTop = () => { const p = $('panel'); return p.classList.contains('hidden') ? H : H - p.offsetHeight; };

function fireLaser(i, count, frac, bad) {
  const off = hullHalf() * 0.8 * (count > 1 ? (2 * i) / (count - 1) - 1 : 0);
  player.tx = enemy.x + off;
  lasers.push({ x: player.x, y: player.y - 26, off, frac, bad });
}

function explode(x, y, n, color, big) {
  if (calm) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, sp = 40 + Math.random() * (big ? 420 : 240);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3 + Math.random() * 0.7, color, size: 1.5 + Math.random() * 2 });
  }
  if (!big) return;
  blasts.push({ x, y, r: hullHalf() * 0.9, life: 0.55, max: 0.55 });
  for (let i = 0; i < 26 && !calm; i++) { // tumbling hull fragments
    const a = Math.random() * 6.283, sp = 50 + Math.random() * 260;
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7 + Math.random() * 0.9, shard: 3 + Math.random() * 9, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12 });
  }
  for (let i = 0; i < 18 && !calm; i++) smoke(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 50, 26);
}
function smoke(x, y, r, life = 0.8 + Math.random() * 0.9) {
  parts.push({ x, y, vx: (Math.random() - 0.5) * 34, vy: -12 - Math.random() * 26, life, max: life, smoke: r });
}

function update(dt) {
  const ps = shipScale();
  player.y = panelTop() - 66 * ps;
  if (!G.cur || G.screen === 'menu' || G.screen === 'over') player.tx = W / 2;
  player.x += (player.tx - player.x) * Math.min(1, dt * 14);
  player.glow = Math.max(0, player.glow - dt * 0.8);
  enemy.x = W / 2 + Math.sin(performance.now() / 1400 + enemy.seed) * Math.max(0, W / 2 - hullHalf() - 40) * 0.45;

  // Wingmen fly in V formation beside the leader; new ones swoop in from below the screen.
  const inBee = G.screen !== 'menu' && G.screen !== 'over';
  const wantWings = inBee ? wingmanCount() : 0;
  if (wings.length > wantWings) wings.length = wantWings;
  while (wings.length < wantWings) { const side = wings.length % 2 ? 1 : -1; wings.push({ x: W / 2 + side * W * 0.6, y: H + 80 }); }
  const outer = (90 + 60 * (Math.ceil(wings.length / 2) - 1)) * ps; // farthest wingman from the leader
  const spread = Math.min(1, (W / 2 - 34) / Math.max(outer, 1)); // squeeze the V to fit narrow screens
  wings.forEach((w, i) => {
    const side = i % 2 ? 1 : -1, rank = Math.floor(i / 2);
    const tx = player.x + side * (56 * ps + 34 * ps + rank * 60 * ps) * spread, ty = player.y + (10 + rank * 12) * ps;
    const ease = Math.min(1, dt * (6 - rank));
    w.x += (Math.max(20, Math.min(W - 20, tx)) - w.x) * ease;
    w.y += (ty - w.y) * ease;
  });

  const top = W < 640 ? 132 : 104, floor = Math.max(top + 10, player.y - 60 * ps - 96 * (hullHalf() / 190));
  if (G.screen === 'play' && G.cur) {
    if (G.duration && !speaking) {
      G.t += dt;
      if (G.t / G.duration > 0.75 && !G.alarmed) { G.alarmed = true; sfx.alarm(); speak([line(pick('urgent', 3))]); }
      if (G.t >= G.duration) failWord('Time! The enemy ship broke through.', 'time');
    }
  }
  if (G.cur && enemy.y > -9000 && G.screen !== 'pause') {
    const target = G.duration ? top + (floor - top) * Math.min(1, G.t / G.duration) : top + 20 + Math.sin(performance.now() / 900) * 8;
    enemy.y += (target - enemy.y) * Math.min(1, dt * 5);
  }

  for (let i = lasers.length - 1; i >= 0; i--) {
    const l = lasers[i];
    l.y -= 1100 * dt;
    l.x += (enemy.x + l.off - l.x) * Math.min(1, dt * 18);
    if (l.y <= enemy.y + 12) {
      lasers.splice(i, 1);
      if (l.bad) {
        explode(l.x, enemy.y + 8, 22, '#ff4d6d');
        sfx.wrong();
      } else {
        G.hitFrac = Math.max(G.hitFrac, l.frac);
        explode(l.x, enemy.y + 8, 16, '#ffd27a');
        enemy.scars.push({ off: l.off, y: 6 + Math.random() * 14, r: 9 + Math.random() * 7 });
        sfx.hit();
      }
    }
  }
  // Homing missiles: spill out sideways from the wing racks, then curve up into the bug.
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    if (enemy.y < -9000) { missiles.splice(i, 1); continue; }
    m.speed = Math.min(1050, m.speed + 1500 * dt);
    const dx = enemy.x + m.off - m.x, dy = enemy.y + 10 - m.y, d = Math.hypot(dx, dy) || 1;
    const turn = Math.min(1, dt * 4.5);
    m.vx += ((dx / d) * m.speed - m.vx) * turn;
    m.vy += ((dy / d) * m.speed - m.vy) * turn;
    m.x += m.vx * dt; m.y += m.vy * dt;
    if (!calm && Math.random() < 0.5) smoke(m.x, m.y, 5, 0.5);
    if (d < 20) {
      missiles.splice(i, 1);
      explode(m.x, m.y, 18, '#ffb347');
      explode(m.x, m.y, 8, '#9cff4d');
      blasts.push({ x: m.x, y: m.y, r: 34, life: 0.3, max: 0.3 });
      enemy.scars.push({ off: m.x - enemy.x, y: (Math.random() - 0.5) * 50, r: 8 + Math.random() * 7 });
      fx.shake = Math.max(fx.shake, 5);
      sfx.hit();
    }
  }
  // Slime dripping from the bug's mouth
  if (!calm && G.cur && enemy.y > -9000 && Math.random() < dt * 2.5) {
    const k = hullHalf() / 190;
    parts.push({ x: enemy.x + (Math.random() - 0.5) * 30 * k, y: enemy.y + 88 * k, vx: 0, vy: 20, grav: 300, life: 1.1, color: '#a8ff60', size: 3 });
  }
  for (let i = enemyShots.length - 1; i >= 0; i--) {
    const s = enemyShots[i];
    s.t += dt * 4.5;
    if (s.t >= 1) { enemyShots.splice(i, 1); explode(player.x, player.y - 10, 16, '#ff4d6d'); }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p.grav) p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.rot !== undefined) p.rot += p.spin * dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    floaters[i].y -= 40 * dt; floaters[i].life -= dt;
    if (floaters[i].life <= 0) floaters.splice(i, 1);
  }
  for (let i = blasts.length - 1; i >= 0; i--) { blasts[i].life -= dt; if (blasts[i].life <= 0) blasts.splice(i, 1); }
  // Damaged hull trails smoke
  if (!calm && G.cur && enemy.y > -9000 && enemy.scars.length && Math.random() < dt * (2 + enemy.scars.length)) {
    const c = enemy.scars[Math.floor(Math.random() * enemy.scars.length)];
    smoke(enemy.x + c.off, enemy.y + c.y, 9);
  }
  fx.shake = Math.max(0, fx.shake - dt * 40);
  fx.flash = Math.max(0, fx.flash - dt * 2);
}

const sprites = new Map();
let sky = null;
// Ships are painted once to an off-screen canvas, then stamped each frame.
function sprite(key, w, h, paint) {
  if (sprites.has(key)) return sprites.get(key);
  const scale = (window.devicePixelRatio || 1) * 2, c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const t = c.getContext('2d');
  t.scale(scale, scale);
  t.translate(w / 2, h / 2);
  paint(t);
  const out = { c, w, h };
  sprites.set(key, out);
  return out;
}
const stamp = (t, sp, x, y, k = 1) => t.drawImage(sp.c, x - (sp.w * k) / 2, y - (sp.h * k) / 2, sp.w * k, sp.h * k);
function path(t, pts) {
  t.beginPath();
  pts.forEach(([x, y], i) => (i ? t.lineTo(x, y) : t.moveTo(x, y)));
  t.closePath();
}
// Brushed metal lit from the upper left: a cross-section gradient across the part.
function metal(t, x0, x1, stops) {
  const g = t.createLinearGradient(x0, 0, x1, 0);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}
const seams = (t, lines, color = 'rgba(0,0,0,.5)', width = 0.7) => {
  t.strokeStyle = color; t.lineWidth = width;
  for (const l of lines) {
    t.beginPath();
    l.forEach(([x, y], i) => (i ? t.lineTo(x, y) : t.moveTo(x, y)));
    t.stroke();
  }
};

function paintFighter(t) {
  t.save();
  for (const side of [-1, 1]) {
    t.save();
    t.scale(side, 1);
    // Swept wing
    path(t, [[7, -12], [50, 30], [52, 42], [20, 37], [7, 37]]);
    t.fillStyle = metal(t, 7, 52, side < 0 ? ['#59636f', '#39424d', '#1d242c'] : ['#a9b3bf', '#6d7885', '#36404b']);
    t.fill();
    t.strokeStyle = 'rgba(10,14,20,.9)'; t.lineWidth = 1; t.stroke();
    seams(t, [[[14, -4], [14, 37]], [[24, 6], [24, 38]], [[36, 17], [36, 40]], [[9, 18], [47, 29]]]);
    // Hazard-orange wing tip
    path(t, [[44, 24], [50, 30], [52, 42], [44, 41]]);
    t.fillStyle = '#c9561f'; t.fill();
    // Wing cannon
    t.fillStyle = metal(t, 37, 42, ['#141a20', '#79838e', '#141a20']);
    t.fillRect(37, 2, 4, 36);
    t.fillStyle = '#0a0d11'; t.fillRect(37.8, 0, 2.4, 4);
    // Engine nacelle
    t.fillStyle = metal(t, 8, 21, side < 0 ? ['#7c8692', '#3b444f', '#12171d'] : ['#20272f', '#c0c9d3', '#39424d']);
    t.beginPath();
    t.moveTo(9, 6); t.quadraticCurveTo(15, -2, 20, 6);
    t.lineTo(21, 44); t.lineTo(8, 44);
    t.closePath(); t.fill();
    t.strokeStyle = 'rgba(0,0,0,.7)'; t.stroke();
    seams(t, [[[8.5, 18], [20.5, 18]], [[8, 31], [21, 31]]]);
    // Engine nozzle
    t.fillStyle = '#0b0e12'; t.fillRect(10, 43, 9, 5);
    t.fillStyle = '#4a525c'; t.fillRect(9, 42, 11, 1.5);
    t.restore();
  }
  // Fuselage
  t.beginPath();
  t.moveTo(0, -60);
  t.bezierCurveTo(5, -44, 10, -26, 11, -8);
  t.lineTo(10, 40); t.lineTo(-10, 40); t.lineTo(-11, -8);
  t.bezierCurveTo(-10, -26, -5, -44, 0, -60);
  t.closePath();
  t.fillStyle = metal(t, -11, 11, ['#39424d', '#8f9aa6', '#eef2f6', '#a4aeba', '#2d353f']);
  t.fill();
  t.strokeStyle = 'rgba(8,12,18,.9)'; t.lineWidth = 1; t.stroke();
  seams(t, [[[-8, -14], [8, -14]], [[-10, 4], [10, 4]], [[-10, 22], [10, 22]], [[0, 4], [0, 40]], [[-3.5, 4], [-3.5, 22]], [[3.5, 4], [3.5, 22]]]);
  // Squadron stripe
  t.fillStyle = 'rgba(201,86,31,.92)';
  t.fillRect(-9.8, 26, 19.6, 4);
  // Nose cone
  t.beginPath();
  t.moveTo(0, -60); t.bezierCurveTo(2.5, -52, 4.6, -46, 5.6, -40); t.lineTo(-5.6, -40); t.bezierCurveTo(-4.6, -46, -2.5, -52, 0, -60);
  t.fillStyle = metal(t, -6, 6, ['#20262d', '#6b7681', '#20262d']); t.fill();
  // Glass canopy with a sky reflection
  t.beginPath(); t.ellipse(0, -22, 5.6, 15, 0, 0, 6.283);
  const glass = t.createLinearGradient(-5, -36, 5, -8);
  glass.addColorStop(0, '#9fdcf5'); glass.addColorStop(0.35, '#1e5d86'); glass.addColorStop(1, '#061723');
  t.fillStyle = glass; t.fill();
  t.strokeStyle = '#20272f'; t.lineWidth = 1.3; t.stroke();
  t.beginPath(); t.ellipse(-1.7, -27, 1.3, 6.5, 0.1, 0, 6.283);
  t.fillStyle = 'rgba(255,255,255,.65)'; t.fill();
  seams(t, [[[-5.5, -18], [5.5, -18]]], '#20272f', 1);
  t.restore();
}

// One fighter with its engine plumes. k scales the whole ship.
function drawFighter(x, y, k, now, lights) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const side of [-1, 1]) {
    const ex = x + side * 14.5 * k, ey = y + 47 * k, len = (30 + Math.sin(now / 35 + side + x) * 6 + Math.random() * 5) * k, wd = 5.5 * k;
    const g = ctx.createLinearGradient(0, ey, 0, ey + len);
    g.addColorStop(0, 'rgba(235,250,255,.95)'); g.addColorStop(0.25, 'rgba(90,190,255,.75)'); g.addColorStop(1, 'rgba(20,70,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ex - wd, ey); ctx.quadraticCurveTo(ex, ey + len * 0.4, ex, ey + len); ctx.quadraticCurveTo(ex, ey + len * 0.4, ex + wd, ey);
    ctx.closePath(); ctx.fill();
    const hr = 20 * k, halo = ctx.createRadialGradient(ex, ey, 0, ex, ey, hr);
    halo.addColorStop(0, 'rgba(90,180,255,.45)'); halo.addColorStop(1, 'rgba(90,180,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(ex - hr, ey - hr, hr * 2, hr * 2);
  }
  ctx.restore();
  stamp(ctx, sprite('fighter', 112, 124, paintFighter), x, y, k);
  // Blinking wing-tip nav lights
  if (lights && Math.floor(now / 700) % 2 === 0) {
    glow(x - 49 * k, y + 36 * k, 7 * k, '255,60,60');
    glow(x + 49 * k, y + 36 * k, 7 * k, '80,255,120');
  }
}

// Missile shape pointing up (-y), centered on its middle, drawn on any context.
function missileShape(t, len) {
  const w = len * 0.22;
  t.fillStyle = '#c23b22';
  path(t, [[-w * 1.6, len * 0.5], [-w / 2, len * 0.18], [w / 2, len * 0.18], [w * 1.6, len * 0.5]]); t.fill(); // fins
  t.fillStyle = metal(t, -w / 2, w / 2, ['#8a939e', '#eef2f6', '#59636f']);
  t.fillRect(-w / 2, -len * 0.3, w, len * 0.8);
  t.fillStyle = '#d8452b';
  path(t, [[-w / 2, -len * 0.3], [0, -len * 0.5], [w / 2, -len * 0.3]]); t.fill(); // warhead
}

// Upgrade slots under the wings, filled inner to outer as the ship powers up.
const RACK_X = [25, 43, 29, 47, 33, 51];
function drawPlayer(now) {
  const { x, y } = player, k = shipScale();
  if (player.glow > 0) { // power-up flash
    const r = 90 * k * (1.4 - player.glow * 0.4);
    ctx.save();
    ctx.globalAlpha = player.glow;
    ctx.strokeStyle = '#7dffa0'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
    ctx.restore();
    glow(x, y, 110 * k, '125,255,160', player.glow * 0.5);
  }
  drawFighter(x, y, k, now, true);
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k);
  for (let i = 0; i < player.racked; i++) {
    const side = i % 2 ? 1 : -1, mx = RACK_X[Math.floor(i / 2)];
    ctx.save();
    ctx.translate(side * mx, mx - 10);
    missileShape(ctx, 13);
    ctx.restore();
  }
  ctx.restore();
}

function drawWings(now) {
  for (const w of wings) drawFighter(w.x, w.y, 0.5 * shipScale(), now, false);
}

function drawMissiles() {
  for (const m of missiles) {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(Math.atan2(m.vy, m.vx) + Math.PI / 2);
    glow(0, 12, 12, '255,170,60', 0.9);
    missileShape(ctx, 18);
    ctx.restore();
  }
}

function glow(x, y, r, rgb, a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.25, `rgba(${rgb},${a * 0.8})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/* ---------- The enemy: a lumpy, warty space bug, nose (mandibles) pointing at the player ---------- */
const BUGS = [
  { skin: '#7d8a2e', mid: '#4d5a17', dark: '#1d2408', blotch: '#3a2f12', wart: '#d6c04e', vein: '#8a1f2a', iris: '#ff9a1f' }, // bile
  { skin: '#8a4a7c', mid: '#55264d', dark: '#1e0a1b', blotch: '#2d3a1a', wart: '#e09ab8', vein: '#3b0a20', iris: '#c6ff3a' }, // bruise
  { skin: '#9a6a36', mid: '#5c3a1a', dark: '#210f05', blotch: '#3d4a20', wart: '#e8b860', vein: '#5a0f18', iris: '#ff3b3b' }, // rot
  { skin: '#5f7a6a', mid: '#36483e', dark: '#0f1a15', blotch: '#5a3e4a', wart: '#c4d690', vein: '#4a1530', iris: '#ffe23a' }, // mold
];
// Small seeded random generator so each bug looks the same every frame.
const rng = seed => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const lumpy = (r, cx, cy, rx, ry, n, rough) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * 6.283, m = 1 + (r() - 0.5) * rough;
  return [cx + Math.cos(a) * rx * m, cy + Math.sin(a) * ry * m];
});
// Smooth closed curve through the midpoints of a polygon.
function blob(t, pts) {
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  t.beginPath();
  const s = mid(pts[pts.length - 1], pts[0]);
  t.moveTo(s[0], s[1]);
  pts.forEach((p, i) => { const m = mid(p, pts[(i + 1) % pts.length]); t.quadraticCurveTo(p[0], p[1], m[0], m[1]); });
  t.closePath();
}
const inBody = (x, y, s = 1) => (x / (172 * s)) ** 2 + (y / (54 * s)) ** 2 < 1;

function paintBug(t, b, k, seed) {
  const r = rng(seed);
  t.scale(k, k);
  t.lineCap = 'round'; t.lineJoin = 'round';
  // Jointed, bristly legs reaching toward the player
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const bx = side * (70 + i * 30), kx = side * (112 + i * 26 + r() * 10), ky = 58 + r() * 12, fx = side * (124 + i * 20 + r() * 8), fy = 88 + r() * 10;
    t.strokeStyle = b.dark; t.lineWidth = 8;
    t.beginPath(); t.moveTo(bx, 30); t.lineTo(kx, ky); t.lineTo(fx, fy); t.stroke();
    t.strokeStyle = b.mid; t.lineWidth = 4;
    t.beginPath(); t.moveTo(bx, 30); t.lineTo(kx, ky); t.lineTo(fx, fy); t.stroke();
    t.fillStyle = b.wart; t.beginPath(); t.arc(kx, ky, 3.5, 0, 6.283); t.fill();
    t.strokeStyle = '#000'; t.lineWidth = 1;
    for (let j = 0; j < 5; j++) { // hairs
      const s = j / 5, hx = kx + (fx - kx) * s, hy = ky + (fy - ky) * s;
      t.beginPath(); t.moveTo(hx, hy); t.lineTo(hx + side * (4 + r() * 4), hy - 3 - r() * 3); t.stroke();
    }
  }
  // Swollen egg sacs on the back
  for (const [sx, sy, sr] of [[-104, -40, 34], [26, -52, 30], [118, -36, 26]]) {
    blob(t, lumpy(r, sx, sy, sr, sr * 0.8, 12, 0.25));
    const g = t.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, 2, sx, sy, sr);
    g.addColorStop(0, b.wart); g.addColorStop(0.6, b.skin); g.addColorStop(1, b.dark);
    t.fillStyle = g; t.fill();
    t.strokeStyle = b.dark; t.lineWidth = 2; t.stroke();
  }
  // Main body
  const body = lumpy(r, 0, 0, 180, 58, 44, 0.24);
  blob(t, body);
  const g = t.createRadialGradient(-50, -25, 10, 0, 0, 200);
  g.addColorStop(0, b.skin); g.addColorStop(0.55, b.mid); g.addColorStop(1, b.dark);
  t.fillStyle = g; t.fill();
  t.save();
  blob(t, body); t.clip();
  for (let i = 0; i < 46; i++) { // mottled blotches
    t.globalAlpha = 0.2 + r() * 0.3;
    t.fillStyle = b.blotch;
    t.beginPath(); t.ellipse((r() * 2 - 1) * 180, (r() * 2 - 1) * 58, 6 + r() * 20, 4 + r() * 10, r() * 3, 0, 6.283); t.fill();
  }
  t.globalAlpha = 0.6; t.strokeStyle = b.vein;
  for (let i = 0; i < 16; i++) { // throbbing veins
    let vx = (r() * 2 - 1) * 170, vy = (r() * 2 - 1) * 50;
    t.lineWidth = 1 + r() * 1.8;
    t.beginPath(); t.moveTo(vx, vy);
    for (let j = 0; j < 4; j++) { const nx = vx + (r() - 0.5) * 50, ny = vy + (r() - 0.5) * 26; t.quadraticCurveTo(vx + (r() - 0.5) * 30, vy + (r() - 0.5) * 30, nx, ny); vx = nx; vy = ny; }
    t.stroke();
  }
  t.globalAlpha = 0.5; t.strokeStyle = b.dark; t.lineWidth = 1.2;
  for (let i = 0; i < 22; i++) { // wrinkles
    const wx = (r() * 2 - 1) * 170, wy = (r() * 2 - 1) * 50;
    t.beginPath(); t.arc(wx, wy, 6 + r() * 12, r() * 6, r() * 6 + 1.4); t.stroke();
  }
  t.globalAlpha = 0.16; t.strokeStyle = '#fff'; t.lineWidth = 3; // slimy sheen
  for (let i = 0; i < 6; i++) { t.beginPath(); t.arc(-60 + i * 22, -10, 40 + r() * 20, 3.6, 4.4); t.stroke(); }
  t.globalAlpha = 1;
  t.restore();
  blob(t, body); t.strokeStyle = b.dark; t.lineWidth = 2.5; t.stroke();
  // Bristles along the outline
  t.strokeStyle = '#000'; t.lineWidth = 1;
  body.forEach(([px, py], i) => { if (i % 2) return; t.beginPath(); t.moveTo(px, py); t.lineTo(px * 1.06 + (r() - 0.5) * 6, py * 1.18 + (r() - 0.5) * 6); t.stroke(); });
  // Warts and pustules
  for (let i = 0, n = 0; i < 300 && n < 34; i++) {
    const wx = (r() * 2 - 1) * 175, wy = (r() * 2 - 1) * 56, wr = 2.5 + r() * 5;
    if (!inBody(wx, wy, 0.95) || (wy > -10 && wy < 28 && Math.abs(wx) < 172) || (Math.hypot(wx, wy + 30) < 26)) continue;
    n++;
    const wg = t.createRadialGradient(wx - wr * 0.3, wy - wr * 0.3, 0.5, wx, wy, wr);
    wg.addColorStop(0, '#fff8d0'); wg.addColorStop(0.35, b.wart); wg.addColorStop(1, b.dark);
    t.fillStyle = wg; t.beginPath(); t.arc(wx, wy, wr, 0, 6.283); t.fill();
    if (r() < 0.35) { t.strokeStyle = '#000'; t.lineWidth = 0.8; t.beginPath(); t.moveTo(wx, wy); t.lineTo(wx + (r() - 0.5) * 10, wy - 5 - r() * 6); t.stroke(); }
  }
  // Fleshy gash that holds the armor cells, rimmed with little teeth
  t.fillStyle = '#1a0306';
  t.beginPath(); t.ellipse(0, 9, 178, 20, 0, 0, 6.283); t.fill();
  t.strokeStyle = 'rgba(214,96,112,.7)'; t.lineWidth = 2.5; t.stroke();
  t.fillStyle = '#e6ddb0';
  for (let x = -160; x <= 160; x += 11) {
    const top = 9 - 20 * Math.sqrt(Math.max(0, 1 - (x / 178) ** 2)), bot = 18 - top;
    path(t, [[x - 3, top], [x, top + 4 + r() * 3], [x + 3, top]]); t.fill();
    path(t, [[x + 2, bot], [x + 5, bot - 4 - r() * 3], [x + 8, bot]]); t.fill();
  }
  // Snout with a drooling maw
  const head = lumpy(r, 0, 46, 62, 28, 16, 0.28);
  blob(t, head);
  const hg = t.createRadialGradient(-12, 36, 4, 0, 46, 66);
  hg.addColorStop(0, b.skin); hg.addColorStop(1, b.dark);
  t.fillStyle = hg; t.fill();
  t.strokeStyle = b.dark; t.lineWidth = 2; t.stroke();
  t.fillStyle = '#2a0306';
  t.beginPath(); t.ellipse(0, 58, 30, 13, 0, 0, 6.283); t.fill();
  t.fillStyle = '#efe6b8';
  for (let x = -24; x <= 24; x += 6) {
    const e = 13 * Math.sqrt(1 - (x / 30) ** 2);
    path(t, [[x - 2.5, 58 - e + 1], [x + (r() - 0.5) * 2, 58 - e + 6 + r() * 4], [x + 2.5, 58 - e + 1]]); t.fill();
    path(t, [[x - 2, 58 + e - 1], [x + (r() - 0.5) * 2, 58 + e - 5 - r() * 3], [x + 2, 58 + e - 1]]); t.fill();
  }
  t.strokeStyle = 'rgba(170,255,90,.75)'; t.lineWidth = 1.6; // slime strands
  for (const sx of [-14, 3, 17]) { t.beginPath(); t.moveTo(sx, 66); t.quadraticCurveTo(sx + 3, 80, sx - 1, 88 + r() * 8); t.stroke(); }
  // Serrated mandibles
  for (const side of [-1, 1]) {
    t.beginPath();
    t.moveTo(side * 22, 50);
    t.quadraticCurveTo(side * 64, 64, side * 10, 100);
    t.quadraticCurveTo(side * 38, 70, side * 16, 62);
    t.closePath();
    const mg = t.createLinearGradient(side * 22, 50, side * 10, 100);
    mg.addColorStop(0, '#d9cf9a'); mg.addColorStop(0.7, '#8a7436'); mg.addColorStop(1, '#2a1d08');
    t.fillStyle = mg; t.fill();
    t.strokeStyle = '#1a1206'; t.lineWidth = 1.5; t.stroke();
    t.fillStyle = '#efe6b8';
    for (let j = 0; j < 4; j++) {
      // Points along the inner edge of the pincer, teeth pointing toward the mouth
      const s = 0.15 + j * 0.2, u = 1 - s;
      const tx = side * (u * u * 16 + 2 * s * u * 38 + s * s * 10), ty = u * u * 62 + 2 * s * u * 70 + s * s * 100;
      path(t, [[tx, ty - 2], [tx - side * 6, ty + 1], [tx, ty + 3]]); t.fill();
    }
  }
}

// Eyes and tentacles are drawn live so they can blink, look at the player and wriggle.
function makeBugParts(seed) {
  const r = rng(seed ^ 0x9e3779b9);
  const eyes = [{ x: (r() - 0.5) * 30, y: -26, r: 24 + r() * 6, ph: r() * 9 }];
  const want = 5 + Math.floor(r() * 5);
  for (let tries = 0; eyes.length < want && tries < 300; tries++) {
    const e = { x: (r() * 2 - 1) * 160, y: -46 + r() * 34, r: 7 + r() * 9, ph: r() * 9 };
    if (inBody(e.x, e.y, 0.88) && eyes.every(o => Math.hypot(o.x - e.x, o.y - e.y) > o.r + e.r + 5)) eyes.push(e);
  }
  eyes.push({ x: -28 - r() * 10, y: 38, r: 4 + r() * 3, ph: r() * 9 }, { x: 24 + r() * 14, y: 36 + r() * 6, r: 3 + r() * 5, ph: r() * 9 }); // lopsided snout eyes
  const nt = 4 + Math.floor(r() * 3);
  const tents = Array.from({ length: nt }, (_, i) => ({ x: -140 + (280 * (i + 0.5 + (r() - 0.5) * 0.5)) / nt, len: 55 + r() * 55, ph: r() * 9, w: 7 + r() * 4 }));
  return { eyes, tents };
}

function drawTentacles(x, y, k, now, b) {
  for (const tn of enemy.tents) {
    const n = 14;
    for (let i = n; i >= 0; i--) {
      const s = i / n, wig = Math.sin(now / 380 + tn.ph + s * 5) * 16 * s;
      const px = x + (tn.x + wig) * k, py = y + (-34 - tn.len * s) * k, pr = (tn.w * (1 - s * 0.8)) * k;
      ctx.fillStyle = i % 2 ? b.mid : b.dark;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.283); ctx.fill();
      if (i % 3 === 1) { ctx.fillStyle = b.wart; ctx.beginPath(); ctx.arc(px + pr * 0.5, py, pr * 0.35, 0, 6.283); ctx.fill(); }
    }
  }
}

function drawEyes(x, y, k, now, b, urgent) {
  for (const e of enemy.eyes) {
    const ex = x + e.x * k, ey = y + e.y * k, er = e.r * k;
    ctx.fillStyle = b.dark;
    ctx.beginPath(); ctx.arc(ex, ey, er * 1.25, 0, 6.283); ctx.fill();
    if ((now / 1000 + e.ph) % 3.7 < 0.14) { // blink
      ctx.fillStyle = b.mid;
      ctx.beginPath(); ctx.arc(ex, ey, er * 1.05, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ex - er, ey); ctx.lineTo(ex + er, ey); ctx.stroke();
      continue;
    }
    const sg = ctx.createRadialGradient(ex - er * 0.3, ey - er * 0.3, er * 0.1, ex, ey, er);
    sg.addColorStop(0, '#f6efc0'); sg.addColorStop(0.7, '#d8c878'); sg.addColorStop(1, '#8a6a30');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(190,20,30,.75)'; ctx.lineWidth = Math.max(0.6, er * 0.07); // bloodshot
    for (let i = 0; i < 5; i++) {
      const a = e.ph * 3 + i * 1.3;
      ctx.beginPath(); ctx.moveTo(ex + Math.cos(a) * er, ey + Math.sin(a) * er);
      ctx.quadraticCurveTo(ex + Math.cos(a + 0.3) * er * 0.7, ey + Math.sin(a + 0.3) * er * 0.7, ex + Math.cos(a) * er * 0.45, ey + Math.sin(a) * er * 0.45);
      ctx.stroke();
    }
    const dx = player.x - ex, dy = player.y - ey, d = Math.hypot(dx, dy) || 1;
    const ix = ex + (dx / d) * er * 0.35, iy = ey + (dy / d) * er * 0.35;
    ctx.fillStyle = urgent ? '#ff2a2a' : b.iris;
    ctx.beginPath(); ctx.arc(ix, iy, er * 0.55, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(ix, iy, er * (urgent ? 0.3 : 0.12), er * 0.48, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.arc(ix - er * 0.22, iy - er * 0.25, er * 0.13, 0, 6.283); ctx.fill();
  }
}

function drawEnemy(now) {
  if (!G.cur || enemy.y < -9000) return;
  const half = hullHalf(), k = half / 190, { x, y } = enemy;
  const urgent = G.duration && G.t / G.duration > 0.75;
  const variant = enemy.seed % BUGS.length, b = BUGS[variant];
  drawTentacles(x, y, k, now, b);
  // Breathing: the body swells slightly
  const breathe = 1 + Math.sin(now / (urgent ? 160 : 520)) * 0.015;
  const w = 2 * half + 30, h = 210 * k;
  stamp(ctx, sprite(`bug${variant}_${k.toFixed(3)}`, w, h, t => paintBug(t, b, k, variant * 977 + 13)), x, y, breathe);
  drawEyes(x, y, k, now, b, urgent);
  // Armor stays the same size for every word, so it never gives away the word's length.
  const cell = (half * 1.7) / CELLS, alive = Math.ceil(CELLS * (1 - G.hitFrac)), cy = y - 2 * k, ch = 22 * k;
  for (let i = 0; i < CELLS; i++) {
    const cx = x - half * 0.85 + i * cell + 1.5, up = i >= CELLS - alive;
    const g = ctx.createLinearGradient(0, cy, 0, cy + ch);
    if (up) { g.addColorStop(0, '#c9f6ff'); g.addColorStop(0.45, '#4fd6f5'); g.addColorStop(1, '#14708c'); }
    else { g.addColorStop(0, '#2a1d1b'); g.addColorStop(1, '#0d0a0a'); }
    ctx.fillStyle = g;
    ctx.fillRect(cx, cy, cell - 3, ch);
  }
  // Oozing wounds where lasers and missiles landed
  for (const s of enemy.scars) {
    const sx = x + s.off, sy = y + s.y;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, s.r);
    g.addColorStop(0, 'rgba(20,40,0,.9)'); g.addColorStop(0.55, 'rgba(60,90,10,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - s.r, sy - s.r, s.r * 2, s.r * 2);
    glow(sx, sy, s.r * 0.75, '150,255,60', 0.35 + Math.random() * 0.3);
  }
  // Glowing breathing holes on the flanks
  const pulse = 0.5 + Math.sin(now / (urgent ? 110 : 400)) * 0.4;
  glow(x - half * 0.97, y - 4 * k, 11 * k, urgent ? '255,40,50' : '150,255,60', pulse);
  glow(x + half * 0.97, y - 4 * k, 11 * k, urgent ? '255,40,50' : '150,255,60', pulse);
}

function paintSky() {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(W)); c.height = Math.max(1, Math.ceil(H));
  const t = c.getContext('2d');
  t.fillStyle = '#04060f'; t.fillRect(0, 0, W, H);
  // Nebula clouds
  const clouds = [['88,44,130', 0.2, 0.25, 0.55, 0.26], ['26,84,140', 0.82, 0.62, 0.6, 0.24], ['150,50,70', 0.62, 0.1, 0.38, 0.13], ['30,110,120', 0.12, 0.82, 0.45, 0.13]];
  t.globalCompositeOperation = 'lighter';
  for (const [rgb, fx, fy, fr, a] of clouds) for (let i = 0; i < 16; i++) {
    const x = (fx + (Math.random() - 0.5) * 0.3) * W, y = (fy + (Math.random() - 0.5) * 0.28) * H, r = fr * Math.max(W, H) * (0.25 + Math.random() * 0.4);
    const g = t.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a * 0.4})`); g.addColorStop(1, `rgba(${rgb},0)`);
    t.fillStyle = g; t.fillRect(0, 0, W, H);
  }
  t.globalCompositeOperation = 'source-over';
  // Faint fixed background stars
  for (let i = 0; i < 500; i++) {
    t.fillStyle = `rgba(${['255,255,255', '190,215,255', '255,225,195'][i % 3]},${0.08 + Math.random() * 0.4})`;
    const r = Math.random() * 1.1 + 0.2;
    t.fillRect(Math.random() * W, Math.random() * H, r, r);
  }
  // A distant planet lit from the upper left
  const pr = Math.max(90, Math.min(W, H) * 0.3), px = W * 0.9, py = H * 0.34;
  t.save();
  t.beginPath(); t.arc(px, py, pr, 0, 6.283); t.clip();
  const body = t.createRadialGradient(px - pr * 0.55, py - pr * 0.55, pr * 0.1, px, py, pr * 1.15);
  body.addColorStop(0, '#6e5a78'); body.addColorStop(0.45, '#35304f'); body.addColorStop(0.8, '#101224'); body.addColorStop(1, '#04060f');
  t.fillStyle = body; t.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  t.globalAlpha = 0.14;
  for (let i = 0; i < 16; i++) { // cloud bands
    t.fillStyle = i % 2 ? '#d7b9a0' : '#23203d';
    t.fillRect(px - pr, py - pr + (i * pr * 2) / 16 + Math.random() * 7, pr * 2, 2 + Math.random() * (pr / 8));
  }
  t.globalAlpha = 1;
  const shade = t.createRadialGradient(px - pr * 0.45, py - pr * 0.45, pr * 0.5, px - pr * 0.1, py - pr * 0.1, pr * 1.3);
  shade.addColorStop(0, 'rgba(4,6,15,0)'); shade.addColorStop(1, 'rgba(4,6,15,.95)');
  t.fillStyle = shade; t.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  t.restore();
  return c;
}

function draw(now, dt) {
  ctx.save();
  if (fx.shake > 0 && !calm) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
  if (!sky) sky = paintSky();
  ctx.fillStyle = '#04060f';
  ctx.fillRect(-30, -30, W + 60, H + 60);
  ctx.drawImage(sky, 0, 0, W, H);
  // Parallax stars drifting past
  for (const s of stars) {
    if (!calm && G.screen !== 'pause') s.y = (s.y + dt * 0.05 * s.z) % 1;
    const twinkle = calm ? 1 : 0.75 + Math.sin(now / 400 + s.x * 90) * 0.25;
    ctx.fillStyle = `rgba(220,232,255,${(0.2 + s.z * 0.7) * twinkle})`;
    const r = 0.5 + s.z * 1.4;
    ctx.fillRect(s.x * W, s.y * H, r, r);
  }
  drawEnemy(now);
  // Laser bolts: soft colored bloom with a white-hot core
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const bolt = (x1, y1, x2, y2, rgb) => {
    ctx.strokeStyle = `rgba(${rgb},.3)`; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = `rgba(${rgb},.85)`; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
  };
  for (const l of lasers) bolt(l.x, l.y, l.x, l.y + 34, l.bad ? '255,60,90' : '90,255,150');
  for (const s of enemyShots) {
    const y = s.y + (player.y - s.y) * s.t, x = s.x + (player.x - s.x) * s.t;
    bolt(x, y, x, y - 30, '170,255,60'); // acid spit
  }
  ctx.restore();
  drawMissiles();
  drawWings(now);
  drawPlayer(now);
  // Smoke and hull fragments
  for (const p of parts) {
    if (p.smoke) {
      const age = 1 - p.life / p.max, r = p.smoke * (0.5 + age * 1.4), a = Math.min(0.28, p.life * 0.32);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(95,92,92,${a})`); g.addColorStop(1, 'rgba(70,70,75,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    } else if (p.shard) {
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = '#59626d';
      ctx.fillRect(-p.shard / 2, -p.shard / 4, p.shard, p.shard / 2);
      ctx.fillStyle = '#ff9a45';
      ctx.fillRect(-p.shard / 2, -p.shard / 4, p.shard * 0.3, p.shard / 2);
      ctx.restore();
    }
  }
  // Fireballs and sparks glow
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of blasts) {
    const k = 1 - b.life / b.max, r = b.r * (0.25 + k * 0.9), a = b.life / b.max;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
    g.addColorStop(0, `rgba(255,250,225,${a})`); g.addColorStop(0.3, `rgba(255,170,60,${a * 0.85})`); g.addColorStop(0.7, `rgba(210,50,15,${a * 0.45})`); g.addColorStop(1, 'rgba(120,10,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
  }
  for (const p of parts) {
    if (p.smoke || p.shard) continue;
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.font = '800 22px "Segoe UI",system-ui,sans-serif';
  for (const f of floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    ctx.fillStyle = f.color || '#ffc94d';
    const fh = Math.min(W / 2, ctx.measureText(f.text).width / 2 + 8); // keep long messages on screen
    ctx.fillText(f.text, Math.max(fh, Math.min(W - fh, f.x)), f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (fx.flash > 0) {
    ctx.fillStyle = `rgba(255,50,80,${fx.flash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  setMusicLevel();
  update(dt);
  draw(now, dt);
  requestAnimationFrame(frame);
}

/* ---------- Title: flame letters shot out by lasers ---------- */
const title = (() => {
  const c = $('titleFx'), t = c.getContext('2d');
  let glyphs = [], beams = [], embers = [], start = 0, running = false, lastNow = 0, cw = 0, ch = 0, size = 0, announced = false, introDone = false;

  function layout() {
    const r = window.devicePixelRatio || 1, box = c.getBoundingClientRect();
    cw = box.width; ch = box.height;
    c.width = cw * r; c.height = ch * r;
    t.setTransform(r, 0, 0, r, 0, 0);
    const lines = cw >= 560 ? ['SPELLING MAYHEM!!!'] : ['SPELLING', 'MAYHEM!!!'];
    const font = px => `900 ${px}px Impact,"Arial Black",sans-serif`;
    size = 100;
    t.font = font(size);
    const widest = Math.max(...lines.map(l => t.measureText(l).width));
    size = Math.min(ch * (lines.length > 1 ? 0.36 : 0.5), (size * cw * 0.96) / widest);
    t.font = font(size);
    glyphs = [];
    lines.forEach((l, row) => {
      let x = (cw - t.measureText(l).width) / 2;
      const y = size * 1.02 * (row + 1) + 8;
      for (let i = 0; i < l.length; i++) {
        // Measuring the running prefix keeps kerning right.
        const nextX = (cw - t.measureText(l).width) / 2 + t.measureText(l.slice(0, i + 1)).width;
        if (l[i] !== ' ') glyphs.push({ ch: l[i], x, y, w: nextX - x, lit: false, seed: Math.random() * 100 });
        x = nextX;
      }
    });
    t.font = font(size);
  }

  const shipX = () => cw / 2, shipY = () => ch - 8;
  const fire = g => beams.push({ x: g.x + g.w / 2, y: g.y - size * 0.4, life: 0.14 });
  const burst = (g, n) => {
    for (let i = 0; i < n; i++) embers.push({ x: g.x + Math.random() * g.w, y: g.y - Math.random() * size * 0.75, vx: (Math.random() - 0.5) * 70, vy: -30 - Math.random() * 90, life: 0.35 + Math.random() * 0.6 });
  };

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastNow) / 1000), age = (now - start) / 1000;
    lastNow = now;
    t.clearRect(0, 0, cw, ch);

    glyphs.forEach((g, i) => {
      if (!g.lit && age > 0.25 + i * 0.13) { g.lit = true; fire(g); burst(g, calm ? 3 : 26); sfx.laser(); sfx.ignite(); }
    });
    if (!announced && glyphs.every(g => g.lit)) {
      announced = true;
      if (audio && audio.state === 'running') {
        introDone = true;
        setTimeout(() => { if (G.screen === 'menu') speak([line('title')]); }, 350);
      }
    }

    // Lasers from the ship to the letter they light
    t.lineCap = 'round';
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.life -= dt;
      if (b.life <= 0) { beams.splice(i, 1); continue; }
      t.strokeStyle = '#ff4d6d'; t.lineWidth = 6; t.globalAlpha = 0.45;
      t.beginPath(); t.moveTo(shipX(), shipY() - 16); t.lineTo(b.x, b.y); t.stroke();
      t.strokeStyle = '#fff'; t.lineWidth = 2; t.globalAlpha = 1;
      t.stroke();
    }

    // Flame letters
    t.font = `900 ${size}px Impact,"Arial Black",sans-serif`;
    t.textAlign = 'left';
    for (const g of glyphs) {
      if (!g.lit) continue;
      const flicker = calm ? 0.5 : 0.5 + 0.5 * Math.sin(now / 70 + g.seed) * Math.sin(now / 113 + g.seed * 2);
      const grad = t.createLinearGradient(0, g.y - size * 0.8, 0, g.y);
      grad.addColorStop(0, '#ff2a00');
      grad.addColorStop(0.42 - flicker * 0.12, '#ff8a00');
      grad.addColorStop(0.78, '#ffd93b');
      grad.addColorStop(1, '#fff6c4');
      t.fillStyle = grad;
      t.shadowColor = '#ff5a00';
      t.shadowBlur = 14 + flicker * 18;
      t.fillText(g.ch, g.x, g.y);
      t.shadowBlur = 0;
      if (!calm && Math.random() < dt * 11) burst(g, 1);
    }

    // Rising embers
    for (let i = embers.length - 1; i >= 0; i--) {
      const p = embers[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) { embers.splice(i, 1); continue; }
      t.globalAlpha = Math.min(1, p.life * 2.2);
      t.fillStyle = p.life > 0.4 ? '#ffd93b' : '#ff5a00';
      t.fillRect(p.x, p.y, 3, 3);
    }
    t.globalAlpha = 1;

    // The ship doing the shooting
    stamp(t, sprite('fighter', 112, 124, paintFighter), shipX(), shipY() - 14, 0.32);
    requestAnimationFrame(frame);
  }

  return {
    play() {
      if (running) return;
      running = true;
      layout();
      beams = []; embers = [];
      start = lastNow = performance.now();
      if (introDone) { announced = true; glyphs.forEach(g => { g.lit = true; }); } // returning to the menu: already burning, silent
      requestAnimationFrame(frame);
    },
    stop() { running = false; },
    // Plain browser tab: the silent intro gets one audible run at the first click or key.
    restart() {
      if (!running || introDone) return;
      layout();
      beams = []; embers = [];
      announced = false;
      start = lastNow = performance.now();
    },
    skipIntro() { introDone = true; },
    resize() { if (running) { const was = glyphs.every(g => g.lit); layout(); if (was) glyphs.forEach(g => { g.lit = true; }); } },
  };
})();

/* ---------- Input ---------- */
function setPause(on) {
  if (on && G.screen === 'play') {
    stopVoice();
    show('pause');
  } else if (!on && G.screen === 'pause') {
    show('play');
    say();
  }
}

addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (G.screen === 'reveal') {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); continueReveal(); }
    return;
  }
  if (G.screen === 'pause') {
    if (e.key === 'Escape') setPause(false);
    return;
  }
  if (G.screen !== 'play') { if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); return; }
  if (e.key === ' ') { e.preventDefault(); if (!e.repeat) say(); return; }
  if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) submit(); return; }
  if (e.key === 'Backspace') { e.preventDefault(); erase(); return; }
  if (e.key === 'Escape') { setPause(true); return; }
  if (e.key === '1') { if (!e.repeat) showDefinition(); return; }
  if (e.repeat) return; // a held key must not spell a run of letters
  if (e.key.length === 1 && norm(e.key).length === 1) { e.preventDefault(); pressLetter(e.key); }
});

$('start').onclick = startMission;
$('again').onclick = startMission;
$('toMenu').onclick = () => show('menu');
$('testVoice').onclick = () => speak([line('test')]);
$('sayBtn').onclick = () => { say(); $('sayBtn').blur(); };
$('defBtn').onclick = () => { showDefinition(); $('defBtn').blur(); };
$('pauseBtn').onclick = () => setPause(true);
$('resume').onclick = () => setPause(false);
$('quit').onclick = () => { show('play'); endMission(false, true); };
$('musicBtn').onclick = () => toggleMusic($('musicBtn'));
$('menuMusicBtn').onclick = () => toggleMusic($('menuMusicBtn'));
$('fireBtn').onclick = () => { submit(); $('fireBtn').blur(); };
$('eraseBtn').onclick = () => { erase(); $('eraseBtn').blur(); };
$('revealGo').onclick = continueReveal;
$('soundBtn').onclick = () => { soundOn = !soundOn; store.set('sound', soundOn); renderHud(); $('soundBtn').blur(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
addEventListener('resize', () => { resize(); title.resize(); });

// On-screen keyboard for tablets and phones (iPads with a trackpad can report a fine pointer, so check for touch too)
if (matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 1 && matchMedia('(any-pointer: coarse)').matches) || /iPad|iPhone/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
  document.documentElement.classList.add('touch');
  const k = $('keys');
  k.classList.remove('hidden');
  k.innerHTML = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map(r => `<div>${[...r].map(c => `<button type="button" data-k="${c}">${c}</button>`).join('')}</div>`).join('');
  k.addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (b) { e.preventDefault(); pressLetter(b.dataset.k); } });
}

/* ---------- Boot ---------- */
if (!window.WORD_LISTS) {
  document.querySelector('#menu .card').innerHTML = '<h2>Word list missing</h2><p class="tag">Keep words.js in the same folder as index.html.</p>';
} else {
  buildMenu();
  renderMusicButtons();
  resize();
  // The title starts immediately. The launcher allows sound from the first moment; a plain
  // browser tab blocks it until the first click or key, so there the title replays with sound.
  unlockAudio();
  title.play();
  if (!audio || audio.state !== 'running') {
    const wake = () => {
      unlockAudio();
      if (!audio || audio.state !== 'running') return; // iOS: not unlocked yet, try again on the next event
      for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) removeEventListener(ev, wake);
      if (G.screen === 'menu') title.restart();
    };
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, wake);
    if (audio) audio.addEventListener('statechange', () => { if (audio.state === 'running') wake(); });
  }
  requestAnimationFrame(frame);
}

// Offline play and "Add to Home Screen" install. Service workers only run on http(s), not from a double-clicked file.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
