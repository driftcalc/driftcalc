# Tests

Browser tests for driftcalc.com. They load the real pages in Chromium and click
through them. The folder starts with an underscore so GitHub Pages leaves it off
the website.

Run everything from the repo root:

    node _tests/run.js

Run one file, or any whose name contains a word:

    node _tests/run.js quiz

They need Playwright. Claude's cloud sessions already have it. There is no
`package.json` on purpose: the site has no build step and no npm.

| File | What it checks |
|---|---|
| `boot.test.js` | Every page loads with no script errors, no NaN or Infinity on screen, and no sideways scrolling, on a desktop and a phone. |
| `urls.test.js` | Junk in the URL (`?eq=1e400`, `?fee=<script>`, `__proto__`, repeated keys) on every page that reads it. |
| `state.test.js` | Junk in saved data, and bad backup files. The page must still draw, survive a reload, and leave the portfolio alone. |
| `controls.test.js` | Dead controls: every slider, dropdown, number box and toggle is moved, and must change something on the page. |
| `structure.test.js` | Duplicate ids, unlabelled inputs, nameless buttons, skipped headings, missing alt text. Includes the quiz and tour. |
| `index.test.js` | Home page bugs the sweeps can only half see: stale room card and contribution hints, the split-fund picker. |
| `quiz.test.js` | Every path through the setup quiz, plus closing early, starting over, `?setup=1`, and no market data. |
| `tour.test.js` | Every tour stop at three screen sizes, keyboard, folding sections back, empty page. |
| `tour-after-quiz.test.js` | The tour from the "No balances yet" box after the quiz. |
| `nudge.test.js` | The "New here?" pop-up: once only, steps aside for the quiz, returns after it. |

Screenshots land in `_tests/.shots/`, which git ignores.

When `tour.js`, `backtest.js`, `polish.css` or `backtest-page.js` changes, bump
the `?v=` tag where `index.html` or `backtest.html` loads it, so phones holding
an old copy fetch the new one.
