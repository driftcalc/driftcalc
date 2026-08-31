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

  /* fees.html is the shareable one — the number people actually send each other.
     It earns a slot next to Backtest rather than being buried in Extras. */
  var fa = document.createElement('a');
  fa.className = 'btn tiny bt-nav';
  fa.href = '/fees.html';
  fa.style.textDecoration = 'none';
  fa.textContent = 'Fee cost';
  bar.insertBefore(fa, bar.firstChild);
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

  /* The badges read 1, 2, 3. They promised a wizard on a page that is a dashboard,
     and index.html's returning-user path relabels them differently again, so two
     files disagreed about what the numbers meant. The headings already say what
     each section is, so the badges go. */
  order.forEach(function (id) {
    var sec = document.getElementById(id);
    if (!sec) return;
    var chip = sec.querySelector('.step-n');
    if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
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

/* ---------- styling for everything below ---------- */
(function injectCss() {
  var s = document.createElement('style');
  s.textContent =
    /* "Off target" is the product in one number and it was fifth of five. The
       strip is a grid, so `order` moves it without touching the markup. */
    '.stat-strip .stat.answer{order:-1;cursor:pointer;background:var(--accent-soft);' +
      'border-right:1px solid #C9DAFB;position:relative;transition:background .15s}' +
    '.stat-strip .stat.answer:hover{background:#E4EDFD}' +
    '.stat-strip .stat.answer .k{color:var(--accent)}' +
    '.stat-strip .stat.answer .v{font-size:26px;color:var(--accent)}' +
    '.stat-strip .stat.answer::after{content:"Fix it \\2192";position:absolute;right:14px;bottom:13px;' +
      'font-size:11.5px;font-weight:600;color:var(--accent);opacity:.7}' +
    '@media(max-width:760px){.stat-strip .stat.answer::after{display:none}}' +
    /* header overflow menu */
    '.hmore{position:relative}' +
    '.hmenu{position:absolute;right:0;top:calc(100% + 8px);display:none;flex-direction:column;gap:2px;' +
      'background:var(--card);border:1px solid var(--border);border-radius:10px;padding:6px;' +
      'box-shadow:0 10px 30px rgba(16,24,40,.20);z-index:60;min-width:180px}' +
    '.hmore.open .hmenu{display:flex}' +
    '.hmenu .btn{width:100%;text-align:left;color:var(--ink);border-color:transparent;background:transparent;font-size:13px}' +
    '.hmenu .btn:hover{background:var(--hairline)}' +
    '.hmenu .hide-sm{display:block}' +
    /* shared-target notice and the copy button */
    '.sharebar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:0 0 14px;' +
      'padding:13px 16px;border-radius:11px;background:var(--accent-soft);border:1px solid #C9DAFB;' +
      'font-size:13.5px;line-height:1.55}' +
    '.sharebar span{flex:1;min-width:240px}' +
    '.sharerow{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:18px;' +
      'padding-top:16px;border-top:1px solid var(--hairline)}' +
    '.shareok{font-size:13px;color:var(--green,#17A374);font-weight:600;opacity:0;transition:opacity .2s}' +
    '.shareok.on{opacity:1}';
  document.head.appendChild(s);
})();

/* ---------- lead with the answer ----------
   renderDrift() rebuilds #statStrip's innerHTML on every change, so marking up
   those nodes once does not survive. Re-tag on mutation, and delegate the click
   to the container, which is never replaced. */
(function leadWithTheAnswer() {
  var strip = document.getElementById('statStrip');
  if (!strip) return;

  function tag() {
    var cells = strip.querySelectorAll('.stat');
    for (var i = 0; i < cells.length; i++) cells[i].classList.remove('answer');
    /* identified by its label, not its position, so re-ordering the strip
       upstream can never promote the wrong number */
    for (var j = 0; j < cells.length; j++) {
      var k = cells[j].querySelector('.k');
      if (k && /off target/i.test(k.textContent)) { cells[j].classList.add('answer'); break; }
    }
  }
  tag();
  new MutationObserver(tag).observe(strip, { childList: true });

  strip.addEventListener('click', function (e) {
    var cell = e.target.closest ? e.target.closest('.stat') : null;
    if (!cell || !cell.classList.contains('answer')) return;
    var s3 = document.getElementById('s3');
    if (!s3) return;
    setOpen(s3, true);
    saveOpen();
    s3.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();

/* ---------- put each tool where it is actually used ---------- */
(function relocate() {
  /* The compounding picture is a projection, not a decision, and it was the
     largest thing above the fold on a page about this month. It belongs with
     the other what-ifs. */
  var growth = document.getElementById('growth');
  var growthCard = growth && growth.closest && growth.closest('.card');
  var s5body = document.querySelector('#s5 .sec-body');
  if (growthCard && s5body) s5body.appendChild(growthCard);

  /* Contribution room is not a side calculation. It is a limit on the answer
     step 3 gives you, so it should be sitting next to the inputs, where it can
     stop you before you over-contribute rather than after. */
  var room = document.getElementById('roomBody');
  var roomCard = room && room.closest && room.closest('.card');
  var s3body = document.querySelector('#s3 .sec-body');
  if (roomCard && s3body) s3body.appendChild(roomCard);
})();

/* ---------- header: two destinations, everything else behind one button ----------
   It was carrying a place to go, a privacy claim, two file utilities, a demo
   toggle and a donation link, all at equal weight — and on a phone the tail of
   that list scrolled off screen, so it may as well not have existed. */
(function tidyHeader() {
  var bar = document.querySelector('header .hbtns');
  if (!bar) return;
  var spill = [].slice.call(bar.children).filter(function (el) {
    if (el.tagName === 'INPUT') return false;          /* hidden file picker must stay where it is */
    return !el.classList.contains('bt-nav') && !el.classList.contains('badge');
  });
  if (spill.length < 2) return;

  var wrap = document.createElement('div');
  wrap.className = 'hmore';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn ghost tiny';
  btn.textContent = '\u22EF';
  btn.setAttribute('aria-label', 'More options');
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  var menu = document.createElement('div');
  menu.className = 'hmenu';
  spill.forEach(function (el) { menu.appendChild(el); });
  wrap.appendChild(btn);
  wrap.appendChild(menu);
  bar.appendChild(wrap);

  function close() { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = !wrap.classList.contains('open');
    wrap.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  menu.addEventListener('click', function () { setTimeout(close, 0); });
})();

/* ---------- Extras was a junk drawer ----------
   Five unrelated calculators under one heading that said nothing. Two of them
   are about what you are paying, three are about what happens if you change
   something. Naming those two ideas is most of the work — a heading that says
   "What this costs you" tells you whether to open it; "Extras" never did.
   Runs after relocate(), so the compounding chart it moved in is included. */
(function groupExtras() {
  var body = document.querySelector('#s5 .sec-body');
  if (!body) return;

  var css = document.createElement('style');
  css.textContent =
    '.xgroup{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);' +
      'font-weight:600;margin:26px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--hairline)}' +
    '.sec-body > .xgroup:first-child{margin-top:4px}';
  document.head.appendChild(css);

  function cardOf(id) {
    var el = document.getElementById(id);
    return el && el.closest ? el.closest('.card') : null;
  }

  var groups = [
    ['What this costs you', ['feesBody', 'aumBody'], '/fees.html'],
    ['What if', ['waitBody', 'plannerBody', 'growth']]
  ];

  groups.forEach(function (g) {
    var cards = g[1].map(cardOf).filter(Boolean);
    if (!cards.length) return;
    var h = document.createElement('div');
    h.className = 'xgroup';
    h.textContent = g[0];
    /* the cost group has a standalone, linkable version — point at it */
    if (g[2]) {
      var more = document.createElement('a');
      more.href = g[2];
      more.textContent = 'open the shareable version \u2192';
      more.style.cssText = 'float:right;text-transform:none;letter-spacing:0;font-weight:600;color:var(--accent);text-decoration:none';
      h.appendChild(more);
    }
    body.appendChild(h);
    var row = document.createElement('div');
    row.className = 'ovr';
    cards.forEach(function (c) { row.appendChild(c); });
    body.appendChild(row);
  });

  /* the original two-column wrappers are empty once their cards have moved */
  [].slice.call(body.querySelectorAll('.ovr')).forEach(function (o) {
    if (!o.children.length && o.parentNode) o.parentNode.removeChild(o);
  });
})();

/* ---------- shareable target allocation ----------
   The one thing on this page worth sending someone is the target: 90/10, 38%
   international, 22% tilt. So it goes in the URL and nothing else does.

   Balances stay out on purpose. "Your data never leaves this browser" is the
   whole promise of the site, and a link carrying someone's account values would
   quietly break it — links get pasted into group chats and screenshotted. The
   target is an opinion about percentages. That is safe to hand around. */
(function shareTarget() {
  var s2 = document.getElementById('s2');
  if (!s2 || typeof S === 'undefined' || !S) return;

  function clamp(v, lo, hi) {
    v = parseFloat(v);
    if (!isFinite(v)) return null;
    return Math.min(hi, Math.max(lo, Math.round(v)));
  }

  /* ---- reading a shared link ---- */
  var q = new URLSearchParams(location.search);
  if (q.has('eq') || q.has('intl') || q.has('tilt')) {
    var eq = clamp(q.get('eq'), 0, 100);
    var intl = clamp(q.get('intl'), 0, 60);
    var tilt = clamp(q.get('tilt'), 0, 40);

    /* keep what they had so arriving on a link is never destructive */
    var prev = { preset: S.preset, equityPct: S.equityPct, intlPct: S.intlPct, tiltPct: S.tiltPct };

    if (eq != null) S.equityPct = eq;
    if (intl != null) S.intlPct = intl;
    if (tilt != null) S.tiltPct = tilt;
    S.preset = (S.tiltPct > 0) ? 'Factor tilt' : 'Market portfolio';
    if (typeof save === 'function') save();
    if (typeof renderAll === 'function') renderAll();

    var bar = document.createElement('div');
    bar.className = 'sharebar';
    var txt = document.createElement('span');
    txt.textContent = 'Someone shared this target with you: ' + S.equityPct + '/' + (100 - S.equityPct) +
      ' stocks and bonds, ' + (S.intlPct == null ? 38 : S.intlPct) + '% international' +
      ((S.tiltPct || 0) > 0 ? ', ' + S.tiltPct + '% small-cap value' : '') +
      '. No account balances came through the link. Those never leave your browser.';
    var undo = document.createElement('button');
    undo.className = 'btn tiny';
    undo.type = 'button';
    undo.textContent = 'Put mine back';
    undo.addEventListener('click', function () {
      S.preset = prev.preset; S.equityPct = prev.equityPct;
      S.intlPct = prev.intlPct; S.tiltPct = prev.tiltPct;
      if (typeof save === 'function') save();
      if (typeof renderAll === 'function') renderAll();
      history.replaceState(null, '', location.pathname);
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    });
    bar.appendChild(txt);
    bar.appendChild(undo);
    if (s2.parentNode) s2.parentNode.insertBefore(bar, s2);
  }

  /* ---- handing one out ---- */
  var body = s2.querySelector('.sec-body');
  if (!body) return;
  var row = document.createElement('div');
  row.className = 'sharerow';
  var btn = document.createElement('button');
  btn.className = 'btn';
  btn.type = 'button';
  btn.textContent = 'Copy a link to this target';
  var ok = document.createElement('span');
  ok.className = 'shareok';
  ok.textContent = 'Copied. Balances are not in it.';

  btn.addEventListener('click', function () {
    var p = new URLSearchParams();
    p.set('eq', String(S.equityPct));
    p.set('intl', String(S.intlPct == null ? 38 : S.intlPct));
    p.set('tilt', String(S.tiltPct || 0));
    var url = location.origin + location.pathname + '?' + p.toString();
    function flash() {
      ok.classList.add('on');
      setTimeout(function () { ok.classList.remove('on'); }, 2200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(flash, flash);
    } else {
      var tmp = document.createElement('input');
      tmp.value = url; document.body.appendChild(tmp); tmp.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(tmp); flash();
    }
  });

  row.appendChild(btn);
  row.appendChild(ok);
  body.appendChild(row);
})();

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

/* ---------- type an exact number into the three dials ----------
   The dials were range inputs and nothing else, so wanting exactly 20% meant
   dragging until the readout agreed. The number beside each slider is now
   click-to-edit. Click it, or tab to it and press Enter, type a number, press
   Enter. Escape backs out and changes nothing. */
(function typeableDials() {
  if (typeof S === 'undefined' || !S) return;

  var st = document.createElement('style');
  st.textContent =
    '.split-read.editable{cursor:text;border-bottom:1px dashed var(--faint,#93A1B5);border-radius:3px;padding:0 3px}' +
    '.split-read.editable:hover,.split-read.editable:focus{background:var(--accent-soft,#E8F0FE);' +
      'border-bottom-color:var(--accent,#2E6BE6);outline:none}' +
    '.split-read input{font:inherit;width:3.2em;text-align:center;border:1px solid var(--accent,#2E6BE6);' +
      'border-radius:5px;padding:1px 3px;background:#fff;color:var(--ink,#0B1F3B)}';
  document.head.appendChild(st);

  var DIALS = [
    { id:'splitRead', min:0, max:100, hint:'percent in stocks',
      get:function(){ return S.equityPct; },
      set:function(v){ onSlider(v); } },
    { id:'intlRead', min:0, max:60, hint:'percent of stocks held international',
      get:function(){ return S.intlPct == null ? 38 : S.intlPct; },
      set:function(v){ onIntlSlider(v); } },
    { id:'tiltRead', min:0, max:40, hint:'percent of stocks in small-cap value',
      get:function(){ return S.tiltPct || 0; },
      set:function(v){ onTiltSlider(v); } }
  ];

  DIALS.forEach(function (d) {
    var el = document.getElementById(d.id);
    if (!el) return;
    el.classList.add('editable');
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('title', 'Click to type an exact ' + d.hint);

    function open() {
      if (el.querySelector('input')) return;
      var was = el.textContent;
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.inputMode = 'numeric';
      inp.value = String(Math.round(d.get()));
      inp.setAttribute('aria-label', 'Exact ' + d.hint);
      el.textContent = '';
      el.appendChild(inp);
      inp.focus();
      inp.select();

      var done = false;
      function close(commit) {
        if (done) return;
        done = true;
        var raw = inp.value;
        if (el.contains(inp)) el.removeChild(inp);
        /* put the old text back first, then let the app's own render overwrite it */
        el.textContent = was;
        if (!commit) return;
        var n = parseFloat(raw);
        if (!isFinite(n)) return;
        n = Math.min(d.max, Math.max(d.min, Math.round(n)));
        d.set(n);
      }

      inp.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== 'Escape') return;
        /* the same keypress bubbles to the span, whose handler opens the editor.
           Without this it closes and immediately reopens. */
        e.preventDefault();
        e.stopPropagation();
        close(e.key === 'Enter');
        el.focus();
      });
      inp.addEventListener('blur', function () { close(true); });
    }

    el.addEventListener('click', open);
    el.addEventListener('keydown', function (e) {
      if (e.target !== el) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
})();
