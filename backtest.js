/* Drift Calc — page structure, the doorway to the backtest, and copy tightening.
   Runs last, after index.html's own inline script, so anything it decides here
   is final. Styling for all of it lives in polish.css.

   Three jobs:
     1. one consistent section order: what you want, then what you have,
        then what to do about it, then the side math
     2. every section collapses, and the closed state is remembered
     3. a link to the backtest page that reads as a place to go */
(function () {
'use strict';

/* ---------- header link ---------- */
var bar = document.querySelector('header .hbtns');
if (bar) {
  var a = document.createElement('a');
  a.className = 'btn tiny bt-nav';
  a.href = '/backtest.html';
  a.style.textDecoration = 'none';
  a.innerHTML = '<span style="opacity:.85;margin-right:5px">&#9650;</span>Backtest';
  bar.insertBefore(a, bar.firstChild);
}

/* ---------- make every section collapse the same way ----------
   index.html ships s1 and s2 with a .sec-body wrapper and a clickable header.
   s3 and s5 never got one, so half the page collapsed and half did not. Wrap
   whatever follows the header and give them the same affordance. */
function makeCollapsible(id) {
  var sec = document.getElementById(id);
  if (!sec) return;
  var head = sec.querySelector('.sec-head');
  if (!head) return;

  if (!sec.querySelector('.sec-body')) {
    var body = document.createElement('div');
    body.className = 'sec-body';
    while (head.nextSibling) body.appendChild(head.nextSibling);
    sec.appendChild(body);
  }
  if (!head.classList.contains('collapser')) {
    head.classList.add('collapser');
    if (!head.querySelector('.chev')) {
      var chev = document.createElement('span');
      chev.className = 'chev';
      head.appendChild(chev);
    }
  }
  /* Own the click rather than leaving index.html's inline onclick in place, so
     open and closed always go through the same path and always get saved. */
  /* A div with an onclick is invisible to a keyboard and to a screen reader.
     Announce it as a button and make Enter and Space work. */
  var body = sec.querySelector('.sec-body');
  if (body && !body.id) body.id = id + '-body';
  head.setAttribute('role', 'button');
  head.setAttribute('tabindex', '0');
  if (body) head.setAttribute('aria-controls', body.id);

  function toggle(e) {
    if (e && e.target && e.target.closest && e.target.closest('a,button,input,select')) return;
    setOpen(sec, sec.classList.contains('closed'));
    saveOpen();
  }
  head.onclick = toggle;
  head.onkeydown = function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    e.preventDefault();
    toggle(e);
  };
}

/* The CSS animates max-height, which needs a number to animate to. A fixed
   ceiling would silently clip a long section — Extras is five cards, and the
   contribution results grid grows with the number of accounts. So the ceiling
   only exists while closed; an open section is released to its natural height. */
function setOpen(sec, open) {
  var bd = sec.querySelector('.sec-body');
  var hd = sec.querySelector('.sec-head');
  if (open) {
    sec.classList.remove('closed');
    if (bd) bd.style.maxHeight = 'none';
  } else {
    sec.classList.add('closed');
    if (bd) bd.style.maxHeight = '';
  }
  if (hd) hd.setAttribute('aria-expanded', String(open));
}

['s2', 's1', 's3', 's5'].forEach(makeCollapsible);

/* ---------- one order, every visit ----------
   index.html has a returning-user path that promotes contribute to the top.
   Two different layouts for the same page is most of why this felt hard to
   navigate, so there is now exactly one: target, holdings, action, extras. */
(function reorder() {
  var order = ['s2', 's1', 's3', 's5'];
  var first = document.getElementById(order[0]);
  if (!first || !first.parentNode) return;
  var wrap = first.parentNode;
  var prev = null;
  order.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el || el.parentNode !== wrap) return;
    if (prev) wrap.insertBefore(el, prev.nextSibling);
    prev = el;
  });

  /* renumber so the badges match the new reading order */
  var chips = { s2:'1', s1:'2', s3:'3', s5:'+' };
  Object.keys(chips).forEach(function (id) {
    var sec = document.getElementById(id);
    if (!sec) return;
    var chip = sec.querySelector('.step-n');
    if (chip) chip.textContent = chips[id];
  });
})();

/* ---------- headings that say what the section is for ---------- */
var TITLES = {
  s2: ['Target allocation', 'What you want to hold, as percentages.'],
  s1: ['Your accounts', 'What you actually hold today, account by account.'],
  s3: ['This month', 'Where new money goes, or what has drifted.'],
  s5: ['Extras', 'Side math people ask about. Nothing here is required.']
};
Object.keys(TITLES).forEach(function (id) {
  var sec = document.getElementById(id);
  if (!sec) return;
  var h2 = sec.querySelector('.sec-head h2');
  var sub = sec.querySelector('.sec-head .sub');
  if (h2) h2.textContent = TITLES[id][0];
  /* never stomp a live summary the app wrote for itself */
  if (sub && !/[0-9]%/.test(sub.textContent) && sub.textContent.indexOf('$') < 0) {
    sub.textContent = TITLES[id][1];
  }
});

/* ---------- remember what was open ----------
   Whitelisted ids only. Anything else in storage is ignored rather than
   trusted, so a corrupt or hand-edited value cannot reach the DOM. */
var KEY = 'driftcalc-open-v1';
var IDS = ['s1', 's2', 's3', 's5'];

function saveOpen() {
  try {
    var open = IDS.filter(function (id) {
      var el = document.getElementById(id);
      return el && !el.classList.contains('closed');
    });
    localStorage.setItem(KEY, JSON.stringify(open));
  } catch (e) {}
}

function hasData() {
  try {
    var S = JSON.parse(localStorage.getItem('driftcalc-v1') || 'null');
    if (!S || S.isSample || !S.accounts || !S.accounts.length) return false;
    return S.accounts.some(function (acc) {
      return (acc.holdings || []).some(function (h) { return (+h.bal || 0) > 0; });
    });
  } catch (e) { return false; }
}

(function restoreOpen() {
  var saved = null;
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (Array.isArray(raw)) saved = raw.filter(function (id) { return IDS.indexOf(id) > -1; });
  } catch (e) {}

  /* First run: open the target section, because that is the one decision the
     whole tool depends on. Returning with real balances: open this month's
     action and leave the setup folded away. */
  if (!saved) saved = hasData() ? ['s3'] : ['s2'];

  IDS.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) setOpen(el, saved.indexOf(id) > -1);
  });
})();

/* ---------- the big call to action ---------- */
var cta = document.createElement('a');
cta.className = 'bt-cta';
cta.href = '/backtest.html';
cta.innerHTML =
  '<span class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none">' +
    '<polyline points="3,17 8,12 12,14 17,6 21,3" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="21" cy="3" r="2" fill="#fff"/></svg></span>' +
  '<div style="flex:1;min-width:200px">' +
    '<h3>See what this mix actually did</h3>' +
    '<p>Real returns going back decades, plus a leverage lab.</p>' +
  '</div>' +
  '<span class="go">Open backtest &rarr;</span>';

var ovr = document.getElementById('overview');
var s5 = document.getElementById('s5');
/* sits at the bottom now: the page should finish on a next step, not open with one */
if (s5 && s5.parentNode) s5.parentNode.insertBefore(cta, s5.nextSibling);
else if (ovr && ovr.parentNode) ovr.parentNode.insertBefore(cta, ovr.nextSibling);

/* ---------- copy: shorter, and says what the thing does ---------- */
var hp = document.querySelector('.hero p');
if (hp && /A drift calculator|Put in your accounts/.test(hp.textContent)) {
  hp.textContent = 'Set a target, enter what you hold, and see where this month\u2019s money should go.';
}

/* ---------- reveal on scroll ----------
   Marks sections as they come into view so they fade up instead of just being
   there. Fires once each. If IntersectionObserver is missing, everything is
   simply shown, so nothing can end up invisible. */
(function reveal() {
  var targets = [].slice.call(document.querySelectorAll('section, .bt-cta, #overview .card'));
  if (!targets.length) return;
  if (!('IntersectionObserver' in window)) return;

  targets.forEach(function (el, i) {
    var box = el.getBoundingClientRect();
    if (box.top < window.innerHeight - 40) { el.classList.add('seen'); return; }
    el.classList.add('reveal');
    if (i % 3 === 1) el.classList.add('reveal-d1');
    if (i % 3 === 2) el.classList.add('reveal-d2');
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('seen');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

  targets.forEach(function (el) { io.observe(el); });

  /* Safety net: if anything is still hidden after a few seconds (observer
     never fired, odd browser), show it rather than leave a blank page. */
  setTimeout(function () {
    targets.forEach(function (el) { el.classList.add('seen'); });
  }, 4000);
})();
})();


