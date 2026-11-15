# Handoff — the site tour and setup quiz

You are picking up driftcalc.com as Justin's development team, starting a new piece of work.
Read this, then `CLAUDE.md` and `HANDOFF-SITE.md` in the same folder. All three are
gitignored local notes; never commit them.

---

## 1. What you are building, and why

**The problem.** The site has roughly 33 lifetime visits. Someone who lands on it sees a
multi-section calculator pre-filled with sample data and has to work out, unaided, what it
is for and how to get their own numbers in. The hardest single step is entering accounts and
holdings, which is a blank form with no guidance.

Justin's words: *"a site tour project and maybe a quiz to help users navigate the site and
guide them through the site and how to use it and make it easier to input their data."*

**These are two separable products, and the second is worth more.**

### A. The setup quiz (build this first)

A short sequence that ends with the person's state actually populated, so they never face a
blank form. It maps directly onto the three dials the site already has:

| Step | Question | Writes |
|---|---|---|
| 1 | What brought you here? Set a target / check my drift / just looking | routing only |
| 2 | How much of a fall could you sit through? | `equityPct` |
| 3 | How much outside the US? | `intlPct` |
| 4 | Do you want a small-value tilt? | `tiltPct`, `preset` |
| 5 | Which accounts do you have? (checkboxes) | scaffolds `accounts[]` |

**Step 2 is the one that makes this driftcalc's quiz rather than a generic risk
questionnaire.** Do not ask "how do you feel about risk". The site owns the real monthly
record back to 1926, so quote actual drawdowns against each option: a 90/10 fell about 44%
peak to bottom, a 60/40 about 30%, all-stocks about 50%. Compute them from `returns.json` at
runtime rather than hardcoding, so they stay true when the data rebuilds. Justin's whole
editorial line is that the fall is the number that decides whether you stay invested, and
this is the one place a user is actually making that decision.

**Step 5 scaffolds, it does not interrogate.** Checkboxes for 401(k), Roth IRA, Traditional
IRA, HSA, Taxable. Each ticked box creates a named account with one empty holding, so the
accounts section is pre-structured and the person only types balances. Do not ask for
balances inside the quiz: the form is better at that, and the fewer places that touch
balances the better.

### B. The tour (build second, and keep it short)

Five or six steps anchored on the existing section ids, saying what each does. Worth less
than the quiz and only works once something is on screen, so do not run it over an empty
page. Six steps is the ceiling.

---

## 2. Decisions to put to Justin before you build

Do not guess these. Ask, in one round, then build.

1. **Does the quiz write to their portfolio, or only teach?** Writing is the whole value, but
   it means a quiz can overwrite real data. Recommended: offer it only when the portfolio is
   empty or still sample data, and otherwise require an explicit "start over".
2. **Automatic on first visit, or a button?** `FIRST_VISIT` already exists in `index.html`.
   Auto-running is more effective and more annoying.
3. **Overlay on `index.html`, or its own page at `/start.html`?** An overlay keeps them in
   context; a page is far easier to build, test and link to from the hub.
4. **Does the tour need to survive the collapse state?** Sections remember open/closed
   between visits, so a step pointing at a closed section has to open it first.

---

## 3. Non-negotiable constraints

These are not preferences. Breaking any of them breaks the product.

- **Static site on GitHub Pages. No backend, no build step, no npm.**
- **Locked CSP: `default-src 'self'`.** Scripts must be self-hosted. Google Fonts for CSS
  only. **This rules out every tour library** — Shepherd, Intro.js, driver.js, Joyride. You
  are hand-rolling it. This is the single most likely thing to go wrong: do not start by
  reaching for a package.
- **All user data in `localStorage`. Nothing is ever sent anywhere.** "Your data never leaves
  this browser" is the brand promise and the reason anyone trusts the site.
- **Balances never go in a URL.** Target allocation in a URL is fine and already shipped
  (`?eq=90&intl=38&tilt=22`); balances are not, and no quiz result may change that.
- **Free, no ads, nothing for sale.** Donations only.
- Must work on **mobile and Safari**. Justin tests on Apple devices and has been bitten by a
  Safari-only bug that went unnoticed for weeks.

---

## 4. The architecture you are joining

| File | What it is |
|---|---|
| `index.html` | ~115KB. The whole calculator: state, math, rendering, inline CSS. `let S` is the global state; `save()`, `load()`, `renderAll()` are globals. Risky to hand-edit. |
| `backtest.js` | **Loaded last by `index.html`.** Runs after everything, so `S`, `save()` and `renderAll()` are in scope and it can restructure the DOM freely. Almost every change to the home page lives here rather than in `index.html`. |
| `site.css` | The block the six tool pages share. Loaded before each page's own `<style>`, so a page override wins on source order. |
| `compare/`, `compare.html` | **Generated by `build-pages.mjs`. Never hand-edit.** |
| `backtest.html`, `backtest-page.js` | The backtest and leverage lab. Own styling, deliberately not on `site.css`. |
| `build-returns.mjs` | Builds `returns.json` monthly via GitHub Actions. |

**Put the tour and quiz in a new `tour.js`, loaded after `backtest.js`.** That is the
established pattern, keeps `index.html` untouched, and keeps the new work separable from the
existing DOM surgery.

**`backtest.js` already reorders and relocates DOM after load.** Anything you anchor must be
resolved after it has run, and element positions must not be cached across renders.

### What already exists that you should build on, not duplicate

- A **first-run block** in `backtest.js` (`firstRun`), shown when the portfolio is empty. Two
  versions: no accounts at all, or accounts with no balances. **This is the natural entry
  point for the quiz** — add the button there rather than inventing a new surface.
- Section ids on `index.html`: `#s1` Your accounts, `#s2` Target allocation, `#s3`, `#s5`,
  plus `#overview`, `#statStrip`, `#accounts`, `#growth`.
- Globals a quiz can drive: `addAccount`, `addHold`, `upHold`, `upAcct`, `setPreset`,
  `onSlider`, `onIntlSlider`, `onTiltSlider`, `loadSample`, `startFresh`, `save`, `renderAll`.
- `PRESETS = ['Market portfolio', 'Factor tilt', 'Custom']`.
- `sanitizeState()` in `index.html` repairs anything read from storage or imported. **Write
  state in the shape it expects** and your quiz output survives a reload.

---

## 5. Environment, and the traps that have actually bitten

**Ask for delete permission before your first git command, every session.** The Cowork shell
cannot delete files by default, so git creates `.git/index.lock`, fails to remove it, and
strands a lock that blocks git and GitHub Desktop both. It does this on a plain `git status`.
**Do not test for the permission with `rm -f` on a file that does not exist — that returns
success and proves nothing.** `touch` a file and delete it, or just ask.

**Images written back through the file bridge pick up a ~5.7KB `caBX` provenance chunk.**
Re-transferring re-injects it. Strip it on the device after the write and check the byte size
against what you generated.

**Render before you save.** Import used to `JSON.parse` → `save()` → `renderAll()`, so a bad
file went into localStorage before anything drew it and bricked the page on every later load.
Anything that writes state follows: validate, render, then save, and roll back if the render
throws.

**Anything periodic keys off the calendar month, never `(i - start) % n`.** Two pages both
said "rebalanced once a year" and meant different months; on the HFEA page the headline was
wrong by 1.4 points a year.

**`fees.html` is the straggler.** It has been the only page missing `:focus-visible` and the
only page with unlabelled form controls. When you add anything site-wide, check that file by
hand.

**The CRLF warning in older notes is obsolete.** `.gitattributes` carries `* text=auto
eol=lf` and there is no phantom diff.

**FRED is blocked from the sandbox.** `build-returns.mjs` only runs for real on GitHub
Actions. Do not try to run it locally and conclude it is broken.

---

## 6. How Justin works

His own words, so you can calibrate:

> "clean up the copywrite less words more punch"
> "no AI m dashes or weird language sound like me"
> "dumb things down give examples when needed"
> "take another look through this like you have no idea what you are looking at"
> "do a math check plug in real numbers double check everything and check security"
> "this isnt working figure something out"

- **He wants outcomes, not instructions.** Do the thing yourself rather than asking him to run
  commands.
- **Explain jargon on the page.** A control labelled "0.60%" must say what that means and
  whether it is normal. This matters doubly for a quiz, where every question is jargon unless
  you write it out.
- **He notices AI writing instantly.** `CLAUDE.md` has the rules. No em dashes. No "X is not
  Y, it's Z" comma pivots. No "actually", "genuinely", "the whole point". Say the thing once
  and stop.
- **He commits and pushes himself.** Commit in small pieces, one idea each, show him the log,
  and let him push. Do not push unless he says so.

---

## 7. Test harnesses worth rebuilding

There is no test suite. These were written ad hoc and each found real bugs. They take minutes
to rebuild with `jsdom` and are the reason the recent work held up.

1. **Page boots clean.** Load the page in jsdom with `runScripts: 'dangerously'`, stub `fetch`
   for `returns.json` / `fund-data.json`, collect `jsdomError` and `console.error`.
2. **Hostile URL fuzz.** Fifteen query strings — empty, negative, `1e400`, `NaN`, `Infinity`,
   markup, `__proto__`, `constructor`, repeated keys. Found a crash that killed a whole page.
3. **Corrupt state and bad imports.** Seed `localStorage['driftcalc-v1']` with junk; drive the
   real `importJSON` with a `File`. Found the brick.
4. **Dead controls.** Drive every range input to min and max and every segmented button, and
   diff the rendered text. A control that changes nothing is the site's recurring bug class.
5. **Structure.** Duplicate ids, unlabelled inputs, heading order, missing alt.

**Two harness traps.** `let S` at the top of a classic script is *not* a window property, so
seed `localStorage` instead of poking `w.S`. And strip `script`/`style` before scanning text,
or the words `NaN` and `Infinity` in the source produce phantom findings. Both cost real time.

---

## 8. Current state

- Everything is pushed. Working tree clean. HEAD is the 3 November automated rebuild.
- `returns.json` runs to October 2026 and carries `US, USSCV, INTL, BOND, LONGBOND, CASH, CPI`.
- The monthly Action rebuilds `returns.json` **and** the comparison pages, and fails the job
  rather than shipping data that misses its own checks.
- Outstanding before this project: one item, and it is not code — talk to a real user. Which
  is the honest frame for all of the below.

---

## 9. Prompts to start with

Paste these one at a time.

**Prompt 1 — orient, and do not write code yet**

> Read CLAUDE.md, HANDOFF-SITE.md and HANDOFF-TOUR.md in the repo root, then look at
> index.html, backtest.js and site.css. Do not write any code yet. Tell me back: where the
> first-run block lives and what it currently does, which globals a setup quiz could call to
> set a target allocation and create accounts, and what the CSP lets you load. Then give me
> the four decisions from section 2 of HANDOFF-TOUR.md as actual questions with your
> recommendation on each.

**Prompt 2 — the quiz, after the decisions are settled**

> Build the setup quiz in a new tour.js loaded after backtest.js. Hand-rolled, no libraries,
> CSP allows nothing external. Five steps, writing equityPct, intlPct, tiltPct, preset and
> scaffolded accounts into the existing state shape, then save and renderAll. For the risk
> step, compute the real peak-to-bottom drawdown of each option from returns.json at runtime
> and show it next to the choice. No balances in the quiz and none in any URL. Commit in
> small pieces and show me the log. Do not push.

**Prompt 3 — prove it before I look at it**

> Write a jsdom harness that runs the quiz end to end: every path through the five steps,
> then assert the resulting state loads, renders without errors, and round-trips through
> sanitizeState. Add the hostile-input and dead-control sweeps from section 7 of
> HANDOFF-TOUR.md. Tell me what it found.

**Prompt 4 — the tour**

> Add the tour: at most six steps on #s1, #s2, #s3, #s5 and #statStrip. It has to open a
> collapsed section before pointing at it, survive the DOM reordering backtest.js does, and
> work at 400px wide and in Safari. Offer it from the first-run block, never auto-run it over
> an empty page.

**Prompt 5 — the pass he will ask for anyway**

> Now read it like you have no idea what you are looking at. Every question in plain words,
> no jargon without an example, no em dashes, nothing that sounds written rather than said.
> Then do a math check: plug in real numbers and verify the drawdowns the quiz quotes against
> the backtest for the same mix and window.

---

## 10. One thing worth saying out loud

A tour and a quiz are both guesses about why people bounce, made at n=33 with no user
research. They are reasonable guesses and the data-entry friction is real and observable. But
the honest framing is that this is a hypothesis, not a diagnosis, and the cheapest way to
find out whether it is the right one is still to watch one person use the site. Build it,
and keep that in view.
