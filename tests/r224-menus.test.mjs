// R2.0.24 — recommencer la partie depuis le menu, reprise systématique sur l'écran d'accueil (demandes de l'utilisateur,
// 2026-10-12) : « un bouton qui permet de recommencer la partie avec Oui Non de validation, accessible depuis le menu » ;
// « si l'on revient à l'écran d'accueil, systématiquement, on propose de reprendre la partie en cours ou de recommencer
// une nouvelle partie ».
//
// Locks: the pure transitions of the application machine (src/progress.ts: restart, continue prompt on every welcome
// entry with a saved run, Oui / Non before discarding it, review sessions never write), the dialogs (in-game MENU
// « Recommencer la partie » + Oui / Non view in src/menudialog.ts, welcome « Vraiment ? » confirmation and the run line
// of the continue question in src/welcome.ts, original strings first) and the wiring in the compiled main.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const P = await import('../.compiled/progress.js');
const W = await import('../.compiled/welcome.js');
const M = await import('../.compiled/menudialog.js');
const read = file => fs.readFileSync(file, 'utf8');

const SIZES = [5, 5, 5, 6, 6, 6, 7, 7, 7, 7, 7, 7, 1]; // the pack's 13 stages (as tests/r221-progress)
const run = (stage, level, score = 0, lives = 3) => ({ stage, level, score, lives });
const ROMAIN = { name: 'Romain', maxStage: 4 };
const boot = (o = {}) => P.initialApp({ profile: ROMAIN, save: null, scores: P.defaultScores(), sizes: SIZES, startLives: 3, review: null, ...o });
const kinds = effects => effects.map(e => e.kind);
const effect = (effects, kind) => effects.find(e => e.kind === kind);
const WRITES = ['save-run', 'save-profile', 'save-scores', 'record-score'];
/** Applies events in order; returns the last { state, effects } and every effect seen. */
const play = (state, events) => {
  let r = { state, effects: [] };
  const all = [];
  for (const ev of events) { r = P.reduceApp(r.state, ev); all.push(...r.effects); }
  return { ...r, all };
};
/** State on a level of `saved`, resumed from the welcome question. */
const onLevel = (saved, extra = {}) => {
  const { state } = boot({ save: saved, ...extra });
  return P.reduceApp(state, { kind: 'continue' }).state;
};

// ------------------------------------------------------------ welcome: the question on every entry with a saved run

test('boot with a saved run: the continue question is shown at once (launch, reload); none without a save', () => {
  const saved = boot({ save: run(3, 2, 15000, 2) });
  assert.equal(saved.state.screen, 'welcome');
  assert.equal(saved.state.prompt, 'continue');
  assert.deepEqual(saved.effects, []);
  assert.equal(boot().state.prompt, null, 'no saved run: nothing is shown');
  // First launch: the name first, then the question when a run is saved.
  const first = P.initialApp({ profile: null, save: run(1, 0, 500, 3), scores: [], sizes: SIZES, startLives: 3, review: null });
  assert.equal(first.state.prompt, 'name');
  const named = P.reduceApp(first.state, { kind: 'name', name: 'Zoé' });
  assert.equal(named.state.prompt, 'continue', 'the question follows the name dialog');
  const noSave = P.reduceApp(P.initialApp({ profile: null, save: null, scores: [], sizes: SIZES, startLives: 3, review: null }).state, { kind: 'name', name: 'Zoé' });
  assert.equal(noSave.state.prompt, null);
  // Platform first name at boot or reported later (D-12): the question all the same.
  const platform = P.initialApp({ profile: null, save: run(1, 0, 500, 3), scores: [], sizes: SIZES, startLives: 3, review: null, platformName: 'Romain' });
  assert.equal(platform.state.prompt, 'continue');
  const later = P.reduceApp(first.state, { kind: 'profile-detected', name: 'Romain' });
  assert.equal(later.state.prompt, 'continue');
  // A rename from the welcome line (prompt null) does not reopen a dismissed question.
  const dismissed = P.reduceApp(saved.state, { kind: 'prompt-close' }).state;
  assert.equal(P.reduceApp(dismissed, { kind: 'name', name: 'Zoé' }).state.prompt, null);
});

test('back on the welcome from the adventure screen (Menu principal): the question again while a run is saved', () => {
  const lv = onLevel(run(5, 3, 40000, 2));
  const back = play(lv, [{ kind: 'leave' }, { kind: 'main-menu' }]);
  assert.equal(back.state.screen, 'welcome');
  assert.equal(back.state.prompt, 'continue');
  assert.deepEqual(back.state.run, run(5, 3, 40000, 2));
  // After a game over the run is gone: the welcome shows no question.
  const over = play(onLevel(run(5, 3, 40000, 1)), [{ kind: 'gameover', score: 41000, date: '' }, { kind: 'leave' }, { kind: 'main-menu' }]);
  assert.equal(over.state.screen, 'welcome');
  assert.equal(over.state.prompt, null);
  // After the ending (final route clears the run): no question.
  const fin = play(onLevel(run(12, 0, 200000, 2), { profile: { name: 'Romain', maxStage: 12 } }), [
    { kind: 'won', score: 230000, lives: 2, date: '' }, { kind: 'temple-done' }, { kind: 'ending-done' },
  ]);
  assert.equal(fin.state.screen, 'welcome');
  assert.equal(fin.state.prompt, null);
});

test('« Rejouer » asks Oui / Non: Non returns to the question, Oui discards the saved run; Escape closes the question only', () => {
  const ask = boot({ save: run(3, 2, 15000, 2) }).state;
  const confirm = P.reduceApp(ask, { kind: 'new-game-ask' });
  assert.equal(confirm.state.prompt, 'confirm-new');
  assert.deepEqual(confirm.effects, [], 'nothing is discarded before Oui');
  assert.deepEqual(confirm.state.run, run(3, 2, 15000, 2));
  const no = P.reduceApp(confirm.state, { kind: 'new-game-cancel' });
  assert.equal(no.state.prompt, 'continue');
  assert.deepEqual(no.effects, []);
  assert.deepEqual(no.state.run, run(3, 2, 15000, 2));
  const yes = P.reduceApp(confirm.state, { kind: 'new-game' });
  assert.equal(yes.state.run, null);
  assert.equal(yes.state.prompt, null);
  assert.equal(yes.state.screen, 'adventure');
  assert.deepEqual(yes.effects, [{ kind: 'save-run', run: null }]);
  // While the confirmation is up the other dialog events do nothing.
  for (const ev of [{ kind: 'continue' }, { kind: 'adventure' }, { kind: 'name', name: 'X' }, { kind: 'new-game-ask' }, { kind: 'prompt-close' }]) {
    assert.equal(P.reduceApp(confirm.state, ev).state, confirm.state, ev.kind);
  }
  // Out of place: no question → ask / cancel ignored.
  const plain = boot().state;
  for (const ev of [{ kind: 'new-game-ask' }, { kind: 'new-game-cancel' }, { kind: 'prompt-close' }]) assert.equal(P.reduceApp(plain, ev).state, plain, ev.kind);
  // Escape on the question: closed, nothing written, the run stays; Aventure leads to the same question.
  const closed = P.reduceApp(ask, { kind: 'prompt-close' });
  assert.equal(closed.state.prompt, null);
  assert.deepEqual(closed.effects, []);
  assert.deepEqual(closed.state.run, run(3, 2, 15000, 2));
  assert.equal(P.reduceApp(closed.state, { kind: 'adventure' }).state.prompt, 'continue');
  // « Continuer » still resumes the run with its score and lives.
  const cont = P.reduceApp(ask, { kind: 'continue' });
  assert.equal(cont.state.screen, 'level');
  assert.deepEqual(effect(cont.effects, 'start-level').run, run(3, 2, 15000, 2));
});

// ------------------------------------------------------------ in game: « Recommencer la partie »

test('restart (Oui in the in-game menu): a new adventure from 1-1, score 0, the start lives, the saved run replaced, no score submitted', () => {
  const lv = onLevel(run(7, 4, 88000, 2));
  const r = P.reduceApp(lv, { kind: 'restart' });
  assert.equal(r.state.screen, 'level');
  assert.deepEqual(r.state.run, run(0, 0, 0, 3));
  assert.deepEqual(r.effects, [{ kind: 'save-run', run: run(0, 0, 0, 3) }, { kind: 'start-level', run: run(0, 0, 0, 3) }]);
  assert.equal(effect(r.effects, 'save-scores'), undefined, 'the abandoned score never enters the table');
  assert.equal(effect(r.effects, 'record-score'), undefined, 'nor the shared records');
  assert.deepEqual(r.state.scores, lv.scores);
  assert.deepEqual(r.state.profile, lv.profile, 'unlocked doors kept');
  assert.equal(r.state.selected, 0);
  // Only on the level screen.
  for (const st of [boot().state, boot({ save: run(1, 1) }).state, P.reduceApp(boot().state, { kind: 'adventure' }).state]) {
    assert.equal(P.reduceApp(st, { kind: 'restart' }).state, st);
  }
  // Without stages (procedural levels): level 1 again, nothing saved.
  const proc = P.reduceApp(P.initialApp({ profile: ROMAIN, save: null, scores: [], sizes: [], startLives: 3, review: null }).state, { kind: 'adventure' }).state;
  const rp = P.reduceApp({ ...proc, run: run(0, 6, 9000, 1) }, { kind: 'restart' });
  assert.deepEqual(rp.effects, [{ kind: 'start-level', run: run(0, 0, 0, 3) }]);
});

test('review sessions (?level=) write nothing: restart, the welcome dialogs and their answers', () => {
  const review = boot({ review: run(4, 2, 0, 3) }).state;
  const r = P.reduceApp(review, { kind: 'restart' });
  assert.deepEqual(kinds(r.effects), ['start-level']);
  assert.deepEqual(r.effects.filter(e => WRITES.includes(e.kind)), []);
  const reviewWelcome = { ...boot({ save: run(2, 1, 100, 3) }).state, review: true };
  const seen = play(reviewWelcome, [{ kind: 'new-game-ask' }, { kind: 'new-game-cancel' }, { kind: 'new-game-ask' }, { kind: 'new-game' }]);
  assert.deepEqual(seen.all.filter(e => WRITES.includes(e.kind)), []);
});

test('the new events never mutate the state they receive', () => {
  const script = [
    { kind: 'new-game-ask' }, { kind: 'new-game-cancel' }, { kind: 'prompt-close' }, { kind: 'adventure' }, { kind: 'continue' },
    { kind: 'restart' }, { kind: 'leave' }, { kind: 'main-menu' }, { kind: 'new-game-ask' }, { kind: 'new-game' },
  ];
  let st = boot({ save: run(2, 3, 9000, 2) }).state;
  for (const ev of script) {
    const before = structuredClone(st);
    const next = P.reduceApp(st, ev).state;
    assert.deepEqual(st, before, `${ev.kind} did not mutate its input`);
    st = next;
  }
});

// ------------------------------------------------------------ dialogs

const PACK = {
  HELP: 'Aide', BACK_TO_MAIN_MENU: 'Retour au menu principal', BACK_TO_GAME: 'Retour à la partie', DIALOG_BUTTON_YES: 'OUI', DIALOG_BUTTON_NO: 'NON',
  'ARE_YOU_SURE_?': 'Vraiment ?', NEW_GAME: 'Rejouer', SM_CONTINUE: 'Continuer', LEVEL: 'Niveau', SCORE: 'Score :',
  YOUR_GAME_WAS_SAVED_WHEN_YOU_QUIT: "Votre partie a été sauvegardée la dernière fois que vous l'avez quittée. Si vous ne la reprenez pas maintenant, elle sera perdue.&cr;&cr;&cr;&cr;",
};
const F = M.MENU_LAYOUT.frame;
const inside = r => r.x >= F.x && r.y >= F.y && r.x + r.w <= F.x + F.w && r.y + r.h <= F.y + F.h;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('in-game MENU with the restart option: « Recommencer » beside « Aide » (two halves), inside the frame, disjoint; default lists unchanged', () => {
  for (const strings of [PACK, null]) {
    const w = M.menuWidgets('menu', strings, { restart: true });
    assert.deepEqual(w.map(x => x.id), ['music', 'sfx', 'fullscreen', 'pixels', 'help', 'restart', 'main-menu', 'back']);
    const restart = w.find(x => x.id === 'restart');
    assert.equal(restart.label, 'Recommencer', 'the long « Recommencer la partie » runs over the button caps; the question names the run');
    assert.equal(restart.kind, 'button');
    assert.ok(restart.enabled);
    const help = w.find(x => x.id === 'help');
    assert.equal(help.rect.y, restart.rect.y, 'one row');
    assert.ok(help.rect.x < restart.rect.x, 'Aide on the left');
    assert.equal(help.rect.x, M.MENU_LAYOUT.content.x);
    assert.equal(restart.rect.x + restart.rect.w, M.MENU_LAYOUT.content.x + M.MENU_LAYOUT.content.w, 'the row spans the content width');
    assert.equal(help.rect.w, restart.rect.w, 'two equal halves');
    for (const x of w) assert.ok(inside(x.rect), `${x.id} inside the frame`);
    for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) assert.ok(!overlap(w[i].rect, w[j].rect), `${w[i].id} / ${w[j].id}`);
  }
  // The option is opt-in (in game only): default and out-of-game lists keep their R2.0.21 widgets.
  assert.deepEqual(M.menuWidgets('menu', null).map(w => w.id), ['music', 'sfx', 'fullscreen', 'pixels', 'help', 'main-menu', 'back']);
  assert.ok(!M.menuWidgets('menu', null, { restart: true, inGame: false }).some(w => w.id === 'restart'), 'never out of game');
  assert.deepEqual(M.menuWidgets('menu', null, { restart: false }), M.menuWidgets('menu', null));
});

test('restart view: OUI left / NON right (original DIALOG_BUTTON_YES / NO), confirm geometry; composed title and question', () => {
  const w = M.menuWidgets('restart', PACK);
  assert.deepEqual(w.map(x => [x.id, x.label]), [['restart-yes', 'OUI'], ['restart-no', 'NON']]);
  assert.deepEqual(M.menuWidgets('restart', null).map(x => x.label), ['OUI', 'NON'], 'fallbacks');
  const leave = M.menuWidgets('confirm', null);
  assert.deepEqual(w.map(x => x.rect), leave.map(x => x.rect), 'same rectangles as the leave confirmation');
  const calls = [];
  const ctx = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'measureText') return s => ({ width: String(s).length * 8 });
      if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...args) => { calls.push({ op: prop, args }); };
    },
    set() { return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const state = { view: 'restart', music: 0, sfx: 1, fullscreen: false, pixelated: false, hover: null, pressed: null, focus: 'restart-no', tips: [], badge: '', options: { restart: true } };
  M.composeMenuDialog(null, state, canvas, 1);
  const texts = calls.filter(c => c.op === 'fillText').map(c => c.args[0]);
  assert.ok(texts.includes('Recommencer ?'), 'title');
  assert.ok(texts.includes('Voulez-vous vraiment') && texts.includes('recommencer la partie ?'), 'question on two lines');
  assert.ok(texts.includes('OUI') && texts.includes('NON'));
});

test('welcome confirmation: « Vraiment ? » + YOUR_GAME_WAS_SAVED_WHEN_YOU_QUIT, OUI left / NON right, inside the frame', () => {
  const w = W.confirmNewDialogWidgets(PACK);
  assert.deepEqual(w.map(x => [x.id, x.label]), [['new-yes', 'OUI'], ['new-no', 'NON']]);
  assert.deepEqual(W.confirmNewDialogWidgets(null).map(x => x.label), ['OUI', 'NON']);
  for (const x of w) assert.ok(inside(x.rect));
  assert.deepEqual(w.map(x => x.rect), W.continueDialogWidgets(PACK).map(x => x.rect), 'the buttons of the question');
  const measure = s => s.length * 7;
  const layout = W.welcomePromptLayout('confirm-new', PACK, measure);
  assert.equal(layout.title, 'Vraiment ?');
  assert.ok(layout.lines.length >= 2, 'wrapped');
  assert.ok(layout.lines.every(l => !l.includes('&cr;') && measure(l) <= M.MENU_LAYOUT.content.w));
  assert.match(layout.lines.join(' '), /elle sera perdue\.$/);
  assert.equal(W.welcomePromptLayout('confirm-new', null, measure).title, 'Vraiment ?', 'fallback');
});

test('continue question shows the saved level and score (LEVEL / SCORE strings); drawn with the vector fallback', () => {
  assert.deepEqual(W.continueRunLines(PACK, run(1, 2, 12345, 2)), ['Niveau 2-3', 'Score : 12345']);
  assert.deepEqual(W.continueRunLines(null, run(0, 0, 0, 3)), ['Niveau 1-1', 'Score : 0']);
  assert.deepEqual(W.continueRunLines(PACK, null), []);
  assert.deepEqual(W.continueRunLines(PACK, run(1, 2, -5, 2)), ['Niveau 2-3', 'Score : 0'], 'bounded');
  const calls = [];
  const ctx = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'measureText') return s => ({ width: String(s).length * 8 });
      if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...args) => { calls.push({ op: prop, args }); };
    },
    set() { return true; },
  });
  W.drawContinueDialog(ctx, null, { kind: 'continue', text: '', caret: false, hover: null, pressed: null, focus: 'continue', run: run(1, 2, 12345, 2) }, PACK);
  const texts = calls.filter(c => c.op === 'fillText').map(c => c.args[0]);
  assert.ok(texts.includes('Niveau 2-3') && texts.includes('Score : 12345'));
  calls.length = 0;
  W.drawConfirmNewDialog(ctx, null, { kind: 'confirm-new', text: '', caret: false, hover: null, pressed: null, focus: 'new-no' }, PACK);
  const t2 = calls.filter(c => c.op === 'fillText').map(c => c.args[0]);
  assert.ok(t2.includes('Vraiment ?') && t2.includes('OUI') && t2.includes('NON'));
});

// ------------------------------------------------------------ wiring in main.js

/** Body of a compiled method, up to the closing brace at its indentation. */
const method = (src, signature) => {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature.trim()} compiled`);
  const end = src.indexOf('\n    }', start);
  return src.slice(start, end > 0 ? end : undefined);
};

test('main.js: MENU offers « Recommencer » in game only; Oui drops the engine and dispatches restart, Non and Escape return to the menu', () => {
  const main = read('.compiled/main.js');
  assert.match(method(main, '    menuOptions() {'), /restart: this\.app\.screen === 'level'/);
  const act = method(main, '    menuActivate(id) {');
  assert.match(act, /case 'restart':\s*state\.view = 'restart';\s*state\.focus = 'restart-no';/, 'Oui / Non, NON focused');
  assert.match(act, /case 'restart-no':\s*state\.view = 'menu';\s*state\.focus = 'restart';/);
  const yes = act.slice(act.indexOf("case 'restart-yes':"));
  assert.match(yes, /^case 'restart-yes':\s*this\.closeMenu\(\);\s*this\.engine = null;\s*this\.dispatch\(\{ kind: 'restart' \}\);\s*return;/);
  assert.match(act, /id === 'restart' \|\| id === 'restart-yes' \|\| id === 'restart-no'/, 'button sound');
  assert.match(method(main, '    menuKey(code) {'), /state\.view === 'restart'\)\s*this\.menuActivate\('restart-no'\)/, 'Escape = Non');
  assert.doesNotMatch(main, /kind: 'restart'[^}]*score/, 'no score travels with the restart');
});

test('main.js: welcome dialogs — Rejouer asks first, OUI / NON answer, Escape = Non / closes the question through the machine, run line drawn', () => {
  const main = read('.compiled/main.js');
  const act = method(main, '    promptActivate(id) {');
  assert.match(act, /id === 'new-game'\) \{\s*this\.dispatch\(\{ kind: 'new-game-ask' \}\);/);
  assert.match(act, /id === 'new-yes'\) \{\s*this\.dispatch\(\{ kind: 'new-game' \}\);/);
  assert.match(act, /id === 'new-no'\) \{\s*this\.dispatch\(\{ kind: 'new-game-cancel' \}\);/);
  assert.equal(main.match(/kind: 'new-game' \}/g)?.length, 1, "the saved run is discarded from the OUI button only");
  const keys = method(main, '    welcomeKey(code) {');
  assert.match(keys, /kind === 'confirm-new'/);
  assert.match(keys, /this\.promptActivate\('new-no'\)/, 'Escape = NON');
  assert.match(keys, /kind: 'prompt-close'/);
  assert.doesNotMatch(main, /this\.app = \{ \.\.\.this\.app, prompt: null \}/, 'no presentation-side state edit');
  assert.match(method(main, '    promptKind() {'), /'confirm-new'/);
  assert.match(method(main, '    promptWidgetAt(kind, p) {'), /confirmNewDialogWidgets\(/);
  assert.match(method(main, '    syncPrompt() {'), /'new-no'/, 'NON focused when the confirmation opens');
  const draw = method(main, '    drawWelcomeFrame(time) {');
  assert.match(draw, /drawConfirmNewDialog\(/);
  assert.match(draw, /run: this\.app\.run/);
});
