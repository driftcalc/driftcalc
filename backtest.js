/* Drift Calc — links the calculator to the backtest page.
   The backtester moved to backtest.html so the main page stays about one job:
   where does this month's money go. This only adds the doorway, which is why
   index.html needs no structural change. */
(function () {
'use strict';

/* header link */
var bar = document.querySelector('header .hbtns');
if (bar) {
  var a = document.createElement('a');
  a.className = 'btn ghost tiny';
  a.href = '/backtest.html';
  a.textContent = 'Backtest';
  a.style.textDecoration = 'none';
  bar.insertBefore(a, bar.firstChild);
}

/* a card at the end, so people who scroll find it too */
var s5 = document.getElementById('s5');
if (s5 && s5.parentNode) {
  var sec = document.createElement('section');
  sec.innerHTML =
    '<a href="/backtest.html" style="display:block;text-decoration:none;color:inherit">' +
    '<div class="card" id="btPromo" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;' +
    'cursor:pointer;transition:transform .18s cubic-bezier(.2,.7,.3,1),box-shadow .18s,border-color .18s">' +
      '<svg width="46" height="46" viewBox="0 0 46 46" style="flex:none">' +
        '<rect width="46" height="46" rx="12" fill="#E8F0FE"/>' +
        '<polyline points="10,32 17,26 23,29 30,17 37,13" fill="none" stroke="#2E6BE6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
      '<div style="flex:1;min-width:230px">' +
        '<div class="big-title" style="margin-bottom:3px">Backtest this mix</div>' +
        '<div style="color:var(--muted);font-size:13.5px">Real monthly history back to 1990, plus a leverage lab that shows where borrowing stops paying.</div>' +
      '</div>' +
      '<div style="color:var(--accent);font-weight:600;font-size:14px;white-space:nowrap">Open &rarr;</div>' +
    '</div></a>';
  s5.parentNode.insertBefore(sec, s5.nextSibling);
  var promo = document.getElementById('btPromo');
  promo.addEventListener('mouseenter', function () {
    promo.style.transform = 'translateY(-2px)';
    promo.style.boxShadow = '0 6px 18px rgba(46,107,230,.14)';
    promo.style.borderColor = '#A9C3F2';
  });
  promo.addEventListener('mouseleave', function () {
    promo.style.transform = '';
    promo.style.boxShadow = '';
    promo.style.borderColor = '';
  });
}
})();

