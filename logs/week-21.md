# Week 21 Work Log (July 13 – July 19, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week closed out all three items left in the Week 20 planning notes, all small, targeted refinements to the stock-velocity system built over the previous three weeks rather than new surface area. The first made the low-stock alert's urgency window configurable via `?days=`, matching the flexibility `stock-forecast` already had instead of a hardcoded 30-day constant. The second added an optional `?compare=false` flag to `stock-forecast` so a caller that only wants the current velocity — not a trend comparison — can skip the extra history fetch entirely and use the endpoint's full 365-day range again, rather than being permanently capped at 180 days to support a comparison it doesn't need. The third fixed a genuine blind spot called out last week: a product with real sales this period but literally none in the prior period was showing no trend signal at all (silently indistinguishable from "no change"), when it's actually the most interesting case — a newly emerging fast-seller — so it now gets an explicit "New" badge instead of silence.

---

## Technical Activities

### Configurable Low-Stock Velocity Window (SRS Section 4.3: Inventory Management)

**Problem:** `GET /api/products/low-stock` used a hardcoded `LOW_STOCK_VELOCITY_DAYS = 30` constant for the EMA window feeding its urgency ranking, while `stock-forecast` had exposed its equivalent window as a `?days=` query parameter since Week 19. The Week 20 planning notes noted this asymmetry: "if a future feature needs the two to expose the same smoothing knob, `LOW_STOCK_VELOCITY_DAYS` would need to become a query parameter too."

**Backend — products route** (`backend/src/routes/products.js`):

- `GET /api/products/low-stock` now accepts `?days=` (default 30, capped at 180 — the same cap `stock-forecast` uses in its trend-comparison mode), replacing the removed `LOW_STOCK_VELOCITY_DAYS` constant
- The value is threaded straight through to the existing `fetchDailyUsage(days)` and `ema(entry.quantities, days)` calls, so this required no new logic — only removing the hardcoded constant and reading the parameter instead
- `?threshold=` (the pre-existing low-stock cutoff) and `?days=` (the new velocity window) are independent — a caller can narrow the ranking to "how urgent based on the last week" without changing which products qualify as low-stock in the first place

### Optional Trend Comparison for Stock Forecast (SRS Section 4.3: Inventory Management)

**Problem:** Week 20 hard-wired `stock-forecast` to always fetch `days * 2` worth of history so it could compute a trend against the immediately preceding window, which meant the `days` cap had to drop from 365 to 180 to keep that doubled fetch bounded at roughly a year. A caller that just wants the current rate over a long window — with no interest in the trend — was stuck with half the lookback range it used to have. The Week 20 planning notes proposed making the comparison optional rather than always-on.

**Backend — products route** (`backend/src/routes/products.js`):

- Added `?compare=` (default `true`); explicitly passing `compare=false` skips the previous-window fetch and EMA entirely — the route calls `fetchDailyUsage(days)` instead of `fetchDailyUsage(days * 2)`, and `prev_avg_daily_usage_kg` is always `null` in the response rather than a computed value
- When `compare=false`, the `days` cap returns to 365 (matching the pre-Week-20 range), since there's no doubled fetch to bound; when `compare` is true (the default, unchanged from Week 20), the cap stays at 180
- This is backward compatible with every existing caller: omitting `compare` reproduces Week 20's exact behavior

### "New" Badge for Emerging Fast-Sellers (SRS Section 4.4: Usability Requirements)

**Problem:** The Week 20 velocity trend badge divided by `prevAvg` to get a percent change, so a product with zero sales in the entire prior window couldn't produce a defined percentage — the frontend's guard clause (`prevAvg === 0` → render nothing) treated that identically to "no change," even though a product going from zero sales to real sales is the single most notable velocity event the badge could report. The Week 20 planning notes called this out directly: "genuinely new fast-sellers won't get a trend indicator until they have at least one full prior window of data."

**Frontend — Products page** (`frontend/src/pages/Products.jsx`):

- `VelocityTrend` now branches explicitly on `prevAvg === 0` before attempting the percent-change division: if `avg` is also `0`, there's genuinely no signal (no sales in either window) and it still renders nothing; if `avg > 0`, it renders a distinct `▲ New` badge (amber, matching the "faster is more urgent" color convention from Week 20) instead of silently reporting nothing
- The ordinary percent-change path (both windows non-zero) is unchanged from Week 20

---

## Frontend Architecture

### Updated Pages

- `src/pages/Products.jsx` — `VelocityTrend` now distinguishes "zero-to-nonzero" (renders `▲ New`) from "zero-to-zero" (renders nothing) instead of collapsing both into silence

---

## Backend Architecture

### Updated Routes

- `GET /api/products/low-stock` — `?days=` (default 30, capped at 180) now controls the EMA window for urgency ranking, replacing the hardcoded `LOW_STOCK_VELOCITY_DAYS` constant
- `GET /api/products/stock-forecast` — new `?compare=` flag (default `true`); `compare=false` skips the previous-window fetch, always returns `prev_avg_daily_usage_kg: null`, and restores the `days` cap to 365

---

## Project Planning

- `low-stock` and `stock-forecast` now both expose `?days=`, but only `stock-forecast` exposes `?smoothing=` independently — `low-stock` always smooths with a window equal to its `days` parameter, since it's a banner needing one urgency number rather than a tunable report; if that ever needs to change, the same independent-smoothing pattern from Week 20 could be copied over directly
- The `compare=false` mode was added as a capability on the endpoint but has no corresponding UI control yet, consistent with how `?threshold=` on `low-stock` has never had one either — it's available to any future caller (or a future admin-facing "long-range forecast" view) without requiring a matching frontend change now
- The "New" badge fires the first time any sale occurs after a fully quiet prior window, including for a product that only just started being stock-tracked; it doesn't distinguish "genuinely new to the catalogue" from "existing product that happened to have zero sales last period" — both currently get the same badge, which is arguably correct (both are "this is new information you didn't have before") but worth remembering if a future request wants them told apart

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Parameterizing a Previously Hardcoded Constant Without Touching Its Consumers — `LOW_STOCK_VELOCITY_DAYS` was a literal baked into two call sites (`fetchDailyUsage(LOW_STOCK_VELOCITY_DAYS)` and `ema(..., LOW_STOCK_VELOCITY_DAYS)`); replacing it with a `days` variable derived from `req.query.days` required no change to either call site's logic, only to where the value came from — a small demonstration of why passing values as parameters rather than compiling them in as constants keeps code open to configuration without rewrites
- A Boolean Flag Changing Both Control Flow and a Numeric Bound Together — `compare` doesn't just decide whether to run an extra computation; it also changes what `days` is allowed to be (180 vs. 365), because the two are coupled through the `days * 2` fetch size. Modeling this as a single flag that governs both, rather than two independently-set values that happen to need to stay consistent, avoids a class of bug where a caller sets `days=300` and `compare=true` and silently gets clamped in a way that doesn't match their mental model
- Distinguishing "Undefined" from "Zero" as Semantically Different Outcomes — `(avg - prevAvg) / prevAvg` is mathematically undefined when `prevAvg` is `0`, and the Week 20 code handled that the safe way (don't divide, render nothing). This week's fix recognizes that "can't compute a ratio" and "the ratio is uninteresting" are different situations: the first case (`prevAvg = 0`) needed its own explicit branch with its own message, rather than being folded into the same "no percentage available" bucket as an actual zero-change result
- Default Parameter Values for Backward Compatibility When Adding a New Flag — `compare` defaults to `true`, `days`'s cap depends on `compare`, and `smoothing` still defaults to `days` — layering a new option onto an existing endpoint such that every existing caller's request (with no new parameters present) produces byte-for-byte the same response shape as before is a standard technique for evolving an API without a version bump or breaking change

---

## Evidence

- `backend/src/routes/products.js` — `GET /api/products/low-stock` accepts `?days=`; `GET /api/products/stock-forecast` accepts `?compare=` with the associated `days`-cap and fetch-size changes
- `frontend/src/pages/Products.jsx` — `VelocityTrend` renders `▲ New` for a zero-to-nonzero transition, distinct from rendering nothing for zero-to-zero
- Tested against a local Postgres instance with two products seeded to exercise each scenario: a product with sales only in the last 5 days (nothing in the prior 25–55 day range) correctly returned `avg_daily_usage_kg: 0.1` / `prev_avg_daily_usage_kg: 0` from the default `stock-forecast` call, which the frontend logic confirmed renders as `▲ New` (not silence); calling `stock-forecast?compare=false&days=365` on the same data correctly returned `prev_avg_daily_usage_kg: null` for every product and a `days_remaining` computed from a full year of history; calling `low-stock?days=7` versus the default `low-stock` (implicitly `days=30`) on a product with sales spread across both recent and older days produced different `days_remaining` values (61 vs. 101, and 135 vs. 173 for a second product), confirming the window is genuinely driving the calculation rather than being ignored; `npm run lint` and `npm run build` both pass with zero errors on the frontend; all seeded test data was removed from the local database after verification
- **Testing limitation:** as in prior weeks, all three features were verified end-to-end at the API layer (curl against the running backend with seeded data) and by static review of the React components; this environment has no browser-automation tool available, so the UI was not visually exercised in an actual browser window

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
