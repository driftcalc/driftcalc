# Drift Calculator

**Private portfolio math. No login, no account linking, your data never leaves your browser.**

Drift Calc answers one question index investors ask every month: *where should this contribution go?* Enter your accounts, set a target allocation, type in this month's number, and it shows the arithmetic — where you've drifted from target and how far the new money goes toward fixing it.

Think of it as the spreadsheet you'd have built if you were better at spreadsheets.

**Live site:** https://driftcalc.com

## What it does

- **Contribution allocator** — "I have $2,000 this month" becomes a per-account, per-fund breakdown that minimizes drift from your targets. Math shown, decisions yours.
- **Rebalance check** — live view of how far each asset class is from target in dollars, with the classic 5/25 band thresholds flagged, and honest warnings about selling in taxable accounts.
- **Target allocation via three dials** — stocks/bonds (with a 2008-style drawdown shown in your actual dollars), international share (with the current global market weight as a reference), and an optional small-cap value tilt grounded in the Fama-French factor literature.
- **Custom categories** — add your own sleeves (gold, REITs, TIPS, whatever you track), give them targets, and tag funds with them. Gold, commodity, REIT, crypto, and managed-futures funds are recognized automatically and get their own category.
- **Cost tools** — weighted expense ratio, fees per year in dollars, a 30-year cost ladder comparing rock-bottom index funds against your funds against a 1% fee, an advisor AUM calculator, and the cost of leaving cash on the sidelines.
- **Planning tools** — paycheck-to-portfolio savings rate math, goal projection with bear/moderate/bull cases (4/7/10%), and contribution-room tracking against current IRS limits.
- **~255 recognized funds** across Vanguard, Fidelity, Schwab, iShares, SPDR, Avantis, DFA and others, auto-classified by asset class. Multi-region funds (VT, VXUS, and friends) decompose correctly into US / developed international / emerging markets.

## Privacy architecture

There is no backend and there are no accounts. Everything you enter lives in your browser's localStorage and is never transmitted anywhere — there is no server to send it to. Export a JSON backup any time; clearing browser data erases everything (that's a feature and a warning — back up).

Outbound requests are limited to: the page itself, Google Fonts, a static `fund-data.json`, and a page counter via [GoatCounter](https://www.goatcounter.com) — open source, no cookies, no personal data, visit counts only. The counter script (`count.js`) is served from this repo rather than a third-party CDN, so no outside company sees your visit. A Content-Security-Policy in the page restricts outbound connections to that list, so you can verify this rather than take my word for it.

## Verify the math

The whole point of open-sourcing this is that you shouldn't have to trust us:

- **Targets**: three dials produce class targets. At 90/10 stocks/bonds, 38% international, 0% tilt: US = 90 × 0.62 = 55.8%, intl = 90 × 0.38 × 0.75 = 25.65%, EM = 90 × 0.38 × 0.25 = 8.55%, bonds = 10%.
- **Decomposition**: VT counts as 62% US / 28.5% intl / 9.5% EM; VXUS as 75% intl / 25% EM (approximate market weights, dated in the UI, updated via `fund-data.json`).
- **Allocation engine**: greedy dollar-by-dollar placement into whichever available fund most reduces distance to target, respecting which funds exist in which account. For an on-target portfolio it produces exactly proportional buys.
- **Projections**: FV = P(1+r)^n + 12C·((1+r)^n − 1)/r at flat 4/7/10% cases, labeled arithmetic-not-forecast.

Open an issue if you find an error — fund classification corrections are especially welcome.

## Updating fund data

`fund-data.json` holds decomposition weights, expense ratios, the global market weight reference, and IRS contribution limits. A quarterly checklist lives inside the file. Edit, commit, done — the site picks it up on next load.

## Not advice

Drift Calc is an educational calculator for portfolio arithmetic. It is not investment advice, tax advice, or a recommendation of any security. It doesn't know your situation. Numbers are estimates built entirely from what you enter. Talk to a qualified professional before making investment decisions.

## Support

Free, donation-supported, sells nothing. No ads, no affiliates, no data collection — ever. The core calculator stays free and the math will never sit behind a paywall. If it's useful: [ko-fi.com/driftcalc](https://ko-fi.com/driftcalc) (Ko-fi takes 0%).

## License

MIT
