(function () {
  var C = window.MIDTERM_CONFIG, M = window.MIDTERM, Q = M.questions;  // demo set; replaced by the student's own version at sign-in
  var params = new URLSearchParams(location.search);
  var MOCK = params.get('mock') === '1';   // local testing only: fake sign-in + fake backend
    var token = null, login = null, fullName = '', STORE_BASE = 'aic-midterm-answers', STORE = STORE_BASE;
  var reauth = false;                      // true while re-signing in after an expired session
  var $ = function (id) { return document.getElementById(id); };
  var form = $('exam'), N = Q.length, chapters = [], btn = null, rendered = null;

  // ---- render questions (each student gets their own version from the server) ----
  function render(list) {
  var key = JSON.stringify(list); if (key === rendered) return; rendered = key;
  Q = list; N = Q.length; chapters = [];
  var html = '', cur = null;
  Q.forEach(function (q, i) {
    if (q.chapter !== cur) { cur = q.chapter; chapters.push({ ch: cur, first: i });
      html += '<h2 class="ch-head" id="ch-' + cur + '" tabindex="-1">Chapter ' + cur + '<small>' + M.meta.chapters[cur] + '</small></h2>'; }
    html += '<section class="q-card" id="card-' + q.id + '"><fieldset><legend class="q-text"><span class="q-num">Question ' + (i + 1) + '</span><br>' + q.prompt +
      '</legend><div class="q-options">' + q.options.map(function (o) {
        return '<label class="opt"><input type="radio" name="' + q.id + '" value="' + o.id + '"><span class="opt__dot" aria-hidden="true"></span><span>' + o.html + '</span></label>';
      }).join('') + '</div></fieldset></section>';
  });
  html += '<div class="submit-row"><span class="hint" id="hint" aria-live="polite"></span>' +
    '<div class="submit-row__act"><button type="button" class="linkbtn" id="goto-unans" hidden>Go to first unanswered</button>' +
    '<button class="btn" type="submit" id="submit">Submit</button></div></div>';
  form.innerHTML = html;
  $('intro').textContent = 'Chapters 1–8 · ' + N + ' questions · Choose the best answer for each.';
  $('w-count').textContent = N; $('ptrack').setAttribute('aria-valuemax', N);
  $('jump').querySelectorAll('option[value]:not([value=""])').forEach(function (o) { o.remove(); });
  chapters.forEach(function (c) { var o = document.createElement('option'); o.value = c.ch;
    o.textContent = 'Chapter ' + c.ch + ' · ' + M.meta.chapters[c.ch]; $('jump').appendChild(o); });
  btn = $('submit');
  if (typeof refresh === 'function' && $('hint')) refresh();
  }
  render(Q);

  function answers() { var a = {}; Q.forEach(function (q) { var c = form.querySelector('input[name="' + q.id + '"]:checked'); if (c) a[q.id] = c.value; }); return a; }
  function firstUnanswered() { var a = answers(); for (var i = 0; i < N; i++) if (!a[Q[i].id]) return Q[i]; return null; }
  function refresh() {
    var n = Object.keys(answers()).length;
    $('hint').textContent = n === N ? 'All ' + n + ' answered. Ready to submit.' : n + ' of ' + N + ' answered';
    $('pcount').textContent = n + ' of ' + N + ' answered';
    $('pfill').style.width = (100 * n / N) + '%'; $('ptrack').setAttribute('aria-valuenow', n);
    $('goto-unans').hidden = n === N;
    form.querySelectorAll('.opt').forEach(function (l) { l.classList.toggle('is-selected', l.querySelector('input').checked); });
    form.querySelectorAll('.q-card.is-missing').forEach(function (c) { if (c.querySelector('input:checked')) c.classList.remove('is-missing'); });
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(answers())); } catch (e) {} }
  function restore() {
    try { var saved = JSON.parse(localStorage.getItem(STORE) || '{}');
      Object.keys(saved).forEach(function (k) { var el = form.querySelector('input[name="' + k + '"][value="' + saved[k] + '"]'); if (el) el.checked = true; }); } catch (e) {}
    refresh();
  }
  form.addEventListener('change', function () { save(); refresh(); });

  // scroll so the target clears the sticky bar, then focus its first radio
  function goTo(el, focusEl) {
    var bar = $('progressbar').hidden ? 0 : $('progressbar').offsetHeight;
    var y = el.getBoundingClientRect().top + window.pageYOffset - bar - 12;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    (focusEl || el).focus({ preventScroll: true });
  }
  function goToQ(q) { var card = $('card-' + q.id); goTo(card, card.querySelector('input:checked') || card.querySelector('input')); }
  function gotoFirstUnanswered() { var q = firstUnanswered(); if (q) { $('card-' + q.id).classList.add('is-missing'); goToQ(q); } }
  $('goto-unans').addEventListener('click', gotoFirstUnanswered);
  $('jump').addEventListener('change', function () {
    var c = chapters.filter(function (x) { return String(x.ch) === this.value; }, this)[0];
    if (c) goToQ(Q[c.first]); this.value = '';
  });

  // ---- screens ----
  function show(which) {
    ['signin', 'welcome', 'thanks'].forEach(function (id) { $(id).hidden = id !== which; });
    form.hidden = which !== 'exam';
    $('progressbar').hidden = which !== 'exam';
    document.body.classList.toggle('in-exam', which === 'exam');
    if (which === 'exam') form.insertBefore($('status'), form.querySelector('.submit-row')); else form.parentNode.insertBefore($('status'), form);
    document.body.classList.toggle('on-signin', which === 'signin');
  }
  function showStatus(msg, kind, actLabel, act) {
    var s = $('status'), b = $('status-act');
    $('status-msg').textContent = msg || ''; s.className = 'notice' + (kind === 'err' ? ' err' : kind === 'ok' ? ' ok' : ''); s.hidden = !msg;
    b.hidden = !actLabel; b.textContent = actLabel || ''; b.onclick = act || null;
  }
  function signinMsg(msg) { $('signin-msg').textContent = msg || ''; $('signin-msg').hidden = !msg; }

  function switchAccount(e) {
    if (e) e.preventDefault();
    token = null; login = null; adminBanner(false); $('si-pass').value = ''; reauth = false; $('who').hidden = true; showStatus('');
    form.querySelectorAll('input:checked').forEach(function (i) { i.checked = false; }); refresh();
    signinMsg(''); show('signin'); window.scrollTo(0, 0); focusSignin();
  }
  $('switch').addEventListener('click', switchAccount);

  function focusSignin() { setTimeout(function () { ($('si-name').value ? $('si-pass') : $('si-name')).focus(); }, 50); }
  var BADLOGIN = 'That name and password don’t match. Check with Mr. Levy.';

  function friendly(r) {
    var m = (r && r.error) || '';
    if (r && r.alreadySubmitted) return { kind: 'submitted', msg: 'You’ve already submitted this midterm, so it can’t be taken again. If you think that’s a mistake, ask Mr. Levy.', act: 'Sign out', fn: switchAccount };
    if (r && r.badLogin) return { kind: 'badlogin', msg: BADLOGIN };
    if (r && r.locked) return { kind: 'locked', msg: m || 'Too many tries. Wait a few minutes, then try again or check with Mr. Levy.' };
    if ((r && r.expired) || /sign.?in|expired|session/i.test(m)) return { kind: 'expired', msg: m };
    return { kind: 'other', msg: m || 'Something went wrong. Please try again.' };
  }

  function signedIn(tok, user, name) {
    var wasUser = login; token = tok; login = String(user).trim().toLowerCase(); fullName = name || user;
    STORE = STORE_BASE + ':' + login;
    $('who-email').textContent = fullName; $('who').hidden = false; signinMsg('');
    if (reauth && wasUser === login) {   // came back from an expired session: keep answers, return to Submit
      reauth = false; show('exam'); showStatus('You’re signed in again. Your answers are still here. Press Submit to send them.', 'ok');
      goTo(form.querySelector('.submit-row'), btn); return;
    }
    if (!(reauth && wasUser === login)) restore();
    post({ action: 'status' }).then(function (r) {
      if (r && r.questions && r.questions.length) { render(r.questions); restore(); }
      if (r.ok && r.alreadySubmitted) r = { ok: false, alreadySubmitted: true };
      if (!r.ok) { var f = friendly(r);
        if (f.kind === 'expired') { show('signin'); signinMsg('Your sign-in expired. Please sign in again.'); return; }
        show('welcome'); $('welcome').classList.add('is-blocked'); $('begin').hidden = true;
        $('w-name').textContent = first(fullName); $('w-email').textContent = fullName;
        showStatus(f.msg, 'err', f.act, f.fn); return; }
      fullName = r.name || fullName; adminBanner(r.role === 'admin');
      $('welcome').classList.remove('is-blocked'); $('begin').hidden = false;
      $('w-name').textContent = first(fullName); $('w-email').textContent = fullName;
      var n = Object.keys(answers()).length;
      $('begin').textContent = n ? 'Continue Midterm (' + n + ' of ' + N + ' answered)' : 'Begin Midterm';
      show('welcome'); showStatus(''); $('welcome').focus();
    }).catch(function () {
      show('signin'); signinMsg('We couldn’t reach the server. Check your internet connection and try again.');
      showRetry();
    });
  }
  function showRetry() {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'linkbtn'; b.textContent = 'Try again';
    b.onclick = function () { signedIn(token, login, fullName); }; $('signin-msg').appendChild(document.createTextNode(' ')); $('signin-msg').appendChild(b);
  }
  // Admin preview (Sarah / Kelly): graded but not recorded. Banner is built here so index.html needn't change.
  var isAdmin = false;
  function adminBanner(on) {
    isAdmin = !!on; var b = document.getElementById('admin-banner');
    if (!b && on) { b = document.createElement('div'); b.id = 'admin-banner'; b.className = 'admin-banner'; b.setAttribute('role', 'note');
      b.textContent = 'Admin preview — not recorded';
      b.style.cssText = 'position:sticky;top:0;z-index:50;background:#757563;color:#fff;text-align:center;font:600 13px/1.2 "Nunito Sans",sans-serif;letter-spacing:.06em;padding:6px 12px';
      document.body.insertBefore(b, document.body.firstChild); }
    if (b) b.hidden = !on;
  }
  function first(n) { return String(n).split(/[ @]/)[0]; }
  $('begin').addEventListener('click', function () {
    show('exam'); var q = firstUnanswered() || Q[0];
    requestAnimationFrame(function () { goToQ(Object.keys(answers()).length ? q : Q[0]); });
  });

  function post(payload) {
    if (payload.action !== 'login') payload.token = token;
    if (MOCK) return window.__mockBackend ? window.__mockBackend(payload) : Promise.resolve(payload.action === 'login'
      ? { ok: true, token: 'mock-' + Date.now(), name: payload.name, role: 'student' } : { ok: true });
    if (C.CLIENT_SIDE_SCORING && payload.action === 'login') return Promise.resolve({ ok: true, token: 'local', name: payload.name, role: 'student' });
    if (C.CLIENT_SIDE_SCORING && payload.action === 'submit') return Promise.resolve(localScore(payload.answers));
    // text/plain avoids a CORS preflight, which Apps Script cannot answer
    return fetch(C.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); });
  }
  function localScore(a) {
    var K = window.MIDTERM_KEY || {}, s = 0; Q.forEach(function (q) { if (a[q.id] && a[q.id] === K[q.id]) s++; });
    return { ok: true, name: fullName, score: s, total: N, submittedAt: new Date().toISOString(), note: 'scored locally; no email sent' };
  }
  if (C.CLIENT_SIDE_SCORING && !MOCK) { var s = document.createElement('script'); s.src = 'answer-key.js'; document.head.appendChild(s); }

  function resetBtn() { btn.disabled = false; btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); btn.textContent = 'Submit'; refresh(); }
  form.addEventListener('submit', function (e) {
    e.preventDefault(); if (btn.disabled) return;
    var missing = N - Object.keys(answers()).length;
    if (missing) {
      showStatus(missing + (missing === 1 ? ' question is' : ' questions are') + ' still unanswered. Every question needs an answer before you submit.', 'err', 'Go to first unanswered', gotoFirstUnanswered);
      goTo($('status'), $('status-act')); return;
    }
    if (!confirm(isAdmin ? 'Submit this admin preview? It will be graded but not recorded.' : 'Submit your midterm? You can only submit once.')) return;
    btn.disabled = true; btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Sending…';
    $('hint').textContent = 'Sending your answers…'; showStatus('');
    post({ action: 'submit', answers: answers() }).then(function (r) {
      if (!r.ok) { var err = new Error(r.error || 'Submission failed.'); err.r = r; throw err; }
      try { localStorage.removeItem(STORE); } catch (e) {}
      show('thanks');
      $('t-name').textContent = first(r.name || fullName);
      $('t-time').textContent = new Date(r.submittedAt || Date.now()).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      $('t-score').textContent = 'Score: ' + r.score + ' / ' + r.total;
      adminBanner(r.role === 'admin' || isAdmin);
      if (isAdmin) { var tp = $('thanks').querySelector('p'); if (tp && /parent/.test(tp.textContent)) tp.textContent = 'Admin preview: graded only. Nothing was recorded and no emails were sent.'; }
      $('thanks').focus(); window.scrollTo(0, 0);
    }).catch(function (err) {
      resetBtn(); save();
      var f = err.r ? friendly(err.r) : { kind: 'net' };
      if (f.kind === 'expired') {
        showStatus('Your sign-in expired. Don’t worry, your answers are saved. Sign in again to finish submitting.', 'err', 'Sign in again', reSignIn);
      } else if (f.kind === 'net') {
        showStatus('We couldn’t reach the server. Your answers are saved on this device. Check your connection and try again.', 'err', 'Try again', function () { btn.click(); });
      } else showStatus(f.msg, 'err', f.act || 'Try again', f.fn || function () { btn.click(); });
      goTo($('status'), $('status-act'));
    });
  });
  function reSignIn() {
    reauth = true; show('signin'); showStatus(''); window.scrollTo(0, 0);
    signinMsg('Your sign-in expired. Your answers are kept. Sign in again to continue.');
    $('si-name').value = login || ''; $('si-pass').value = '';
    focusSignin();
  }

  // ---- sign-in (first name + password, checked by Apps Script) ----
  show('signin');
  if (/PASTE_/.test(C.APPS_SCRIPT_URL) && !MOCK && !C.CLIENT_SIDE_SCORING) signinMsg('Setup needed: add APPS_SCRIPT_URL in config.js.');
  $('signin-form').addEventListener('submit', function (e) {
    e.preventDefault(); var sb = $('si-submit'); if (sb.disabled) return;
    var name = $('si-name').value.trim().replace(/\s+/g, ' '), pass = $('si-pass').value.trim();
    if (!name || !pass) { signinMsg('Please enter your name and password.'); (name ? $('si-pass') : $('si-name')).focus(); return; }
    sb.disabled = true; sb.classList.add('is-loading'); sb.textContent = 'Signing in…'; signinMsg('');
    post({ action: 'login', name: name, password: pass }).then(function (r) {
      if (!r.ok) { var f = friendly(r); signinMsg(f.kind === 'other' && !r.error ? BADLOGIN : f.msg); $('si-pass').value = ''; $('si-pass').focus(); return; }
      $('si-pass').value = ''; if (r.questions && r.questions.length) render(r.questions); signedIn(r.token, name, r.name || name);
      if (r.role === 'admin') adminBanner(true);
    }).catch(function () { signinMsg('We couldn’t reach the server. Check your internet connection and try again.'); })
      .then(function () { sb.disabled = false; sb.classList.remove('is-loading'); sb.textContent = 'Sign In'; });
  });
  if (MOCK && params.get('auto') === '1') { $('si-name').value = params.get('name') || 'Jordan'; $('si-pass').value = 'mock'; $('si-submit').click(); }
  else focusSignin();
})();
