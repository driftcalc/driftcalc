/* Drift Calc — the doorway to the backtest page, copy tightening, and the
   scroll reveal. The backtester lives at backtest.html so this page stays about
   one job. Styling for all of it is in polish.css. */
(function () {
'use strict';

/* ---------- header link ---------- */
var bar = document.querySelector('header .hbtns');
if (bar) {
  var a = document.createElement('a');
  a.className = 'btn tiny bt-nav';
  a.href = '/backtest.html';
  a.style.textDecoration = 'none';
  a.innerHTML = '<span style="opacity:.85;margin-right:5px">&#9650;</span>Backtest &amp; leverage';
  bar.insertBefore(a, bar.firstChild);
}

/* ---------- the big call to action ---------- */
var cta = document.createElement('a');
cta.className = 'bt-cta';
cta.href = '/backtest.html';
cta.innerHTML =
  '<span class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none">' +
    '<polyline points="3,17 8,12 12,14 17,6 21,3" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="21" cy="3" r="2" fill="#fff"/></svg></span>' +
  '<div style="flex:1;min-width:220px">' +
    '<h3>See what this mix actually did</h3>' +
    '<p>A hundred years of real returns, and a leverage lab that shows where borrowing stops paying.</p>' +
  '</div>' +
  '<span class="go">Open backtest &rarr;</span>';

var ovr = document.getElementById('overview');
var s1 = document.getElementById('s1');
if (ovr && ovr.parentNode && ovr.style.display !== 'none') ovr.parentNode.insertBefore(cta, ovr.nextSibling);
else if (s1 && s1.parentNode) s1.parentNode.insertBefore(cta, s1);

/* the dashboard is hidden until there is data; move the CTA under it once it appears */
if (ovr) {
  new MutationObserver(function () {
    if (ovr.style.display !== 'none' && cta.previousElementSibling !== ovr) {
      ovr.parentNode.insertBefore(cta, ovr.nextSibling);
    }
  }).observe(ovr, { attributes:true, attributeFilter:['style'] });
}

/* ---------- copy: shorter, and says what the thing does ---------- */
var COPY = {
  s1sum: 'Every account, and the funds you hold or could buy in each.',
  s2sum: 'Start from a framework, then make it yours.',
};
Object.keys(COPY).forEach(function (id) {
  var el = document.getElementById(id);
  /* only replace the static default — never stomp a live summary the app wrote */
  if (el && /Add each account|Pick a starting framework/.test(el.textContent)) el.textContent = COPY[id];
});

Array.prototype.forEach.call(document.querySelectorAll('.sec-head .sub'), function (el) {
  var t = el.textContent.trim();
  if (t.indexOf('Route new money') === 0) el.textContent = 'Route new money, or check drift without touching anything.';
  if (t.indexOf('The side math') === 0) el.textContent = 'The side math people actually ask about.';
});

var h = document.querySelector('.hero p');
if (h && h.textContent.indexOf('A drift calculator') === 0) {
  h.textContent = 'Put in your accounts, your target, and this month\u2019s number. It shows how far you\u2019ve drifted and where the new money should go. The arithmetic is the tool\u2019s job. The decisions stay yours.';
}

/* ---------- reveal on scroll ----------
   Sections below the fold fade up as you reach them. Fires once each.
   If IntersectionObserver is missing, nothing is hidden in the first place. */
(function reveal() {
  var targets = [].slice.call(document.querySelectorAll('section, .bt-cta'));
  if (!targets.length || !('IntersectionObserver' in window)) return;

  targets.forEach(function (el, i) {
    /* whatever is already on screen keeps the normal entrance; only things
       further down get the scroll treatment */
    if (el.getBoundingClientRect().top < window.innerHeight - 40) { el.classList.add('seen'); return; }
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

  /* Safety net. If the observer never fires for any reason, show everything
     rather than leave someone staring at a blank page. */
  setTimeout(function () {
    targets.forEach(function (el) { el.classList.add('seen'); });
  }, 4000);
})();
})();

