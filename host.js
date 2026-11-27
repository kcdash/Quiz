const $ = id => document.getElementById(id), esc = Quiz.esc, L = Quiz.LETTERS;
const SAVE = 'quizhost', UI = 'quizui';
const GRACE = 1500;                     // ms allowed for an answer already in flight when time runs out
const fmt = n => Number(n || 0).toLocaleString('en-CA');
let S, code, title, sub = '', questions = [], rounds = [], intro = { images: [], rules: [] }, opts = { autoReveal: false };
let players = {}, answers = {}, presence = {}, rejoin = {}, hist = {}, meta = {};
let state = { phase: 'setup' }, shownKey = '', slideKey = '', closing = false, allInTimer = null;
let files = {}, filesVer = 0, lastData = null;
const ui = Object.assign({ qs: 1, cs: 1 }, JSON.parse(localStorage.getItem(UI) || '{}'));

/* ---------- Questions file ---------- */
const SAMPLE = {
  q: [
    ['question', 'A', 'B', 'C', 'D', 'answer', 'points', 'time', 'media', 'start', 'end', 'round', 'size'],
    ['Which planet is known as the Red Planet?', 'Venus', 'Mars', 'Jupiter', 'Mercury', 'B', 1000, 10, '', '', '', 1, ''],
    ['What shape is shown on screen?', 'Circle', 'Square', 'Triangle', 'Hexagon', 'C', 1000, 10, 'media/sample.svg', '', '', 1, ''],
    ['Watch the clip. What kind of animal is the main character?', 'Rabbit', 'Squirrel', 'Bear', 'Fox', 'A', 1000, 15, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', 30, 45, 2, ''],
    ['What is the capital of Canada?', 'Toronto', 'Vancouver', 'Ottawa', 'Montréal', 'C', 1000, 10, '', '', '', 2, ''],
    ['How many provinces does Canada have?', '8', '10', '12', '13', 'B', 1000, 15, '', '', '', 3, ''],
    ['Which element has the chemical symbol W?', 'Tungsten', 'Tin', 'Titanium', 'Tellurium', 'A', 2000, 15, '', '', '', 3, 110],
  ],
  rounds: [['round', 'name', 'multiplier'], [1, 'Warm-up', 1], [2, 'Screen time', 1.5], [3, 'Brain burners', 2]],
  intro: [
    ['item', 'value'],
    ['title', 'Trivia Night'],
    ['subtitle', 'Phones out. Thinking caps on.'],
    ['image', 'media/sample.svg'],
    ['rule', 'One phone per team. Join with the game code and your team name.'],
    ['rule', 'Read the question on the big screen, then tap your answer on the phone.'],
    ['rule', 'Your first tap is final. Each team gets one answer per question.'],
    ['rule', 'A correct answer scores points, and a faster one scores more.'],
    ['rule', 'Later rounds are worth more: watch for the ×1.5 and ×2 badges.'],
    ['rule', 'The highest total after the last question wins.'],
  ],
};
const lower = r => (r || []).map(h => String(h == null ? '' : h).replace(/^﻿/, '').trim().toLowerCase());
function parse(data, defTime) {
  const errs = [], out = [], rows = data.q || [];
  if (!rows.length) return { out, rds: [], intro: { images: [], rules: [] }, errs: ['The file is empty.'] };
  const head = lower(rows[0]), col = n => head.indexOf(n);
  for (const need of ['question', 'a', 'b', 'answer']) if (col(need) < 0) errs.push(`Missing column: ${need}`);
  if (errs.length) return { out, rds: [], intro: { images: [], rules: [] }, errs };
  const cell = (r, n) => { const i = col(n); return i < 0 || r[i] == null ? '' : String(r[i]).trim(); };

  // Rounds sheet: round, name, multiplier
  const defs = {};
  if (data.rounds && data.rounds.length) {
    const h = lower(data.rounds[0]), ci = n => h.indexOf(n);
    data.rounds.slice(1).forEach((r, i) => {
      const key = String(r[ci('round')] == null ? '' : r[ci('round')]).trim(); if (!key) return;
      const raw = ci('multiplier') < 0 ? '' : String(r[ci('multiplier')] == null ? '' : r[ci('multiplier')]).trim().replace(/x$/i, '');
      const mult = raw === '' ? 1 : Number(raw);
      if (!(mult > 0)) errs.push(`Rounds sheet row ${i + 2}: multiplier must be a number such as 1, 1.5 or 2 (got "${raw}")`);
      defs[key.toLowerCase()] = { name: ci('name') < 0 ? '' : String(r[ci('name')] || '').trim(), mult: mult > 0 ? mult : 1 };
    });
  }
  const rds = [], index = {};
  let lastKey = '';
  rows.slice(1).forEach((r, i) => {
    const line = i + 2, text = cell(r, 'question');
    if (!text && !L.some(l => cell(r, l.toLowerCase()))) return;              // blank row
    const choices = L.map(l => cell(r, l.toLowerCase()));
    while (choices.length > 2 && !choices[choices.length - 1]) choices.pop();
    const ans = cell(r, 'answer').toUpperCase();
    if (!text) return errs.push(`Row ${line}: question text is empty`);
    if (choices.some(c => !c)) return errs.push(`Row ${line}: a choice is empty`);
    if (!L.slice(0, choices.length).includes(ans)) return errs.push(`Row ${line}: answer must be one of ${L.slice(0, choices.length).join(', ')} (got "${ans}")`);
    const pRaw = cell(r, 'points'), points = pRaw === '' ? 1000 : Number(pRaw);
    if (!(points >= 0)) return errs.push(`Row ${line}: points must be a number (got "${pRaw}")`);
    const time = Math.min(240, Math.max(5, Number(cell(r, 'time')) || defTime));
    const key = cell(r, 'round') || lastKey; lastKey = key;                   // a blank round continues the round above
    if (!(key.toLowerCase() in index)) {
      const d = defs[key.toLowerCase()] || {};
      index[key.toLowerCase()] = rds.length;
      rds.push({ key, name: d.name || (key === '' ? '' : /^\d+$/.test(key) ? 'Round ' + key : key), mult: d.mult || 1 });
    }
    const ri = index[key.toLowerCase()];
    const mRaw = cell(r, 'multiplier').replace(/x$/i, ''), mult = mRaw === '' ? rds[ri].mult : Number(mRaw);
    if (!(mult > 0)) return errs.push(`Row ${line}: multiplier must be a number such as 1, 1.5 or 2 (got "${mRaw}")`);
    const size = Math.min(200, Math.max(50, Number(cell(r, 'size')) || 100));
    out.push({ text, choices, answer: ans, points, mult, time, r: ri, size,
      media: cell(r, 'media'), start: Number(cell(r, 'start')) || 0, end: Number(cell(r, 'end')) || 0 });
  });
  if (!out.length && !errs.length) errs.push('No questions found.');

  const it = { title: '', sub: '', images: [], rules: [] };
  (data.intro || []).forEach(r => {
    const k = String(r[0] == null ? '' : r[0]).trim().toLowerCase(), v = String(r[1] == null ? '' : r[1]).trim();
    if (!v || k === 'item') return;
    if (k === 'title') it.title = v; else if (k === 'subtitle') it.sub = v;
    else if (k === 'image') it.images.push(v); else if (k === 'rule') it.rules.push(v);
  });
  return { out, rds, intro: it, errs };
}
async function readFile(f) {
  const isCsv = /\.csv$/i.test(f.name);
  const wb = isCsv ? XLSX.read(await f.text(), { type: 'string', raw: true }) : XLSX.read(await f.arrayBuffer());
  const rowsOf = n => n ? XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }) : null;
  const find = want => wb.SheetNames.find(n => n.trim().toLowerCase() === want);
  return { q: rowsOf(find('questions') || wb.SheetNames[0]), rounds: rowsOf(find('rounds')), intro: rowsOf(find('intro')) };
}
function useData(data, label) {
  lastData = { data, label };
  const { out, rds, intro: it, errs } = parse(data, Number($('defTime').value) || 10);
  questions = errs.length ? [] : out; rounds = errs.length ? [] : rds; intro = it;
  if (it.title) $('title').value = it.title;
  if (it.sub) $('subtitle').value = it.sub;
  $('errors').textContent = errs.join('\n');
  const named = rds.length > 1 || (rds[0] && rds[0].name);
  $('loaded').textContent = errs.length ? `${label}: fix the rows below and load again.`
    : `${label}: ${out.length} questions ready` + (named ? ` in ${rds.length} round${rds.length > 1 ? 's' : ''} (${rds.map(r => `${r.name} ×${r.mult}`).join(', ')}).` : '.');
  $('create').disabled = !questions.length;
  $('mediaInfo').textContent = mediaReport();
}
$('file').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { useData(await readFile(f), f.name); } catch (err) { $('errors').textContent = 'Could not read that file: ' + err.message; }
};
$('sample').onclick = () => useData(SAMPLE, 'Sample');
$('template').onclick = () => XLSX.writeFile(Quiz.buildTemplate(SAMPLE), 'questions_template.xlsx');
$('defTime').onchange = () => { if (lastData) useData(lastData.data, lastData.label); };

/* ---------- Media ---------- */
const isUrl = u => /^(https?:|data:|blob:)/i.test(u);
const base = u => String(u).split(/[\\/]/).pop().toLowerCase();
const src = u => (isUrl(u) || !files[base(u)] ? u : files[base(u)]);
const ytId = u => (u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/) || [])[1];
function kind(u) {
  if (!u) return '';
  if (ytId(u)) return 'yt';
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)) return 'video';
  if (/\.(mp3|wav|m4a|ogg|aac|flac)(\?|$)/i.test(u)) return 'audio';
  return 'image';
}
function mediaHtml(q) {
  const u = q.media, k = kind(u);
  if (k === 'yt') {
    const t = u.match(/[?&](?:t|start)=(\d+)/);
    const start = q.start || (t ? Number(t[1]) : 0);
    const p = new URLSearchParams({ autoplay: 1, rel: 0, playsinline: 1 });
    if (start) p.set('start', start);
    if (q.end) p.set('end', q.end);
    return `<iframe src="https://www.youtube.com/embed/${ytId(u)}?${p}" allow="autoplay; encrypted-media; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  }
  if (k === 'video') return `<video src="${esc(src(u))}" controls autoplay playsinline></video>`;
  if (k === 'audio') return `<div class="np"><div class="eq"><i></i><i></i><i></i><i></i><i></i></div><div>Listen carefully</div><audio src="${esc(src(u))}" controls autoplay></audio></div>`;
  return k ? `<img src="${esc(src(u))}" alt="">` : '';
}
function wireClip(q) {                  // play only the start–end part of a local video or audio clip
  const m = $('media').querySelector('video,audio'); if (!m) return;
  if (q.start) m.addEventListener('loadedmetadata', () => { m.currentTime = q.start; });
  if (q.end) {
    m.addEventListener('timeupdate', () => { if (m.currentTime >= q.end && !m.paused) m.pause(); });
    m.addEventListener('play', () => { if (m.currentTime >= q.end - 0.25) m.currentTime = q.start || 0; });
  }
}
const needsHost = q => ['yt', 'video', 'audio'].includes(kind(q.media));   // clip plays first, host opens answers
function mediaReport() {
  const local = [...new Set([...questions.map(q => q.media), ...intro.images].filter(u => u && !isUrl(u)))];
  const n = Object.keys(files).length;
  if (!local.length) return n ? `${n} files in the folder. The questions file does not name any of them yet.`
    : 'Pick the folder that holds your images, clips and music. Files stay on this laptop; the questions file refers to them by file name.';
  if (!n) return `The questions file names ${local.length} local file${local.length > 1 ? 's' : ''}. Pick the folder here, or they will load from the website's media folder.`;
  const miss = local.filter(u => !files[base(u)]);
  return miss.length ? `${local.length - miss.length} of ${local.length} files found. Not in the folder: ${miss.join(', ')}. These will load from the website if they are there.`
    : `All ${local.length} media files found in the folder.`;
}
$('folder').onchange = e => {
  Object.values(files).forEach(u => URL.revokeObjectURL(u));
  files = {};
  for (const f of e.target.files) files[f.name.toLowerCase()] = URL.createObjectURL(f);
  filesVer++; shownKey = slideKey = '';
  $('mediaInfo').textContent = mediaReport();
  render();
};
$('pickMedia').onclick = () => $('folder').click();

/* ---------- Persistence ---------- */
const save = () => localStorage.setItem(SAVE, JSON.stringify({ code, title, sub, questions, rounds, intro, opts, hist, meta }));
const path = p => `games/${code}/${p}`;
const setState = patch => { state = { ...state, ...patch }; render(); return S.set(path('state'), state).catch(() => {}); };

/* ---------- Scoring ---------- */
const hasRounds = () => rounds.length > 1 || !!(rounds[0] && rounds[0].name);
const multNote = m => (m === 1 ? '' : m === 2 ? 'Double points ×2' : `×${m} points`);
const isOn = pid => !!presence[pid] && Object.keys(presence[pid]).length > 0;
function totals() {
  const rows = Object.keys(players).map(pid => {
    let total = 0; const byRound = rounds.map(() => 0);
    for (const qi in hist) { const v = (hist[qi] || {})[pid] || 0; total += v; if (questions[qi]) byRound[questions[qi].r] += v; }
    const last = (hist[state.qi] || {})[pid] || 0;
    return { pid, name: players[pid].name, total, byRound, last };
  });
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1; });
  return rows;
}
// Points = base points × round multiplier × speed factor (100% for an instant answer, 50% at the buzzer),
// rounded once to a whole number. Every total shown anywhere is a sum of these stored whole numbers.
function scoreQuestion(qi) {
  const q = questions[qi], limit = state.q.time * 1000, got = answers[qi] || {}, pts = {};
  for (const pid in got) {
    const a = got[pid]; if (!a || !players[pid]) continue;
    const el = Math.max(0, (a.t || 0) - state.startAt);
    pts[pid] = a.c === q.answer && el <= limit + GRACE
      ? Math.round(q.points * q.mult * (1 - 0.5 * Math.min(el, limit) / limit)) : 0;
  }
  return pts;
}
function record(qi, pts, m) {
  hist[qi] = pts; meta[qi] = m; save();
  S.set(path('hist/q' + qi), { pts, ...m }).catch(() => {});          // second copy, off this laptop
}

/* ---------- Game flow ---------- */
function qState(qi) {
  const q = questions[qi], r = rounds[q.r];
  return { qi, total: questions.length, correct: '', roundName: r.name || '', roundNote: multNote(q.mult),
    q: { text: q.text, choices: q.choices, points: q.points, mult: q.mult, max: Math.round(q.points * q.mult), time: q.time } };
}
function startQuestion(qi) {
  closing = false; clearTimeout(allInTimer); allInTimer = null;
  const wait = needsHost(questions[qi]);
  return setState({ ...qState(qi), phase: wait ? 'show' : 'open', startAt: wait ? 0 : S.now() });
}
function begin(qi) {                    // go to question qi, through a round card when a new round starts
  if (hasRounds() && (qi === 0 || questions[qi].r !== questions[qi - 1].r)) {
    const r = rounds[questions[qi].r];
    return setState({ phase: 'round', nextQi: qi, roundName: r.name || '', roundNote: multNote(r.mult) });
  }
  return startQuestion(qi);
}
function after() {                      // whatever follows the current question
  const n = state.qi + 1;
  if (n >= questions.length) return setState({ phase: 'final', finalStep: 0 });
  if (state.phase === 'reveal' && hasRounds() && questions[n].r !== questions[state.qi].r) return setState({ phase: 'board', roundEnd: true });
  return begin(n);
}
const openAnswers = () => setState({ phase: 'open', startAt: S.now() });
function closeQuestion() {
  if (closing || state.phase !== 'open') return;
  closing = true; clearTimeout(allInTimer); allInTimer = null;
  const qi = state.qi;
  record(qi, scoreQuestion(qi), { startAt: state.startAt, time: state.q.time });
  const scores = {};
  totals().forEach(r => { scores[r.pid] = { total: r.total, last: r.last, rank: r.rank, qi }; });
  S.set(path('scores'), scores).catch(() => {});
  return setState({ phase: 'reveal', correct: questions[qi].answer });
}
function next() {
  const p = state.phase;
  if (p === 'lobby') return Object.keys(players).length || confirm('No teams have joined yet. Start anyway?') ? setState({ phase: 'intro' }) : null;
  if (p === 'intro') return setState({ phase: 'rules' });
  if (p === 'rules') return begin(0);
  if (p === 'round') return startQuestion(state.nextQi);
  if (p === 'show') return openAnswers();
  if (p === 'open') return closeQuestion();
  if (p === 'reveal' || p === 'board') return after();
  if (p === 'final') {
    const n = Object.keys(players).length; let s = (state.finalStep || 0) + 1;
    if (s === 1 && n < 3) s = 2;        // no third place to show
    if (s === 2 && n < 2) s = 3;
    if (s <= 4) return setState({ finalStep: s });
  }
}
function toggleBoard() {
  if (state.phase === 'reveal') setState({ phase: 'board', roundEnd: false });
  else if (state.phase === 'board') setState({ phase: 'reveal' });
}
function skip() {
  if (!['show', 'open'].includes(state.phase)) return;
  if (!confirm('Skip this question? Nobody scores on it.')) return;
  closing = true;
  record(state.qi, {}, { skipped: true });
  after();
}
function addTime() {
  if (state.phase === 'open') setState({ q: { ...state.q, time: state.q.time + 10 } });
}

/* ---------- Rendering ---------- */
const SECTIONS = ['setup', 'lobby', 'intro', 'rules', 'round', 'stage', 'board', 'final'];
function show(id) { SECTIONS.forEach(s => $(s).classList.toggle('hidden', s !== id)); }
function render() {
  const p = state.phase, more = state.qi + 1 < questions.length;
  $('controls').classList.toggle('hidden', p === 'setup');
  $('lb').disabled = !['reveal', 'board'].includes(p);
  $('skip').disabled = !['show', 'open'].includes(p);
  $('more').disabled = p !== 'open';
  $('next').disabled = p === 'final' && (state.finalStep || 0) >= 4;
  $('next').textContent = ({ lobby: 'Start ▶ (Space)', intro: 'Rules ▶ (Space)', rules: 'Begin ▶ (Space)', round: 'First question ▶ (Space)',
    show: 'Start the clock ▶ (Space)', open: 'Reveal answer ▶ (Space)',
    reveal: more ? 'Next ▶ (Space)' : 'Results ▶ (Space)', board: more ? 'Next ▶ (Space)' : 'Results ▶ (Space)',
    final: ['Third place ▶', 'Second place ▶', 'Winner ▶', 'Full standings ▶', 'Finished'][state.finalStep || 0] })[p] || 'Next';
  const ids = Object.keys(players), on = ids.filter(isOn).length;
  $('status').textContent = code ? `Game ${code} · ${ids.length} teams, ${on} online` : '';
  renderRejoins();
  if (p === 'setup') return show('setup');
  if (p === 'lobby') return renderLobby();
  if (p === 'intro') return renderIntro();
  if (p === 'rules') return renderRules();
  if (p === 'round') return renderRound();
  if (p === 'board') return renderBoard();
  if (p === 'final') return (state.finalStep || 0) >= 4 ? renderBoard() : renderFinal();
  renderStage();
}
function renderLobby() {
  show('lobby');
  const url = new URL('index.html', location.href); url.search = '?code=' + code;
  $('lobbyTitle').textContent = title;
  $('lobbySub').textContent = sub;
  $('codeBig').textContent = code;
  $('joinUrl').textContent = url.href.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
  if ($('qr').dataset.for !== code) {
    const qr = qrcode(0, 'M'); qr.addData(url.href); qr.make();
    $('qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    $('qr').dataset.for = code;
  }
  const ids = Object.keys(players).sort((a, b) => (players[a].at || 0) - (players[b].at || 0));
  $('teamCount').textContent = ids.filter(isOn).length;
  $('teamWord').textContent = ids.filter(isOn).length === 1 ? 'team' : 'teams';
  $('teams').classList.toggle('many', ids.length > 12);
  $('teams').innerHTML = ids.map(id => `<span data-pid="${esc(id)}" class="${isOn(id) ? '' : 'off'}" title="Click to remove"><i class="dot ${isOn(id) ? '' : 'off'}"></i>${esc(players[id].name)}</span>`).join('');
}
function renderIntro() {
  show('intro');
  const key = 'intro' + filesVer; if (slideKey === key) return; slideKey = key;
  $('introTitle').textContent = title;
  $('introSub').textContent = sub;
  $('introArt').innerHTML = intro.images.length
    ? intro.images.slice(0, 4).map(u => `<img src="${esc(src(u))}" alt="">`).join('')
    : L.map(l => `<div class="tile ch-${l}">${l}</div>`).join('');
}
function rulesList() {
  if (intro.rules.length) return intro.rules;
  const r = ['One phone per team. Join with the game code and your team name.',
    'Read the question on the big screen, then tap your answer on the phone.',
    'Your first tap is final. Each team gets one answer per question.',
    'A correct answer scores points, and a faster one scores more.'];
  if (questions.some(q => q.mult !== 1)) r.push('Some rounds are worth more. Watch for the multiplier badge.');
  r.push('The highest total after the last question wins.');
  return r;
}
function renderRules() {
  show('rules');
  const list = rulesList();
  $('rulesList').style.setProperty('--rf', Math.min(4.2, 46 / list.length) + 'vh');
  $('rulesList').innerHTML = list.map(t => `<li><span>${esc(t)}</span></li>`).join('');
}
function renderRound() {
  show('round');
  const ri = questions[state.nextQi].r, r = rounds[ri], n = questions.filter(q => q.r === ri).length;
  $('roundCount').textContent = `Round ${ri + 1} of ${rounds.length} · ${n} question${n > 1 ? 's' : ''}`;
  $('roundTitle').textContent = r.name || 'Round ' + (ri + 1);
  $('roundBadge').innerHTML = r.mult === 1 ? '<span class="badge plain">Standard points</span>' : `<span class="badge">${esc(multNote(r.mult))}</span>`;
}
function fitText(q) {
  const n = q.text.length, auto = n <= 60 ? 1 : n <= 110 ? .85 : n <= 170 ? .72 : .6;
  const basis = q.media ? 4.4 : 6.6;
  $('qtext').style.fontSize = (basis * auto * (q.size / 100) * ui.qs).toFixed(2) + 'vh';
  const longest = Math.max(...q.choices.map(c => c.length));
  $('choices').style.setProperty('--cs', ((longest > 42 ? .78 : 1) * ui.cs).toFixed(2));
}
function renderStage() {
  show('stage');
  const qi = state.qi, q = questions[qi], p = state.phase, rev = p === 'reveal', got = answers[qi] || {};
  const key = [qi, rev, filesVer].join('|');
  $('stage').classList.toggle('reveal', rev);
  $('stage').classList.toggle('nomedia', !q.media);
  if (shownKey !== key) {
    shownKey = key;
    $('media').innerHTML = rev ? '' : mediaHtml(q);
    if (!rev) wireClip(q);
    $('qtext').textContent = q.text;
    const max = Math.round(q.points * q.mult);
    $('qnum').innerHTML = (state.roundName ? `<b>${esc(state.roundName)}</b> · ` : '') + `Question ${qi + 1} of ${questions.length}`;
    $('qpts').textContent = q.mult === 1 ? `${fmt(max)} points` : `${fmt(q.points)} ×${q.mult} = ${fmt(max)} points`;
    $('qpts').classList.toggle('boost', q.mult !== 1);
    if (rev) renderChart(q, got);
  }
  fitText(q);
  const ids = Object.keys(players), done = ids.filter(id => got[id]);
  $('choices').innerHTML = q.choices.map((c, i) => {
    const l = L[i];
    return `<div class="choice ch-${l} ${rev ? (l === q.answer ? 'win' : 'dim') : ''}"><span class="letter">${l}</span><span>${esc(c)}</span>${rev && l === q.answer ? '<span class="mark">✓</span>' : ''}</div>`;
  }).join('');
  $('answered').innerHTML = p === 'show' ? '' : `<b>${done.length} of ${ids.length}</b> teams answered`;
  $('strip').innerHTML = ids.sort((a, b) => players[a].name.localeCompare(players[b].name))
    .map(id => `<span class="${got[id] ? 'done' : ''} ${isOn(id) ? '' : 'off'}">${esc(players[id].name)}</span>`).join('');
  const allIn = p === 'open' && ids.length && done.length >= ids.length;
  $('hint').textContent = p === 'show' ? 'Press Space after the clip to start the clock'
    : allIn ? 'Every team has answered. Press Space to reveal.' : '';
  $('clock').classList.toggle('idle', p === 'show');
  if (p === 'show') { $('secs').textContent = q.time; $('ring').style.strokeDashoffset = 0; $('clock').classList.remove('low'); }
  if (allIn && opts.autoReveal && !allInTimer) allInTimer = setTimeout(() => { allInTimer = null; closeQuestion(); }, 900);
  if (p === 'open') tick();
}
function renderChart(q, got) {
  const counts = {}; let n = 0;
  for (const pid in got) if (got[pid] && players[pid]) { counts[got[pid].c] = (counts[got[pid].c] || 0) + 1; n++; }
  const top = Math.max(1, ...Object.values(counts)), right = counts[q.answer] || 0, teams = Object.keys(players).length;
  $('bars').innerHTML = q.choices.map((_, i) => {
    const l = L[i], c = counts[l] || 0;
    return `<div class="bcol ${l === q.answer ? 'ok' : ''}"><b>${c}${l === q.answer ? ' ✓' : ''}</b><i style="height:${Math.round(c / top * 78)}%"></i><span class="letter ch-${l}">${l}</span></div>`;
  }).join('');
  $('chartNote').innerHTML = `The answer is <b>${q.answer}: ${esc(q.choices[L.indexOf(q.answer)])}</b> · ${right} of ${teams} team${teams === 1 ? '' : 's'} got it` + (n < teams ? ` · ${teams - n} did not answer` : '');
}
function renderBoard() {
  show('board');
  const fin = state.phase === 'final', rows = totals(), n = rows.length;
  const qi = Math.min(Math.max(state.qi, 0), questions.length - 1), curR = questions[qi].r;
  const played = [...new Set(questions.filter((_, i) => hist[i]).map(q => q.r))];
  const two = n > 13;
  const cols = hasRounds()
    ? played.slice(two ? -2 : -6).map(j => ({ label: rounds[j].name || 'Round ' + (j + 1), get: r => r.byRound[j], cur: !fin && j === curR }))
    : fin ? [] : [{ label: 'This question', get: r => r.last, cur: true }];
  $('boardTitle').textContent = fin ? 'Final standings' : state.roundEnd && state.roundName ? `Scores after ${state.roundName}` : `Scores after question ${state.qi + 1} of ${questions.length}`;
  const per = two ? Math.ceil(n / 2) : n, rh = Math.min(6.4, 70 / (per + 1));
  const t = $('tables');
  t.style.gridTemplateColumns = two ? '1fr 1fr' : '1fr';
  t.style.maxWidth = two ? 'none' : '1200px'; t.style.width = '100%'; t.style.margin = '0 auto';
  t.style.setProperty('--rh', rh + 'vh'); t.style.setProperty('--fs', Math.min(3.3, rh * 0.52) + 'vh');
  const table = part => `<table class="sheet"><thead><tr><th class="l">#</th><th class="l">Team</th>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}<th>Total</th></tr></thead><tbody>` +
    part.map(r => `<tr class="${r.rank === 1 && r.total > 0 ? 'first' : ''}"><td class="rk l">${r.rank}</td><td class="nm l">${esc(r.name)}</td>${cols.map(c => `<td class="${c.cur ? 'cur' : ''}">${fmt(c.get(r))}</td>`).join('')}<td class="tot">${fmt(r.total)}</td></tr>`).join('') + '</tbody></table>';
  t.innerHTML = !n ? '<p class="mute">No teams yet.</p>' : two ? table(rows.slice(0, per)) + table(rows.slice(per)) : table(rows);
}
let confettiDone = false;
function renderFinal() {
  show('final');
  const rows = totals(), step = state.finalStep || 0;
  const key = 'final' + step + rows.slice(0, 3).map(r => r.pid + r.total).join();
  if (slideKey === key) return; slideKey = key;
  $('finalHead').textContent = ['The results are in', 'In third place', 'In second place', rows[0] ? `Champions: ${rows[0].name}` : 'Quiz over'][step];
  // screen order: 2nd, 1st, 3rd. Third place appears at step 1, second at step 2, the winner at step 3.
  $('podium').innerHTML = [1, 0, 2].map(i => {
    const r = rows[i], inn = r && step >= 3 - i;
    return `<div class="slot p${i + 1} ${inn ? 'in' : ''}">${r ? `<div class="nm">${esc(r.name)}</div><div class="sc">${fmt(r.total)} points</div><div class="block">${r.rank}</div>` : ''}</div>`;
  }).join('');
  if (step === 3 && !confettiDone) { confettiDone = true; confetti(9000); }
}
function renderRejoins() {
  const pend = Object.keys(rejoin).filter(d => rejoin[d] && rejoin[d].ok === undefined);
  $('rejoins').innerHTML = pend.map(d => `<div><span><b>${esc(rejoin[d].name)}</b> wants to play from a different phone.</span><button data-allow="${esc(d)}">Allow</button><button class="ghost" data-deny="${esc(d)}">No</button></div>`).join('');
}
function tick() {
  if (state.phase !== 'open' || !state.q) return;
  const T = state.q.time * 1000, left = state.startAt + T - S.now(), frac = Math.max(0, Math.min(1, left / T));
  $('secs').textContent = Math.max(0, Math.ceil(left / 1000));
  $('ring').style.strokeDashoffset = (276.46 * (1 - frac)).toFixed(1);
  $('clock').classList.toggle('low', left < 3500);
  if (left <= -800) closeQuestion();
}
setInterval(tick, 100);

/* ---------- Confetti ---------- */
const FX = { parts: [], until: 0, raf: 0 };
function confetti(ms) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('fx'), ctx = c.getContext('2d'), colours = ['#ffd23f', '#e5484d', '#2f7df6', '#9b5de5', '#2fd17c', '#fff8e7'];
  c.width = innerWidth; c.height = innerHeight;
  FX.until = performance.now() + ms;
  if (FX.raf) return;
  const loop = now => {
    if (now < FX.until) for (let i = 0; i < 7; i++) FX.parts.push({ x: Math.random() * c.width, y: -20, vx: (Math.random() - .5) * 5, vy: 2 + Math.random() * 5,
      w: 8 + Math.random() * 10, h: 5 + Math.random() * 7, a: Math.random() * 6.3, va: (Math.random() - .5) * .35, col: colours[i % colours.length] });
    ctx.clearRect(0, 0, c.width, c.height);
    FX.parts = FX.parts.filter(p => p.y < c.height + 30);
    for (const p of FX.parts) {
      p.x += p.vx; p.y += p.vy; p.vy += .04; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    FX.raf = FX.parts.length || now < FX.until ? requestAnimationFrame(loop) : 0;
  };
  FX.raf = requestAnimationFrame(loop);
}

/* ---------- Results download ---------- */
function downloadResults() {
  const wb = Quiz.buildResults({ title, code, questions, rounds, rows: totals(), hist, meta, answers, players });
  XLSX.writeFile(wb, `quiz-results-${code}.xlsx`);
}

/* ---------- Wiring ---------- */
function listen() {
  S.on(path('players'), v => { players = v || {}; render(); });
  S.on(path('presence'), v => { presence = v || {}; render(); });
  S.on(path('rejoin'), v => { rejoin = v || {}; renderRejoins(); });
  S.on(path('answers'), v => { answers = v || {}; if (state.phase === 'open') renderStage(); });
  S.onConnection(ok => $('off').classList.toggle('hidden', ok));
}
async function boot() {
  $('demo').classList.toggle('hidden', Quiz.LIVE); document.body.classList.toggle('demo', !Quiz.LIVE);
  try { S = await Quiz.connect(); }
  catch (e) { $('errors').textContent = 'Could not reach Firebase. Check config.js and your internet connection.\n' + e.message; return; }
  const saved = JSON.parse(localStorage.getItem(SAVE) || 'null');
  if (saved && saved.code && saved.rounds) {
    $('resumeCard').classList.remove('hidden');
    $('resumeInfo').textContent = `${saved.title} (${saved.code}, ${saved.questions.length} questions)`;
    $('resume').onclick = async () => {
      ({ code, title, sub, questions, rounds, intro, opts, hist, meta } = saved);
      const st = await S.get(path('state'));
      if (!st) return alert('That game no longer exists. Create a new one.');
      const copy = (await S.get(path('hist')).catch(() => null)) || {};     // fill any gap from the online copy
      for (const k in copy) {
        const qi = Number(k.slice(1)); if (hist[qi] || !copy[k]) continue;
        const { pts, ...m } = copy[k]; hist[qi] = pts || {}; meta[qi] = m;
      }
      state = st;
      listen(); render();
    };
  }
}
$('create').onclick = async () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  code = Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
  title = $('title').value.trim() || 'Quiz'; sub = $('subtitle').value.trim();
  opts = { autoReveal: $('auto').checked }; hist = {}; meta = {};
  save();
  try {
    await S.set(path('meta'), { title, total: questions.length, at: S.TS });
    state = { phase: 'lobby', qi: -1, total: questions.length, title };
    await S.set(path('state'), state);
  } catch (e) { state = { phase: 'setup' }; render(); $('errors').textContent = 'Could not create the game: ' + e.message; return; }
  listen(); render();
};
$('teams').onclick = e => {
  const el = e.target.closest('[data-pid]'), pid = el && el.dataset.pid;
  if (!pid || !players[pid] || !confirm(`Remove "${players[pid].name}" from the game?`)) return;
  S.remove(path('names/' + Quiz.nameKey(players[pid].name)));
  S.remove(path('presence/' + pid));
  S.remove(path('players/' + pid));
};
$('rejoins').onclick = async e => {
  const allow = e.target.dataset.allow, deny = e.target.dataset.deny, d = allow || deny;
  if (!d || !rejoin[d]) return;
  const want = Quiz.nameKey(rejoin[d].name);
  const pid = Object.keys(players).find(id => Quiz.nameKey(players[id].name) === want);
  if (deny) return S.set(path('rejoin/' + d), { name: rejoin[d].name, ok: false });
  if (!pid) {                           // name was reserved but the team is gone: free it and let them join normally
    await S.remove(path('names/' + want));
    return S.set(path('rejoin/' + d), { name: rejoin[d].name, ok: true });
  }
  await S.update(path('players/' + pid), { dev: d });
  S.set(path('rejoin/' + d), { name: players[pid].name, pid, ok: true });
};
function font(which, by) {
  ui[which] = Math.min(1.8, Math.max(.5, Math.round((ui[which] + by) * 10) / 10));
  localStorage.setItem(UI, JSON.stringify(ui));
  if (['show', 'open', 'reveal'].includes(state.phase)) renderStage();
}
$('qMinus').onclick = () => font('qs', -.1); $('qPlus').onclick = () => font('qs', .1);
$('cMinus').onclick = () => font('cs', -.1); $('cPlus').onclick = () => font('cs', .1);
$('controls').addEventListener('click', e => e.target.blur && e.target.blur());
$('next').onclick = next; $('lb').onclick = toggleBoard; $('skip').onclick = skip; $('more').onclick = addTime; $('xlsx').onclick = downloadResults;
const fullscreen = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
$('fs').onclick = fullscreen;
document.addEventListener('keydown', e => {
  if (state.phase === 'setup' || e.target.tagName === 'INPUT' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'PageDown') { e.preventDefault(); next(); }
  else if (k === 'l') toggleBoard();
  else if (k === 'k') skip();
  else if (k === 'f') fullscreen();
  else if (k === 't') addTime();
  else if (k === '-') font('qs', -.1); else if (k === '=' || k === '+') font('qs', .1);
  else if (k === '[') font('cs', -.1); else if (k === ']') font('cs', .1);
});
window.addEventListener('beforeunload', e => { if (!['setup', 'final'].includes(state.phase)) e.preventDefault(); });
boot();
